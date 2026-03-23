-- qc_report schema (simplified)
-- MySQL 8.x recommended. Default charset utf8mb4.

CREATE DATABASE IF NOT EXISTS qc_report
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE qc_report;

-- 员工类别（默认权限；超管可为单个员工覆盖 permissions_json）
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

-- 超级管理员（无类别）或员工（必选类别，可有个性化权限 JSON）
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  account_type ENUM('super_admin', 'employee') NOT NULL,
  employee_category_id BIGINT UNSIGNED NULL,
  permissions_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_employee_category (employee_category_id),
  CONSTRAINT fk_users_employee_category FOREIGN KEY (employee_category_id) REFERENCES employee_categories(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Company stamp (single active)
CREATE TABLE IF NOT EXISTS company_stamps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  seal_type ENUM('department_qc', 'inspector', 'supervisor', 'pass', 'recheck') NOT NULL DEFAULT 'department_qc',
  image_url VARCHAR(512) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_company_stamps_active (is_active),
  KEY idx_company_stamps_type_active (seal_type, is_active),
  CONSTRAINT fk_company_stamps_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Company settings (header fixed parts)
CREATE TABLE IF NOT EXISTS company_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  company_name_zh VARCHAR(128) NOT NULL DEFAULT '',
  company_name_en VARCHAR(256) NOT NULL DEFAULT '',
  report_title_zh VARCHAR(128) NOT NULL DEFAULT '',
  report_title_en VARCHAR(256) NOT NULL DEFAULT '',
  description_zh VARCHAR(256) NULL,
  description_en VARCHAR(256) NULL,
  logo_url VARCHAR(512) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_company_settings_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Applied seals snapshot per report (so historical reports keep their seal image)
CREATE TABLE IF NOT EXISTS report_seals (
  report_id BIGINT UNSIGNED NOT NULL,
  seal_type ENUM('department_qc', 'inspector', 'supervisor', 'pass', 'recheck') NOT NULL,
  seal_name VARCHAR(128) NOT NULL,
  seal_image_url VARCHAR(512) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (report_id, seal_type),
  CONSTRAINT fk_report_seals_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Reports (cannot delete, only void)
CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_no VARCHAR(64) NOT NULL,
  batch_no VARCHAR(64) NULL,
  batch_no_en VARCHAR(128) NULL,
  product_name VARCHAR(128) NOT NULL,
  product_name_en VARCHAR(128) NULL,
  template_id BIGINT UNSIGNED NULL,
  conclusion ENUM('pass', 'fail', 'unknown') NOT NULL DEFAULT 'unknown',
  status ENUM('active', 'void') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_reports_report_no (report_no),
  KEY idx_reports_batch_no (batch_no),
  KEY idx_reports_status (status),
  KEY idx_reports_template_id (template_id),
  CONSTRAINT fk_reports_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Report templates (field design reusable)
CREATE TABLE IF NOT EXISTS report_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_report_templates_name (name),
  CONSTRAINT fk_report_templates_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_template_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  field_label VARCHAR(128) NOT NULL,
  field_label_en VARCHAR(128) NULL,
  field_type VARCHAR(16) NOT NULL,
  default_value_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_template_fields_tpl_key (template_id, field_key),
  KEY idx_template_fields_tpl_sort (template_id, sort_order),
  CONSTRAINT fk_template_fields_tpl FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Dynamic fields (definition per report, simplified)
-- type: "text" | "number" | "date" | "select" | "table"
CREATE TABLE IF NOT EXISTS report_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  field_label VARCHAR(128) NOT NULL,
  field_label_en VARCHAR(128) NULL,
  field_type VARCHAR(16) NOT NULL,
  field_value_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_report_fields_report_key (report_id, field_key),
  KEY idx_report_fields_report_sort (report_id, sort_order),
  CONSTRAINT fk_report_fields_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- QR codes: one QR binds many reports; token is unique and used for mini program scan
CREATE TABLE IF NOT EXISTS qrcodes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token VARCHAR(64) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_qrcodes_token (token),
  CONSTRAINT fk_qrcodes_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS qrcode_reports (
  qrcode_id BIGINT UNSIGNED NOT NULL,
  report_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (qrcode_id, report_id),
  KEY idx_qrcode_reports_report (report_id),
  CONSTRAINT fk_qrcode_reports_qrcode FOREIGN KEY (qrcode_id) REFERENCES qrcodes(id) ON DELETE CASCADE,
  CONSTRAINT fk_qrcode_reports_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_security_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  settings_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_security_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO system_security_settings (id, settings_json) VALUES (1, CAST('{"minPasswordLength":6,"bannedPasswords":["123456","admin","password","qwerty","111111","12345678","888888","666666"],"idleTimeoutMinutes":60,"loginFailMaxAttempts":5,"loginLockMinutes":60,"confirmSensitiveOperations":true,"errorLogRetentionDays":180}' AS JSON));

CREATE TABLE IF NOT EXISTS login_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  username VARCHAR(64) NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(512) NULL,
  device_summary VARCHAR(256) NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  fail_reason VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_login_logs_username_time (username, created_at),
  KEY idx_login_logs_time (created_at),
  KEY idx_login_logs_success (success),
  KEY idx_login_logs_user (user_id),
  CONSTRAINT fk_login_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  username VARCHAR(64) NOT NULL DEFAULT '',
  module VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  detail_json JSON NULL,
  success TINYINT(1) NOT NULL DEFAULT 1,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_op_logs_user_time (user_id, created_at),
  KEY idx_op_logs_module_time (module, created_at),
  KEY idx_op_logs_time (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS error_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module VARCHAR(64) NOT NULL DEFAULT 'server',
  message TEXT NOT NULL,
  stack TEXT NULL,
  code VARCHAR(64) NULL,
  meta_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_error_logs_time (created_at),
  KEY idx_error_logs_module (module)
) ENGINE=InnoDB;

