-- 报告编号：统一默认 JL-8.8-05（允许重复，不再唯一）
-- 报告ID（report_uid）：质检报告唯一标识，格式 ZJ- + 10 位数字（与库内 id 对齐）

ALTER TABLE reports ADD COLUMN report_uid VARCHAR(32) NULL COMMENT '质检报告唯一ID' AFTER id;

UPDATE reports SET report_uid = CONCAT('ZJ-', LPAD(id, 10, '0')) WHERE report_uid IS NULL;

ALTER TABLE reports ADD UNIQUE KEY uk_reports_report_uid (report_uid);

ALTER TABLE reports DROP INDEX uk_reports_report_no;

ALTER TABLE reports ADD KEY idx_reports_report_no (report_no);
