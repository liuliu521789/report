-- =============================================================================
-- 增量迁移：印章类型（5类章）
-- 目标：company_stamps 增加 seal_type，并增加类型+激活索引
-- 可重复执行；不删除旧数据
-- =============================================================================

USE qc_report;

SET @db := DATABASE();

-- 1) seal_type 列（若不存在则新增，旧数据默认归类为 department_qc）
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'company_stamps'
    AND COLUMN_NAME = 'seal_type'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE company_stamps ADD COLUMN seal_type ENUM(''department_qc'', ''inspector'', ''supervisor'', ''pass'', ''recheck'') NOT NULL DEFAULT ''department_qc'' AFTER name',
  'SELECT ''skip: company_stamps.seal_type already exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) 组合索引（按类型取激活章）
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'company_stamps'
    AND INDEX_NAME = 'idx_company_stamps_type_active'
);

SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE company_stamps ADD KEY idx_company_stamps_type_active (seal_type, is_active)',
  'SELECT ''skip: idx_company_stamps_type_active already exists'' AS migration_note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'migration 002_incremental_stamp_types done' AS result;

