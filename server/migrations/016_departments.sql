-- 组织架构：部门（树形）+ 员工主部门
-- 启动时由 ensureDepartmentsTable() 自动建表/加列；本文件供手工升级参考

CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id BIGINT UNSIGNED NULL,
  name_zh VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_departments_parent (parent_id),
  CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 若列已存在请跳过
-- ALTER TABLE users ADD COLUMN department_id BIGINT UNSIGNED NULL AFTER employee_category_id;
-- ALTER TABLE users ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
