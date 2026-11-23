package kr.ac.dongyang.researchboard.integration;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import kr.ac.dongyang.researchboard.common.Database;
import kr.ac.dongyang.researchboard.reading.UserRecords;

class DatabaseLockTest {
    @TempDir Path dir;
    @Test void realSqliteLockLeavesNoteIntactAndRetrySucceeds()throws Exception {
        Path path=dir.resolve("lock.db");var db=new Database(path.toString());var records=new UserRecords(db);
        db.write(c->{c.createStatement().execute("INSERT INTO document(id,original_url,normalized_url,title,synthetic) VALUES(1,'https://example.com/lock','https://example.com/lock','lock',1)");return null;});
        records.save(1,Map.of("text","원본","version",0));
        try(var lock=DriverManager.getConnection("jdbc:sqlite:"+path)){
            lock.createStatement().execute("BEGIN IMMEDIATE");
            assertThrows(IllegalStateException.class,()->records.save(1,Map.of("text","잠금 중 입력","version",1)));
            assertEquals("원본",records.note(1).text());assertEquals(1,records.note(1).version());
            lock.createStatement().execute("ROLLBACK");
        }
        records.save(1,Map.of("text","잠금 중 입력","version",1));
        var reopened=new UserRecords(new Database(path.toString()));assertEquals("잠금 중 입력",reopened.note(1).text());assertEquals(2,reopened.note(1).version());
    }
}
