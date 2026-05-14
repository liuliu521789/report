## 化工厂质检报告系统

面向化工厂质检流程的报告管理系统，提供报告录入、审核留痕、二维码追溯和系统配置能力。

当前仓库包含以下模块：

- `server/`：Node.js + Express + MySQL 后端服务
- `admin/`：Vue 3 + Vite 管理端（报告、审计、配置等）
- `docs/`：接口文档（OpenAPI）

## 技术栈

- 后端：`Node.js`、`Express`、`MySQL`、`JWT`
- 前端：`Vue 3`、`Vite`、`Element Plus`、`Pinia`、`Vue Router`
- 文档：`OpenAPI`（`docs/openapi.yaml`）

## 环境要求

- `Node.js >= 18`
- `MySQL >= 8.0`
- `npm >= 9`

## 快速开始（开发环境）

### 1) 克隆并安装依赖

```bash
git clone <your-repo-url>
cd report

cd server && npm i
cd ../admin && npm i
```

### 2) 配置环境变量

在 `server/` 与 `admin/` 下分别复制示例配置文件（按你的终端选择命令）：

```bash
cd server
# macOS/Linux
cp .env.example .env
# Windows PowerShell
Copy-Item .env.example .env

cd ../admin
# macOS/Linux
cp .env.example .env
# Windows PowerShell
Copy-Item .env.example .env
```

然后按你的实际环境修改数据库、端口、API 地址等配置。

### 3) 初始化数据库

按顺序执行以下 SQL：

- `server/schema.sql`
- `server/migrations/` 下的迁移脚本

建议在执行前先备份现有数据。

### 4) 启动服务

后端（默认开发模式）：

```bash
cd server
npm run dev
```

管理端（Vite，默认端口 `3000`）：

```bash
cd admin
npm run dev
```

## 常用命令

### 后端（`server/`）

- 开发：`npm run dev`
- 生产：`npm start`

### 管理端（`admin/`）

- 开发：`npm run dev`
- 打包：`npm run build`
- 预览：`npm run preview`

## 接口文档

- **Markdown 索引与扩展模块**：根目录 [`API.md`](API.md)（销售、企业微信、备份等）
- **OpenAPI**：[`docs/openapi.yaml`](docs/openapi.yaml)
- **Swagger UI**：在 `server/.env` 设置 `ENABLE_API_DOCS=true` 后启动后端，浏览器访问 `http://localhost:<PORT>/api-docs`（生产环境请关闭）
- **架构与运维**：[`TECHNICAL.md`](TECHNICAL.md)

## 目录结构

```text
report/
  admin/                 # 管理端前端
  server/                # 后端服务与数据库脚本
    migrations/          # 增量迁移脚本
    src/                 # 后端源码
  docs/
    openapi.yaml         # 接口定义
  API.md                 # 接口说明（补充）
  TECHNICAL.md           # 技术文档
```

## 部署建议

- 生产环境请使用独立数据库账号，并限制最小权限。
- 配置反向代理（如 Nginx）统一对外暴露前后端服务。
- 建议为数据库、上传资源和环境变量建立定期备份策略。
- 发布前先在预发布环境验证迁移脚本与关键流程。

## 注意事项

- 提交代码前请确认 `.env` 等敏感信息未被纳入版本控制。
- 迁移脚本执行顺序应与文件编号保持一致。
- 若修改了接口，请同步更新 `docs/openapi.yaml` 与 `API.md`。
