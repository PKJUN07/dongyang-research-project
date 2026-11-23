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
    private final SerperTransport transport;
    private final ProviderBudget budget;
    private final ObjectMapper json=new ObjectMapper();
    public SerperSearchProvider(@Value("${research.serper-key:}") String key,
            @Value("${research.external-search-approved:false}") boolean approved,
            @Value("${research.max-provider-attempts:2}") int maxAttempts,
            SerperTransport transport,ProviderBudget budget) {
        this.key=key;this.approved=approved;this.maxAttempts=maxAttempts;this.transport=transport;this.budget=budget;
    }
    public String name() { return "SERPER"; }
    public boolean synthetic() { return false; }
    public List<Hit> search(Query query) {
        return searchBatch(query).hits();
    }
    @Override public Batch searchBatch(Query query) {
        if(!approved) throw new ProviderException("APPROVAL_REQUIRED");
        if(key.isBlank()) throw new ProviderException("PROVIDER_KEY_MISSING");
        if(query.page()!=1 || query.limit()<1 || query.limit()>10) throw new ProviderException("PROVIDER_REQUEST_LIMIT");
        // No automatic retries: the first approved smoke budget is two calls in total.
        budget.reserve(maxAttempts);
        var response=transport.post(key,json.writeValueAsString(Map.of("q",query.query(),"hl",query.language(),"gl",query.region(),"page",1,"num",query.limit())));
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
    static Instant retryAt(String value) {
        Instant fallback=Instant.now().plusSeconds(60);
        try { return Instant.now().plusSeconds(Math.max(1,Long.parseLong(value))); }
        catch(Exception ignored) {
            try { Instant parsed=ZonedDateTime.parse(value,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant(); return parsed.isAfter(Instant.now())?parsed:fallback; }
            catch(Exception invalid) { return fallback; }
        }
    }
}
