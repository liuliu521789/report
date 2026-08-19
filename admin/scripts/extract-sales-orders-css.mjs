import fs from 'node:fs';

const vuePath = 'D:/report/admin/src/views/SalesOrders.vue';
const cssPath = 'D:/report/admin/src/styles/salesOrdersPage.css';
const text = fs.readFileSync(vuePath, 'utf8');
const m = text.match(/<style scoped>\r?\n([\s\S]*?)\r?\n<\/style>/);
if (!m) {
  console.error('style block not found');
  process.exit(1);
}
const css = m[1].trim();
if (css.startsWith("@import")) {
  console.log('already extracted');
  process.exit(0);
}
fs.writeFileSync(cssPath, `${css}\n`, 'utf8');
const next = text.replace(
  /<style scoped>\r?\n[\s\S]*?\r?\n<\/style>/,
  "<style scoped>\n@import '../styles/salesOrdersPage.css';\n</style>"
);
fs.writeFileSync(vuePath, next, 'utf8');
console.log(`css lines: ${css.split(/\r?\n/).length}, vue lines: ${next.split(/\r?\n/).length}`);
