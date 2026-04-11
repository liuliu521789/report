import { fetchWecomAccessToken, applyWecomTemplate, wecomSendMessage } from './wecomApi.js';
import {
  loadOrderFieldDefinitions,
  attachCustomerNamesToOrders,
  formatWarehouseWecomOrderDetail
} from './salesOrderFields.js';
import { signWecomShipToken } from './wecomShipToken.js';

export const WECOM_TEMPLATE_SALES_ORDER_SUBMIT_FINANCE = 'sales_order_submit_finance';
export const WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE = 'sales_order_withdraw_finance';
export const WECOM_TEMPLATE_SALES_ORDER_APPROVED_WAREHOUSE = 'sales_order_approved_warehouse';
export const WECOM_TEMPLATE_SALES_ORDER_REJECTED_SALES = 'sales_order_rejected_sales';

// 合同相关模板编码（需在「企业微信通知模板」配置中创建）
export const WECOM_TEMPLATE_CONTRACT_SUBMIT_REVIEWER = 'sales_contract_submit_reviewer';
export const WECOM_TEMPLATE_CONTRACT_REVIEW_RESULT = 'sales_contract_review_result';
export const WECOM_TEMPLATE_CODE_CATALOG = [
  {
    code: WECOM_TEMPLATE_SALES_ORDER_SUBMIT_FINANCE,
    meaning: '销售订单提交财务审核后通知财务',
    usedBy: ['销售订单提交审核', '销售订单批量提交审核']
  },
  {
    code: WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE,
    meaning: '销售订单撤回审核后通知财务',
    usedBy: ['销售订单撤回审核']
  },
  {
    code: WECOM_TEMPLATE_SALES_ORDER_APPROVED_WAREHOUSE,
    meaning: '财务审核通过后通知仓库发货（文本卡片）',
    usedBy: ['销售订单财务审核通过']
  },
  {
    code: WECOM_TEMPLATE_SALES_ORDER_REJECTED_SALES,
    meaning: '财务驳回后通知订单创建销售',
    usedBy: ['销售订单财务审核驳回', '销售订单财务批量驳回']
  },
  {
    code: WECOM_TEMPLATE_CONTRACT_SUBMIT_REVIEWER,
    meaning: '合同提交审核后通知审核人',
    usedBy: ['销售合同提交审核']
  },
  {
    code: WECOM_TEMPLATE_CONTRACT_REVIEW_RESULT,
    meaning: '合同审核结果通知合同提交人',
    usedBy: ['销售合同审核通过', '销售合同审核驳回']
  }
];

