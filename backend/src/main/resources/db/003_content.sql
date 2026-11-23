ALTER TABLE document ADD COLUMN content_text TEXT;
ALTER TABLE document ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'METADATA_ONLY';
ALTER TABLE document ADD COLUMN extraction_reason TEXT NOT NULL DEFAULT '본문 미수집';
ALTER TABLE document ADD COLUMN content_hash TEXT;
ALTER TABLE document ADD COLUMN fetched_at TEXT;
ALTER TABLE document ADD COLUMN classified_at TEXT;
ALTER TABLE document ADD COLUMN canonical_url TEXT;
