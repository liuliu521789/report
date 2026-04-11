import { enrichApiErrorBody } from '../../../shared/apiErrorZh.js';

/** 为带 `error` 码的 JSON 响应自动补全中文 `message`，便于前端与公开页统一展示 */
export function apiErrorI18nMiddleware() {
  return (req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = (body) => origJson(enrichApiErrorBody(body));
    next();
  };
}
