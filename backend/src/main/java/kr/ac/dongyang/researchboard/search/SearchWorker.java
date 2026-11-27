package kr.ac.dongyang.researchboard.search;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import kr.ac.dongyang.researchboard.provider.*;
import kr.ac.dongyang.researchboard.document.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
/**
 * 검색 한 번의 처리: 결과 수신 → 자료별 본문 확보 → 저장.
 * 본문 확보 순서: 승인 출처 직접 요청 → robots.txt가 허용하는 공개 페이지 직접 요청(무료) → 상위 결과부터 Serper 본문 추출.
 * 검색 발췌문도 없고 본문도 확보하지 못한 결과는 읽을 내용이 없으므로 저장하지 않는다.
 */
@Component
public class SearchWorker {
    private final SearchRepository repository;
    private final SearchProvider provider;
    private final DocumentService documents;
    private final SerperScraper scraper;
    private final SourcePolicy policy;
    private final int autoScrape;
    private final boolean publicFetch;
    public SearchWorker(SearchRepository repository,SearchProvider provider,DocumentService documents) { this(repository,provider,documents,null,null,0,false); }
    @Autowired
    public SearchWorker(SearchRepository repository,SearchProvider provider,DocumentService documents,SerperScraper scraper,SourcePolicy policy,
            @Value("${research.serper-scrape-per-search:50}") int autoScrape,@Value("${research.public-fetch-enabled:true}") boolean publicFetch) {
        this.repository=repository;this.provider=provider;this.documents=documents;this.scraper=scraper;this.policy=policy;this.autoScrape=Math.max(0,Math.min(50,autoScrape));this.publicFetch=publicFetch;
    }
    public void execute(long runId) {
        try {
            repository.running(runId);
            var run=repository.get(runId);
            var batch=provider.searchBatch(new SearchProvider.Query(run.query(),"ko","kr",1,10));
            List<DocumentService.Ingested> kept=new ArrayList<>();int dropped=0,scraped=0;
            for(var hit:batch.hits()) {
                var ingested=documents.ingest(hit,run.synthetic());
                if(!"SUCCESS".equals(ingested.content().status()) && !run.synthetic() && publicFetch) {
                    var open=documents.fetchPublicBody(hit.url());
                    if("SUCCESS".equals(open.status())) ingested=withBody(ingested,open.text(),"PUBLIC_FETCH");
                }
                if(!"SUCCESS".equals(ingested.content().status()) && !run.synthetic() && scraped<autoScrape && scrapeAllowed(hit.url())) {
                    scraped++;
                    var result=scraper.scrape(hit.url());
                    if("SUCCESS".equals(result.status())) ingested=withBody(ingested,result.text(),"SERPER_SCRAPE");
                    else if(isBudgetStop(result.reason())) scraped=autoScrape; // 상한·대기에 걸리면 이번 검색의 자동 추출을 멈춘다.
                }
                boolean noSnippet=hit.snippet()==null||hit.snippet().isBlank();
                boolean noBody=ingested.content().text()==null||ingested.content().text().isBlank();
                if(noSnippet&&noBody) { dropped++;continue; }
                kept.add(ingested);
            }
            repository.recordReceipt(runId,new SearchProvider.Batch(batch.hits(),batch.rawCount(),batch.excludedCount()+dropped));
            repository.complete(run,kept);
        } catch(ProviderException e) { repository.fail(runId,e.code); }
        catch(Exception e) { repository.fail(runId,"PROCESSING_FAILED"); }
    }
    private static boolean isBudgetStop(String reason) {
        return "BUDGET_EXHAUSTED".equals(reason)||"PROVIDER_COOLDOWN".equals(reason)||"PROVIDER_RATE_LIMIT".equals(reason)||"PROVIDER_AUTH".equals(reason);
    }
    /** robots.txt 차단으로 검토된 출처는 자동 추출하지 않는다. */
    private boolean scrapeAllowed(String url) {
        if(scraper==null||!scraper.available()||policy==null) return false;
        try { return policy.find(URI.create(url)).map(r->r.fetchAllowed()||!r.permissionNote().startsWith("ROBOTS_DISALLOWED:")).orElse(true); }
        catch(Exception e) { return false; }
    }
    private static DocumentService.Ingested withBody(DocumentService.Ingested base,String text,String reason) {
        var content=new ContentExtractor.Content("SUCCESS",reason,text,base.content().publishedAt(),base.content().canonicalUrl());
        return new DocumentService.Ingested(base.hit(),base.classification(),content,DocumentService.hash(text),java.time.Instant.now().toString());
    }
}
