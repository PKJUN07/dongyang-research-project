package kr.ac.dongyang.researchboard.document;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Pure comparison rules, not an authorization or DNS-safety check. */
public final class UrlNormalizer {
    public static final String VERSION="url-v1";
    private static final Set<String> TRACKING=Set.of("utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","gclid","fbclid","msclkid");
    public String normalize(String raw) {
        URI uri=URI.create(raw);
        String scheme=Objects.toString(uri.getScheme(),"").toLowerCase(Locale.ROOT);
        if(!Set.of("http","https").contains(scheme) || uri.getHost()==null || uri.getRawUserInfo()!=null)
            throw new IllegalArgumentException("Invalid comparison URL");
        int port=uri.getPort();
        String authority=uri.getHost().toLowerCase(Locale.ROOT);
        if(port!=-1 && !(scheme.equals("http") && port==80) && !(scheme.equals("https") && port==443)) authority+=":"+port;
        String path=uri.getRawPath();
        if(path==null || path.isEmpty()) path="/";
        List<String> kept=new ArrayList<>();
        boolean signed=false;
        if(uri.getRawQuery()!=null) for(String part:uri.getRawQuery().split("&",-1)) {
            String key=URLDecoder.decode(part.split("=",2)[0],StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
            if(Set.of("signature","sig","x-amz-signature","x-goog-signature","token").contains(key)) signed=true;
        }
        if(uri.getRawQuery()!=null) for(String part:uri.getRawQuery().split("&",-1)) {
            String key=part.split("=",2)[0];
            // An empty query component may be significant. Preserve order and raw encoding.
            if(signed || !TRACKING.contains(URLDecoder.decode(key,StandardCharsets.UTF_8).toLowerCase(Locale.ROOT))) kept.add(part);
        }
        return scheme+"://"+authority+path+(kept.isEmpty()?"":"?"+String.join("&",kept));
    }
    public String canonicalReason(String original,String canonical) {
        if(canonical==null || canonical.isBlank()) return "NOT_PROVIDED";
        try {
            URI source=URI.create(normalize(original)), target=URI.create(normalize(canonical));
            if(!Objects.equals(source.getHost(),target.getHost()) || !Objects.equals(source.getScheme(),target.getScheme()) || source.getPort()!=target.getPort()) return "REJECTED_CROSS_ORIGIN";
            if(target.getRawPath().equals("/") && !source.getRawPath().equals("/")) return "REJECTED_HOME_CANONICAL";
            return normalize(original).equals(normalize(canonical))?"SAME_COMPARISON_KEY":"HINT_ONLY_NOT_MERGED";
        } catch(Exception e) { return "REJECTED_INVALID_CANONICAL"; }
    }
}
