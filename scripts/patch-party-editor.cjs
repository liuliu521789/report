const fs = require('fs');
const path = 'd:/report/admin/src/views/ContractTemplateEdit.vue';
let s = fs.readFileSync(path, 'utf8');

const startIdx = s.indexOf('                <div v-if="visual.showPartyBlock" class="form-row mt12">');
if (startIdx < 0) {
  console.error('start not found');
  process.exit(1);
}
let end = s.indexOf('              </div>\n\n              <el-collapse class="tpl-advanced-collapse">', startIdx);
if (end < 0) {
  console.error('end not found');
  process.exit(1);
}

const replacement = [
  '                <div v-if="visual.showPartyBlock" class="party-editor-box mt12">',
  '                  <div class="header-editor-col">',
  '                    <motion class="form-label header-col-caption">卖方</div>',
  '                    <div v-for="(item, pi) in visual.partySellerItems" :key="\'party-seller-\' + pi" class="header-item-row">',
  '                      <el-input v-model="item.label" class="header-item-label" placeholder="字段名，如：单位" clearable />',
  '                      <span class="header-item-sep">：</span>',
  '                      <el-input v-model="item.value" class="header-item-value" :placeholder="partyValuePlaceholder(item)" clearable />',
  '                      <el-button type="danger" plain size="small" class="header-item-remove" @click="removePartyItem(\'seller\', pi)">－</el-button>',
  '                    </div>',
  '                    <el-button size="small" class="mt6" @click="addPartyItem(\'seller\')">＋ 添加卖方字段</el-button>',
  '                  </div>',
  '                  <div class="header-editor-col">',
  '                    <div class="form-label header-col-caption">买方</div>',
  '                    <div v-for="(item, pi) in visual.partyBuyerItems" :key="\'party-buyer-\' + pi" class="header-item-row">',
  '                      <el-input v-model="item.label" class="header-item-label" placeholder="字段名，如：地址" clearable />',
  '                      <span class="header-item-sep">：</span>',
  '                      <el-input v-model="item.value" class="header-item-value" :placeholder="partyValuePlaceholder(item)" clearable />',
  '                      <el-button type="danger" plain size="small" class="header-item-remove" @click="removePartyItem(\'buyer\', pi)">－</el-button>',
  '                    </div>',
  '                    <el-button size="small" class="mt6" @click="addPartyItem(\'buyer\')">＋ 添加买方字段</el-button>',
  '                  </div>',
  '                </div>',
  '                <p v-if="visual.showPartyBlock" class="tpl-insert-hint mt6">',
  '                  可修改字段名称与内容；点「－」删除该行后，保存的合同正文中不再显示该项。留空的「单位」仍可按公司抬头/客户名称占位。',
  '                </p>',
  ''
].join('\n');

const bad = 'mo' + 'tion';
const fixed = replacement.split(bad).join('div');

s = s.slice(0, startIdx) + fixed + s.slice(end);
fs.writeFileSync(path, s);
console.log('ok');
