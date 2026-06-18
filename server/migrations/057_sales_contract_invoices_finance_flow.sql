-- 合同开票：改为销售申请 → 财务开票回传（无审批链）
-- 状态：draft / pending_finance / issued / cancelled

USE qc_report;

-- 1) 扩展 ENUM（含旧值 + 新值）
ALTER TABLE sales_contract_invoices
  MODIFY COLUMN status ENUM(
    'draft', 'pending_review', 'approved', 'rejected',
    'pending_finance', 'issued', 'cancelled'
  ) NOT NULL DEFAULT 'draft';

-- 2) 数据迁移
UPDATE sales_contract_invoices SET status = 'pending_finance' WHERE status = 'pending_review';
UPDATE sales_contract_invoices SET status = 'issued' WHERE status = 'approved';
UPDATE sales_contract_invoices SET status = 'draft' WHERE status = 'rejected';

-- 3) 收缩为新 ENUM
ALTER TABLE sales_contract_invoices
  MODIFY COLUMN status ENUM('draft', 'pending_finance', 'issued', 'cancelled') NOT NULL DEFAULT 'draft';

-- 4) 财务回传字段（若已存在请跳过；ensureSchema 亦会补列）
-- ALTER TABLE sales_contract_invoices ADD COLUMN invoice_code VARCHAR(64) NULL AFTER invoice_no;
-- ALTER TABLE sales_contract_invoices ADD COLUMN invoice_url VARCHAR(512) NULL AFTER invoice_code;
-- ALTER TABLE sales_contract_invoices ADD COLUMN issued_at DATETIME(3) NULL AFTER invoice_url;
-- ALTER TABLE sales_contract_invoices ADD COLUMN issued_by BIGINT UNSIGNED NULL AFTER issued_at;

SELECT 'Migration 057_sales_contract_invoices_finance_flow completed.' AS result;
