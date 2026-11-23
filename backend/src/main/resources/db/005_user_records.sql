CREATE TABLE reading_state (
 document_id INTEGER PRIMARY KEY REFERENCES document(id) ON DELETE RESTRICT,
 read_status TEXT NOT NULL DEFAULT 'UNREAD' CHECK(read_status IN ('UNREAD','READING','READ')),
 saved INTEGER NOT NULL DEFAULT 0 CHECK(saved IN (0,1)),
 favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
 read_later INTEGER NOT NULL DEFAULT 0 CHECK(read_later IN (0,1)),
 updated_at TEXT NOT NULL
);
CREATE TABLE user_note (
 document_id INTEGER PRIMARY KEY REFERENCES document(id) ON DELETE RESTRICT,
 text TEXT NOT NULL CHECK(length(text)<=20000),
 version INTEGER NOT NULL CHECK(version>0), updated_at TEXT NOT NULL
);
CREATE TABLE document_topic (
 document_id INTEGER NOT NULL REFERENCES document(id) ON DELETE RESTRICT,
 topic_id INTEGER NOT NULL REFERENCES topic(id) ON DELETE RESTRICT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 PRIMARY KEY(document_id,topic_id)
);
INSERT INTO document_topic(document_id,topic_id) SELECT DISTINCT h.document_id,r.topic_id FROM search_hit h JOIN search_run r ON r.id=h.run_id;
CREATE INDEX document_topic_filter ON document_topic(topic_id,active,document_id);
