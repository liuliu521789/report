-- 内置员工类别：经理（manager）；启动时 ensureSchema 亦会 INSERT IGNORE 补齐本行。
SET NAMES utf8mb4;
USE qc_report;

INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin)
VALUES (
  '经理',
  'manager',
  4,
  CAST('{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":true,"seals":false,"export":true,"chairmanApprove":false,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":true},"stamps":{"manage":false,"view":true},"company":{"manage":false,"view":true},"audit":{"viewLogin":true,"viewOperations":true,"viewErrors":false,"exportAudit":false},"wecom":{"manage":false,"send":false},"order_management":{"order_input":false,"order_query":true,"order_query_all":true,"order_edit":false,"order_submit":false,"order_withdraw":false,"order_status_finance":false,"order_status_qc":false,"order_status_warehouse":false,"order_ship":false,"order_view_status_logs":true,"order_cancel":false,"order_delete":false,"order_field_config":false,"order_list_unit_price":true,"order_list_contract":true,"order_list_qc_qrcode":true},"contract_management":{"template_manage":false,"contract_generate":false,"contract_submit":false,"contract_review":false,"contract_view":true,"contract_edit":false,"contract_delete":false,"invoice_delete":false,"contract_edit_approved":false,"contract_delete_approved":false,"contract_version_view":true,"contract_multi_approve":true},"process_management":{"view_flow":true,"edit_flow":false},"data_management":{"data_export":true,"data_export_all":false},"customer_management":{"view":true,"create":false,"edit":false,"disable":false},"qc_yearbooks":{"view":true,"upload":false}}' AS JSON),
  0,
  1
);
