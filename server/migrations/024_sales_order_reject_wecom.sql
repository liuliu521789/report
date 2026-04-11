-- 财务驳回订单后推送企业微信给销售（创建人），正文变量与提交/通过类模板一致：detail、orderNo、count、fromUser
INSERT IGNORE INTO wecom_notify_templates (code, name_zh, msg_type, title_template, body_template, url_template, btntxt)
VALUES
('sales_order_rejected_sales', '财务驳回→销售（系统）', 'text', NULL, '{{detail}}', NULL, '详情');

SELECT 'migration 024_sales_order_reject_wecom done' AS result;
