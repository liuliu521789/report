import { nanoid } from 'nanoid';
import { getPool } from './pool.js';
import {
  ALL_BUILTIN_CATEGORY_CODES,
  EXTRA_BUILTIN_CATEGORY_SEEDS,
  KNOWN_BUILTIN_CATEGORY_SEEDS,
  KNOWN_ROLE_CODES,
  defaultPermissionsForRole,
  emptyPermissions
} from '../lib/permissionSchema.js';

/** 与 migrations/010_report_image_library.sql 一致；启动时若表不存在则创建，免手工执行迁移 */
const DDL_REPORT_IMAGE_LIBRARY = `
CREATE TABLE IF NOT EXISTS report_image_library (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL DEFAULT '',
  image_url VARCHAR(512) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_report_image_library_created (created_at),
  CONSTRAINT fk_report_image_library_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

const DDL_REPORT_STYLES = `
CREATE TABLE IF NOT EXISTS report_styles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  elements_json JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_report_styles_updated (updated_at),
  CONSTRAINT fk_report_styles_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

const DDL_BACKUP_JOBS = `
CREATE TABLE IF NOT EXISTS backup_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_type ENUM('backup', 'restore') NOT NULL DEFAULT 'backup',
  trigger_type ENUM('manual', 'cron', 'system') NOT NULL DEFAULT 'manual',
  backup_id VARCHAR(32) NULL,
  target_backup_id VARCHAR(32) NULL,
  status ENUM('running', 'success', 'failed') NOT NULL DEFAULT 'running',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  duration_ms INT UNSIGNED NULL,
  size_bytes BIGINT UNSIGNED NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  error_message VARCHAR(1024) NULL,
  meta_json JSON NULL,
  PRIMARY KEY (id),
  KEY idx_backup_jobs_started (started_at),
  KEY idx_backup_jobs_status (status),
  KEY idx_backup_jobs_type_trigger (job_type, trigger_type),
  KEY idx_backup_jobs_backup_id (backup_id),
  CONSTRAINT fk_backup_jobs_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

/** 与 migrations/050_sales_order_export_jobs.sql 一致 */
const DDL_SALES_ORDER_EXPORT_JOBS = `
CREATE TABLE IF NOT EXISTS sales_order_export_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_by BIGINT UNSIGNED NOT NULL,
  requester_json JSON NOT NULL,
  filter_json JSON NOT NULL,
  status ENUM('pending', 'running', 'done', 'failed') NOT NULL DEFAULT 'pending',
  total_hit INT UNSIGNED NULL DEFAULT NULL,
  row_count_exported INT UNSIGNED NULL DEFAULT NULL,
  last_error VARCHAR(512) NULL DEFAULT NULL,
  file_path VARCHAR(768) NULL DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_so_export_jobs_user_created (created_by, created_at),
  KEY idx_so_export_jobs_status_created (status, created_at),
  CONSTRAINT fk_so_export_jobs_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

/** 与 migrations/007_support_contact_settings.sql、schema.sql 一致 */
const DDL_SUPPORT_CONTACT_SETTINGS = `
CREATE TABLE IF NOT EXISTS support_contact_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  engineer_wechat_id VARCHAR(64) NOT NULL DEFAULT '',
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_support_contact_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;
`;

export async function ensureReportImageLibraryTable() {
  const pool = getPool();
  await pool.query(DDL_REPORT_IMAGE_LIBRARY);
}

export async function ensureReportStylesTable() {
  const pool = getPool();
  await pool.query(DDL_REPORT_STYLES);
}

export async function ensureBackupJobsTable() {
  const pool = getPool();
  await pool.query(DDL_BACKUP_JOBS);
}

export async function ensureSalesOrderExportJobsTable() {
  const pool = getPool();
  await pool.query(DDL_SALES_ORDER_EXPORT_JOBS);
}

export async function ensureSupportContactSettingsTable() {
  const pool = getPool();
  await pool.query(DDL_SUPPORT_CONTACT_SETTINGS);
  await pool.query(
    "INSERT IGNORE INTO support_contact_settings (id, engineer_wechat_id) VALUES (1, '')"
  );
  if (!(await columnExists(pool, 'support_contact_settings', 'engineer_wecom_userid'))) {
    await pool.query(
      "ALTER TABLE support_contact_settings ADD COLUMN engineer_wecom_userid VARCHAR(64) NOT NULL DEFAULT '' AFTER engineer_wechat_id"
    );
  }
  if (!(await columnExists(pool, 'support_contact_settings', 'engineer_display_name'))) {
    await pool.query(
      "ALTER TABLE support_contact_settings ADD COLUMN engineer_display_name VARCHAR(64) NOT NULL DEFAULT '' AFTER engineer_wecom_userid"
    );
  }
}

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

function parseJsonObject(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    return null;
  }
}

function backfillBuiltinCategoryPermissionDefaults(currentRaw, roleCode) {
  const current = parseJsonObject(currentRaw) || {};
  const defaults = defaultPermissionsForRole(roleCode);
  const next = JSON.parse(JSON.stringify(current));
  let changed = false;
  for (const key of ['contract_version_view', 'contract_multi_approve']) {
    if (!Object.prototype.hasOwnProperty.call(next.contract_management || {}, key)) {
      if (!next.contract_management || typeof next.contract_management !== 'object') {
        next.contract_management = {};
      }
      next.contract_management[key] = !!defaults?.contract_management?.[key];
      changed = true;
    }
  }
  return changed ? next : null;
}

