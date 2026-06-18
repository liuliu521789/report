-- 合同开票流程：企业微信系统模板（2026-06）

USE qc_report;

INSERT IGNORE INTO wecom_notify_templates (code, name_zh, msg_type, title_template, body_template, url_template, btntxt)
VALUES
('sales_invoice_submit_finance', '开票申请提交→财务（系统）', 'textcard', '合同开票待处理', '{{detail}}', '{{invoiceCenterUrl}}', '打开开票中心'),
('sales_invoice_withdraw_finance', '开票申请撤销→财务（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_invoice_fulfilled_applicant', '开票完成→申请人（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_invoice_deleted_finance', '开票申请删除→财务（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_invoice_deleted_applicant', '开票申请删除→申请人（系统）', 'text', NULL, '{{detail}}', NULL, '详情');

SELECT 'Migration 059_sales_invoice_wecom_templates completed.' AS result;
