package kr.ac.dongyang.researchboard.search;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.provider.SearchProvider;
import kr.ac.dongyang.researchboard.document.DocumentService;
import kr.ac.dongyang.researchboard.document.DocumentMatcher;
import kr.ac.dongyang.researchboard.document.UrlNormalizer;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Repository;
@Repository
public class SearchRepository {
    public static final String READING_COLUMNS=",COALESCE((SELECT read_status FROM reading_state WHERE document_id=d.id),'UNREAD') read_status,COALESCE((SELECT saved FROM reading_state WHERE document_id=d.id),0) saved,COALESCE((SELECT favorite FROM reading_state WHERE document_id=d.id),0) favorite,COALESCE((SELECT read_later FROM reading_state WHERE document_id=d.id),0) read_later";
    public record Run(long runId,long topicId,String query,String provider,boolean synthetic,String status,
            int discoveredCount,int processedCount,int failureCount,String errorCode,String startedAt,String finishedAt) {}
    public record Card(long documentId,String title,String url,String snippet,int rank,String sourceType,
            String classificationReason,String publishedAt,boolean synthetic,String extractionStatus,
            String extractionReason,String contentText,String fetchedAt,String classifiedAt,
            String domain,String retrievedAt,int contentVersion,int duplicateCandidateCount,String readingStatus,boolean saved,boolean favorite,boolean readLater) {}
    public record Page(List<Card> items,long totalElements,int page,int size,long totalPages) {
        public Page(List<Card> items,long total,int page,int size) { this(items,total,page,size,(total+size-1)/size); }
    }
    public record Created(Run run,boolean fresh) {}
    private final Database db;
    private final DocumentMatcher matcher;
    public SearchRepository(Database db) { this.db=db;this.matcher=new DocumentMatcher(db); }
    private Run map(ResultSet r) throws SQLException {
        return new Run(r.getLong("id"),r.getLong("topic_id"),r.getString("query"),r.getString("provider"),r.getBoolean("synthetic"),r.getString("status"),r.getInt("discovered_count"),r.getInt("processed_count"),r.getInt("failure_count"),r.getString("error_code"),r.getString("started_at"),r.getString("finished_at"));
    }
    public Run get(long id) {
        return db.read(c -> { try(PreparedStatement p=c.prepareStatement("SELECT * FROM search_run WHERE id=?")) {
            p.setLong(1,id); try(ResultSet r=p.executeQuery()) {
                if(!r.next()) throw new ApiException(404,"RUN_NOT_FOUND","검색 작업을 찾을 수 없습니다."); return map(r);
            }
        }});
    }
    public Created create(long topicId,String query,SearchProvider provider,String key) {
        return db.write(c -> {
            try(PreparedStatement p=c.prepareStatement("SELECT * FROM search_run WHERE request_key=?")) {
                p.setString(1,key); try(ResultSet r=p.executeQuery()) { if(r.next()) {
                    Run old=map(r);
                    if(old.topicId()!=topicId || !old.query().equals(query) || !old.provider().equals(provider.name()))
                        throw new ApiException(409,"REQUEST_CONFLICT","같은 요청 키에 다른 검색 조건이 사용되었습니다.");
                    return new Created(old,false);
                }}
            }
            try(PreparedStatement p=c.prepareStatement("SELECT * FROM search_run WHERE topic_id=? AND query=? AND provider=? AND status IN ('QUEUED','RUNNING')")) {
                p.setLong(1,topicId); p.setString(2,query); p.setString(3,provider.name());
                try(ResultSet r=p.executeQuery()) { if(r.next()) return new Created(map(r),false); }
            }
            try(PreparedStatement p=c.prepareStatement("INSERT INTO search_run(topic_id,query,provider,locale,synthetic,request_key,status,started_at) VALUES(?,?,?,'ko-KR',?,?,'QUEUED',?)",Statement.RETURN_GENERATED_KEYS)) {
                String now=Instant.now().toString();
                p.setLong(1,topicId); p.setString(2,query); p.setString(3,provider.name()); p.setBoolean(4,provider.synthetic()); p.setString(5,key); p.setString(6,now); p.executeUpdate();
                try(ResultSet keys=p.getGeneratedKeys()) { keys.next(); return new Created(new Run(keys.getLong(1),topicId,query,provider.name(),provider.synthetic(),"QUEUED",0,0,0,null,now,null),true); }
            }
        });
    }
    public void running(long id) { update(id,"RUNNING",null); }
    public void recordReceipt(long id,SearchProvider.Batch batch) {
        db.write(c->{try(var p=c.prepareStatement("UPDATE search_run SET raw_count=?,excluded_count=? WHERE id=? AND status='RUNNING'")){p.setInt(1,batch.rawCount());p.setInt(2,batch.excludedCount());p.setLong(3,id);p.executeUpdate();}return null;});
    }
    public void fail(long id,String code) { update(id,"FAILED",code); }
    private void update(long id,String state,String error) {
        db.write(c -> { try(PreparedStatement p=c.prepareStatement("UPDATE search_run SET status=?,error_code=?,finished_at=? WHERE id=? AND status IN ('QUEUED','RUNNING')")) {
            p.setString(1,state); p.setString(2,error); p.setString(3,state.equals("RUNNING")?null:Instant.now().toString()); p.setLong(4,id); p.executeUpdate(); return null;
        }});
    }
    public void recoverInterrupted() {
        db.write(c -> { try(PreparedStatement p=c.prepareStatement("UPDATE search_run SET status='FAILED',error_code='INTERRUPTED',finished_at=? WHERE status IN ('QUEUED','RUNNING')")) {
            p.setString(1,Instant.now().toString()); p.executeUpdate(); return null;
        }});
    }
    public void complete(Run run,List<DocumentService.Ingested> documents) {
        db.write(c -> {
            int failures=0;
            for(DocumentService.Ingested document:documents) {
                SearchProvider.Hit hit=document.hit();
                if(java.util.Set.of("FAILED","BLOCKED").contains(document.content().status())) failures++;
                long documentId=matcher.findOrCreate(c,hit.url(),hit.title(),run.synthetic());
                try(var p=c.prepareStatement("INSERT INTO document_topic(document_id,topic_id) VALUES(?,?) ON CONFLICT(document_id,topic_id) DO NOTHING")){p.setLong(1,documentId);p.setLong(2,run.topicId());p.executeUpdate();}
                // Metadata-only re-collection must not erase an already secured body.
                try(PreparedStatement p=c.prepareStatement("UPDATE document SET source_type=CASE WHEN ?='OTHER' AND source_type<>'OTHER' THEN source_type ELSE ? END,classification_reason=CASE WHEN ?='OTHER' AND source_type<>'OTHER' THEN classification_reason ELSE ? END,classified_at=?,published_at=COALESCE(?,published_at) WHERE id=?")) {
                    p.setString(1,document.classification().type());p.setString(2,document.classification().type());p.setString(3,document.classification().type());p.setString(4,document.classification().reason());p.setString(5,document.classification().checkedAt());p.setString(6,document.content().publishedAt());p.setLong(7,documentId);p.executeUpdate();
                }
                try(PreparedStatement p=c.prepareStatement("UPDATE document SET content_version=content_version+CASE WHEN content_hash IS NOT NULL AND ? IS NOT NULL AND content_hash<>? THEN 1 ELSE 0 END,content_text=?,extraction_status=?,extraction_reason=?,content_hash=?,fetched_at=?,canonical_url=?,hash_version=?,canonical_reason=? WHERE id=? AND (content_text IS NULL OR ? IS NOT NULL)")) {
                    p.setString(1,document.contentHash());p.setString(2,document.contentHash());p.setString(3,document.content().text());p.setString(4,document.content().status());p.setString(5,Objects.toString(document.content().reason(),""));p.setString(6,document.contentHash());p.setString(7,document.fetchedAt());p.setString(8,document.content().canonicalUrl());p.setString(9,document.contentHash()==null?null:"jsoup-text-v1");p.setString(10,new UrlNormalizer().canonicalReason(hit.url(),document.content().canonicalUrl()));p.setLong(11,documentId);p.setString(12,document.content().text());p.executeUpdate();
                }
                matcher.refreshCandidates(c,documentId);
                try(PreparedStatement p=c.prepareStatement("INSERT INTO search_hit(run_id,document_id,rank,snippet,retrieved_at) VALUES(?,?,?,?,?) ON CONFLICT(run_id,document_id) DO NOTHING")) {
                    p.setLong(1,run.runId()); p.setLong(2,documentId); p.setInt(3,hit.rank()); p.setString(4,hit.snippet()); p.setString(5,Instant.now().toString()); p.executeUpdate();
                }
            }
            failures=0;
            try(var p=c.prepareStatement("SELECT COUNT(*) FROM search_hit h JOIN document d ON d.id=h.document_id WHERE h.run_id=? AND d.extraction_status IN ('FAILED','BLOCKED')")) {
                p.setLong(1,run.runId());try(var r=p.executeQuery()){r.next();failures=r.getInt(1);}
            }
            try(PreparedStatement p=c.prepareStatement("UPDATE search_run SET status=?,failure_count=?,discovered_count=?,processed_count=(SELECT COUNT(*) FROM search_hit WHERE run_id=?),finished_at=? WHERE id=? AND status='RUNNING'")) {
                p.setString(1,failures>0?"PARTIAL":"SUCCEEDED");p.setInt(2,failures);p.setInt(3,documents.size()); p.setLong(4,run.runId()); p.setString(5,Instant.now().toString()); p.setLong(6,run.runId()); p.executeUpdate();
            } return null;
        });
    }
    public Page results(long id,int page,int size) {
        get(id);
        return db.read(c -> {
            long count;
            try(PreparedStatement p=c.prepareStatement("SELECT COUNT(*) FROM search_hit WHERE run_id=?")) {
                p.setLong(1,id); try(ResultSet r=p.executeQuery()) { r.next(); count=r.getLong(1); }
            }
            List<Card> items=new ArrayList<>();
            try(PreparedStatement p=c.prepareStatement("SELECT d.*,h.snippet,h.rank,h.retrieved_at,(SELECT count(*) FROM document_duplicate_candidate dc WHERE dc.left_id=d.id OR dc.right_id=d.id) candidate_count"+READING_COLUMNS+" FROM search_hit h JOIN document d ON d.id=h.document_id WHERE h.run_id=? ORDER BY h.rank,h.id LIMIT ? OFFSET ?")) {
                p.setLong(1,id); p.setInt(2,size); p.setLong(3,(long)page*size);
                try(ResultSet r=p.executeQuery()) { while(r.next()) items.add(card(r)); }
            } return new Page(items,count,page,size);
        });
    }
    public static Card card(ResultSet r) throws SQLException {
        String domain;
        try { domain=java.net.URI.create(r.getString("original_url")).getHost(); } catch(Exception e) { domain="미상"; }
        return new Card(r.getLong("id"),r.getString("title"),r.getString("original_url"),r.getString("snippet"),r.getInt("rank"),r.getString("source_type"),r.getString("classification_reason"),r.getString("published_at"),r.getBoolean("synthetic"),r.getString("extraction_status"),r.getString("extraction_reason"),r.getString("content_text"),r.getString("fetched_at"),r.getString("classified_at"),domain,r.getString("retrieved_at"),r.getInt("content_version"),r.getInt("candidate_count"),r.getString("read_status"),r.getBoolean("saved"),r.getBoolean("favorite"),r.getBoolean("read_later"));
    }
    public Card document(long id) {
        return db.read(c -> { try(PreparedStatement p=c.prepareStatement("SELECT d.*,h.snippet,h.rank,h.retrieved_at,(SELECT count(*) FROM document_duplicate_candidate dc WHERE dc.left_id=d.id OR dc.right_id=d.id) candidate_count"+READING_COLUMNS+" FROM document d JOIN search_hit h ON h.document_id=d.id WHERE d.id=? ORDER BY h.id DESC LIMIT 1")) {
            p.setLong(1,id); try(ResultSet r=p.executeQuery()) { if(!r.next()) throw new ApiException(404,"DOCUMENT_NOT_FOUND","자료를 찾을 수 없습니다."); return card(r); }
        }});
    }
    public void applyReview(long id,DocumentService.Ingested reviewed) {
        db.write(c -> {
            try(PreparedStatement p=c.prepareStatement("SELECT original_url,content_text FROM document WHERE id=?")) {
                p.setLong(1,id);try(ResultSet r=p.executeQuery()) {
                    if(!r.next()) throw new ApiException(404,"DOCUMENT_NOT_FOUND","자료를 찾을 수 없습니다.");
                    if(!Objects.equals(r.getString(1),reviewed.hit().url())) throw new ApiException(409,"DOCUMENT_CHANGED","자료 주소가 변경되었습니다.");
                    if(r.getString(2)!=null) throw new ApiException(409,"CONTENT_EXISTS","기존 본문이 있어 재처리 도구로 덮어쓰지 않습니다.");
                }
            }
            try(PreparedStatement p=c.prepareStatement("UPDATE document SET source_type=?,classification_reason=?,classified_at=?,extraction_status=?,extraction_reason=?,content_text=?,content_hash=?,fetched_at=COALESCE(?,fetched_at),published_at=COALESCE(?,published_at),canonical_url=COALESCE(?,canonical_url) WHERE id=?")) {
                p.setString(1,reviewed.classification().type());p.setString(2,reviewed.classification().reason());p.setString(3,reviewed.classification().checkedAt());
                p.setString(4,reviewed.content().status());p.setString(5,Objects.toString(reviewed.content().reason(),""));p.setString(6,reviewed.content().text());p.setString(7,reviewed.contentHash());
                p.setString(8,reviewed.fetchedAt());p.setString(9,reviewed.content().publishedAt());p.setString(10,reviewed.content().canonicalUrl());p.setLong(11,id);p.executeUpdate();
            }
            // Original hits, titles, snippets, ranks and request keys are untouched.
            try(var p=c.prepareStatement("UPDATE document SET hash_version=CASE WHEN content_hash IS NULL THEN NULL ELSE 'jsoup-text-v1' END,canonical_reason=? WHERE id=?")) {
                p.setString(1,new UrlNormalizer().canonicalReason(reviewed.hit().url(),reviewed.content().canonicalUrl()));p.setLong(2,id);p.executeUpdate();
            }
            matcher.refreshCandidates(c,id);
            try(PreparedStatement p=c.prepareStatement("UPDATE search_run SET failure_count=(SELECT COUNT(*) FROM search_hit h JOIN document d ON d.id=h.document_id WHERE h.run_id=search_run.id AND d.extraction_status IN ('FAILED','BLOCKED')), status=CASE WHEN EXISTS(SELECT 1 FROM search_hit h JOIN document d ON d.id=h.document_id WHERE h.run_id=search_run.id AND d.extraction_status IN ('FAILED','BLOCKED')) THEN 'PARTIAL' ELSE 'SUCCEEDED' END WHERE id IN (SELECT run_id FROM search_hit WHERE document_id=?) AND status IN ('SUCCEEDED','PARTIAL')")) {
                p.setLong(1,id);p.executeUpdate();
            }
            return null;
        });
    }
}
