package kr.ac.dongyang.researchboard.provider;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
/**
 * 검토된 수집 정책에 없는 공개 페이지의 본문을 Serper scrape로 받아 온다.
 * 사용자가 본문 확보를 요청했을 때만 호출하며, 호출마다 일일 Serper 상한에서 1회를 차감한다.
 */
@Component
public class SerperScraper {
    public record Result(String status,String reason,String text) {}
    private final String key;private final boolean approved;private final boolean enabled;private final int maxAttempts;
    private final SerperTransport transport;private final ProviderBudget budget;
    private final ObjectMapper json=new ObjectMapper();
    public SerperScraper(@Value("${research.serper-key:}") String key,
            @Value("${research.external-search-approved:false}") boolean approved,
            @Value("${research.serper-scrape-enabled:true}") boolean enabled,
            @Value("${research.max-provider-attempts:200}") int maxAttempts,
            SerperTransport transport,ProviderBudget budget) {
        this.key=key;this.approved=approved;this.enabled=enabled;this.maxAttempts=maxAttempts;this.transport=transport;this.budget=budget;
    }
    /** 키·승인·설정이 모두 갖춰져 있으면 true. 남은 호출 수는 요청 시점에 확인한다. */
    public boolean available() { return enabled && approved && !key.isBlank(); }
    public Result scrape(String url) {
        if(!available()) return new Result("METADATA_ONLY","SCRAPE_UNAVAILABLE",null);
        try { budget.reserve(maxAttempts); }
        catch(ProviderException e) { return new Result("FAILED",e.code,null); }
        SerperTransport.Response response;
        try { response=transport.scrape(key,json.writeValueAsString(Map.of("url",url))); }
        catch(ProviderException e) { return new Result("FAILED",e.code,null); }
        if(response.status()==429) { budget.blockUntil(SerperSearchProvider.retryAt(response.retryAfter())); return new Result("FAILED","PROVIDER_RATE_LIMIT",null); }
        if(response.status()==401 || response.status()==403) return new Result("FAILED","PROVIDER_AUTH",null);
        if(response.status()!=200) return new Result("FAILED","SCRAPE_FAILED",null);
        return parse(response.body());
    }
    public Result parse(String body) {
        try {
            var root=json.readTree(body);
            String text=root.path("text").asText("");
            if(text.isBlank()) text=root.path("markdown").asText("");
            text=text.replace('\u00a0',' ').replaceAll("[\\t\\x0B\\f ]+"," ").replaceAll("\\n[ \\n]+","\n").strip();
            if(text.length()<200) return new Result("METADATA_ONLY","NO_READABLE_BODY",null);
            if(text.length()>100_000) text=text.substring(0,100_000);
            return new Result("SUCCESS","SERPER_SCRAPE",text);
        } catch(Exception e) { return new Result("FAILED","SCRAPE_INVALID_RESPONSE",null); }
    }
}
