package kr.ac.dongyang.researchboard.topic;
import java.util.List;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
@RestController
@RequestMapping("/api/topics")
public class TopicController {
    public record CreateTopic(String name, String query) {}
    private final TopicService service;
    public TopicController(TopicService service) { this.service=service; }
    @GetMapping public List<TopicRepository.Topic> list() { return service.list(); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public TopicRepository.Topic create(@RequestBody CreateTopic request) { return service.create(request.name(),request.query()); }
}
