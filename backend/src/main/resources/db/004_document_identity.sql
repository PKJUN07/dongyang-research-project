ALTER TABLE document ADD COLUMN hash_version TEXT;
ALTER TABLE document ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE document ADD COLUMN canonical_reason TEXT NOT NULL DEFAULT 'NOT_REVIEWED';
UPDATE document SET hash_version='jsoup-text-v1' WHERE content_hash IS NOT NULL;
CREATE TABLE document_identity (
 normalized_url TEXT NOT NULL, synthetic INTEGER NOT NULL,
 document_id INTEGER NOT NULL REFERENCES document(id), rule_version TEXT NOT NULL,
 PRIMARY KEY(normalized_url,synthetic)
);
CREATE TABLE document_url (
 id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES document(id),
 url TEXT NOT NULL, normalized_url TEXT NOT NULL, synthetic INTEGER NOT NULL,
 rule_version TEXT NOT NULL, matched_by TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(url,synthetic)
);
CREATE TABLE document_duplicate_candidate (
 left_id INTEGER NOT NULL REFERENCES document(id), right_id INTEGER NOT NULL REFERENCES document(id),
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
 PRIMARY KEY(left_id,right_id,reason), CHECK(left_id<right_id)
);
CREATE INDEX document_hash ON document(content_hash,hash_version,synthetic);
CREATE INDEX document_title_date ON document(title,published_at);
CREATE INDEX search_hit_document ON search_hit(document_id,id);
CREATE INDEX search_run_topic ON search_run(topic_id,id);
