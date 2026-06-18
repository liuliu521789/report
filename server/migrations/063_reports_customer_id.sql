-- 报告按客户隔离：同一产品+批号可为不同客户各维护一份独立报告

ALTER TABLE reports
  ADD COLUMN customer_id BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '关联客户（从订单生成时写入）' AFTER product_name_en;

ALTER TABLE reports
  ADD KEY idx_reports_customer_id (customer_id);

ALTER TABLE reports
  ADD CONSTRAINT fk_reports_customer
  FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE SET NULL;
