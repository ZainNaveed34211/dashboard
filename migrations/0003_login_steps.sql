CREATE TABLE dashboard_backup_codes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, used_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_backup_codes_user ON dashboard_backup_codes(user_id);
