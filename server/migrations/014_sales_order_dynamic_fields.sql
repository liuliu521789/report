-- 销售订单动态表单字段 + data_json；订单号改为服务端随机生成（旧前缀配置保留但不用于新单）
USE qc_report;

CREATE TABLE IF NOT EXISTS sales_order_field_definitions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  field_key VARCHAR(64) NOT NULL,
  label_zh VARCHAR(128) NOT NULL,
  field_type ENUM('text', 'textarea', 'number', 'positive_number', 'date') NOT NULL DEFAULT 'text',
  required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  maps_to VARCHAR(32) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_sales_order_field_key (field_key),
  KEY idx_sales_order_field_sort (sort_order),
  KEY idx_sales_order_field_active (is_active)
) ENGINE=InnoDB;

ALTER TABLE sales_orders ADD COLUMN data_json JSON NULL AFTER remark;
