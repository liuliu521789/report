-- 超级管理员快捷入口：绑定销售 / 财务 / 仓库对应的员工账号（用于一键模拟登录）
ALTER TABLE company_settings
  ADD COLUMN quick_role_sales_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN quick_role_finance_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN quick_role_warehouse_user_id BIGINT UNSIGNED NULL DEFAULT NULL;

SELECT 'migration 015_company_quick_role_users done' AS result;
