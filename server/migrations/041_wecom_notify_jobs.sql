-- 企业微信异步通知 outbox（与 ensureWecomNotifyJobsTable 一致）
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS wecom_notify_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(64) NOT NULL,
  template_code VARCHAR(64) NOT NULL,
  to_user TEXT NOT NULL,
  variables_json JSON NOT NULL,
  biz_type VARCHAR(64) NULL,
  biz_id BIGINT UNSIGNED NULL,
  status ENUM('pending','sending','sent','failed','dead') NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_error TEXT NULL,
  wecom_response_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_wecom_jobs_status_next (status, next_retry_at),
  KEY idx_wecom_jobs_biz (biz_type, biz_id)
) ENGINE=InnoDB;

SELECT 'migration 041_wecom_notify_jobs done' AS result;
