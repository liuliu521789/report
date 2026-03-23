# 安全与审计（002_security_audit.sql）

在已有数据库上执行：

```bash
mysql -u USER -p qc_report < migrations/002_security_audit.sql
```

将增加：

- `users.failed_login_count` / `users.locked_until`（登录失败锁定）
- `system_security_settings`（密码策略、会话超时、错误日志保留等）
- `login_logs` / `operation_logs` / `error_logs`（审计，应用层不提供删改接口）

新建库可直接使用仓库根目录 `schema.sql`（已含上述结构）。
