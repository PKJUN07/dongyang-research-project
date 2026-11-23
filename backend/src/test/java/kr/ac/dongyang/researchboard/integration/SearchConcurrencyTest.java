package kr.ac.dongyang.researchboard.integration;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.topic.*;
import kr.ac.dongyang.researchboard.search.*;
import kr.ac.dongyang.researchboard.provider.*;
import kr.ac.dongyang.researchboard.document.*;
class SearchConcurrencyTest {
    @TempDir Path dir;
    @Test void concurrentDuplicateAndQueueOverflowAreBounded() throws Exception {
        var db=new Database(dir.resolve("queue.db").toString());var repo=new SearchRepository(db);
        var topicRepo=new TopicRepository(db);long topic=topicRepo.create("queue","query").id();
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var count=new java.util.concurrent.atomic.AtomicInteger();
        SearchProvider provider=new SearchProvider() {
            public String name(){return "FAKE";} public boolean synthetic(){return true;}
            public List<Hit> search(Query q){count.incrementAndGet();entered.countDown();try{release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}return List.of();}
        };
        var safety=new UrlSafety();var policy=new SourcePolicy("");var fetcher=new PageFetcher(safety,policy);
        var docs=new DocumentService(fetcher,new ContentExtractor(),new SourceClassifier(policy),safety);
        var service=new SearchService(repo,new TopicService(topicRepo),provider,new SearchWorker(repo,provider,docs));
        try {
            var first=service.start(topic,"same","first");assertTrue(entered.await(2,TimeUnit.SECONDS));
            assertEquals(first.runId(),service.start(topic,"same","duplicate-click").runId());assertEquals(1,count.get());
            for(int i=0;i<16;i++) service.start(topic,"queued-"+i,"key-"+i);
            assertEquals("QUEUE_FULL",assertThrows(ApiException.class,()->service.start(topic,"overflow","overflow")).code);
        } finally { release.countDown();service.close();fetcher.close(); }
        assertEquals(17,count.get());
    }
}
