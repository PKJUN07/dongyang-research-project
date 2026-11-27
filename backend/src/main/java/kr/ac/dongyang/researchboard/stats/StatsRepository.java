package kr.ac.dongyang.researchboard.stats;
import java.sql.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Repository;
import kr.ac.dongyang.researchboard.common.*;

@Repository
public class StatsRepository {
    private final Database db;
    public StatsRepository(Database db){this.db=db;}
    public record Scope(Long topicId,String from,String to) {
        public Scope {
            try {
                if(topicId!=null && topicId<=0)throw new IllegalArgumentException();
                if(from==null || from.isBlank())from=LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(29).toString();
                if(to==null || to.isBlank())to=LocalDate.now(ZoneId.of("Asia/Seoul")).toString();
                long days=java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(from),LocalDate.parse(to));
                if(days<0 || days>365)throw new IllegalArgumentException();
            }catch(Exception e){throw new ApiException(400,"INVALID_STATS_RANGE","기간은 시작일 이후 최대 366일로 선택하세요.");}
        }
    }
    public record Day(String date,long count){}
    public record Source(String type,long count){}
    public record Reading(String status,long count){}
    public record Overview(String from,String to,String timezone,long total,long read,long saved,long favorite,long readLater,double readPercent,List<Day> daily,List<Source> sources,List<Reading> readingCounts){}
    public record History(long id,String topic,String query,String provider,String status,String startedAt,String finishedAt,String errorCode,Integer raw,Integer excluded,int valid,int unique,int created,int existing,int duplicates,int bodyFailures){}
    public record HistoryPage(List<History> items,long total,int page,int size){}
    private static void bind(PreparedStatement p,List<Object> args)throws SQLException{for(int i=0;i<args.size();i++)p.setObject(i+1,args.get(i));}
    private static final String FIRST="(SELECT retrieved_at FROM search_hit first WHERE first.document_id=d.id ORDER BY first.id LIMIT 1)";
    public Overview overview(Long topicId,String from,String to){
        var scope=new Scope(topicId,from,to);
        List<Object> args=new ArrayList<>(List.of(scope.from(),scope.to()));
        String where=" WHERE date("+FIRST+",'+9 hours') BETWEEN ? AND ?";
        if(topicId!=null){where+=" AND EXISTS(SELECT 1 FROM document_topic dt WHERE dt.document_id=d.id AND dt.topic_id=? AND dt.active=1)";args.add(topicId);}
        final String selected=" FROM document d LEFT JOIN reading_state r ON r.document_id=d.id"+where;
        return db.read(c->{c.setAutoCommit(false);
            long total,read,saved,favorite,later;
            try(var p=c.prepareStatement("SELECT count(*),coalesce(sum(r.read_status='READ'),0),coalesce(sum(r.saved),0),coalesce(sum(r.favorite),0),coalesce(sum(r.read_later),0)"+selected)){bind(p,args);try(var r=p.executeQuery()){r.next();total=r.getLong(1);read=r.getLong(2);saved=r.getLong(3);favorite=r.getLong(4);later=r.getLong(5);}}
            Map<String,Long> days=new HashMap<>();
            try(var p=c.prepareStatement("SELECT date("+FIRST+",'+9 hours') day,count(*)"+selected+" GROUP BY day")){bind(p,args);try(var r=p.executeQuery()){while(r.next())days.put(r.getString(1),r.getLong(2));}}
            List<Day> daily=new ArrayList<>();for(var date=LocalDate.parse(scope.from());!date.isAfter(LocalDate.parse(scope.to()));date=date.plusDays(1))daily.add(new Day(date.toString(),days.getOrDefault(date.toString(),0L)));
            Map<String,Long> sources=new HashMap<>();
            try(var p=c.prepareStatement("SELECT d.source_type,count(*)"+selected+" GROUP BY d.source_type")){bind(p,args);try(var r=p.executeQuery()){while(r.next())sources.put(r.getString(1),r.getLong(2));}}
            Map<String,Long> reading=new HashMap<>();
            try(var p=c.prepareStatement("SELECT coalesce(r.read_status,'UNREAD') state,count(*)"+selected+" GROUP BY state")){bind(p,args);try(var r=p.executeQuery()){while(r.next())reading.put(r.getString(1),r.getLong(2));}}
            c.commit();return new Overview(scope.from(),scope.to(),"Asia/Seoul",total,read,saved,favorite,later,total==0?0:Math.round(1000.0*read/total)/10.0,daily,List.of(new Source("OFFICIAL",sources.getOrDefault("OFFICIAL",0L)),new Source("USER",sources.getOrDefault("USER",0L)),new Source("OTHER",sources.getOrDefault("OTHER",0L))),List.of(new Reading("UNREAD",reading.getOrDefault("UNREAD",0L)),new Reading("READING",reading.getOrDefault("READING",0L)),new Reading("READ",reading.getOrDefault("READ",0L))));
        });
    }
    public HistoryPage history(Long topicId,String from,String to,int page){
        var scope=new Scope(topicId,from,to);if(page<0 || page>1000000)throw new ApiException(400,"INVALID_PAGE","페이지 범위를 확인하세요.");
        List<Object> args=new ArrayList<>(List.of(scope.from(),scope.to()));
        String where=" WHERE date(s.started_at,'+9 hours') BETWEEN ? AND ?";
        if(topicId!=null){where+=" AND s.topic_id=?";args.add(topicId);}final String filter=where;
        return db.read(c->{c.setAutoCommit(false);long total;
            try(var p=c.prepareStatement("SELECT count(*) FROM search_run s"+filter)){bind(p,args);try(var r=p.executeQuery()){r.next();total=r.getLong(1);}}
            List<History> items=new ArrayList<>();
            String sql="SELECT s.*,t.name topic,(SELECT count(*) FROM search_hit h WHERE h.run_id=s.id) unique_count,(SELECT count(*) FROM search_hit h WHERE h.run_id=s.id AND h.id=(SELECT min(first.id) FROM search_hit first WHERE first.document_id=h.document_id)) new_count FROM search_run s JOIN topic t ON t.id=s.topic_id"+filter+" ORDER BY julianday(s.started_at) DESC,s.id DESC LIMIT 10 OFFSET ?";
            try(var p=c.prepareStatement(sql)){var paged=new ArrayList<>(args);paged.add((long)page*10);bind(p,paged);try(var r=p.executeQuery()){while(r.next()){
                int unique=r.getInt("unique_count"),created=r.getInt("new_count"),valid=r.getInt("discovered_count");
                String code=r.getString("error_code");if(code!=null && !code.matches("[A-Z_]{1,64}"))code="PROCESSING_FAILED";
                items.add(new History(r.getLong("id"),r.getString("topic"),r.getString("query"),r.getString("provider"),r.getString("status"),r.getString("started_at"),r.getString("finished_at"),code,(Integer)r.getObject("raw_count"),(Integer)r.getObject("excluded_count"),valid,unique,created,unique-created,Math.max(0,valid-unique),r.getInt("failure_count")));
            }}}c.commit();return new HistoryPage(items,total,page,10);
        });
    }
}
