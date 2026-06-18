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
  require_two_factor TINYINT(1) NOT NULL DEFAULT 0,
  is_builtin TINYINT(1) NOT NULL DEFAULT 0 COMMENT '内置类别不允许删除/改 code',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_categories_code (code)
) ENGINE=InnoDB;

INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin) VALUES
('品管', 'qc', 1, CAST('{"reports":{"list":true,"view":true,"create":true,"edit":true,"void":true,"activate":true,"bulkPass":true,"bulkVoid":true,"bulkActivate":true,"bulkDelete":true,"previewPrint":true,"seals":true},"qrcodes":{"list":true,"create":true,"viewDetail":true,"delete":true},"templates":{"use":true},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false}}' AS JSON), 0, 1),
('客服', 'cs', 2, CAST('{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":true,"seals":false},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false}}' AS JSON), 0, 1),
('董事长', 'chairman', 3, CAST('{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":true,"seals":false,"export":true,"chairmanApprove":true,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":true},"stamps":{"manage":false,"view":true},"company":{"manage":false,"view":true},"audit":{"viewLogin":true,"viewOperations":true,"viewErrors":true,"exportAudit":true}}' AS JSON), 1, 1),
('跟单', 'documentary', 14, CAST('{"reports":{"list":false,"view":false,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":false,"create":false,"viewDetail":false,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"wecom":{"manage":false,"send":false},"order_management":{"order_input":true,"order_query":true,"order_query_all":true,"order_edit":true,"order_submit":true,"order_withdraw":true,"order_status_finance":false,"order_status_warehouse":false,"order_ship":false,"order_view_status_logs":true,"order_cancel":true,"order_delete":true,"order_field_config":true},"contract_management":{"template_manage":true,"contract_generate":true,"contract_submit":true,"contract_review":false,"contract_view":true,"contract_edit":false,"contract_delete":false,"contract_edit_approved":false,"contract_delete_approved":false,"contract_version_view":true,"contract_multi_approve":true},"process_management":{"view_flow":true},"data_management":{"data_export":true,"data_export_all":true},"customer_management":{"view":true,"create":true,"edit":true,"disable":true}}' AS JSON), 0, 1);

