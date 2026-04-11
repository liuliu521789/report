/**
 * API 业务错误码（error 字段）→ 面向用户的中文说明。
 * 服务端通过中间件写入 message；管理端 axios 拦截器同步处理，供提示条使用。
 */
export const API_ERROR_ZH = {
  BAD_REQUEST: '请求无效或参数错误',
  UNAUTHORIZED: '未登录或登录已失效，请重新登录',
  FORBIDDEN: '没有权限执行此操作',
  NOT_FOUND: '记录不存在',

  INVALID_CREDENTIALS: '用户名或密码错误',
  ACCOUNT_LOCKED: '登录尝试过多，账号已暂时锁定',

  INVALID_PENDING_TOKEN: '会话已失效，请重新登录后再试',
  TOTP_ALREADY_ENABLED: '双因素认证已启用',
  TOTP_CODE_INVALID: '动态验证码错误',
  TOTP_NOT_READY: '双因素认证未就绪',

  INVALID_IMPERSONATION_TARGET: '不能以该用户身份登录',
  OLD_PASSWORD_WRONG: '原密码不正确',
  USERNAME_EXISTS: '用户名已存在',

  BAD_DEPARTMENT: '部门无效或不存在',
  ACCOUNT_TYPE_SCHEMA: '账号类型配置与数据库不一致，请更新服务或执行迁移',
  CANNOT_DISABLE_SELF: '不能停用自己',
  LAST_SUPER_ADMIN: '至少需要保留一名超级管理员',

  BAD_PARENT: '上级部门无效',
  INVALID_PARENT: '上级部门无效或会形成循环',
  HAS_CHILD_DEPARTMENTS: '存在子部门，无法删除',
  HAS_MEMBERS: '部门下仍有成员，无法删除',

  INVALID_QUICK_ROLE_USER: '快捷角色用户无效',
  NO_FILE: '未上传文件',
  NO_FILES: '未选择文件',
  UNSUPPORTED_TYPE: '不支持的文件类型',

  DUPLICATE_FIELD_KEY: '字段标识重复',
  DUPLICATE_CODE: '代码已存在',
  CODE_EXISTS: '代码已存在',
  CATEGORY_IN_USE: '分类正在使用，无法删除',
  CANNOT_DELETE_BUILTIN: '内置分类不能删除',

  REPORT_FIELD_KEY_DUPLICATE: '报告字段键重复',
  REPORT_UID_EXISTS: '报告 UID 已存在',
  REPORT_NO_EXISTS: '报告编号已存在',
  REPORT_NOT_FOUND: '关联的报告不存在',
  SEAL_NOT_ACTIVE: '印章未启用或不可用',

  LIBRARY_FULL: '图库数量已达上限',

  QRCODE_NOT_FOUND: '未找到关联的二维码',
  ORDER_NOT_FOUND: '订单不存在',
  ORDER_ALREADY_LINKED: '订单已关联其他合同',
  CONTRACT_NOT_FOUND: '合同不存在',
  CUSTOMER_MISMATCH: '客户不一致，无法合并操作',
  FIELD_KEY_EXISTS: '字段键已存在',
  VALIDATION_FAILED: '填写的数据未通过校验',
  ORDER_NOT_EDITABLE: '当前状态不允许编辑订单',
  MISSING_CUSTOMER_FIELD: '缺少客户字段配置',
  INVALID_STATUS: '当前状态不允许此操作',
  ALREADY_SUBMITTED: '已经提交过',
  NOT_SUBMITTED: '尚未提交',
  NO_IDS: '未选择任何记录',
  NOT_IN_REVIEW_QUEUE: '不在待审核队列中',
  COMMENT_REQUIRED: '请填写审核意见或备注',
  FILE_REQUIRED: '请上传文件',
  NO_FIELDS_DEFINED: '未配置订单字段，无法导入',
  EMPTY_SHEET: '表格为空或无法读取',
  DUPLICATE_HEADER: '表头重复',
  HEADER_MISMATCH: '表头与模板不一致',
  DUPLICATE_CUSTOMER_CODE: '客户编号重复',

  MAPS_TO_CONFLICT: '该业务映射已被其他启用字段占用',
  BAD_MAPS_TO: '无效的业务映射',

  TRANSLATE_FAILED: '翻译服务暂时不可用',

  BAD_AES_KEY: 'EncodingAESKey 格式不正确',
  TEXTCARD_REQUIRES_URL: '文本卡片通知须填写跳转链接',
  MISSING_RECIPIENT: '缺少通知接收人',

  DB_SCHEMA_OUTDATED: '数据库结构需要升级，请联系管理员执行迁移',
  INTERNAL_ERROR: '服务器繁忙，请稍后重试',

  TEMPLATE_NOT_FOUND: '合同模板不存在',
  BAD_CUSTOMER: '客户参数无效',
  CUSTOMER_NOT_FOUND: '客户不存在',

  ORDER_NO: '无法生成唯一订单号'
};

export function zhMessageForApiError(code) {
  if (code == null || code === '') return null;
  return API_ERROR_ZH[String(code)] ?? null;
}

export function enrichApiErrorBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const hasMsg = body.message != null && String(body.message).trim() !== '';
  if (hasMsg) return body;
  const err = body.error;
  if (typeof err !== 'string' || !err) return body;
  const zh = zhMessageForApiError(err);
  if (zh) return { ...body, message: zh };
  if (/^[A-Z][A-Z0-9_]*$/.test(err)) {
    return { ...body, message: '操作失败，请稍后重试' };
  }
  return { ...body, message: '请求无法完成，请检查输入后重试' };
}

/** 管理端：从 axios 错误解析展示文案（含超时、断网） */
export function axiosUserMessage(err, fallback = '操作失败') {
  if (!err) return fallback;
  const d = err.response?.data;
  if (d && typeof d === 'object') {
    const enriched = enrichApiErrorBody({ ...d });
    const msg = enriched.message != null ? String(enriched.message).trim() : '';
    if (msg) return msg;
  }
  if (!err.response) {
    const c = err.code;
    const m = String(err.message || '');
    if (c === 'ECONNABORTED' || /timeout/i.test(m)) return '请求超时，请稍后重试';
    if (m === 'Network Error') return '网络异常，请检查连接后重试';
    return fallback;
  }
  return fallback;
}
