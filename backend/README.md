# ResearchBoard backend

로컬 SQLite에 관심 주제·검색 결과·읽기 상태·메모를 저장하며 통계와 검색 이력을 제공합니다. 검색 제공자는 Serper입니다(합성 `fake` 모드는 폐기되어 테스트 코드에만 남아 있습니다). 최신 설치·실행·종료 안내는 [9주차 실행 안내](../docs/week9-runbook.md)를 참고하세요.

## Run

Java 21 이상 호환 JDK가 필요합니다. 검증 환경은 Temurin 25.0.1, 소스 수준은 21입니다. Maven Wrapper는 3.9.16을 사용하며 첫 실행 시 공식 Maven 저장소에서 다운로드합니다.

```powershell
.\mvnw.cmd spring-boot:run
```

기본 주소: `http://127.0.0.1:8080/api/health`. DB 기본 위치는 backend 작업 폴더 기준 `data/research-board.db`입니다. API 서버는 loopback에서만 수신합니다.

## Test

```powershell
.\mvnw.cmd test
```

테스트는 OS 임시 폴더의 별도 SQLite DB와 합성 응답을 사용합니다. 외부 검색과 실제 페이지 요청을 자동 테스트에서 실행하지 않습니다.

## 설정

| 환경변수 | 기본값 | 의미 |
|---|---|---|
| RESEARCH_DB_PATH | data/research-board.db | DB 파일 경로. 절대 경로 권장 |
| RESEARCH_PROVIDER | serper | serper (fake는 자동 테스트 전용) |
| SERPER_API_KEY | 비어 있음 | 서버 전용 키. 채팅·소스·VITE 변수에 넣지 않음 |
| EXTERNAL_SEARCH_APPROVED | false | true일 때만 실제 검색 허용 |
| MAX_PROVIDER_ATTEMPTS | 200 | 하루(Asia/Seoul) Serper 호출 상한. 결과 페이지·본문 추출마다 1회, 실패도 차감. 자정에 다시 채워짐 |
| SERPER_PAGES | 3 | 검색 1회에 이어 받는 결과 페이지 수(1~5, 페이지당 10건) |
| SERPER_SCRAPE_ENABLED | true | 정책에 없는 출처의 본문을 사용자가 요청하면 Serper 본문 추출로 가져옴(robots 차단 출처 제외) |
| SOURCE_POLICY_PATH | 비어 있음 | 직접 검토한 출처·본문 처리 정책 JSON의 절대 경로 |

외부 검색은 페이지당 최대 10건을 최대 `SERPER_PAGES`페이지까지 이어 받습니다. 결과가 10건 미만인 페이지가 나오거나 상한·대기에 걸리면 받은 결과까지만 저장합니다. 자동 재시도 0회, HTTP 전체 제한 15초입니다. 429 응답의 Retry-After를 DB에 기록하고 대기 중 재요청을 차단합니다. 예산을 우회하기 위해 DB를 삭제하거나 카운터를 초기화하지 마세요.

본문 요청은 정책 파일에서 정확한 호스트와 경로, 운영 주체·근거 URL·검토일·허용 범위를 확인한 항목만 가능합니다. robots.txt, 사이트 이용 조건, 저장 허용 범위를 확인한 뒤 fetchAllowed를 활성화하세요. 빈 정책에서는 원문 링크와 검색 요약만 제공합니다.

`Start-ApprovedSearch.ps1`은 SOURCE_POLICY_PATH가 비어 있으면 `docs/source-policy.reviewed.json`을 선택합니다. 2026-10-22 검토된 5개 정책은 전부 본문 요청을 허용하지 않으며, 확인된 출처와 보류 사유만 제공합니다. 일반 Maven 실행은 환경변수를 지정하지 않으면 빈 정책입니다. 실행 중 서버는 정책을 자동 재로딩하지 않으므로 변경은 다음 정상 재시작에 적용됩니다.

## 저장 자료만 출처 재검토

