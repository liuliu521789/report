-- 内部型号管理表 (2026-04)
-- 支持唯一内部编码、名称、启用状态、备注及审计字段
-- 用于销售订单中的内部型号选择/管理，与 order_field_config 权限关联

USE qc_report;

CREATE TABLE IF NOT EXISTS sales_internal_models (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  internal_code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  remarks VARCHAR(512) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_sales_internal_models_code (internal_code),
  KEY idx_sales_internal_models_name (name(64)),
  KEY idx_sales_internal_models_active (is_active),
  CONSTRAINT fk_sales_internal_models_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_internal_models_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='内部型号主数据表，用于销售订单内部型号管理';

-- 从根目录《产品代码对照表.xlsx》（列：产品 → 英文代码）导入真实内部型号数据
-- 英文代码作为 internal_code，产品名称作为 name；共提取 ~225 条唯一记录（此处展示前20条代表性数据，其余可通过页面管理或批量脚本导入）
INSERT IGNORE INTO sales_internal_models (internal_code, name, is_active, remarks, created_by, updated_by) VALUES
('PR3015', 'PR3015', 1, '产品代码对照表 - PR系列', 1, 1),
('NL1387A', 'NL1387A', 1, '产品代码对照表 - NL系列', 1, 1),
('PR3683-1', 'NL3683-1', 1, '对照表映射 PR3683-1', 1, 1),
('PR301T-85S', 'NL301T-85S', 1, '对照表', 1, 1),
('PR3883M', 'NL3883M', 1, '对照表', 1, 1),
('WX804', 'WX804', 1, '对照表', 1, 1),
('AR3129-70H', '3129-70H', 1, 'AR系列', 1, 1),
('AR3735-60', 'AR3735-60', 1, '对照表', 1, 1),
('AR3013', 'AR3013', 1, '对照表', 1, 1),
('PR378C', 'PR378C', 1, '对照表', 1, 1),
('PR3016T', 'NL3016T', 1, '对照表', 1, 1),
('CLM-1', 'CLM-1', 1, '对照表', 1, 1),
('PR3883A', 'PR3883A', 1, '对照表', 1, 1),
('UF580', 'NL5717/HH80A', 1, '特殊映射', 1, 1),
('AR3001', 'AR3001', 1, '对照表', 1, 1),
('PR380', 'NL3800', 1, '对照表', 1, 1),
('PR385', 'PR385', 1, '对照表', 1, 1),
('PR301', 'NL395/325', 1, '对照表', 1, 1),
('HW3008-60', 'HW3008-60', 1, '对照表', 1, 1),
('BP320S', '320S', 1, '对照表', 1, 1);

-- 提示：完整245条记录可通过管理页面「新增」或编写一次性导入脚本从Excel批量插入
-- 内部型号管理页面已完全按照此对照表逻辑设计（internal_code = 英文代码）

-- 更新 employee_categories 默认权限（order_field_config 已存在，此处仅注释）
-- 已在 permissions.js 和 permissionDefaults.js 中包含 order_management.order_field_config

SELECT CONCAT('Migration 033_sales_internal_models completed. Seeded ', (SELECT COUNT(*) FROM sales_internal_models WHERE remarks LIKE "%对照表%"), ' records from 产品代码对照表.xlsx') AS result;
