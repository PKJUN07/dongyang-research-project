package kr.ac.dongyang.researchboard.reading;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Repository;
import kr.ac.dongyang.researchboard.common.*;

@Repository
public class UserRecords {
    public record Reading(String readStatus,boolean saved,boolean favorite,boolean readLater,String updatedAt) {}
    public record Note(String text,long version,String updatedAt) {}
    private final Database db;
    public UserRecords(Database db) {this.db=db;}
    private void exists(Connection c,long id) throws SQLException {
        try(var p=c.prepareStatement("SELECT 1 FROM document WHERE id=?")){p.setLong(1,id);try(var r=p.executeQuery()){if(!r.next())throw new ApiException(404,"DOCUMENT_NOT_FOUND","자료를 찾을 수 없습니다.");}}
    }
    private Reading reading(Connection c,long id) throws SQLException {
        exists(c,id);
        try(var p=c.prepareStatement("SELECT * FROM reading_state WHERE document_id=?")){p.setLong(1,id);try(var r=p.executeQuery()){
            return r.next()?new Reading(r.getString("read_status"),r.getBoolean("saved"),r.getBoolean("favorite"),r.getBoolean("read_later"),r.getString("updated_at")):new Reading("UNREAD",false,false,false,null);
        }}
    }
    public Reading reading(long id){return db.read(c->reading(c,id));}
    public Reading patch(long id,Map<String,Object> fields) {
        if(fields.isEmpty() || !Set.of("readStatus","saved","favorite","readLater").containsAll(fields.keySet()))throw invalid();
        fields.forEach((k,v)->{if(k.equals("readStatus")){if(!(v instanceof String) || !Set.of("UNREAD","READING","READ").contains(v))throw invalid();}else if(!(v instanceof Boolean))throw invalid();});
        return db.write(c->{
            exists(c,id);
            String now=Instant.now().toString();
            try(var p=c.prepareStatement("INSERT INTO reading_state(document_id,updated_at) VALUES(?,?) ON CONFLICT(document_id) DO NOTHING")){p.setLong(1,id);p.setString(2,now);p.executeUpdate();}
            Map<String,String> columns=Map.of("readStatus","read_status","saved","saved","favorite","favorite","readLater","read_later");
            List<String> keys=new ArrayList<>(fields.keySet());
            String sets=String.join(",",keys.stream().map(k->columns.get(k)+"=?").toList());
            try(var p=c.prepareStatement("UPDATE reading_state SET "+sets+",updated_at=? WHERE document_id=?")){
                int i=1;for(String k:keys)p.setObject(i++,fields.get(k));p.setString(i++,now);p.setLong(i,id);p.executeUpdate();
            }
            return reading(c,id);
        });
    }
    public Note note(long id){return db.read(c->{exists(c,id);return note(c,id);});}
    private Note note(Connection c,long id)throws SQLException {
        try(var p=c.prepareStatement("SELECT * FROM user_note WHERE document_id=?")){p.setLong(1,id);try(var r=p.executeQuery()){return r.next()?new Note(r.getString("text"),r.getLong("version"),r.getString("updated_at")):new Note("",0,null);}}
    }
    public Note save(long id,Map<String,Object> input){
        if(!input.keySet().equals(Set.of("text","version")) || !(input.get("text") instanceof String text)
            || !(input.get("version") instanceof Number n) || !(n instanceof Integer || n instanceof Long)
            || n.longValue()<0 || n.longValue()>=Long.MAX_VALUE || text.length()>20000)throw invalid();
        long version=n.longValue();
        return db.write(c->{
            exists(c,id);String now=Instant.now().toString();int changed;
            if(version==0){
                try(var p=c.prepareStatement("INSERT INTO user_note(document_id,text,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(document_id) DO NOTHING")){p.setLong(1,id);p.setString(2,text);p.setString(3,now);changed=p.executeUpdate();}
            }else{
                try(var p=c.prepareStatement("UPDATE user_note SET text=?,version=version+1,updated_at=? WHERE document_id=? AND version=?")){p.setString(1,text);p.setString(2,now);p.setLong(3,id);p.setLong(4,version);changed=p.executeUpdate();}
            }
            if(changed!=1)throw new ApiException(409,"NOTE_VERSION_CONFLICT","다른 화면에서 메모가 변경되었습니다. 서버 메모와 내 입력을 비교하세요.");
            return note(c,id);
        });
    }
    public List<Long> topics(long id){return db.read(c->{exists(c,id);List<Long> ids=new ArrayList<>();try(var p=c.prepareStatement("SELECT topic_id FROM document_topic WHERE document_id=? AND active=1 ORDER BY topic_id")){p.setLong(1,id);try(var r=p.executeQuery()){while(r.next())ids.add(r.getLong(1));}}return ids;});}
    public void topic(long id,long topic,boolean linked){db.write(c->{exists(c,id);
        try(var p=c.prepareStatement("SELECT 1 FROM topic WHERE id=?")){p.setLong(1,topic);try(var r=p.executeQuery()){if(!r.next())throw new ApiException(404,"TOPIC_NOT_FOUND","주제를 찾을 수 없습니다.");}}
        try(var p=c.prepareStatement("INSERT INTO document_topic(document_id,topic_id,active) VALUES(?,?,?) ON CONFLICT(document_id,topic_id) DO UPDATE SET active=excluded.active")){p.setLong(1,id);p.setLong(2,topic);p.setBoolean(3,linked);p.executeUpdate();}return null;});}
    private static ApiException invalid(){return new ApiException(400,"INVALID_RECORD","입력 형식을 확인하세요. 메모는 최대 20,000자이며 null은 허용하지 않습니다.");}
}
