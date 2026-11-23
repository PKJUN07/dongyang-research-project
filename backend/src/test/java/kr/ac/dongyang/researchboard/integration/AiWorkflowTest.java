package kr.ac.dongyang.researchboard.integration;
import java.nio.file.Path;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import tools.jackson.databind.ObjectMapper;
import kr.ac.dongyang.researchboard.ai.*;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.document.DocumentRepository;
import kr.ac.dongyang.researchboard.reading.UserRecords;

class AiWorkflowTest {
 @TempDir Path dir;Database db;AiController ai;HttpServer server;ExecutorService pool;final ObjectMapper json=new ObjectMapper();final AtomicReference<String> reply=new AtomicReference<>("{\"summary\":\"source summary\",\"claims\":[{\"text\":\"source statement\",\"evidenceId\":0}],\"limitations\":[],\"inferences\":[]}");volatile boolean hold=false;CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);String base;
 @BeforeEach void setup()throws Exception{
  db=new Database(dir.resolve("workflow.db").toString());db.write(c->{var s=c.createStatement();s.execute("INSERT INTO topic VALUES(1,'fixture','fixture','2026-11-10')");s.execute("INSERT INTO search_run(id,topic_id,query,provider,locale,synthetic,request_key,status,started_at) VALUES(1,1,'fixture','FAKE','ko-KR',1,'fixture','SUCCEEDED','2026-11-10')");for(int id=1;id<=6;id++){s.execute("INSERT INTO document(id,original_url,normalized_url,title,synthetic,content_text,extraction_status) VALUES("+id+",'https://example.com/"+id+"','https://example.com/"+id+"','fixture',1,'fixture source.','SUCCESS')");s.execute("INSERT INTO search_hit(run_id,document_id,rank,snippet,retrieved_at) VALUES(1,"+id+","+id+",'fixture snippet...','2026-11-10')");}return null;});
  server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);pool=Executors.newCachedThreadPool();server.setExecutor(pool);base="http://127.0.0.1:"+server.getAddress().getPort();
  server.createContext("/api/tags",e->{byte[] b="{\"models\":[{\"name\":\"fixture\"}]}".getBytes();e.sendResponseHeaders(200,b.length);e.getResponseBody().write(b);e.close();});
  server.createContext("/api/generate",e->{try{String request=new String(e.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);assertFalse(request.contains("PRIVATE_NOTE_SENTINEL"));if(hold){entered.countDown();release.await(5,TimeUnit.SECONDS);}byte[] b=json.writeValueAsBytes(Map.of("done",true,"response",reply.get()));e.sendResponseHeaders(200,b.length);e.getResponseBody().write(b);}catch(Exception ignored){}finally{e.close();}});server.start();ai=new AiController(db,new DocumentRepository(db),new OllamaGateway(base,"fixture",5));
 }
 @AfterEach void close(){release.countDown();ai.close();server.stop(0);pool.shutdownNow();}
 @SuppressWarnings("unchecked") List<Map<String,Object>> jobs(long id){return (List<Map<String,Object>>)ai.list(id).get("jobs");}
 void until(java.util.function.BooleanSupplier condition)throws Exception{for(int i=0;i<100;i++){if(condition.getAsBoolean())return;Thread.sleep(50);}fail("Timed out");}
 @Test void successfulAnalysisKeepsNotesAndReusesCachedResultOffline()throws Exception{
  var user=new UserRecords(db);user.save(1,Map.of("text","PRIVATE_NOTE_SENTINEL","version",0));user.patch(1,Map.of("saved",true));var created=ai.start(1);until(()->jobs(1).getFirst().get("status").equals("SUCCEEDED"));assertTrue(jobs(1).getFirst().get("result_json").toString().contains("fixture source."));server.stop(0);assertEquals(created.get("jobId"),ai.start(1).get("jobId"));assertEquals(true,ai.start(1).get("reused"));assertEquals("PRIVATE_NOTE_SENTINEL",user.note(1).text());assertTrue(user.reading(1).saved());
 }
 @Test void invalidEvidenceDoesNotOverwritePriorGoodResult()throws Exception{ai.start(1);until(()->jobs(1).getFirst().get("status").equals("SUCCEEDED"));db.write(c->{c.createStatement().execute("UPDATE document SET content_text='changed source.' WHERE id=1");return null;});reply.set("{\"summary\":\"bad\",\"claims\":[{\"text\":\"bad\",\"evidenceId\":0.5}],\"limitations\":[],\"inferences\":[]}");ai.start(1);until(()->jobs(1).getFirst().get("status").equals("FAILED"));assertEquals("INVALID_EVIDENCE",jobs(1).getFirst().get("error_code"));assertEquals("SUCCEEDED",jobs(1).get(1).get("status"));assertEquals(true,jobs(1).get(1).get("stale"));assertThrows(ApiException.class,()->ai.brief(List.of(1L)));}
 @Test void cancellationNeverStoresLateResult()throws Exception{hold=true;long id=((Number)ai.start(1).get("jobId")).longValue();assertTrue(entered.await(2,TimeUnit.SECONDS));ai.cancel(id);release.countDown();hold=false;ai.start(2);until(()->jobs(2).getFirst().get("status").equals("SUCCEEDED"));assertEquals("CANCELLED",jobs(1).getFirst().get("status"));assertNull(jobs(1).getFirst().get("result_json"));}
 @Test void queueLimitIsFiveAndDoesNotOverflow()throws Exception{hold=true;ai.start(1);assertTrue(entered.await(2,TimeUnit.SECONDS));for(long id=2;id<=5;id++)ai.start(id);assertEquals("AI_QUEUE_FULL",assertThrows(ApiException.class,()->ai.start(6)).code);release.countDown();hold=false;until(()->jobs(5).getFirst().get("status").equals("SUCCEEDED"));}
 @Test void unavailableModelHasSpecificFailureAndLeavesNote()throws Exception{new UserRecords(db).save(1,Map.of("text","keep note","version",0));server.stop(0);assertEquals("AI_NOT_RUNNING",assertThrows(ApiException.class,()->ai.start(1)).code);assertEquals("FAILED",jobs(1).getFirst().get("status"));assertEquals("keep note",new UserRecords(db).note(1).text());}
 @Test void restartMarksInterruptedOnlyAndPreservesSuccessfulAnalysis()throws Exception{ai.start(1);until(()->jobs(1).getFirst().get("status").equals("SUCCEEDED"));ai.close();db.write(c->{c.createStatement().execute("INSERT INTO ai_job(document_id,status,model,source_hash,input_type,input_text,created_at) VALUES(2,'RUNNING','fixture','hash','BODY','fixture','2026-11-10')");return null;});ai=new AiController(db,new DocumentRepository(db),new OllamaGateway(base,"fixture",5));assertEquals("INTERRUPTED",jobs(2).getFirst().get("error_code"));assertEquals("SUCCEEDED",jobs(1).getFirst().get("status"));}
}
