package kr.ac.dongyang.researchboard.integration;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.stats.StatsRepository;
import kr.ac.dongyang.researchboard.reading.UserRecords;
import kr.ac.dongyang.researchboard.document.*;

class StatsTest {
    @TempDir Path dir;
    Database db;StatsRepository stats;
    void setup(){db=new Database(dir.resolve("stats.db").toString());stats=new StatsRepository(db);db.write(c->{try(var s=c.createStatement()){
        s.execute("INSERT INTO topic VALUES(1,'A','private query','2026-11-01'),(2,'B','private query','2026-11-01')");
        s.execute("INSERT INTO search_run(id,topic_id,query,provider,locale,synthetic,request_key,status,started_at,finished_at,discovered_count,processed_count,raw_count,excluded_count) VALUES(1,1,'private query','FAKE','ko-KR',1,'a','SUCCEEDED','2026-11-01T14:59:00Z','2026-11-01T15:01:00Z',4,3,5,1),(2,2,'private query','FAKE','ko-KR',1,'b','SUCCEEDED','2026-11-02T00:00:00Z','2026-11-02T00:01:00Z',2,2,2,0)");
        s.execute("INSERT INTO document(id,original_url,normalized_url,title,source_type,synthetic) VALUES(1,'https://example.com/1','https://example.com/1','one','OFFICIAL',1),(2,'https://example.com/2','https://example.com/2','two','USER',1),(3,'https://example.com/3','https://example.com/3','three','OTHER',1),(4,'https://example.com/4','https://example.com/4','four','OTHER',1)");
        s.execute("INSERT INTO search_hit(id,run_id,document_id,rank,snippet,retrieved_at) VALUES(1,1,1,1,'a','2026-11-01T14:59:59Z'),(2,1,2,2,'b','2026-11-01T15:00:00Z'),(3,1,3,3,'c','2026-11-01T15:00:01Z'),(4,2,1,1,'again','2026-11-02T00:00:01Z'),(5,2,4,2,'d','2026-11-02T00:00:02Z')");
        s.execute("INSERT INTO document_topic(document_id,topic_id) VALUES(1,1),(1,2),(2,1),(3,1),(4,2)");
        s.execute("INSERT INTO reading_state(document_id,read_status,saved,favorite,read_later,updated_at) VALUES(1,'READ',1,1,0,'2026-11-02T01:00:00Z'),(2,'READ',1,0,1,'2026-11-02T01:00:00Z')");
    }return null;});}
    @Test void exactCountsNoJoinMultiplication(){setup();var o=stats.overview(null,"2026-11-01","2026-11-02");assertEquals(4,o.total());assertEquals(2,o.read());assertEquals(List.of(2L,0L,2L),o.readingCounts().stream().map(StatsRepository.Reading::count).toList());assertEquals(50.0,o.readPercent());assertEquals(2,o.saved());assertEquals(1,o.favorite());assertEquals(1,o.readLater());assertEquals(List.of(1L,1L,2L),o.sources().stream().map(StatsRepository.Source::count).toList());assertEquals(3,stats.overview(1L,"2026-11-01","2026-11-02").total());}
    @Test void koreaMidnightUsesFirstSaveNotLatestSearchOrPublication(){setup();assertEquals(1,stats.overview(null,"2026-11-01","2026-11-01").total());var o=stats.overview(null,"2026-11-02","2026-11-02");assertEquals(3,o.total());assertEquals(1,o.read());assertEquals(3,o.daily().getFirst().count());assertEquals(4,stats.overview(null,"2026-11-01","2026-11-03").daily().stream().mapToLong(StatsRepository.Day::count).sum());}
    @Test void drilldownEqualsKpisIncludingUnknownPublication(){setup();var documents=new DocumentRepository(db);var filter=Map.of("from","2026-11-02","to","2026-11-02","dateBasis","FIRST_SAVED");assertEquals(stats.overview(null,"2026-11-02","2026-11-02").total(),documents.findPage(DocumentFilter.parse(filter),null).totalElements());var read=new HashMap<>(filter);read.put("readingStatus","READ");assertEquals(1,documents.findPage(DocumentFilter.parse(read),null).totalElements());}
    @Test void unSaveAndUnreadImmediatelyChangeCurrentCounts(){setup();var user=new UserRecords(db);user.patch(1,Map.of("saved",false,"readStatus","UNREAD"));var o=stats.overview(null,"2026-11-01","2026-11-02");assertEquals(4,o.total());assertEquals(1,o.saved());assertEquals(1,o.read());assertEquals(25,o.readPercent());user.topic(1,1,false);assertEquals(2,stats.overview(1L,"2026-11-01","2026-11-02").total());assertEquals(4,stats.overview(null,"2026-11-01","2026-11-02").total());}
    @Test void historyDistinguishesRawExcludedUniqueNewExistingDuplicate(){setup();var history=stats.history(null,"2026-11-01","2026-11-02",0);assertEquals(2,history.total());var first=history.items().get(1);assertEquals(5,first.raw());assertEquals(1,first.excluded());assertEquals(4,first.valid());assertEquals(3,first.unique());assertEquals(3,first.created());assertEquals(0,first.existing());assertEquals(1,first.duplicates());var again=history.items().getFirst();assertEquals(1,again.created());assertEquals(1,again.existing());assertEquals(0,again.duplicates());assertEquals("private query",first.query());}
    @Test void emptyRangeZeroDenominatorAndZeroFilledDays(){setup();var o=stats.overview(null,"2025-01-01","2025-01-03");assertEquals(0,o.total());assertEquals(0,o.readPercent());assertEquals(3,o.daily().size());assertTrue(o.daily().stream().allMatch(d->d.count()==0));assertEquals(0,stats.history(null,"2025-01-01","2025-01-03",0).total());}
    @Test void legacyMissingCountsAndSafeErrors(){setup();db.write(c->{c.createStatement().execute("UPDATE search_run SET raw_count=NULL,excluded_count=NULL,status='FAILED',error_code='secret https://upstream' WHERE id=2");return null;});var h=stats.history(null,"2026-11-01","2026-11-02",0).items().getFirst();assertNull(h.raw());assertNull(h.excluded());assertEquals("PROCESSING_FAILED",h.errorCode());}
    @Test void invalidRangesAndPaging(){setup();for(var dates:List.of(List.of("bad","2026-11-03"),List.of("2026-11-03","2026-11-02"),List.of("2020-01-01","2026-11-03")))assertEquals(400,assertThrows(ApiException.class,()->stats.overview(null,dates.get(0),dates.get(1))).status);assertThrows(ApiException.class,()->stats.overview(-1L,null,null));assertThrows(ApiException.class,()->stats.history(null,null,null,-1));assertTrue(stats.history(null,"2026-11-01","2026-11-02",1).items().isEmpty());}
}
