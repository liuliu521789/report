-- =============================================================================
-- 增量迁移：reports 基础字段补充英文版本（product_name_en / batch_no_en）
-- 可重复执行、不中断旧数据
-- =============================================================================

USE qc_report;

SET @db := DATABASE();

-- product_name_en
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'reports'
    AND COLUMN_NAME = 'product_name_en'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE reports ADD COLUMN product_name_en VARCHAR(128) NULL AFTER product_name',
  'SELECT ''skip: reports.product_name_en exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- batch_no_en
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'reports'
    AND COLUMN_NAME = 'batch_no_en'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE reports ADD COLUMN batch_no_en VARCHAR(128) NULL AFTER batch_no',
  'SELECT ''skip: reports.batch_no_en exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'migration 006_incremental_report_core_bilingual done' AS result;

