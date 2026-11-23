package kr.ac.dongyang.researchboard.integration;

import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.Database;
import kr.ac.dongyang.researchboard.document.*;
import kr.ac.dongyang.researchboard.provider.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;
import kr.ac.dongyang.researchboard.topic.TopicRepository;

class IdentityTest {
    @TempDir Path dir;
    Database db; SearchRepository repo; long topic;
    void setup() { db=new Database(dir.resolve("test.db").toString());repo=new SearchRepository(db);topic=new TopicRepository(db).create("주제","q").id(); }
    DocumentService.Ingested item(String url,String title,String snippet,int rank,String text,String date,String canonical) throws Exception {
        String hash=text==null?null:HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        return new DocumentService.Ingested(new SearchProvider.Hit(title,url,snippet,rank),new SourceClassifier.Classification("OTHER","fixture",Instant.now().toString()),new ContentExtractor.Content(text==null?"METADATA_ONLY":"SUCCESS","fixture",text,date,canonical),hash,text==null?null:Instant.now().toString());
    }
    SearchRepository.Run save(DocumentService.Ingested... items) {
        var run=repo.create(topic,"q",new FakeSearchProvider(),UUID.randomUUID().toString()).run();repo.running(run.runId());repo.complete(run,List.of(items));return run;
    }
    int count(String table) {return db.read(c->{try(var s=c.createStatement();var r=s.executeQuery("SELECT count(*) FROM "+table)){r.next();return r.getInt(1);}});}
    @Test void conservativeNormalizationMatrix() {
        var n=new UrlNormalizer();
        assertEquals("https://example.com/Article?id=7&lang=ko",n.normalize("HTTPS://EXAMPLE.COM:443/Article?utm_source=a&id=7&lang=ko#part"));
        assertEquals("http://example.com/",n.normalize("http://example.com:80"));
        assertNotEquals(n.normalize("https://example.com/a"),n.normalize("https://example.com/a/"));
        assertNotEquals(n.normalize("https://example.com/A"),n.normalize("https://example.com/a"));
        assertNotEquals(n.normalize("https://example.com/a?id=1"),n.normalize("https://example.com/a?id=2"));
        assertEquals("https://example.com/a?q=%ED%95%9C%EA%B8%80&q=x",n.normalize("https://example.com/a?q=%ED%95%9C%EA%B8%80&utm_medium=m&q=x"));
        assertNotEquals(n.normalize("https://example.com/a?b=1&a=2"),n.normalize("https://example.com/a?a=2&b=1"));
        assertEquals("https://example.com/a?sig=secret&utm_source=x",n.normalize("https://example.com/a?sig=secret&utm_source=x"));
        assertThrows(IllegalArgumentException.class,()->n.normalize("file:///secret"));
        assertThrows(IllegalArgumentException.class,()->n.normalize("https://user:password@example.com/a"));
    }
    @Test void canonicalNeverOverridesIdentity() {
        var n=new UrlNormalizer();
        assertEquals("REJECTED_CROSS_ORIGIN",n.canonicalReason("https://a.example/post","https://b.example/post"));
        assertEquals("REJECTED_HOME_CANONICAL",n.canonicalReason("https://a.example/post","https://a.example/"));
        assertEquals("HINT_ONLY_NOT_MERGED",n.canonicalReason("https://a.example/post","https://a.example/another"));
    }
    @Test void trackingAliasesPreserveEverySearchHitAndUserRecord() throws Exception {
        setup(); var a=save(item("https://example.com/a?utm_source=x","처음","첫 요약",4,"본문","2026-10-20",null));
        long id=repo.results(a.runId(),0,20).items().getFirst().documentId();
        new kr.ac.dongyang.researchboard.reading.UserRecords(db).save(id,Map.of("text","보존할 메모","version",0));
        var b=save(item("https://example.com/a?utm_campaign=y#fragment","수정 제목","두 번째 요약",1,"수정 본문","2026-10-21",null));
        assertEquals(1,count("document"));assertEquals(2,count("search_run"));assertEquals(2,count("search_hit"));assertEquals(2,count("document_url"));
        assertEquals("첫 요약",repo.results(a.runId(),0,20).items().getFirst().snippet());
        assertEquals(4,repo.results(a.runId(),0,20).items().getFirst().rank());
        assertEquals("두 번째 요약",repo.results(b.runId(),0,20).items().getFirst().snippet());
        assertEquals(id,repo.results(b.runId(),0,20).items().getFirst().documentId());
        db.read(c->{try(var r=c.createStatement().executeQuery("SELECT n.text,d.content_version,d.hash_version FROM user_note n JOIN document d ON d.id=n.document_id")){r.next();assertEquals("보존할 메모",r.getString(1));assertEquals(2,r.getInt(2));assertEquals("jsoup-text-v1",r.getString(3));}return null;});
        assertEquals(1,new SearchRepository(new Database(dir.resolve("test.db").toString())).results(a.runId(),0,20).items().size());
    }
    @Test void meaningfulParametersAndOtherSourcesNeverMerge() throws Exception {
        setup();save(item("https://example.com/a?id=1","같은 제목","a",1,"같은 본문",null,"https://example.com/"),item("https://example.com/a?id=2","같은 제목","b",2,"같은 본문",null,"https://other.example/a"),item("https://other.example/a","같은 제목","c",3,"같은 본문",null,null));
        assertEquals(3,count("document"));assertEquals(3,count("document_duplicate_candidate"));
    }
    @Test void emptyBodiesAndUndatedTitlesAreNotDuplicateEvidence() throws Exception {
        setup();save(item("https://a.example/a","동명","a",1,null,null,null),item("https://b.example/a","동명","b",2,null,null,null));
        assertEquals(2,count("document"));assertEquals(0,count("document_duplicate_candidate"));
    }
    @Test void metadataOnlyRecollectionKeepsSecuredBody() throws Exception {
        setup();save(item("https://example.com/a","제목","a",1,"기존 본문",null,null));
        var run=save(item("https://example.com/a","제목2","b",1,null,null,null));
        assertEquals("기존 본문",repo.results(run.runId(),0,20).items().getFirst().contentText());
    }
    @Test void simultaneousSavesCannotCreateDuplicateDocuments() throws Exception {
        setup();var one=repo.create(topic,"q1",new FakeSearchProvider(),"one").run();var two=repo.create(topic,"q2",new FakeSearchProvider(),"two").run();repo.running(one.runId());repo.running(two.runId());
        var hit=item("https://example.com/a","동시","요약",1,null,null,null);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);
            var f1=pool.submit(()->{try{gate.await();repo.complete(one,List.of(hit));}catch(Exception e){throw new RuntimeException(e);}});
            var f2=pool.submit(()->{try{gate.await();repo.complete(two,List.of(hit));}catch(Exception e){throw new RuntimeException(e);}});
            gate.countDown();f1.get(10,TimeUnit.SECONDS);f2.get(10,TimeUnit.SECONDS);
        }
        assertEquals(1,count("document"));assertEquals(2,count("search_hit"));
    }
    @Test void legacyCollisionsKeepBothIdsAndOriginalAliasOwnership() throws Exception {
        setup();
        db.write(c->{try(var p=c.prepareStatement("INSERT INTO document(original_url,normalized_url,title,synthetic) VALUES(?,?,?,1)")) {
            for(String url:List.of("https://EXAMPLE.com/a","https://example.com/a?utm_source=old")) {p.setString(1,url);p.setString(2,url);p.setString(3,"legacy");p.executeUpdate();}
        }return null;});
        repo=new SearchRepository(new Database(dir.resolve("test.db").toString()));
        assertEquals(2,count("document"));assertEquals(1,count("document_duplicate_candidate"));
        var original=save(item("https://example.com/a?utm_source=old","old","s",1,null,null,null));
        var variant=save(item("https://example.com/a?utm_source=new","new","s",1,null,null,null));
        assertEquals(2,repo.results(original.runId(),0,20).items().getFirst().documentId());
        assertEquals(1,repo.results(variant.runId(),0,20).items().getFirst().documentId());assertEquals(2,count("document"));
    }
    @Test void malformedComparisonUrlStillPreservesOtherSavedResults() throws Exception {
        setup();save(item("javascript:invalid","안전하지 않은 링크","s",1,null,null,null),item("https://example.com/a","정상","s",2,null,null,null));
        assertEquals(2,count("document"));assertEquals(2,count("search_hit"));
    }
}
