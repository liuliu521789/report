-- 订单审核流程表单配置 + 订单运行时步骤索引
ALTER TABLE sales_settings
  ADD COLUMN order_flow_json JSON NULL COMMENT '订单审核流程定义' AFTER order_field_schema_version,
  ADD COLUMN order_flow_version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '流程定义版本号' AFTER order_flow_json;

ALTER TABLE sales_orders
  ADD COLUMN flow_config_version INT UNSIGNED NULL COMMENT '提交审核时锁定的流程版本' AFTER row_version,
  ADD COLUMN flow_step_index INT UNSIGNED NULL COMMENT '当前审核节点索引（0-based）' AFTER flow_config_version;

UPDATE sales_settings
SET order_flow_json = JSON_OBJECT(
  'version', 1,
  'steps', JSON_ARRAY(
    JSON_OBJECT(
      'id', 'finance',
      'node_type', 'finance_review',
      'label', '财务审核',
      'assignee_type', 'category',
      'assignee_category', 'finance',
      'assignee_user_ids', JSON_ARRAY()
    ),
    JSON_OBJECT(
      'id', 'qc',
      'node_type', 'qc_review',
      'label', '品管审核',
      'assignee_type', 'category',
      'assignee_category', 'qc',
      'assignee_user_ids', JSON_ARRAY()
    )
  )
),
order_flow_version = 1
WHERE id = 1 AND order_flow_json IS NULL;
