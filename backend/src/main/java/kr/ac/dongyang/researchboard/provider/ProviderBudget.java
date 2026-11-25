package kr.ac.dongyang.researchboard.provider;
import java.sql.*;
import java.time.*;
import org.springframework.stereotype.Component;
import kr.ac.dongyang.researchboard.common.Database;
/** Serper 호출 상한. 하루(Asia/Seoul) 단위로 다시 채워지며, 검색 결과 페이지와 본문 스크랩 모두 1회씩 차감한다. */
@Component
public class ProviderBudget {
    private static final ZoneId ZONE=ZoneId.of("Asia/Seoul");
    private final Database db;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    public ProviderBudget(Database db) { this(db,Clock.systemUTC()); }
    public ProviderBudget(Database db,Clock clock) { this.db=db;this.clock=clock; }
    public record Status(int attempts,String blockedUntil){}
    private String today() { return LocalDate.now(clock.withZone(ZONE)).toString(); }
    public Status status(){return db.read(c->{try(var p=c.prepareStatement("SELECT attempts,blocked_until,window_day FROM provider_budget WHERE provider='SERPER'");var r=p.executeQuery()){
        if(!r.next()) return new Status(0,null);
        return new Status(today().equals(r.getString(3))?r.getInt(1):0,r.getString(2));
    }});}
    public void reserve(int maximum) {
        db.write(c -> {
            try(Statement s=c.createStatement()) { s.execute("INSERT OR IGNORE INTO provider_budget(provider) VALUES('SERPER')"); }
            try(PreparedStatement p=c.prepareStatement("UPDATE provider_budget SET attempts=0,window_day=? WHERE provider='SERPER' AND (window_day IS NULL OR window_day<>?)")) {
                p.setString(1,today());p.setString(2,today());p.executeUpdate();
            }
            try(Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT attempts,blocked_until FROM provider_budget WHERE provider='SERPER'")) {
                r.next();
                String blocked=r.getString(2);
                if(blocked!=null && Instant.parse(blocked).isAfter(clock.instant())) throw new ProviderException("PROVIDER_COOLDOWN");
                if(r.getInt(1)>=maximum) throw new ProviderException("BUDGET_EXHAUSTED");
            }
            try(Statement s=c.createStatement()) { s.executeUpdate("UPDATE provider_budget SET attempts=attempts+1 WHERE provider='SERPER'"); }
            return null;
        });
    }
    public void blockUntil(Instant time) {
        db.write(c->{try(PreparedStatement p=c.prepareStatement("UPDATE provider_budget SET blocked_until=? WHERE provider='SERPER'")) {
            p.setString(1,time.toString());p.executeUpdate();return null;
        }});
    }
}
