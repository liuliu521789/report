-- SQL Restore Integrity Check
-- Purpose:
-- 1) Quickly inspect whether key pages may have missing data after historical SQL restore
-- 2) Help identify high-risk single-row config tables
--
-- Usage:
-- - Run in MySQL client after selecting the business database.
-- - This script is read-only (SELECT only).

SELECT DATABASE() AS current_database;

-- Single-row config tables (high risk: missing first INSERT looks like full reset)
SELECT 'company_settings' AS table_name, COUNT(*) AS row_count FROM company_settings;
SELECT 'system_security_settings' AS table_name, COUNT(*) AS row_count FROM system_security_settings;
SELECT 'support_contact_settings' AS table_name, COUNT(*) AS row_count FROM support_contact_settings;
SELECT 'wecom_config' AS table_name, COUNT(*) AS row_count FROM wecom_config;
SELECT 'sales_settings' AS table_name, COUNT(*) AS row_count FROM sales_settings;

-- Master data / key lists (risk: first row missing)
SELECT 'company_stamps' AS table_name, COUNT(*) AS row_count FROM company_stamps;
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users;
SELECT 'employee_categories' AS table_name, COUNT(*) AS row_count FROM employee_categories;
SELECT 'departments' AS table_name, COUNT(*) AS row_count FROM departments;
SELECT 'sales_customers' AS table_name, COUNT(*) AS row_count FROM sales_customers;
SELECT 'sales_internal_models' AS table_name, COUNT(*) AS row_count FROM sales_internal_models;
SELECT 'sales_order_field_definitions' AS table_name, COUNT(*) AS row_count FROM sales_order_field_definitions;
SELECT 'wecom_notify_recipients' AS table_name, COUNT(*) AS row_count FROM wecom_notify_recipients;
SELECT 'wecom_notify_templates' AS table_name, COUNT(*) AS row_count FROM wecom_notify_templates;
SELECT 'report_styles' AS table_name, COUNT(*) AS row_count FROM report_styles;
SELECT 'report_image_library' AS table_name, COUNT(*) AS row_count FROM report_image_library;

-- Show current single-row records (if exists)
SELECT * FROM company_settings WHERE id = 1;
SELECT * FROM system_security_settings WHERE id = 1;
SELECT * FROM support_contact_settings WHERE id = 1;
SELECT id, corp_id, agent_id, remark, receive_token, updated_at FROM wecom_config WHERE id = 1;
SELECT * FROM sales_settings WHERE id = 1;

-- Stamps preview (for "company stamp management")
SELECT id, name, seal_type, image_url, is_active, created_at
FROM company_stamps
ORDER BY created_at DESC, id DESC
LIMIT 50;

