# 5·6주차 조회 API와 실행 계약

2026-10-22. 새 외부 검색은 POST /api/search-sessions, 저장된 자료 필터는 아래 GET이다. 필터·정렬·페이지 이동은 SearchProvider를 호출하지 않는다.

| 요청 | 대상 집합·요약 기준 |
|---|---|
| GET /api/documents | 전체 문서. 각 문서의 최신 search_hit 요약 |
| GET /api/search-sessions/{runId}/results | 해당 검색의 문서. 해당 hit의 순위·요약 |
| GET /api/documents/{id} | 기본 최신 hit 요약 |
| GET /api/documents/{id}?runId={runId} | 해당 검색 문맥의 요약. 해당 검색에 없으면404 |

## 목록 입력

| 이름 | 값·검증 |
|---|---|
| topicId | 생략 또는 양의 정수. 검색 이력으로 주제와 연결된 문서 |
| sourceType | ALL(기본), OFFICIAL, USER, OTHER |
| title | 최대200자, trim, LIKE 특수문자를 literal 처리 |
| dateBasis | PUBLISHED(기본), FETCHED |
| from / to | 생략 또는 유효한 YYYY-MM-DD. 양 끝 포함, from<=to |
| includeUnknown | true/false, 기본false. 기간 조건에서 날짜 미상 포함 |
| sort | RANK(API 기본), FETCHED_DESC, PUBLISHED_DESC, TITLE_ASC |
| page / size | page0~1,000,000, size1~100, 기본0/20 |
| readingStatus | ALL(기본) 또는 UNTRACKED. 실제 읽음 상태는 후속 주차 |

UI는 기본 FETCHED_DESC를 명시 전송한다. PUBLISHED는 원문 날짜의 YYYY-MM-DD 부분을 기준으로 한다. FETCHED는 본문 요청 시각이 아니라 search_hit.retrieved_at의 한국 날짜(UTC+09)다. 기간이 없으면 미상도 포함하고, 기간이 있으면 기본 제외한다. 정렬은 SQL 고정 조각만 선택하며 id를 추가 키로 사용한다. PUBLISHED_DESC의 미상은 마지막이다.

응답은 items, totalElements, page, size, totalPages다. 0건은 totalPages=0이며 범위를 넘는 유효한 페이지는 빈 items를 반환한다. 잘못된 형식·enum·범위·날짜는400, 없는 run·자료는404다. 실제 원문·키·SQL을 오류 응답에 넣지 않는다.

자료 카드의 기존 필드에 domain, retrievedAt, contentVersion, duplicateCandidateCount, readingStatus=UNTRACKED를 추가했다. fetchedAt은 본문 요청 시각으로 유지하며 retrievedAt과 혼동하지 않는다. duplicateCandidateCount는 자동 병합 수가 아니라 검토 관계 수다.

## 화면 상태

/documents는 전체 저장 자료 목록이며 /search?runId=...는 검색별 목록이다. sourceType/title/topicId/dateBasis/from/to/includeUnknown/sort/page/size를 URL과 queryKey에 동기화한다. 필터 변경은 page0으로 초기화하고 상세 returnTo에 같은 URL을 보존한다. returnTo는 /search 또는 /documents 내부 경로만 허용한다. 요청의 AbortSignal을 fetch에 전달하며 이전 조건의 자료를 현재 조건 결과로 유지하지 않는다.

상세 검색 요약/공개 본문은 일반 텍스트로 분리한다. 본문 미확보 사유, 발행일 미상, 수집 시각, 운영 주체 근거와 안전한 원문 링크를 제공한다. 읽기·보관·메모·AI는 후속 범위라고 명시한다.

## 업그레이드와 데이터 보존

SQL004는 hash_version/content_version/canonical_reason과 identity·alias·검토 후보·조회 인덱스를 추가한다. SearchRepository 구성 시 기존 원래 URL을 url-v1 식별 테이블에 백필한다. 기존 문서 ID·원래 URL·제목·검색 이력·호출예산을 지우거나 초기화하지 않는다. 충돌은 자동 병합하지 않으며 [식별 규칙](week5-identity-rules.md)을 따른다.

실행 중인 사용자 서버8080은 그대로 두었다. 새 버전은 복사본 DB에서 검증했다. 원본 적용 시 사용자가 기존 서버를 정상 종료하고 SQLite 일관된 백업을 확보한 뒤 같은 DB 경로로 재시작한다. 새로운 DB를 만들어 Serper 상한2회를 우회하지 않는다. Java21 이상과 기존 Maven Wrapper를 사용한다.

```powershell
# backend 폴더. 기본 fake / 외부 승인 false로 먼저 실행할 수 있다.
.\mvnw.cmd test package
.\mvnw.cmd spring-boot:run
```

Serper 서버 재시작은 기존 Start-ApprovedSearch.ps1의 가려진 키 입력을 사용한다. 키를 채팅·VITE 변수·문서에 넣지 않는다. 프론트 기본 /api 프록시는8080이며 검증용 RESEARCH_API_TARGET 설정은 프로덕션 설정이 아니다.

근거: 첨부 5·6주차 개발 가이드·설계서, [Java URI](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/URI.html), [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html), [TanStack Query 키](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys). 검증 기록은 [week5-6-verification.md](week5-6-verification.md)에 분리한다.
