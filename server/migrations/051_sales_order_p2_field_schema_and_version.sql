-- P2：订单字段配置全局版本号 + 订单创建时记录版本（历史订单按创建时版本解释）
SET NAMES utf8mb4;

SET @db := DATABASE();

-- sales_settings：全局字段 schema 版本（字段增删改时递增）
SET @exist := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sales_settings' AND COLUMN_NAME = 'order_field_schema_version'
);
SET @sql := IF(
  @exist = 0,
  'ALTER TABLE sales_settings ADD COLUMN order_field_schema_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER last_order_seq',
  'SELECT ''skip order_field_schema_version'' AS note'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sales_orders：创建订单时的字段 schema 版本（NULL 视为 1）
SET @exist2 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sales_orders' AND COLUMN_NAME = 'field_schema_version'
);
SET @sql2 := IF(
  @exist2 = 0,
  'ALTER TABLE sales_orders ADD COLUMN field_schema_version INT UNSIGNED NULL DEFAULT NULL COMMENT ''创建时字段定义全局版本'' AFTER data_json',
  'SELECT ''skip field_schema_version'' AS note'
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SELECT 'migration 051_sales_order_p2_field_schema_and_version done' AS result;
