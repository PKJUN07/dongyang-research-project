package kr.ac.dongyang.researchboard.document;
import java.net.URI;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
@Component
public class SourcePolicy {
    public record Rule(String host,String pathPrefix,String sourceType,String owner,String evidenceUrl,String reviewedAt,boolean fetchAllowed,String permissionNote) {}
    private final List<Rule> rules;
    public SourcePolicy(@Value("${research.source-policy:}") String file) {
        try {
            if(file.isBlank()) { rules=List.of(); return; }
            rules=List.of(new ObjectMapper().readValue(Files.readString(Path.of(file)),Rule[].class));
            for(Rule r:rules) {
                if(r.host()==null || r.host().isBlank() || r.host().contains("/") || r.pathPrefix()==null || !r.pathPrefix().startsWith("/")
                        || !Set.of("OFFICIAL","USER","OTHER").contains(r.sourceType()) || r.owner()==null || r.owner().isBlank()
                        || r.evidenceUrl()==null || !r.evidenceUrl().startsWith("https://") || r.permissionNote()==null || r.permissionNote().isBlank()) throw new IllegalArgumentException();
                LocalDate.parse(r.reviewedAt());
            }
        } catch(Exception e) { throw new IllegalStateException("Invalid source policy file",e); }
    }
    public Optional<Rule> find(URI uri) {
        String path=uri.getRawPath().isEmpty()?"/":uri.getRawPath();
        return rules.stream().filter(r->r.host().equalsIgnoreCase(uri.getHost())
            && (path.equals(r.pathPrefix()) || path.startsWith(r.pathPrefix().endsWith("/")?r.pathPrefix():r.pathPrefix()+"/")))
            .max(Comparator.comparingInt(r->r.pathPrefix().length()));
    }
}
