# 1주차 검증 결과

검증일: 2026-09-21

## 자동 검증

| 대상 | 명령 | 결과 |
| --- | --- | --- |
| 프론트 TypeScript | `node_modules/.bin/tsc.cmd -b` | 통과 |
| 프론트 프로덕션 빌드 | `node_modules/.bin/vite.cmd build` | 통과, 79 modules transformed |
| 프론트 린트 | `node_modules/.bin/eslint.cmd .` | 통과 |
| 백엔드 테스트 | Apache Maven 3.9.16 `mvn -q test` | 통과, 테스트 2건 |
| 상태 API | `GET http://127.0.0.1:8080/api/health` | HTTP 200, `status=UP` |

## 브라우저 검증

| 항목 | 결과 |
| --- | --- |
| `/search` 데스크톱 레이아웃 | 통과 |
| 긴 한글 제목 줄바꿈 | 통과 |
| 합성 데이터 표시 | 통과 |
| 첫 카드에서 상세 경로 이동 | 통과 |
| `/documents/official-long-horizon` 새로고침 | 통과 |
| 390 × 844 모바일 레이아웃 | 통과 |
| 검색 폼 세로 배치 | 통과 |

## 확인한 실제 상태 API 응답

```json
{
  "status": "UP",
  "service": "research-board-backend",
  "checkedAt": "2026-09-21T02:02:41.117144900Z"
}
```

## 아직 검증하지 않은 항목

- Serper 실제 검색 요청
- 실제 검색 결과의 한국어 품질과 누락 필드
- 공개 페이지 본문 추출 가능성
- SQLite 연결과 재시작 후 데이터 보존
- Ollama 설치와 분석 품질

이 항목은 1주차 완료 기준에서 미검증 이유를 기록하면 되는 범위이며, 이후 주차의 실제 연동 완료를 의미하지 않는다.
