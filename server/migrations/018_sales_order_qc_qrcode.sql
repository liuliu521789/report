-- 订单手动绑定质检二维码（优先于按标签型号自动匹配）
USE qc_report;

ALTER TABLE sales_orders
  ADD COLUMN qc_qrcode_id BIGINT UNSIGNED NULL DEFAULT NULL;

ALTER TABLE sales_orders
  ADD CONSTRAINT fk_sales_orders_qc_qrcode
  FOREIGN KEY (qc_qrcode_id) REFERENCES qrcodes(id) ON DELETE SET NULL;
