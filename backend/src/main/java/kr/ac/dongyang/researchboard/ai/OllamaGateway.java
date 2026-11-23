package kr.ac.dongyang.researchboard.ai;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import tools.jackson.databind.*;

@Component
public class OllamaGateway {
 public record Health(boolean available,String code,String model){}
 private final URI base;private final String model;private final Duration timeout;
 private final ObjectMapper json=new ObjectMapper();
 private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
 public OllamaGateway(@Value("${research.ollama-url:http://127.0.0.1:11434}") String url,@Value("${research.ai-model:llama3.2:3b}") String model,@Value("${research.ai-timeout-seconds:180}") int seconds){
  base=URI.create(url.endsWith("/")?url:url+"/");if(!"http".equals(base.getScheme())||!Set.of("127.0.0.1","localhost","[::1]").contains(base.getHost())||base.getUserInfo()!=null||base.getQuery()!=null||base.getFragment()!=null||!base.getPath().equals("/"))throw new IllegalArgumentException("Ollama must use loopback HTTP");
  this.model=model;this.timeout=Duration.ofSeconds(Math.max(1,Math.min(300,seconds)));
 }
 public String model(){return model;}
 public Health health(){try{
  var r=http.send(HttpRequest.newBuilder(base.resolve("api/tags")).timeout(Duration.ofSeconds(2)).GET().build(),HttpResponse.BodyHandlers.ofString());
  if(r.statusCode()!=200)return new Health(false,"AI_SERVICE_ERROR",model);
  JsonNode models;try{models=json.readTree(r.body()).path("models");}catch(Exception e){return new Health(false,"AI_INVALID_RESPONSE",model);}if(!models.isArray())return new Health(false,"AI_INVALID_RESPONSE",model);
  for(var item:models){String name=item.path("name").asText();if(name.equals(model)||name.equals(model+":latest"))return new Health(true,"READY",model);}
  return new Health(false,"MODEL_MISSING",model);
 }catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();return new Health(false,e instanceof HttpTimeoutException?"AI_TIMEOUT":"AI_NOT_RUNNING",model);}}
 public JsonNode generate(Map<String,Object> request){try{
  var response=http.send(HttpRequest.newBuilder(base.resolve("api/generate")).timeout(timeout).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(request))).build(),HttpResponse.BodyHandlers.ofByteArray());
  if(response.statusCode()!=200)throw new IllegalArgumentException(response.statusCode()==404?"MODEL_MISSING":"AI_SERVICE_ERROR");
  if(response.body().length>65536)throw new IllegalArgumentException("OUTPUT_TOO_LARGE");
  JsonNode outer;try{outer=json.readTree(response.body());}catch(Exception e){throw new IllegalArgumentException("AI_INVALID_JSON");}
  if(!outer.path("done").asBoolean()||outer.path("done_reason").asText().equals("length"))throw new IllegalArgumentException("INCOMPLETE_OUTPUT");
  try{return json.readTree(outer.path("response").asText());}catch(Exception e){throw new IllegalArgumentException("AI_INVALID_JSON");}
 }catch(IllegalArgumentException e){throw e;}catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();throw new IllegalArgumentException(e instanceof HttpTimeoutException?"AI_TIMEOUT":e instanceof InterruptedException?"AI_INTERRUPTED":"AI_NOT_RUNNING");}}
}
