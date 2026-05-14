-- 客户分组：康铭 / 物源（与 public/客户名称.xlsx 工作表对应）；空串表示历史未分类客户
ALTER TABLE sales_customers
  ADD COLUMN customer_group VARCHAR(32) NOT NULL DEFAULT '' AFTER address;

ALTER TABLE sales_customers
  ADD KEY idx_sales_customers_group (customer_group);
