package kr.ac.dongyang.researchboard.document;
import java.net.URI;
import java.time.Instant;
import org.springframework.stereotype.Component;
@Component
public class SourceClassifier {
    public record Classification(String type,String reason,String checkedAt) {}
    private final SourcePolicy policy;
    public SourceClassifier(SourcePolicy policy) { this.policy=policy; }
    public Classification classify(URI uri) {
        return policy.find(uri).map(r->new Classification(r.sourceType(),r.owner()+" · 검토 "+r.reviewedAt()+" · "+r.evidenceUrl(),Instant.now().toString()))
            .orElse(new Classification("OTHER","운영 주체와 페이지 성격을 확인하지 못했습니다.",Instant.now().toString()));
    }
}
