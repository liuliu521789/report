-- 员工账号手机号字段（可选唯一）
USE qc_report;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NULL DEFAULT NULL AFTER department_id;

CREATE UNIQUE INDEX IF NOT EXISTS uk_users_phone ON users (phone);

SELECT 'migration 036_users_phone done' AS result;
