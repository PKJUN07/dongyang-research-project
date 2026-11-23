package kr.ac.dongyang.researchboard.integration;

import java.nio.file.*;
import java.net.URI;
import java.net.http.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import kr.ac.dongyang.researchboard.common.Database;
import kr.ac.dongyang.researchboard.topic.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class WorkflowTest {
    static final Path dbPath;
    static { try { dbPath=Files.createTempDirectory("research-workflow-").resolve("test.db"); }
        catch(Exception e) { throw new ExceptionInInitializerError(e); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("research.db-path",dbPath::toString); r.add("research.provider",()->"fake");
    }
    @LocalServerPort int port;
    final HttpClient client=HttpClient.newHttpClient();
    final ObjectMapper json=new ObjectMapper();
    HttpResponse<String> call(String path,String body) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api"+path));
        if(body!=null) b.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        return client.send(b.build(),HttpResponse.BodyHandlers.ofString());
    }
    long topic() throws Exception {
        var response=call("/topics","{\"name\":\"안전성\",\"query\":\"클로드\"}");
        assertEquals(201,response.statusCode()); return json.readTree(response.body()).get("id").asLong();
    }
    String input(long id,String query,String key) throws Exception {
        return json.writeValueAsString(java.util.Map.of("topicId",id,"query",query,"requestKey",key));
    }
    JsonNode completed(long runId) throws Exception {
        for(int i=0;i<100;i++) {
            JsonNode run=json.readTree(call("/search-sessions/"+runId,null).body());
            if(!java.util.Set.of("QUEUED","RUNNING").contains(run.get("status").asText())) return run;
            Thread.sleep(20);
        } fail("Search did not finish"); return null;
    }
    @Test void topicValidationAndRestartPersistence() throws Exception {
        assertEquals(400,call("/topics","{\"name\":\"  \",\"query\":\"q\"}").statusCode());
        assertEquals(400,call("/topics",json.writeValueAsString(java.util.Map.of("name","x".repeat(101),"query","q"))).statusCode());
        String special="한글 '); DROP TABLE topic; --";
        var created=call("/topics",json.writeValueAsString(java.util.Map.of("name",special,"query",special)));
        assertEquals(201,created.statusCode());
        long id=json.readTree(created.body()).get("id").asLong();
        // A newly constructed database opens the same file and reapplies version checks.
        var reopened=new TopicRepository(new Database(dbPath.toString()));
        assertTrue(reopened.list().stream().anyMatch(t->t.id()==id && t.name().equals(special)));
    }
    @Test void searchStoresResultsAndReplaysRequestWithoutDuplication() throws Exception {
        long id=topic(); String body=input(id,"클로드",UUID.randomUUID().toString());
        var accepted=call("/search-sessions",body); assertEquals(202,accepted.statusCode());
        long run=json.readTree(accepted.body()).get("runId").asLong();
        assertEquals("SUCCEEDED",completed(run).get("status").asText());
        assertEquals(run,json.readTree(call("/search-sessions",body).body()).get("runId").asLong());
        var result=json.readTree(call("/search-sessions/"+run+"/results",null).body());
        assertEquals(2,result.get("totalElements").asInt()); assertTrue(result.get("items").get(0).get("synthetic").asBoolean());
        long doc=result.get("items").get(0).get("documentId").asLong();
        assertEquals(200,call("/documents/"+doc,null).statusCode());
        var reopened=new SearchRepository(new Database(dbPath.toString()));
        assertEquals(2,reopened.results(run,0,20).items().size());
        assertEquals("SUCCEEDED",reopened.get(run).status());
        assertEquals(400,call("/search-sessions/"+run+"/results?size=0",null).statusCode());
    }
    @Test void emptyAndProviderFailureAreDifferent() throws Exception {
        long id=topic();
        for(String q:java.util.List.of("테스트:0건","테스트:실패","테스트:시간초과")) {
            var response=call("/search-sessions",input(id,q,UUID.randomUUID().toString()));
            long run=json.readTree(response.body()).get("runId").asLong();
            var finished=completed(run);
            assertEquals(q.equals("테스트:0건")?"SUCCEEDED":"FAILED",finished.get("status").asText());
            assertEquals(0,finished.get("processedCount").asInt());
            if(!q.equals("테스트:0건")) assertFalse(finished.get("errorCode").isNull());
        }
    }
    @Test void invalidIdsAndConflictingKeysAreRejected() throws Exception {
        assertEquals(404,call("/search-sessions",input(999999,"q","x")).statusCode());
        assertEquals(404,call("/documents/999999",null).statusCode());
        assertEquals(404,call("/search-sessions/999999",null).statusCode());
        long id=topic(); String key=UUID.randomUUID().toString();
        assertEquals(202,call("/search-sessions",input(id,"q",key)).statusCode());
        assertEquals(409,call("/search-sessions",input(id,"different",key)).statusCode());
        assertEquals(400,call("/search-sessions",input(id," ","new")).statusCode());
        assertEquals(202,call("/search-sessions",json.writeValueAsString(java.util.Map.of("topicId",id,"query","키 없는 정상 요청"))).statusCode());
    }
    @Test void partialExtractionPreservesBothLinksAndSeparatesText() throws Exception {
        long topic=topic();var accepted=call("/search-sessions",input(topic,"테스트:부분실패",UUID.randomUUID().toString()));
        long run=json.readTree(accepted.body()).get("runId").asLong();
        var finished=completed(run);assertEquals("PARTIAL",finished.get("status").asText());assertEquals(1,finished.get("failureCount").asInt());
        var result=json.readTree(call("/search-sessions/"+run+"/results",null).body());
        assertEquals(2,result.get("totalElements").asInt());
        var success=result.get("items").get(0);var blocked=result.get("items").get(1);
        assertEquals("SUCCESS",success.get("extractionStatus").asText());assertNotEquals(success.get("snippet").asText(),success.get("contentText").asText());
        assertEquals("BLOCKED",blocked.get("extractionStatus").asText());assertTrue(blocked.get("contentText").isNull());assertFalse(blocked.get("url").asText().isBlank());
    }
    @Test void filteredListsPagingAndDetailContext() throws Exception {
        long topic=topic();long run=json.readTree(call("/search-sessions",input(topic,"목록 검증",UUID.randomUUID().toString())).body()).get("runId").asLong();completed(run);
        var first=json.readTree(call("/search-sessions/"+run+"/results?size=1&sort=RANK",null).body());
        assertEquals(2,first.get("totalElements").asInt());assertEquals(2,first.get("totalPages").asInt());
        long firstId=first.get("items").get(0).get("documentId").asLong();
        var second=json.readTree(call("/search-sessions/"+run+"/results?size=1&page=1&sort=RANK",null).body());
        assertNotEquals(firstId,second.get("items").get(0).get("documentId").asLong());
        var official=json.readTree(call("/search-sessions/"+run+"/results?sourceType=OFFICIAL",null).body());assertEquals(1,official.get("totalElements").asInt());
        assertEquals(2,json.readTree(call("/documents?topicId="+topic,null).body()).get("totalElements").asInt());
        var detail=json.readTree(call("/documents/"+firstId+"?runId="+run,null).body());
        assertEquals(first.get("items").get(0).get("snippet").asText(),detail.get("snippet").asText());
        assertFalse(detail.get("domain").asText().isEmpty());assertFalse(detail.get("retrievedAt").isNull());
        assertEquals("UNREAD",detail.get("readingStatus").asText());
        assertEquals(0,json.readTree(call("/search-sessions/"+run+"/results?title=no-such-title",null).body()).get("totalElements").asInt());
        assertEquals(0,json.readTree(call("/search-sessions/"+run+"/results?page=99",null).body()).get("items").size());
    }
    @Test void listRejectsUnsafeFilterInputs() throws Exception {
        for(String query:java.util.List.of("sort=DROP_TABLE","sourceType=ADMIN","page=-1","size=101","dateBasis=BODY","from=2026-02-30","from=2026-10-22&to=2026-10-01","readingStatus=INVALID","page=abc","saved=yes")) {
            assertEquals(400,call("/documents?"+query,null).statusCode(),query);
        }
        assertEquals(404,call("/search-sessions/999999/results",null).statusCode());
    }
}
