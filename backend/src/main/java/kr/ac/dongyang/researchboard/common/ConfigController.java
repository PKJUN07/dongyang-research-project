package kr.ac.dongyang.researchboard.common;
import kr.ac.dongyang.researchboard.provider.SearchProvider;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import kr.ac.dongyang.researchboard.provider.ProviderBudget;
@RestController
public class ConfigController {
    public record Config(String provider,boolean synthetic,boolean aiEnabled,boolean externalSearchReady,String searchReason,int attempts,int maximum,int remaining) {}
    private final SearchProvider provider;
    private final boolean enabled;
    private final ProviderBudget budget;private final String key;private final boolean approved;private final int maximum;
    public ConfigController(SearchProvider provider,@Value("${research.ai-enabled:true}") boolean enabled,ProviderBudget budget,@Value("${research.serper-key:}") String key,@Value("${research.external-search-approved:false}") boolean approved,@Value("${research.max-provider-attempts:2}") int maximum) { this.provider=provider;this.enabled=enabled;this.budget=budget;this.key=key;this.approved=approved;this.maximum=maximum; }
    @GetMapping("/api/config") public Config get() {var state=budget.status();String reason=provider.synthetic()?"TEST_MODE":!approved?"APPROVAL_REQUIRED":key.isBlank()?"PROVIDER_KEY_MISSING":state.attempts()>=maximum?"BUDGET_EXHAUSTED":state.blockedUntil()!=null&&java.time.Instant.parse(state.blockedUntil()).isAfter(java.time.Instant.now())?"PROVIDER_COOLDOWN":"READY";return new Config(provider.name(),provider.synthetic(),enabled,reason.equals("READY"),reason,state.attempts(),maximum,Math.max(0,maximum-state.attempts())); }
}
