-- 客户导入脚本 (24个客户)
USE qc_report;

INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C001', '一品何总', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C002', '兰考机缝', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C003', '刘康博', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C004', '华信', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C005', '华科', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C006', '卓诚', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C007', '史总', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C008', '商丘李总', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C009', '孟总', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C010', '工业', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C011', '彭总', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C012', '新铝', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C013', '木器', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C014', '朱明周', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C015', '漆树花', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C016', '许昌贾总', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C017', '轩亿兴', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C018', '金新', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C019', '鑫双汇', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C020', '银嘉穗', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C021', '长葛王总', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C022', '陈天宇', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C023', '陶总', 1, NOW(3), NOW(3));
INSERT IGNORE INTO sales_customers (customer_code, customer_name, is_active, created_at, updated_at) 
VALUES ('C024', '高海龙', 1, NOW(3), NOW(3));

SELECT '客户导入完成，共 ' || COUNT(*) || ' 条记录' as result FROM sales_customers;
