package kr.ac.dongyang.researchboard.document;

import java.nio.file.*;
import java.util.*;
import kr.ac.dongyang.researchboard.common.Database;
import kr.ac.dongyang.researchboard.provider.SearchProvider;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import tools.jackson.databind.ObjectMapper;

/** Explicit saved-document review entry point: never invokes a search Provider. */
public final class ReprocessDocuments {
    public record Review(long documentId,String url,String previousSource,String sourceType,String extractionStatus,String reason,int bodyLength,boolean applied) {}
    public static void main(String[] args) throws Exception {
        if(args.length!=4 || !Set.of("--dry-run","--apply").contains(args[3]))
            throw new IllegalArgumentException("Usage: ReprocessDocuments existing-db policy-json ids-comma-separated --dry-run|--apply");
        Path db=Path.of(args[0]).toAbsolutePath().normalize();
        if(!Files.isRegularFile(db) || !Files.isRegularFile(Path.of(args[1]))) throw new IllegalArgumentException("Existing DB and reviewed policy files are required");
        boolean apply=args[3].equals("--apply");
        var policy=new SourcePolicy(args[1]);var safety=new UrlSafety();var classifier=new SourceClassifier(policy);
        var repository=new SearchRepository(new Database(db.toString()));
        var fetcher=new PageFetcher(safety,policy);
        var service=new DocumentService(fetcher,new ContentExtractor(),classifier,safety);
        List<Review> results=new ArrayList<>();
        try {
            // Resolve every target before any network access or data mutation.
            List<SearchRepository.Card> targets=new ArrayList<>();
            for(String value:args[2].split(",")) {
                var card=repository.document(Long.parseLong(value));
                if(card.synthetic()) throw new IllegalArgumentException("This command reviews real saved documents only");
                if(card.contentText()!=null) throw new IllegalArgumentException("Existing body must be preserved: "+card.documentId());
                safety.validate(card.url());targets.add(card);
            }
            for(var card:targets) {
                var classification=classifier.classify(safety.validate(card.url()));
                if(!apply) {
                    var rule=policy.find(safety.validate(card.url()));
                    results.add(new Review(card.documentId(),card.url(),card.sourceType(),classification.type(),
                        rule.filter(SourcePolicy.Rule::fetchAllowed).isPresent()?"FETCH_ON_APPLY":"NO_BODY_REQUEST",
                        rule.map(SourcePolicy.Rule::permissionNote).orElse("POLICY_NOT_APPROVED"),0,false));
                } else {
                    var reviewed=service.ingest(new SearchProvider.Hit(card.title(),card.url(),card.snippet(),card.rank()),false);
                    repository.applyReview(card.documentId(),reviewed);
                    results.add(new Review(card.documentId(),card.url(),card.sourceType(),reviewed.classification().type(),
                        reviewed.content().status(),reviewed.content().reason(),reviewed.content().text()==null?0:reviewed.content().text().length(),true));
                }
            }
        } finally { fetcher.close(); }
        System.out.println(new ObjectMapper().writeValueAsString(results));
    }
}
