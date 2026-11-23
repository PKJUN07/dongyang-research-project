package kr.ac.dongyang.researchboard.search;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import kr.ac.dongyang.researchboard.common.ApiException;
import kr.ac.dongyang.researchboard.document.DocumentFilter;
import kr.ac.dongyang.researchboard.document.DocumentRepository;
@RestController
@RequestMapping("/api/search-sessions")
public class SearchController {
    public record Request(long topicId,String query,String requestKey) {}
    private final SearchService service;
    private final SearchRepository repository;
    private final DocumentRepository documents;
    public SearchController(SearchService service,SearchRepository repository,DocumentRepository documents) { this.service=service; this.repository=repository;this.documents=documents; }
    @PostMapping @ResponseStatus(HttpStatus.ACCEPTED)
    public SearchRepository.Run create(@RequestBody Request request) { return service.start(request.topicId(),request.query(),request.requestKey()); }
    @GetMapping("/{id}") public SearchRepository.Run get(@PathVariable long id) { return repository.get(id); }
    @GetMapping("/{id}/results") public SearchRepository.Page results(@PathVariable long id,@RequestParam java.util.Map<String,String> params) {
        return documents.findPage(DocumentFilter.parse(params),id);
    }
}
