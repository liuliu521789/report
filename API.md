# 后端接口文档

基址：服务端根 URL（开发默认 `http://localhost:3001`）。业务 JSON API 的统一前缀为 **`/api`**；公开扫码与报告相关另有 **无 `/api` 前缀** 的路径（见第 9 节）。

---

## 文档地图（前后端对接推荐路径）

| 内容 | 位置 | 说明 |
|------|------|------|
| **OpenAPI 3.0 规范** | [`docs/openapi.yaml`](docs/openapi.yaml) | 每个操作的 **方法、URL、请求体 schema、查询参数、响应结构、示例**；可导入 Postman / Insomnia / 代码生成器 |
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
| 2025-03-26 | 0.2.0 | 新增 `docs/openapi.yaml`；服务端可选 `ENABLE_API_DOCS` + `/api-docs`、`/openapi.yaml`；API.md 增补参数约定、JSON 示例与本变更表 |
| （以往） | 0.1.0 | 初始 Markdown 接口说明（按路由手写） |

后续每次变更 API（路径、字段、状态码、权限）时，请**同时**更新：`docs/openapi.yaml`、必要时更新本文示例与上表一行记录。

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
| GET | `/api/health` | 否 | 响应：`{ "ok": true, "ts": <毫秒时间戳> }` |

---

## 3. 认证与账号 (`/api/auth`)

| 方法 | 路径 | 认证 | 权限 | 请求体 / 说明 | 成功响应摘要 |
|------|------|------|------|----------------|--------------|
| POST | `/api/auth/login` | 否 | — | `{ "username": string, "password": string }` | `{ token, idleTimeoutMinutes, user: { id, username, accountType, employeeCategoryId, permissions } }` |
| GET | `/api/auth/me` | 是 | — | — | `{ user, idleTimeoutMinutes, confirmSensitiveOperations }` |
| POST | `/api/auth/change-password` | 是 | — | `{ "oldPassword": string, "newPassword": string }` | `{ ok: true }` |
| POST | `/api/auth/bootstrap-admin` | 条件 | — | `{ "username": string, "password": string }` | `{ ok: true, id }` |

**`bootstrap-admin`**：

- 若 `users` 表 **记录数为 0**：无需登录，用于初始化首个超级管理员。
- 若已有用户：需 **已登录的超管**，否则先走 `requireAuth` + `requireSuperAdmin`。

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

以下在 `router.use(requireSuperAdmin)` 之后，**仅超管**：

| 方法 | 路径 | 查询参数 | 响应 |
|------|------|----------|------|
| GET | `/api/audit/login` | `username`、`success`（`1`/`0`）、`from`、`to`、`limit`、`offset` | `{ items, total }` |
| GET | `/api/audit/operations` | `username`、`userId`、`module`、`from`、`to`、`limit`、`offset` | `{ items, total }` |
| GET | `/api/audit/errors` | `module`、`from`、`to`、`limit`、`offset` | `{ items, total }`（会先清理过期错误日志） |
| GET | `/api/audit/errors/export` | — | 附件 JSON，**最多 5000 条** |

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
| GET | `/api/users` | `{ items }`（含解析后的 `permissions`） |
| POST | `/api/users` | Body：`username`、`password`、`accountType`、`employeeCategoryId?`、`permissions?`；员工必须带类别；密码走安全策略 |
| PUT | `/api/users/:id` | 部分更新：`accountType`、`employeeCategoryId`、`permissions`、`isActive`、`password`；禁止禁用自己、最后一个超管降级等 |

错误示例：`409`：`USERNAME_EXISTS`；`400`：`LAST_SUPER_ADMIN`、`CANNOT_DISABLE_SELF`、`BAD_REQUEST` 等。

---

## 15. 静态与其它

| 路径 | 说明 |
|------|------|
| GET `/` | 纯文本：`qc-report-server` |
| GET `/uploads/...` | 上传文件（章、Logo 等） |
| GET `/vendor/jspdf/*`、`/vendor/html2canvas/*` | 依赖包 UMD，供公开页导出 |

---

## 16. 与前端联调

- 管理端开发：Vite 将 `/api`、`/uploads`、`/miniprogram` 代理到后端（`admin/vite.config.js`）。
- 生产环境：保证公开扫码 URL、PDF 打开页、`/uploads` 资源 **同源或可访问**，否则客户页图片与导出可能失败。

---

*机器可读规范：`docs/openapi.yaml`。文档由 `server/src/routes/*.js` 与 `server/src/index.js` 对照维护；若代码变更请同步更新 OpenAPI 与上文章节「变更记录」。*
