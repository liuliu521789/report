-- 报告样式设计器 · 系统图片库（服务端持久化）
CREATE TABLE IF NOT EXISTS report_image_library (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL DEFAULT '',
  image_url VARCHAR(512) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_report_image_library_created (created_at),
  CONSTRAINT fk_report_image_library_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
