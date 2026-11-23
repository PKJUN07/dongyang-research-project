package kr.ac.dongyang.researchboard.common;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
@RestControllerAdvice
public class ApiExceptionHandler {
    public record ApiError(String code, String message) {}
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> expected(ApiException e) {
        return ResponseEntity.status(e.status).body(new ApiError(e.code, e.getMessage()));
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ApiError> invalid(Exception e) {
        return ResponseEntity.badRequest().body(new ApiError("INVALID_INPUT", "입력값의 형식과 길이를 확인하세요."));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception e) {
        for(Throwable cause=e;cause!=null;cause=cause.getCause()) {
            if(cause instanceof java.sql.SQLException sql && (sql.getErrorCode()==5 || sql.getErrorCode()==6))
                return ResponseEntity.status(503).body(new ApiError("DATABASE_BUSY", "다른 저장 작업이 진행 중입니다. 입력은 유지되니 잠시 후 다시 저장하세요."));
        }
        return ResponseEntity.internalServerError().body(new ApiError("INTERNAL_ERROR", "처리하지 못했습니다. 잠시 후 다시 시도하세요."));
    }
}