-- 组织架构（钉钉式部门树）
CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id BIGINT UNSIGNED NULL,
  name_zh VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_departments_parent (parent_id),
  CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 超级管理员（无类别）或员工（必选类别，可有个性化权限 JSON）；员工可选主部门
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  real_name VARCHAR(64) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  account_type ENUM('super_admin', 'employee', 'manager') NOT NULL,
  employee_category_id BIGINT UNSIGNED NULL,
  department_id BIGINT UNSIGNED NULL,
  phone VARCHAR(32) NULL DEFAULT NULL,
  wecom_userid VARCHAR(64) NULL DEFAULT NULL COMMENT '企业微信通讯录成员UserID',
  permissions_json JSON NULL,
  totp_secret VARCHAR(64) NULL DEFAULT NULL,
  totp_enabled_at DATETIME(3) NULL DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  token_version INT NOT NULL DEFAULT 0 COMMENT 'JWT 版本号，停用/改密/改权限时 +1 使旧 token 立即失效',
  force_change_password TINYINT(1) NOT NULL DEFAULT 0 COMMENT '为 1 时下次登录强制改密',
  require_two_factor TINYINT(1) NOT NULL DEFAULT 0 COMMENT '超管个人级 2FA 开关（员工类别另有开关）',
  password_changed_at DATETIME(3) NULL DEFAULT NULL,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL DEFAULT NULL COMMENT '软删除标记；非空表示已删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  UNIQUE KEY uk_users_phone (phone),
  KEY idx_users_wecom_userid (wecom_userid),
  KEY idx_users_employee_category (employee_category_id),
  KEY idx_users_department (department_id),
  KEY idx_users_account_type_active (account_type, is_active),
  KEY idx_users_deleted_at (deleted_at),
  CONSTRAINT fk_users_employee_category FOREIGN KEY (employee_category_id) REFERENCES employee_categories(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
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
  company_email VARCHAR(128) NULL,
  company_address VARCHAR(256) NULL,
  report_title_zh VARCHAR(128) NOT NULL DEFAULT '',
  report_title_en VARCHAR(256) NOT NULL DEFAULT '',
  description_zh VARCHAR(256) NULL,
  description_en VARCHAR(256) NULL,
  logo_url VARCHAR(512) NULL,
  footer_seal_position VARCHAR(16) NOT NULL DEFAULT 'below',
  quick_role_sales_user_id BIGINT UNSIGNED NULL,
  quick_role_finance_user_id BIGINT UNSIGNED NULL,
  quick_role_warehouse_user_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_company_settings_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- 技术支持：工程师微信号（侧栏操作指南复制用）
CREATE TABLE IF NOT EXISTS support_contact_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  engineer_wechat_id VARCHAR(64) NOT NULL DEFAULT '',
  engineer_wecom_userid VARCHAR(64) NOT NULL DEFAULT '',
  engineer_display_name VARCHAR(64) NOT NULL DEFAULT '',
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_support_contact_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO support_contact_settings (id, engineer_wechat_id) VALUES (1, '');

-- 企业微信应用消息（后台配置 + 模板发送）
CREATE TABLE IF NOT EXISTS wecom_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  corp_id VARCHAR(32) NOT NULL DEFAULT '',
  agent_id INT UNSIGNED NOT NULL DEFAULT 0,
  corp_secret VARCHAR(2048) NOT NULL DEFAULT '',
  remark VARCHAR(255) NULL,
  receive_token VARCHAR(2048) NOT NULL DEFAULT '',
  encoding_aes_key VARCHAR(2048) NOT NULL DEFAULT '',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

INSERT IGNORE INTO wecom_config (id, corp_id, agent_id, corp_secret) VALUES (1, '', 0, '');

CREATE TABLE IF NOT EXISTS wecom_notify_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name_zh VARCHAR(128) NOT NULL,
  wecom_userids_json JSON NOT NULL COMMENT '企业微信成员 UserID 数组',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_wecom_recipients_sort (sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wecom_notify_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name_zh VARCHAR(128) NOT NULL,
  msg_type ENUM('text', 'textcard', 'markdown') NOT NULL DEFAULT 'text',
  title_template TEXT NULL,
  body_template TEXT NOT NULL,
  url_template TEXT NULL,
  btntxt VARCHAR(16) NULL DEFAULT '详情',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_wecom_notify_templates_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wecom_notify_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(64) NOT NULL,
  template_code VARCHAR(64) NOT NULL,
  to_user TEXT NOT NULL,
  variables_json JSON NOT NULL,
  biz_type VARCHAR(64) NULL,
  biz_id BIGINT UNSIGNED NULL,
  status ENUM('pending','sending','sent','failed','dead') NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_error TEXT NULL,
  wecom_response_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_wecom_jobs_status_next (status, next_retry_at),
  KEY idx_wecom_jobs_biz (biz_type, biz_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wecom_callback_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  msg_type VARCHAR(64) NULL,
  event_type VARCHAR(128) NULL,
  from_user VARCHAR(128) NULL,
  raw_xml MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_wecom_callback_created (created_at),
  KEY idx_wecom_callback_event (event_type)
) ENGINE=InnoDB;

-- Reports (cannot delete, only void)
CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_uid VARCHAR(32) NULL,
  report_no VARCHAR(64) NOT NULL,
  batch_no VARCHAR(64) NULL,
  batch_no_en VARCHAR(128) NULL,
  product_name VARCHAR(128) NOT NULL,
  product_name_en VARCHAR(128) NULL,
  customer_id BIGINT UNSIGNED NULL,
  template_id BIGINT UNSIGNED NULL,
  conclusion ENUM('pass', 'fail', 'unknown') NOT NULL DEFAULT 'unknown',
  status ENUM('active', 'void') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_reports_report_uid (report_uid),
  KEY idx_reports_report_no (report_no),
  KEY idx_reports_batch_no (batch_no),
  KEY idx_reports_status (status),
  KEY idx_reports_template_id (template_id),
  KEY idx_reports_customer_id (customer_id),
  CONSTRAINT fk_reports_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE SET NULL
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

INSERT IGNORE INTO system_security_settings (id, settings_json) VALUES (1, CAST('{"minPasswordLength":6,"bannedPasswords":["123456","admin","password","qwerty","111111","12345678","888888","666666"],"idleTimeoutMinutes":60,"loginFailMaxAttempts":5,"loginLockMinutes":60,"confirmSensitiveOperations":true,"errorLogRetentionDays":180,"enforceTwoFactorForSuperAdmin":false}' AS JSON));

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

-- 报告样式设计器 · 系统图片库
CREATE TABLE IF NOT EXISTS report_image_library (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL DEFAULT '',
  image_url VARCHAR(512) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_report_image_library_created (created_at),
  CONSTRAINT fk_report_image_library_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 报告设计器样式（区别于报告模板）
CREATE TABLE IF NOT EXISTS report_styles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  elements_json JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_report_styles_updated (updated_at),
  CONSTRAINT fk_report_styles_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 年度品质管控台账（按年 + 明细；与 ensureSchema.ensureQcYearbookDataTables 一致）
CREATE TABLE IF NOT EXISTS qc_yearbook_years (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year SMALLINT UNSIGNED NOT NULL,
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_qc_yearbook_years_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qc_yearbook_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(128) NOT NULL DEFAULT '',
  subject VARCHAR(512) NOT NULL DEFAULT '',
  body MEDIUMTEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_qc_yearbook_records_year (year_id),
  KEY idx_qc_yearbook_records_year_sort (year_id, sort_order, id),
  CONSTRAINT fk_qc_yearbook_records_year FOREIGN KEY (year_id) REFERENCES qc_yearbook_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_qc_yearbook_records_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_qc_yearbook_records_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 「成品」工作表结构化行（与 migrations/047 一致）
CREATE TABLE IF NOT EXISTS qc_yearbook_finished_product_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  inspection_num INT UNSIGNED NOT NULL COMMENT '年度内检验序号，创建后不变',
  inspection_id VARCHAR(32) NOT NULL COMMENT '检验ID：统计年度-序号',
  product_model VARCHAR(128) NOT NULL DEFAULT '',
  product_batch_no VARCHAR(64) NOT NULL DEFAULT '',
  barrel_count DECIMAL(14, 4) NULL,
  initial_batch_kg DECIMAL(14, 4) NULL,
  inspection_batch_kg DECIMAL(14, 4) NULL,
  appearance VARCHAR(64) NULL,
  color_fe_co VARCHAR(32) NULL,
  solid_content_pct DECIMAL(10, 4) NULL,
  viscosity_s_25c DECIMAL(12, 4) NULL,
  acid_value_mgkoh_g DECIMAL(12, 4) NULL,
  tolerance_g_ml DECIMAL(14, 6) NULL,
  nco_content_pct DECIMAL(10, 4) NULL,
  inspection_conclusion VARCHAR(64) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_qc_yearbook_fp_inspection_id (inspection_id),
  UNIQUE KEY uk_qc_yearbook_fp_year_inspnum (year_id, inspection_num),
  KEY idx_qc_yearbook_fp_year (year_id),
  KEY idx_qc_yearbook_fp_year_sort (year_id, sort_order, id),
  KEY idx_qc_yearbook_fp_model_batch (year_id, product_model(32), product_batch_no(16)),
  CONSTRAINT fk_qc_yearbook_fp_year FOREIGN KEY (year_id) REFERENCES qc_yearbook_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_qc_yearbook_fp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_qc_yearbook_fp_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO qc_yearbook_years (year, remark) VALUES (2026, '系统预置');
