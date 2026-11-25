package kr.ac.dongyang.researchboard.provider;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
@Component
@ConditionalOnProperty(name="research.provider", havingValue="fake", matchIfMissing=true)
public class FakeSearchProvider implements SearchProvider {
    public String name() { return "FAKE"; }
    public boolean synthetic() { return true; }
    public List<Hit> search(Query input) {
        if(input.query().equals("테스트:0건")) return List.of();
        if(input.query().equals("테스트:실패")) throw new ProviderException("PROVIDER_UNAVAILABLE");
        if(input.query().equals("테스트:시간초과")) throw new ProviderException("PROVIDER_TIMEOUT");
        return List.of(
            new Hit("[합성] " + input.query() + " 공식 안내 후보", "https://example.com/official", "화면과 저장 동작 확인을 위한 합성 검색 요약입니다. 실제 공식 자료가 아닙니다.",1),
            new Hit("[합성] " + input.query() + " 사용자 경험 후보", input.query().equals("테스트:부분실패")?"https://example.com/blocked":"https://example.com/review", "실제 사용자 후기가 아닌 테스트 데이터입니다. 검색 요약은 본문과 별도로 보관합니다.",2)
        );
    }
}
