-- 销售订单：标签型号 / 仓库型号分为两列（sales_orders.warehouse_model + 字段定义）
-- 若列已存在（例如已由 ensureSchema 创建），跳过本文件 ALTER 或单独执行下方 UPDATE。
USE qc_report;

ALTER TABLE sales_orders
  ADD COLUMN warehouse_model VARCHAR(256) NOT NULL DEFAULT '' AFTER product_model;

-- 将旧「标签/仓库」合并值按第一个 / 或 ／ 拆到两列
UPDATE sales_orders
SET warehouse_model = TRIM(SUBSTRING(REPLACE(product_model, '／', '/'), LOCATE('/', REPLACE(product_model, '／', '/')) + 1)),
    product_model = TRIM(SUBSTRING(REPLACE(product_model, '／', '/'), 1, LOCATE('/', REPLACE(product_model, '／', '/')) - 1))
WHERE (product_model LIKE '%/%' OR product_model LIKE '%／%')
  AND LOCATE('/', REPLACE(product_model, '／', '/')) > 0;

-- 与物理列对齐，避免 data_json 仍保留合并前的 product_model 文本
UPDATE sales_orders
SET data_json = JSON_SET(data_json, '$.product_model', product_model, '$.warehouse_model', warehouse_model)
WHERE data_json IS NOT NULL;
