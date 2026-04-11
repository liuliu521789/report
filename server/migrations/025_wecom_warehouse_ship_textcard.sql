-- 财务通过后通知仓库：改为文本卡片，每笔订单单独发送；按钮「完成发货」打开 {{shipUrl}}（需配置 PUBLIC_BASE_URL）
SET NAMES utf8mb4;
UPDATE wecom_notify_templates
SET
  msg_type = 'textcard',
  name_zh = '财务通过→仓库备货（系统）',
  title_template = '订单已审核通过',
  body_template = '{{detail}}',
  url_template = '{{shipUrl}}',
  btntxt = '完成发货'
WHERE code = 'sales_order_approved_warehouse';

SELECT 'migration 025_wecom_warehouse_ship_textcard done' AS result;
