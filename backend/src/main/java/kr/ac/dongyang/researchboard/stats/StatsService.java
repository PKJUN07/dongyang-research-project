package kr.ac.dongyang.researchboard.stats;
import org.springframework.stereotype.Service;
@Service
public class StatsService {
    private final StatsRepository repository;
    public StatsService(StatsRepository repository){this.repository=repository;}
    public StatsRepository.Overview summarize(Long topicId,String from,String to){return repository.overview(topicId,from,to);}
    public StatsRepository.HistoryPage history(Long topicId,String from,String to,int page){return repository.history(topicId,from,to,page);}
}
