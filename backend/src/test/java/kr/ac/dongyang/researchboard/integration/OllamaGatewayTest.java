package kr.ac.dongyang.researchboard.integration;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import tools.jackson.databind.ObjectMapper;
import kr.ac.dongyang.researchboard.ai.OllamaGateway;

class OllamaGatewayTest {
 HttpServer server;ExecutorService pool;String base;final AtomicReference<String> tags=new AtomicReference<>("{\"models\":[{\"name\":\"fixture\"}]}");final AtomicReference<String> response=new AtomicReference<>();final AtomicReference<Integer> status=new AtomicReference<>(200);boolean delay=false;
 @BeforeEach void setup()throws Exception{server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);pool=Executors.newCachedThreadPool();server.setExecutor(pool);base="http://127.0.0.1:"+server.getAddress().getPort();response.set(new ObjectMapper().writeValueAsString(Map.of("done",true,"response","{\"summary\":\"ok\"}")));server.createContext("/api/tags",e->{byte[] b=tags.get().getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(200,b.length);e.getResponseBody().write(b);e.close();});server.createContext("/api/generate",e->{try{if(delay)Thread.sleep(1800);byte[] b=response.get().getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(status.get(),b.length);e.getResponseBody().write(b);}catch(Exception ignored){}finally{e.close();}});server.start();}
 @AfterEach void close(){server.stop(0);pool.shutdownNow();}
 OllamaGateway client(){return new OllamaGateway(base,"fixture",1);}
 @Test void healthyModelAndValidStructuredReply(){assertTrue(client().health().available());assertEquals("ok",client().generate(Map.of()).path("summary").asText());}
 @Test void missingModelHasSpecificHealthCode(){tags.set("{\"models\":[]}");assertEquals("MODEL_MISSING",client().health().code());}
 @Test void invalidTagsAreNotHealthy(){tags.set("{}");assertEquals("AI_INVALID_RESPONSE",client().health().code());}
 @Test void malformedTagsAreNotMislabelledAsDisconnected(){tags.set("not json");assertEquals("AI_INVALID_RESPONSE",client().health().code());}
 @Test void connectionRefusalHasSpecificCode(){server.stop(0);assertEquals("AI_NOT_RUNNING",client().health().code());assertEquals("AI_NOT_RUNNING",assertThrows(IllegalArgumentException.class,()->client().generate(Map.of())).getMessage());}
 @Test void malformedJsonNeverPublishes(){response.set("not json");assertEquals("AI_INVALID_JSON",assertThrows(IllegalArgumentException.class,()->client().generate(Map.of())).getMessage());}
 @Test void malformedModelJsonNeverPublishes(){response.set("{\"done\":true,\"response\":\"not json\"}");assertEquals("AI_INVALID_JSON",assertThrows(IllegalArgumentException.class,()->client().generate(Map.of())).getMessage());}
 @Test void truncatedGenerationIsExplicitFailure(){response.set("{\"done\":true,\"done_reason\":\"length\",\"response\":\"{}\"}");assertEquals("INCOMPLETE_OUTPUT",assertThrows(IllegalArgumentException.class,()->client().generate(Map.of())).getMessage());}
 @Test void memoryOrServiceFailureDoesNotLeakRawError(){status.set(500);response.set("private model error details");assertEquals("AI_SERVICE_ERROR",assertThrows(IllegalArgumentException.class,()->client().generate(Map.of())).getMessage());}
 @Test void missingModelHttp404(){status.set(404);assertEquals("MODEL_MISSING",assertThrows(IllegalArgumentException.class,()->client().generate(Map.of())).getMessage());}
 @Test void deadlineIncludesBodyWait(){delay=true;assertEquals("AI_TIMEOUT",assertThrows(IllegalArgumentException.class,()->client().generate(Map.of())).getMessage());}
 @Test void outputLimitAndLoopbackRestriction(){response.set("x".repeat(65537));assertEquals("OUTPUT_TOO_LARGE",assertThrows(IllegalArgumentException.class,()->client().generate(Map.of())).getMessage());assertThrows(IllegalArgumentException.class,()->new OllamaGateway("http://example.com","fixture",1));}
}
