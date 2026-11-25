package kr.ac.dongyang.researchboard.document;
import java.io.ByteArrayInputStream;
import java.time.*;
import java.util.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;
@Component
public class ContentExtractor {
    public record Content(String status,String reason,String text,String publishedAt,String canonicalUrl) {}
    public Content extract(byte[] body,String contentType,String url) {
        try {
            String charset=null;
            var m=java.util.regex.Pattern.compile("charset=[\"']?([^;\\s\"']+)",java.util.regex.Pattern.CASE_INSENSITIVE).matcher(contentType);
            if(m.find()) charset=m.group(1);
            var doc=Jsoup.parse(new ByteArrayInputStream(body),charset,url);
            if(!doc.select("input[type=password]").isEmpty() || doc.select("script[type=application/ld+json]").stream().anyMatch(e->e.data().matches("(?s).*\"isAccessibleForFree\"\\s*:\\s*(false|\"false\").*")))
                return new Content("BLOCKED","LOGIN_OR_PAYWALL",null,null,null);
            String date=null;
            Element published=doc.selectFirst("meta[property=article:published_time], meta[name=date], time[datetime]");
            if(published!=null) date=parseDate(published.hasAttr("content")?published.attr("content"):published.attr("datetime"));
            String canonical=null;Element link=doc.selectFirst("link[rel=canonical]");
            if(link!=null) { String value=link.absUrl("href"); if(kr.ac.dongyang.researchboard.provider.SerperSearchProvider.safeUrl(value)) canonical=value; }
            doc.select("script,style,nav,header,footer,aside,form,iframe,noscript,[hidden],.advertisement,.ads,.menu").remove();
            doc.select("[role=navigation],[role=banner],[role=contentinfo],[role=complementary],.comment,.comments,#comment,#comments,.reply,.related,.recommend,.share,.sns,.breadcrumb,.pagination,.footer,.header,.gnb,.lnb,.sidebar").remove();
            Element main=doc.select("article,main,[itemprop=articleBody],[role=main]").stream().max(Comparator.comparingInt(e->e.text().length())).orElse(null);
            // article/main 표시가 없는 사이트(게시판·커뮤니티 등)는 글자 밀도가 가장 높은 영역을 본문으로 고른다.
            if(main==null || main.text().strip().length()<200) { Element dense=densest(doc.body()); if(dense!=null && (main==null || dense.text().length()>main.text().length())) main=dense; }
            if(main==null || main.text().strip().length()<80) return new Content("METADATA_ONLY","NO_READABLE_BODY",null,date,canonical);
            String text=main.wholeText().replace('\u00a0',' ').replaceAll("[\\t\\x0B\\f ]+"," ").replaceAll("\\n[ \\n]+","\n").strip();
            if(text.length()>100_000) return new Content("FAILED","TEXT_TOO_LARGE",null,date,canonical);
            return new Content("SUCCESS",null,text,date,canonical);
        } catch(Exception e) { return new Content("FAILED","PARSE_FAILED",null,null,null); }
    }
    /** 링크 비율이 낮고 글자가 많은 영역. 본문 전체를 품은 자식이 있으면 그 자식으로 좁혀 들어간다. */
    public static Element densest(Element body) {
        if(body==null) return null;
        Element current=body;double score=score(body);
        if(score<200) return null;
        while(true) {
            Element next=null;double nextScore=0;
            for(Element child:current.children()) { double s=score(child); if(s>nextScore) { nextScore=s;next=child; } }
            if(next==null || nextScore<score*0.6) return current;
            current=next;score=nextScore;
        }
    }
    private static double score(Element e) {
        int text=e.text().length();if(text==0) return 0;
        int links=e.select("a").stream().mapToInt(a->a.text().length()).sum();
        double linkDensity=Math.min(1.0,(double)links/text);
        return text*(1-linkDensity)*(1-linkDensity);
    }
    static String parseDate(String value) {
        try { return OffsetDateTime.parse(value).toString(); } catch(Exception ignored) {
            try { return LocalDate.parse(value).toString(); } catch(Exception missing) { return null; }
        }
    }
}
