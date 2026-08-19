-- 业务常用内置岗位补齐：客服、管理层（总经理/副总/总监/总裁/主管/部门负责人）、采购/人事/行政/生产/技术。
-- 启动时 ensureSchema 亦会 INSERT IGNORE + is_builtin 幂等补齐；本文件便于手工执行。
-- 默认权限：管理层复用 manager 模板；客服用 cs 模板；采购等为空权限（后台可配）。
SET NAMES utf8mb4;
USE qc_report;

-- 有权限模板的类别由应用层用 defaultPermissionsForRole 写入更完整；此处仅保证行存在。
-- 客服
INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin)
VALUES ('客服', 'cs', 8, CAST('{}' AS JSON), 0, 1);

-- 管理层
INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin) VALUES
('总裁', 'president', 6, CAST('{}' AS JSON), 0, 1),
('总经理', 'general_manager', 1, CAST('{}' AS JSON), 0, 1),
('副总经理', 'deputy_general_manager', 3, CAST('{}' AS JSON), 0, 1),
('总监', 'director', 5, CAST('{}' AS JSON), 0, 1),
('主管', 'supervisor', 7, CAST('{}' AS JSON), 0, 1),
('部门负责人', 'department_head', 2, CAST('{}' AS JSON), 0, 1);

-- 扩展职能（默认空权限）
INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin) VALUES
('采购', 'procurement', 20, CAST('{}' AS JSON), 0, 1),
('人事', 'hr', 21, CAST('{}' AS JSON), 0, 1),
('行政', 'admin', 22, CAST('{}' AS JSON), 0, 1),
('生产', 'production', 23, CAST('{}' AS JSON), 0, 1),
('技术', 'technical', 24, CAST('{}' AS JSON), 0, 1);

UPDATE employee_categories SET is_builtin = 1
WHERE code IN (
  'qc', 'cs', 'chairman', 'manager',
  'general_manager', 'deputy_general_manager', 'director', 'president',
  'supervisor', 'department_head',
  'sales', 'documentary', 'finance', 'warehouse', 'sales_admin',
  'procurement', 'hr', 'admin', 'production', 'technical'
);
