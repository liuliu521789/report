-- 销售订单异步导出任务
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sales_order_export_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_by BIGINT UNSIGNED NOT NULL,
  requester_json JSON NOT NULL,
  filter_json JSON NOT NULL,
  status ENUM('pending', 'running', 'done', 'failed') NOT NULL DEFAULT 'pending',
  total_hit INT UNSIGNED NULL DEFAULT NULL,
  row_count_exported INT UNSIGNED NULL DEFAULT NULL,
  last_error VARCHAR(512) NULL DEFAULT NULL,
  file_path VARCHAR(768) NULL DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_so_export_jobs_user_created (created_by, created_at),
  KEY idx_so_export_jobs_status_created (status, created_at),
  CONSTRAINT fk_so_export_jobs_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SELECT 'migration 050_sales_order_export_jobs done' AS result;
