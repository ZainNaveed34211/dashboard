ALTER TABLE calendar_events ADD COLUMN task_id TEXT;
CREATE TABLE dashboard_analytics_events (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), event TEXT NOT NULL, tool TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX idx_analytics_company ON dashboard_analytics_events(company_id, created_at);
ALTER TABLE notifications ADD COLUMN target_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_notifications_target ON notifications(user_id, kind, target_id);
