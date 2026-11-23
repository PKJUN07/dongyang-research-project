package kr.ac.dongyang.researchboard.integration;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import tools.jackson.databind.ObjectMapper;
import kr.ac.dongyang.researchboard.ai.*;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.document.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import kr.ac.dongyang.researchboard.reading.UserRecords;
class BodySummaryTest {
 @TempDir Path dir;
 final ObjectMapper json=new ObjectMapper();
 @Test void sampledEvidenceCoversBeginningAndEndWithoutInventedText(){String text="";for(int i=0;i<80;i++)text+=("section "+i+" ").repeat(30)+"\n";var chunks=AiController.evidenceSegments(text);assertEquals(10,chunks.size());assertTrue(chunks.getFirst().startsWith("section 0"));assertTrue(chunks.getLast().contains("section 79"));for(String c:chunks)assertTrue(text.contains(c));assertTrue(chunks.stream().mapToInt(String::length).sum()<=1600);}
 @Test void unicodeEvidenceNeverCutsSurrogatePairs(){String text="😀한글".repeat(2000);for(String c:AiController.evidenceSegments(text)){assertFalse(Character.isHighSurrogate(c.charAt(c.length()-1)));assertFalse(Character.isLowSurrogate(c.charAt(0)));assertTrue(text.contains(c));}}
 @Test void adjacentKoreanSentencesKeepTheirBoundaries(){String text="도끼 모드는 게이지를 모읍니다.검 모드는 공격을 강화합니다.스킬 선택은 상황에 따라 달라집니다.";assertEquals(List.of("도끼 모드는 게이지를 모읍니다.","검 모드는 공격을 강화합니다.","스킬 선택은 상황에 따라 달라집니다."),AiController.evidenceSegments(text));}
 @Test void longSourceRequiresEnoughDistinctDetail(){var result=json.readTree("{\"summary\":\"one line\",\"claims\":[{\"text\":\"x\",\"evidenceId\":0}],\"limitations\":[],\"inferences\":[]}");assertEquals("INSUFFICIENT_DETAIL",assertThrows(IllegalArgumentException.class,()->AiController.normalize(result,"source ".repeat(300))).getMessage());}
 @Test void goodDetailedSummaryQuotesSelectedOriginalSegments(){String text="start ".repeat(80)+"middle ".repeat(80)+"end ".repeat(80);var result=json.readTree("{\"summary\":\""+"A detailed sentence. ".repeat(5)+"\",\"claims\":[{\"text\":\"first\",\"evidenceId\":0},{\"text\":\"middle\",\"evidenceId\":2},{\"text\":\"last\",\"evidenceId\":5}],\"limitations\":[],\"inferences\":[]}");var normalized=AiController.normalize(result,text);assertEquals(3,normalized.path("claims").size());for(var c:normalized.path("claims"))assertTrue(text.contains(c.path("quote").asText()));}
 @Test void onlyReviewedPageCanFetchAndAllUserRecordsArePreserved()throws Exception{
  var db=new Database(dir.resolve("body.db").toString());db.write(c->{var s=c.createStatement();s.execute("INSERT INTO topic VALUES(1,'fixture','fixture','2026-11-10')");s.execute("INSERT INTO search_run(id,topic_id,query,provider,locale,synthetic,request_key,status,started_at) VALUES(1,1,'fixture','FAKE','ko-KR',0,'fixture','SUCCEEDED','2026-11-10')");s.execute("INSERT INTO document(id,original_url,normalized_url,title,synthetic) VALUES(1,'https://example.com/approved','https://example.com/approved','original title',0),(2,'https://example.com/other','https://example.com/other','unreviewed',0)");s.execute("INSERT INTO search_hit(run_id,document_id,rank,snippet,retrieved_at) VALUES(1,1,1,'original snippet...','2026-11-10'),(1,2,2,'other snippet','2026-11-10')");return null;});
  var user=new UserRecords(db);user.save(1,Map.of("text","keep my note","version",0));user.patch(1,Map.of("saved",true,"readStatus","READ"));
  var rule=new SourcePolicy.Rule("example.com","/approved","USER","fixture owner","https://example.com/approved","2026-11-10",true,"fixture only");Path file=dir.resolve("policy.json");Files.writeString(file,json.writeValueAsString(new SourcePolicy.Rule[]{rule}));var policy=new SourcePolicy(file.toString());var safety=new UrlSafety();var calls=new AtomicInteger();
  var fetcher=new PageFetcher(safety,policy){@Override public synchronized Page fetch(String url){calls.incrementAndGet();return new Page("SUCCESS",null,("<article><p>"+"Permitted fixture paragraph. ".repeat(20)+"</p></article>").getBytes(StandardCharsets.UTF_8),"text/html; charset=UTF-8",url);}};
  try{var repo=new SearchRepository(db);var service=new DocumentService(fetcher,new ContentExtractor(),new SourceClassifier(policy),safety);var controller=new BodyController(repo,service,policy);assertEquals(false,controller.status(2).get("canFetch"));assertThrows(ApiException.class,()->controller.fetch(2));assertEquals(0,calls.get());assertEquals("SUCCESS",controller.fetch(1).get("status"));assertEquals(1,calls.get());assertEquals("EXISTS",controller.fetch(1).get("status"));assertEquals(1,calls.get());assertEquals("original title",repo.document(1).title());assertEquals("original snippet...",repo.document(1).snippet());assertEquals("keep my note",user.note(1).text());assertTrue(user.reading(1).saved());assertEquals("READ",user.reading(1).readStatus());}finally{fetcher.close();}
 }
}
