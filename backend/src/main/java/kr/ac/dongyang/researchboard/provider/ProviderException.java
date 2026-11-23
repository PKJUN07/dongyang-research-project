package kr.ac.dongyang.researchboard.provider;
public class ProviderException extends RuntimeException {
    public final String code;
    public ProviderException(String code) { super(code); this.code=code; }
}
