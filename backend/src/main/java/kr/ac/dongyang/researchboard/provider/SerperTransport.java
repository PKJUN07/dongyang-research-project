package kr.ac.dongyang.researchboard.provider;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.*;
import org.springframework.stereotype.Component;
@Component
public class SerperTransport {
    public record Response(int status,String body,String retryAfter) {}
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    public Response post(String key,String body) {
        var request=HttpRequest.newBuilder(URI.create("https://google.serper.dev/search"))
            .timeout(Duration.ofSeconds(15)).header("X-API-KEY",key).header("Content-Type","application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        try {
            var pending=client.sendAsync(request,info -> new LimitedBody());
            HttpResponse<String> response;
            try { response=pending.get(15,TimeUnit.SECONDS); }
            catch(TimeoutException e) { pending.cancel(true); throw new ProviderException("PROVIDER_TIMEOUT"); }
            catch(InterruptedException e) { pending.cancel(true); throw e; }
            return new Response(response.statusCode(),response.body(),response.headers().firstValue("Retry-After").orElse(""));
        } catch(ProviderException e) { throw e; }
        catch(ExecutionException e) { throw new ProviderException(e.getCause() instanceof HttpTimeoutException?"PROVIDER_TIMEOUT":"PROVIDER_UNAVAILABLE"); }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new ProviderException("INTERRUPTED"); }
        catch(Exception e) { throw new ProviderException("PROVIDER_UNAVAILABLE"); }
    }
    @jakarta.annotation.PreDestroy public void close() { client.shutdownNow(); }
    // Bound bytes before JSON parsing; cancel the HTTP subscription on overflow.
    private static class LimitedBody implements HttpResponse.BodySubscriber<String> {
        final CompletableFuture<String> result=new CompletableFuture<>();
        final ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        Flow.Subscription subscription;
        public CompletionStage<String> getBody() { return result; }
        public void onSubscribe(Flow.Subscription s) { subscription=s; s.request(1); }
        public void onNext(List<ByteBuffer> buffers) {
            for(ByteBuffer buffer:buffers) {
                if(bytes.size()+buffer.remaining()>1_000_000) { subscription.cancel(); result.completeExceptionally(new IllegalStateException("Response too large")); return; }
                byte[] part=new byte[buffer.remaining()];buffer.get(part);bytes.writeBytes(part);
            } subscription.request(1);
        }
        public void onError(Throwable error) { result.completeExceptionally(error); }
        public void onComplete() { result.complete(bytes.toString(StandardCharsets.UTF_8)); }
    }
}
