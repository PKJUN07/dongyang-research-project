# 5·6주차 개발 검증 기록

검증일: 2026-10-22 (한국 시간). 프로젝트: C:\dongyang\dongyang-research-project.

## 5주차

- UrlNormalizer, DocumentMatcher, SQL 004를 추가했다. 규칙은 week5-identity-rules.md에 고정했다.
- 비교 키·원래 URL 별칭·매칭 근거·규칙 버전·검토 후보를 분리 저장한다. 구버전 ID 충돌은 자동 병합하지 않는다.
- 같은 자료를 재수집해도 검색 run·hit의 순위와 요약을 따로 보존한다. 기존 본문을 메타데이터만으로 지우지 않고 본문 변경 시 content_version을 증가시킨다.
- 동일 제목 다른 출처·빈 본문·잘못된 canonical·추적 URL 변형·서명 query·동시 저장·기존 ID 충돌을 시험했다.
- 메모·읽기 UI는 7주차 이후 범위다. 참조 user_note 시험 테이블로 재수집 후 같은 ID와 메모 보존을 확인했으며 메모 기능 자체가 완성됐다는 뜻은 아니다.

## 6주차

- GET /api/documents 및 GET /api/search-sessions/{id}/results에 같은 필터 계약을 연결했다. topicId/sourceType/title/dateBasis/from/to/sort/page/size/includeUnknown을 검증한다.
- API 기본 sort는 기존 검색 호환을 위해 RANK다. UI는 FETCHED_DESC를 명시적으로 전송한다. 허용 정렬만 SQL 고정 조각으로 선택하며 같은 값에서는 id를 추가 키로 쓴다.
- 전체 목록은 최신 hit 요약, run 목록은 해당 hit 요약을 사용한다. 상세는 기본 최신 요약이고 runId를 주면 해당 검색의 요약을 사용한다.
- FETCHED는 본문 fetched_at이 아니라 검색 hit의 retrieved_at, 날짜 필터는 한국 시간이다. PUBLISHED는 원문 표시 날짜이며 미상은 기간 필터 기본 제외, includeUnknown=true이면 포함한다.
- /documents 전체 목록, 검색별 DocumentsPanel, DocumentFilterBar, Pagination, 상세 ContentTabs, 필터 포함 returnTo를 연결했다. queryKey·AbortSignal로 이전 조건의 응답을 분리한다.
- 날짜·도메인·미확보 사유·분류 근거를 표시한다. 링크 target=_blank / rel=noopener noreferrer를 DOM에서 확인했으며 외부 원문을 새로 열지는 않았다.
- 읽기 상태는 UNTRACKED로만 제공하며 ALL/UNTRACKED 이외 조건은 400이다. 실제 읽음·보관·메모·AI 분석은 미구현이라고 화면에 표시한다.

## 자동 검증

5주차 첫 회귀 31건 통과 후 6주차 구현과 추가 경계 시험을 진행했다. 최종 `.\mvnw.cmd -q test package` 종료 코드 0, 총 38건, 실패·오류·건너뜀 0이다.

| 스위트 | 건수 |
|---|---:|
| HealthControllerTest | 2 |
| DatabaseTest | 2 |
| IdentityTest | 9 |
| DocumentQueryTest | 3 |
| WorkflowTest | 7 |
| ContentSafetyTest | 9 |
| ProviderTest | 3 |
| ReviewPersistenceTest | 2 |
| SearchConcurrencyTest | 1 |

WorkflowTest는 실제 로컬 HTTP로 정상·0건·Provider 실패·부분 실패·목록 필터·페이지·상세 문맥·잘못된 필터의 400을 검증한다. DocumentQueryTest는 최신/검색별 요약, 발행일 미상 옵션, 한국 시간 자정 경계, LIKE 특수문자, 페이지 안정성을 시험한다. 자동 시험은 별도 임시 DB와 합성 자료이며 외부 검색·본문 요청을 하지 않는다.

프론트 TypeScript -b, Vite build, ESLint src 모두 종료 코드 0이다. 85개 모듈, JS 약315.67 kB / CSS 약6.95 kB. 이는 기능 성능·접근성 전체 감사 수치가 아니다.

