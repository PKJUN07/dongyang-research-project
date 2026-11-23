# 9주차 AI 없는 핵심 흐름 통합 검증

2026-11-09. 9/14를 1주차 시작으로 잡은 일정에서 9주차는 11/9~15이다. 시작 전 8주차까지 완료되어 있었다.

## 변경과 완료 판정

- 검색 실패 시 보관함·저장 자료 바로가기와 기존 기록 이용 안내 추가.
- 실제 SQLite BUSY/LOCKED는 HTTP503 DATABASE_BUSY로 반환하고 ‘다른 저장 작업이 진행 중, 입력 유지, 다시 저장’ 안내 제공. 인증값이나 DB 경로를 노출하지 않는다.
- 설치·실행·종료·재시작·DB 경로·키 없는 동작은 `week9-runbook.md`에 작성하고 새 폴더에서 검증.
- AI가 false인 실제 서버에서 검색→출처→상세→보관→메모→읽음→통계→서버 프로세스 재시작→보관함 복원 완료.

## 새 설치 검증 환경

소스를 작업 공간 `output/week9-clean`에 복사했다. backend target/data 및 frontend node_modules, 기존 DB, .env는 복사하지 않았다. Maven/npm 캐시는 이 PC의 기존 캐시를 사용할 수 있다. 새 PC 전체 설치까지 검증했다고 표현하지 않는다. JDK25.0.1, Node22.17.0, Windows, Edge headless 사용.

새 폴더 backend에서 `mvnw.cmd test package`, frontend에서 `npm ci`, `npm run build`, `npm run lint`를 실행했다. 모두 exit0. 전체 JUnit 54건 실패0/오류0(기존53+DatabaseLockTest1). 의존성 설치 audit는 기존 개발도구 항목을 포함하며 이번 범위에서 강제 업데이트하지 않았다.

fake, EXTERNAL_SEARCH_APPROVED=false, 빈 출처 정책, aiEnabled=false. 별도 DB `output/week9-clean/runtime/research.db`, backend18089, frontend5179. 실제 Serper 추가 호출0. 다른 Ollama 프로세스는 종료하지 않았다.

## 브라우저 관측 결과

`frontend/tests/week9.mjs`의 첫 실행 6개 그룹:

1. UI에서 주제 생성, 검색 POST를 1초 지연, 두 번 클릭했을 때 POST는1회. 처리 중 버튼 표시.
2. 출처 근거 확인→보관→줄바꿈 메모 수동 저장→읽음 상태 변경.
3. Python의 별도 SQLite 연결에서 BEGIN IMMEDIATE로 실제 쓰기 잠금. 브라우저 메모 저장은503 안내, 입력은 그대로, DB 원본은 그대로. 잠금 해제 후 같은 입력 저장 성공.
4. 읽음·보관이 통계에 반영되고 KPI에서 같은 조건 보관함 이동.
5. 합성 검색 제공자 실패 후 보관함 바로가기 이용, 기존 메모 보존.
6. 목록 요청 연결 실패를 브라우저에서 주입해 실패 안내·명시적 재시도 후 복구. 390px 모바일 가로 넘침 없음.

서버 PID3436을 종료하고 같은 DB로 새 프로세스를 시작했다. `--after-restart` 실행 1개 그룹 통과: 저장된 메모 문자열, saved=true, 보관함 상세, 통계 모두 유지. 이는 실제 프로세스 재시작이며 페이지 새로고침만으로 대신하지 않았다.

새 환경에서 기존 week7.mjs 7그룹(긴 메모·500실패·두탭409·보관해제·주제 연결·모바일), week8.mjs 6그룹(통계·KPI 왕복·표·모바일·빈 범위·재시도)도 통과. 모든 브라우저 결과 pageErrors=[].

테스트 초기에 화면 정렬과 API 기본 순위가 달라 다른 문서 상태를 비교하는 스크립트 오류가 발생했다. 화면에서 실제 선택한 링크의 ID를 사용하도록 수정 후 재검증했다. 사용자 데이터 손상은 없었다.

## 증거 경로

작업 공간 `C:/Users/USER/Documents/ChatGPT/동미대 리서치 보드/output/` 아래:

- week9-backend-test.log, week9-npm-ci.log, week9-build.log, week9-lint.log
- week9-browser/results.json, restart-results.json, state.json
- week9-browser/real-db-lock.png, library-mobile.png, after-restart.png
- week9-regression/results.json, week9-stats-regression/results.json
- week9-server.log, week9-restart-server.log
- week9-preservation.json

## 사용자 미리보기 보존

기존 preview DB를 SQLite backup API로 `output/week9-preview-backup.db`에 백업(integrity ok)한 뒤 새 JAR를 연결했다. schema 변경 없음. 전후 전체 행 비교로 topic2/document19/search_run3/search_hit19/document_topic19/provider_budget1 동일. 읽기·메모는 기존0행이며 비어 있지 않은 사용자 기록 보존은 별도 통합·회귀 테스트에서 검증했다. 원본 backend/data DB와8080 서버는 수정·종료하지 않았다.

현재 미리보기5178→18088, fake/AI false, HTTP200, 자료19건 확인. 미리보기 DB는 `output/week7-preview.db`를 이어 쓰며 원본으로 자동 반영되지 않는다.

## 한계와 다음 선행 조건

로컬 HTTP 연결 실패를 주입한 시험이며 PC 전체 네트워크 장비 장애 시험은 아니다. 외부 인터넷이 없어도 로컬 서버의 저장 자료는 이용 가능하지만 새 실제 검색은 불가능하다. 실제 검색의 새 스모크나 AI 품질을 검증한 것은 아니다. 백업 복원 종합·성능 실측·최종 보안 검증은12주차 범위다.

10주차(11/16~22)는 Ollama 구조화 출력과 큐·실패 복구, 11주차는 근거 검사와 요약 화면이다. AI 없이 핵심 흐름이 통과했으므로 계획의 AI 선행 게이트를 충족했다.
