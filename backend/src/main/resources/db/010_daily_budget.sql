-- Serper 호출 상한을 DB 누적이 아닌 하루(Asia/Seoul) 단위로 센다.
ALTER TABLE provider_budget ADD COLUMN window_day TEXT
