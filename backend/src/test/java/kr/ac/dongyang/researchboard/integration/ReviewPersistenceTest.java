package kr.ac.dongyang.researchboard.integration;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.topic.TopicRepository;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import kr.ac.dongyang.researchboard.provider.*;
import kr.ac.dongyang.researchboard.document.*;
class ReviewPersistenceTest {
    @TempDir Path dir;
    DocumentService.Ingested review(SearchProvider.Hit hit,String type,String status,String text) {
        return new DocumentService.Ingested(hit,new SourceClassifier.Classification(type,"검토 근거",Instant.now().toString()),
            new ContentExtractor.Content(status,"정책 확인",text,null,null),null,null);
    }
    @Test void reprocessKeepsSearchHistoryBudgetAndLinks() {
        var db=new Database(dir.resolve("review.db").toString());var repo=new SearchRepository(db);
        long topic=new TopicRepository(db).create("주제","query").id();
        var run=repo.create(topic,"query",new FakeSearchProvider(),"stable-key").run();repo.running(run.runId());
        var hit=new SearchProvider.Hit("원래 제목","https://example.com/article","원래 검색 요약",7);
        repo.complete(run,List.of(review(hit,"OTHER","METADATA_ONLY",null)));
        var budget=new ProviderBudget(db);budget.reserve(2);
        long id=repo.results(run.runId(),0,20).items().getFirst().documentId();
        repo.applyReview(id,review(hit,"OFFICIAL","BLOCKED",null));
        var after=repo.results(run.runId(),0,20).items().getFirst();
        assertEquals("원래 제목",after.title());assertEquals("원래 검색 요약",after.snippet());assertEquals(7,after.rank());
        assertEquals("https://example.com/article",after.url());assertEquals("OFFICIAL",after.sourceType());
        assertEquals("PARTIAL",repo.get(run.runId()).status());assertEquals(1,repo.get(run.runId()).failureCount());
        assertEquals(run.runId(),repo.create(topic,"query",new FakeSearchProvider(),"stable-key").run().runId());
        int attempts=db.read(c->{try(var s=c.createStatement();var r=s.executeQuery("SELECT attempts FROM provider_budget WHERE provider='SERPER'")){r.next();return r.getInt(1);}});
        assertEquals(1,attempts);
    }
    @Test void existingBodyCannotBeOverwritten() {
        var db=new Database(dir.resolve("preserve.db").toString());var repo=new SearchRepository(db);
        long topic=new TopicRepository(db).create("t","q").id();var run=repo.create(topic,"q",new FakeSearchProvider(),"key").run();repo.running(run.runId());
        var hit=new SearchProvider.Hit("title","https://example.com/a","snippet",1);
        repo.complete(run,List.of(review(hit,"OTHER","SUCCESS","기존 본문")));
        long id=repo.results(run.runId(),0,20).items().getFirst().documentId();
        assertEquals("CONTENT_EXISTS",assertThrows(ApiException.class,()->repo.applyReview(id,review(hit,"USER","METADATA_ONLY",null))).code);
        assertEquals("기존 본문",repo.document(id).contentText());
    }
}
