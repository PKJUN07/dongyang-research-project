package kr.ac.dongyang.researchboard.stats;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stats")
public class StatsController {
    private final StatsService service;
    public StatsController(StatsService service){this.service=service;}
    @GetMapping public StatsRepository.Overview getStats(@RequestParam(required=false) Long topicId,@RequestParam(required=false) String from,@RequestParam(required=false) String to){return service.summarize(topicId,from,to);}
    @GetMapping("/history") public StatsRepository.HistoryPage history(@RequestParam(required=false) Long topicId,@RequestParam(required=false) String from,@RequestParam(required=false) String to,@RequestParam(defaultValue="0") int page){return service.history(topicId,from,to,page);}
}
