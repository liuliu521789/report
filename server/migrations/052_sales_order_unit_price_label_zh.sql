-- 订单列表、导出表头：业务映射为单价时，显示名由「价格」改为「单价」
UPDATE sales_order_field_definitions
SET label_zh = '单价'
WHERE maps_to = 'unit_price' AND TRIM(label_zh) = '价格';
