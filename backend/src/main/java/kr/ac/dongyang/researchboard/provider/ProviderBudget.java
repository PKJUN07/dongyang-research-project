package kr.ac.dongyang.researchboard.provider;
import java.sql.*;
import java.time.Instant;
import org.springframework.stereotype.Component;
import kr.ac.dongyang.researchboard.common.Database;
@Component
public class ProviderBudget {
    private final Database db;
    public ProviderBudget(Database db) { this.db=db; }
    public record Status(int attempts,String blockedUntil){}
    public Status status(){return db.read(c->{try(var p=c.prepareStatement("SELECT attempts,blocked_until FROM provider_budget WHERE provider='SERPER'");var r=p.executeQuery()){return r.next()?new Status(r.getInt(1),r.getString(2)):new Status(0,null);}});}
    public void reserve(int maximum) {
        db.write(c -> {
            try(Statement s=c.createStatement()) { s.execute("INSERT OR IGNORE INTO provider_budget(provider) VALUES('SERPER')"); }
            try(Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT attempts,blocked_until FROM provider_budget WHERE provider='SERPER'")) {
                r.next();
                String blocked=r.getString(2);
                if(blocked!=null && Instant.parse(blocked).isAfter(Instant.now())) throw new ProviderException("PROVIDER_COOLDOWN");
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
