-- 开票明细：计量单位由销售/跟单填写
ALTER TABLE sales_contract_invoices
  ADD COLUMN item_unit VARCHAR(32) NULL AFTER item_name;
