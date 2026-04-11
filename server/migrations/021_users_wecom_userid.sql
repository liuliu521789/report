-- 员工账号绑定企业微信成员 UserID，用于订单「提交财务审核」等场景定向通知
ALTER TABLE users
  ADD COLUMN wecom_userid VARCHAR(64) NULL DEFAULT NULL COMMENT '企业微信通讯录成员UserID' AFTER department_id;

-- 系统预置订单通知模板（可后台修改；不存在时才插入）
INSERT IGNORE INTO wecom_notify_templates (code, name_zh, msg_type, title_template, body_template, url_template, btntxt)
VALUES
('sales_order_submit_finance', '销售提交财务审核（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_order_withdraw_finance', '销售撤回财务审核（系统）', 'text', NULL, '{{detail}}', NULL, '详情');

SELECT 'migration 021_users_wecom_userid done' AS result;
