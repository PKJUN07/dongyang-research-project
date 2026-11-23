package kr.ac.dongyang.researchboard.integration;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.document.*;
import tools.jackson.databind.ObjectMapper;
class ContentSafetyTest {
    @TempDir Path dir;
    final UrlSafety safety=new UrlSafety();
    @Test void deniesPrivateReservedAndObfuscatedUrls() throws Exception {
        for(String url: new String[]{"file:///etc/passwd","http://localhost/","http://local/","https://user:pass@example.com/","https://example.com:8080/","https://example.com./","https://example.com/approved/%2e%2e/private","https://example.com/a%2fb"})
            assertThrows(UrlSafety.UnsafeUrl.class,()->safety.validate(url),url);
        for(String ip:new String[]{"127.0.0.1","10.0.0.1","172.16.0.1","192.168.0.1","169.254.169.254","100.64.0.1","0.0.0.0","192.0.2.1","198.18.0.1","203.0.113.1","::1","::","fc00::1","fe80::1","::ffff:127.0.0.1","2001:db8::1","2002:7f00:1::1"})
            assertFalse(safety.isPublic(InetAddress.getByName(ip)),ip);
        assertTrue(safety.isPublic(InetAddress.getByName("8.8.8.8")));
        assertTrue(safety.isPublic(InetAddress.getByName("2606:4700:4700::1111")));
    }
    SourcePolicy policy(boolean allowed) throws Exception {
        Path file=dir.resolve("policy.json");
        var rule=new SourcePolicy.Rule("example.com","/approved","OFFICIAL","합성 운영 주체","https://example.com/about","2026-10-16",allowed,"합성 정책 시험 전용");
        Files.writeString(file,new ObjectMapper().writeValueAsString(new SourcePolicy.Rule[]{rule}));
        return new SourcePolicy(file.toString());
    }
    @Test void classifierRequiresExactHostAndPathEvidence() throws Exception {
        var classifier=new SourceClassifier(policy(false));
        assertEquals("OFFICIAL",classifier.classify(URI.create("https://example.com/approved/article")).type());
        assertEquals("OTHER",classifier.classify(URI.create("https://example.com.attacker.test/approved/article")).type());
        assertEquals("OTHER",classifier.classify(URI.create("https://example.com/approved-other")).type());
        assertEquals("OTHER",classifier.classify(URI.create("https://example.com/review")).type());
        assertTrue(classifier.classify(URI.create("https://example.com/approved")).reason().contains("합성 운영 주체"));
    }
    @Test void unapprovedPagesNeverResolveOrFetch() throws Exception {
        var denyDns=new UrlSafety() { @Override public InetAddress[] resolve(URI uri) { fail("Must not resolve unapproved page");return null; } };
        var fetcher=new PageFetcher(denyDns,policy(false));
        try { assertEquals("METADATA_ONLY",fetcher.fetch("https://example.com/approved").status()); }
        finally { fetcher.close(); }
    }
    @Test void reviewedRobotsDenialKeepsSpecificReasonWithoutNetwork() throws Exception {
        var rule=new SourcePolicy.Rule("example.com","/approved","OFFICIAL","운영 주체","https://example.com/about","2026-10-22",false,"ROBOTS_DISALLOWED: 일반 수집 금지");
        Path file=dir.resolve("robots-policy.json");Files.writeString(file,new ObjectMapper().writeValueAsString(new SourcePolicy.Rule[]{rule}));
        var noNetwork=new UrlSafety(){@Override public InetAddress[] resolve(URI uri){fail("Denied policy must never resolve DNS");return null;}};
        var fetcher=new PageFetcher(noNetwork,new SourcePolicy(file.toString()));
        try {var result=fetcher.fetch("https://example.com/approved");assertEquals("BLOCKED",result.status());assertTrue(result.reason().startsWith("ROBOTS_DISALLOWED:"));}
        finally {fetcher.close();}
    }
    @Test void privateDnsResultsAreBlockedBeforeSocketConnection() throws Exception {
        var privateDns=new UrlSafety() { @Override public InetAddress[] resolve(URI uri) { throw new UnsafeUrl(); } };
        var fetcher=new PageFetcher(privateDns,policy(true));
        try { assertEquals("BLOCKED",fetcher.fetch("https://example.com/approved").status()); }
        finally { fetcher.close(); }
    }
    @Test void extractsTextNotScriptsAndDoesNotInventDate() {
        String text="허용된 합성 본문입니다. 제목과 검색 요약을 구분하며 발행일이 없으면 미상으로 남깁니다. ".repeat(4);
        String html="<html><meta charset='UTF-8'><nav>navigation</nav><main><p>"+text+"</p><script>malicious()</script><div class='ads'>advertisement</div></main></html>";
        var content=new ContentExtractor().extract(html.getBytes(StandardCharsets.UTF_8),"text/html","https://example.com/");
        assertEquals("SUCCESS",content.status());assertNull(content.publishedAt());assertTrue(content.text().contains("합성 본문"));
        assertFalse(content.text().contains("malicious"));assertFalse(content.text().contains("navigation"));assertFalse(content.text().contains("advertisement"));
    }
    @Test void loginJsOnlyAndInvalidDateRemainExplicit() {
        var extractor=new ContentExtractor();
        assertEquals("BLOCKED",extractor.extract("<input type=password>".getBytes(),"text/html","https://example.com/").status());
        assertEquals("METADATA_ONLY",extractor.extract("<div id=root></div><script>load()</script>".getBytes(),"text/html","https://example.com/").status());
        var c=extractor.extract(("<time datetime='yesterday'></time><article>"+"합성 내용 ".repeat(40)+"</article>").getBytes(StandardCharsets.UTF_8),"text/html; charset=UTF-8","https://example.com/");
        assertNull(c.publishedAt());assertEquals("SUCCESS",c.status());
    }
    @Test void redirectsRecheckAddressPolicyAndDns() throws Exception {
        var resolutions=new java.util.concurrent.atomic.AtomicInteger();
        var publicDns=new UrlSafety() { @Override public InetAddress[] resolve(URI uri) throws UnknownHostException {
            resolutions.incrementAndGet();return new InetAddress[]{InetAddress.getByName("8.8.8.8")};
        }};
        for(String destination:new String[]{"http://127.0.0.1/secret","https://example.com.attacker.test/approved","http://example.com/approved","/approved/second"}) {
            var calls=new java.util.concurrent.atomic.AtomicInteger();
            var fetcher=new PageFetcher(publicDns,policy(true)) {
                @Override protected Page exchange(URI uri,InetAddress[] pinned,long deadline) {
                    assertEquals("8.8.8.8",pinned[0].getHostAddress());
                    if(calls.incrementAndGet()==1) return new Page("REDIRECT",destination,new byte[0],"","");
                    return new Page("SUCCESS",null,new byte[0],"text/html",uri.toString());
                }
            };
            try {
                var page=fetcher.fetch("https://example.com/approved/first");
                if(destination.equals("/approved/second")) { assertEquals("SUCCESS",page.status());assertEquals(2,calls.get());assertTrue(page.finalUrl().endsWith("/second")); }
                else { assertNotEquals("SUCCESS",page.status());assertEquals(1,calls.get()); }
            } finally { fetcher.close(); }
        }
        assertEquals(5,resolutions.get());
    }
    @Test void dnsLookupHasFiniteWaitWithoutOpeningSocket() throws Exception {
        var slowDns=new UrlSafety() { @Override public InetAddress[] resolve(URI uri) {
            try { Thread.sleep(30_000); } catch(InterruptedException e) { Thread.currentThread().interrupt(); }
            return new InetAddress[0];
        }};
        var fetcher=new PageFetcher(slowDns,policy(true)) {
            @Override protected Page exchange(URI uri,InetAddress[] pinned,long deadline) { fail("DNS timeout must not open a connection");return null; }
        };
        try {
            assertTimeoutPreemptively(java.time.Duration.ofSeconds(6),()->assertEquals("FAILED",fetcher.fetch("https://example.com/approved").status()));
        } finally { fetcher.close(); }
    }
}
