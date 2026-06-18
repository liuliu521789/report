-- 合同开票：开票记录 + 开票审批流转日志（2026-06）
-- 支持一份合同多次/分批开票、部分开票金额累计、申请-审批流程（镜像合同审核）
-- 开票状态由「已通过开票金额合计」与「合同关联订单金额合计」对比动态计算（未开票/部分开票/已开票）

USE qc_report;

CREATE TABLE IF NOT EXISTS sales_contract_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  invoice_no VARCHAR(64) NULL COMMENT '发票号码，开具后回填',
  invoice_type ENUM('special', 'normal', 'electronic') NOT NULL DEFAULT 'special' COMMENT '专票/普票/电子普票',
  amount DECIMAL(18, 4) NOT NULL DEFAULT 0 COMMENT '开票金额（价税合计）',
  tax_rate DECIMAL(6, 4) NULL COMMENT '税率，如 0.13',
  tax_amount DECIMAL(18, 4) NULL COMMENT '税额',
  invoice_date DATE NULL COMMENT '开票日期',
  buyer_name VARCHAR(256) NULL COMMENT '购方名称（默认取客户名）',
  buyer_tax_id VARCHAR(64) NULL COMMENT '购方税号',
  remark VARCHAR(1024) NULL,
  status ENUM('draft', 'pending_review', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  reviewer_user_id BIGINT UNSIGNED NULL,
  approval_flow_json JSON NULL COMMENT '顺序多级审批配置，兼容单审批人',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_contract_invoices_contract (contract_id, created_at),
  KEY idx_sales_contract_invoices_status (status),
  KEY idx_sales_contract_invoices_reviewer (reviewer_user_id),
  CONSTRAINT fk_sales_contract_invoices_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_contract_invoices_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_contract_invoices_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_contract_invoice_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(32) NOT NULL,
  result VARCHAR(32) NULL,
  comment_text VARCHAR(2048) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_contract_invoice_audit_invoice (invoice_id, created_at),
  CONSTRAINT fk_sales_contract_invoice_audit_invoice FOREIGN KEY (invoice_id) REFERENCES sales_contract_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_contract_invoice_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

SELECT 'Migration 056_sales_contract_invoices completed successfully.' AS result;
