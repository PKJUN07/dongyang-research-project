# 2~4주차 API 계약

기본 Provider는 FAKE이며 결과의 synthetic=true로 실제 자료와 구분한다. 검색 키는 서버에서만 읽는다.

| 요청 | 입력 | 성공 응답 |
|---|---|---|
| GET /api/health | 없음 | 200 status, service, checkedAt |
| GET /api/config | 없음 | 200 provider, synthetic, aiEnabled |
| GET /api/topics | 없음 | 200 Topic 배열 |
| POST /api/topics | name(1~100), query(1~200) | 201 Topic |
| POST /api/search-sessions | topicId, query(1~200), requestKey(선택 1~100) | 202 검색 작업 |
| GET /api/search-sessions/{id} | 검색 작업 ID | 200 검색 작업 |
| GET /api/search-sessions/{id}/results | page>=0, size=1~100(기본20) | 200 items, totalElements, page, size |
| GET /api/documents/{id} | 자료 ID | 200 자료 상세 |

검색 작업: runId, topicId, query, provider, synthetic, status, discoveredCount, processedCount, failureCount, errorCode, startedAt, finishedAt.

자료: documentId, title, url, snippet, rank, sourceType, classificationReason, publishedAt, synthetic, extractionStatus, extractionReason, contentText, fetchedAt, classifiedAt.

발행일 null은 미상이며 수집 시각으로 대체하지 않는다. snippet과 contentText는 별도다. HTML은 React 텍스트로 렌더링한다. 상세의 snippet은 최근 검색 히트의 요약이고, 결과 API의 snippet과 rank는 해당 검색 실행의 이력이다.

## 상태와 재시작

QUEUED → RUNNING → SUCCEEDED / PARTIAL / FAILED.

- 정상 0건은 SUCCEEDED, 일부 본문 실패는 PARTIAL, Provider 자체 실패는 FAILED다.
- 본문 정책 미승인 METADATA_ONLY는 제한된 제공 상태이며 실패 건수에 포함하지 않는다.
- 검토된 정책의 `ROBOTS_DISALLOWED:` 사유는 BLOCKED로, `RIGHTS_NOT_CONFIRMED:` 등 저장 허용 미확인은 METADATA_ONLY로 전달한다. fetchAllowed=false이면 본문 HTTP 요청은 하지 않는다. BLOCKED/FAILED는 본문 실패 수에 포함하되 결과 링크는 유지한다.
- 재시작 시 QUEUED/RUNNING은 INTERRUPTED 실패로 정리한다. 외부 요청을 자동 재실행하지 않는다.
- 같은 requestKey와 동일 조건은 기존 작업을 반환하며 조건이 다르면 409다.
- requestKey 생략 시 서버가 생성한다. 네트워크 재전송 보호를 받으려면 클라이언트가 동일한 키를 유지해야 한다.
- 같은 주제·검색어·Provider의 실행 중 작업은 병합한다. 실행 1개·대기 16개, 큐 초과 503.

오류 응답은 code와 message를 포함한다. 입력 오류 400, 없는 자료·주제·작업 404, 요청 키 충돌 409, 큐 포화 503이다. Provider 원문·키·SQL·서버 경로는 반환하지 않는다.

작업 오류 코드: APPROVAL_REQUIRED, PROVIDER_KEY_MISSING, BUDGET_EXHAUSTED, PROVIDER_COOLDOWN, PROVIDER_AUTH, PROVIDER_RATE_LIMIT, PROVIDER_TIMEOUT, PROVIDER_UNAVAILABLE, PROVIDER_INVALID_RESPONSE, PROCESSING_FAILED, INTERRUPTED.

## 실행 제한

Serper 최초 누적 예산 2회, 자동 재시도 0회다. 예산은 DB에서 요청 전에 예약한다. 네트워크 실패도 전송됐을 가능성이 있어 되돌리지 않는다. 크레딧 차감은 계정 대시보드에서 별도 확인한다.

본문은 정책 허용 경로만 대상으로 동시 1개, 도메인 간격 최소 1초, 최대 3회 리다이렉트, 응답 최대 1 MB, 텍스트 최대 100,000자로 제한한다. DNS 대기는 최대 4초이며 전체 페이지 요청의 15초 예산 안에서 수행한다. DNS의 모든 주소를 검사하고 연결에 고정한다. OS DNS 조회가 인터럽트를 무시해도 앱은 대기를 종료하며, DNS 실행기와 대기열의 크기는 각각 1개다. HTTP(S) 기본 포트만 허용하고 사설·루프백·링크로컬·예약 주소, 경로 인코딩 우회, HTTPS→HTTP 전환을 차단한다.

## 저장된 출처 정정

출처 정정용 HTTP API는 추가하지 않았다. 명시적 로컬 CLI ReprocessDocuments의 --dry-run/--apply를 사용하며 백업과 실행 절차는 backend/README.md를 따른다. 기존 본문 덮어쓰기를 거부하고 검색 이력·요청키·호출 예산을 보존한다. 정정 후 관련 완료 작업의 본문 실패 건수와 SUCCEEDED/PARTIAL은 현재 자료 상태에 맞춰 다시 계산되므로 최초 스모크 영수증의 상태와 다를 수 있다. 원래 검색 시각은 바꾸지 않는다.
