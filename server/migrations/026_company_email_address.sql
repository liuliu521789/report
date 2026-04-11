-- 公司信息：新增邮箱、地址字段
ALTER TABLE company_settings
  ADD COLUMN company_email VARCHAR(128) NULL DEFAULT NULL,
  ADD COLUMN company_address VARCHAR(256) NULL DEFAULT NULL;

SELECT 'migration 026_company_email_address done' AS result;
