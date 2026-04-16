import pandas as pd
df = pd.read_excel('产品代码对照表.xlsx')
print('=== Excel Content Summary ===')
print('Shape:', df.shape)
print('Columns:', list(df.columns))
print('\nFirst 20 rows:')
print(df.head(20).to_string(index=False))
print('\nTotal rows:', len(df))
if len(df.columns) >= 2:
    col_product = df.columns[0]
    col_code = df.columns[1]
    print(f'\nProduct Column ({col_product}): {df[col_product].nunique()} unique values')
    print(f'Code Column ({col_code}): {df[col_code].nunique()} unique values')
    print('\nSample Mappings (first 15):')
    for i, row in df.head(15).iterrows():
        print(f'  {str(row[col_product]).strip():<15} -> {str(row[col_code]).strip()}')
print('\nUnique Codes (sample):', sorted(df[col_code].dropna().unique()[:20]) if 'col_code' in locals() else 'N/A')
