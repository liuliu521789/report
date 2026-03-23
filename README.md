## 化工厂质检报告系统（简化版）

本仓库包含三部分：

- `server/`：Node.js + MySQL 后端 API（含登录、报告、二维码绑定、公司章）
- `admin/`：员工端后台（Vue + ElementUI）
- `miniprogram/`：客户查看端微信小程序（只读）

### 运行（开发）

后端：

1. 安装依赖：在 `server/` 下执行 `npm i`
2. 配置环境变量：复制 `server/.env.example` 为 `server/.env`
3. 启动：`npm run dev`

> 管理端与小程序骨架会在后续补齐可运行脚手架与对接方式。
