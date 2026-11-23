package kr.ac.dongyang.researchboard.topic;
import kr.ac.dongyang.researchboard.common.Database;
import org.springframework.stereotype.Repository;
import java.sql.*;
import java.time.Instant;
import java.util.*;
@Repository
public class TopicRepository {
    public record Topic(long id, String name, String query, String createdAt) {}
    private final Database db;
    public TopicRepository(Database db) { this.db = db; }
    public List<Topic> list() {
        return db.read(c -> {
            List<Topic> items = new ArrayList<>();
            try (Statement p = c.createStatement(); ResultSet r = p.executeQuery("SELECT * FROM topic ORDER BY id DESC")) {
                while (r.next()) items.add(new Topic(r.getLong("id"),r.getString("name"),r.getString("query"),r.getString("created_at")));
            } return items;
        });
    }
    public Topic create(String name, String query) {
        return db.write(c -> {
            String now = Instant.now().toString();
            try (PreparedStatement p = c.prepareStatement("INSERT INTO topic(name,query,created_at) VALUES(?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
                p.setString(1,name); p.setString(2,query); p.setString(3,now); p.executeUpdate();
                try(ResultSet keys=p.getGeneratedKeys()) { keys.next(); return new Topic(keys.getLong(1),name,query,now); }
            }
        });
    }
    public boolean exists(long id) {
        return db.read(c -> { try (PreparedStatement p=c.prepareStatement("SELECT 1 FROM topic WHERE id=?")) {
            p.setLong(1,id); try(ResultSet r=p.executeQuery()) { return r.next(); }
        }});
    }
}
