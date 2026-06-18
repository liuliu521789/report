-- =============================================================================
-- 技术支持：企业微信 UserID + 显示名称（操作指南通过应用消息通知工程师）
-- =============================================================================

USE qc_report;

ALTER TABLE support_contact_settings
  ADD COLUMN engineer_wecom_userid VARCHAR(64) NOT NULL DEFAULT '' AFTER engineer_wechat_id,
  ADD COLUMN engineer_display_name VARCHAR(64) NOT NULL DEFAULT '' AFTER engineer_wecom_userid;

SELECT 'migration 061_support_contact_wecom done' AS result;
