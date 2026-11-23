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
    public synchronized Page fetch(String raw) {
        URI uri;
        try { uri=safety.validate(raw); } catch(Exception e) { return state("BLOCKED","UNSAFE_URL",raw); }
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
        for(int redirect=0;redirect<=3;redirect++) {
            try {
                var rule=policy.find(uri);
                if(rule.isEmpty()) return state("METADATA_ONLY","POLICY_NOT_APPROVED",uri.toString());
                if(!rule.get().fetchAllowed()) {
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
    // Separate transport from redirect/policy decisions so tests never contact public sites.
    protected Page exchange(URI uri,InetAddress[] pinned,long deadline) throws Exception {
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
                    HttpGet request=new HttpGet(uri);request.setHeader("User-Agent","ResearchBoard/0.1 (local research; approved pages only)");request.setHeader("Accept","text/html,application/xhtml+xml");request.setHeader("Accept-Encoding","identity");
                    var abort=timer.schedule(()->request.cancel(),Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS);
                    try {
                        return client.execute(request,r->{
                            int code=r.getCode();
                            if(code>=300 && code<400) return state("REDIRECT",r.getFirstHeader("Location")==null?"":r.getFirstHeader("Location").getValue(),"");
                            if(code==401 || code==403 || code==429) return state("BLOCKED","HTTP_"+code,"");
                            if(code!=200) return state("FAILED","HTTP_"+code,"");
                            String type=r.getEntity()==null?"":Objects.toString(r.getEntity().getContentType(),"");
                            if(!type.toLowerCase(Locale.ROOT).startsWith("text/html") && !type.toLowerCase(Locale.ROOT).startsWith("application/xhtml+xml")) return state("METADATA_ONLY","NOT_HTML","");
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
