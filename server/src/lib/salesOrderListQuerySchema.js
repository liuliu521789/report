import { z } from 'zod';

/** 订单列表 / 导出共用查询参数 */
export const listQuerySchema = z.object({
  /** 精确按订单主键筛选（用于站内信跳转定位等） */
  id: z.coerce.number().int().positive().optional(),
  customer_name: z.string().optional(),
  customer_code: z.string().optional(),
  product_name: z.string().optional(),
  product_code: z.string().optional(),
  product_model: z.string().optional(),
  warehouse_model: z.string().optional(),
  order_no: z.string().optional(),
  status: z.string().optional(),
  sales_user_id: z.coerce.number().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  page_size: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 20 : v),
    z.coerce.number().refine((n) => [10, 20, 50, 100, 200, 500].includes(n), { message: 'page_size' })
  ),
  sort: z.enum(['created_at_desc', 'created_at_asc', 'customer_name_desc', 'customer_name_asc']).default('created_at_desc'),
  pending_finance_only: z.preprocess((v) => v === true || v === '1' || v === 'true', z.boolean().optional()),
  pending_qc_only: z.preprocess((v) => v === true || v === '1' || v === 'true', z.boolean().optional()),
  /** 为 true 时列表接口附带 field_definitions（兼容旧客户端） */
  include_field_definitions: z.preprocess((v) => v === true || v === '1' || v === 'true', z.boolean().optional()),
  /** 流程看板快捷筛选：与 GET /orders 组合使用 */
  flow_bucket: z
    .enum(['pending_submit', 'pending_finance', 'pending_qc', 'pending_ship', 'shipped_open', 'rejected'])
    .optional()
});
