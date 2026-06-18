-- 客户型号对照手动维护表 (2026-05)
-- 允许用户在页面上编辑客户型号和内部编码，覆盖 Excel 导入的对照数据
-- 与 ensureSchema.js DDL_SALES_PIECES 中的 sales_customer_model_mappings 保持一致

USE qc_report;

CREATE TABLE IF NOT EXISTS sales_customer_model_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  customer_model VARCHAR(256) NOT NULL DEFAULT '',
  internal_model VARCHAR(256) NOT NULL DEFAULT '',
  is_hidden TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_mapping_customer_model (customer_id, customer_model(128)),
  KEY idx_mappings_customer (customer_id),
  CONSTRAINT fk_mappings_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_mappings_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_mappings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='客户型号对照手动维护（覆盖 Excel 导入的对照数据）';
