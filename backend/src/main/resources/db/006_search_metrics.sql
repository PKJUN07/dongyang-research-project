ALTER TABLE search_run ADD COLUMN raw_count INTEGER;
ALTER TABLE search_run ADD COLUMN excluded_count INTEGER;
CREATE INDEX search_hit_first ON search_hit(document_id,id);
