# ResearchBoard 웹

React·TypeScript·Vite로 검색, 저장 자료, 읽기 보관함, 통계·검색 이력을 제공합니다. 메모는 수동 저장하며 실패 시 입력을 유지합니다. Ollama 기능은 후속 주차 범위입니다.

전체 설치·실행·종료·복구 순서는 [9주차 실행 안내](../docs/week9-runbook.md)를 참고하세요.

```powershell
npm ci
npm run build
npm run lint
$env:RESEARCH_API_TARGET='http://127.0.0.1:18089'
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

API 프록시 기본값은8080입니다. 별도 포트 사용 시 위 환경변수를 실행 전에 지정하세요. 서버 키는 프론트나 VITE 변수에 넣지 않습니다. 사용자 미리보기는5178→18088이며 테스트 서버와 DB는 분리합니다.

브라우저 시험 파일은 `tests/week7.mjs`, `week8.mjs`, `week9.mjs`입니다. Playwright/Edge, 별도 fake 서버와 시험 DB가 필요합니다. 사용자 미리보기 DB에 자동화 쓰기 시험을 실행하지 마세요. 실행 환경변수와 결과는 [9주차 검증](../docs/week9-verification.md)에 기록했습니다.
