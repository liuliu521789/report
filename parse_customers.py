import pandas as pd
from collections import OrderedDict

print("=== 解析客户数据 ===")
df = pd.read_excel("客户-品名-实发型号对照表.xlsx")
print("文件形状:", df.shape)
print("列名:", df.columns.tolist())

# 第一列通常是客户
customer_col = df.columns[0]
customers = df[customer_col].dropna().unique().tolist()

print(f"\n发现 {len(customers)} 个唯一客户:")
for i, name in enumerate(customers, 1):
    print(f"  {i:2d}. {name}")

# 生成 customer_code (去重并排序)
unique_customers = sorted(set(customers))
print(f"\n去重后共 {len(unique_customers)} 个客户，将导入数据库。")

# 生成简单的编码: C001, C002...
customer_data = []
for i, name in enumerate(unique_customers, 1):
    code = f"C{str(i).zfill(3)}"
    customer_data.append({
        'customer_code': code,
        'customer_name': str(name).strip(),
        'contact_name': None,
        'phone': None,
        'address': None
    })
    print(f"  {code} -> {name}")

print("\n数据准备完成。接下来将尝试批量导入到 sales_customers 表。")
with open('import_customers.sql', 'w', encoding='utf-8') as f:
    f.write("-- 客户导入脚本 (24个客户)\n")
    f.write("USE qc_report;\n\n")
    for data in customer_data:
        f.write(f"INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) \n")
        f.write(f"VALUES ('{data['customer_code']}', '{data['customer_name']}', 1, NOW(3), NOW(3));\n")
    f.write("\nSELECT '客户导入完成，共 ' || COUNT(*) || ' 条记录' as result FROM sales_customers;\n")

print("已生成 import_customers.sql 文件。")
print("运行以下命令导入:")
print("mysql -u root -p qc_report < import_customers.sql")
