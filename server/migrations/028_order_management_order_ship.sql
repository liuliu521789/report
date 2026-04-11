-- order_management.order_ship：确认发货权限（与「仓库」视图权限拆分）
-- 仅当 JSON 中尚无 order_ship 时，按原 order_status_warehouse 补默认值，便于单独关闭发货而保留仓库视图

UPDATE employee_categories
SET default_permissions_json = JSON_INSERT(
  default_permissions_json,
  '$.order_management.order_ship',
  COALESCE(
    JSON_EXTRACT(default_permissions_json, '$.order_management.order_status_warehouse'),
    CAST(false AS JSON)
  )
)
WHERE JSON_CONTAINS_PATH(default_permissions_json, 'one', '$.order_management')
  AND NOT JSON_CONTAINS_PATH(default_permissions_json, 'one', '$.order_management.order_ship');

UPDATE users
SET permissions_json = JSON_INSERT(
  permissions_json,
  '$.order_management.order_ship',
  COALESCE(
    JSON_EXTRACT(permissions_json, '$.order_management.order_status_warehouse'),
    CAST(false AS JSON)
  )
)
WHERE permissions_json IS NOT NULL
  AND JSON_CONTAINS_PATH(permissions_json, 'one', '$.order_management')
  AND NOT JSON_CONTAINS_PATH(permissions_json, 'one', '$.order_management.order_ship');
