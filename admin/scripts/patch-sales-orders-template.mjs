import fs from 'node:fs';

const vuePath = 'D:/report/admin/src/views/SalesOrders.vue';
const tplPath = 'D:/report/admin/scripts/sales-orders-template-new.txt';
const vue = fs.readFileSync(vuePath, 'utf8');
const tpl = fs.readFileSync(tplPath, 'utf8');
const scriptIdx = vue.indexOf('<script>');
if (scriptIdx < 0) throw new Error('script not found');
const next = tpl.trimEnd() + '\n\n' + vue.slice(scriptIdx);
fs.writeFileSync(vuePath, next, 'utf8');
console.log('lines:', next.split(/\r?\n/).length);
