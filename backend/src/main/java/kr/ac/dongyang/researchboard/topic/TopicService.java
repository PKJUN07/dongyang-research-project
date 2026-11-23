package kr.ac.dongyang.researchboard.topic;
import java.util.List;
import org.springframework.stereotype.Service;
import kr.ac.dongyang.researchboard.common.ApiException;
@Service
public class TopicService {
    private final TopicRepository repository;
    public TopicService(TopicRepository repository) { this.repository=repository; }
    public List<TopicRepository.Topic> list() { return repository.list(); }
    public TopicRepository.Topic create(String name, String query) { return repository.create(clean(name,100),clean(query,200)); }
    public void require(long id) {
        if (!repository.exists(id)) throw new ApiException(404,"TOPIC_NOT_FOUND","주제를 찾을 수 없습니다.");
    }
    public static String clean(String input, int limit) {
        if(input==null || input.isBlank() || input.strip().length()>limit)
            throw new ApiException(400,"INVALID_INPUT","비어 있거나 너무 긴 입력입니다.");
        return input.strip();
    }
}