async function ensureBuiltinCategoryPermissionDefaults(pool) {
  const placeholders = KNOWN_ROLE_CODES.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT id, code, default_permissions_json
     FROM employee_categories
     WHERE code IN (${placeholders})`,
    KNOWN_ROLE_CODES
  );
  for (const row of rows || []) {
    const next = backfillBuiltinCategoryPermissionDefaults(row.default_permissions_json, row.code);
    if (!next) continue;
    await pool.query(
      'UPDATE employee_categories SET default_permissions_json = CAST(? AS JSON) WHERE id = ?',
      [JSON.stringify(next), row.id]
    );
  }
}

/** 董事长角色 / 2FA：employee_categories.require_two_factor、users.totp_*、内置类别 chairman */
export async function ensureChairmanAndTotpColumns() {
  const pool = getPool();
  if (!(await columnExists(pool, 'employee_categories', 'require_two_factor'))) {
    await pool.query(
      'ALTER TABLE employee_categories ADD COLUMN require_two_factor TINYINT(1) NOT NULL DEFAULT 0 AFTER default_permissions_json'
    );
  }
  if (!(await columnExists(pool, 'users', 'totp_secret'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64) NULL DEFAULT NULL AFTER permissions_json'
    );
  }
  if (!(await columnExists(pool, 'users', 'totp_enabled_at'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN totp_enabled_at DATETIME(3) NULL DEFAULT NULL AFTER totp_secret'
    );
  }
  const chairmanJson = JSON.stringify({
    reports: {
      list: true,
      view: true,
      create: false,
      edit: false,
      void: false,
      activate: false,
      bulkPass: false,
      bulkVoid: false,
      bulkActivate: false,
      bulkDelete: false,
      previewPrint: true,
      seals: false,
      export: true,
      chairmanApprove: true,
      fieldEdit: {}
    },
    qrcodes: { list: true, create: false, viewDetail: true, delete: false },
    templates: { use: true },
    stamps: { manage: false, view: true },
    company: { manage: false, view: true },
    audit: { viewLogin: true, viewOperations: true, viewErrors: true, exportAudit: true }
  });
  await pool.query(
    `INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor)
     VALUES ('董事长', 'chairman', 3, CAST(? AS JSON), 1)`,
    [chairmanJson]
  );
}

/** 与 migrations/013、027 等一致；启动时单独执行一次，避免 sales 大段 DDL 中途失败后缺表 */
const DDL_SALES_INTERNAL_MESSAGES = `CREATE TABLE IF NOT EXISTS sales_internal_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    to_user_id BIGINT UNSIGNED NOT NULL,
    from_user_id BIGINT UNSIGNED NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'notice',
    title VARCHAR(256) NOT NULL DEFAULT '',
    body_text VARCHAR(2048) NULL,
    ref_type VARCHAR(32) NULL,
    ref_id BIGINT UNSIGNED NULL,
    read_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_sales_messages_to (to_user_id, read_at, created_at),
    CONSTRAINT fk_sales_messages_to FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_messages_from FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`;

const DDL_SALES_INTERNAL_MODELS = `CREATE TABLE IF NOT EXISTS sales_internal_models (
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
  ) ENGINE=InnoDB`;

const DDL_SALES_PIECES = [
  `CREATE TABLE IF NOT EXISTS sales_settings (
    id TINYINT UNSIGNED NOT NULL DEFAULT 1,
    order_no_prefix VARCHAR(32) NOT NULL DEFAULT 'SO',
    last_order_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sales_customers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_code VARCHAR(64) NOT NULL DEFAULT '',
    customer_name VARCHAR(256) NOT NULL DEFAULT '',
    contact_name VARCHAR(128) NULL,
    contact_person VARCHAR(128) NULL,
    phone VARCHAR(64) NULL,
    address VARCHAR(512) NULL,
    customer_group VARCHAR(32) NOT NULL DEFAULT '',
    created_by BIGINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_sales_customers_code (customer_code),
    KEY idx_sales_customers_name (customer_name(64)),
    KEY idx_sales_customers_group (customer_group),
    KEY idx_sales_customers_active (is_active),
    CONSTRAINT fk_sales_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_customers_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  DDL_SALES_INTERNAL_MODELS,
  `CREATE TABLE IF NOT EXISTS sales_customer_model_mappings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    customer_model VARCHAR(256) NOT NULL DEFAULT '',
    internal_model VARCHAR(256) NOT NULL DEFAULT '',
    is_hidden TINYINT(1) NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_mapping_customer_model (customer_id, customer_model(128)),
    KEY idx_mappings_customer (customer_id),
    CONSTRAINT fk_mappings_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_mappings_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_mappings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB COMMENT='客户型号对照手动维护（覆盖 Excel 导入的对照数据）'`,
  `CREATE TABLE IF NOT EXISTS sales_order_field_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    field_key VARCHAR(64) NOT NULL,
    label_zh VARCHAR(128) NOT NULL,
    field_type ENUM('text', 'textarea', 'number', 'positive_number', 'date') NOT NULL DEFAULT 'text',
    required TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    maps_to VARCHAR(32) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_sales_order_field_key (field_key),
    KEY idx_sales_order_field_sort (sort_order),
    KEY idx_sales_order_field_active (is_active)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sales_orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_no VARCHAR(64) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    product_code VARCHAR(128) NOT NULL DEFAULT '',
    product_name VARCHAR(256) NOT NULL DEFAULT '',
    product_model VARCHAR(256) NOT NULL DEFAULT '',
    warehouse_model VARCHAR(256) NOT NULL DEFAULT '',
    quantity DECIMAL(18, 4) NOT NULL,
    unit_price DECIMAL(18, 4) NOT NULL,
    amount DECIMAL(18, 4) NOT NULL,
    remark VARCHAR(1024) NULL,
    extra_json JSON NULL,
    data_json JSON NULL,
    qc_qrcode_id BIGINT UNSIGNED NULL DEFAULT NULL,
    status ENUM('pending_review', 'pending_qc', 'approved', 'rejected', 'shipped', 'completed', 'cancelled') NOT NULL DEFAULT 'pending_review',
    submitted_for_review_at DATETIME(3) NULL DEFAULT NULL,
    finance_reviewed_at DATETIME(3) NULL,
    finance_reviewed_by BIGINT UNSIGNED NULL,
    finance_comment VARCHAR(1024) NULL,
    qc_reviewed_at DATETIME(3) NULL,
    qc_reviewed_by BIGINT UNSIGNED NULL,
    qc_comment VARCHAR(1024) NULL,
    shipped_at DATETIME(3) NULL,
    shipped_by BIGINT UNSIGNED NULL,
    shipping_instruction VARCHAR(1024) NULL,
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    row_version INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uk_sales_orders_no (order_no),
    KEY idx_sales_orders_customer (customer_id),
    KEY idx_sales_orders_status (status),
    KEY idx_sales_orders_created (created_at),
    KEY idx_sales_orders_created_by (created_by),
    CONSTRAINT fk_sales_orders_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sales_orders_finance_by FOREIGN KEY (finance_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_orders_qc_by FOREIGN KEY (qc_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_orders_shipped_by FOREIGN KEY (shipped_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sales_order_status_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(32) NULL,
    to_status VARCHAR(32) NOT NULL,
    actor_id BIGINT UNSIGNED NULL,
    remark VARCHAR(1024) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_sales_order_status_logs_order (order_id, created_at),
    CONSTRAINT fk_sales_order_status_logs_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_order_status_logs_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sales_order_edit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    actor_id BIGINT UNSIGNED NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_sales_order_edit_logs_order (order_id, created_at),
    CONSTRAINT fk_sales_order_edit_logs_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_order_edit_logs_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sales_contract_templates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    body_html MEDIUMTEXT NOT NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_sales_contract_templates_name (name),
    CONSTRAINT fk_sales_contract_templates_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sales_contracts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contract_no VARCHAR(64) NOT NULL,
    template_id BIGINT UNSIGNED NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(256) NOT NULL DEFAULT '',
    body_html MEDIUMTEXT NOT NULL,
    status ENUM('draft', 'pending_review', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
    reviewer_user_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_sales_contracts_no (contract_no),
    KEY idx_sales_contracts_customer (customer_id),
    KEY idx_sales_contracts_status (status),
    CONSTRAINT fk_sales_contracts_template FOREIGN KEY (template_id) REFERENCES sales_contract_templates(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_contracts_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sales_contracts_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_contracts_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sales_contract_orders (
    contract_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (contract_id, order_id),
    KEY idx_sales_contract_orders_order (order_id),
    CONSTRAINT fk_sco_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE,
    CONSTRAINT fk_sco_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sales_contract_audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    contract_id BIGINT UNSIGNED NOT NULL,
    actor_id BIGINT UNSIGNED NULL,
    action VARCHAR(32) NOT NULL,
    result VARCHAR(32) NULL,
    comment_text VARCHAR(2048) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_sales_contract_audit_contract (contract_id, created_at),
    CONSTRAINT fk_sales_contract_audit_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_contract_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS order_calc_rules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    formulas_json JSON NOT NULL,
    is_current TINYINT(1) NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_order_calc_rules_name (name),
    KEY idx_order_calc_rules_current (is_current),
    CONSTRAINT fk_order_calc_rules_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  DDL_SALES_INTERNAL_MESSAGES
];

const SALES_CATEGORY_SEEDS = [
  [
    '销售人员',
    'sales',
    10,
    '{"reports":{"list":false,"view":false,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":false,"create":false,"viewDetail":false,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":true,"order_query":true,"order_query_all":true,"order_edit":true,"order_submit":true,"order_withdraw":true,"order_status_finance":false,"order_status_warehouse":false,"order_ship":false,"order_view_status_logs":true,"order_cancel":true,"order_delete":true},"contract_management":{"template_manage":true,"contract_generate":true,"contract_submit":true,"contract_review":false,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":false,"data_export_all":false},"customer_management":{"view":true,"create":true,"edit":true,"disable":true}}',
    0
  ],
  [
    '财务审核员',
    'finance',
    11,
    '{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":false,"order_query":true,"order_query_all":true,"order_edit":false,"order_submit":false,"order_withdraw":false,"order_status_finance":true,"order_status_warehouse":false,"order_ship":false,"order_view_status_logs":true,"order_cancel":true,"order_delete":true},"contract_management":{"template_manage":false,"contract_generate":false,"contract_submit":false,"contract_review":true,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":true,"data_export_all":false},"customer_management":{"view":true,"create":false,"edit":false,"disable":false}}',
    0
  ],
  [
    '仓库人员',
    'warehouse',
    12,
    '{"reports":{"list":false,"view":false,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":false,"create":false,"viewDetail":false,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":false,"order_query":true,"order_query_all":true,"order_edit":false,"order_submit":false,"order_withdraw":false,"order_status_finance":false,"order_status_warehouse":true,"order_ship":true,"order_view_status_logs":true,"order_cancel":false,"order_delete":false},"contract_management":{"template_manage":false,"contract_generate":false,"contract_submit":false,"contract_review":false,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":false,"data_export_all":false},"customer_management":{"view":true,"create":false,"edit":false,"disable":false}}',
    0
  ],
  [
    '系统管理员',
    'sales_admin',
    13,
    '{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":true,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":true},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":true},"audit":{"viewLogin":true,"viewOperations":true,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":true,"order_query":true,"order_query_all":true,"order_edit":true,"order_submit":true,"order_withdraw":true,"order_status_finance":true,"order_status_warehouse":true,"order_ship":true,"order_view_status_logs":true,"order_cancel":true,"order_delete":true,"order_field_config":true},"contract_management":{"template_manage":true,"contract_generate":true,"contract_submit":true,"contract_review":true,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":true,"data_export_all":true},"customer_management":{"view":true,"create":true,"edit":true,"disable":true}}',
    0
  ]
];

/** 销售/合同模块表结构；与 migrations/013_sales_contracts_module.sql 一致 */
/** 公司设置：快捷角色对应的员工账号 id（供超管一键模拟登录） */
export async function ensureQuickRoleUserColumns() {
  const pool = getPool();
  if (!(await columnExists(pool, 'company_settings', 'quick_role_sales_user_id'))) {
    await pool.query(
      'ALTER TABLE company_settings ADD COLUMN quick_role_sales_user_id BIGINT UNSIGNED NULL DEFAULT NULL'
    );
  }
  if (!(await columnExists(pool, 'company_settings', 'quick_role_finance_user_id'))) {
    await pool.query(
      'ALTER TABLE company_settings ADD COLUMN quick_role_finance_user_id BIGINT UNSIGNED NULL DEFAULT NULL'
    );
  }
  if (!(await columnExists(pool, 'company_settings', 'quick_role_warehouse_user_id'))) {
    await pool.query(
      'ALTER TABLE company_settings ADD COLUMN quick_role_warehouse_user_id BIGINT UNSIGNED NULL DEFAULT NULL'
    );
  }
}

/** 兼容旧库：补齐公司信息邮箱/地址字段（migrations/026） */
export async function ensureCompanySettingsColumns() {
  const pool = getPool();
  if (!(await columnExists(pool, 'company_settings', 'company_email'))) {
    await pool.query(
      'ALTER TABLE company_settings ADD COLUMN company_email VARCHAR(128) NULL DEFAULT NULL AFTER company_name_en'
    );
  }
  if (!(await columnExists(pool, 'company_settings', 'company_address'))) {
    await pool.query(
      'ALTER TABLE company_settings ADD COLUMN company_address VARCHAR(256) NULL DEFAULT NULL AFTER company_email'
    );
  }
  if (!(await columnExists(pool, 'company_settings', 'footer_seal_position'))) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN footer_seal_position VARCHAR(16) NOT NULL DEFAULT 'below' AFTER logo_url"
    );
  }
}

/** 与 migrations/027_users_account_type_manager.sql 一致：未跑迁移时写入 manager 会触发 MySQL 截断错误 → 500 */
export async function ensureUsersAccountTypeManagerEnum() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'account_type'
     LIMIT 1`
  );
  const ct = String(rows?.[0]?.ct || '');
  if (!ct || ct.toLowerCase().includes('manager')) return;
  await pool.query(
    `ALTER TABLE users MODIFY COLUMN account_type ENUM('super_admin', 'employee', 'manager') NOT NULL`
  );
}

