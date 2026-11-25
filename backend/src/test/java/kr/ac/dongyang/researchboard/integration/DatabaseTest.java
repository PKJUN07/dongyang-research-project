package kr.ac.dongyang.researchboard.integration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.Database;
import kr.ac.dongyang.researchboard.topic.TopicRepository;
import kr.ac.dongyang.researchboard.provider.FakeSearchProvider;
import kr.ac.dongyang.researchboard.search.SearchRepository;
class DatabaseTest {
    @TempDir Path dir;
    @Test void foreignKeysRollbackAndMigrations() {
        Database db=new Database(dir.resolve("isolated.db").toString());
        assertThrows(IllegalStateException.class,()->db.write(c->{
            c.createStatement().execute("INSERT INTO topic(name,query,created_at) VALUES('rolled back','q','now')");
            c.createStatement().execute("INSERT INTO search_hit(run_id,document_id,rank,snippet,retrieved_at) VALUES(999,999,1,'x','now')"); return null;
        }));
        assertTrue(new TopicRepository(db).list().isEmpty());
        int count=db.read(c->{try(ResultSet r=c.createStatement().executeQuery("SELECT COUNT(*) FROM schema_version")){r.next();return r.getInt(1);}});
        assertEquals(12,count);
    }
    @Test void interruptedJobsAreNotReportedSuccessful() {
        Database db=new Database(dir.resolve("recovery.db").toString());
        long topic=new TopicRepository(db).create("topic","q").id();
        SearchRepository searches=new SearchRepository(db);
        long run=searches.create(topic,"q",new FakeSearchProvider(),"one").run().runId();
        searches.running(run); searches.recoverInterrupted();
        assertEquals("FAILED",searches.get(run).status());
        assertEquals("INTERRUPTED",searches.get(run).errorCode());
    }
}
