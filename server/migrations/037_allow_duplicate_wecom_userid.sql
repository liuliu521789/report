-- 开发阶段：允许多个账号绑定同一个企业微信 UserID
-- 将 users.wecom_userid 从唯一索引改为普通索引

USE qc_report;

DROP INDEX IF EXISTS uk_users_wecom_userid ON users;
CREATE INDEX IF NOT EXISTS idx_users_wecom_userid ON users (wecom_userid);

SELECT 'migration 037_allow_duplicate_wecom_userid done' AS result;
