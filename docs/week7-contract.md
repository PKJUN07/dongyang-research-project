# 7주차 사용자 기록 계약

기준일: 2026-10-28. 단계별 개발 가이드의 7주차 완료 기준을 따른다. 화면·API 설계서 일부는 보관함 연결을 8주차로 배정하지만, 단계별 가이드가 요구하는 보관함을 7주차에 포함한다. 통계와 작업 이력은 8주차로 남긴다.

## 독립 상태와 저장

- readStatus: UNREAD(기본), READING, READ. 자료를 열거나 즐겨찾기해도 자동 변경하지 않는다.
- saved, favorite, readLater: 각각 기본 false이며 서로 독립적이다. 나중에 읽기는 읽는 중과 다른 값이다.
- PATCH /api/documents/{id}/reading: 전달한 필드만 변경. 예: {"saved":true}. 생략은 유지, null·잘못된 타입·알 수 없는 필드·빈 객체는 400. 문서 미존재 404. 전체 상태 응답.
- GET /api/documents/{id}/reading: 기록이 없으면 기본값을 반환한다.
- 초기 UI는 낙관적 변경 대신 서버 성공 후 갱신한다. 요청 중 비활성화, 실패 시 기존 상태와 재시도 버튼. 성공 후 reading 캐시를 갱신하고 saved-documents/document/stats를 무효화한다.

## 메모

- GET /api/documents/{id}/note: 없으면 {text:"", version:0, updatedAt:null}.
- PUT /api/documents/{id}/note: {text:string, version:integer}. 일반 텍스트 최대 20,000 UTF-16 코드 단위. 공백·줄바꿈은 보존하고 HTML로 실행하지 않는다. 빈 메모도 유효한 새 버전이다.
- 최초 저장은 version=0. INSERT ON CONFLICT DO NOTHING 및 UPDATE WHERE version=?로 조건부 저장한다. 성공마다 version 증가, 실패와 충돌은 증가하지 않는다.
- 오래된 version은 409 NOTE_VERSION_CONFLICT. 원문과 메모 전문을 오류 응답이나 로그에 복제하지 않는다.
- 저장 버튼 방식을 사용한다. 자동 저장과 debounce는 이번 범위에 도입하지 않는다. 저장 중 편집을 잠가 응답이 진행 중인 새 입력을 지우는 상황을 방지한다.
- 편집 draft는 서버 조회 캐시와 분리한다. 편집 중 재조회가 draft를 덮지 않는다. 요청 실패 시 입력 유지, 재시도 가능.
- 409 시 서버 메모와 내 입력을 비교하고, 사용자가 명시적으로 내 입력 저장 또는 서버 메모 사용을 선택한다. 비교 중 서버가 다시 바뀌면 재차 409로 보호한다.
- sessionStorage에 문서별 미저장 draft와 기준 version을 저장하여 같은 탭의 이동·새로고침 후 복원한다. 서버 영구 저장과 구분해서 표시한다. 임시 저장 불가 시 경고한다. 탭 종료 뒤 복구는 보장하지 않으며 beforeunload 경고를 제공한다. 서버 메모 선택 전 입력은 현재 편집기에서 복사할 수 있게 남긴다.

## 보관함과 주제

- /library는 GET /api/documents?saved=true를 고정하고 공통 목록을 재사용한다. URL의 saved=false로 우회하지 못한다.
- readingStatus, favorite, readLater, topicId, 제목·출처·기간·정렬·페이지 조건을 지원한다. 필터 변경 시 첫 페이지. 상세 왕복 후 조건 보존.
- 목록/상세에 동일 ReadingControls를 사용한다. 보관 해제 시 보관함에서 사라지지만 원문과 메모, 즐겨찾기, 나중에 읽기, 읽음은 유지한다.
- GET /api/documents/{id}/topics는 현재 연결된 주제 ID 목록. PUT /topics/{topicId}는 연결, DELETE /topics/{topicId}는 연결만 해제한다. 해당 요청은 문서를 삭제하지 않는다. 없는 자료·주제는 404.
- document_topic의 active=0으로 명시적 연결 해제를 보존한다. 재수집은 새 연결만 추가하고 해제한 연결을 자동 복원하지 않는다. 기존 search_run/search_hit의 역사적 주제는 수정하지 않는다.
- 005 migration은 기존 검색 이력의 주제를 DISTINCT로 연결한다. reading_state/user_note/document_topic의 FK는 RESTRICT이며 문서 실제 삭제 API는 제공하지 않는다.
- 기존 문서 재수집은 사용자 상태와 메모를 갱신하지 않는다. 실제 외부 검색이나 추가 Serper 호출은 이번 작업에 필요하지 않다.

## 기술 확인 자료

- PATCH 부분 변경: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods/PATCH
- SQLite 조건부 UPSERT: https://www.sqlite.org/lang_upsert.html
- 저장 성공 후 캐시 무효화: https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations

기술 문서 확인일: 2026-10-28. 실제 구현 결과는 week7-verification.md를 따른다.
