-- =============================================================================
-- 增量迁移：报告模板（不丢数据、可重复执行）
-- 适用：已按旧版执行过 schema.sql（无 template 表、reports 无 template_id）
-- 执行前：USE qc_report; （或把你的库名改成实际库名）
-- MySQL 8.x 推荐
-- =============================================================================

USE qc_report;

-- -----------------------------------------------------------------------------
-- 1) 新建模板表（若已存在则跳过）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_report_templates_name (name),
  CONSTRAINT fk_report_templates_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_template_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  field_label VARCHAR(128) NOT NULL,
  field_type VARCHAR(16) NOT NULL,
  default_value_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_template_fields_tpl_key (template_id, field_key),
  KEY idx_template_fields_tpl_sort (template_id, sort_order),
  CONSTRAINT fk_template_fields_tpl FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 2) reports 表增加 template_id（仅当不存在时）
-- -----------------------------------------------------------------------------
SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'reports'
    AND COLUMN_NAME = 'template_id'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE reports ADD COLUMN template_id BIGINT UNSIGNED NULL AFTER product_name',
  'SELECT ''skip: reports.template_id already exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 3) 索引 idx_reports_template_id（仅当不存在时）
-- -----------------------------------------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'reports'
    AND INDEX_NAME = 'idx_reports_template_id'
);

SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE reports ADD KEY idx_reports_template_id (template_id)',
  'SELECT ''skip: idx_reports_template_id already exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 4) （可选）外键：引用模板，模板删除时置空（仅当不存在时）
--    若你的环境禁外键或报错，可注释掉下面整段 4)
-- -----------------------------------------------------------------------------
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @db
    AND TABLE_NAME = 'reports'
    AND CONSTRAINT_NAME = 'fk_reports_template_id'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE reports ADD CONSTRAINT fk_reports_template_id FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE SET NULL',
  'SELECT ''skip: fk_reports_template_id already exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'migration 001_incremental_templates done' AS result;
