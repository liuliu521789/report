-- =============================================================================
-- 回滚 008：从 company_stamps 移除电子章相关列
-- 可重复执行；执行后表结构与 008 之前一致
--
-- 注意：当前仓库若仍包含电子章相关后端/前端代码，请同步回退代码或重新执行 008，
--      否则接口会因列不存在而报错。
-- =============================================================================

USE qc_report;

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'company_stamps'
    AND COLUMN_NAME = 'display_image_source'
);

SET @sql := IF(
  @col_exists > 0,
  'ALTER TABLE company_stamps DROP COLUMN display_image_source',
  'SELECT ''skip: company_stamps.display_image_source already absent'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists2 := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'company_stamps'
    AND COLUMN_NAME = 'electronic_image_url'
);

SET @sql2 := IF(
  @col_exists2 > 0,
  'ALTER TABLE company_stamps DROP COLUMN electronic_image_url',
  'SELECT ''skip: company_stamps.electronic_image_url already absent'' AS migration_note'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SELECT 'migration 009_revert_stamp_electronic_image done' AS result;
