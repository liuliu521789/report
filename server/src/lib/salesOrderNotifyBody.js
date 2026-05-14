/**
 * 订单/合同站内信与企业微信正文拼装（原 sales.js 内联函数抽出，供路由与公开审批复用）
 */
import {
  loadOrderFieldDefinitions,
  attachCustomerNamesToOrders,
  mergeRowDataJson
} from './salesOrderFields.js';

/** 单条订单摘要：发货日期、上传日期、厂家、型号、数量等 */
export function formatOrderSummaryLine(row, definitions) {
  const { display_data } = mergeRowDataJson(row, definitions);
  const nameKey = definitions.find((d) => d.maps_to === 'customer_name')?.field_key;
  const modelKey = definitions.find((d) => d.maps_to === 'product_model')?.field_key;
  const whKey = definitions.find((d) => d.maps_to === 'warehouse_model')?.field_key;
  const qtyKey = definitions.find((d) => d.maps_to === 'quantity')?.field_key;
  const pick = (key, fallback) => {
    if (key != null && display_data[key] !== undefined && display_data[key] !== null) {
      const s = String(display_data[key]).trim();
      if (s !== '') return s;
    }
    if (fallback != null && fallback !== '') {
      const s = String(fallback).trim();
      if (s !== '') return s;
    }
    return '—';
  };
  const orderNo = row.order_no ? String(row.order_no) : '—';
  const vendor = pick(nameKey, row.customer_name);
  const model = pick(modelKey, row.product_model);
  const wh = pick(whKey, row.warehouse_model);
  const qty =
    qtyKey != null && display_data[qtyKey] !== undefined && display_data[qtyKey] != null && String(display_data[qtyKey]).trim() !== ''
      ? String(display_data[qtyKey]).trim()
      : row.quantity != null && String(row.quantity) !== ''
        ? String(row.quantity)
        : '—';
  const orderDateKey = definitions.find((d) => d.field_key === 'order_date')?.field_key;
  const shipDate =
    orderDateKey != null && display_data[orderDateKey] !== undefined && display_data[orderDateKey] != null
      ? String(display_data[orderDateKey]).trim() || '—'
      : '—';
  const uploadAt = formatOrderUploadTime(row.created_at);
  return `订单号：${orderNo}\n厂家：${vendor}\n发货日期：${shipDate}\n上传日期：${uploadAt}\n标签型号：${model}\n仓库型号：${wh}\n数量：${qty}`;
}

export function formatOrderUploadTime(createdAt) {
  if (createdAt == null) return '—';
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(d.getTime())) return String(createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 多条订单站内信正文（intro + 逐条基础信息） */
export function buildOrderMessageBody(definitions, rows, { intro = '', maxOrders = 15 } = {}) {
  const list = rows.slice(0, maxOrders);
  const blocks = list.map((r) => formatOrderSummaryLine(r, definitions));
  let body = '';
  if (intro) body += `${intro.trim()}\n\n`;
  body += blocks.join('\n\n');
  if (rows.length > maxOrders) {
    body += `\n\n… 另有 ${rows.length - maxOrders} 笔订单未逐条列出，请到订单管理查看。`;
  }
  return body;
}

export async function buildOrderNotifyBody(pool, orderRows, options) {
  const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
  const enriched = await attachCustomerNamesToOrders(pool, orderRows);
  return buildOrderMessageBody(definitions, enriched, options);
}

/** 合同关联订单的站内信正文 */
export async function buildContractOrdersNotifyBody(pool, contractId, { intro = '', customerName = '' } = {}) {
  const [ords] = await pool.query(
    `SELECT o.* FROM sales_orders o
     INNER JOIN sales_contract_orders sco ON sco.order_id = o.id
     WHERE sco.contract_id = ?
     ORDER BY o.id ASC`,
    [contractId]
  );
  let head = intro.trim();
  if (customerName) head += `${head ? '\n' : ''}客户/厂家：${customerName}`;
  return buildOrderNotifyBody(pool, ords || [], { intro: head, maxOrders: 15 });
}

function clampNotifyText(str, maxLen = 900) {
  const s = str == null ? '' : String(str);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 16)}\n…（已截断）`;
}

/**
 * 合同待审批：站内信与企业微信文本卡片用的简短文案（不含订单明细；明细在系统合同管理中查看）。
 * 企业微信链接只放在文本卡片的 url，由按钮打开审批页。
 */
export function buildContractReviewerNotifyMessages({
  contractNo,
  customerName,
  chainStep,
  urge = false,
  actorUsername = ''
}) {
  const no = contractNo != null ? String(contractNo).trim() : '';
  const cn = customerName != null ? String(customerName).trim() : '';
  const notificationTitle = urge ? '合同审批催办' : '合同待审核';

  const seqLine =
    chainStep && chainStep.total > 1 && Number(chainStep.current) >= 1
      ? `审批顺序：第 ${chainStep.current}/${chainStep.total} 位。\n`
      : '';

  let head;
  if (urge) {
    const label = cn && no ? `${cn}（${no}）` : cn || (no ? `合同 ${no}` : '合同');
    head = `【催办】${label}仍待您审批，请尽快处理。`;
  } else if (cn && no) {
    head = `${cn} 的销售合同（${no}）待您审核。`;
  } else if (no) {
    head = `合同 ${no} 待您审核。`;
  } else if (cn) {
    head = `${cn} 的销售合同待您审核。`;
  } else {
    head = '您有新的销售合同待审核。';
  }

  const wecomDetail = clampNotifyText(
    `${head}\n${seqLine}请点击下方按钮进入审批页面。\n（合同与订单明细请在电脑端「合同管理」查看）` +
      (urge && actorUsername ? `\n（由 ${actorUsername} 发起催办）` : ''),
    512
  );

  let inboxBody =
    `${head}\n${seqLine}` +
    `请在「合同管理」中查看明细；企业微信用户请点击通知卡片上的按钮进入审批页。`;
  if (urge && actorUsername) inboxBody += `\n（由 ${actorUsername} 发起催办）`;
  inboxBody = clampNotifyText(inboxBody, 1900);

  return { notificationTitle, wecomDetail, inboxBody };
}