function clampWecomText(str, maxLen = 1900) {
  const s = str == null ? '' : String(str);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 20)}\n…（已截断）`;
}

function publicWecomBaseUrl() {
  const b = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return b || '';
}

async function resolveUserWecomUserid(pool, userId) {
  const uid = userId != null ? Number(userId) : NaN;
  if (!Number.isFinite(uid) || uid <= 0) return '';
  const [rows] = await pool.query(
    'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
    [uid]
  );
  const w = rows?.[0]?.wecom_userid != null ? String(rows[0].wecom_userid).trim() : '';
  return w || '';
}

/**
 * 财务收企业微信：优先 company_settings 的「快捷财务」账号；否则所有「财务」类别且填写了 wecom_userid 的员工。
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string>} pipe 拼接的 touser，可能为空
 */
export async function resolveFinanceWecomTouser(pool) {
  const [comp] = await pool.query(
    'SELECT quick_role_finance_user_id AS uid FROM company_settings WHERE id=1 LIMIT 1'
  );
  const designated = comp?.[0]?.uid != null ? Number(comp[0].uid) : null;
  if (designated && Number.isFinite(designated) && designated > 0) {
    const [uRows] = await pool.query(
      'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
      [designated]
    );
    const w = uRows?.[0]?.wecom_userid != null ? String(uRows[0].wecom_userid).trim() : '';
    if (w) return w;
    return '';
  }
  const [rows] = await pool.query(
    `SELECT u.wecom_userid FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'finance'
       AND u.wecom_userid IS NOT NULL AND TRIM(u.wecom_userid) <> ''`
  );
  const ids = (rows || []).map((r) => String(r.wecom_userid).trim()).filter(Boolean);
  return [...new Set(ids)].join('|');
}

/**
 * 仓库收企业微信：优先 company_settings「快捷仓库」账号；否则所有「仓库」类别且填写了 wecom_userid 的员工。
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string>}
 */
export async function resolveWarehouseWecomTouser(pool) {
  const [comp] = await pool.query(
    'SELECT quick_role_warehouse_user_id AS uid FROM company_settings WHERE id=1 LIMIT 1'
  );
  const designated = comp?.[0]?.uid != null ? Number(comp[0].uid) : null;
  if (designated && Number.isFinite(designated) && designated > 0) {
    const [uRows] = await pool.query(
      'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
      [designated]
    );
    const w = uRows?.[0]?.wecom_userid != null ? String(uRows[0].wecom_userid).trim() : '';
    if (w) return w;
    return '';
  }
  const [rows] = await pool.query(
    `SELECT u.wecom_userid FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'warehouse'
       AND u.wecom_userid IS NOT NULL AND TRIM(u.wecom_userid) <> ''`
  );
  const ids = (rows || []).map((r) => String(r.wecom_userid).trim()).filter(Boolean);
  return [...new Set(ids)].join('|');
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ templateCode: string, variables: Record<string, string|number|boolean|null|undefined>, toUser: string }} opts
 */
export async function sendWecomTemplateMessage(pool, { templateCode, variables, toUser }) {
  const toUserStr = toUser == null ? '' : String(toUser).trim();
  if (!toUserStr) {
    const e = new Error('MISSING_RECIPIENT');
    e.code = 'MISSING_RECIPIENT';
    throw e;
  }

  const [cfgRows] = await pool.query(
    'SELECT corp_id AS corpId, agent_id AS agentId, corp_secret AS corpSecret FROM wecom_config WHERE id=1 LIMIT 1'
  );
  const cfg = cfgRows?.[0];
  const corpId = cfg?.corpId ? String(cfg.corpId).trim() : '';
  const corpSecret = cfg?.corpSecret ? String(cfg.corpSecret).trim() : '';
  const agentId = cfg?.agentId != null ? Number(cfg.agentId) : 0;
  if (!corpId || !corpSecret || !agentId) {
    const e = new Error('WECOM_NOT_CONFIGURED');
    e.code = 'WECOM_NOT_CONFIGURED';
    throw e;
  }

  const [tr] = await pool.query(
    `SELECT code, msg_type AS msgType, title_template AS titleTemplate, body_template AS bodyTemplate,
            url_template AS urlTemplate, btntxt FROM wecom_notify_templates WHERE code=? LIMIT 1`,
    [templateCode]
  );
  const tpl = tr?.[0];
  if (!tpl) {
    const e = new Error('TEMPLATE_NOT_FOUND');
    e.code = 'TEMPLATE_NOT_FOUND';
    throw e;
  }

  const strVars = {};
  for (const [k, v] of Object.entries(variables || {})) {
    strVars[k] = v == null ? '' : String(v);
  }

  const msgType = tpl.msgType;
  let body = {
    touser: toUserStr,
    agentid: agentId
  };

  if (msgType === 'text') {
    body.msgtype = 'text';
    body.text = { content: applyWecomTemplate(tpl.bodyTemplate, strVars) };
  } else if (msgType === 'markdown') {
    body.msgtype = 'markdown';
    body.markdown = { content: applyWecomTemplate(tpl.bodyTemplate, strVars) };
  } else if (msgType === 'textcard') {
    const cardUrl = applyWecomTemplate(tpl.urlTemplate || '', strVars).trim();
    if (!cardUrl) {
      const e = new Error(
        '文本卡片缺少链接 url（模板未填或变量替换后为空）。企业微信返回 errcode 41010: missing url。请在模板中填写「链接地址」，且发送时传入能填满 url 的变量。'
      );
      e.code = 'TEXTCARD_URL_EMPTY';
      throw e;
    }
    body.msgtype = 'textcard';
    body.textcard = {
      title: applyWecomTemplate(tpl.titleTemplate || '', strVars),
      description: applyWecomTemplate(tpl.bodyTemplate, strVars),
      url: cardUrl,
      btntxt: (tpl.btntxt && String(tpl.btntxt)) || '详情'
    };
  } else {
    const e = new Error('UNSUPPORTED_MSG_TYPE');
    e.code = 'UNSUPPORTED_MSG_TYPE';
    throw e;
  }

  const token = await fetchWecomAccessToken(corpId, corpSecret);
  return wecomSendMessage(token, body);
}

/**
 * 销售订单事件：站内信后发企业微信（失败不影响业务流程；建议 await 以免进程收尾过早丢失发送）
 * @param {'submit'|'withdraw'|'batch_submit'|'cancel'} event — batch_submit/submit/cancel 使用提交类模板时由 templateCode 覆盖
 */
export async function tryNotifyFinanceWecomOrderEvent(
  pool,
  { event, notifyBody, orderRows, fromUserId, templateCode: templateOverride = null }
) {
  try {
    let templateCode = templateOverride;
    if (!templateCode) {
      templateCode =
        event === 'withdraw'
          ? WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE
          : WECOM_TEMPLATE_SALES_ORDER_SUBMIT_FINANCE;
    }
    const toUser = await resolveFinanceWecomTouser(pool);
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }
    const first = orderRows?.[0] || {};
    const orderNo = first.order_no != null ? String(first.order_no) : '';
    const count = orderRows?.length != null ? String(orderRows.length) : '0';
    const detail = clampWecomText(notifyBody);

    await sendWecomTemplateMessage(pool, {
      templateCode,
      variables: { detail, orderNo, count, fromUser: fromUsername },
      toUser
    });
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] finance order notify:', e?.message || e);
  }
}

/**
 * 财务审核通过后通知仓库：每笔订单单独一条企业微信；文本卡片跳转确认页，仅在页内点击「完成发货」才更新状态。
 * （企业微信文本卡片的正文区域与底部按钮共用同一 url，无法做到「只按钮可点」；确认页规避误触发货。）
 * 依赖环境变量 PUBLIC_BASE_URL（绝对 HTTPS 根地址）、JWT_SECRET。
 */
export async function tryNotifyWarehouseWecomOrderApproved(pool, { orderRows, fromUserId }) {
  const list = orderRows?.length ? orderRows : [];
  if (!list.length) return;
  try {
    if (!process.env.JWT_SECRET) {
      // eslint-disable-next-line no-console
      console.warn('[wecom] warehouse approve notify skipped: JWT_SECRET not set');
      return;
    }
    const baseUrl = publicWecomBaseUrl();
    if (!baseUrl) {
      // eslint-disable-next-line no-console
      console.warn('[wecom] warehouse approve notify skipped: PUBLIC_BASE_URL empty (required for ship link)');
      return;
    }

    const templateCode = WECOM_TEMPLATE_SALES_ORDER_APPROVED_WAREHOUSE;
    const toUser = await resolveWarehouseWecomTouser(pool);
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }

    const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const enriched = await attachCustomerNamesToOrders(pool, list);

    const intro = '订单已通过财务审核，请备货发货。';
    for (const row of enriched) {
      try {
        const block = formatWarehouseWecomOrderDetail(row, definitions);
        const detail = clampWecomText(`${intro}\n\n${block}`);
        const orderNo = row.order_no != null ? String(row.order_no) : '';
        const shipToken = signWecomShipToken(row.id);
        const enc = encodeURIComponent(shipToken);
        const shipConfirmUrl = `${baseUrl}/api/public/wecom-order-ship-confirm?t=${enc}`;
        const shipUrl = `${baseUrl}/api/public/wecom-order-ship?t=${enc}`;

        await sendWecomTemplateMessage(pool, {
          templateCode,
          variables: {
            detail,
            orderNo,
            count: '1',
            fromUser: fromUsername,
            shipConfirmUrl,
            shipUrl
          },
          toUser
        });
      } catch (oneErr) {
        if (oneErr?.code === 'WECOM_NOT_CONFIGURED' || oneErr?.code === 'TEMPLATE_NOT_FOUND') return;
        // eslint-disable-next-line no-console
        console.warn('[wecom] warehouse order approved notify (single order):', row?.id, oneErr?.message || oneErr);
      }
    }
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] warehouse order approved notify:', e?.message || e);
  }
}

/**
 * 财务驳回订单后通知创建人（销售）的企业微信，正文与站内信摘要一致。
 */
export async function tryNotifySalesWecomOrderRejected(pool, { notifyBody, orderRows, fromUserId, toUserId }) {
  try {
    const uid = toUserId != null ? Number(toUserId) : NaN;
    if (!Number.isFinite(uid) || uid <= 0) return;

    const templateCode = WECOM_TEMPLATE_SALES_ORDER_REJECTED_SALES;
    const [uRows] = await pool.query(
      'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
      [uid]
    );
    const toUser = uRows?.[0]?.wecom_userid != null ? String(uRows[0].wecom_userid).trim() : '';
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }
    const first = orderRows?.[0] || {};
    const orderNo = first.order_no != null ? String(first.order_no) : '';
    const count = orderRows?.length != null ? String(orderRows.length) : '0';
    const detail = clampWecomText(notifyBody);

    await sendWecomTemplateMessage(pool, {
      templateCode,
      variables: { detail, orderNo, count, fromUser: fromUsername },
      toUser
    });
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] sales order rejected notify:', e?.message || e);
  }
}

/**
 * 合同提交审核后，给审核人发企业微信，正文与站内信摘要一致。
 */
export async function tryNotifyContractReviewerOnSubmit(
  pool,
  { contractRow, notifyBody, fromUserId, reviewerUserId }
) {
  try {
    const templateCode = WECOM_TEMPLATE_CONTRACT_SUBMIT_REVIEWER;
    const toUid = reviewerUserId != null ? reviewerUserId : contractRow?.reviewer_user_id;
    const contractNo = contractRow?.contract_no != null ? String(contractRow.contract_no) : '';

    if (!toUid) {
      // eslint-disable-next-line no-console
      console.warn(`[wecom] contract submit notify skipped: contract ${contractNo} has no reviewer_user_id`);
      return;
    }

    const toUser = await resolveUserWecomUserid(pool, toUid);
    if (!toUser) {
      const [userRows] = await pool.query(
        'SELECT username, wecom_userid, is_active FROM users WHERE id=? LIMIT 1',
        [toUid]
      );
      const user = userRows?.[0];
      // eslint-disable-next-line no-console
      console.warn(
        `[wecom] contract submit notify skipped: contract ${contractNo} reviewer userId=${toUid} ` +
        `(username=${user?.username || 'unknown'}) ` +
        `wecom_userid=${user?.wecom_userid || 'null'}, is_active=${user?.is_active}`
      );
      return;
    }

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) {
      // eslint-disable-next-line no-console
      console.warn(`[wecom] contract submit notify skipped: template ${templateCode} not found`);
      return;
    }

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }

    const customerName =
      contractRow?.linked_customer_name != null
        ? String(contractRow.linked_customer_name)
        : contractRow?.customer_name != null
        ? String(contractRow.customer_name)
        : '';
    const detail = clampWecomText(notifyBody);

    await sendWecomTemplateMessage(pool, {
      templateCode,
      variables: { detail, contractNo, customerName, fromUser: fromUsername },
      toUser
    });
    // eslint-disable-next-line no-console
    console.log(`[wecom] contract submit notify sent: contract ${contractNo} -> reviewer userId=${toUid}`);
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] contract submit notify error:', e?.message || e);
  }
}

/**
 * 合同审核后，将审核结果通过企业微信发给创建人。
 */
export async function tryNotifyContractCreatorOnReview(
  pool,
  { contractRow, notifyBody, fromUserId, result, reviewComment = '' }
) {
  try {
    const templateCode = WECOM_TEMPLATE_CONTRACT_REVIEW_RESULT;
    const creatorId = contractRow?.created_by;
    const contractNo = contractRow?.contract_no != null ? String(contractRow.contract_no) : '';

    if (!creatorId) {
      // eslint-disable-next-line no-console
      console.warn(`[wecom] contract review notify skipped: contract ${contractNo} has no created_by`);
      return;
    }

    const toUser = await resolveUserWecomUserid(pool, creatorId);
    if (!toUser) {
      // 检查是企业微信未配置还是用户未绑定
      const [userRows] = await pool.query(
        'SELECT username, wecom_userid, is_active FROM users WHERE id=? LIMIT 1',
        [creatorId]
      );
      const user = userRows?.[0];
      // eslint-disable-next-line no-console
      console.warn(
        `[wecom] contract review notify skipped: contract ${contractNo} creator userId=${creatorId} ` +
        `(username=${user?.username || 'unknown'}) ` +
        `wecom_userid=${user?.wecom_userid || 'null'}, is_active=${user?.is_active}`
      );
      return;
    }

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) {
      // eslint-disable-next-line no-console
      console.warn(`[wecom] contract review notify skipped: template ${templateCode} not found`);
      return;
    }

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }

    const customerName =
      contractRow?.linked_customer_name != null
        ? String(contractRow.linked_customer_name)
        : contractRow?.customer_name != null
        ? String(contractRow.customer_name)
        : '';
    const detail = clampWecomText(notifyBody);
    const statusLabel = result === 'approved' ? '已通过' : '已驳回';
    const reviewCommentText = reviewComment == null ? '' : String(reviewComment);

    await sendWecomTemplateMessage(pool, {
      templateCode,
      variables: {
        detail,
        contractNo,
        customerName,
        fromUser: fromUsername,
        statusLabel,
        contractReviewStatus: statusLabel,
        reviewComment: reviewCommentText
      },
      toUser
    });
    // eslint-disable-next-line no-console
    console.log(`[wecom] contract review notify sent: contract ${contractNo} -> userId=${creatorId}, result=${result}`);
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] contract review notify error:', e?.message || e);
  }
}
