CREATE TABLE ai_job(id INTEGER PRIMARY KEY,document_id INTEGER NOT NULL REFERENCES document(id),status TEXT NOT NULL,model TEXT NOT NULL,source_hash TEXT NOT NULL,input_type TEXT NOT NULL,input_text TEXT NOT NULL,result_json TEXT,error_code TEXT,created_at TEXT NOT NULL,finished_at TEXT);
CREATE UNIQUE INDEX ai_active ON ai_job(document_id) WHERE status IN ('QUEUED','RUNNING');
