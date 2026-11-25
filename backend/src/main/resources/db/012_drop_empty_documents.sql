-- 검색 발췌문도 본문도 없는 자료는 읽을 내용이 없으므로 정리한다. 메모·보관·즐겨찾기·나중에 읽기가 있는 자료는 남긴다.
CREATE TEMP TABLE empty_document AS SELECT d.id FROM document d
 WHERE (d.content_text IS NULL OR trim(d.content_text)='')
 AND NOT EXISTS (SELECT 1 FROM search_hit h WHERE h.document_id=d.id AND trim(h.snippet)<>'')
 AND NOT EXISTS (SELECT 1 FROM user_note n WHERE n.document_id=d.id)
 AND NOT EXISTS (SELECT 1 FROM reading_state r WHERE r.document_id=d.id AND (r.saved=1 OR r.favorite=1 OR r.read_later=1));
DELETE FROM ai_job WHERE document_id IN (SELECT id FROM empty_document);
DELETE FROM reading_state WHERE document_id IN (SELECT id FROM empty_document);
DELETE FROM document_topic WHERE document_id IN (SELECT id FROM empty_document);
DELETE FROM document_duplicate_candidate WHERE left_id IN (SELECT id FROM empty_document) OR right_id IN (SELECT id FROM empty_document);
DELETE FROM search_hit WHERE document_id IN (SELECT id FROM empty_document);
DELETE FROM document_url WHERE document_id IN (SELECT id FROM empty_document);
DELETE FROM document_identity WHERE document_id IN (SELECT id FROM empty_document);
DELETE FROM document WHERE id IN (SELECT id FROM empty_document);
DROP TABLE empty_document