새 검색 없이 명시한 기존 실제 자료를 재검토할 수 있습니다. 먼저 SQLite backup API로 DB를 백업하세요. 실행 중 DB의 .db 파일만 복사하면 WAL의 최신 데이터가 누락될 수 있습니다. 예산 초기화나 기존 DB 삭제는 하지 마세요.

backend 폴더에서 다음과 같이 컴파일·의존성 경로를 만든 뒤 사전 점검합니다.

```powershell
.\mvnw.cmd -q compile dependency:build-classpath '-Dmdep.outputFile=target/reprocess-classpath.txt'
$reviewClasspath = 'target/classes;' + (Get-Content target/reprocess-classpath.txt -Raw).Trim()
java -cp $reviewClasspath kr.ac.dongyang.researchboard.document.ReprocessDocuments 'C:\absolute\research-board.db' 'C:\absolute\source-policy.reviewed.json' '1,7,8,14,17' --dry-run
```

경로와 ID는 대상 DB에서 확인한 실제 값으로 바꾸세요. 사전 출력에서 대상·출처·허용 범위를 확인한 뒤 마지막 인수만 `--apply`로 바꿉니다. dry-run은 본문 요청·출처 반영을 하지 않지만 DB 초기화 코드는 실행하므로 백업 후 사용합니다. apply는 정책에 fetchAllowed=true가 있으면 실제 본문 요청을 할 수 있으므로 검토되지 않은 정책을 사용하지 마세요. 이번 검토 정책은 모두 false입니다.

이 도구는 SearchProvider를 호출하지 않습니다. 기존 본문이 있으면 덮어쓰기를 거부하고 제목·URL·검색 요약·순위·requestKey·호출 예산을 보존합니다. 출처·추출 상태와 확인 시각을 정정하고 해당 완료 작업의 본문 실패 건수·PARTIAL 상태를 다시 계산합니다. ID별 짧은 트랜잭션이므로 적용 중 실패하면 앞서 처리된 ID는 반영될 수 있습니다. 기존 서버를 중지할 필요는 없지만 변경 중인 DB에 적용하기 전에 백업과 대상 상태를 확인하세요.

실제 반영 결과와 한계는 `../docs/2026-10-22_실사이트_출처검증기록.md`, 주차별 완료 판정은 `../docs/week2-4-progress.md`를 참고하세요.

## 프론트 실행

별도 터미널에서 frontend 폴더를 열고 `npm run dev`를 실행합니다. 이 PC의 전역 npm 문제는 기존 의존성이 있는 상태에서 `.\node_modules\.bin\vite.cmd`로 우회할 수 있습니다. 기본 API 프록시는 8080이며 `RESEARCH_API_TARGET`으로 로컬 테스트 포트를 분리할 수 있습니다.

세부 API와 검증 상태는 `../docs/week2-4-progress.md`를 참고하세요.

## 5·6주차: 문서 식별·저장 자료 탐색

SQL004와 url-v1 비교 키·별칭·검토 후보를 추가했습니다. 같은 자료 재수집은 기존 ID를 사용하고 검색별 순위·요약은 따로 보존합니다. canonical·같은 본문·같은 제목을 이유로 다른 출처를 자동 삭제하지 않습니다. 이미 확보한 본문은 메타데이터만으로 덮어 지우지 않습니다.

`GET /api/documents`와 검색별 results는 출처·주제·제목·기간·정렬·페이지를 지원합니다. UI의 `저장 자료` 메뉴는 새 검색이 아닌 로컬 DB 조회입니다. 상세에 원래 필터로 돌아가는 링크와 검색 요약/공개 본문 전환을 제공합니다.

기존 사용자 서버를 강제 종료하지 않았습니다. 새 버전과 SQL004는 복사본 DB에서 검증했으므로 원본 적용 시 정상 종료·일관된 백업 후 같은 DB로 재시작하세요. DB 삭제·호출 예산 초기화는 하지 마세요. 자세한 계약과 날짜 기준은 `../docs/week5-6-api.md`, 검증은 `../docs/week5-6-verification.md`를 참고하세요.
