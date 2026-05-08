-- 员工账号实名字段：登录账号与真实姓名分离
USE qc_report;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS real_name VARCHAR(64) NOT NULL DEFAULT '' AFTER username;

UPDATE users
SET real_name = username
WHERE real_name = '' OR real_name IS NULL;

SELECT 'migration 035_users_real_name done' AS result;
