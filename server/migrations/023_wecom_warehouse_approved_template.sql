-- 财务审核通过后通知仓库的企业微信模板（站内信原有，企业微信此前未接）
INSERT IGNORE INTO wecom_notify_templates (code, name_zh, msg_type, title_template, body_template, url_template, btntxt)
VALUES
('sales_order_approved_warehouse', '财务通过→仓库备货（系统）', 'text', NULL, '{{detail}}', NULL, '详情');

SELECT 'migration 023_wecom_warehouse_approved_template done' AS result;
