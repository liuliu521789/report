import { getPool } from './pool.js';

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

export async function ensureReportImageLibraryTable() {
  const pool = getPool();
  await pool.query(DDL_REPORT_IMAGE_LIBRARY);
}

export async function ensureReportStylesTable() {
  const pool = getPool();
  await pool.query(DDL_REPORT_STYLES);
}

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows?.[0]?.c || 0) > 0;
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
    phone VARCHAR(64) NULL,
    address VARCHAR(512) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_sales_customers_code (customer_code),
    KEY idx_sales_customers_name (customer_name(64)),
    CONSTRAINT fk_sales_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
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
    status ENUM('pending_review', 'approved', 'rejected', 'shipped', 'completed', 'cancelled') NOT NULL DEFAULT 'pending_review',
    submitted_for_review_at DATETIME(3) NULL DEFAULT NULL,
    finance_reviewed_at DATETIME(3) NULL,
    finance_reviewed_by BIGINT UNSIGNED NULL,
    finance_comment VARCHAR(1024) NULL,
    shipped_at DATETIME(3) NULL,
    shipped_by BIGINT UNSIGNED NULL,
    shipping_instruction VARCHAR(1024) NULL,
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_sales_orders_no (order_no),
    KEY idx_sales_orders_customer (customer_id),
    KEY idx_sales_orders_status (status),
    KEY idx_sales_orders_created (created_at),
    KEY idx_sales_orders_created_by (created_by),
    CONSTRAINT fk_sales_orders_customer FOREIGN KEY (customer_id) REFERENCES sales_customers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sales_orders_finance_by FOREIGN KEY (finance_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
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
  DDL_SALES_INTERNAL_MESSAGES
];

const SALES_CATEGORY_SEEDS = [
  [
    '销售人员',
    'sales',
    10,
    '{"reports":{"list":false,"view":false,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":false,"create":false,"viewDetail":false,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":true,"order_query":true,"order_query_all":true,"order_edit":true,"order_submit":true,"order_withdraw":true,"order_status_finance":false,"order_status_warehouse":false,"order_ship":false,"order_view_status_logs":true,"order_cancel":true,"order_delete":true},"contract_management":{"template_manage":true,"contract_generate":true,"contract_submit":true,"contract_review":false,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":false,"data_export_all":false}}',
    0
  ],
  [
    '财务审核员',
    'finance',
    11,
    '{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":false,"order_query":true,"order_query_all":true,"order_edit":false,"order_submit":false,"order_withdraw":false,"order_status_finance":true,"order_status_warehouse":false,"order_ship":false,"order_view_status_logs":true,"order_cancel":true,"order_delete":true},"contract_management":{"template_manage":false,"contract_generate":false,"contract_submit":false,"contract_review":true,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":true,"data_export_all":false}}',
    0
  ],
  [
    '仓库人员',
    'warehouse',
    12,
    '{"reports":{"list":false,"view":false,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":false,"create":false,"viewDetail":false,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":false,"order_query":true,"order_query_all":true,"order_edit":false,"order_submit":false,"order_withdraw":false,"order_status_finance":false,"order_status_warehouse":true,"order_ship":true,"order_view_status_logs":true,"order_cancel":false,"order_delete":false},"contract_management":{"template_manage":false,"contract_generate":false,"contract_submit":false,"contract_review":false,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":false,"data_export_all":false}}',
    0
  ],
  [
    '系统管理员',
    'sales_admin',
    13,
    '{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":true,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":true},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":true},"audit":{"viewLogin":true,"viewOperations":true,"viewErrors":false,"exportAudit":false},"order_management":{"order_input":true,"order_query":true,"order_query_all":true,"order_edit":true,"order_submit":true,"order_withdraw":true,"order_status_finance":true,"order_status_warehouse":true,"order_ship":true,"order_view_status_logs":true,"order_cancel":true,"order_delete":true,"order_field_config":true},"contract_management":{"template_manage":true,"contract_generate":true,"contract_submit":true,"contract_review":true,"contract_view":true},"process_management":{"view_flow":true},"data_management":{"data_export":true,"data_export_all":true}}',
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

/** 幂等：保证站内信表存在（避免 ensureSalesModuleTables 中途失败后缺表导致 GET /sales/messages 500） */
export async function ensureSalesInternalMessagesTable() {
  const pool = getPool();
  await pool.query(DDL_SALES_INTERNAL_MESSAGES);
}

export async function ensureSalesModuleTables() {
  const pool = getPool();
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
  corp_secret VARCHAR(255) NOT NULL DEFAULT '',
  remark VARCHAR(255) NULL,
  receive_token VARCHAR(64) NOT NULL DEFAULT '',
  encoding_aes_key VARCHAR(64) NOT NULL DEFAULT '',
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

export async function ensureWecomNotificationsTables() {
  const pool = getPool();
  await pool.query(DDL_WECOM_CONFIG);
  await pool.query(
    "INSERT IGNORE INTO wecom_config (id, corp_id, agent_id, corp_secret) VALUES (1, '', 0, '')"
  );
  await pool.query(DDL_WECOM_RECIPIENTS);
  await pool.query(DDL_WECOM_TEMPLATES);
}

const WECOM_ORDER_TEMPLATES_SEED = `
INSERT IGNORE INTO wecom_notify_templates (code, name_zh, msg_type, title_template, body_template, url_template, btntxt)
VALUES
('sales_order_submit_finance', '销售提交财务审核（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_order_withdraw_finance', '销售撤回财务审核（系统）', 'text', NULL, '{{detail}}', NULL, '详情'),
('sales_order_approved_warehouse', '财务通过→仓库备货（系统）', 'textcard', '订单已审核通过', '{{detail}}', '{{shipConfirmUrl}}', '完成发货'),
('sales_order_rejected_sales', '财务驳回→销售（系统）', 'text', NULL, '{{detail}}', NULL, '详情')
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
      "ALTER TABLE wecom_config ADD COLUMN receive_token VARCHAR(64) NOT NULL DEFAULT '' COMMENT '回调 Token' AFTER remark"
    );
  }
  if (!(await columnExists(pool, 'wecom_config', 'encoding_aes_key'))) {
    await pool.query(
      "ALTER TABLE wecom_config ADD COLUMN encoding_aes_key VARCHAR(64) NOT NULL DEFAULT '' COMMENT '43位 EncodingAESKey' AFTER receive_token"
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
