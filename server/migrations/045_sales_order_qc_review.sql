-- 销售订单：财务通过后进入品管待审 pending_qc，品管通过后才为 approved（仓库可发货）
ALTER TABLE sales_orders
  MODIFY COLUMN status ENUM(
    'pending_review',
    'pending_qc',
    'approved',
    'rejected',
    'shipped',
    'completed',
    'cancelled'
  ) NOT NULL DEFAULT 'pending_review';

ALTER TABLE sales_orders
  ADD COLUMN qc_reviewed_at DATETIME(3) NULL DEFAULT NULL AFTER finance_comment,
  ADD COLUMN qc_reviewed_by BIGINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN qc_comment VARCHAR(1024) NULL,
  ADD CONSTRAINT fk_sales_orders_qc_by FOREIGN KEY (qc_reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
