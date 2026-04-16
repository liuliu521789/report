import pandas as pd
import pymysql
import sys

print("=== 开始导入客户数据 ===")

# 读取Excel
df = pd.read_excel("客户-品名-实发型号对照表.xlsx", header=None)
customer_names = [str(x).strip() for x in df.iloc[:, 0].dropna().tolist() if str(x).strip() and str(x).strip() != '客户']

unique_customers = sorted(list(dict.fromkeys(customer_names)))  # 保持顺序去重
print(f"提取到 {len(unique_customers)} 个唯一客户：")
for i, name in enumerate(unique_customers, 1):
    print(f"  {i:2d}. {name}")

print(f"\n准备导入 {len(unique_customers)} 条客户记录...")

try:
    conn = pymysql.connect(
        host='127.0.0.1',
        port=3306,
        user='root',
        password='admin',
        database='qc_report',
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )
    cursor = conn.cursor()
    
    imported = 0
    skipped = 0
    for i, name in enumerate(unique_customers, 1):
        code = f"C{str(i).zfill(3)}"
        
        cursor.execute("SELECT id FROM sales_customers WHERE customer_code = %s OR customer_name = %s LIMIT 1", (code, name))
        if cursor.fetchone():
            print(f"  [跳过] {code} - {name} (已存在)")
            skipped += 1
            continue
            
        cursor.execute("""
            INSERT INTO sales_customers 
            (customer_code, customer_name, is_active, created_at, updated_at)
            VALUES (%s, %s, 1, NOW(3), NOW(3))
        """, (code, name))
        imported += 1
        print(f"  [导入] {code} - {name}")
    
    conn.commit()
    print(f"\n导入完成！成功: {imported} 条，跳过: {skipped} 条")
    
    cursor.execute("SELECT COUNT(*) as total FROM sales_customers WHERE is_active = 1")
    total = cursor.fetchone()['total']
    print(f"当前共有 {total} 个启用客户。")
    
    cursor.close()
    conn.close()
    print("\n客户数据已成功导入！请刷新客户管理页面查看。")
    
except Exception as e:
    print(f"错误: {e}")
    sys.exit(1)
