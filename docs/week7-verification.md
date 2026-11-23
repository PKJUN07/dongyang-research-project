# 7주차 구현·검증 기록

검증일: 2026-10-28 (한국 시간).

## 구현 범위

단계별 가이드의 7주차 산출물인 상태 API, 메모 API, 보관함, 실패 UI, 기록 보존 테스트를 구현했다. 독립적인 읽기·보관·즐겨찾기·나중에 읽기, 명시적 메모 저장과 버전 충돌 처리, 복수 주제 연결/해제, 보관함 필터와 상세 왕복을 포함한다. 계약은 [week7-contract.md](week7-contract.md) 참조.

## 자동 시험

- backend: `mvnw.cmd -q test package` 종료 코드 0. 최종 총 45건, 실패 0, 오류 0. 기존 38건에 UserRecordsTest 7건 추가. 이전 회차의 테스트 수를 중복 합산하지 않는다.
- 새 시험: 독립 상태·부분 PATCH·필터, 긴 일반 텍스트·줄바꿈·재수집·DB 재열기, 오래된 버전과 빈 메모, 최초 저장 동시 경쟁(성공 하나/409 하나), 복수 주제 해제 후 재수집, 입력 오류·없는 문서, DB 쓰기 실패 롤백.
- 과거 IdentityTest의 임시 user_note 테이블은 실제 7주차 UserRecords API를 사용하도록 전환했다. migration 개수 5와 기본 읽기 UNREAD에 맞춰 기존 기대값을 갱신했다.
- frontend: `npm run build`, `npm run lint` 모두 종료 코드 0. 88개 모듈, JS 323.71 kB, CSS 7.85 kB. 이 수치는 성능 벤치마크가 아니다.

## 브라우저 및 실제 HTTP 시험

`frontend/tests/week7.mjs`를 전용 fake 서버(18087), Vite(5177), 격리 DB `output/week7-test.db`로 실행했다. Edge headless/Playwright의 실제 브라우저와 서버를 사용했으며 외부 검색은 호출하지 않았다. 7개 검증 그룹을 통과했다.

1. HTTP 부분 PATCH, null/타입/길이 검증 400, 없는 문서 404, 오래된 메모 409.
2. 긴 메모·줄바꿈·HTML 문자열 저장과 새로고침 보존. 스크립트 실행 없음.
3. 브라우저에서 메모 PUT에 500 응답을 주입하고 draft 및 서버 기존 내용 보존, 새로고침 후 draft 복원, 재시도 성공 확인. 별도로 JUnit DB 실패 롤백 검증도 수행했다.
4. 두 탭에서 같은 버전으로 서로 다른 메모를 작성. 첫 저장 후 둘째 요청은 409. 서버 내용과 내 draft를 함께 표시한 뒤 명시적 내 입력 저장 성공.
5. 보관함 읽기/즐겨찾기/주제 조건과 상세 왕복 URL 복원. 보관 해제 시 목록에서 제거, 메모와 즐겨찾기는 보존.
6. 주제 체크박스 연결과 해제 후 문서·메모 보존.
7. 390px 상세 화면에서 가로 넘침 없음. 브라우저 런타임 오류 없음. 이는 전체 모바일 기기/접근성 감사는 아니다.

초기 브라우저 시험에서 체크박스 `check()`가 즉시 상태 변경을 기대하여 실패했다. 서버 성공 후 갱신하는 계약에 맞춰 click 후 API/체크 상태를 기다리게 수정했다. 재실행은 통과했다.

근거 파일(현재 작업 폴더): output/week7-tests/results.json, note-failure.png, note-conflict.png, library.png, mobile-detail.png. 충돌 화면과 390px 상세를 시각 검토했다.

## 서버 재시작과 기존 자료

이번에 실행한 시험 서버 PID 7008의 이름과 18087 인자를 확인한 뒤 종료하고 같은 DB로 새 Java 서버를 시작했다. 재시작 전 results.json의 메모 text/version/updatedAt, 읽기 상태 전체를 API 응답과 대조해 완전 일치를 확인했다(PASS). 개발 중 사용자 원본 서버와 원본 DB는 종료·업그레이드하지 않았다.

원본 `backend/data/research-board.db`는 schema 3이며 SQLite backup API로 읽기 전용 복사했다. 새 `output/week7-preview.db`에 schema 4와 5를 순차 적용해 18088 서버에서 실행한다. 원본의 topic/search_run/search_hit/document/provider_budget 기존 열에 대한 행 수와 SHA-256 지문을 복사본과 비교해 전부 동일함을 확인했다. 원본 17개 문서와 17개 검색 히트, 2개 검색 작업, 기존 호출 예산을 보존했다. 복사본 schema_version=5, integrity_check=ok, 웹 HTTP200과 17건 조회를 확인했다. 추가 Serper 요청은 실행하지 않았다.

새 미리보기는 http://127.0.0.1:5178/documents 및 /library. 실제 자료 복사본을 사용하므로 이 화면에서 저장한 사용자 기록은 output/week7-preview.db에 남는다. 원본 DB로 자동 복사하지 않는다. 원본 적용은 정상 백업 및 서버 재시작 시 migration으로 이루어진다.

## 남은 범위

8주차 통계·작업 이력, AI 분석, 자동 메모 저장, 사용자 계정·클라우드 동기화, 전체 기기 호환·접근성 감사는 미구현/미검증이다. 실제 본문 확보 성과는 이번 작업에서 변경되지 않았다.
