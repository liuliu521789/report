-- 企业微信文本卡片：整块与按钮共用一个 url，原先指向发货接口会导致点正文即发货。
-- 改为卡片打开「确认页」；仅在确认页点击「完成发货」再访问 /api/public/wecom-order-ship。
SET NAMES utf8mb4;
UPDATE wecom_notify_templates
SET url_template = '{{shipConfirmUrl}}'
WHERE code = 'sales_order_approved_warehouse';

SELECT 'migration 029_wecom_warehouse_ship_confirm_page done' AS result;
