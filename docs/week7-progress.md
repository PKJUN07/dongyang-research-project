# 7주차 진행도

2026-10-28 기준, 계획서 7주차 범위 구현·검증 완료.

| 항목 | 상태 | 근거 |
|---|---|---|
| 독립 읽기·보관·즐겨찾기·나중에 읽기 | 완료 | 부분 PATCH, 타입·null 검증, 목록/상세 갱신 |
| 일반 텍스트 메모 | 완료 | 수동 저장, version 비교, 409, 20,000자 제한 |
| 실패·충돌 UI | 완료 | draft 유지/복원, 재시도, 서버/내 입력 선택 |
| 보관함·주제 연결 | 완료 | saved=true, 공통 필터/왕복, 복수 주제 해제 시 기록 유지 |
| 회귀·보존 검증 | 완료 | 자동45건, 브라우저7그룹, 프로세스재시작, 원본복사본지문동일 |

## 확인 화면

- [저장 자료](http://127.0.0.1:5178/documents)
- [읽기 보관함](http://127.0.0.1:5178/library)

미리보기 DB는 `C:/Users/USER/Documents/ChatGPT/동미대 리서치 보드/output/week7-preview.db`이다. 기존 실제 자료 17건의 복사본이며 보관·메모 저장도 여기에 남는다. backend/data의 원본 DB에는 자동 반영되지 않는다. 원본 적용 전에는 실행 중인 원본 서버를 정상 종료하고 일관된 백업을 만든 후 같은 DB 경로로 새 JAR를 재시작한다. 키는 기존 서버 환경변수/가려진 입력 방식으로 준비하고 누적 검색 예산을 초기화하지 않는다.

현재 미리보기는 fake 모드, 외부 검색 승인 false다. 기존 실제 자료 조회와 사용자 기록 저장은 가능하다. 새로운 실제 검색을 수행한 것으로 해석하지 않는다.

## 다시 검증하기

백엔드 폴더에서 `mvnw.cmd test package`, 프론트 폴더에서 `npm run build`와 `npm run lint`를 실행한다.

브라우저 시험 스크립트는 `frontend/tests/week7.mjs`. Playwright와 Edge가 필요하며, 반드시 별도의 fake 서버/빈 시험 DB를 지정한다. `RESEARCH_TEST_URL`은 그 서버를 프록시하는 Vite 주소, `RESEARCH_TEST_OUTPUT`은 출력 폴더, 필요시 `RESEARCH_TEST_NODE_MODULES`는 Playwright가 설치된 node_modules 경로다. 기본 시험 URL은 5177이며 사용자 DB를 대상으로 실행하지 않는다.

[구현 계약](week7-contract.md), [검증 기록](week7-verification.md). 다음은 8주차 통계와 작업 이력이다.
