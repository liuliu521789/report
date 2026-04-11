-- 董事长内置类别（列由应用启动时 ensureChairmanAndTotpColumns 或 schema.sql 新版本创建）
-- 若已存在 chairman 行则跳过。手工执行前请确认表已有 require_two_factor 列。

USE qc_report;

INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor) VALUES
('董事长', 'chairman', 3,
 CAST('{"reports":{"list":true,"view":true,"create":false,"edit":false,"void":false,"activate":false,"bulkPass":false,"bulkVoid":false,"bulkActivate":false,"bulkDelete":false,"previewPrint":true,"seals":false,"export":true,"chairmanApprove":true,"fieldEdit":{}},"qrcodes":{"list":true,"create":false,"viewDetail":true,"delete":false},"templates":{"use":true},"stamps":{"manage":false,"view":true},"company":{"manage":false,"view":true},"audit":{"viewLogin":true,"viewOperations":true,"viewErrors":true,"exportAudit":true}}' AS JSON),
 1);
