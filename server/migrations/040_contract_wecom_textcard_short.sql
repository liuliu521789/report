-- 合同审批企业微信：标题与正文用变量短文案，链接仅放在文本卡片按钮 url，避免描述区一大串订单与链接
SET NAMES utf8mb4;
UPDATE wecom_notify_templates
SET
  title_template = '{{notificationTitle}}',
  body_template = '{{detail}}',
  url_template = '{{reviewUrl}}',
  btntxt = '打开审批',
  name_zh = '提交合同发送信息给审核人',
  updated_at = CURRENT_TIMESTAMP(3)
WHERE code = 'sales_contract_submit_reviewer';

SELECT 'migration 040_contract_wecom_textcard_short done' AS result;
