package kr.ac.dongyang.researchboard.health;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

class HealthControllerTest {

    @Test
    void returnsUpStatus() {
        HealthResponse response = new HealthController().health();

        assertEquals("UP", response.status());
        assertEquals("research-board-backend", response.service());
        assertNotNull(response.checkedAt());
    }

    @Test
    void exposesTheExpectedRoute() throws NoSuchMethodException {
        RequestMapping classMapping = HealthController.class.getAnnotation(RequestMapping.class);
        GetMapping methodMapping = HealthController.class
            .getMethod("health")
            .getAnnotation(GetMapping.class);

        assertEquals("/api/health", classMapping.value()[0]);
        assertNotNull(methodMapping);
    }
}
