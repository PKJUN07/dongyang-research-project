package kr.ac.dongyang.researchboard.document;

import java.time.LocalDate;
import java.util.Set;
import java.util.Map;
import kr.ac.dongyang.researchboard.common.ApiException;

public record DocumentFilter(Long topicId,String sourceType,String title,String dateBasis,String from,String to,
        String sort,Integer page,Integer size,Boolean includeUnknown,String readingStatus,Boolean saved,Boolean favorite,Boolean readLater,Boolean synthetic) {
    public DocumentFilter(Long topicId,String sourceType,String title,String dateBasis,String from,String to,String sort,Integer page,Integer size,Boolean includeUnknown,String readingStatus,Boolean saved,Boolean favorite,Boolean readLater){this(topicId,sourceType,title,dateBasis,from,to,sort,page,size,includeUnknown,readingStatus,saved,favorite,readLater,null);}
    public DocumentFilter(Long topicId,String sourceType,String title,String dateBasis,String from,String to,String sort,Integer page,Integer size,Boolean includeUnknown,String readingStatus){this(topicId,sourceType,title,dateBasis,from,to,sort,page,size,includeUnknown,readingStatus,null,null,null);}
    private static Boolean flag(Map<String,String> values,String key){String v=values.get(key);if(v==null)return null;if(!Set.of("true","false").contains(v))throw new IllegalArgumentException();return Boolean.valueOf(v);}
    public static DocumentFilter parse(Map<String,String> values) {
        try {
            String unknown=values.get("includeUnknown");
            if(unknown!=null && !Set.of("true","false").contains(unknown)) throw new IllegalArgumentException();
            return new DocumentFilter(values.containsKey("topicId")?Long.valueOf(values.get("topicId")):null,
                values.get("sourceType"),values.get("title"),values.get("dateBasis"),values.get("from"),values.get("to"),values.get("sort"),
                values.containsKey("page")?Integer.valueOf(values.get("page")):null,values.containsKey("size")?Integer.valueOf(values.get("size")):null,
                unknown==null?null:Boolean.valueOf(unknown),values.get("readingStatus"),flag(values,"saved"),flag(values,"favorite"),flag(values,"readLater"),flag(values,"synthetic"));
        } catch(ApiException e) {throw e;} catch(IllegalArgumentException e) {throw new ApiException(400,"INVALID_FILTER","필터의 숫자·논리값 형식을 확인하세요.");}
    }
    public DocumentFilter {
        sourceType=sourceType==null?"ALL":sourceType;
        title=title==null?"":title.strip();dateBasis=dateBasis==null?"PUBLISHED":dateBasis;
        from=from==null?"":from;to=to==null?"":to;sort=sort==null?"RANK":sort;
        page=page==null?0:page;size=size==null?20:size;includeUnknown=includeUnknown==null?false:includeUnknown;
        readingStatus=readingStatus==null?"ALL":readingStatus;
        if(topicId!=null && topicId<=0 || !Set.of("ALL","OFFICIAL","USER","OTHER").contains(sourceType)
                || !Set.of("PUBLISHED","FETCHED","FIRST_SAVED").contains(dateBasis) || !Set.of("FETCHED_DESC","PUBLISHED_DESC","TITLE_ASC","RANK").contains(sort)
                || title.length()>200 || page<0 || page>1_000_000 || size<1 || size>100 || !Set.of("ALL","UNREAD","READING","READ").contains(readingStatus))
            throw new ApiException(400,"INVALID_FILTER","필터·정렬·페이지 범위를 확인하세요.");
        try { if(!from.isEmpty()) LocalDate.parse(from);if(!to.isEmpty()) LocalDate.parse(to);
            if(!from.isEmpty() && !to.isEmpty() && LocalDate.parse(from).isAfter(LocalDate.parse(to))) throw new IllegalArgumentException();
        } catch(Exception e) { throw new ApiException(400,"INVALID_DATE_RANGE","시작일과 종료일을 확인하세요."); }
    }
}
