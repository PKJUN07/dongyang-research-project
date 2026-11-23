package kr.ac.dongyang.researchboard.document;

import java.sql.*;
import java.util.*;
import org.springframework.stereotype.Repository;
import kr.ac.dongyang.researchboard.common.*;
import kr.ac.dongyang.researchboard.search.SearchRepository;

@Repository
public class DocumentRepository {
    private final Database db;
    public DocumentRepository(Database db) { this.db=db; }
    private static final String COLUMNS="d.*,h.snippet,h.rank,h.retrieved_at,(SELECT count(*) FROM document_duplicate_candidate dc WHERE dc.left_id=d.id OR dc.right_id=d.id) candidate_count"+SearchRepository.READING_COLUMNS;
    private static void bind(PreparedStatement p,List<Object> args) throws SQLException { for(int i=0;i<args.size();i++) p.setObject(i+1,args.get(i)); }
    public SearchRepository.Page findPage(DocumentFilter f,Long runId) {
        if(runId!=null) db.read(c->{try(var p=c.prepareStatement("SELECT 1 FROM search_run WHERE id=?")){p.setLong(1,runId);try(var r=p.executeQuery()){if(!r.next()) throw new ApiException(404,"RUN_NOT_FOUND","검색 작업을 찾을 수 없습니다.");}}return null;});
        List<Object> args=new ArrayList<>();
        String join=" FROM document d JOIN search_hit h ON h.document_id=d.id";
        String where;
        if(runId!=null) {where=" WHERE h.run_id=?";args.add(runId);}
        else where=" WHERE h.id=(SELECT max(last.id) FROM search_hit last WHERE last.document_id=d.id)";
        if(f.synthetic()!=null){where+=" AND d.synthetic=?";args.add(f.synthetic()?1:0);}
        if(f.topicId()!=null) {where+=" AND EXISTS(SELECT 1 FROM document_topic dt WHERE dt.document_id=d.id AND dt.active=1 AND dt.topic_id=?)";args.add(f.topicId());}
        if(!f.readingStatus().equals("ALL")){where+=" AND COALESCE((SELECT read_status FROM reading_state WHERE document_id=d.id),'UNREAD')=?";args.add(f.readingStatus());}
        Boolean[] flags={f.saved(),f.favorite(),f.readLater()};String[] names={"saved","favorite","read_later"};
        for(int i=0;i<flags.length;i++)if(flags[i]!=null){where+=" AND COALESCE((SELECT "+names[i]+" FROM reading_state WHERE document_id=d.id),0)=?";args.add(flags[i]?1:0);}
        if(!f.sourceType().equals("ALL")) {where+=" AND d.source_type=?";args.add(f.sourceType());}
        if(!f.title().isEmpty()) {where+=" AND d.title LIKE ? ESCAPE '\\'";args.add("%"+f.title().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%");}
        if(!f.from().isEmpty() || !f.to().isEmpty()) {
            String date=switch(f.dateBasis()){case "PUBLISHED" -> "substr(d.published_at,1,10)";case "FIRST_SAVED" -> "date((SELECT retrieved_at FROM search_hit first WHERE first.document_id=d.id ORDER BY first.id LIMIT 1),'+9 hours')";default -> "date(h.retrieved_at,'+9 hours')";};
            List<String> bounds=new ArrayList<>();
            if(!f.from().isEmpty()) {bounds.add(date+">=?");args.add(f.from());}
            if(!f.to().isEmpty()) {bounds.add(date+"<=?");args.add(f.to());}
            where+=" AND ("+String.join(" AND ",bounds)+(f.includeUnknown()?" OR "+date+" IS NULL":"")+")";
        }
        // Only fixed SQL fragments are selected; caller text is never ORDER BY SQL.
        String order=switch(f.sort()) {
            case "PUBLISHED_DESC" -> "d.published_at IS NULL,substr(d.published_at,1,10) DESC,d.id DESC";
            case "TITLE_ASC" -> "d.title COLLATE NOCASE,d.id";
            case "RANK" -> "h.rank,d.id";
            default -> "julianday(h.retrieved_at) DESC,d.id DESC";
        };
        final String queryWhere=where;
        return db.read(c->{
            c.setAutoCommit(false);
            try {
                long count;
                try(var p=c.prepareStatement("SELECT count(*)"+join+queryWhere)) {bind(p,args);try(var r=p.executeQuery()){r.next();count=r.getLong(1);}}
                List<SearchRepository.Card> items=new ArrayList<>();List<Object> pageArgs=new ArrayList<>(args);pageArgs.add(f.size());pageArgs.add((long)f.page()*f.size());
                try(var p=c.prepareStatement("SELECT "+COLUMNS+join+queryWhere+" ORDER BY "+order+" LIMIT ? OFFSET ?")) {
                    bind(p,pageArgs);try(var r=p.executeQuery()){while(r.next()) items.add(SearchRepository.card(r));}
                }
                c.commit();return new SearchRepository.Page(items,count,f.page(),f.size());
            } catch(SQLException | RuntimeException e) {c.rollback();throw e;}
        });
    }
    public SearchRepository.Card findDetail(long id,Long runId) {
        return db.read(c->{try(var p=c.prepareStatement("SELECT "+COLUMNS+" FROM document d JOIN search_hit h ON h.document_id=d.id WHERE d.id=?"+(runId==null?"":" AND h.run_id=?")+" ORDER BY h.id DESC LIMIT 1")) {
            p.setLong(1,id);if(runId!=null)p.setLong(2,runId);
            try(var r=p.executeQuery()){if(!r.next()) throw new ApiException(404,"DOCUMENT_NOT_FOUND","자료를 찾을 수 없습니다.");return SearchRepository.card(r);}
        }});
    }
}
