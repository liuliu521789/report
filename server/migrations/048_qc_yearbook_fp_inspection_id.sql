-- 成品台账：检验 ID（年度内序号，创建后不变）；与 sort_order（列表顺序）分离
-- 若已通过应用启动时的 ensureSchema 加过列，ADD COLUMN 可能报错 Duplicate column，可跳过 ADD 从 UPDATE 起执行。

ALTER TABLE qc_yearbook_finished_product_rows
  ADD COLUMN inspection_num INT UNSIGNED NULL DEFAULT NULL COMMENT '年度内检验序号' AFTER sort_order,
  ADD COLUMN inspection_id VARCHAR(32) NULL DEFAULT NULL COMMENT '检验ID：统计年度-序号' AFTER inspection_num;

UPDATE qc_yearbook_finished_product_rows fp
INNER JOIN qc_yearbook_years y ON y.id = fp.year_id
INNER JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY year_id ORDER BY sort_order ASC, id ASC) AS rn
  FROM qc_yearbook_finished_product_rows
) t ON t.id = fp.id
SET fp.inspection_num = t.rn,
    fp.inspection_id = CONCAT(y.year, '-', LPAD(t.rn, 5, '0'))
WHERE fp.inspection_num IS NULL OR fp.inspection_id IS NULL;

ALTER TABLE qc_yearbook_finished_product_rows
  MODIFY COLUMN inspection_num INT UNSIGNED NOT NULL,
  MODIFY COLUMN inspection_id VARCHAR(32) NOT NULL;

ALTER TABLE qc_yearbook_finished_product_rows
  ADD UNIQUE KEY uk_qc_yearbook_fp_inspection_id (inspection_id),
  ADD UNIQUE KEY uk_qc_yearbook_fp_year_inspnum (year_id, inspection_num);
