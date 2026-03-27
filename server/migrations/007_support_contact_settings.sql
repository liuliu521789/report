-- =============================================================================
-- 技术支持：技术工程师微信号（单例 id=1），供后台配置、全员在操作指南中复制
-- =============================================================================

USE qc_report;

CREATE TABLE IF NOT EXISTS support_contact_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  engineer_wechat_id VARCHAR(64) NOT NULL DEFAULT '',
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_support_contact_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO support_contact_settings (id, engineer_wechat_id) VALUES (1, '')
ON DUPLICATE KEY UPDATE id = id;

SELECT 'migration 007_support_contact_settings done' AS result;
