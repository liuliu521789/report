-- =============================================================================
-- 增量迁移：公司页眉固定信息（logo/描述语/公司名/报告标题中英）
-- 目标：company_settings 表（单例 id=1）
-- 不删除旧数据，可重复执行
-- =============================================================================

USE qc_report;

CREATE TABLE IF NOT EXISTS company_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  company_name_zh VARCHAR(128) NOT NULL DEFAULT '',
  company_name_en VARCHAR(256) NOT NULL DEFAULT '',
  report_title_zh VARCHAR(128) NOT NULL DEFAULT '',
  report_title_en VARCHAR(256) NOT NULL DEFAULT '',
  description_zh VARCHAR(256) NULL,
  description_en VARCHAR(256) NULL,
  logo_url VARCHAR(512) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_company_settings_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Ensure singleton row exists
INSERT INTO company_settings (id) VALUES (1)
ON DUPLICATE KEY UPDATE id = 1;

SELECT 'migration 004_incremental_company_settings done' AS result;

