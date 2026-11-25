package kr.ac.dongyang.researchboard.integration;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import tools.jackson.databind.ObjectMapper;
import kr.ac.dongyang.researchboard.ai.*;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.document.*;
import kr.ac.dongyang.researchboard.provider.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;

/** 본문 확보 경로, Serper 다중 페이지·일일 상한, 합성 자료 폐기, 교차 정리 검증. */
class ImprovementTest {
 @TempDir Path dir;
 final ObjectMapper json=new ObjectMapper();
 static class PagedTransport extends SerperTransport {
  final List<String> bodies=new ArrayList<>();final Deque<Response> scrapes=new ArrayDeque<>();
  public Response post(String key,String body){bodies.add(body);int page=bodies.size();
   StringBuilder organic=new StringBuilder();int count=page<3?10:4;
   for(int i=1;i<=count;i++){if(organic.length()>0)organic.append(',');organic.append("{\"link\":\"https://example.com/p").append(page).append('-').append(i).append("\",\"title\":\"t\",\"snippet\":\"s\",\"position\":").append(i).append('}');}
   if(page==2)organic.append(",{\"link\":\"https://example.com/p1-1\",\"position\":11}");
   return new Response(200,"{\"organic\":["+organic+"]}","");}
  public Response scrape(String key,String body){return scrapes.isEmpty()?new Response(500,"",""):scrapes.pop();}
 }
 SearchProvider.Query query(){return new SearchProvider.Query("q","ko","kr",1,10);}

 @Test void searchFollowsSeveralPagesAndStopsOnShortPage(){
  var budget=new ProviderBudget(new Database(dir.resolve("pages.db").toString()));var http=new PagedTransport();
  var batch=new SerperSearchProvider("key",true,100,5,http,budget).searchBatch(query());
  assertEquals(3,http.bodies.size());assertTrue(http.bodies.get(1).contains("\"page\":2"));
  assertEquals(24,batch.hits().size());assertEquals(1,batch.excludedCount());
  assertEquals(11,batch.hits().get(10).rank());assertEquals(3,budget.status().attempts());
 }
 @Test void laterPagesStopQuietlyAtBudgetButFirstPageStillFails(){
  var db=new Database(dir.resolve("limit.db").toString());var http=new PagedTransport();
  var batch=new SerperSearchProvider("key",true,2,5,http,new ProviderBudget(db)).searchBatch(query());
  assertEquals(2,http.bodies.size());assertEquals(20,batch.hits().size());
  assertEquals("BUDGET_EXHAUSTED",assertThrows(ProviderException.class,()->new SerperSearchProvider("key",true,2,5,http,new ProviderBudget(db)).searchBatch(query())).code);
 }
 @Test void budgetRefillsOnNextKoreanDay(){
  var db=new Database(dir.resolve("daily.db").toString());
  var day1=new ProviderBudget(db,Clock.fixed(Instant.parse("2026-11-24T14:00:00Z"),ZoneOffset.UTC));
  day1.reserve(1);assertEquals("BUDGET_EXHAUSTED",assertThrows(ProviderException.class,()->day1.reserve(1)).code);
  // 15:00Z = 다음날 00:00 KST
  var day2=new ProviderBudget(db,Clock.fixed(Instant.parse("2026-11-24T15:00:00Z"),ZoneOffset.UTC));
  assertEquals(0,day2.status().attempts());day2.reserve(1);assertEquals(1,day2.status().attempts());
 }
 @Test void scrapeParsesTextAndRejectsShortOrMissingBodies(){
  var scraper=new SerperScraper("key",true,true,10,new PagedTransport(),new ProviderBudget(new Database(dir.resolve("scrape.db").toString())));
  assertEquals("SUCCESS",scraper.parse("{\"text\":\""+"본문 문장입니다. ".repeat(40)+"\"}").status());
  assertEquals("NO_READABLE_BODY",scraper.parse("{\"text\":\"짧음\"}").reason());
  assertEquals("SCRAPE_INVALID_RESPONSE",scraper.parse("not json").reason());
  assertFalse(new SerperScraper("",true,true,10,new PagedTransport(),null).available());
 }

