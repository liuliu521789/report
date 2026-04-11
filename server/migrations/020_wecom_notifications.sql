-- 企业微信：应用消息通知（绑定企业、通知对象成员 userid、模板）
-- 单企业单例 wecom_config.id=1

CREATE TABLE IF NOT EXISTS wecom_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  corp_id VARCHAR(32) NOT NULL DEFAULT '',
  agent_id INT UNSIGNED NOT NULL DEFAULT 0,
  corp_secret VARCHAR(255) NOT NULL DEFAULT '',
  remark VARCHAR(255) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

INSERT IGNORE INTO wecom_config (id, corp_id, agent_id, corp_secret) VALUES (1, '', 0, '');

CREATE TABLE IF NOT EXISTS wecom_notify_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name_zh VARCHAR(128) NOT NULL,
  wecom_userids_json JSON NOT NULL COMMENT '企业微信成员 UserID 数组',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_wecom_recipients_sort (sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wecom_notify_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name_zh VARCHAR(128) NOT NULL,
  msg_type ENUM('text', 'textcard', 'markdown') NOT NULL DEFAULT 'text',
  title_template TEXT NULL,
  body_template TEXT NOT NULL,
  url_template TEXT NULL,
  btntxt VARCHAR(16) NULL DEFAULT '详情',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_wecom_notify_templates_code (code)
) ENGINE=InnoDB;

SELECT 'migration 020_wecom_notifications done' AS result;
