# 8주차 통계·검색 이력 계약

기준일: 2026-11-03 (Asia/Seoul). 2026-09-14를 1주차 시작으로 보는 기존 일정에서 8주차는 11월 2~8일이다. 원문 계획서에는 상대 주차만 있으므로 달력 날짜는 이 시작일 가정에 따른다.

## 범위와 지표

- GET `/api/stats?topicId=&from=YYYY-MM-DD&to=YYYY-MM-DD`: 주제 선택, 양 끝 포함, 최대 366일. 생략 시 한국 시간 오늘까지 30일. 잘못된 범위는 400.
- 문서 집합은 **처음 저장한 날짜가 기간에 포함되고 현재 선택 주제에 연결된 고유 문서**다. 주제 연결은 EXISTS로 검사하여 다중 주제 JOIN 중복을 방지한다.
- 처음 저장 시각은 최초 search_hit.id의 retrieved_at이다. 기존 모델에서 문서 생성과 최초 검색 연결은 같은 트랜잭션이다. 재검색은 처음 저장 시각을 바꾸지 않는다. 필터 목록에 `dateBasis=FIRST_SAVED`를 추가하여 KPI와 동일한 집합을 보여준다.
- UTC 저장 시각을 KST(+09:00) 날짜로 변환한다. 발행일 미상이어도 집계된다. 날짜별 신규 수의 합은 전체 집합 수와 같다. 0건인 날짜도 반환한다.
- 읽음 비율은 현재 READ 문서 수 / 집합 전체 수. 분모 0이면 0%. 소수 첫째 자리 반올림. 읽기 활동 횟수나 과거 시점의 상태가 아니다.
- readingCounts는 UNREAD/READING/READ 각 현재 문서 수이며 합은 전체 집합 수다. 세 상태를 모두 화면에서 확인하고 해당 목록으로 이동할 수 있다.
- 보관·즐겨찾기·나중에 읽기는 각각 현재 상태. 보관 해제가 문서 집합에서 문서를 삭제하지 않는다. 출처는 OFFICIAL/USER/OTHER 모두 포함한다.
- 합성 자료 포함 건수를 별도 표시한다. 실제 수집 자료와 합성 테스트를 혼동하지 않는다.

## 검색 이력

GET `/api/stats/history`는 같은 주제·기간 조건과 page(0부터), 페이지 크기 10을 사용한다. 기간은 **작업 시작 시각** 기준이며 문서 신규 집계와 다르다.

| 지표 | 정의 |
|---|---|
| 원시 수신 | 제공자 organic 배열 전체 크기. 새 검색부터 기록 |
| 제외 | 무효 URL 또는 허용 개수 상한을 넘긴 결과 |
| 유효 결과 | 저장 처리 완료된 입력 결과 수(discovered_count) |
| 고유 자료 | 해당 검색 search_hit의 서로 다른 document 수 |
| 신규 | 이 검색의 hit가 문서의 최초 hit인 문서 수 |
| 기존 매칭 | 고유 자료 - 신규 |
| 확정 중복 | 유효 결과 - 고유 자료. 제목 유사 후보와 구분 |
| 본문 확인 불가 | BLOCKED/FAILED 문서 수. METADATA_ONLY는 별도 기본 상태 |

성공한 저장 작업에서 유효=고유+확정 중복, 고유=신규+기존이다. 수신 후 처리 실패한 작업에서는 원시-제외와 저장 처리 수가 다를 수 있다. 예전 raw/excluded는 NULL(미기록)이며 0으로 추정하지 않는다. Serper의 정확히 같은 URL도 집계 가능한 입력으로 전달하고 저장 단계에서 중복 정리한다. 인증·본문·개인 검색어는 이력 응답에 포함하지 않는다. 주제명, ID, 제공자, 합성 여부, 시작·완료, 상태, 제한된 오류 코드만 제공한다.

마이그레이션 006은 nullable 수신·제외 열과 최초 hit 조회 인덱스만 추가한다. 기존 DB 데이터를 재생성하지 않는다. 실제 Serper 호출은 이번 작업에서 0회이며 기존 승인 예산을 유지한다.

통계 내부는 StatsController → StatsService → StatsRepository로 분리했다. SQL은 저장소에서 실행한다. 구현 설계서의 예시 응답 필드명(documentCount 등)은 실제 계약에서 total/read/saved/readPercent/sources/readingCounts를 사용하며 날짜 범위를 추가했다.

## UI 원칙

조회 전 편집 조건과 적용된 기간을 분리하고 조회 버튼을 제공한다. KPI와 출처 수는 동일 조건 목록 링크다. 보관 건수는 보관함으로 이동한다. 검색 이력의 결과 링크는 runId를 유지한다. 그래프와 같은 데이터를 표로 제공한다. 390px 모바일에서 가로 넘침이 없고, 버튼과 이력 링크는 최소 44px 높이다. 통계/검색 이력 바로가기를 제공한다. 필터 뒤로가기 시 입력도 URL에 맞춘다. Recharts는 통계 경로에서 지연 로딩한다.

참고 확인(2026-11-03): [SQLite 날짜 함수](https://www.sqlite.org/lang_datefunc.html), [SQLite SELECT](https://www.sqlite.org/lang_select.html), [Recharts ResponsiveContainer](https://recharts.github.io/api/ResponsiveContainer/), [Recharts 접근성](https://github.com/recharts/recharts/blob/main/storybook/stories/API/Accessibility.mdx).
