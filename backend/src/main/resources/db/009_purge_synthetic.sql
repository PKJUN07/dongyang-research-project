-- 합성(테스트) 자료와 그에 딸린 기록을 모두 폐기한다. 실제 수집 자료는 건드리지 않는다.
DELETE FROM ai_job WHERE document_id IN (SELECT id FROM document WHERE synthetic=1);
DELETE FROM reading_state WHERE document_id IN (SELECT id FROM document WHERE synthetic=1);
DELETE FROM user_note WHERE document_id IN (SELECT id FROM document WHERE synthetic=1);
DELETE FROM document_topic WHERE document_id IN (SELECT id FROM document WHERE synthetic=1);
DELETE FROM document_duplicate_candidate WHERE left_id IN (SELECT id FROM document WHERE synthetic=1) OR right_id IN (SELECT id FROM document WHERE synthetic=1);
DELETE FROM search_hit WHERE document_id IN (SELECT id FROM document WHERE synthetic=1) OR run_id IN (SELECT id FROM search_run WHERE synthetic=1);
DELETE FROM document_url WHERE synthetic=1 OR document_id IN (SELECT id FROM document WHERE synthetic=1);
DELETE FROM document_identity WHERE synthetic=1 OR document_id IN (SELECT id FROM document WHERE synthetic=1);
DELETE FROM document WHERE synthetic=1;
DELETE FROM search_run WHERE synthetic=1;
DELETE FROM topic_brief WHERE EXISTS (SELECT 1 FROM json_each(topic_brief.snapshot_json) j WHERE json_extract(j.value,'$.documentId') NOT IN (SELECT id FROM document))
