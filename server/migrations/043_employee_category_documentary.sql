-- 内置员工类别：跟单（documentary）；启动时 ensureSchema 亦会 INSERT IGNORE 补齐本行。
SET NAMES utf8mb4;
USE qc_report;

INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin)
VALUES (
  '跟单',
  'documentary',
  14,
  CAST('{"reports":{"list":false,"view":false,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":false,"seals":false,"export":false,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":false,"create":false,"viewDetail":false,"delete":false},"templates":{"use":false},"stamps":{"manage":false,"view":false},"company":{"manage":false,"view":false},"audit":{"viewLogin":false,"viewOperations":false,"viewErrors":false,"exportAudit":false},"wecom":{"manage":false,"send":false},"order_management":{"order_input":true,"order_query":true,"order_query_all":true,"order_edit":true,"order_submit":true,"order_withdraw":true,"order_status_finance":false,"order_status_warehouse":false,"order_ship":false,"order_view_status_logs":true,"order_cancel":true,"order_delete":true,"order_field_config":true},"contract_management":{"template_manage":true,"contract_generate":true,"contract_submit":true,"contract_review":false,"contract_view":true,"contract_edit":false,"contract_delete":false,"contract_edit_approved":false,"contract_delete_approved":false,"contract_version_view":true,"contract_multi_approve":true},"process_management":{"view_flow":true},"data_management":{"data_export":true,"data_export_all":true},"customer_management":{"view":true,"create":true,"edit":true,"disable":true}}' AS JSON),
  0,
  1
);
