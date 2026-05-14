-- 企业微信敏感字段加长（支持 AES-GCM 密文）；回调事件审计表
SET NAMES utf8mb4;

ALTER TABLE wecom_config
  MODIFY COLUMN corp_secret VARCHAR(2048) NOT NULL DEFAULT '',
  MODIFY COLUMN receive_token VARCHAR(2048) NOT NULL DEFAULT '',
  MODIFY COLUMN encoding_aes_key VARCHAR(2048) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS wecom_callback_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  msg_type VARCHAR(64) NULL,
  event_type VARCHAR(128) NULL,
  from_user VARCHAR(128) NULL,
  raw_xml MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_wecom_callback_created (created_at),
  KEY idx_wecom_callback_event (event_type)
) ENGINE=InnoDB;

SELECT 'migration 042_wecom_secrets_wide_and_callback_events done' AS result;
