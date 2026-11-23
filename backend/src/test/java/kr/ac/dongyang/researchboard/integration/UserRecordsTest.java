package kr.ac.dongyang.researchboard.integration;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.reading.UserRecords;
import kr.ac.dongyang.researchboard.document.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import kr.ac.dongyang.researchboard.provider.*;
import kr.ac.dongyang.researchboard.topic.TopicRepository;

class UserRecordsTest {
    @TempDir Path dir;
    Database db;UserRecords records;SearchRepository searches;long topic,id;
    void setup(){db=new Database(dir.resolve("records.db").toString());records=new UserRecords(db);searches=new SearchRepository(db);topic=new TopicRepository(db).create("첫 주제","자료").id();collect();}
    void collect(){var run=searches.create(topic,"자료",new FakeSearchProvider(),UUID.randomUUID().toString()).run();searches.running(run.runId());searches.complete(run,List.of(new DocumentService.Ingested(new SearchProvider.Hit("자료","https://fixture.example/post","요약",1),new SourceClassifier.Classification("OFFICIAL","fixture","2026-10-28"),new ContentExtractor.Content("METADATA_ONLY","fixture",null,null,null),null,null)));id=searches.results(run.runId(),0,20).items().getFirst().documentId();}
    long count(Map<String,String> filter){return new DocumentRepository(db).findPage(DocumentFilter.parse(filter),null).totalElements();}
    @Test void independentPartialStatesAndLibraryFilters(){setup();
        assertEquals("UNREAD",records.reading(id).readStatus());
        records.patch(id,Map.of("saved",true,"favorite",true,"readStatus","READ","readLater",true));
        records.patch(id,Map.of("saved",false));
        assertEquals("READ",records.reading(id).readStatus());assertTrue(records.reading(id).favorite());assertTrue(records.reading(id).readLater());
        assertEquals(0,count(Map.of("saved","true")));assertEquals(1,count(Map.of("favorite","true","readingStatus","READ")));
        assertEquals(0,count(Map.of("readingStatus","UNREAD")));assertEquals(1,count(Map.of("readLater","true")));
        assertEquals("READ",searches.document(id).readingStatus());assertFalse(searches.document(id).saved());
    }
    @Test void recollectAndRestartPreserveLongPlainTextAndState(){setup();
        String text="첫 줄\n<script>그대로 보관</script>\n"+"긴 메모 ".repeat(2000);
        records.save(id,Map.of("text",text,"version",0));records.patch(id,Map.of("saved",true,"favorite",true,"readStatus","READING"));
        long old=id;collect();assertEquals(old,id);
        var restarted=new UserRecords(new Database(dir.resolve("records.db").toString()));
        assertEquals(text,restarted.note(id).text());assertEquals(1,restarted.note(id).version());assertTrue(restarted.reading(id).saved());assertEquals("READING",restarted.reading(id).readStatus());
        restarted.patch(id,Map.of("saved",false));assertEquals(text,restarted.note(id).text());
    }
    @Test void staleVersionsNeverOverwriteAndEmptyNoteIncrementsVersion(){setup();
        assertEquals(new UserRecords.Note("",0,null),records.note(id));
        records.save(id,Map.of("text","새 내용","version",0));
        assertEquals(409,assertThrows(ApiException.class,()->records.save(id,Map.of("text","오래된 내용","version",0))).status);
        assertEquals("새 내용",records.note(id).text());records.save(id,Map.of("text","","version",1));assertEquals(2,records.note(id).version());
        assertEquals(409,assertThrows(ApiException.class,()->records.save(id,Map.of("text","삭제 전 내용","version",1))).status);
    }
    @Test void concurrentInitialSavesHaveExactlyOneWinner()throws Exception {setup();
        try(var pool=Executors.newFixedThreadPool(2)){var gate=new CountDownLatch(1);List<Future<Integer>> tasks=new ArrayList<>();
            for(String text:List.of("탭 A","탭 B"))tasks.add(pool.submit(()->{gate.await();try{records.save(id,Map.of("text",text,"version",0));return 200;}catch(ApiException e){return e.status;}}));
            gate.countDown();List<Integer> statuses=new ArrayList<>();for(var f:tasks)statuses.add(f.get(10,TimeUnit.SECONDS));Collections.sort(statuses);assertEquals(List.of(200,409),statuses);assertEquals(1,records.note(id).version());}
    }
    @Test void multipleTopicUnlinkRetainsNoteHistoryAndExplicitUnlinkOnRecollection(){setup();long second=new TopicRepository(db).create("두 번째","자료").id();
        records.save(id,Map.of("text","남길 메모","version",0));records.topic(id,second,true);assertEquals(2,records.topics(id).size());
        records.topic(id,topic,false);assertEquals(0,count(Map.of("topicId",Long.toString(topic))));assertEquals(1,count(Map.of("topicId",Long.toString(second))));
        collect();assertEquals(List.of(second),records.topics(id));assertEquals("남길 메모",records.note(id).text());assertEquals(1,count(Map.of()));
    }
    @Test void invalidMissingAndNullInputsDoNotMutate(){setup();records.save(id,Map.of("text","유지","version",0));
        var nullPatch=new HashMap<String,Object>();nullPatch.put("saved",null);
        for(var patch:List.of(Map.<String,Object>of(),nullPatch,Map.<String,Object>of("saved","true"),Map.<String,Object>of("readStatus","DONE"),Map.<String,Object>of("unknown",true)))assertEquals(400,assertThrows(ApiException.class,()->records.patch(id,patch)).status);
        assertEquals(400,assertThrows(ApiException.class,()->records.save(id,Map.of("text","x".repeat(20001),"version",1))).status);
        assertEquals(400,assertThrows(ApiException.class,()->records.save(id,Map.of("text","x","version",1.0))).status);
        assertEquals(404,assertThrows(ApiException.class,()->records.patch(99999,Map.of("saved",true))).status);
        assertEquals(404,assertThrows(ApiException.class,()->records.save(99999,Map.of("text","x","version",0))).status);
        assertEquals("유지",records.note(id).text());
    }
    @Test void databaseWriteFailureRollsBackNoteAndVersion(){setup();records.save(id,Map.of("text","원본","version",0));
        db.write(c->{c.createStatement().execute("CREATE TRIGGER fail_note BEFORE UPDATE ON user_note BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");return null;});
        assertThrows(IllegalStateException.class,()->records.save(id,Map.of("text","실패할 변경","version",1)));
        assertEquals("원본",records.note(id).text());assertEquals(1,records.note(id).version());
    }
}
