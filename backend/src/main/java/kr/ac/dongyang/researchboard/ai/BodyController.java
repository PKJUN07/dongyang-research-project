package kr.ac.dongyang.researchboard.ai;
import java.util.*;
import java.net.URI;
import org.springframework.web.bind.annotation.*;
import kr.ac.dongyang.researchboard.common.ApiException;
import kr.ac.dongyang.researchboard.document.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import kr.ac.dongyang.researchboard.provider.SearchProvider;

@RestController
@RequestMapping("/api/ai/documents")
public class BodyController {
 private final SearchRepository documents;private final DocumentService service;private final SourcePolicy policy;
 public BodyController(SearchRepository documents,DocumentService service,SourcePolicy policy){this.documents=documents;this.service=service;this.policy=policy;}
 @GetMapping("/{id}/body-status") public Map<String,Object> status(@PathVariable long id){var d=documents.document(id);boolean exists=d.contentText()!=null&&!d.contentText().isBlank();boolean allowed=policy.find(URI.create(d.url())).map(SourcePolicy.Rule::fetchAllowed).orElse(false)&&!d.synthetic();return Map.of("available",exists,"characters",exists?d.contentText().length():0,"canFetch",allowed&&!exists,"reason",exists?"BODY_AVAILABLE":allowed?"READY_TO_FETCH":"POLICY_NOT_APPROVED");}
 @PostMapping("/{id}/body") public synchronized Map<String,Object> fetch(@PathVariable long id){
  var d=documents.document(id);if(d.contentText()!=null&&!d.contentText().isBlank())return Map.of("status","EXISTS","characters",d.contentText().length());
  if(d.synthetic()||!policy.find(URI.create(d.url())).map(SourcePolicy.Rule::fetchAllowed).orElse(false))throw new ApiException(409,"BODY_NOT_APPROVED","이 출처는 자동 본문 수집 대상에 등록되지 않았습니다. 원문 링크에서 확인하세요.");
  var result=service.ingest(new SearchProvider.Hit(d.title(),d.url(),d.snippet(),d.rank()),false);
  documents.applyReview(id,result);
  return Map.of("status",result.content().status(),"characters",result.content().text()==null?0:result.content().text().length(),"reason",Objects.toString(result.content().reason(),""));
 }
}