/**
 * 账号模块加固：
 * - users.token_version：JWT 即时失效版本号
 * - users.force_change_password：强制下次登录改密
 * - users.password_changed_at：密码修改时间
 * - users.deleted_at：软删除标记
 * - users.require_two_factor：超管个人级 2FA 开关（员工类别另有 require_two_factor）
 * - users.idx_users_wecom_userid：企业微信 UserID 普通索引（开发阶段允许重复）
 * - users.idx_users_account_type_active：常用筛选索引
 * - employee_categories.is_builtin：替代硬编码 code 判断
 */
export async function ensureAccountModuleHardeningColumns() {
  const pool = getPool();
  if (!(await columnExists(pool, 'users', 'real_name'))) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN real_name VARCHAR(64) NOT NULL DEFAULT '' AFTER username"
    );
    await pool.query("UPDATE users SET real_name = username WHERE real_name = ''");
  }
  if (!(await columnExists(pool, 'users', 'phone'))) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL DEFAULT NULL AFTER department_id"
    );
  }
  if (!(await columnExists(pool, 'users', 'token_version'))) {
    await pool.query('ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER is_active');
  }
  if (!(await columnExists(pool, 'users', 'force_change_password'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN force_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER token_version'
    );
  }
  if (!(await columnExists(pool, 'users', 'password_changed_at'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN password_changed_at DATETIME(3) NULL DEFAULT NULL AFTER force_change_password'
    );
  }
  if (!(await columnExists(pool, 'users', 'deleted_at'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN deleted_at DATETIME(3) NULL DEFAULT NULL AFTER updated_at'
    );
    await pool.query('CREATE INDEX idx_users_deleted_at ON users (deleted_at)');
  }
  if (!(await columnExists(pool, 'users', 'require_two_factor'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN require_two_factor TINYINT(1) NOT NULL DEFAULT 0 AFTER force_change_password'
    );
  }
  /**
   * 企业微信 UserID：开发阶段允许重复绑定
   * - 若历史上存在唯一索引，先移除
   * - 保留普通索引用于检索性能
   */
  if (await indexExists(pool, 'users', 'uk_users_wecom_userid')) {
    await pool.query('DROP INDEX uk_users_wecom_userid ON users');
  }
  if (!(await indexExists(pool, 'users', 'idx_users_wecom_userid'))) {
    await pool.query('CREATE INDEX idx_users_wecom_userid ON users (wecom_userid)');
  }
  if (!(await indexExists(pool, 'users', 'uk_users_phone'))) {
    try {
      await pool.query('CREATE UNIQUE INDEX uk_users_phone ON users (phone)');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[schema] users.uk_users_phone skipped (可能存在重复):', e?.message || e);
    }
  }
  if (!(await indexExists(pool, 'users', 'idx_users_account_type_active'))) {
    await pool.query('CREATE INDEX idx_users_account_type_active ON users (account_type, is_active)');
  }
  /** employee_categories 内置标记 */
  if (!(await columnExists(pool, 'employee_categories', 'is_builtin'))) {
    await pool.query(
      'ALTER TABLE employee_categories ADD COLUMN is_builtin TINYINT(1) NOT NULL DEFAULT 0 AFTER require_two_factor'
    );
    await pool.query(
      `UPDATE employee_categories SET is_builtin = 1
       WHERE code IN (${ALL_BUILTIN_CATEGORY_CODES.map(() => '?').join(', ')})`,
      ALL_BUILTIN_CATEGORY_CODES
    );
  }
}

/** 幂等：保证站内信表存在（仅依赖 users 外键） */
export async function ensureSalesInternalMessagesTable() {
  const pool = getPool();
  await pool.query(DDL_SALES_INTERNAL_MESSAGES);
  /** 旧库若早已存在无 category 等列的表，CREATE TABLE IF NOT EXISTS 不会 ALTER，会导致 SELECT … category … 500 */
  if (!(await columnExists(pool, 'sales_internal_messages', 'category'))) {
    await pool.query(
      "ALTER TABLE sales_internal_messages ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'notice' AFTER from_user_id"
    );
  }
}

/** 启动自检 sales_internal_models 表（与迁移脚本一致） */
export async function ensureSalesInternalModelsTable() {
  const pool = getPool();
  await pool.query(DDL_SALES_INTERNAL_MODELS);
  if (!(await columnExists(pool, 'sales_internal_models', 'product_name'))) {
    await pool.query('ALTER TABLE sales_internal_models ADD COLUMN product_name VARCHAR(256) NULL AFTER `name`');
  }
}

/** 启动自检 sales_contract_templates 表：添加 is_system 列并写入系统默认模板 */
export async function ensureContractTemplatesSystemDefault() {
  const pool = getPool();
  const RECOMMENDED_BODY = `<div style="width:100%;margin:0 auto;color:#000;font-family:FangSong_GB2312,仿宋_GB2312,仿宋,FangSong;font-size:16px;line-height:1.5">
<div style="text-align:center;margin-bottom:16px">
  <div style="font-size:22px;letter-spacing:4px;line-height:1.2;font-family:FZXiaoBiaoSong-S05,FZXiaoBiaoSong,方正小标宋简体,方正小标宋,方正小标宋_GBK,FZShuSong_GB2312,SimSun"></div>
  <div style="font-size:22px;letter-spacing:6px;line-height:1.2;margin-top:4px;font-family:FZXiaoBiaoSong-S05,FZXiaoBiaoSong,方正小标宋简体,方正小标宋,方正小标宋_GBK,FZShuSong_GB2312,SimSun">销售合同</div>
</div>
<div style="text-align:center;margin:12px 0 16px 0">
<table class="contract-header-meta" style="width:auto;max-width:100%;margin:0 auto;border-collapse:collapse;border:none;font-size:16px;line-height:1.5">
  <tr>
    <td style="border:none;padding:4px 8px 4px 0;width:58%;vertical-align:top;text-align:left">
      <div>买方：{{CUSTOMER_NAME}}</div>
      <div>卖方：{{COMPANY_NAME_ZH}}</div>
    </td>
    <td style="border:none;padding:4px 0 4px 8px;vertical-align:top;text-align:left">
      <div>合同编号：{{CONTRACT_NO}}</div>
      <div>履约地点：</div>
      <div>签订时间：{{SIGN_DATE_ZH}}</div>
    </td>
  </tr>
</table>
</div>
<p style="margin:8px 0;text-indent:2em"><strong>一、产品名称、单价、数量、金额、交货期：</strong></p>
{{ORDER_LINES}}
<p style="margin:8px 0;text-indent:2em"><strong>二、交货地点、交货期限、运费：</strong></p>
<p style="margin:8px 0;text-indent:2em"><strong>三、包装标准：</strong></p>
<p style="margin:8px 0;text-indent:2em"><strong>四、验收标准：方法及提出异议期限：</strong></p>
<p style="margin:8px 0;text-indent:2em"><strong>五、结算方式及期限：</strong></p>
<p style="margin:8px 0;text-indent:2em"><strong>六、违约责任：</strong></p>
<p style="margin:8px 0;text-indent:2em"><strong>七、解决合同纠纷方式：</strong></p>
<p style="margin:8px 0;text-indent:2em"><strong>八、其他约定事项：</strong></p>
<table class="party-table" style="width:100%;border-collapse:collapse;border:1px solid #000;margin-top:12px;font-size:14px;line-height:1.35">
  <tr>
    <td style="border:1px solid #000;vertical-align:top;padding:5px 8px;width:50%">
      <div class="party-col-title">卖方</div>
      <div>单位：{{COMPANY_NAME_ZH}}</div>
      <div>地址：</div>
      <div>联系人：</div>
      <div>电话：</div>
      <div>传真：</div>
      <div>开户银行：</div>
      <div>账号：</div>
      <div>行号：</div>
    </td>
    <td style="border:1px solid #000;vertical-align:top;padding:5px 8px;width:50%">
      <div class="party-col-title">买方</div>
      <div>单位：{{CUSTOMER_NAME}}</div>
      <div>地址：{{CUSTOMER_ADDRESS}}</div>
      <div>联系人：{{CUSTOMER_CONTACT}}</div>
      <div>电话：{{CUSTOMER_PHONE}}</div>
      <div>传真：{{CUSTOMER_FAX}}</div>
      <div>开户银行：{{CUSTOMER_BANK}}</div>
      <div>账号：{{CUSTOMER_ACCOUNT}}</div>
      <div>税号：{{CUSTOMER_TAX_ID}}</div>
    </td>
  </tr>
</table>
</div>`;
  if (!(await columnExists(pool, 'sales_contract_templates', 'is_system'))) {
    await pool.query('ALTER TABLE sales_contract_templates ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0 AFTER body_html');
  }
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM sales_contract_templates WHERE is_system = 1');
  if (rows[0].cnt === 0) {
    await pool.query(
      `INSERT INTO sales_contract_templates (name, body_html, is_system) VALUES (?, ?, 1)`,
      ['默认模板（推荐版式）', RECOMMENDED_BODY]
    );
  }
}

export async function ensureSalesModuleTables() {
  const pool = getPool();
  /** 先于 DDL_SALES_PIECES 执行：若后续片段某条失败中断，仍保证站内信表已建，避免轮询 GET /messages 500 */
  await ensureSalesInternalMessagesTable();
  for (const ddl of DDL_SALES_PIECES) {
    await pool.query(ddl);
  }
  if (!(await columnExists(pool, 'sales_orders', 'warehouse_model'))) {
    await pool.query(
      "ALTER TABLE sales_orders ADD COLUMN warehouse_model VARCHAR(256) NOT NULL DEFAULT '' AFTER product_model"
    );
    await pool.query(
      `UPDATE sales_orders
       SET warehouse_model = TRIM(SUBSTRING(REPLACE(product_model, '／', '/'), LOCATE('/', REPLACE(product_model, '／', '/')) + 1)),
           product_model = TRIM(SUBSTRING(REPLACE(product_model, '／', '/'), 1, LOCATE('/', REPLACE(product_model, '／', '/')) - 1))
       WHERE (product_model LIKE '%/%' OR product_model LIKE '%／%')
         AND LOCATE('/', REPLACE(product_model, '／', '/')) > 0`
    );
    await pool.query(
      `UPDATE sales_orders
       SET data_json = JSON_SET(data_json, '$.product_model', product_model, '$.warehouse_model', warehouse_model)
       WHERE data_json IS NOT NULL`
    );
  }
  if (!(await columnExists(pool, 'sales_orders', 'data_json'))) {
    await pool.query('ALTER TABLE sales_orders ADD COLUMN data_json JSON NULL AFTER extra_json');
  }
  if (!(await columnExists(pool, 'sales_orders', 'qc_qrcode_id'))) {
    await pool.query(
      'ALTER TABLE sales_orders ADD COLUMN qc_qrcode_id BIGINT UNSIGNED NULL DEFAULT NULL'
    );
    try {
      await pool.query(
        `ALTER TABLE sales_orders ADD CONSTRAINT fk_sales_orders_qc_qrcode
         FOREIGN KEY (qc_qrcode_id) REFERENCES qrcodes(id) ON DELETE SET NULL`
      );
    } catch {
      /* qrcodes 表或引擎限制时仅保留列 */
    }
  }

  // Customer management: is_active, updated_by (updated_at already present)
  if (!(await columnExists(pool, 'sales_customers', 'is_active'))) {
    await pool.query('ALTER TABLE sales_customers ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER created_by');
    await pool.query('UPDATE sales_customers SET is_active = 1');
  }
  if (!(await columnExists(pool, 'sales_customers', 'updated_by'))) {
    await pool.query('ALTER TABLE sales_customers ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER is_active');
    try {
      await pool.query(
        `ALTER TABLE sales_customers 
         ADD CONSTRAINT fk_sales_customers_updated_by 
         FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL`
      );
    } catch {
      /* constraint may already exist or other DB limitation */
    }
  }
  if (!(await columnExists(pool, 'sales_customers', 'customer_group'))) {
    await pool.query(
      "ALTER TABLE sales_customers ADD COLUMN customer_group VARCHAR(32) NOT NULL DEFAULT '' AFTER address"
    );
    try {
      await pool.query('ALTER TABLE sales_customers ADD KEY idx_sales_customers_group (customer_group)');
    } catch {
      /* index may already exist */
    }
  }
  if (!(await columnExists(pool, 'sales_customers', 'contact_person'))) {
    await pool.query("ALTER TABLE sales_customers ADD COLUMN contact_person VARCHAR(128) NULL DEFAULT NULL AFTER contact_name");
  }
  if (!(await columnExists(pool, 'sales_customers', 'fax'))) {
    await pool.query("ALTER TABLE sales_customers ADD COLUMN fax VARCHAR(64) NULL DEFAULT NULL AFTER phone");
  }
  if (!(await columnExists(pool, 'sales_customers', 'bank_name'))) {
    await pool.query("ALTER TABLE sales_customers ADD COLUMN bank_name VARCHAR(256) NULL DEFAULT NULL AFTER address");
  }
  if (!(await columnExists(pool, 'sales_customers', 'bank_account'))) {
    await pool.query("ALTER TABLE sales_customers ADD COLUMN bank_account VARCHAR(128) NULL DEFAULT NULL AFTER bank_name");
  }
  if (!(await columnExists(pool, 'sales_customers', 'tax_id'))) {
    await pool.query("ALTER TABLE sales_customers ADD COLUMN tax_id VARCHAR(64) NULL DEFAULT NULL AFTER bank_account");
  }

  await pool.query(
    `INSERT IGNORE INTO sales_settings (id, order_no_prefix, last_order_seq) VALUES (1, 'SO', 0)`
  );
  const { seedDefaultOrderFieldsIfEmpty, ensureCanonicalOrderFieldDefinitions } = await import(
    '../lib/salesOrderFields.js'
  );
  await seedDefaultOrderFieldsIfEmpty(pool);
  await ensureCanonicalOrderFieldDefinitions(pool);
  for (const row of SALES_CATEGORY_SEEDS) {
    await pool.query(
      `INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor)
       VALUES (?, ?, ?, CAST(? AS JSON), ?)`,
      row
    );
  }
  /** 内置岗位类别：幂等补齐（含管理层 alias、客服、采购等扩展种子） */
  for (const seed of KNOWN_BUILTIN_CATEGORY_SEEDS) {
    const json = JSON.stringify(defaultPermissionsForRole(seed.code));
    await pool.query(
      `INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin)
       VALUES (?, ?, ?, CAST(? AS JSON), ?, 1)`,
      [seed.nameZh, seed.code, seed.sortOrder, json, seed.requireTwoFactor ? 1 : 0]
    );
  }
  for (const seed of EXTRA_BUILTIN_CATEGORY_SEEDS) {
    const json = JSON.stringify(emptyPermissions());
    await pool.query(
      `INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin)
       VALUES (?, ?, ?, CAST(? AS JSON), 0, 1)`,
      [seed.nameZh, seed.code, seed.sortOrder, json]
    );
  }
  await pool.query(
    `UPDATE employee_categories SET is_builtin = 1
     WHERE code IN (${ALL_BUILTIN_CATEGORY_CODES.map(() => '?').join(', ')})`,
    ALL_BUILTIN_CATEGORY_CODES
  );
  await pool.query(
    `UPDATE employee_categories
     SET default_permissions_json = JSON_SET(
       default_permissions_json,
       '$.order_management.order_query_all',
       CAST(? AS JSON)
     )
     WHERE code = 'sales'`,
    ['true']
  );
  await pool.query(
    `UPDATE employee_categories
     SET default_permissions_json = JSON_SET(
       default_permissions_json,
       '$.order_management.order_query_all',
       CAST(? AS JSON)
     )
     WHERE code = 'documentary'`,
    ['true']
  );
  await ensureBuiltinCategoryPermissionDefaults(pool);
  await ensureSalesOrdersRowVersionColumn(pool);
  await ensureSalesOrderFlowConfigColumns(pool);
  await ensureSalesOrderFieldSchemaVersionColumns(pool);
  await ensureSalesCustomersNgramFulltextIndex(pool);
}

async function ensureSalesOrderFlowConfigColumns(pool) {
  if (!(await columnExists(pool, 'sales_settings', 'order_flow_json'))) {
    await pool.query(
      "ALTER TABLE sales_settings ADD COLUMN order_flow_json JSON NULL COMMENT '订单审核流程定义' AFTER order_field_schema_version"
    );
  }
  if (!(await columnExists(pool, 'sales_settings', 'order_flow_version'))) {
    await pool.query(
      'ALTER TABLE sales_settings ADD COLUMN order_flow_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER order_flow_json'
    );
  }
  if (!(await columnExists(pool, 'sales_orders', 'flow_config_version'))) {
    await pool.query(
      "ALTER TABLE sales_orders ADD COLUMN flow_config_version INT UNSIGNED NULL COMMENT '提交审核时锁定的流程版本' AFTER row_version"
    );
  }
  if (!(await columnExists(pool, 'sales_orders', 'flow_step_index'))) {
    await pool.query(
      "ALTER TABLE sales_orders ADD COLUMN flow_step_index INT UNSIGNED NULL COMMENT '当前审核节点索引' AFTER flow_config_version"
    );
  }
  const [seed] = await pool.query('SELECT order_flow_json FROM sales_settings WHERE id = 1 LIMIT 1');
  if (seed?.[0] && seed[0].order_flow_json == null) {
    const { defaultOrderFlowDefinition } = await import('../lib/salesOrderFlowConfig.js');
    const def = defaultOrderFlowDefinition();
    await pool.query(
      'UPDATE sales_settings SET order_flow_json = CAST(? AS JSON), order_flow_version = 1 WHERE id = 1',
      [JSON.stringify(def)]
    );
  }
}

async function ensureSalesOrderFieldSchemaVersionColumns(pool) {
  if (!(await columnExists(pool, 'sales_settings', 'order_field_schema_version'))) {
    await pool.query(
      'ALTER TABLE sales_settings ADD COLUMN order_field_schema_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER last_order_seq'
    );
  }
  if (!(await columnExists(pool, 'sales_orders', 'field_schema_version'))) {
    await pool.query(
      "ALTER TABLE sales_orders ADD COLUMN field_schema_version INT UNSIGNED NULL DEFAULT NULL COMMENT '创建时字段定义全局版本' AFTER data_json"
    );
  }
}

/** 订单乐观锁版本号；并发编辑时 PATCH 需携带期望的 row_version */
let salesCustomersNgramFtReady = false;

export function isSalesCustomerNgramFulltextReady() {
  return salesCustomersNgramFtReady;
}

async function refreshSalesCustomersNgramFlag(pool) {
  const [r] = await pool.query(
    `SELECT 1 AS ok FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_customers' AND INDEX_NAME = 'ft_sales_customers_ngram'
     LIMIT 1`
  );
  salesCustomersNgramFtReady = r.length > 0;
}

async function ensureSalesOrdersRowVersionColumn(pool) {
  if (!(await columnExists(pool, 'sales_orders', 'row_version'))) {
    await pool.query(
      'ALTER TABLE sales_orders ADD COLUMN row_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER updated_at'
    );
  }
}

/** 客户名称/编号检索：大数据量下 LIKE 前后模糊难走索引，增加 ngram 全文索引（失败时仅记录警告） */
async function ensureSalesCustomersNgramFulltextIndex(pool) {
  await refreshSalesCustomersNgramFlag(pool);
  if (salesCustomersNgramFtReady) {
    try {
      await pool.query('ALTER TABLE sales_customers DROP INDEX ft_sales_customers_ngram');
    } catch {
      /* index may not exist */
    }
  }
  try {
    await pool.query(
      `ALTER TABLE sales_customers
       ADD FULLTEXT INDEX ft_sales_customers_ngram (customer_name, customer_code, contact_name, contact_person) WITH PARSER ngram`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[schema] sales_customers ngram FULLTEXT skipped:', e?.message || e);
  }
  await refreshSalesCustomersNgramFlag(pool);
}

/** 合同版本表 + 审批步骤 + sales_contracts 扩展列；与 migrations/032_contract_versioning_and_multi_approval.sql 一致 */
const DDL_CONTRACT_VERSIONS = `
CREATE TABLE IF NOT EXISTS contract_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  version_num INT NOT NULL DEFAULT 1,
  body_html MEDIUMTEXT NOT NULL,
  data_json JSON NULL,
  change_summary VARCHAR(512) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_contract_version (contract_id, version_num),
  KEY idx_contract_versions_contract (contract_id),
  CONSTRAINT fk_contract_versions_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_contract_versions_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

const DDL_CONTRACT_APPROVAL_STEPS = `
CREATE TABLE IF NOT EXISTS contract_approval_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  step_order INT NOT NULL,
  step_type ENUM('sequential', 'parallel', 'countersign') NOT NULL DEFAULT 'sequential',
  approvers_json JSON NOT NULL,
  required_approvals INT NOT NULL DEFAULT 1,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  completed_by JSON NULL,
  comment_text VARCHAR(1024) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_approval_steps_contract (contract_id, step_order),
  CONSTRAINT fk_approval_steps_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

/**
 * createContractVersion() 会 UPDATE sales_contracts.data_json；若缺列或缺 contract_versions 表会导致保存合同 500。
 * 启动时幂等补齐，避免仅跑了部分迁移的环境报错。
 */
export async function ensureSalesContractVersioning() {
  const pool = getPool();
  await pool.query(DDL_CONTRACT_VERSIONS);
  await pool.query(DDL_CONTRACT_APPROVAL_STEPS);
  if (!(await columnExists(pool, 'sales_contracts', 'current_version'))) {
    await pool.query(
      'ALTER TABLE sales_contracts ADD COLUMN current_version INT NOT NULL DEFAULT 1 AFTER status'
    );
  }
  if (!(await columnExists(pool, 'sales_contracts', 'approval_flow_json'))) {
    await pool.query(
      "ALTER TABLE sales_contracts ADD COLUMN approval_flow_json JSON NULL COMMENT '多级审批流配置' AFTER current_version"
    );
  }
  if (!(await columnExists(pool, 'sales_contracts', 'last_version_created_at'))) {
    await pool.query(
      'ALTER TABLE sales_contracts ADD COLUMN last_version_created_at DATETIME(3) NULL AFTER approval_flow_json'
    );
  }
  if (!(await columnExists(pool, 'sales_contracts', 'data_json'))) {
    await pool.query('ALTER TABLE sales_contracts ADD COLUMN data_json JSON NULL');
  }
  if (!(await columnExists(pool, 'sales_contracts', 'signature_stored_rel_path'))) {
    await pool.query(
      "ALTER TABLE sales_contracts ADD COLUMN signature_stored_rel_path VARCHAR(512) NULL DEFAULT NULL COMMENT '签章图片相对路径' AFTER data_json"
    );
  }
}

/** 合同开票记录 + 开票审批日志；与 migrations/056_sales_contract_invoices.sql 一致 */
const DDL_SALES_CONTRACT_INVOICES = `
CREATE TABLE IF NOT EXISTS sales_contract_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id BIGINT UNSIGNED NOT NULL,
  invoice_no VARCHAR(64) NULL,
  invoice_type ENUM('special', 'normal', 'electronic') NOT NULL DEFAULT 'special',
  amount DECIMAL(18, 4) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(6, 4) NULL,
  tax_amount DECIMAL(18, 4) NULL,
  invoice_date DATE NULL,
  buyer_name VARCHAR(256) NULL,
  buyer_tax_id VARCHAR(64) NULL,
  buyer_address VARCHAR(512) NULL,
  buyer_phone VARCHAR(64) NULL,
  buyer_bank_name VARCHAR(256) NULL,
  buyer_bank_account VARCHAR(128) NULL,
  item_name VARCHAR(512) NULL,
  item_unit VARCHAR(32) NULL,
  item_quantity DECIMAL(18, 4) NULL,
  item_unit_price DECIMAL(18, 4) NULL,
  remark VARCHAR(1024) NULL,
  status ENUM('draft', 'pending_finance', 'issued', 'cancelled') NOT NULL DEFAULT 'draft',
  invoice_code VARCHAR(64) NULL,
  invoice_url VARCHAR(512) NULL,
  issued_at DATETIME(3) NULL,
  issued_by BIGINT UNSIGNED NULL,
  reviewer_user_id BIGINT UNSIGNED NULL,
  approval_flow_json JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_contract_invoices_contract (contract_id, created_at),
  KEY idx_sales_contract_invoices_status (status),
  KEY idx_sales_contract_invoices_reviewer (reviewer_user_id),
  CONSTRAINT fk_sales_contract_invoices_contract FOREIGN KEY (contract_id) REFERENCES sales_contracts(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_contract_invoices_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_contract_invoices_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_contract_invoices_issued_by FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

const DDL_SALES_CONTRACT_INVOICE_AUDIT_LOGS = `
CREATE TABLE IF NOT EXISTS sales_contract_invoice_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(32) NOT NULL,
  result VARCHAR(32) NULL,
  comment_text VARCHAR(2048) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sales_contract_invoice_audit_invoice (invoice_id, created_at),
  CONSTRAINT fk_sales_contract_invoice_audit_invoice FOREIGN KEY (invoice_id) REFERENCES sales_contract_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_contract_invoice_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

/** 将 status 从旧审批枚举迁移为 draft / pending_finance / issued / cancelled */
async function migrateSalesContractInvoiceStatusEnum(pool) {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_contract_invoices' AND COLUMN_NAME = 'status'`
  );
  const colType = String(rows[0]?.column_type || rows[0]?.COLUMN_TYPE || '').toLowerCase();
  if (!colType || colType.includes('pending_finance')) return;

  if (colType.includes('pending_review') || colType.includes('approved')) {
    await pool.query(
      `ALTER TABLE sales_contract_invoices
       MODIFY COLUMN status ENUM(
         'draft', 'pending_review', 'approved', 'rejected',
         'pending_finance', 'issued', 'cancelled'
       ) NOT NULL DEFAULT 'draft'`
    );
    await pool.query(
      `UPDATE sales_contract_invoices SET status = 'pending_finance' WHERE status = 'pending_review'`
    );
    await pool.query(`UPDATE sales_contract_invoices SET status = 'issued' WHERE status = 'approved'`);
    await pool.query(`UPDATE sales_contract_invoices SET status = 'draft' WHERE status = 'rejected'`);
  }

  await pool.query(
    `ALTER TABLE sales_contract_invoices
     MODIFY COLUMN status ENUM('draft', 'pending_finance', 'issued', 'cancelled') NOT NULL DEFAULT 'draft'`
  );
}

/** 启动时幂等创建开票相关表，避免未执行迁移的环境开票接口 500 */
export async function ensureSalesContractInvoiceTables() {
  const pool = getPool();
  await pool.query(DDL_SALES_CONTRACT_INVOICES);
  await pool.query(DDL_SALES_CONTRACT_INVOICE_AUDIT_LOGS);
  const addCol = async (col, ddl) => {
    if (!(await columnExists(pool, 'sales_contract_invoices', col))) {
      await pool.query(ddl);
    }
  };
  await addCol('invoice_code', 'ALTER TABLE sales_contract_invoices ADD COLUMN invoice_code VARCHAR(64) NULL AFTER invoice_no');
  await addCol('invoice_url', 'ALTER TABLE sales_contract_invoices ADD COLUMN invoice_url VARCHAR(512) NULL AFTER invoice_code');
  await addCol('issued_at', 'ALTER TABLE sales_contract_invoices ADD COLUMN issued_at DATETIME(3) NULL AFTER invoice_url');
  await addCol('issued_by', 'ALTER TABLE sales_contract_invoices ADD COLUMN issued_by BIGINT UNSIGNED NULL AFTER issued_at');
  await addCol('approval_flow_json', 'ALTER TABLE sales_contract_invoices ADD COLUMN approval_flow_json JSON NULL AFTER reviewer_user_id');
  await addCol('buyer_address', 'ALTER TABLE sales_contract_invoices ADD COLUMN buyer_address VARCHAR(512) NULL AFTER buyer_tax_id');
  await addCol('buyer_phone', 'ALTER TABLE sales_contract_invoices ADD COLUMN buyer_phone VARCHAR(64) NULL AFTER buyer_address');
  await addCol('buyer_bank_name', 'ALTER TABLE sales_contract_invoices ADD COLUMN buyer_bank_name VARCHAR(256) NULL AFTER buyer_phone');
  await addCol('buyer_bank_account', 'ALTER TABLE sales_contract_invoices ADD COLUMN buyer_bank_account VARCHAR(128) NULL AFTER buyer_bank_name');
  await addCol('item_name', 'ALTER TABLE sales_contract_invoices ADD COLUMN item_name VARCHAR(512) NULL AFTER buyer_bank_account');
  await addCol('item_unit', 'ALTER TABLE sales_contract_invoices ADD COLUMN item_unit VARCHAR(32) NULL AFTER item_name');
  await addCol('item_quantity', 'ALTER TABLE sales_contract_invoices ADD COLUMN item_quantity DECIMAL(18, 4) NULL AFTER item_unit');
  await addCol('item_unit_price', 'ALTER TABLE sales_contract_invoices ADD COLUMN item_unit_price DECIMAL(18, 4) NULL AFTER item_quantity');
  await migrateSalesContractInvoiceStatusEnum(pool);
}

/** 文档上传合同 + 弃用旧附件表；与 migrations/031_sales_contract_upload_document.sql 一致 */
export async function ensureSalesContractDocumentColumns() {
  const pool = getPool();
  await pool.query('DROP TABLE IF EXISTS sales_contract_attachments');
  if (!(await columnExists(pool, 'sales_contracts', 'contract_source'))) {
    await pool.query(
      `ALTER TABLE sales_contracts
       ADD COLUMN contract_source ENUM('template','upload') NOT NULL DEFAULT 'template'`
    );
  }
  if (!(await columnExists(pool, 'sales_contracts', 'document_stored_rel_path'))) {
    await pool.query(
      'ALTER TABLE sales_contracts ADD COLUMN document_stored_rel_path VARCHAR(512) NULL DEFAULT NULL'
    );
  }
  if (!(await columnExists(pool, 'sales_contracts', 'document_mime_type'))) {
    await pool.query(
      'ALTER TABLE sales_contracts ADD COLUMN document_mime_type VARCHAR(128) NULL DEFAULT NULL'
    );
  }
  if (!(await columnExists(pool, 'sales_contracts', 'document_original_filename'))) {
    await pool.query(
      'ALTER TABLE sales_contracts ADD COLUMN document_original_filename VARCHAR(512) NULL DEFAULT NULL'
    );
  }
  if (!(await columnExists(pool, 'sales_contracts', 'document_size_bytes'))) {
    await pool.query(
      'ALTER TABLE sales_contracts ADD COLUMN document_size_bytes BIGINT UNSIGNED NULL DEFAULT NULL'
    );
  }
}

const DDL_DEPARTMENTS = `
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
`;

const DDL_ORDER_CALC_RULES = `
CREATE TABLE IF NOT EXISTS order_calc_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  formulas_json JSON NOT NULL,
  total_amount_target_col_index TINYINT UNSIGNED NOT NULL DEFAULT 9,
  decimal_places TINYINT UNSIGNED NOT NULL DEFAULT 2,
  rounding_mode VARCHAR(16) NOT NULL DEFAULT 'round',
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_calc_rules_name (name),
  KEY idx_order_calc_rules_current (is_current),
  CONSTRAINT fk_order_calc_rules_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

const DEFAULT_CALC_RULE_NAME = '默认含税转不含税计算';
const DEFAULT_CALC_RULE_FORMULAS = JSON.stringify([
  { formulaText: 'ROUND(C/(1+H),2)', targetColIndex: 3 },
  { formulaText: 'D*E', targetColIndex: 6 },
  { formulaText: 'C*E', targetColIndex: 9 },
  { formulaText: 'J-G', targetColIndex: 8 }
]);

const DDL_CUSTOMER_PRICES = `
CREATE TABLE IF NOT EXISTS customer_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  product_model VARCHAR(128) NOT NULL,
  unit_price DECIMAL(18,4) NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_prices_model (customer_id, product_model),
  KEY idx_customer_prices_customer (customer_id),
  CONSTRAINT fk_customer_prices_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

export async function ensureCustomerPricesTable() {
  const pool = getPool();
  await pool.query(DDL_CUSTOMER_PRICES);
}

/** 启动自检 order_calc_rules 表并写入默认规则 */
export async function ensureOrderCalcRulesTable() {
  const pool = getPool();
  await pool.query(DDL_ORDER_CALC_RULES);
  if (!(await columnExists(pool, 'order_calc_rules', 'total_amount_target_col_index'))) {
    await pool.query('ALTER TABLE order_calc_rules ADD COLUMN total_amount_target_col_index TINYINT UNSIGNED NOT NULL DEFAULT 9 AFTER formulas_json');
  }
  if (!(await columnExists(pool, 'order_calc_rules', 'decimal_places'))) {
    await pool.query('ALTER TABLE order_calc_rules ADD COLUMN decimal_places TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER total_amount_target_col_index');
  }
  if (!(await columnExists(pool, 'order_calc_rules', 'rounding_mode'))) {
    await pool.query("ALTER TABLE order_calc_rules ADD COLUMN rounding_mode VARCHAR(16) NOT NULL DEFAULT 'round' AFTER decimal_places");
  }
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM order_calc_rules');
  if (rows[0].cnt === 0) {
    await pool.query(
      'INSERT INTO order_calc_rules (name, formulas_json, total_amount_target_col_index, is_current) VALUES (?, ?, 9, 1)',
      [DEFAULT_CALC_RULE_NAME, DEFAULT_CALC_RULE_FORMULAS]
    );
  }
}

/** 与 migrations/016_departments.sql 一致 */
export async function ensureDepartmentsTable() {
  const pool = getPool();
  await pool.query(DDL_DEPARTMENTS);
  if (!(await columnExists(pool, 'users', 'department_id'))) {
    await pool.query(
      'ALTER TABLE users ADD COLUMN department_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER employee_category_id'
    );
    await pool.query(
      'ALTER TABLE users ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL'
    );
  }
}

async function indexExists(pool, table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

/** 与 migrations/020_wecom_notifications.sql 一致 */
const DDL_WECOM_CONFIG = `
CREATE TABLE IF NOT EXISTS wecom_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  corp_id VARCHAR(32) NOT NULL DEFAULT '',
  agent_id INT UNSIGNED NOT NULL DEFAULT 0,
  corp_secret VARCHAR(2048) NOT NULL DEFAULT '',
  remark VARCHAR(255) NULL,
  receive_token VARCHAR(2048) NOT NULL DEFAULT '',
  encoding_aes_key VARCHAR(2048) NOT NULL DEFAULT '',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
`;
const DDL_WECOM_RECIPIENTS = `
CREATE TABLE IF NOT EXISTS wecom_notify_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name_zh VARCHAR(128) NOT NULL,
  wecom_userids_json JSON NOT NULL COMMENT '企业微信成员 UserID 数组',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_wecom_recipients_sort (sort_order)
) ENGINE=InnoDB;
`;
const DDL_WECOM_TEMPLATES = `
CREATE TABLE IF NOT EXISTS wecom_notify_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name_zh VARCHAR(128) NOT NULL,
  msg_type ENUM('text', 'textcard', 'markdown') NOT NULL DEFAULT 'text',
  title_template TEXT NULL,
  body_template TEXT NOT NULL,
  url_template TEXT NULL,
  btntxt VARCHAR(16) NULL DEFAULT '详情',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_wecom_notify_templates_code (code)
) ENGINE=InnoDB;
`;

/** 与 migrations/041_wecom_notify_jobs.sql 一致 */
const DDL_WECOM_NOTIFY_JOBS = `
CREATE TABLE IF NOT EXISTS wecom_notify_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(64) NOT NULL,
  template_code VARCHAR(64) NOT NULL,
  to_user TEXT NOT NULL,
  variables_json JSON NOT NULL,
  biz_type VARCHAR(64) NULL,
  biz_id BIGINT UNSIGNED NULL,
  status ENUM('pending','sending','sent','failed','dead') NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  next_retry_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_error TEXT NULL,
  wecom_response_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_wecom_jobs_status_next (status, next_retry_at),
  KEY idx_wecom_jobs_biz (biz_type, biz_id)
) ENGINE=InnoDB;
`;

export async function ensureWecomNotificationsTables() {
  const pool = getPool();
  await pool.query(DDL_WECOM_CONFIG);
  await pool.query(
    "INSERT IGNORE INTO wecom_config (id, corp_id, agent_id, corp_secret) VALUES (1, '', 0, '')"
  );
  await pool.query(DDL_WECOM_RECIPIENTS);
  await pool.query(DDL_WECOM_TEMPLATES);
}

export async function ensureWecomNotifyJobsTable() {
  const pool = getPool();
  await pool.query(DDL_WECOM_NOTIFY_JOBS);
}

const DDL_WECOM_CALLBACK_EVENTS = `
CREATE TABLE IF NOT EXISTS wecom_callback_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  msg_type VARCHAR(64) NULL,
  event_type VARCHAR(128) NULL,
  from_user VARCHAR(128) NULL,
  raw_xml MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_wecom_callback_created (created_at),
  KEY idx_wecom_callback_event (event_type)
) ENGINE=InnoDB;
`;

/** 与 migrations/042_wecom_secrets_wide_and_callback_events.sql 一致：加宽密文字段 + 回调事件表 */
export async function ensureWecomSecretsWideAndCallbackEvents() {
  const pool = getPool();
  try {
    await pool.query(
      `ALTER TABLE wecom_config
       MODIFY COLUMN corp_secret VARCHAR(2048) NOT NULL DEFAULT '',
       MODIFY COLUMN receive_token VARCHAR(2048) NOT NULL DEFAULT '',
       MODIFY COLUMN encoding_aes_key VARCHAR(2048) NOT NULL DEFAULT ''`
    );
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }
  await pool.query(DDL_WECOM_CALLBACK_EVENTS);
}

const WECOM_ORDER_TEMPLATES_SEED = `
INSERT IGNORE INTO wecom_notify_templates (code, name_zh, msg_type, title_template, body_template, url_template, btntxt)
VALUES
('sales_order_submit_finance', '销售提交财务审核（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_order_withdraw_finance', '销售撤回财务审核（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_order_approved_warehouse', '财务通过→仓库备货（系统）', 'textcard', '订单待发货', '{{detail}}', '{{shipConfirmUrl}}', '完成发货'),
('sales_order_rejected_sales', '财务驳回→销售（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_contract_submit_reviewer', '提交合同发送信息给审核人', 'textcard', '{{notificationTitle}}', '{{detail}}', '{{reviewUrl}}', '打开审批'),
('sales_contract_review_result', '合同审核结果通知提交审核人', 'text', NULL, '📢{{customerName}}销售合同审核状态更新\n🔒状态：{{contractReviewStatus}}\n💾备注：{{reviewComment}}', NULL, '详情'),
('sales_invoice_submit_finance', '开票申请提交→财务（系统）', 'textcard', '合同开票待处理', '{{detail}}', '{{invoiceCenterUrl}}', '打开开票中心'),
('sales_invoice_withdraw_finance', '开票申请撤销→财务（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_invoice_fulfilled_applicant', '开票完成→申请人（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_invoice_deleted_finance', '开票申请删除→财务（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_invoice_deleted_applicant', '开票申请删除→申请人（系统）', 'text', NULL, '{{detail}}', NULL, '详情')
`;

/** 与 migrations/021_users_wecom_userid.sql 一致 */
export async function ensureUsersWecomUseridColumn() {
  const pool = getPool();
  if (!(await columnExists(pool, 'users', 'wecom_userid'))) {
    await pool.query(
      "ALTER TABLE users ADD COLUMN wecom_userid VARCHAR(64) NULL DEFAULT NULL COMMENT '企业微信通讯录成员UserID' AFTER department_id"
    );
  }
  await pool.query(WECOM_ORDER_TEMPLATES_SEED);
}

/** 与 migrations/022_wecom_receive_callback.sql 一致 */
export async function ensureWecomReceiveCallbackColumns() {
  const pool = getPool();
  if (!(await columnExists(pool, 'wecom_config', 'receive_token'))) {
    await pool.query(
      "ALTER TABLE wecom_config ADD COLUMN receive_token VARCHAR(2048) NOT NULL DEFAULT '' COMMENT '回调 Token' AFTER remark"
    );
  }
  if (!(await columnExists(pool, 'wecom_config', 'encoding_aes_key'))) {
    await pool.query(
      "ALTER TABLE wecom_config ADD COLUMN encoding_aes_key VARCHAR(2048) NOT NULL DEFAULT '' COMMENT 'EncodingAESKey 密文或明文' AFTER receive_token"
    );
  }
}

/** 与 migrations/019_report_uid_fixed_report_no.sql 一致 */
export async function ensureReportsReportUidColumn() {
  const pool = getPool();
  if (!(await columnExists(pool, 'reports', 'report_uid'))) {
    await pool.query(
      "ALTER TABLE reports ADD COLUMN report_uid VARCHAR(32) NULL COMMENT '质检报告唯一ID' AFTER id"
    );
    await pool.query(
      "UPDATE reports SET report_uid = CONCAT('ZJ-', LPAD(id, 10, '0')) WHERE report_uid IS NULL"
    );
    await pool.query('ALTER TABLE reports ADD UNIQUE KEY uk_reports_report_uid (report_uid)');
  }
  if (await indexExists(pool, 'reports', 'uk_reports_report_no')) {
    await pool.query('ALTER TABLE reports DROP INDEX uk_reports_report_no');
  }
  if (!(await indexExists(pool, 'reports', 'idx_reports_report_no'))) {
    await pool.query('ALTER TABLE reports ADD KEY idx_reports_report_no (report_no)');
  }
  await pool.query(
    "UPDATE reports SET report_uid = CONCAT('ZJ-', LPAD(id, 10, '0')) WHERE report_uid IS NULL OR report_uid = ''"
  );
}

/** 与 migrations/064_qrcodes_qrcode_uid.sql 一致 */
export async function ensureQrcodesQrcodeUidColumn() {
  const pool = getPool();
  if (!(await columnExists(pool, 'qrcodes', 'qrcode_uid'))) {
    await pool.query(
      "ALTER TABLE qrcodes ADD COLUMN qrcode_uid VARCHAR(32) NULL COMMENT '二维码业务编号' AFTER token"
    );
  }
  if (!(await indexExists(pool, 'qrcodes', 'uk_qrcodes_qrcode_uid'))) {
    try {
      await pool.query('ALTER TABLE qrcodes ADD UNIQUE KEY uk_qrcodes_qrcode_uid (qrcode_uid)');
    } catch (_e) {
      /* 重复执行或冲突时跳过 */
    }
  }
  const { backfillQrcodeUids } = await import('../lib/qrcodeUid.js');
  await backfillQrcodeUids(pool);
}

/** 与 migrations/063_reports_customer_id.sql 一致 */
export async function ensureReportsCustomerIdColumn() {
  const pool = getPool();
  if (!(await columnExists(pool, 'reports', 'customer_id'))) {
    await pool.query(
      "ALTER TABLE reports ADD COLUMN customer_id BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '关联客户（从订单生成时写入）' AFTER product_name_en"
    );
  }
  if (!(await indexExists(pool, 'reports', 'idx_reports_customer_id'))) {
    await pool.query('ALTER TABLE reports ADD KEY idx_reports_customer_id (customer_id)');
  }
  try {
    await pool.query(
      `ALTER TABLE reports ADD CONSTRAINT fk_reports_customer
       FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE SET NULL`
    );
  } catch {
    /* 已存在或 sales_customers 未就绪时跳过 */
  }
}

const WY_CUSTOMER_CODE_RE = /^WY[A-Z0-9]{8}$/;

function randomWyCustomerCodeForMigration() {
  return `WY${nanoid(8).replace(/[^A-Za-z0-9]/g, '0').toUpperCase()}`;
}

/** 启动时将不符合 WY+8 的客户编码统一为随机唯一编码（幂等） */
export async function ensureSalesCustomerCodesWyFormat() {
  const pool = getPool();
  let rows;
  try {
    const [r] = await pool.query('SELECT id, customer_code FROM sales_customers ORDER BY id ASC');
    rows = r;
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return;
    throw e;
  }
  if (!rows.length) return;

  const used = new Set(
    rows.map((row) => String(row.customer_code || '').trim().toUpperCase()).filter(Boolean)
  );
  const needUpdate = rows.filter((row) => !WY_CUSTOMER_CODE_RE.test(String(row.customer_code || '').trim()));
  if (!needUpdate.length) return;

  const assigned = new Map();
  for (const row of needUpdate) {
    let code = '';
    let guard = 0;
    while (!code || used.has(code)) {
      code = randomWyCustomerCodeForMigration();
      guard += 1;
      if (guard > 200) {
        throw new Error('ensureSalesCustomerCodesWyFormat: code generation exhausted');
      }
    }
    used.add(code);
    assigned.set(Number(row.id), code);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [id, code] of assigned.entries()) {
      await conn.query('UPDATE sales_customers SET customer_code = ? WHERE id = ?', [code, id]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 与 migrations/038_stamps_svg_image.sql 一致：company_stamps 增加 SVG 电子章字段 */
export async function ensureStampsSvgFields() {
  const pool = getPool();
  
  // 检查表是否存在
  const [tables] = await pool.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_stamps'"
  );
  if (tables.length === 0) return;
  
  // 添加 svg_image_url 字段
  if (!(await columnExists(pool, 'company_stamps', 'svg_image_url'))) {
    await pool.query(
      "ALTER TABLE company_stamps ADD COLUMN svg_image_url VARCHAR(512) NULL DEFAULT NULL COMMENT 'SVG电子章URL' AFTER image_url"
    );
  }
  
  // 添加 active_image_type 字段
  if (!(await columnExists(pool, 'company_stamps', 'active_image_type'))) {
    await pool.query(
      "ALTER TABLE company_stamps ADD COLUMN active_image_type ENUM('original', 'svg') NOT NULL DEFAULT 'original' COMMENT '当前激活的图片类型' AFTER svg_image_url"
    );
  }
}

/** 与 migrations/046_qc_yearbook_data.sql 一致：年度品质台账年份与明细 */
const DDL_QC_YEARBOOK_YEARS = `
CREATE TABLE IF NOT EXISTS qc_yearbook_years (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year SMALLINT UNSIGNED NOT NULL,
  remark VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_qc_yearbook_years_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const DDL_QC_YEARBOOK_RECORDS = `
CREATE TABLE IF NOT EXISTS qc_yearbook_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(128) NOT NULL DEFAULT '',
  subject VARCHAR(512) NOT NULL DEFAULT '',
  body MEDIUMTEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_qc_yearbook_records_year (year_id),
  KEY idx_qc_yearbook_records_year_sort (year_id, sort_order, id),
  CONSTRAINT fk_qc_yearbook_records_year FOREIGN KEY (year_id) REFERENCES qc_yearbook_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_qc_yearbook_records_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_qc_yearbook_records_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const DDL_QC_YEARBOOK_FINISHED_PRODUCT_ROWS = `
CREATE TABLE IF NOT EXISTS qc_yearbook_finished_product_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  inspection_num INT UNSIGNED NOT NULL COMMENT '年度内检验序号，创建后不变',
  inspection_id VARCHAR(32) NOT NULL COMMENT '检验ID：统计年度-序号',
  product_model VARCHAR(128) NOT NULL DEFAULT '',
  product_batch_no VARCHAR(64) NOT NULL DEFAULT '',
  barrel_count DECIMAL(14, 4) NULL,
  initial_batch_kg DECIMAL(14, 4) NULL,
  inspection_batch_kg DECIMAL(14, 4) NULL,
  appearance VARCHAR(64) NULL,
  color_fe_co VARCHAR(32) NULL,
  solid_content_pct DECIMAL(10, 4) NULL,
  viscosity_s_25c DECIMAL(12, 4) NULL,
  acid_value_mgkoh_g DECIMAL(12, 4) NULL,
  tolerance_g_ml DECIMAL(14, 6) NULL,
  nco_content_pct DECIMAL(10, 4) NULL,
  inspection_conclusion VARCHAR(64) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_qc_yearbook_fp_inspection_id (inspection_id),
  UNIQUE KEY uk_qc_yearbook_fp_year_inspnum (year_id, inspection_num),
  KEY idx_qc_yearbook_fp_year (year_id),
  KEY idx_qc_yearbook_fp_year_sort (year_id, sort_order, id),
  KEY idx_qc_yearbook_fp_model_batch (year_id, product_model(32), product_batch_no(16)),
  CONSTRAINT fk_qc_yearbook_fp_year FOREIGN KEY (year_id) REFERENCES qc_yearbook_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_qc_yearbook_fp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_qc_yearbook_fp_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function ensureQcYearbookFinishedProductInspectionColumns(pool) {
  const table = 'qc_yearbook_finished_product_rows';
  const [tables] = await pool.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [table]
  );
  if (!tables?.length) return;

  if (!(await columnExists(pool, table, 'inspection_num'))) {
    await pool.query(
      `ALTER TABLE ${table}
        ADD COLUMN inspection_num INT UNSIGNED NULL DEFAULT NULL COMMENT '年度内检验序号' AFTER sort_order,
        ADD COLUMN inspection_id VARCHAR(32) NULL DEFAULT NULL COMMENT '检验ID：统计年度-序号' AFTER inspection_num`
    );
  } else if (!(await columnExists(pool, table, 'inspection_id'))) {
    await pool.query(
      `ALTER TABLE ${table}
        ADD COLUMN inspection_id VARCHAR(32) NULL DEFAULT NULL COMMENT '检验ID：统计年度-序号' AFTER inspection_num`
    );
  }

  await pool.query(
    `UPDATE qc_yearbook_finished_product_rows fp
     INNER JOIN qc_yearbook_years y ON y.id = fp.year_id
     INNER JOIN (
       SELECT id, ROW_NUMBER() OVER (PARTITION BY year_id ORDER BY sort_order ASC, id ASC) AS rn
       FROM qc_yearbook_finished_product_rows
     ) t ON t.id = fp.id
     SET fp.inspection_num = t.rn,
         fp.inspection_id = CONCAT(y.year, '-', LPAD(t.rn, 5, '0'))
     WHERE fp.inspection_num IS NULL OR fp.inspection_id IS NULL OR fp.inspection_id = ''`
  );

  try {
    await pool.query(
      `ALTER TABLE ${table}
        MODIFY COLUMN inspection_num INT UNSIGNED NOT NULL,
        MODIFY COLUMN inspection_id VARCHAR(32) NOT NULL`
    );
  } catch (_e) {
    /* 可能仍有 NULL（空表等），忽略直至数据补齐 */
  }

  if (!(await indexExists(pool, table, 'uk_qc_yearbook_fp_inspection_id'))) {
    try {
      await pool.query(`ALTER TABLE ${table} ADD UNIQUE KEY uk_qc_yearbook_fp_inspection_id (inspection_id)`);
    } catch (_e) {
      /* 重复执行或冲突时跳过 */
    }
  }
  if (!(await indexExists(pool, table, 'uk_qc_yearbook_fp_year_inspnum'))) {
    try {
      await pool.query(`ALTER TABLE ${table} ADD UNIQUE KEY uk_qc_yearbook_fp_year_inspnum (year_id, inspection_num)`);
    } catch (_e) {
      /* 重复执行或冲突时跳过 */
    }
  }
}

export async function ensureQcYearbookDataTables() {
  const pool = getPool();
  await pool.query(DDL_QC_YEARBOOK_YEARS);
  await pool.query(DDL_QC_YEARBOOK_RECORDS);
  await pool.query(DDL_QC_YEARBOOK_FINISHED_PRODUCT_ROWS);
  await pool.query("INSERT IGNORE INTO qc_yearbook_years (year, remark) VALUES (2026, '系统预置')");
  await ensureQcYearbookFinishedProductInspectionColumns(pool);
}
