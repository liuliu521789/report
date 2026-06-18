-- 底部签章（主检/审核/部门）相对文字的位置：below | above | right
ALTER TABLE company_settings
  ADD COLUMN footer_seal_position VARCHAR(16) NOT NULL DEFAULT 'below'
  AFTER logo_url;

SELECT 'migration 062_footer_seal_position done' AS result;
