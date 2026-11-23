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
            Element main=doc.select("article,main").stream().max(Comparator.comparingInt(e->e.text().length())).orElse(null);
            if(main==null || main.text().strip().length()<80) return new Content("METADATA_ONLY","NO_READABLE_BODY",null,date,canonical);
            String text=main.wholeText().replace('\u00a0',' ').replaceAll("[\\t\\x0B\\f ]+"," ").replaceAll("\\n[ \\n]+","\n").strip();
            if(text.length()>100_000) return new Content("FAILED","TEXT_TOO_LARGE",null,date,canonical);
            return new Content("SUCCESS",null,text,date,canonical);
        } catch(Exception e) { return new Content("FAILED","PARSE_FAILED",null,null,null); }
    }
    static String parseDate(String value) {
        try { return OffsetDateTime.parse(value).toString(); } catch(Exception ignored) {
            try { return LocalDate.parse(value).toString(); } catch(Exception missing) { return null; }
        }
    }
}
