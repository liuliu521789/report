-- 销售数据、合同、流程消息（与 ensureSchema 中 DDL 保持一致时可单独执行本文件升级）
USE qc_report;

CREATE TABLE IF NOT EXISTS sales_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  order_no_prefix VARCHAR(32) NOT NULL DEFAULT 'SO',
  last_order_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;

INSERT IGNORE INTO sales_settings (id, order_no_prefix, last_order_seq) VALUES (1, 'SO', 0);

CREATE TABLE IF NOT EXISTS sales_customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_code VARCHAR(64) NOT NULL DEFAULT '',
  customer_name VARCHAR(256) NOT NULL DEFAULT '',
  contact_name VARCHAR(128) NULL,
  phone VARCHAR(64) NULL,
  address VARCHAR(512) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_sales_customers_code (customer_code),
  KEY idx_sales_customers_name (customer_name(64)),
  CONSTRAINT fk_sales_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 订单状态：pending_review=待审核，approved=已审核，rejected=驳回，shipped=已发货，completed=已完成，cancelled=已取消
CREATE TABLE IF NOT EXISTS sales_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(64) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  product_code VARCHAR(128) NOT NULL DEFAULT '',
  product_name VARCHAR(256) NOT NULL DEFAULT '',
  product_model VARCHAR(256) NOT NULL DEFAULT '',
  quantity DECIMAL(18, 4) NOT NULL,
  unit_price DECIMAL(18, 4) NOT NULL,
  amount DECIMAL(18, 4) NOT NULL,
  remark VARCHAR(1024) NULL,
  extra_json JSON NULL,
  status ENUM('pending_review', 'approved', 'rejected', 'shipped', 'completed', 'cancelled') NOT NULL DEFAULT 'pending_review',
  submitted_for_review_at DATETIME(3) NULL DEFAULT NULL,
  finance_reviewed_at DATETIME(3) NULL,
  finance_reviewed_by BIGINT UNSIGNED NULL,
  finance_comment VARCHAR(1024) NULL,
  shipped_at DATETIME(3) NULL,
  shipped_by BIGINT UNSIGNED NULL,
  shipping_instruction VARCHAR(1024) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_sales_orders_no (order_no),
  KEY idx_sales_orders_customer (customer_id),
  KEY idx_sales_orders_status (status),
  KEY idx_sales_orders_created (created_at),
  KEY idx_sales_orders_created_by (created_by),
  CONSTRAINT fk_sales_orders_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_orders_finance_by FOREIGN KEY (finance_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_shipped_by FOREIGN KEY (shipped_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_order_status_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  remark VARCHAR(1024) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_order_status_logs_order (order_id, created_at),
  CONSTRAINT fk_sales_order_status_logs_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_order_status_logs_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_order_edit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_order_edit_logs_order (order_id, created_at),
  CONSTRAINT fk_sales_order_edit_logs_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_order_edit_logs_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_contract_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  body_html MEDIUMTEXT NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_contract_templates_name (name),
  CONSTRAINT fk_sales_contract_templates_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_contracts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_no VARCHAR(64) NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(256) NOT NULL DEFAULT '',
  body_html MEDIUMTEXT NOT NULL,
  status ENUM('draft', 'pending_review', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  reviewer_user_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_sales_contracts_no (contract_no),
  KEY idx_sales_contracts_customer (customer_id),
  KEY idx_sales_contracts_status (status),
  CONSTRAINT fk_sales_contracts_template FOREIGN KEY (template_id) REFERENCES sales_contract_templates(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_contracts_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_contracts_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_contracts_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_contract_orders (
  contract_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (contract_id, order_id),
  KEY idx_sales_contract_orders_order (order_id),
  CONSTRAINT fk_sco_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_sco_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_contract_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(32) NOT NULL,
  result VARCHAR(32) NULL,
  comment_text VARCHAR(2048) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_contract_audit_contract (contract_id, created_at),
  CONSTRAINT fk_sales_contract_audit_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_contract_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_internal_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  to_user_id BIGINT UNSIGNED NOT NULL,
  from_user_id BIGINT UNSIGNED NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'notice',
  title VARCHAR(256) NOT NULL DEFAULT '',
  body_text VARCHAR(2048) NULL,
  ref_type VARCHAR(32) NULL,
  ref_id BIGINT UNSIGNED NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_messages_to (to_user_id, read_at, created_at),
  CONSTRAINT fk_sales_messages_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_messages_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 固定业务角色（code 与需求一致：sales / finance / warehouse / sales_admin 系统管理员）
INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor) VALUES
('销售人员', 'sales', 10,
 CAST('{"reports":{"list":false,"view":false,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":false,"create":false,"viewDetail":false,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":true,"order_query":true,"order_query_all":true,"order_edit":true,"order_submit":true,"order_withdraw":true,"order_status_finance":false,"order_status_warehouse":false,"order_view_status_logs":true,"order_cancel":true},"contract_management":{"template_manage":true,"contract_generate":true,"contract_submit":true,"contract_review":false,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":false,"data_export_all":false}}' AS JSON), 0),
('财务审核员', 'finance', 11,
 CAST('{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":false,"order_query":true,"order_query_all":true,"order_edit":false,"order_submit":false,"order_withdraw":false,"order_status_finance":true,"order_status_warehouse":false,"order_view_status_logs":true,"order_cancel":true},"contract_management":{"template_manage":false,"contract_generate":false,"contract_submit":false,"contract_review":true,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":true,"data_export_all":false}}' AS JSON), 0),
('仓库人员', 'warehouse', 12,
 CAST('{"reports":{"list":false,"view":false,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":false,"create":false,"viewDetail":false,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":false,"order_query":true,"order_query_all":true,"order_edit":false,"order_submit":false,"order_withdraw":false,"order_status_finance":false,"order_status_warehouse":true,"order_view_status_logs":true,"order_cancel":false},"contract_management":{"template_manage":false,"contract_generate":false,"contract_submit":false,"contract_review":false,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":false,"data_export_all":false}}' AS JSON), 0),
('系统管理员', 'sales_admin', 13,
 CAST('{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":true,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":true},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":true},"audit":{"viewLogin":true,"viewOperations":true,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":true,"order_query":true,"order_query_all":true,"order_edit":true,"order_submit":true,"order_withdraw":true,"order_status_finance":true,"order_status_warehouse":true,"order_view_status_logs":true,"order_cancel":true},"contract_management":{"template_manage":true,"contract_generate":true,"contract_submit":true,"contract_review":true,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":true,"data_export_all":true}}' AS JSON), 0);
