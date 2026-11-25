package kr.ac.dongyang.researchboard.document;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;
import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
@Component
public class PageFetcher {
    public record Page(String status,String reason,byte[] body,String contentType,String finalUrl) {}
    private final UrlSafety safety;
    private final SourcePolicy policy;
    private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
    private final ExecutorService dnsExecutor=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(1),r->{
        Thread thread=new Thread(r,"research-dns");thread.setDaemon(true);return thread;
    });
    private final Map<String,Long> lastRequest=new HashMap<>();
    public PageFetcher(UrlSafety safety,SourcePolicy policy) { this.safety=safety;this.policy=policy; }
    /** 수집 정책에서 본문 요청을 허용한 페이지만 가져온다. */
    public synchronized Page fetch(String raw) { return fetch(raw,false); }
    /**
     * 정책에 등록되지 않은 공개 페이지도 가져오되, 사이트의 robots.txt가 허용할 때만 요청한다.
     * 정책에서 robots 차단·수집 금지로 검토된 출처는 그대로 막는다.
     */
    public synchronized Page fetchPublic(String raw) { return fetch(raw,true); }
    private Page fetch(String raw,boolean publicPage) {
        URI uri;
        try { uri=safety.validate(raw); } catch(Exception e) { return state("BLOCKED","UNSAFE_URL",raw); }
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
        for(int redirect=0;redirect<=3;redirect++) {
            try {
                var rule=policy.find(uri);
                if(rule.isEmpty() && !publicPage) return state("METADATA_ONLY","POLICY_NOT_APPROVED",uri.toString());
                if(rule.isEmpty()) {
                    if(!robotsAllow(uri,deadline)) return state("METADATA_ONLY","ROBOTS_DISALLOWED",uri.toString());
                } else if(!rule.get().fetchAllowed()) {
                    String reason=rule.get().permissionNote();
                    return state(reason.startsWith("ROBOTS_DISALLOWED:")?"BLOCKED":"METADATA_ONLY",reason,uri.toString());
                }
                long wait=1000-(System.currentTimeMillis()-lastRequest.getOrDefault(uri.getHost(),0L));
                if(wait>0) Thread.sleep(wait);
                if(System.nanoTime()>=deadline) return state("FAILED","FETCH_TIMEOUT",uri.toString());
                lastRequest.put(uri.getHost(),System.currentTimeMillis());
                InetAddress[] pinned=resolveBeforeDeadline(uri,deadline);
                Page response=exchange(uri,pinned,deadline);
                if(response.status().equals("REDIRECT")) {
                    if(response.reason().isBlank()) return state("FAILED","INVALID_REDIRECT",uri.toString());
                    URI target=safety.validate(uri.resolve(response.reason()).toString());
                    if(uri.getScheme().equals("https") && target.getScheme().equals("http")) return state("BLOCKED","HTTPS_DOWNGRADE",uri.toString());
                    uri=target;continue;
                }
                return new Page(response.status(),response.reason(),response.body(),response.contentType(),uri.toString());
            } catch(UrlSafety.UnsafeUrl e) { return state("BLOCKED","UNSAFE_URL",uri.toString()); }
            catch(InterruptedException e) { Thread.currentThread().interrupt(); return state("FAILED","INTERRUPTED",uri.toString()); }
            catch(Exception e) { return state("FAILED","FETCH_FAILED",uri.toString()); }
        }
        return state("FAILED","TOO_MANY_REDIRECTS",uri.toString());
    }
    private InetAddress[] resolveBeforeDeadline(URI uri,long deadline) throws Exception {
        Future<InetAddress[]> pending=dnsExecutor.submit(()->safety.resolve(uri));
        try { return pending.get(Math.max(1,Math.min(TimeUnit.SECONDS.toNanos(4),deadline-System.nanoTime())),TimeUnit.NANOSECONDS); }
        catch(ExecutionException e) {
            if(e.getCause() instanceof UrlSafety.UnsafeUrl unsafe) throw unsafe;
            throw e;
        } finally {
            if(!pending.isDone()) pending.cancel(true);
        }
    }
    // robots.txt 해석 결과(호스트별, 이 서버 실행 동안 유지).
    private final Map<String,List<String[]>> robots=new HashMap<>();
    /** robots.txt의 User-agent: * 또는 ResearchBoard 규칙으로 경로 허용 여부를 판단한다. 404면 허용, 그 밖의 실패는 거부. */
    private boolean robotsAllow(URI uri,long deadline) throws Exception {
        String key=uri.getScheme()+"://"+uri.getRawAuthority();
        List<String[]> rules=robots.get(key);
        if(rules==null) {
            URI target=URI.create(key+"/robots.txt");
            long wait=1000-(System.currentTimeMillis()-lastRequest.getOrDefault(uri.getHost(),0L));
            if(wait>0) Thread.sleep(wait);
            lastRequest.put(uri.getHost(),System.currentTimeMillis());
            Page page=exchange(target,resolveBeforeDeadline(target,deadline),deadline,true);
            if(page.status().equals("REDIRECT") && !page.reason().isBlank()) {
                URI moved=safety.validate(target.resolve(page.reason()).toString());
                if(moved.getHost().equalsIgnoreCase(uri.getHost()) || moved.getHost().equalsIgnoreCase("www."+uri.getHost()) || uri.getHost().equalsIgnoreCase("www."+moved.getHost()))
                    page=exchange(moved,resolveBeforeDeadline(moved,deadline),deadline,true);
            }
            if(page.status().equals("SUCCESS")) rules=parseRobots(new String(page.body(),java.nio.charset.StandardCharsets.UTF_8));
            else if(page.reason()!=null && (page.reason().equals("HTTP_404") || page.reason().equals("HTTP_410"))) rules=List.of();
            else rules=List.<String[]>of(new String[]{"D","/"});
            robots.put(key,rules);
        }
        String path=uri.getRawPath().isEmpty()?"/":uri.getRawPath();
        if(uri.getRawQuery()!=null) path+="?"+uri.getRawQuery();
        String[] best=null;
        for(String[] r:rules) if(matches(r[1],path) && (best==null || r[1].length()>best[1].length() || (r[1].length()==best[1].length() && r[0].equals("A")))) best=r;
        return best==null || best[0].equals("A");
    }
    public static List<String[]> parseRobots(String text) {
        List<String[]> generic=new ArrayList<>(),own=new ArrayList<>();List<String[]> current=null;boolean lastWasAgent=false;boolean forUs=false,forAll=false;
        for(String line:text.split("\\r?\\n")) {
            String l=line.replaceAll("#.*","").strip();int colon=l.indexOf(':');if(colon<0) continue;
            String field=l.substring(0,colon).strip().toLowerCase(Locale.ROOT),value=l.substring(colon+1).strip();
            if(field.equals("user-agent")) {
                if(!lastWasAgent) { forUs=false;forAll=false; }
                String agent=value.toLowerCase(Locale.ROOT);
                if(agent.equals("*")) forAll=true;
                if(agent.contains("researchboard")) forUs=true;
                current=forUs?own:forAll?generic:null;lastWasAgent=true;continue;
            }
            lastWasAgent=false;
            if(current==null) continue;
            if(field.equals("disallow") && !value.isEmpty()) current.add(new String[]{"D",value});
            else if(field.equals("allow") && !value.isEmpty()) current.add(new String[]{"A",value});
        }
        return own.isEmpty()?generic:own;
    }
    private static boolean matches(String pattern,String path) {
        boolean anchored=pattern.endsWith("$");String p=anchored?pattern.substring(0,pattern.length()-1):pattern;
        String regex=java.util.Arrays.stream(p.split("\\*",-1)).map(java.util.regex.Pattern::quote).collect(java.util.stream.Collectors.joining(".*"));
        return java.util.regex.Pattern.compile(regex+(anchored?"$":"")).matcher(path).lookingAt();
    }
    // Separate transport from redirect/policy decisions so tests never contact public sites.
    protected Page exchange(URI uri,InetAddress[] pinned,long deadline) throws Exception { return exchange(uri,pinned,deadline,false); }
    private Page exchange(URI uri,InetAddress[] pinned,long deadline,boolean plainText) throws Exception {
                final String host=uri.getHost();
                DnsResolver resolver=new DnsResolver() {
                    public InetAddress[] resolve(String requested) throws UnknownHostException {
                        if(!requested.equalsIgnoreCase(host)) throw new UnknownHostException("Host mismatch");return pinned;
                    }
                    public String resolveCanonicalHostname(String requested) throws UnknownHostException {
                        if(!requested.equalsIgnoreCase(host)) throw new UnknownHostException("Host mismatch");return host;
                    }
                };
                var manager=PoolingHttpClientConnectionManagerBuilder.create().setDnsResolver(resolver)
                    .setDefaultConnectionConfig(ConnectionConfig.custom().setConnectTimeout(Timeout.ofSeconds(4)).setSocketTimeout(Timeout.ofSeconds(5)).build()).build();
                try(var client=HttpClients.custom().setConnectionManager(manager).disableRedirectHandling().disableAutomaticRetries().disableCookieManagement().disableContentCompression()
                        .setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(Timeout.ofSeconds(5)).build()).build()) {
                    HttpGet request=new HttpGet(uri);request.setHeader("User-Agent","Mozilla/5.0 (compatible; ResearchBoard/0.2; personal local research)");request.setHeader("Accept",plainText?"text/plain,*/*;q=0.5":"text/html,application/xhtml+xml");request.setHeader("Accept-Language","ko-KR,ko;q=0.9,en;q=0.6");request.setHeader("Accept-Encoding","identity");
                    var abort=timer.schedule(()->request.cancel(),Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS);
                    try {
                        return client.execute(request,r->{
                            int code=r.getCode();
                            if(code>=300 && code<400) return state("REDIRECT",r.getFirstHeader("Location")==null?"":r.getFirstHeader("Location").getValue(),"");
                            if(code==401 || code==403 || code==429) return state("BLOCKED","HTTP_"+code,"");
                            if(code!=200) return state("FAILED","HTTP_"+code,"");
                            String type=r.getEntity()==null?"":Objects.toString(r.getEntity().getContentType(),"");
                            if(plainText ? !type.toLowerCase(Locale.ROOT).startsWith("text/") : !type.toLowerCase(Locale.ROOT).startsWith("text/html") && !type.toLowerCase(Locale.ROOT).startsWith("application/xhtml+xml")) return state("METADATA_ONLY","NOT_HTML","");
                            if(r.getFirstHeader("Content-Encoding")!=null && !r.getFirstHeader("Content-Encoding").getValue().equalsIgnoreCase("identity")) return state("METADATA_ONLY","UNSUPPORTED_ENCODING","");
                            try(InputStream in=r.getEntity().getContent()) {
                                byte[] body=in.readNBytes(1_000_001);
                                return body.length>1_000_000?state("FAILED","BODY_TOO_LARGE",""):new Page("SUCCESS",null,body,type,"");
                            }
                        });
                    } finally { abort.cancel(false); }
                }
    }
    private static Page state(String status,String reason,String url) { return new Page(status,reason,new byte[0],"",url); }
    @PreDestroy public void close() { timer.shutdownNow(); dnsExecutor.shutdownNow(); }
}
