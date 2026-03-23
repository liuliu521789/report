-- =============================================================================
-- 增量迁移：报告盖章快照（report_seals）
-- 非破坏性、可重复执行
-- =============================================================================

USE qc_report;

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

SELECT 'migration 003_incremental_report_seals done' AS result;

