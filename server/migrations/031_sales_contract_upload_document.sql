-- 模板生成 vs 上传文档合同；移除旧「附件」子表
USE qc_report;

DROP TABLE IF EXISTS sales_contract_attachments;

ALTER TABLE sales_contracts
  ADD COLUMN contract_source ENUM('template','upload') NOT NULL DEFAULT 'template',
  ADD COLUMN document_stored_rel_path VARCHAR(512) NULL DEFAULT NULL,
  ADD COLUMN document_mime_type VARCHAR(128) NULL DEFAULT NULL,
  ADD COLUMN document_original_filename VARCHAR(512) NULL DEFAULT NULL,
  ADD COLUMN document_size_bytes BIGINT UNSIGNED NULL DEFAULT NULL;

-- 历史数据均为模板生成，contract_source 默认 template 已覆盖