 Database documents(String name)throws Exception{
  var db=new Database(dir.resolve(name).toString());db.write(c->{var s=c.createStatement();s.execute("INSERT INTO topic VALUES(1,'t','t','2026-11-10')");s.execute("INSERT INTO search_run(id,topic_id,query,provider,locale,synthetic,request_key,status,started_at) VALUES(1,1,'q','SERPER','ko-KR',0,'k','SUCCEEDED','2026-11-10')");
   s.execute("INSERT INTO document(id,original_url,normalized_url,title,synthetic,source_type,classification_reason) VALUES(1,'https://blog.example.org/a','https://blog.example.org/a','title',0,'USER','사람이 확인한 분류')");
   s.execute("INSERT INTO search_hit(run_id,document_id,rank,snippet,retrieved_at) VALUES(1,1,1,'snippet...','2026-11-10')");return null;});
  return db;
 }
 @Test void unreviewedPageFallsBackToSerperScrapeAndKeepsClassification()throws Exception{
  var db=documents("scrape-body.db");var policy=new SourcePolicy("");var safety=new UrlSafety();var http=new PagedTransport();
  http.scrapes.push(new SerperTransport.Response(200,json.writeValueAsString(Map.of("text","스크랩한 공개 본문 문장. ".repeat(30))),""));
  var scraper=new SerperScraper("key",true,true,10,http,new ProviderBudget(db));
  var controller=new BodyController(new SearchRepository(db),new DocumentService(new PageFetcher(safety,policy),new ContentExtractor(),new SourceClassifier(policy),safety),policy,scraper);
  assertEquals(true,controller.status(1).get("canScrape"));
  var result=controller.fetch(1);assertEquals("SUCCESS",result.get("status"));assertEquals("SERPER_SCRAPE",result.get("reason"));
  var doc=new SearchRepository(db).document(1);assertTrue(doc.contentText().startsWith("스크랩한"));assertEquals("USER",doc.sourceType());assertEquals("사람이 확인한 분류",doc.classificationReason());
 }
 @Test void manualBodyRequiresEnoughTextAndIsStoredOnce()throws Exception{
  var db=documents("manual.db");var policy=new SourcePolicy("");var safety=new UrlSafety();
  var controller=new BodyController(new SearchRepository(db),new DocumentService(new PageFetcher(safety,policy),new ContentExtractor(),new SourceClassifier(policy),safety),policy);
  assertEquals(false,controller.status(1).get("canFetch"));assertEquals(true,controller.status(1).get("canPaste"));
  assertEquals("BODY_TOO_SHORT",assertThrows(ApiException.class,()->controller.manual(1,new BodyController.ManualBody("짧은 글"))).code);
  assertEquals("USER_PROVIDED",controller.manual(1,new BodyController.ManualBody("사용자가 붙여 넣은 본문입니다. ".repeat(20))).get("reason"));
  assertEquals("CONTENT_EXISTS",assertThrows(ApiException.class,()->controller.manual(1,new BodyController.ManualBody("다시 ".repeat(200)))).code);
 }
 @Test void purgeMigrationRemovesOnlySyntheticRecords()throws Exception{
  var db=new Database(dir.resolve("purge.db").toString());
  String sql=new String(getClass().getResourceAsStream("/db/009_purge_synthetic.sql").readAllBytes(),StandardCharsets.UTF_8);
  db.write(c->{var s=c.createStatement();s.execute("INSERT INTO topic VALUES(1,'t','t','2026-11-10')");
   s.execute("INSERT INTO search_run(id,topic_id,query,provider,locale,synthetic,request_key,status,started_at) VALUES(1,1,'q','FAKE','ko-KR',1,'a','SUCCEEDED','x'),(2,1,'q','SERPER','ko-KR',0,'b','SUCCEEDED','x')");
   s.execute("INSERT INTO document(id,original_url,normalized_url,title,synthetic) VALUES(1,'https://example.com/official','https://example.com/official','[합성]',1),(2,'https://real.example.org/','https://real.example.org/','real',0)");
   s.execute("INSERT INTO search_hit(run_id,document_id,rank,snippet,retrieved_at) VALUES(1,1,1,'s','x'),(2,2,1,'s','x')");
   s.execute("INSERT INTO reading_state(document_id,updated_at) VALUES(1,'x'),(2,'x')");s.execute("INSERT INTO user_note VALUES(1,'n',1,'x')");s.execute("INSERT INTO document_topic(document_id,topic_id) VALUES(1,1),(2,1)");
   s.execute("INSERT INTO ai_job(document_id,status,model,source_hash,input_type,input_text,created_at) VALUES(1,'SUCCEEDED','m','h','BODY','t','x')");
   s.execute("INSERT INTO topic_brief(snapshot_json,created_at) VALUES('[{\"documentId\":1}]','x'),('[{\"documentId\":2}]','x')");
   for(String part:sql.split(";"))if(!part.isBlank())s.execute(part);return null;});
  db.read(c->{var s=c.createStatement();
   for(var check:Map.of("SELECT count(*) FROM document","1","SELECT count(*) FROM search_run","1","SELECT count(*) FROM reading_state","1","SELECT count(*) FROM user_note","0","SELECT count(*) FROM ai_job","0","SELECT count(*) FROM topic_brief","1","SELECT id FROM document","2").entrySet())
    try(var r=s.executeQuery(check.getKey())){r.next();assertEquals(check.getValue(),r.getString(1),check.getKey());}
   return null;});
 }
 @Test void scopeBoilerplateLimitationsAreDropped(){
  var list=json.readTree("[\"검색 발췌문만 사용하여 원문 전체의 맥락을 파악하지 못했다\",\"2024년 기준 가격이라 현재와 다를 수 있다\",\"원문 전체를 확인하지 못함\"]");
  var kept=AiController.withoutScopeBoilerplate(list);assertEquals(1,kept.size());assertTrue(kept.get(0).asText().startsWith("2024년"));
 }
 @Test void synthesisKeepsOnlyTraceableItems(){
  var snapshot=json.readTree("[{\"title\":\"A\",\"sourceType\":\"OFFICIAL\",\"analysis\":{\"input_type\":\"BODY\",\"result_json\":\"{\\\"summary\\\":\\\"a\\\",\\\"claims\\\":[{\\\"text\\\":\\\"a1\\\",\\\"quote\\\":\\\"qa1\\\"},{\\\"text\\\":\\\"a2\\\",\\\"quote\\\":\\\"qa2\\\"}]}\"}},"
   +"{\"title\":\"B\",\"sourceType\":\"USER\",\"analysis\":{\"input_type\":\"SNIPPET\",\"result_json\":\"{\\\"summary\\\":\\\"b\\\",\\\"claims\\\":[{\\\"text\\\":\\\"b1\\\",\\\"quote\\\":\\\"qb1\\\"}]}\"}}]");
  var claims=BriefSynthesis.claims(snapshot,json);assertEquals(3,claims.size());assertEquals(1,claims.get(2).source());
  String prompt=BriefSynthesis.prompt(snapshot,claims,"가격은?",json);assertTrue(prompt.contains("(c2) b1"));assertTrue(prompt.contains("검색 발췌 기반"));assertTrue(prompt.contains("가격은?"));
  var raw=json.readTree("{\"overview\":\"두 자료 비교\",\"common\":[{\"text\":\"둘 다 말함\",\"claimIds\":[0,2]},{\"text\":\"한 자료뿐\",\"claimIds\":[0,1]}],\"differences\":[{\"topic\":\"차이\",\"text\":\"A만\",\"claimIds\":[1]},{\"topic\":\"근거 없음\",\"text\":\"x\",\"claimIds\":[9]}],\"checks\":[],\"answer\":\"답\",\"answerClaimIds\":[2]}");
  var out=BriefSynthesis.normalize(raw,claims,true);
  assertEquals(1,out.path("common").size());assertEquals(1,out.path("differences").size());
  assertEquals(1,out.path("common").get(0).path("refs").get(1).path("source").asInt());assertEquals("답",out.path("answer").path("text").asText());
  assertEquals("NO_VALID_EVIDENCE",assertThrows(IllegalArgumentException.class,()->BriefSynthesis.normalize(json.readTree("{\"overview\":\"x\",\"common\":[],\"differences\":[{\"topic\":\"t\",\"text\":\"x\",\"claimIds\":[]}],\"checks\":[]}"),claims,false)).getMessage());
 }
 @Test void robotsRulesUseOwnGroupThenGenericAndLongestMatch(){
  var rules=PageFetcher.parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /board/\nAllow: /board/view\n");
  assertEquals(2,rules.size());
  assertTrue(rules.stream().anyMatch(r->r[0].equals("D")&&r[1].equals("/board/")));
  var own=PageFetcher.parseRobots("User-agent: *\nDisallow: /\nUser-agent: ResearchBoard\nAllow: /\n");
  assertEquals("A",own.get(0)[0]);
 }
 @Test void boardPagesWithoutArticleTagStillYieldTheirBody(){
  String links="<div class='menu'>"+"<a href='/x'>메뉴 링크</a>".repeat(40)+"</div>";
  String post="<div id='powerbbsContent'>"+"활 운용은 속성 강화가 핵심입니다. 회피 장전 타이밍을 익히세요.<br>".repeat(15)+"</div>";
  var content=new ContentExtractor().extract(("<html><body>"+links+"<div class='wrap'><h1>제목</h1>"+post+"</div></body></html>").getBytes(StandardCharsets.UTF_8),"text/html; charset=UTF-8","https://www.inven.co.kr/board/1");
  assertEquals("SUCCESS",content.status());assertTrue(content.text().contains("회피 장전"));assertFalse(content.text().contains("메뉴 링크"));
 }
 @Test void searchDropsResultsWithoutSnippetOrBodyAndScrapesTheRest()throws Exception{
  var db=new Database(dir.resolve("worker.db").toString());var repo=new SearchRepository(db);
  var topicRepo=new kr.ac.dongyang.researchboard.topic.TopicRepository(db);long topic=topicRepo.create("t","q").id();
  SearchProvider provider=new SearchProvider(){public String name(){return "SERPER";}public boolean synthetic(){return false;}
   public List<Hit> search(Query q){return List.of(new Hit("빈 결과","https://empty.example.org/a","",1),new Hit("발췌 있음","https://ok.example.org/b","발췌문",2));}};
  var http=new PagedTransport();
  // push는 스택이므로 나중에 넣은 응답이 먼저 쓰인다: 첫 결과(발췌 없음)는 추출 실패, 둘째 결과는 본문 추출 성공.
  http.scrapes.push(new SerperTransport.Response(200,json.writeValueAsString(Map.of("text","추출한 본문 문장. ".repeat(30))),""));
  http.scrapes.push(new SerperTransport.Response(500,"",""));
  var policy=new SourcePolicy("");var safety=new UrlSafety();
  var docs=new DocumentService(new PageFetcher(safety,policy),new ContentExtractor(),new SourceClassifier(policy),safety);
  var worker=new kr.ac.dongyang.researchboard.search.SearchWorker(repo,provider,docs,new SerperScraper("key",true,true,10,http,new ProviderBudget(db)),policy,10,false);
  var run=repo.create(topic,"q",provider,"k").run();worker.execute(run.runId());
  var done=repo.get(run.runId());assertEquals(1,done.processedCount());
  var page=repo.results(run.runId(),0,10);assertEquals(1,page.items().size());
  assertEquals("발췌 있음",page.items().get(0).title());assertTrue(page.items().get(0).contentText().startsWith("추출한 본문"));assertEquals("SERPER_SCRAPE",page.items().get(0).extractionReason());
 }
}
