package kr.ac.dongyang.researchboard.search;
import kr.ac.dongyang.researchboard.common.ApiException;
import kr.ac.dongyang.researchboard.topic.TopicService;
import kr.ac.dongyang.researchboard.provider.SearchProvider;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.*;
@Service
public class SearchService {
    private final SearchRepository repository;
    private final TopicService topics;
    private final SearchProvider provider;
    private final SearchWorker worker;
    private final ThreadPoolExecutor executor=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(16));
    public SearchService(SearchRepository repository,TopicService topics,SearchProvider provider,SearchWorker worker) {
        this(repository,topics,provider,worker,true);
    }
    @org.springframework.beans.factory.annotation.Autowired
    public SearchService(SearchRepository repository,TopicService topics,SearchProvider provider,SearchWorker worker,@org.springframework.beans.factory.annotation.Value("${research.search-recovery-enabled:true}") boolean recovery) {
        this.repository=repository; this.topics=topics; this.provider=provider; this.worker=worker;
        if(recovery) repository.recoverInterrupted();
    }
    public SearchRepository.Run start(long topicId,String query,String requestKey) {
        topics.require(topicId);
        String key=requestKey==null?java.util.UUID.randomUUID().toString():TopicService.clean(requestKey,100);
        var created=repository.create(topicId,TopicService.clean(query,200),provider,key);
        if(created.fresh()) {
            try { executor.execute(() -> worker.execute(created.run().runId())); }
            catch(RejectedExecutionException e) {
                repository.fail(created.run().runId(),"QUEUE_FULL");
                throw new ApiException(503,"QUEUE_FULL","검색 대기열이 가득 찼습니다. 잠시 후 다시 시도하세요.");
            }
        }
        return created.run();
    }
    @PreDestroy public void close() {
        executor.shutdown();
        try { if(!executor.awaitTermination(5,TimeUnit.SECONDS)) executor.shutdownNow(); }
        catch(InterruptedException e) { executor.shutdownNow(); Thread.currentThread().interrupt(); }
    }
}
