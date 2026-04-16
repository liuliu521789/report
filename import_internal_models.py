import pandas as pd
from datetime import datetime

print("=== 开始从《产品代码对照表.xlsx》导入内部型号数据 ===")

df = pd.read_excel("产品代码对照表.xlsx")
print(f"读取Excel成功，原始行数: {len(df)}")
print(f"列名: {list(df.columns)}")

# 重命名列（第一列产品，第二列英文代码）
df.columns = ["product", "internal_code"]

# 数据清洗
df = df.dropna(subset=["internal_code"]).copy()
df["internal_code"] = df["internal_code"].astype(str).str.strip().str.upper()
df["product"] = df["product"].astype(str).str.strip().where(df["product"].notna(), df["internal_code"])
df = df.drop_duplicates(subset=["internal_code"]).reset_index(drop=True)

print(f"清洗后得到 {len(df)} 条唯一内部型号记录")

# 生成SQL文件
sql_file = "import_internal_models.sql"
with open(sql_file, "w", encoding="utf-8") as f:
    f.write(f"-- 完整导入《产品代码对照表.xlsx》数据\n")
    f.write(f"-- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"-- 共 {len(df)} 条唯一记录 (internal_code 来自英文代码列)\n\n")
    f.write("USE qc_report;\n\n")
    f.write("-- 清空现有数据（可选，如果想完全替换为对照表内容）\n")
    f.write("-- TRUNCATE TABLE sales_internal_models;\n\n")
    
    for i, row in df.iterrows():
        code = str(row["internal_code"]).replace("'", "''")
        name = str(row["product"]).replace("'", "''")
        remarks = f"来自产品代码对照表 - {name[:50]}"
        f.write(f"INSERT IGNORE INTO sales_internal_models (internal_code, name, is_active, remarks, created_by, updated_by)\n")
        f.write(f"VALUES ('{code}', '{name}', 1, '{remarks}', 1, 1);\n")
        if (i + 1) % 30 == 0:
            f.write("\n")
    
    f.write("\n-- 统计结果\n")
    f.write("SELECT CONCAT('成功导入 ', COUNT(*), ' 条内部型号（来自产品代码对照表.xlsx）') AS result FROM sales_internal_models WHERE remarks LIKE '%对照表%';\n")

print(f"\n[成功] 已生成完整导入脚本：{sql_file}")
print(f"包含 {len(df)} 条 INSERT IGNORE 语句")
print("\n请执行以下命令完成导入（替换youruser为实际用户名）：")
print(f"mysql -u youruser -p qc_report < {sql_file}")
print("\n执行完成后，刷新「内部型号管理」页面即可看到全部对照表数据。")
print("\n如果需要我帮你自动执行SQL（需要数据库密码），请提供mysql命令行参数或告诉我。")
