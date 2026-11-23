package kr.ac.dongyang.researchboard.document;
import java.net.*;
import java.util.*;
import org.springframework.stereotype.Component;
@Component
public class UrlSafety {
    public static class UnsafeUrl extends RuntimeException { public UnsafeUrl() { super("UNSAFE_URL"); } }
    public URI validate(String value) {
        try {
            URI uri=URI.create(value).normalize();
            if(value.length()>4096 || !Set.of("http","https").contains(uri.getScheme()) || uri.getHost()==null || uri.getUserInfo()!=null) throw new UnsafeUrl();
            int port=uri.getPort();
            if(port!=-1 && port!=(uri.getScheme().equals("https")?443:80)) throw new UnsafeUrl();
            String host=uri.getHost().toLowerCase(Locale.ROOT);
            String rawPath=Objects.toString(uri.getRawPath(),"").toLowerCase(Locale.ROOT);
            if(rawPath.contains("%2e") || rawPath.contains("%2f") || rawPath.contains("%5c") || rawPath.contains("%25")) throw new UnsafeUrl();
            if(host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".") || !host.contains(".") && !host.contains(":")) throw new UnsafeUrl();
            if((host.matches("[0-9.]+") || host.contains(":")) && !isPublic(InetAddress.getByName(host))) throw new UnsafeUrl();
            return uri;
        } catch(Exception e) { throw new UnsafeUrl(); }
    }
    public InetAddress[] resolve(URI uri) throws UnknownHostException {
        InetAddress[] addresses=InetAddress.getAllByName(uri.getHost());
        if(addresses.length==0) throw new UnsafeUrl();
        for(InetAddress address:addresses) if(!isPublic(address)) throw new UnsafeUrl();
        return addresses;
    }
    public boolean isPublic(InetAddress address) {
        if(address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] b=address.getAddress(); int a=b[0]&255, second=b[1]&255;
        if(b.length==4) {
            return !(a==0 || a==10 || a==127 || a>=224 || a==100 && second>=64 && second<=127
                || a==169 && second==254 || a==172 && second>=16 && second<=31
                || a==192 && (second==168 || second==0 || second==2)
                || a==198 && (second==18 || second==19 || second==51 && (b[2]&255)==100)
                || a==203 && second==0 && (b[2]&255)==113);
        }
        // Only native global unicast IPv6; exclude documentation and transition networks.
        if((a & 0xe0)!=0x20) return false;
        if(a==0x20 && second==0x02) return false;
        if(a==0x20 && second==0x01 && ((b[2]&255)==0 || (b[2]&255)==0x0d && (b[3]&255)==0xb8)) return false;
        return !(a==0x3f && second==0xff);
    }
}
