package kr.ac.dongyang.researchboard.integration;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.provider.*;
import kr.ac.dongyang.researchboard.document.*;
class SearchReadinessTest {
 @TempDir Path dir;
 @Test void readinessNeverCallsProviderAndKeepsCumulativeAttempts(){
  var db=new Database(dir.resolve("budget.db").toString());var budget=new ProviderBudget(db);
  SearchProvider provider=new SearchProvider(){public String name(){return "SERPER";}public boolean synthetic(){return false;}public List<Hit> search(Query q){throw new AssertionError("No calls allowed");}};
  assertEquals("PROVIDER_KEY_MISSING",new ConfigController(provider,true,budget,"",true,7).get().searchReason());
  assertEquals("APPROVAL_REQUIRED",new ConfigController(provider,true,budget,"fixture-key",false,7).get().searchReason());
  budget.reserve(2);budget.reserve(2);
  assertEquals("BUDGET_EXHAUSTED",new ConfigController(provider,true,budget,"fixture-key",true,2).get().searchReason());
  var ready=new ConfigController(provider,true,budget,"fixture-key",true,7).get();assertTrue(ready.externalSearchReady());assertEquals(2,ready.attempts());assertEquals(5,ready.remaining());assertFalse(ready.toString().contains("fixture-key"));assertEquals(2,new ProviderBudget(new Database(dir.resolve("budget.db").toString())).status().attempts());
 }
 @Test void syntheticFilterRunsBeforePagination(){
  var db=new Database(dir.resolve("filter.db").toString());db.write(c->{var s=c.createStatement();s.execute("INSERT INTO topic VALUES(1,'fixture','fixture','2026-11-10')");s.execute("INSERT INTO search_run(id,topic_id,query,provider,locale,synthetic,request_key,status,started_at) VALUES(1,1,'fixture','FAKE','ko-KR',1,'fixture','SUCCEEDED','2026-11-10')");for(int i=1;i<=3;i++){s.execute("INSERT INTO document(id,original_url,normalized_url,title,synthetic) VALUES("+i+",'https://example.com/"+i+"','https://example.com/"+i+"','fixture',"+(i==1?0:1)+")");s.execute("INSERT INTO search_hit(run_id,document_id,rank,snippet,retrieved_at) VALUES(1,"+i+","+i+",'fixture','2026-11-10')");}return null;});
  var repo=new DocumentRepository(db);assertEquals(3,repo.findPage(DocumentFilter.parse(Map.of()),null).totalElements());assertEquals(1,repo.findPage(DocumentFilter.parse(Map.of("synthetic","false","size","1")),null).totalElements());assertEquals(2,repo.findPage(DocumentFilter.parse(Map.of("synthetic","true")),null).totalElements());assertThrows(ApiException.class,()->DocumentFilter.parse(Map.of("synthetic","invalid")));
 }
}
