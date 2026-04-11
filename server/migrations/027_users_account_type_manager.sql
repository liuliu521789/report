-- 账号类型增加 manager（管理），与 employee 一样绑定员工类别与权限
ALTER TABLE users
  MODIFY COLUMN account_type ENUM('super_admin', 'employee', 'manager') NOT NULL;

SELECT 'migration 027_users_account_type_manager done' AS result;
