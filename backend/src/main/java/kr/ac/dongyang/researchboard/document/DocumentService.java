package kr.ac.dongyang.researchboard.document;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.net.URI;
import org.springframework.stereotype.Service;
import kr.ac.dongyang.researchboard.provider.SearchProvider;
@Service
public class DocumentService {
    public record Ingested(SearchProvider.Hit hit,SourceClassifier.Classification classification,
        ContentExtractor.Content content,String contentHash,String fetchedAt) {}
    private final PageFetcher fetcher;
    private final ContentExtractor extractor;
    private final SourceClassifier classifier;
    private final UrlSafety safety;
    public DocumentService(PageFetcher fetcher,ContentExtractor extractor,SourceClassifier classifier,UrlSafety safety) {
        this.fetcher=fetcher;this.extractor=extractor;this.classifier=classifier;this.safety=safety;
    }
    public Ingested ingest(SearchProvider.Hit hit,boolean synthetic) {
        String now=Instant.now().toString();
        SourceClassifier.Classification classification=new SourceClassifier.Classification("OTHER","운영 주체 미확인",now);
        ContentExtractor.Content content;
        String fetchedAt=null;
        try {
            URI uri=safety.validate(hit.url());
            if(synthetic) {
                classification=new SourceClassifier.Classification(hit.url().endsWith("official")?"OFFICIAL":"USER","합성 fixture 분류이며 실제 출처 검증이 아닙니다.",now);
                if(hit.url().endsWith("blocked")) content=new ContentExtractor.Content("BLOCKED","SYNTHETIC_ACCESS_DENIED",null,null,null);
                else {
                    String html="<html><head><meta charset='UTF-8'><title>합성 자료</title></head><body><nav>제외할 메뉴</nav><article><h1>본문 추출 합성 시험</h1><p>이 문서는 본문 추출과 저장을 시험하기 위해 작성한 합성 자료입니다. 실제 웹사이트에서 가져온 내용이 아닙니다. 검색 요약과 본문은 서로 다른 필드에 저장하며 원문 링크와 출처 분류 근거를 함께 확인할 수 있습니다.</p><script>alert('never execute')</script></article></body></html>";
                    content=extractor.extract(html.getBytes(StandardCharsets.UTF_8),"text/html; charset=UTF-8",hit.url());
                    fetchedAt=now;
                }
            } else {
                classification=classifier.classify(uri);
                PageFetcher.Page page=fetcher.fetch(hit.url());
                if(page.status().equals("SUCCESS")) {
                    content=extractor.extract(page.body(),page.contentType(),page.finalUrl());
                    classification=classifier.classify(safety.validate(page.finalUrl()));fetchedAt=now;
                } else content=new ContentExtractor.Content(page.status(),page.reason(),null,null,null);
            }
        } catch(Exception e) { content=new ContentExtractor.Content("BLOCKED","UNSAFE_OR_INVALID_URL",null,null,null); }
        return new Ingested(hit,classification,content,hash(content.text()),fetchedAt);
    }
    /** 본문 SHA-256. 본문이 없으면 null. */
    public static String hash(String text) {
        if(text==null) return null;
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception e) { throw new IllegalStateException(e); }
    }
}
