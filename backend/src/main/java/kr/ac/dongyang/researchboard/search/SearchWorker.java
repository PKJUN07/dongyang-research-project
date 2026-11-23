package kr.ac.dongyang.researchboard.search;
import kr.ac.dongyang.researchboard.provider.*;
import kr.ac.dongyang.researchboard.document.DocumentService;
import org.springframework.stereotype.Component;
@Component
public class SearchWorker {
    private final SearchRepository repository;
    private final SearchProvider provider;
    private final DocumentService documents;
    public SearchWorker(SearchRepository repository,SearchProvider provider,DocumentService documents) { this.repository=repository; this.provider=provider;this.documents=documents; }
    public void execute(long runId) {
        try {
            repository.running(runId);
            var run=repository.get(runId);
            var batch=provider.searchBatch(new SearchProvider.Query(run.query(),"ko","kr",1,10));
            repository.recordReceipt(runId,batch);
            repository.complete(run,batch.hits().stream().map(hit->documents.ingest(hit,run.synthetic())).toList());
        } catch(ProviderException e) { repository.fail(runId,e.code); }
        catch(Exception e) { repository.fail(runId,"PROCESSING_FAILED"); }
    }
}
