package kr.ac.dongyang.researchboard.integration;
import java.nio.file.Path;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.Database;
import kr.ac.dongyang.researchboard.provider.*;
class ProviderTest {
    @TempDir Path dir;
    static class StubTransport extends SerperTransport {
        Response response=new Response(200,"{\"organic\":[]}",""); int calls;
        public Response post(String key,String body) { calls++;assertFalse(body.contains(key));return response; }
    }
    SearchProvider.Query query() { return new SearchProvider.Query("클로드","ko","kr",1,10); }
    @Test void approvalKeyAndPersistentBudgetPreventUnexpectedCalls() {
        var budget=new ProviderBudget(new Database(dir.resolve("budget.db").toString()));var http=new StubTransport();
        var unapproved=new SerperSearchProvider("test-key",false,2,http,budget);
        assertEquals("APPROVAL_REQUIRED",assertThrows(ProviderException.class,()->unapproved.search(query())).code);
        var noKey=new SerperSearchProvider("",true,2,http,budget);
        assertEquals("PROVIDER_KEY_MISSING",assertThrows(ProviderException.class,()->noKey.search(query())).code);
        assertEquals(0,http.calls);
        var provider=new SerperSearchProvider("test-key",true,2,http,budget);
        provider.search(query());provider.search(query());assertEquals(2,http.calls);
        var reopened=new SerperSearchProvider("test-key",true,2,http,new ProviderBudget(new Database(dir.resolve("budget.db").toString())));
        assertEquals("BUDGET_EXHAUSTED",assertThrows(ProviderException.class,()->reopened.search(query())).code);assertEquals(2,http.calls);
    }
    @Test void responseNormalizationRejectsUnsafeAndMissingUrls() {
        var provider=new SerperSearchProvider("key",true,2,new StubTransport(),new ProviderBudget(new Database(dir.resolve("parse.db").toString())));
        var hits=provider.parse("{\"organic\":[{\"title\":\"missing URL\"},{\"link\":\"javascript:alert(1)\"},{\"link\":\"https://example.com/a\",\"position\":2},{\"link\":\"https://example.com/a\"}]}",10);
        assertEquals(2,hits.size());assertEquals("example.com",hits.getFirst().title());assertEquals("",hits.getFirst().snippet());
        var batch=provider.parseBatch("{\"organic\":[{\"link\":\"https://example.com/a\"},{\"link\":\"javascript:bad\"},{\"link\":\"https://example.com/a\"}]}",10);
        assertEquals(3,batch.rawCount());assertEquals(1,batch.excludedCount());assertEquals(2,batch.hits().size());
        assertTrue(provider.parse("{\"organic\":[]}",10).isEmpty());
        assertThrows(ProviderException.class,()->provider.parse("not json",10));
        assertEquals(1,provider.parseBatch("{\"organic\":[{\"title\":\"no URL\"}]}",10).excludedCount());
    }
    @Test void authErrorsNeverRetryAndRateLimitPersistsCooldown() {
        var budget=new ProviderBudget(new Database(dir.resolve("status.db").toString()));var http=new StubTransport();
        var provider=new SerperSearchProvider("test-key",true,10,http,budget);
        http.response=new SerperTransport.Response(401,"sensitive upstream body","");
        assertEquals("PROVIDER_AUTH",assertThrows(ProviderException.class,()->provider.search(query())).code);assertEquals(1,http.calls);
        http.response=new SerperTransport.Response(429,"", "120");
        assertEquals("PROVIDER_RATE_LIMIT",assertThrows(ProviderException.class,()->provider.search(query())).code);
        assertEquals("PROVIDER_COOLDOWN",assertThrows(ProviderException.class,()->provider.search(query())).code);assertEquals(2,http.calls);
        budget.blockUntil(Instant.now().minusSeconds(1));http.response=new SerperTransport.Response(200,"{\"organic\":[]}","");
        provider.search(query());assertEquals(3,http.calls);
    }
}
