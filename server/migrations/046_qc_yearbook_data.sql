-- 年度品质管控台账：按年份 + 明细记录（与 public 下 xlsx 解耦，便于后台增删改查）

CREATE TABLE IF NOT EXISTS qc_yearbook_years (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year SMALLINT UNSIGNED NOT NULL,
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_qc_yearbook_years_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qc_yearbook_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(128) NOT NULL DEFAULT '',
  subject VARCHAR(512) NOT NULL DEFAULT '',
  body MEDIUMTEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_qc_yearbook_records_year (year_id),
  KEY idx_qc_yearbook_records_year_sort (year_id, sort_order, id),
  CONSTRAINT fk_qc_yearbook_records_year FOREIGN KEY (year_id) REFERENCES qc_yearbook_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_qc_yearbook_records_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_qc_yearbook_records_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO qc_yearbook_years (year, remark) VALUES (2026, '系统预置');

INSERT INTO qc_yearbook_records (year_id, category, subject, body, sort_order)
SELECT y.id, '说明', '欢迎使用年度品质台账',
       '此处为数据库中的台账条目，与原先 public 目录下的 Excel 文件是两套数据，不会自动同步。请使用「新增记录」按分类录入；也可将 Excel 内容复制到「明细」中分批维护。',
       0
FROM qc_yearbook_years y
WHERE y.year = 2026
  AND NOT EXISTS (SELECT 1 FROM qc_yearbook_records r WHERE r.year_id = y.id)
LIMIT 1;
