# 합성 fixture 목록

| 파일 | 상태 | 목적 |
| --- | --- | --- |
| `fixtures/search/success.json` | `SUCCEEDED` | 공식 후보와 사용자 글 후보 카드, 긴 한글 제목, nullable 날짜 검증 |
| `fixtures/search/empty.json` | `SUCCEEDED` | 오류가 아닌 0건 결과 검증 |
| `fixtures/search/error.json` | `FAILED` | 인증정보를 노출하지 않는 Provider 오류와 재시도 가능 여부 검증 |

모든 fixture에는 `synthetic: true`가 있으며 실제 검색 결과와 섞지 않는다. URL은 문서에서 지정한 `example.com`만 사용한다.
