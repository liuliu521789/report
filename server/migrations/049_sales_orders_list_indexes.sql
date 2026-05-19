-- 订单列表筛选 / 待办场景组合索引（兼容无 CREATE INDEX IF NOT EXISTS 的 MySQL）
SET NAMES utf8mb4;

SET @db := DATABASE();

-- idx_sales_orders_creator_status_created_id
SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sales_orders' AND INDEX_NAME = 'idx_sales_orders_creator_status_created_id'
);
SET @sql := IF(
  @exist = 0,
  'CREATE INDEX idx_sales_orders_creator_status_created_id ON sales_orders (created_by, status, created_at, id)',
  'SELECT ''skip idx_sales_orders_creator_status_created_id'' AS note'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_sales_orders_status_created_id
SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sales_orders' AND INDEX_NAME = 'idx_sales_orders_status_created_id'
);
SET @sql := IF(
  @exist = 0,
  'CREATE INDEX idx_sales_orders_status_created_id ON sales_orders (status, created_at, id)',
  'SELECT ''skip idx_sales_orders_status_created_id'' AS note'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_sales_orders_customer_created_id
SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sales_orders' AND INDEX_NAME = 'idx_sales_orders_customer_created_id'
);
SET @sql := IF(
  @exist = 0,
  'CREATE INDEX idx_sales_orders_customer_created_id ON sales_orders (customer_id, created_at, id)',
  'SELECT ''skip idx_sales_orders_customer_created_id'' AS note'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_sales_orders_creator_created_id
SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sales_orders' AND INDEX_NAME = 'idx_sales_orders_creator_created_id'
);
SET @sql := IF(
  @exist = 0,
  'CREATE INDEX idx_sales_orders_creator_created_id ON sales_orders (created_by, created_at, id)',
  'SELECT ''skip idx_sales_orders_creator_created_id'' AS note'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'migration 049_sales_orders_list_indexes done' AS result;