## 기존 실제 자료 업그레이드 검증

사용자 서버 8080과 원본 DB는 종료·수정하지 않았다. SQLite backup API로 일관된 백업을 만들고 현재 작업 폴더 output/week6-ui.db 복사본을 새 JAR·18081 포트·fake 강제·외부 승인 false·빈 본문 정책으로 실행했다. 누적 Serper 상한을 우회해 추가 검색하지 않았다.

업그레이드한 복사본과 업그레이드 전 백업의 Topic·search_hit·검색 조건/요청키/시각·원래 문서 URL/제목/합성 여부·provider_budget 지문이 모두 같고 integrity_check=ok다. SERPER attempts=2, run1 PARTIAL/7건/본문 제한1, run2 SUCCEEDED/10건을 보존했다. 공식2/사용자3/기타12, BLOCKED1/METADATA_ONLY16도 유지했다. 복사본에만 identity/alias와 SQL 004가 적용됐다. 원본 DB 업그레이드는 다음 정상 서버 재시작 시 적용된다.

읽기 전용 API 확인: 전체17건, size5는4페이지, run2 공식 필터1건, 발행일 10월 이후 조건은0건, 미상 포함은17건이다. 기존 실제 자료를 조회한 것이며 2026-10-22에 새 실제 검색을 한 것이 아니다. 기존 잔여 크레딧 2,498은 앞선 사용자 확인값이며 이번에 새로 계정을 조회하지 않았다.

## 실제 브라우저 검증 (수동 조작, 자동 E2E 스위트와 구분)

검증용 Vite15173 → 로컬 지연 프록시19081 → 복사본 서버18081로 연결했다. 사용자 원본 서버로 새 검색을 전송하지 않았다.

1. run2 기존 결과10건 → 공식 필터1건 → 상세8 → 본문 내용 전환 → 원문 링크 속성 확인 → 목록 복귀 후 공식 필터 유지.
2. 페이지 크기5로 변경: 1/2페이지 → 다음 클릭2/2페이지, 이전/다음 경계 비활성화. 공식으로 조건 변경하면 page=0으로 초기화.
3. 제목 ‘느림’은 프록시에서2초 지연, 즉시 ‘Claude’로 변경. 최신 결과1건이 먼저 표시되고, 늦은0건 응답은 취소되어 덮어쓰지 않음. 프록시 기록에서 Claude 응답 후 지연 응답과 cancelled obsolete request를 확인.
4. 새로고침 후 runId2·공식·제목Claude·size5·page0과 결과1건 복원.
5. Tab 키로 제목 입력에서 기간 기준으로 이동, 방향키로 FETCHED 변경 및 URL 반영 확인.
6. 전체 저장 목록17건 확인. 시작일2026-10-02로0건, 날짜 미상 포함 선택으로17건 복원 확인.

대표 화면은 현재 작업 폴더 output/week6-filter-proof.png와 output/week6-detail-proof.png다. 이번 신규 UI의 모바일·모든 브라우저·전체 접근성 감사나 대규모 성능 수치는 측정하지 않았다. 이전 2주차 모바일 검증을 6주차 재검증으로 소급하지 않는다.

## 보고서 작성

사용자는 보고서 작성만 Astra·medium 서브에이전트에 위임하도록 승인했다. GPT-6 Astra / medium 실행으로 개발·검증 기록을 근거로 5주차와 6주차 개별 보고서 및 용지용 요약을 작성했다. 메인 에이전트가 두 파일의 저장 내용과 기록을 대조했다. 보고서 작성 담당은 코드를 수정하거나 시험·서버·외부 요청을 재실행하지 않았다.

- [5주차 개발 완료 보고서](2026-10-22_5주차_개발완료보고서.md)
- [6주차 개발 완료 보고서](2026-10-22_6주차_개발완료보고서.md)

최종 원본 DB 대조에서도 모든 보존 지문과 SERPER attempts=2, integrity_check=ok를 확인했으며 사용자 서버8080은 UP을 유지했다.
