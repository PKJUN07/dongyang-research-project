package kr.ac.dongyang.researchboard.common;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.core.io.ClassPathResource;
@Component
public class Database {
    private final String url;
    @FunctionalInterface public interface Work<T> { T run(Connection connection) throws SQLException; }
    public Database(@Value("${research.db-path:data/research-board.db}") String path) {
        try {
            Path file = Path.of(path).toAbsolutePath().normalize();
            Files.createDirectories(file.getParent());
            url = "jdbc:sqlite:" + file;
            migrate();
        } catch (Exception e) { throw new IllegalStateException("Database initialization failed", e); }
    }
    private Connection open() throws SQLException {
        Connection c = DriverManager.getConnection(url);
        try (Statement s = c.createStatement()) {
            s.execute("PRAGMA foreign_keys=ON"); s.execute("PRAGMA busy_timeout=5000");
        } catch (SQLException e) { c.close(); throw e; }
        return c;
    }
    public <T> T read(Work<T> work) {
        try (Connection c = open()) { return work.run(c); }
        catch (SQLException e) { throw new IllegalStateException("Database operation failed", e); }
    }
    public synchronized <T> T write(Work<T> work) {
        return read(c -> {
            c.setAutoCommit(false);
            try { T result = work.run(c); c.commit(); return result; }
            catch (SQLException | RuntimeException e) { c.rollback(); throw e; }
        });
    }
    private void migrate() throws Exception {
        try (Connection c = open(); Statement s = c.createStatement()) {
            s.execute("PRAGMA journal_mode=WAL");
            s.execute("CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
        }
        String[] migrations = {"001_core.sql", "002_provider_budget.sql", "003_content.sql", "004_document_identity.sql", "005_user_records.sql", "006_search_metrics.sql", "007_ai.sql", "008_brief.sql"};
        for (int i = 0; i < migrations.length; i++) {
            int version = i + 1;
            String sql;
            try (var input = new ClassPathResource("db/" + migrations[i]).getInputStream()) {
                sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            }
            write(c -> {
                try (PreparedStatement check = c.prepareStatement("SELECT 1 FROM schema_version WHERE version=?")) {
                    check.setInt(1, version);
                    try (ResultSet rs = check.executeQuery()) { if (rs.next()) return null; }
                }
                try (Statement s = c.createStatement()) {
                    for (String part : sql.split(";")) if (!part.isBlank()) s.execute(part);
                }
                try (PreparedStatement p = c.prepareStatement("INSERT INTO schema_version VALUES (?,?)")) {
                    p.setInt(1, version); p.setString(2, java.time.Instant.now().toString()); p.executeUpdate();
                }
                return null;
            });
        }
    }
}
