-- =============================================================================
-- 从 users.role(admin/inspector) 升级到 account_type + employee_categories
-- 执行前请先备份：见 README_UPGRADE_FROM_ROLE.md
-- 仅当 users 表仍存在 role 列时执行；若已升级可跳过。
-- =============================================================================

USE qc_report;

-- 1) 员工类别表 + 内置品管/客服
CREATE TABLE IF NOT EXISTS employee_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name_zh VARCHAR(64) NOT NULL,
  code VARCHAR(32) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  default_permissions_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_categories_code (code)
) ENGINE=InnoDB;

INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json) VALUES
('品管', 'qc', 1, CAST('{"reports":{"list":true,"view":true,"create":true,"edit":true,"void":true,"activate":true,"previewPrint":true,"seals":true},"qrcodes":{"list":true,"create":true,"viewDetail":true},"templates":{"use":true},"stamps":{"manage":false},"company":{"manage":false}}' AS JSON)),
('客服', 'cs', 2, CAST('{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"previewPrint":true,"seals":false},"qrcodes":{"list":true,"create":false,"viewDetail":true},"templates":{"use":false},"stamps":{"manage":false},"company":{"manage":false}}' AS JSON));

-- 2) 为 users 增加新列（若某列已存在会报错，请删除已执行过的语句后重跑，或手工跳过）
ALTER TABLE users
  ADD COLUMN account_type ENUM('super_admin', 'employee') NOT NULL DEFAULT 'employee' AFTER password_hash,
  ADD COLUMN employee_category_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER account_type,
  ADD COLUMN permissions_json JSON NULL DEFAULT NULL AFTER employee_category_id;

ALTER TABLE users
  ADD CONSTRAINT fk_users_employee_category
    FOREIGN KEY (employee_category_id) REFERENCES employee_categories(id)
    ON DELETE SET NULL;

-- 3) 数据迁移
UPDATE users SET account_type = 'super_admin' WHERE role = 'admin';

UPDATE users u
INNER JOIN employee_categories c ON c.code = 'qc'
SET u.account_type = 'employee', u.employee_category_id = c.id
WHERE u.role = 'inspector';

-- 4) 删除旧列
ALTER TABLE users DROP COLUMN role;
