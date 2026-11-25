-- 자료 요약 모음의 교차 정리(공통점·차이점·확인 필요) 결과와 사용자의 질문.
ALTER TABLE topic_brief ADD COLUMN question TEXT;
ALTER TABLE topic_brief ADD COLUMN synthesis_status TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE topic_brief ADD COLUMN synthesis_json TEXT;
ALTER TABLE topic_brief ADD COLUMN synthesis_error TEXT;
ALTER TABLE topic_brief ADD COLUMN synthesis_model TEXT;
UPDATE topic_brief SET synthesis_status='NONE'
