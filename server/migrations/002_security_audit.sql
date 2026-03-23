-- 安全设置、登录锁定、审计日志（在已有 qc_report 库执行）

USE qc_report;

ALTER TABLE users
  ADD COLUMN failed_login_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_active,
  ADD COLUMN locked_until DATETIME(3) NULL DEFAULT NULL AFTER failed_login_count;

CREATE TABLE IF NOT EXISTS system_security_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  settings_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_security_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO system_security_settings (id, settings_json) VALUES (1, CAST('{
  "minPasswordLength": 6,
  "bannedPasswords": ["123456","admin","password","qwerty","111111","12345678","888888","666666"],
  "idleTimeoutMinutes": 60,
  "loginFailMaxAttempts": 5,
  "loginLockMinutes": 60,
  "confirmSensitiveOperations": true,
  "errorLogRetentionDays": 180
}' AS JSON));

CREATE TABLE IF NOT EXISTS login_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  username VARCHAR(64) NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(512) NULL,
  device_summary VARCHAR(256) NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  fail_reason VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_login_logs_username_time (username, created_at),
  KEY idx_login_logs_time (created_at),
  KEY idx_login_logs_success (success),
  KEY idx_login_logs_user (user_id),
  CONSTRAINT fk_login_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  username VARCHAR(64) NOT NULL DEFAULT '',
  module VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  detail_json JSON NULL,
  success TINYINT(1) NOT NULL DEFAULT 1,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_op_logs_user_time (user_id, created_at),
  KEY idx_op_logs_module_time (module, created_at),
  KEY idx_op_logs_time (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS error_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module VARCHAR(64) NOT NULL DEFAULT 'server',
  message TEXT NOT NULL,
  stack TEXT NULL,
  code VARCHAR(64) NULL,
  meta_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_error_logs_time (created_at),
  KEY idx_error_logs_module (module)
) ENGINE=InnoDB;
