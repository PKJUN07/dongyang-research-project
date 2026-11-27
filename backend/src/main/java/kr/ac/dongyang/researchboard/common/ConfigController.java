package kr.ac.dongyang.researchboard.common;
import kr.ac.dongyang.researchboard.provider.SearchProvider;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import kr.ac.dongyang.researchboard.provider.ProviderBudget;
@RestController
public class ConfigController {
    public record Config(String provider,boolean synthetic,boolean aiEnabled,boolean externalSearchReady,String searchReason,int attempts,int maximum,int remaining,int pagesPerSearch,boolean scrapeAvailable,String budgetWindow) {}
    private final SearchProvider provider;
    private final boolean enabled;
    private final ProviderBudget budget;private final String key;private final boolean approved;private final int maximum;private final int pages;private final kr.ac.dongyang.researchboard.provider.SerperScraper scraper;
    public ConfigController(SearchProvider provider,boolean enabled,ProviderBudget budget,String key,boolean approved,int maximum) { this(provider,enabled,budget,key,approved,maximum,1,null); }
    @org.springframework.beans.factory.annotation.Autowired
    public ConfigController(SearchProvider provider,@Value("${research.ai-enabled:true}") boolean enabled,ProviderBudget budget,@Value("${research.serper-key:}") String key,@Value("${research.external-search-approved:false}") boolean approved,@Value("${research.max-provider-attempts:200}") int maximum,@Value("${research.serper-pages:5}") int pages,kr.ac.dongyang.researchboard.provider.SerperScraper scraper) { this.provider=provider;this.enabled=enabled;this.budget=budget;this.key=key;this.approved=approved;this.maximum=maximum;this.pages=Math.max(1,Math.min(5,pages));this.scraper=scraper; }
    @GetMapping("/api/config") public Config get() {var state=budget.status();String reason=provider.synthetic()?"TEST_MODE":!approved?"APPROVAL_REQUIRED":key.isBlank()?"PROVIDER_KEY_MISSING":state.attempts()>=maximum?"BUDGET_EXHAUSTED":state.blockedUntil()!=null&&java.time.Instant.parse(state.blockedUntil()).isAfter(java.time.Instant.now())?"PROVIDER_COOLDOWN":"READY";return new Config(provider.name(),provider.synthetic(),enabled,reason.equals("READY"),reason,state.attempts(),maximum,Math.max(0,maximum-state.attempts()),provider.synthetic()?0:pages,scraper!=null&&scraper.available()&&!provider.synthetic(),"DAILY_KST"); }
}
