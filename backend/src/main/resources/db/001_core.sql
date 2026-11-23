CREATE TABLE topic (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 query TEXT NOT NULL CHECK(length(query) BETWEEN 1 AND 200), created_at TEXT NOT NULL
);
CREATE TABLE search_run (
 id INTEGER PRIMARY KEY, topic_id INTEGER NOT NULL REFERENCES topic(id), query TEXT NOT NULL,
 provider TEXT NOT NULL, locale TEXT NOT NULL, synthetic INTEGER NOT NULL,
 request_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED')),
 discovered_count INTEGER NOT NULL DEFAULT 0, processed_count INTEGER NOT NULL DEFAULT 0,
 failure_count INTEGER NOT NULL DEFAULT 0, error_code TEXT,
 started_at TEXT NOT NULL, finished_at TEXT
);
CREATE UNIQUE INDEX search_active ON search_run(topic_id, query, provider) WHERE status IN ('QUEUED','RUNNING');
CREATE TABLE document (
 id INTEGER PRIMARY KEY, original_url TEXT NOT NULL, normalized_url TEXT NOT NULL,
 title TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'OTHER',
 classification_reason TEXT NOT NULL DEFAULT '운영 주체 미확인',
 published_at TEXT, synthetic INTEGER NOT NULL, UNIQUE(normalized_url, synthetic)
);
CREATE TABLE search_hit (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES search_run(id),
 document_id INTEGER NOT NULL REFERENCES document(id), rank INTEGER NOT NULL,
 snippet TEXT NOT NULL, retrieved_at TEXT NOT NULL, UNIQUE(run_id, document_id)
);
CREATE INDEX search_hit_run ON search_hit(run_id, rank);
