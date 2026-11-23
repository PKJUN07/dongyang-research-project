CREATE TABLE provider_budget (
 provider TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, blocked_until TEXT
);
