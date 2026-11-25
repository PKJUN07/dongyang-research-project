package kr.ac.dongyang.researchboard.provider;
import java.net.URI;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import tools.jackson.databind.ObjectMapper;
@Component
@ConditionalOnProperty(name="research.provider",havingValue="serper")
public class SerperSearchProvider implements SearchProvider {
    private final String key;
    private final boolean approved;
    private final int maxAttempts;
    private final int pages;
    private final SerperTransport transport;
    private final ProviderBudget budget;
    private final ObjectMapper json=new ObjectMapper();
    public SerperSearchProvider(String key,boolean approved,int maxAttempts,SerperTransport transport,ProviderBudget budget) {
        this(key,approved,maxAttempts,1,transport,budget);
    }
    @org.springframework.beans.factory.annotation.Autowired
    public SerperSearchProvider(@Value("${research.serper-key:}") String key,
            @Value("${research.external-search-approved:false}") boolean approved,
            @Value("${research.max-provider-attempts:200}") int maxAttempts,
            @Value("${research.serper-pages:3}") int pages,
            SerperTransport transport,ProviderBudget budget) {
        this.key=key;this.approved=approved;this.maxAttempts=maxAttempts;this.pages=Math.max(1,Math.min(5,pages));this.transport=transport;this.budget=budget;
    }
    public String name() { return "SERPER"; }
    public boolean synthetic() { return false; }
    public List<Hit> search(Query query) {
        return searchBatch(query).hits();
    }
    /**
     * 결과 페이지를 최대 pages개까지 이어서 요청한다(페이지마다 10건, 1회 차감).
     * 첫 페이지 실패는 그대로 오류로 돌려주고, 이후 페이지가 상한·대기·오류로 막히면 이미 받은 결과만 사용한다.
     */
    @Override public Batch searchBatch(Query query) {
        if(!approved) throw new ProviderException("APPROVAL_REQUIRED");
        if(key.isBlank()) throw new ProviderException("PROVIDER_KEY_MISSING");
        if(query.page()!=1 || query.limit()<1 || query.limit()>10) throw new ProviderException("PROVIDER_REQUEST_LIMIT");
        List<Hit> hits=new ArrayList<>();Set<String> seen=new HashSet<>();int raw=0,excluded=0;
        for(int page=1;page<=pages;page++) {
            Batch batch;
            try { batch=page(query,page); }
            catch(ProviderException e) { if(page==1) throw e; break; }
            raw+=batch.rawCount();excluded+=batch.excludedCount();
            for(Hit hit:batch.hits()) {
                if(!seen.add(hit.url())) { excluded++;continue; }
                hits.add(new Hit(hit.title(),hit.url(),hit.snippet(),hit.rank()+(page-1)*query.limit()));
            }
            if(batch.rawCount()<query.limit()) break;
        }
        return new Batch(hits,raw,excluded);
    }
    private Batch page(Query query,int page) {
        // No automatic retries: every request reserves one call from the daily budget first.
        budget.reserve(maxAttempts);
        var response=transport.post(key,json.writeValueAsString(Map.of("q",query.query(),"hl",query.language(),"gl",query.region(),"page",page,"num",query.limit())));
        if(response.status()==401 || response.status()==403) throw new ProviderException("PROVIDER_AUTH");
        if(response.status()==429) {
            budget.blockUntil(retryAt(response.retryAfter())); throw new ProviderException("PROVIDER_RATE_LIMIT");
        }
        if(response.status()!=200) throw new ProviderException("PROVIDER_UNAVAILABLE");
        return parseBatch(response.body(),query.limit());
    }
    public List<Hit> parse(String body,int limit) {
        return parseBatch(body,limit).hits();
    }
    public Batch parseBatch(String body,int limit) {
        try {
            var root=json.readTree(body);var organic=root.get("organic");
            if(organic==null || !organic.isArray()) throw new ProviderException("PROVIDER_INVALID_RESPONSE");
            List<Hit> hits=new ArrayList<>();int position=0,excluded=0;
            for(var item:organic) {
                position++;
                String url=item.path("link").asText("").strip();
                if(!safeUrl(url) || hits.size()>=limit) { excluded++;continue; }
                String title=item.path("title").asText("").strip();
                if(title.isEmpty()) title=URI.create(url).getHost();
                hits.add(new Hit(clip(title,1000),url,clip(item.path("snippet").asText(""),5000),Math.max(1,item.path("position").asInt(position))));
            }
            return new Batch(hits,organic.size(),excluded);
        } catch(ProviderException e) { throw e; }
        catch(Exception e) { throw new ProviderException("PROVIDER_INVALID_RESPONSE"); }
    }
    private static String clip(String value,int length) { return value.substring(0,Math.min(value.length(),length)); }
    public static boolean safeUrl(String value) {
        try { URI uri=URI.create(value);return value.length()<=4096 && Set.of("http","https").contains(uri.getScheme()) && uri.getHost()!=null && uri.getUserInfo()==null; }
        catch(Exception e) { return false; }
    }
    public static Instant retryAt(String value) {
        Instant fallback=Instant.now().plusSeconds(60);
        try { return Instant.now().plusSeconds(Math.max(1,Long.parseLong(value))); }
        catch(Exception ignored) {
            try { Instant parsed=ZonedDateTime.parse(value,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant(); return parsed.isAfter(Instant.now())?parsed:fallback; }
            catch(Exception invalid) { return fallback; }
        }
    }
}
