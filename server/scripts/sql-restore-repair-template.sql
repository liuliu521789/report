-- SQL Restore Repair Template
-- Purpose:
-- - Provide safe baseline records for single-row config tables
-- - Use when old SQL restore caused missing first-row inserts
--
-- Notes:
-- - Review values before execution in production.
-- - This script will not overwrite existing rows with same PK (INSERT IGNORE).

START TRANSACTION;

-- company_settings baseline
INSERT IGNORE INTO company_settings (
  id,
  company_name_zh,
  company_name_en,
  company_email,
  company_address,
  report_title_zh,
  report_title_en,
  description_zh,
  description_en,
  logo_url,
  created_by
) VALUES (
  1,
  '',
  '',
  NULL,
  NULL,
  '',
  '',
  NULL,
  NULL,
  NULL,
  NULL
);

-- system_security_settings baseline
INSERT IGNORE INTO system_security_settings (
  id,
  settings_json,
  updated_by
) VALUES (
  1,
  JSON_OBJECT(),
  NULL
);

-- support_contact_settings baseline
INSERT IGNORE INTO support_contact_settings (
  id,
  engineer_wechat_id,
  updated_by
) VALUES (
  1,
  '',
  NULL
);

-- wecom_config baseline
INSERT IGNORE INTO wecom_config (
  id,
  corp_id,
  agent_id,
  corp_secret,
  remark,
  receive_token,
  encoding_aes_key
) VALUES (
  1,
  '',
  0,
  '',
  NULL,
  '',
  ''
);

-- sales_settings baseline
INSERT IGNORE INTO sales_settings (
  id,
  order_no_prefix,
  last_order_seq
) VALUES (
  1,
  'SO',
  0
);

COMMIT;

