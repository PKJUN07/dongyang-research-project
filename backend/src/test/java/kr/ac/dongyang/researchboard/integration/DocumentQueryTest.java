package kr.ac.dongyang.researchboard.integration;

import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.Database;
import kr.ac.dongyang.researchboard.document.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import kr.ac.dongyang.researchboard.topic.TopicRepository;
import kr.ac.dongyang.researchboard.provider.*;

class DocumentQueryTest {
    @TempDir Path dir;
    Database db;SearchRepository searches;DocumentRepository docs;long topic;
    void setup(){db=new Database(dir.resolve("query.db").toString());searches=new SearchRepository(db);docs=new DocumentRepository(db);topic=new TopicRepository(db).create("한글","q").id();}
    DocumentService.Ingested hit(String url,String title,String snippet,int rank,String date) {
        return new DocumentService.Ingested(new SearchProvider.Hit(title,url,snippet,rank),new SourceClassifier.Classification("OFFICIAL","fixture",Instant.now().toString()),new ContentExtractor.Content("METADATA_ONLY","fixture",null,date,null),null,null);
    }
    long save(DocumentService.Ingested... data) {var run=searches.create(topic,"q",new FakeSearchProvider(),UUID.randomUUID().toString()).run();searches.running(run.runId());searches.complete(run,List.of(data));return run.runId();}
    DocumentFilter filter(String basis,String from,String to,boolean unknown,String sort,int page,int size,String title) {return new DocumentFilter(null,null,title,basis,from,to,sort,page,size,unknown,null);}
    @Test void latestGlobalSnippetAndRunScopedHistoryAreDifferent() {
        setup();long first=save(hit("https://example.com/a","한글","과거",7,null));long second=save(hit("https://example.com/a?utm_source=x","한글","최신",1,null));
        assertEquals("과거",docs.findPage(filter(null,null,null,false,"RANK",0,20,""),first).items().getFirst().snippet());
        var all=docs.findPage(filter(null,null,null,false,"RANK",0,20,""),null);assertEquals(1,all.totalElements());assertEquals("최신",all.items().getFirst().snippet());
        assertEquals("최신",docs.findDetail(all.items().getFirst().documentId(),null).snippet());
        assertEquals("과거",docs.findDetail(all.items().getFirst().documentId(),first).snippet());assertNotEquals(first,second);
    }
    @Test void dateBasisUnknownInclusionAndKoreanMidnight() {
        setup();long run=save(hit("https://example.com/a","날짜 있음","a",1,"2026-10-20"),hit("https://example.com/b","날짜 미상","b",2,null));
        db.write(c->{try(var p=c.prepareStatement("UPDATE search_hit SET retrieved_at='2026-10-21T15:05:00Z' WHERE run_id=?")){p.setLong(1,run);p.executeUpdate();}return null;});
        assertEquals(1,docs.findPage(filter("PUBLISHED","2026-10-20","2026-10-20",false,null,0,20,""),run).totalElements());
        assertEquals(2,docs.findPage(filter("PUBLISHED","2026-10-20","2026-10-20",true,null,0,20,""),run).totalElements());
        assertEquals(2,docs.findPage(filter("FETCHED","2026-10-22","2026-10-22",false,null,0,20,""),run).totalElements());
        assertEquals(0,docs.findPage(filter("FETCHED","2026-10-21","2026-10-21",false,null,0,20,""),run).totalElements());
    }
    @Test void titleWildcardsAreLiteralAndPaginationIsStable() {
        setup();long run=save(hit("https://example.com/a","100%_한글","a",1,null),hit("https://example.com/b","100퍼센트한글","b",1,null),hit("https://example.com/c","긴 한글 제목 ".repeat(40),"c",1,null));
        assertEquals(1,docs.findPage(filter(null,null,null,false,null,0,20,"%_"),run).totalElements());
        assertEquals(0,docs.findPage(filter(null,null,null,false,null,0,20,"' OR 1=1 --"),run).totalElements());
        var ids=new HashSet<Long>();
        for(int page=0;page<3;page++) ids.add(docs.findPage(filter(null,null,null,false,"RANK",page,1,""),run).items().getFirst().documentId());
        assertEquals(3,ids.size());
        assertEquals(0,docs.findPage(filter(null,null,null,false,"RANK",3,1,""),run).items().size());
    }
}
