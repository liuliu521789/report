-- 企业微信「接收消息」回调：Token、EncodingAESKey（与自建应用后台「设置 API 接收」一致）
ALTER TABLE wecom_config
  ADD COLUMN receive_token VARCHAR(64) NOT NULL DEFAULT '' COMMENT '回调 Token' AFTER remark,
  ADD COLUMN encoding_aes_key VARCHAR(64) NOT NULL DEFAULT '' COMMENT '43位 EncodingAESKey' AFTER receive_token;

SELECT 'migration 022_wecom_receive_callback done' AS result;
