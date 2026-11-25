package kr.ac.dongyang.researchboard.ai;
import java.util.*;
import java.net.URI;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import kr.ac.dongyang.researchboard.common.ApiException;
import kr.ac.dongyang.researchboard.document.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import kr.ac.dongyang.researchboard.provider.SearchProvider;
import kr.ac.dongyang.researchboard.provider.SerperScraper;

/**
 * 자료 본문 확보. 검색 발췌문만으로는 AI가 원문 전체 맥락을 볼 수 없으므로, 다음 순서로 본문을 확보한다.
 * 1) 검토된 수집 정책(source policy)에 등록된 페이지는 직접 요청한다.
 * 2) 등록되지 않았거나 직접 요청이 실패하면 Serper scrape로 공개 본문을 받는다(robots 차단으로 검토된 곳은 제외).
 * 3) 자동 확보가 불가능하면 사용자가 원문에서 복사한 본문을 직접 붙여 넣을 수 있다.
 */
@RestController
@RequestMapping("/api/ai/documents")
public class BodyController {
 static final int MIN_MANUAL=200, MAX_BODY=100_000;
 private final SearchRepository documents;private final DocumentService service;private final SourcePolicy policy;private final SerperScraper scraper;
 public BodyController(SearchRepository documents,DocumentService service,SourcePolicy policy){this(documents,service,policy,null);}
 @Autowired public BodyController(SearchRepository documents,DocumentService service,SourcePolicy policy,SerperScraper scraper){this.documents=documents;this.service=service;this.policy=policy;this.scraper=scraper;}

 private Optional<SourcePolicy.Rule> rule(SearchRepository.Card d){try{return policy.find(URI.create(d.url()));}catch(Exception e){return Optional.empty();}}
 private boolean fetchAllowed(SearchRepository.Card d){return !d.synthetic()&&rule(d).map(SourcePolicy.Rule::fetchAllowed).orElse(false);}
 /** robots.txt 등으로 수집 금지가 확인된 출처는 Serper scrape도 쓰지 않는다. */
 private boolean scrapeAllowed(SearchRepository.Card d){return !d.synthetic()&&scraper!=null&&scraper.available()&&rule(d).map(r->r.fetchAllowed()||!r.permissionNote().startsWith("ROBOTS_DISALLOWED:")).orElse(true);}

 @GetMapping("/{id}/body-status") public Map<String,Object> status(@PathVariable long id){
  var d=documents.document(id);boolean exists=d.contentText()!=null&&!d.contentText().isBlank();
  boolean fetch=fetchAllowed(d),scrape=scrapeAllowed(d);
  return Map.of("available",exists,"characters",exists?d.contentText().length():0,"canFetch",(fetch||scrape)&&!exists,"canScrape",scrape&&!exists,"canPaste",!exists&&!d.synthetic(),
   "reason",exists?"BODY_AVAILABLE":fetch?"READY_TO_FETCH":scrape?"READY_TO_SCRAPE":"POLICY_NOT_APPROVED");
 }

 @PostMapping("/{id}/body") public synchronized Map<String,Object> fetch(@PathVariable long id){
  var d=documents.document(id);if(d.contentText()!=null&&!d.contentText().isBlank())return Map.of("status","EXISTS","characters",d.contentText().length());
  boolean fetch=fetchAllowed(d),scrape=scrapeAllowed(d);
  if(!fetch&&!scrape)throw new ApiException(409,"BODY_NOT_APPROVED","이 출처는 자동 본문 수집 대상이 아닙니다. 원문에서 본문을 복사해 직접 붙여 넣을 수 있습니다.");
  DocumentService.Ingested direct=null;
  if(fetch){
   direct=service.ingest(new SearchProvider.Hit(d.title(),d.url(),d.snippet(),d.rank()),false);
   if("SUCCESS".equals(direct.content().status())||!scrape){documents.applyReview(id,direct);return response(direct.content());}
  }
  var scraped=scraper.scrape(d.url());
  if("SUCCESS".equals(scraped.status())){var content=new ContentExtractor.Content("SUCCESS","SERPER_SCRAPE",scraped.text(),null,null);store(d,content);return response(content);}
  // 스크랩이 실패하면 직접 요청 결과(있다면)를 기록하고, 스크랩 실패 사유를 함께 돌려준다.
  if(direct!=null)documents.applyReview(id,direct);
  return Map.of("status",scraped.status(),"characters",0,"reason",Objects.toString(scraped.reason(),""));
 }

 public record ManualBody(String text){}
 @PostMapping("/{id}/body/manual") public synchronized Map<String,Object> manual(@PathVariable long id,@RequestBody ManualBody body){
  var d=documents.document(id);
  if(d.synthetic())throw new ApiException(409,"BODY_NOT_APPROVED","이 자료에는 본문을 붙여 넣을 수 없습니다.");
  if(d.contentText()!=null&&!d.contentText().isBlank())throw new ApiException(409,"CONTENT_EXISTS","이미 확보한 본문이 있습니다.");
  String text=body==null||body.text()==null?"":body.text().replace('\u00a0',' ').replaceAll("[\\t\\x0B\\f\\r ]+"," ").replaceAll("\\n[ \\n]+","\n").strip();
  if(text.length()<MIN_MANUAL)throw new ApiException(400,"BODY_TOO_SHORT","본문을 "+MIN_MANUAL+"자 이상 붙여 넣으세요. 짧은 글은 검색 발췌문 요약과 차이가 거의 없습니다.");
  if(text.length()>MAX_BODY)throw new ApiException(400,"BODY_TOO_LONG","본문은 최대 "+String.format("%,d",MAX_BODY)+"자까지 저장할 수 있습니다.");
  var content=new ContentExtractor.Content("SUCCESS","USER_PROVIDED",text,null,null);store(d,content);return response(content);
 }

 /** 자동 수집이 아닌 경로(스크랩·직접 입력)는 검색 시점의 출처 분류를 그대로 유지한다. */
 private void store(SearchRepository.Card d,ContentExtractor.Content content){
  String now=Instant.now().toString();
  var classification=new SourceClassifier.Classification(d.sourceType(),d.classificationReason(),d.classifiedAt()==null?now:d.classifiedAt());
  documents.applyReview(d.documentId(),new DocumentService.Ingested(new SearchProvider.Hit(d.title(),d.url(),d.snippet(),d.rank()),classification,content,DocumentService.hash(content.text()),now));
 }
 private static Map<String,Object> response(ContentExtractor.Content content){return Map.of("status",content.status(),"characters",content.text()==null?0:content.text().length(),"reason",Objects.toString(content.reason(),""));}
}
