-- 账号模块加固：JWT 即时失效 / 软删除 / 强制改密 / 超管 2FA / 索引 / 内置类别标记
-- 与 ensureSchema.ensureAccountModuleHardeningColumns 一致；启动时会自动幂等执行

USE qc_report;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0
    COMMENT 'JWT 版本号；停用/改密/改权限时 +1 使旧 token 立即失效',
  ADD COLUMN IF NOT EXISTS force_change_password TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '为 1 时下次登录强制改密',
  ADD COLUMN IF NOT EXISTS require_two_factor TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '超管个人级 2FA 开关（员工类别另有）',
  ADD COLUMN IF NOT EXISTS password_changed_at DATETIME(3) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME(3) NULL DEFAULT NULL
    COMMENT '软删除标记';

-- 新增索引（IF NOT EXISTS 在 MySQL 8 才支持，老版本请手工跳过已存在的索引）
CREATE INDEX IF NOT EXISTS idx_users_wecom_userid ON users (wecom_userid);
CREATE INDEX IF NOT EXISTS idx_users_account_type_active ON users (account_type, is_active);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);

ALTER TABLE employee_categories
  ADD COLUMN IF NOT EXISTS is_builtin TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '内置类别不允许删除';

UPDATE employee_categories SET is_builtin = 1
WHERE code IN ('qc', 'cs', 'chairman', 'sales', 'finance', 'warehouse', 'sales_admin');

SELECT 'migration 034_account_module_hardening done' AS result;
