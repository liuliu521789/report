-- 合同协作增强：版本管理 + 多级审批流 (2026-04)
-- 支持版本 Diff、 多级审批 (sequential/parallel/countersign)、审批步骤状态跟踪
-- 向后兼容现有单 reviewer 模型（可映射为 1-step flow）

USE qc_report;

-- 1. 合同版本历史表（每次重大编辑创建新版本，支持 Diff）
CREATE TABLE IF NOT EXISTS contract_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  version_num INT NOT NULL DEFAULT 1,                    -- 1,2,3...
  body_html MEDIUMTEXT NOT NULL,                         -- 渲染后的合同内容
  data_json JSON NULL,                                   -- 结构化字段（便于精确 Diff）
  change_summary VARCHAR(512) NULL,                      -- "修改了交付日期和金额"
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_contract_version (contract_id, version_num),
  KEY idx_contract_versions_contract (contract_id),
  CONSTRAINT fk_contract_versions_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_contract_versions_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 2. 多级审批流步骤表（支持多级、会签）
CREATE TABLE IF NOT EXISTS contract_approval_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  step_order INT NOT NULL,                               -- 审批顺序 1,2,3...
  step_type ENUM('sequential', 'parallel', 'countersign') NOT NULL DEFAULT 'sequential',
  approvers_json JSON NOT NULL,                          -- array of user_ids e.g. [5, 12]
  required_approvals INT NOT NULL DEFAULT 1,             -- 会签需要几人通过
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  completed_by JSON NULL,                                -- 已审批人记录
  comment_text VARCHAR(1024) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_approval_steps_contract (contract_id, step_order),
  CONSTRAINT fk_approval_steps_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. 扩展 sales_contracts 表支持新特性（幂等检查，避免重复列错误）
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS AddContractColumns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = 'qc_report' AND TABLE_NAME = 'sales_contracts' AND COLUMN_NAME = 'current_version') THEN
    ALTER TABLE sales_contracts ADD COLUMN current_version INT NOT NULL DEFAULT 1 AFTER status;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = 'qc_report' AND TABLE_NAME = 'sales_contracts' AND COLUMN_NAME = 'approval_flow_json') THEN
    ALTER TABLE sales_contracts ADD COLUMN approval_flow_json JSON NULL COMMENT '多级审批流配置，兼容旧 reviewer_user_id' AFTER current_version;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = 'qc_report' AND TABLE_NAME = 'sales_contracts' AND COLUMN_NAME = 'last_version_created_at') THEN
    ALTER TABLE sales_contracts ADD COLUMN last_version_created_at DATETIME(3) NULL AFTER approval_flow_json;
  END IF;
END //
DELIMITER ;

CALL AddContractColumns();
DROP PROCEDURE IF EXISTS AddContractColumns;

-- 4. 增强审计日志
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS AddAuditColumns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = 'qc_report' AND TABLE_NAME = 'sales_contract_audit_logs' AND COLUMN_NAME = 'version_num') THEN
    ALTER TABLE sales_contract_audit_logs ADD COLUMN version_num INT NULL AFTER action;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = 'qc_report' AND TABLE_NAME = 'sales_contract_audit_logs' AND COLUMN_NAME = 'step_id') THEN
    ALTER TABLE sales_contract_audit_logs ADD COLUMN step_id BIGINT UNSIGNED NULL AFTER version_num;
  END IF;
END //
DELIMITER ;

CALL AddAuditColumns();
DROP PROCEDURE IF EXISTS AddAuditColumns;

-- 初始化现有合同为版本 1
UPDATE sales_contracts 
SET current_version = 1 
WHERE current_version = 0 OR current_version IS NULL;

-- 为现有合同创建初始版本记录
INSERT IGNORE INTO contract_versions (contract_id, version_num, body_html, data_json, created_by, created_at)
SELECT 
  id,
  1,
  body_html,
  NULL,
  created_by,
  created_at
FROM sales_contracts 
WHERE NOT EXISTS (
  SELECT 1 FROM contract_versions WHERE contract_id = sales_contracts.id AND version_num = 1
);

-- 更新权限默认值（在 employee_categories 中）
-- contract_management 新增：contract_version_view, contract_multi_approve, contract_sign

SELECT 'Migration 032_contract_versioning_and_multi_approval completed successfully. Version Diff + Multi-level Approval framework is ready.' AS result;
