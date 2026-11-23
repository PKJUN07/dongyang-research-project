package kr.ac.dongyang.researchboard.document;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import kr.ac.dongyang.researchboard.common.Database;

/** Identity and aliases change only inside the caller's short write transaction. */
public final class DocumentMatcher {
    private final UrlNormalizer normalizer=new UrlNormalizer();
    public DocumentMatcher(Database db) {
        db.write(c->{
            record Old(long id,String url,boolean synthetic) {}
            List<Old> rows=new ArrayList<>();
            try(var s=c.createStatement();var r=s.executeQuery("SELECT id,original_url,synthetic FROM document ORDER BY id")) {
                while(r.next()) rows.add(new Old(r.getLong(1),r.getString(2),r.getBoolean(3)));
            }
            for(var row:rows) {
                String key;
                try { key=normalizer.normalize(row.url()); } catch(IllegalArgumentException e) { key=row.url(); }
                bindIdentity(c,row.id(),row.url(),key,row.synthetic(),"LEGACY_BACKFILL");
                long owner=identity(c,key,row.synthetic());
                // Existing IDs and any referencing user records are never silently merged.
                if(owner!=row.id()) candidate(c,owner,row.id(),"LEGACY_NORMALIZED_COLLISION");
            }
            return null;
        });
    }
    private long identity(Connection c,String key,boolean synthetic) throws SQLException {
        try(var p=c.prepareStatement("SELECT document_id FROM document_identity WHERE normalized_url=? AND synthetic=?")) {
            p.setString(1,key);p.setBoolean(2,synthetic);try(var r=p.executeQuery()){return r.next()?r.getLong(1):0;}
        }
    }
    public long findOrCreate(Connection c,String raw,String title,boolean synthetic) throws SQLException {
        String key;
        try { key=normalizer.normalize(raw); } catch(IllegalArgumentException e) { key=raw; }
        long id=0;
        try(var p=c.prepareStatement("SELECT document_id FROM document_url WHERE url=? AND synthetic=?")) {
            p.setString(1,raw);p.setBoolean(2,synthetic);try(var r=p.executeQuery()){if(r.next()) id=r.getLong(1);}
        }
        String matched="EXACT_ALIAS";
        if(id==0) {id=identity(c,key,synthetic);matched="NORMALIZED_URL";}
        if(id==0) {
            try(var p=c.prepareStatement("INSERT INTO document(original_url,normalized_url,title,synthetic) VALUES(?,?,?,?) ON CONFLICT(normalized_url,synthetic) DO NOTHING")) {
                p.setString(1,raw);p.setString(2,key);p.setString(3,title);p.setBoolean(4,synthetic);p.executeUpdate();
            }
            try(var p=c.prepareStatement("SELECT id FROM document WHERE normalized_url=? AND synthetic=?")) {
                p.setString(1,key);p.setBoolean(2,synthetic);try(var r=p.executeQuery()){r.next();id=r.getLong(1);}
            }
            matched="NEW_NORMALIZED_URL";
        }
        bindIdentity(c,id,raw,key,synthetic,matched);
        try(var p=c.prepareStatement("UPDATE document SET title=? WHERE id=?")) {p.setString(1,title);p.setLong(2,id);p.executeUpdate();}
        return id;
    }
    private void bindIdentity(Connection c,long id,String raw,String key,boolean synthetic,String reason) throws SQLException {
        try(var p=c.prepareStatement("INSERT INTO document_identity VALUES(?,?,?,?) ON CONFLICT DO NOTHING")) {
            p.setString(1,key);p.setBoolean(2,synthetic);p.setLong(3,id);p.setString(4,UrlNormalizer.VERSION);p.executeUpdate();
        }
        try(var p=c.prepareStatement("INSERT INTO document_url(document_id,url,normalized_url,synthetic,rule_version,matched_by,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")) {
            p.setLong(1,id);p.setString(2,raw);p.setString(3,key);p.setBoolean(4,synthetic);p.setString(5,UrlNormalizer.VERSION);p.setString(6,reason);p.setString(7,Instant.now().toString());p.executeUpdate();
        }
    }
    public static void candidate(Connection c,long a,long b,String reason) throws SQLException {
        if(a==b) return;
        try(var p=c.prepareStatement("INSERT INTO document_duplicate_candidate(left_id,right_id,reason) VALUES(?,?,?) ON CONFLICT DO NOTHING")) {
            p.setLong(1,Math.min(a,b));p.setLong(2,Math.max(a,b));p.setString(3,reason);p.executeUpdate();
        }
    }
    public void refreshCandidates(Connection c,long id) throws SQLException {
        try(var p=c.prepareStatement("DELETE FROM document_duplicate_candidate WHERE (left_id=? OR right_id=?) AND reason IN ('SAME_BODY_HASH','SAME_TITLE_DATE')")) {
            p.setLong(1,id);p.setLong(2,id);p.executeUpdate();
        }
        List<Long> hashes=new ArrayList<>(),titles=new ArrayList<>();
        String sql="SELECT b.id,(a.extraction_status='SUCCESS' AND b.extraction_status='SUCCESS' AND length(a.content_text)>0 AND length(b.content_text)>0 AND a.content_hash IS NOT NULL AND a.content_hash=b.content_hash AND a.hash_version=b.hash_version) same_hash FROM document a JOIN document b ON a.id<>b.id AND a.synthetic=b.synthetic WHERE a.id=? AND ((a.extraction_status='SUCCESS' AND b.extraction_status='SUCCESS' AND length(a.content_text)>0 AND length(b.content_text)>0 AND a.content_hash IS NOT NULL AND a.content_hash=b.content_hash AND a.hash_version=b.hash_version) OR (a.title=b.title AND a.published_at IS NOT NULL AND a.published_at=b.published_at))";
        try(var p=c.prepareStatement(sql)) {p.setLong(1,id);try(var r=p.executeQuery()){while(r.next()) {if(r.getBoolean(2)) hashes.add(r.getLong(1));else titles.add(r.getLong(1));}}}
        for(long other:hashes) candidate(c,id,other,"SAME_BODY_HASH");
        for(long other:titles) candidate(c,id,other,"SAME_TITLE_DATE");
    }
}
