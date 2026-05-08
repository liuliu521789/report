-- =============================================================================
-- 增量迁移：印章支持SVG电子章
-- 目标：company_stamps 增加 svg_image_url 列，用于存储SVG格式的电子章
-- 可重复执行；不删除旧数据
-- =============================================================================

USE qc_report;

SET @db := DATABASE();

-- 1) svg_image_url 列（若不存在则新增）
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'company_stamps'
    AND COLUMN_NAME = 'svg_image_url'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE company_stamps ADD COLUMN svg_image_url VARCHAR(512) NULL DEFAULT NULL COMMENT ''SVG电子章URL'' AFTER image_url',
  'SELECT ''skip: company_stamps.svg_image_url already exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) active_image_type 列（若不存在则新增，用于标记当前激活的是原图还是SVG）
SET @col_exists2 := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'company_stamps'
    AND COLUMN_NAME = 'active_image_type'
);

SET @sql2 := IF(
  @col_exists2 = 0,
  'ALTER TABLE company_stamps ADD COLUMN active_image_type ENUM(''original'', ''svg'') NOT NULL DEFAULT ''original'' COMMENT ''当前激活的图片类型'' AFTER svg_image_url',
  'SELECT ''skip: company_stamps.active_image_type already exists'' AS migration_note'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SELECT 'migration 038_stamps_svg_image done' AS result;