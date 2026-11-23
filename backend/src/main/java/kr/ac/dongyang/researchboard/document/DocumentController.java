package kr.ac.dongyang.researchboard.document;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/documents")
public class DocumentController {
    private final DocumentRepository repository;
    public DocumentController(DocumentRepository repository) { this.repository=repository; }
    @GetMapping public SearchRepository.Page list(@RequestParam java.util.Map<String,String> params) { return repository.findPage(DocumentFilter.parse(params),null); }
    @GetMapping("/{id}") public SearchRepository.Card get(@PathVariable long id,@RequestParam(required=false) Long runId) { return repository.findDetail(id,runId); }
}
