package kr.ac.dongyang.researchboard.provider;
import java.util.List;
public interface SearchProvider {
    record Query(String query, String language, String region, int page, int limit) {}
    record Hit(String title, String url, String snippet, int rank) {}
    record Batch(List<Hit> hits,int rawCount,int excludedCount) {}
    default Batch searchBatch(Query query) { var hits=search(query);return new Batch(hits,hits.size(),0); }
    String name();
    boolean synthetic();
    List<Hit> search(Query query);
}
