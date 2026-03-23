-- =============================================================================
-- 增量迁移：为字段补充英文标签（field_label_en）
-- 不破坏旧数据，可重复执行
-- =============================================================================

USE qc_report;

SET @db := DATABASE();

-- report_fields.field_label_en
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'report_fields'
    AND COLUMN_NAME = 'field_label_en'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE report_fields ADD COLUMN field_label_en VARCHAR(128) NULL AFTER field_label',
  'SELECT ''skip: report_fields.field_label_en exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- report_template_fields.field_label_en
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'report_template_fields'
    AND COLUMN_NAME = 'field_label_en'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE report_template_fields ADD COLUMN field_label_en VARCHAR(128) NULL AFTER field_label',
  'SELECT ''skip: report_template_fields.field_label_en exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'migration 005_incremental_bilingual_labels done' AS result;

