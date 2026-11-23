# 데이터 모델 초안

## 관계

```mermaid
erDiagram
  TOPIC ||--o{ SEARCH_RUN : starts
  SEARCH_RUN ||--o{ SEARCH_HIT : contains
  DOCUMENT ||--o{ SEARCH_HIT : appears_in
  TOPIC ||--o{ DOCUMENT_TOPIC : groups
  DOCUMENT ||--o{ DOCUMENT_TOPIC : belongs_to
  DOCUMENT ||--o| READING_STATE : has
  DOCUMENT ||--o| USER_NOTE : has

  TOPIC {
    long id PK
    string name
    string query
    datetime created_at
  }
  SEARCH_RUN {
    long id PK
    long topic_id FK
    string query
    string provider
    string locale
    string status
    datetime started_at
    datetime finished_at
    string error_code
  }
  SEARCH_HIT {
    long id PK
    long search_run_id FK
    long document_id FK
    int rank
    string snippet
    datetime retrieved_at
  }
  DOCUMENT {
    long id PK
    string original_url
    string normalized_url UK
    string canonical_url
    string title
    string source_type
    string classification_reason
    datetime published_at
    datetime fetched_at
    string extraction_status
    text permitted_text
    string content_hash
  }
  DOCUMENT_TOPIC {
    long document_id FK
    long topic_id FK
  }
  READING_STATE {
    long document_id PK
    string read_status
    boolean saved
    boolean favorite
    boolean read_later
    datetime updated_at
  }
  USER_NOTE {
    long document_id PK
    text text
    int version
    datetime updated_at
  }
```

## 단계별 적용

2주차에는 `topic`, `search_run`, `search_hit`, `document`만 구현한다. `document_topic`, `reading_state`, `user_note`는 관계와 제약을 검토한 뒤 해당 기능 주차에 추가한다. AI 작업과 근거 테이블은 10주차 범위다.

## 필수 제약

- `document.normalized_url`은 UNIQUE 후보지만 서로 다른 글의 오병합을 막는 규칙이 먼저 필요하다.
- `document_topic`은 `(document_id, topic_id)` 복합 UNIQUE를 사용한다.
- `published_at` 미상은 null이며 수집 시각으로 대체하지 않는다.
- 사용자 메모와 AI 생성 결과는 같은 열에 저장하지 않는다.
- 모든 SQLite 연결에서 foreign keys를 켠다.
