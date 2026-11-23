# 5주차 문서 식별·보존 규칙

2026-10-22 / 비교 키 버전 url-v1 / 본문 해시 버전 jsoup-text-v1.

확정 동일성은 HTTP(S) scheme·host 소문자화, 기본 포트 제거, 빈 path를 /로 처리, fragment와 명시적 추적 파라미터 제거로 만든 비교 키에 한정한다. 제거 대상은 utm_source/medium/campaign/term/content/id, gclid, fbclid, msclkid다. signature/sig/x-amz-signature/x-goog-signature/token이 있으면 query 전체를 보존한다. id/page/lang 등 다른 파라미터와 순서·반복·원래 인코딩, path 대소문자·마지막 slash는 보존한다. 비교 함수는 네트워크를 사용하지 않으며 접근 안전성은 별도 UrlSafety·SourcePolicy로 확인한다. 정규화 불가 자료는 원래 문자열 키로만 보존하여 한 자료의 실패로 다른 링크가 사라지지 않게 한다.

| 입력 | 판정 |
|---|---|
| HTTPS://EXAMPLE.COM:443/Article?id=7&utm_source=x#p | https://example.com/Article?id=7 |
| /a?id=1 과 /a?id=2 | 다름 |
| /A, /a, /a/ | 다름 |
| 다른 출처의 같은 제목·본문 | 별도 문서, 필요시 검토 후보 |

document_identity의 (normalized_url, synthetic) UNIQUE와 짧은 쓰기 트랜잭션으로 동일 키 재수집을 연결한다. document_url에는 원래 URL·비교 키·규칙 버전·매칭 근거를 남긴다. 합성과 실제 자료는 다른 namespace다. 같은 run 내 동일 자료는 한 hit와 최초 순위·요약을 유지하며 별칭은 모두 남긴다. 다른 run의 순위·snippet은 별도 보존한다.

기존 ID와 별칭 소유자는 바꾸지 않는다. 구버전 정규화 충돌은 양쪽 ID·참조를 보존하고 LEGACY_NORMALIZED_COLLISION 후보로 남긴다. 신규 변형은 identity의 최초 소유자에 연결하고 원래 URL은 기존 별칭 소유자를 유지한다. 기존 document.normalized_url을 임의로 일괄 변경하지 않으며, url-v1의 authoritative 비교 키는 document_identity와 document_url에 둔다. 신규 normalized_url은 url-v1 키다.

canonical은 동일 키/외부 origin/잘못된 홈 지정/힌트 여부만 기록하며 자동 병합·추가 요청에 사용하지 않는다. 비어 있지 않은 성공 본문의 SHA-256과 해시 버전 일치는 SAME_BODY_HASH, 제목과 확인된 발행일 일치는 SAME_TITLE_DATE 검토 후보로 연결한다. 후보는 자동 삭제 대상이 아니다. 날짜 미상·빈 본문은 근거로 사용하지 않는다.

본문을 못 얻은 재수집은 기존 본문을 지우지 않는다. 기존 본문 해시가 바뀌면 content_version을 증가시켜 후속 AI의 버전·해시 비교에 연결하도록 했다. 현재 AI는 미구현이다. UserNote·ReadingState도 후속 주차 범위이며 이 테이블을 갱신하지 않는다. 외래키 참조 메모를 둔 시험으로 ID·기록 보존을 확인한다.

근거: [Java URI](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/URI.html), [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html), 첨부 개발 가이드·설계서의 5주차 범위. 검증 수치는 완료 보고서에 분리 기록한다.
