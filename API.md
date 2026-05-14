# 后端接口文档

基址：服务端根 URL（开发默认 `http://localhost:3001`）。业务 JSON API 的统一前缀为 **`/api`**；公开扫码与报告相关另有 **无 `/api` 前缀** 的路径（见第 9 节）。

---

## 文档地图（前后端对接推荐路径）

| 内容 | 位置 | 说明 |
|------|------|------|
| **OpenAPI 3.0 规范** | [`docs/openapi.yaml`](docs/openapi.yaml) | 覆盖 **健康检查、认证、报告、二维码、印章、模板、公司、翻译、安全、审计、员工类别、用户、公开接口** 等；**仪表盘 / 备份 / 销售 / 企业微信** 等扩展接口以本文 **§15 起** 与源码为准 |
| **Swagger UI** | 启动服务且 `ENABLE_API_DOCS=true` 时访问 **`/api-docs`** | 互动式文档：在线调试、persist 授权信息 |
| **原始规范** | **`GET /openapi.yaml`** | 供 CI、网关、或 [Swagger Editor](https://editor.swagger.io/) 拉取 |
| **本文** | `API.md` | 全局约定、**典型 JSON 示例**、错误码速查、按模块表格索引、**变更记录** |

维护约定：字段级「是否必填、默认值、枚举」以 **`docs/openapi.yaml`** 与 **`server/src/routes/*.js`** 为准；若与下表不一致，优先源码与 OpenAPI。

---

## OpenAPI 与 Swagger UI

1. 复制 `server/.env.example`，设置 **`ENABLE_API_DOCS=true`**（生产环境若不需要外网暴露文档，请设为 `false` 或删除此行）。
2. 启动后端：`cd server && npm run dev`。
3. 浏览器打开：`http://localhost:3001/api-docs`（端口以 `PORT` 为准）。
4. 点击 **Authorize**，在 Bearer 框中填入登录接口返回的 **`token`**（ Swagger UI 一般填写 `Bearer eyJhbGci...` 整段，或按界面提示仅填 JWT，以实际 UI 为准）。
5. 离线预览：将 `docs/openapi.yaml` 拖入 [editor.swagger.io](https://editor.swagger.io/)，或使用 Redoc / Stoplight。

---

## 全局参数约定（参数详解）

以下为跨接口的通用规则；**单个接口特有字段**（如报告 `fields[]`）见 OpenAPI 中对应 path 的 `requestBody` / `parameters`。

### 认证（需登录接口）

| 位置 | 名称 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| Header | `Authorization` | string | **是** | 格式：`Bearer <JWT>` |

### 常见分页 / 筛选（查询参数，均为可选除非接口另有说明）

| 名称 | 类型 | 默认 | 约束 | 说明 |
|------|------|------|------|------|
| `limit` | integer | 因接口而异（多为 50 或 100） | 通常 ≤200 | 每页条数 |
| `offset` | integer | `0` | ≥0 | 跳过条数 |
| `q` | string | — | — | 关键词搜索（各接口搜索字段不同） |
| `from` / `to` | string | — | — | 审计日志等时间过滤（格式与 MySQL 比较一致，常用 `YYYY-MM-DD` 或完整时间） |

### 路径参数

| 名称 | 类型 | 说明 |
|------|------|------|
| `id` | 正整数 | 报告、二维码、模板等资源主键 |

### JSON 请求体（非文件接口）

| 项 | 约定 |
|----|------|
| `Content-Type` | `application/json` |
| 字符编码 | UTF-8 |

### 文件上传

| 接口 | 字段名 | 类型 | 大小限制 |
|------|--------|------|----------|
| `POST /api/stamps/upload` | `file` | PNG / JPEG / WebP | ≤2MB |
| `POST /api/company/settings/logo` | `file` | PNG / JPEG / WebP | ≤2MB |
| `Content-Type` | `multipart/form-data` | — | — |

---

## 典型请求 / 响应示例

下列示例便于前端对齐字段形态；**完整枚举与可选字段**见 `docs/openapi.yaml` 中 `components/schemas`。

### 登录成功 `POST /api/auth/login`

请求：

```json
{
  "username": "inspector1",
  "password": "your-password"
}
```

响应 `200`：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "idleTimeoutMinutes": 60,
  "user": {
    "id": 2,
    "username": "inspector1",
    "accountType": "employee",
    "employeeCategoryId": 1,
    "permissions": {
      "reports": { "list": true, "view": true, "create": true },
      "qrcodes": { "list": true, "create": true }
    }
  }
}
```

### 登录失败（账号锁定）`403`

```json
{
  "error": "ACCOUNT_LOCKED",
  "lockedUntil": "2025-03-26T15:30:00.000Z"
}
```

### 通用错误 `401` / `403` / `400`

```json
{ "error": "UNAUTHORIZED" }
```

```json
{ "error": "FORBIDDEN" }
```

```json
{ "error": "BAD_REQUEST" }
```

### 报告列表 `GET /api/reports?q=树脂&status=active&limit=20&offset=0`

响应 `200`：

```json
{
  "items": [
    {
      "id": 101,
      "reportNo": "R-2025-001",
      "batchNo": "B20250301",
      "productName": "环氧树脂",
      "conclusion": "pass",
      "status": "active",
      "createdAt": "2025-03-26T08:00:00.000Z",
      "updatedAt": "2025-03-26T09:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### 新建报告 `POST /api/reports`

请求（最简自建字段；也可用 `templateId` 且省略 `fields` 从模板复制）：

```json
{
  "reportNo": "R-2025-002",
  "productName": "样品A",
  "batchNo": "B001",
  "conclusion": "unknown",
  "fields": [
    {
      "fieldKey": "product_name",
      "fieldLabel": "产品名称",
      "fieldLabelEn": "Product Name",
      "fieldType": "text",
      "fieldValue": { "zh": "样品A", "en": "Sample A" },
      "sortOrder": 10
    }
  ]
}
```

响应 `201`：

```json
{ "id": 102 }
```

冲突 `409`：

```json
{ "error": "REPORT_NO_EXISTS" }
```

### 公开摘要 `GET /api/public/summary?token=<qrcode_token>`

响应 `200`（结构随业务扩展，以下为示意）：

```json
{
  "token": "abc123...",
  "createdAt": "2025-03-26T10:00:00.000Z",
  "company": { "companyNameZh": "某某化工", "logoUrl": "/uploads/company/..." },
  "stamps": {},
  "reports": [
    {
      "id": 102,
      "reportNo": "R-2025-002",
      "productName": "样品A",
      "batchNo": "B001",
      "conclusion": "pass",
      "status": "active"
    }
  ]
}
```

### 翻译 `POST /api/translate`

请求：

```json
{
  "q": "检验结论",
  "source": "zh",
  "target": "en",
  "format": "text"
}
```

响应 `200`（已配置 LibreTranslate 时）：

```json
{ "translatedText": "Test conclusion" }
```

未配置翻译服务时：仍 `200`，`translatedText` 等于请求中的 `q`。

---

## 变更记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-05-11 | 0.3.0 | 增补仪表盘、权限 schema、部门、备份、报告配图库/样式、技术支持、**销售域**、**企业微信** API 索引；修正健康检查与审计日志权限/导出说明；认证章节补充验证码/TOTP/登出/模拟登录/`ALLOW_BOOTSTRAP`；明确扁平 JSON 响应约定 |
| 2025-03-26 | 0.2.0 | 新增 `docs/openapi.yaml`；服务端可选 `ENABLE_API_DOCS` + `/api-docs`、`GET /openapi.yaml`；API.md 增补参数约定、JSON 示例与本变更表 |
| （以往） | 0.1.0 | 初始 Markdown 接口说明（按路由手写） |

后续每次变更 API（路径、字段、状态码、权限）时，请**同时**更新：`docs/openapi.yaml`（若属于 OpenAPI 覆盖范围）、**本文对应章节**与本表一行记录。

---

## 1. 通用约定

### 1.1 认证

- **需登录接口**：请求头携带  
  `Authorization: Bearer <JWT>`
- **无需登录**：`/api/auth/login`、`POST /api/auth/bootstrap-admin`（见该接口说明）、以及第 9 节「公开接口」。

### 1.2 请求 / 响应

- 除文件上传外，请求体一般为 **`Content-Type: application/json`**。
- 全局 JSON body 大小上限约 **5MB**（`express.json`）。
- 成功时 HTTP 状态多为 `200`；创建资源常为 `201`。
- 错误时多为 JSON：`{ "error": "ERROR_CODE" }`，部分接口附带 `message`、`details` 等字段。
- **信封约定**：当前主干接口为 **扁平 JSON**（非统一的 `{ code, message, data }`）。Axios 侧通常使用 `const { data } = await http.get(...)`，其中 `data` 即为上述对象。若后续新模块统一信封，需在 OpenAPI 与本文同步说明。

### 1.3 常见 HTTP 状态与 `error` 代码

| 状态 | 含义 | 典型 `error` |
|------|------|----------------|
| 400 | 参数非法 | `BAD_REQUEST` |
| 401 | 未登录或 Token 无效 | `UNAUTHORIZED` |
| 403 | 无权限 / 业务拒绝 | `FORBIDDEN`、`ACCOUNT_LOCKED` |
| 404 | 资源不存在 | `NOT_FOUND` |
| 409 | 冲突 | `USERNAME_EXISTS`、`REPORT_NO_EXISTS`、`CODE_EXISTS`、`DUPLICATE_FIELD_KEY` |
| 502 | 上游失败 | `TRANSLATE_FAILED` |
| 500 | 服务器错误 | `INTERNAL_ERROR` 或 `error` 为异常信息 |

### 1.4 权限说明（员工账号）

员工 JWT 内含 `permissions` 对象；`super_admin` 的 `permissions` 为 `null`，服务端视为全允许。  
下文「权限」列中的模块/键与 `server/src/lib/permissions.js` 一致，例如 `reports:list` 表示 `requirePermission('reports', 'list')`。

「超管」表示 **超级管理员**（`requireSuperAdmin`）。

---

## 2. 健康检查

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 否 | 用于存活与简单监控（含 DB ping） |

典型响应 `200`（字段随版本略有增减，以 `server/src/routes/health.js` 为准）：

```json
{
  "ok": true,
  "ts": 1710000000000,
  "version": "x.y.z",
  "uptime": 12345,
  "env": "development",
  "memory": { "rss": "128MB" },
  "db": { "status": "connected", "latencyMs": 3 }
}
```

数据库不可用时 `ok` 为 `false`，`db.status` 为 `error` 并含简短 `message`。若延迟过高可能附带 `warnings`（如 `high_db_latency`）。

---

## 3. 认证与账号 (`/api/auth`)

| 方法 | 路径 | 认证 | 权限 | 请求体 / 说明 | 成功响应摘要 |
|------|------|------|------|----------------|--------------|
| GET | `/api/auth/captcha` | 否 | — | — | 图形验证码载荷（登录限流场景使用，结构见 `routes/auth.js`） |
| POST | `/api/auth/login` | 否 | — | `{ "username": string, "password": string, ... }` | `{ token, idleTimeoutMinutes, user }`（可能进入 TOTP 待验证流程，见源码） |
| POST | `/api/auth/totp/provision` | 否 | — | `{ pendingToken }` | TOTP 绑定二维码 / secret |
| POST | `/api/auth/totp/activate` | 否 | — | `{ pendingToken, code }` | 激活双因素 |
| POST | `/api/auth/totp/verify-login` | 否 | — | `{ pendingToken, code }` | 二次验证完成后签发正式会话 |
| GET | `/api/auth/me` | 是 | — | — | `{ user, idleTimeoutMinutes, confirmSensitiveOperations }` |
| POST | `/api/auth/change-password` | 是 | — | `{ oldPassword, newPassword }` | `{ ok: true }` |
| POST | `/api/auth/logout` | 是 | — | — | `{ ok: true }`（无效化 token 版本） |
| POST | `/api/auth/impersonate` | 是 | **超管** | `{ userId }` | 与登录成功类似：签发 **目标员工/经理** 权限的 `token` |
| POST | `/api/auth/bootstrap-admin` | 条件 | — | `{ username, password }` | `{ ok: true, id }` |

**`bootstrap-admin`**：

- 若 `users` 表 **记录数为 0**：可匿名调用，但须 **`ALLOW_BOOTSTRAP=true`**（环境变量）**或** 请求来源为本机 loopback（`127.0.0.1` / `::1`）；否则 `403` + `BOOTSTRAP_DISABLED`。
- 若已有用户：需 **已登录的超管**。

**登录相关错误**：

- `401` + `INVALID_CREDENTIALS`：用户不存在、禁用、密码错误等。
- `403` + `ACCOUNT_LOCKED` + `lockedUntil`：账号锁定（登录失败次数过多）。
- `401` + `INVALID_CREDENTIALS` + `locked: true`：本次失败触发锁定。

**修改密码**：`400` + `OLD_PASSWORD_WRONG`；新密码不符合策略时返回 `validatePasswordPlain` 的 `error` / `message`。

---

## 4. 报告 (`/api/reports`)

**全局**：`router.use(requireAuth)`。

### 4.1 列表与详情

| 方法 | 路径 | 权限 | 查询 / 说明 | 成功响应 |
|------|------|------|-------------|----------|
| GET | `/api/reports` | `reports:list` | `q`、`batchNo`、`status`（`active`\|`void`）、`limit`（≤200）、`offset` | `{ items, total, limit, offset }` |
| GET | `/api/reports/:id/customer-preview` | `reports:view` 或 `edit` 或 `previewPrint`（任一） | `id` 数值 | 与公开客户视图同结构的 JSON（`getReportCustomerPayload`） |
| GET | `/api/reports/:id` | 同上「任一」 | — | `{ report: { ..., fields: [...] } }` |

### 4.2 创建与更新

| 方法 | 路径 | 权限 | 请求体 | 说明 |
|------|------|------|--------|------|
| POST | `/api/reports` | `reports:create` | 见下表「报告写入字段」 | `201`：`{ id }`；重复报告号 `409`：`REPORT_NO_EXISTS` |
| PUT | `/api/reports/:id` | `reports:edit` | 同上 | `{ ok: true }`；PUT 会按服务端规则清洗字段（`sanitizeReportPutBody`，与字段级权限有关） |

**报告写入字段（创建 / 更新）**（Zod `upsertReportSchema`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `reportNo` | string，必填 | 报告编号 |
| `batchNo` | string，可选 | 批号 |
| `batchNoEn` | string，可选 | 英文批号 |
| `productName` | string，必填 | 产品名称 |
| `productNameEn` | string，可选 | 英文产品名 |
| `templateId` | 正整数或 null，可选 | 若提供且 `fields` 为空，从模板复制字段 |
| `conclusion` | `pass` \| `fail` \| `unknown`，可选 | 默认 `unknown` |
| `fields` | 数组，可选 | 元素：`fieldKey`、`fieldLabel`、`fieldLabelEn?`、`fieldType`、`fieldValue?`、`sortOrder?` |

### 4.3 模板另存

| 方法 | 路径 | 权限 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | `/api/reports/:id/save-as-template` | `templates:use` | `{ name, description?, includeValues? }` | `201`：`{ id }`（新模板 ID） |

### 4.4 状态与批量

| 方法 | 路径 | 权限 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | `/api/reports/:id/void` | `reports:void` | — | `{ ok: true }` |
| POST | `/api/reports/:id/activate` | `reports:activate` | — | `{ ok: true }` |
| POST | `/api/reports/bulk/conclusion-pass` | `bulkPass` 或 `edit`（任一） | `{ ids: number[] }`，1–500 | `{ ok, affectedCount }` |
| POST | `/api/reports/bulk/void` | `bulkVoid` 或 `void`（任一） | 同上 | 同上 |
| POST | `/api/reports/bulk/activate` | `bulkActivate` 或 `activate`（任一） | 同上 | 同上 |
| DELETE | `/api/reports/bulk` | `bulkDelete` 或 `void`（任一） | 同上 | `{ ok, deletedCount }`（先删绑定，再删报告） |
| POST | `/api/reports/bulk/generate-test` | `reports:create` | `{ count?: 1–500, templateId?: number \| null }` | `201`：`{ ok, createdCount, firstId, lastId }` |

### 4.5 报告用印（快照表 `report_seals`）

**印章类型 `sealType`**：`department_qc`、`inspector`、`supervisor`、`pass`、`recheck`。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/reports/:id/seals` | `reports:seals` | `{ appliedSeals: { [sealType]: { name, imageUrl } \| null } }` |
| POST | `/api/reports/:id/seals` | `reports:seals` | Body：`{ sealTypes: sealType[] }`（1–5 个）；从当前 **激活** 的公司章复制；缺激活章 `400`：`SEAL_NOT_ACTIVE` |
| DELETE | `/api/reports/:id/seals/:sealType` | `reports:seals` | 移除该类型用印快照 |

---

## 5. 二维码 (`/api/qrcodes`)

**全局**：`requireAuth`。

| 方法 | 路径 | 权限 | 请求 / 查询 | 响应 |
|------|------|------|-------------|------|
| POST | `/api/qrcodes` | `qrcodes:create` | `{ reportIds: number[] }`（1–200） | `201`：`{ id, token, scanUrl, qrDataUrl }`；报告不存在 `400`：`REPORT_NOT_FOUND` |
| GET | `/api/qrcodes` | `qrcodes:list` | `q`、`limit`、`offset` | `{ items, total, limit, offset }`（含 `qrThumbDataUrl`） |
| GET | `/api/qrcodes/:id` | `qrcodes:viewDetail` | — | `{ qrcode: { id, token, createdAt, reports: [...] } }` |
| GET | `/api/qrcodes/:id/qr` | `qrcodes:viewDetail` | — | `{ id, token, scanUrl, qrDataUrl }` |
| DELETE | `/api/qrcodes` | `delete` 或 `create`（任一） | Body：`{ ids: number[] }`（1–200） | `{ ok, deletedCount }` |

> `scanUrl` 形如 `{origin}/api/public/qr/{token}`，`origin` 由请求 Host / `PUBLIC_BASE_URL` 解析（`resolvePublicBaseUrl`）。

---

## 6. 公司章 (`/api/stamps`)

**全局**：`requireAuth` + **`stamps:manage`**（所有本模块接口）。

| 方法 | 路径 | 请求 | 响应 / 说明 |
|------|------|------|-------------|
| POST | `/api/stamps/upload` | `multipart/form-data`，字段名 `file`；PNG/JPEG/WebP，≤2MB | `{ imageUrl }`；`400`：`NO_FILE`、`UNSUPPORTED_TYPE` |
| GET | `/api/stamps` | — | `{ items: [...] }` |
| POST | `/api/stamps` | `{ name, sealType, imageUrl, isActive? }` | `201`：`{ id }`；同类型仅一个激活时会先取消其它激活 |
| PUT | `/api/stamps/:id` | 同上 | `{ ok, updatedCount }` |
| POST | `/api/stamps/:id/activate` | — | `{ ok: true }`：该类型仅当前 ID 激活 |
| DELETE | `/api/stamps/:id` | — | `{ ok: true }` |
| DELETE | `/api/stamps/bulk` | `{ ids: number[] }`（1–500） | `{ ok, deletedCount }` |

`sealType` 枚举同第 4.5 节。

---

## 7. 报告模板 (`/api/templates`)

**全局**：`requireAuth`。

| 方法 | 路径 | 权限 | 查询 / Body | 响应 |
|------|------|------|-------------|------|
| GET | `/api/templates` | `templates:use` **或** `reports:view` / `edit` / `create`（任一） | `q`、`limit`、`offset` | `{ items }` |
| GET | `/api/templates/:id` | 同上 | — | `{ template: { ..., fields } }` |
| POST | `/api/templates` | `templates:use` | `{ name, description?, fields: [...] }`（字段 1–500 项） | `201`：`{ id }`；`409`：`DUPLICATE_FIELD_KEY` |
| PUT | `/api/templates/:id` | `templates:use` | 同上 | `{ ok: true }` |
| DELETE | `/api/templates/:id` | `templates:use` | — | `{ ok: true }` |

**模板字段元素**：`fieldKey`、`fieldLabel`、`fieldLabelEn?`、`fieldType`、`defaultValue?`、`sortOrder?`。

---

## 8. 公司设置 (`/api/company`)

**全局**：`requireAuth`。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/company/settings` | `company:manage` **或** `reports:list` / `view` / `edit` / `create` / `previewPrint`（任一） | `{ settings }`（`company_settings` 行或 null） |
| PUT | `/api/company/settings` | `company:manage` | Body：`companyNameZh`、`companyNameEn`、`reportTitleZh`、`reportTitleEn`、`descriptionZh`、`descriptionEn`、`logoUrl`（均可选，部分会规范为空串） |
| POST | `/api/company/settings/logo` | `company:manage` | `multipart/form-data`，字段 `file`；≤2MB | `{ logoUrl }` |

---

## 9. 公开接口（扫码客户 / 小程序，**一般无需 JWT**）

下列路由挂载在 `publicRouter`，与 `/api/auth` 等并列，请注意路径前缀不完全在 `/api` 下。

### 9.1 扫码跳转（HTML 302）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/public/qr/:token` | 校验 token 后 **302** → `/api/public/scan?token=...` |
| GET | `/qr/:token` | 同上 |
| GET | `/mp/qr/:token` | 同上（旧链接兼容） |

### 9.2 落地页与报告页（HTML）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/scan.html` | 扫码落地 HTML |
| GET | `/api/public/scan` | 同上 |
| GET | `/miniprogram/index.html` | 同上 |
| GET | `/miniprogram/report.html` | 客户报告详情页 HTML |
| GET | `/api/public/report.html` | 同上 |

### 9.3 公开 JSON / PDF

| 方法 | 路径 | 查询参数 | 说明 |
|------|------|----------|------|
| GET | `/api/public/summary` | `token` | 该二维码下报告列表 + 公司 + 激活印章摘要；无 token `400`；无效 `404` |
| GET | `/api/public/report/:id` | `token`（必填） | 报告详情 JSON；token 与报告未绑定 `403` |
| GET | `/api/public/report/:id/pdf` | `token` | **Puppeteer** 生成 PDF；未绑定 `403`；响应 `application/pdf` |

---

## 10. 翻译 (`/api/translate`)

**全局**：`requireAuth`，且需 **`templates:use` 或 `reports:edit`** 之一。

| 方法 | 路径 | 请求体 | 响应 |
|------|------|--------|------|
| POST | `/api/translate` | `{ q, source?, target?, format? }`（`q` 1–2000 字符） | `{ translatedText }`；若未启用 LibreTranslate（环境变量），**直接返回原文**；上游失败 `502`：`TRANSLATE_FAILED` |

环境变量：`LIBRETRANSLATE_ENABLED=true`、`LIBRETRANSLATE_URL`（请求会 POST 到 `{URL}/translate`）。

---

## 11. 安全策略 (`/api/security`)

**全局**：`requireAuth` + **超管**。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/security` | `{ settings }`（合并默认值后的 JSON） |
| PUT | `/api/security` | 部分更新：`minPasswordLength`、`bannedPasswords`、`idleTimeoutMinutes`、`loginFailMaxAttempts`、`loginLockMinutes`、`confirmSensitiveOperations`、`errorLogRetentionDays` 等 |

---

## 12. 审计日志 (`/api/audit`)

**全局**：`requireAuth`。

| 方法 | 路径 | 权限 | 查询参数 | 响应 |
|------|------|------|----------|------|
| GET | `/api/audit/my-operations` | **非超管**；超管访问 `403` | `limit`、`offset`、`module`、`from`、`to` | `{ items, total }`（仅当前用户） |

**登录日志 `GET /api/audit/login`**：超管 **或** 具备权限 **`audit:viewLogin`** 的员工。

**操作日志 `GET /api/audit/operations`**：超管 **或** **`audit:viewOperations`**。

**错误日志 `GET /api/audit/errors`**：超管 **或** **`audit:viewErrors`**。

**批量导出（登录 / 操作 / 错误）**：超管 **或** **`audit:exportAudit`**；请求体 `{ ids: number[] }`（1–1000）。

**仅超管**：

| 方法 | 路径 | 说明 |
|------|------|------|
| DELETE | `/api/audit/login/bulk` | Body：`{ ids }`，批量删除登录日志 |
| DELETE | `/api/audit/operations/bulk` | Body：`{ ids }`，批量删除操作日志 |
| DELETE | `/api/audit/errors/bulk` | Body：`{ ids }`，批量删除错误日志 |
| GET | `/api/audit/errors/export` | 无 Body；附件 JSON，**最多 5000 条**（全量导出） |

**导出（按 ID 列表）**：

| 方法 | 路径 | Body |
|------|------|------|
| POST | `/api/audit/login/export` | `{ ids }` → `login-logs.json` |
| POST | `/api/audit/operations/export` | `{ ids }` → `operation-logs.json` |
| POST | `/api/audit/errors/export` | `{ ids }` → `error-logs.json` |

列表类接口查询参数：`limit`（默认 50，最大 200）、`offset`、`from`、`to` 等，见 `routes/auditLogs.js`。

---

## 13. 员工类别 (`/api/employee-categories`)

**全局**：`requireAuth` + **超管**。

| 方法 | 路径 | 请求体 / 说明 | 错误码 |
|------|------|---------------|--------|
| GET | `/api/employee-categories` | — | `{ items }` |
| POST | `/api/employee-categories` | `{ nameZh, code, sortOrder?, defaultPermissions? }`（`code`：字母数字下划线） | `409`：`CODE_EXISTS` |
| PUT | `/api/employee-categories/:id` | 部分字段：`nameZh`、`sortOrder`、`defaultPermissions`（与已有 JSON 合并） | `404` |
| DELETE | `/api/employee-categories/:id` | 内置 `qc`/`cs` 不可删；有用户引用 `400`：`CATEGORY_IN_USE` | `400`：`CANNOT_DELETE_BUILTIN` |

---

## 14. 用户管理 (`/api/users`)

**全局**：`requireAuth` + **超管**。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 分页：`page`、`pageSize`（默认 20，最大 200）、`keyword`、`accountType`、`isActive`、`categoryId`、`departmentId` → `{ items, total, page, pageSize }` |
| GET | `/api/users/lite` | 下拉用最小字段；`activeOnly`、`accountType` → `{ items }` |
| GET | `/api/users/:id` | `{ item }`（含解析后的 `permissions`） |
| POST | `/api/users` | 创建：`loginId`/`username`、`realName`、`password`、`accountType`、`employeeCategoryId`（员工/经理必填）、`departmentId`、`phone`、`wecomUserId`、`permissions` 等 → `201`：`{ id, loginId }` |
| PUT | `/api/users/:id` | 部分更新（含 `loginId`、`realName`、`departmentId`、`wecomUserId`、`requireTwoFactor` 等） |
| DELETE | `/api/users/:id` | 软删除 |
| POST | `/api/users/:id/reset-password` | 可选 Body：`{ password }`；返回 `{ ok, temporaryPassword? }` |
| POST | `/api/users/:id/force-logout` | 抬升 `token_version`，踢下线 |

错误示例：`409`：`USERNAME_EXISTS`；`400`：`LAST_SUPER_ADMIN`、`CANNOT_DISABLE_SELF`、`BAD_REQUEST` 等。

---

## 15. 仪表盘 (`/api/dashboard`)

**全局**：`requireAuth`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard/summary` | 今日/季度报告数、按周结论趋势、环形图口径；**超管**额外包含「约在线用户数」「24h 错误日志数」等字段（见 `routes/dashboard.js`） |

---

## 16. 权限 Schema (`/api/permissions`)

**全局**：`requireAuth`（任意登录用户可读元数据）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/permissions/schema` | `{ items }`：前端勾选面板用的模块/键定义（`lib/permissionSchema.js`） |

---

## 17. 部门 (`/api/departments`)

| 方法 | 路径 | 认证与权限 | 说明 |
|------|------|------------|------|
| GET | `/api/departments/tree` | 登录 + **`contract_management:contract_submit`** 或超管 | `{ tree }` 嵌套结构 |
| GET | `/api/departments/flat` | 超管 | 扁平列表 |
| POST | `/api/departments` | 超管 | 新建 |
| PUT | `/api/departments/:id` | 超管 | 更新 |
| DELETE | `/api/departments/:id` | 超管 | 删除（含子节点校验等，见源码） |

---

## 18. 备份与 SQL 工具 (`/api/backups`、`/api/sql`)

**仅挂载在以下路径上的路由要求超管**：`/api/backups`、`/api/sql`（见 `routes/backup.js`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/backups` | `{ backups }` |
| POST | `/api/backups/run` | 手动触发备份 |
| GET | `/api/backups/jobs` | 任务历史 |
| POST | `/api/backups/reencrypt` | 轮换备份加密密钥 |
| POST | `/api/backups/verify` | Body：`{ backupId }` 可恢复性校验 |
| POST | `/api/backups/restore/:id` | 从备份 ID 恢复 |
| DELETE | `/api/backups/:id` | 删除备份包 |
| GET | `/api/backups/download/:id` | 下载附件 |
| GET | `/api/sql` | 导出全库 SQL（大文件，慎用） |
| POST | `/api/sql` | Body：`{ sql }` 分段执行（维护用，风险高） |

环境与定时策略：`BACKUP_*`、`server/scheduler` 等见 `TECHNICAL.md` 与 `server/.env.example`。

---

## 19. 报告配图库 (`/api/report-image-library`)

**全局**：`requireAuth` + **超管**。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/report-image-library` | `{ items, maxTotal, maxBatch }` |
| POST | `/api/report-image-library/batch` | `multipart/form-data`，字段 **`files`**（多文件，类型/大小限制见路由） |
| DELETE | `/api/report-image-library/batch` | Body：待删除的 id 列表（见 `reportImageLibrary.js`） |

---

## 20. 报告样式 (`/api/report-styles`)

**全局**：`requireAuth`。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/report-styles` | `reports:create` **或** `edit` **或** `view` | 列表 |
| GET | `/api/report-styles/:id` | 同上 | `{ style }`（含 `elements` JSON） |
| POST | `/api/report-styles` | `reports:create` | Body：`name`、`description?`、`elements` |
| PUT | `/api/report-styles/:id` | `reports:edit` | 同上 |
| DELETE | `/api/report-styles/:id` | `reports:edit` | 删除 |

---

## 21. 技术支持联系方式 (`/api/support-contact`)

**全局**：`requireAuth`。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/support-contact` | 任意登录 | `{ engineerWechatId }` |
| PUT | `/api/support-contact` | **超管** | 更新工程师微信号 |

---

## 22. 销售域 (`/api/sales`)

**全局**：`requireAuth`。权限以 `server/src/lib/permissions.js` 中 **`order_management`**、**`contract_management`** 等为准；合同可见性含创建人、部门子树、财务审核人等规则（见 `routes/sales/salesShared.js`）。

### 22.1 合同模板与合同正文

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sales/contract-templates` | 列表 |
| GET | `/api/sales/contract-templates/:id` | 详情 |
| POST | `/api/sales/contract-templates` | 新建 |
| PATCH | `/api/sales/contract-templates/:id` | 更新 |
| DELETE | `/api/sales/contract-templates/:id` | 删除 |
| POST | `/api/sales/contracts/generate` | 由模板生成合同 |
| POST | `/api/sales/contracts/upload-document` | `multipart` 上传正文文档 |
| GET | `/api/sales/contracts` | 列表/筛选 |
| GET | `/api/sales/contracts/:id` | 详情 |
| GET | `/api/sales/contracts/:id/document` | 下载文档 |
| POST | `/api/sales/contracts/:id/replace-document` | 替换文档 |
| PATCH | `/api/sales/contracts/:id` | 更新元数据/正文等 |
| DELETE | `/api/sales/contracts/:id` | 删除 |
| POST | `/api/sales/contracts/bulk-delete` | 批量删除 |
| POST | `/api/sales/contracts/:id/submit` | 提交审批 |
| POST | `/api/sales/contracts/:id/withdraw` | 撤回 |
| POST | `/api/sales/contracts/:id/review` | 审核（单审核人模型） |
| POST | `/api/sales/contracts/:id/remind-reviewer` | 提醒审核人 |
| GET | `/api/sales/contracts/:id/versions` | 版本列表 |
| POST | `/api/sales/contracts/:id/versions` | 新版本 |
| GET | `/api/sales/contracts/:id/versions/:v1/:v2/diff` | 版本 Diff |
| POST | `/api/sales/contracts/:id/approval-flow` | 配置多级审批流 |
| GET | `/api/sales/contracts/:id/approval-flow` | 读取审批流 |
| POST | `/api/sales/contracts/:id/approve-step/:stepId` | 审批某一步 |

### 22.2 订单、客户、站内信、导入导出（`ordersRouter` 挂载在 `/api/sales` 下）

前缀均为 **`/api/sales`**。高频端点示例：

- **设置**：`GET|PATCH /settings`
- **自定义字段**：`GET|POST /order-fields`、`PATCH|DELETE /order-fields/:id`
- **客户**：`GET|POST /customers`、`PATCH /customers/:id`、`PATCH /customers/:id/status`、`GET /customers/:id/stats`、`POST /customers/bulk-delete`
- **内部型号**：`GET|POST /internal-models`、`PATCH /internal-models/:id`、`POST /internal-models/import`、`POST .../batch-delete`、`batch-enable`、`delete-all`
- **站内信**：`GET /messages`、`POST /messages/clear`、`POST /messages/:id/read`、`DELETE /messages/:id`、`POST /messages/batch-delete`
- **订单**：`GET|POST /orders`、`PATCH /orders/:id`、`DELETE /orders/:id`、`POST .../submit`、`withdraw`、`finance-review`、`ship`、`complete`、`cancel`、批量接口、`GET /orders/export/xlsx`、`GET /orders/template/xlsx`、`POST /orders/import/xlsx`
- **绑定与质检码**：`GET /qrcodes/bind-candidates`、`PATCH /orders/:id/qc-qrcode`、`POST /orders/:id/bind-contract`
- **日志与用户清单**：`GET /orders/:id/status-logs`、`edit-logs`、`GET /process/order-logs`、`GET /finance-reviewers`、`GET /sales-users`
- **客户合同列表**：`GET /customers/:customerId/contracts`

完整列表以 `server/src/routes/sales/ordersRouter.js` 为准。

---

## 23. 企业微信（管理 API：`/api/wecom`）

**全局**：`requireAuth`；具体 handler 上区分「可配置」与「可发消息」等（见 `routes/wecom.js`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/wecom/meta` | 元信息 |
| GET、PUT | `/api/wecom/config` | 读写企业绑定（Secret 等可能为 `enc:v1:` 密文存储） |
| GET、POST、PUT、DELETE | `/api/wecom/recipients`、`/recipients/:id` | 收件人 |
| GET、POST、PUT、DELETE | `/api/wecom/templates`、`/templates/:id` | 消息模板 |
| GET | `/api/wecom/templates/code/:code/snippet` | 按 code 取片段 |
| POST | `/api/wecom/send` | 手动发送 |
| GET | `/api/wecom/jobs` | 异步通知任务列表 |
| POST | `/api/wecom/jobs/:id/retry` | 重试失败任务 |

回调 URL（企业微信后台填写）：**`{PUBLIC_BASE_URL}/api/wecom/callback`**（**GET** 验证 **POST** 收消息；无 JWT）。服务端异步投递见 `lib/wecomNotifyWorker.js`（可用 `WECOM_NOTIFY_WORKER_DISABLED` 关闭）。

---

## 24. 其它销售路由占位

| 前缀 | 说明 |
|------|------|
| `GET/POST/... /api/sales/v2/*` | 当前统一 **`501`** + `NOT_IMPLEMENTED_SALES_V2` |
| `/api/sales-domain/*` | 实验性子域路由（customers / contracts / internal-models），与主 `/api/sales` 并行存在 |

---

## 25. 静态与其它

| 路径 | 说明 |
|------|------|
| GET `/` | 纯文本：`qc-report-server` |
| GET `/uploads/...` | 上传文件（章、Logo 等） |
| GET `/vendor/jspdf/*`、`/vendor/html2canvas/*` | 依赖包 UMD，供公开页导出 |

---

## 26. 与前端联调

- 管理端开发：Vite 将 `/api`、`/uploads`、`/miniprogram` 代理到后端（`admin/vite.config.js`）。
- 生产环境：保证公开扫码 URL、PDF 打开页、`/uploads` 资源 **同源或可访问**，否则客户页图片与导出可能失败。

---

*机器可读规范：`docs/openapi.yaml`（启用 `ENABLE_API_DOCS` 时亦可 `GET /openapi.yaml`）。扩展模块以本文 §15 起与 `server/src/routes/*.js`、`server/src/index.js` 为准；变更时请同步 OpenAPI（若适用）、本文与「变更记录」。*
