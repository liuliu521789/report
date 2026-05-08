-- 合同提交审核通知：改为文本卡片，审核链接显示为按钮
SET NAMES utf8mb4;
UPDATE wecom_notify_templates
SET
  msg_type = 'textcard',
  name_zh = '提交合同发送信息给审核人',
  title_template = '合同待审核',
  body_template = '{{customerName}} 销售合同待您审核',
  url_template = '{{reviewUrl}}',
  btntxt = '去审核'
WHERE code = 'sales_contract_submit_reviewer';

SELECT 'migration 039_contract_review_textcard done' AS result;
