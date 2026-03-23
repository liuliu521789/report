# 从旧版 `users.role` 升级到新版（超级管理员 / 员工类别）

**不要删库。** 先备份，再在**原库**上执行迁移 SQL。

---

## 用 CMD 还是 PowerShell？

- 若提示 **`'$ts' 不是内部或外部命令`**：说明当前窗口是 **cmd.exe**，不能写 `$ts` 这类 **PowerShell** 变量。
- **任选其一**：
  1. 打开 **Windows PowerShell** 或 **终端里选 PowerShell**，再复制文档里标有「PowerShell」的命令；或  
  2. 继续用 **cmd**，只用下面标有 **「CMD」** 的命令（无 `$` 变量）。

---

## 0. 确认是否需要迁移

在 MySQL 里执行（库名按你 `.env` 里的 `MYSQL_DATABASE`，默认 `qc_report`）：

```sql
USE qc_report;
SHOW COLUMNS FROM users LIKE 'role';
```

- **有输出** → 需要执行下面迁移。
- **Empty set** → 已是新结构，**不要**再跑迁移脚本。

---

## 1. 准备：进入项目目录并确认连接信息

**PowerShell：**

```powershell
cd "f:\vue项目\report\server"
Get-Content .env | Select-String "MYSQL_"
```

**CMD：**

```cmd
cd /d "f:\vue项目\report\server"
findstr MYSQL_ .env
```

下面命令里请把 **`-h`、`-P`、`-u`、数据库名** 换成你的实际值；`-p` 后面**不要写密码**，回车后交互输入。

---

## 2. 备份整个业务库（必做）

**CMD（推荐你当前用这个）：** 文件名固定为 `backup_qc_report.sql`，避免变量问题。

```cmd
cd /d "f:\vue项目\report\server"
mysqldump -h 127.0.0.1 -P 3306 -u root -p --single-transaction --routines --triggers qc_report > backup_qc_report.sql
```

成功后当前目录会有 `backup_qc_report.sql`，请另存一份到安全位置。

**PowerShell（需要带时间戳的文件名时）：**

```powershell
cd "f:\vue项目\report\server"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
mysqldump -h 127.0.0.1 -P 3306 -u root -p --single-transaction --routines --triggers qc_report > ".\backup_qc_report_$ts.sql"
```

---

## 3. 执行迁移 SQL

迁移脚本路径：

`server/migrations/migrate_from_role_to_account_types.sql`

**方式 A：一条命令执行（CMD）**

```cmd
cd /d "f:\vue项目\report\server"
mysql -h 127.0.0.1 -P 3306 -u root -p --default-character-set=utf8mb4 qc_report < "migrations\migrate_from_role_to_account_types.sql"
```

**方式 A2：PowerShell 管道**

```powershell
cd "f:\vue项目\report\server"
Get-Content ".\migrations\migrate_from_role_to_account_types.sql" -Encoding UTF8 | mysql -h 127.0.0.1 -P 3306 -u root -p --default-character-set=utf8mb4 qc_report
```

**方式 B：进入 mysql 客户端再 source**

```text
mysql -h 127.0.0.1 -P 3306 -u root -p --default-character-set=utf8mb4 qc_report
```

进入后执行（路径改成你机器上的绝对路径，注意正斜杠）：

```sql
SOURCE f:/vue项目/report/server/migrations/migrate_from_role_to_account_types.sql;
```

---

## 4. 若第 2 步 `ALTER TABLE ... ADD COLUMN` 报错

常见原因：已经加过新列。可对照下面检查：

```sql
SHOW COLUMNS FROM users;
```

- 若已有 `account_type` 但没有 `role`：说明已升级完毕，**不要**再跑整段脚本。
- 若已有一半列：可只对**尚未添加**的列单独 `ALTER TABLE ... ADD COLUMN ...`（或从备份恢复后重来）。

外键 `fk_users_employee_category` 若已存在，`ADD CONSTRAINT` 会失败，可先：

```sql
ALTER TABLE users DROP FOREIGN KEY fk_users_employee_category;
```

再按需补回约束（或跳过若已存在）。

---

## 5. 重启后端并让所有用户重新登录

**CMD / PowerShell 均可：**

```text
cd /d "f:\vue项目\report\server"
node src/index.js
```

（若你用 `npm start` / pm2，按你原方式重启。）

浏览器里**退出并重新登录**，使本地 `accountType` / `permissions` 与新版 JWT 一致。

---

## 全新安装（空库）

不需要本迁移，直接对空库执行仓库根目录 **`schema.sql`** 即可：

**CMD：**

```cmd
mysql -h 127.0.0.1 -P 3306 -u root -p --default-character-set=utf8mb4 < "f:\vue项目\report\server\schema.sql"
```

（注意：会 `CREATE DATABASE` + 建表；**不要**在有数据的库上整文件覆盖执行。）
