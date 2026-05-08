/** 合同模板：推荐版式与预览用示例数据（与生成合同时订单表结构一致） */

const TD = 'style="border:1px solid #000;padding:4px 6px;text-align:center"';
const TDNW = 'style="border:1px solid #000;padding:4px 6px;text-align:center;white-space:nowrap"';
const TD_TOTAL = 'style="border:1px solid #000;padding:4px 6px;text-align:left"';
const ORDER_LINES_TABLE_STYLE =
  'width:100%;border-collapse:collapse;border:1px solid #000;font-family:FangSong_GB2312,仿宋_GB2312,仿宋,FangSong;font-size:16px;line-height:1.35';
export const CONTRACT_TPL_PREVIEW_LINES = `<table style="${ORDER_LINES_TABLE_STYLE}"><thead><tr><th ${TDNW}>品名</th><th ${TDNW}>型号</th><th ${TD}>不含税单价（元）</th><th ${TD}>单位（吨）</th><th ${TD}>数量（桶）</th><th ${TD}>不含税金额（元）</th><th ${TD}>税率</th><th ${TD}>税额（元）</th><th ${TD}>价税合计（元）</th></tr></thead><tbody><tr><td ${TDNW}>树脂</td><td ${TDNW}>NL385</td><td ${TD}>9469.02</td><td ${TD}>吨</td><td ${TD}>15</td><td ${TD}>142035.30</td><td ${TD}>13%</td><td ${TD}>18464.70</td><td ${TD}>160500.00</td></tr><tr><td ${TDNW}>助剂</td><td ${TDNW}>NL1681</td><td ${TD}>23008.85</td><td ${TD}>吨</td><td ${TD}>3</td><td ${TD}>69026.55</td><td ${TD}>13%</td><td ${TD}>8973.45</td><td ${TD}>78000.00</td></tr><tr><td ${TD}>总金额</td><td colspan="8" ${TD_TOTAL}>{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）</td></tr></tbody></table>`;

const TPL_PREVIEW_VARS = {
  COMPANY_NAME_ZH: '开封物源化工有限公司（示例）',
  CUSTOMER_NAME: '昆明华信金属材料制造有限公司（示例）',
  CUSTOMER_ADDRESS: '云南省昆明市示例区工业园',
  CUSTOMER_CONTACT: '李明超',
  CUSTOMER_PHONE: '18087180880',
  CONTRACT_NO: 'HT20260406DEMO01',
  SIGN_DATE_ZH: '2026年04月06日',
  ORDER_LINES: CONTRACT_TPL_PREVIEW_LINES,
  AMOUNT_TOTAL: '211061.85',
  AMOUNT_TOTAL_CN: '贰拾壹万壹仟零陆拾壹元捌角伍分'
};

/** 旧模板「订单表 + 单独总金额段」与新表内合计并存时去掉表后多余段落 */
function stripLegacyOrderTotalParagraph(html) {
  const re = new RegExp(
    `(<table style="${ORDER_LINES_TABLE_STYLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[\\s\\S]*?</table>)\\s*<p[^>]*>[\\s\\S]*?总金额(（大写）)?[：:][\\s\\S]*?</p>`,
    'i'
  );
  return String(html ?? '').replace(re, '$1');
}

export function previewFillContractTemplate(html) {
  let s = String(html ?? '');
  for (const [key, val] of Object.entries(TPL_PREVIEW_VARS)) {
    s = s.replaceAll(`{{${key}}}`, val);
  }
  return stripLegacyOrderTotalParagraph(s);
}

export const RECOMMENDED_TPL_BODY = `<div style="width:100%;margin:0 auto;color:#000;font-family:FangSong_GB2312,仿宋_GB2312,仿宋,FangSong;font-size:16px;line-height:1.5">
<div style="text-align:center;margin-bottom:16px">
  <div style="font-size:22px;letter-spacing:4px;line-height:1.2;font-family:FZXiaoBiaoSong-S05,FZXiaoBiaoSong,方正小标宋简体,方正小标宋,方正小标宋_GBK,FZShuSong_GB2312,SimSun">{{COMPANY_NAME_ZH}}</div>
  <div style="font-size:22px;letter-spacing:6px;line-height:1.2;margin-top:4px;font-family:FZXiaoBiaoSong-S05,FZXiaoBiaoSong,方正小标宋简体,方正小标宋,方正小标宋_GBK,FZShuSong_GB2312,SimSun">销售合同</div>
</div>
<div style="text-align:center;margin:12px 0 16px 0">
<table class="contract-header-meta" style="width:auto;max-width:100%;margin:0 auto;border-collapse:collapse;border:none;font-size:16px;line-height:1.5">
  <tr>
    <td style="border:none;padding:4px 8px 4px 0;width:58%;vertical-align:top;text-align:left">
      <div>买方：{{CUSTOMER_NAME}}</div>
      <div>卖方：{{COMPANY_NAME_ZH}}</div>
    </td>
    <td style="border:none;padding:4px 0 4px 8px;vertical-align:top;text-align:left">
      <div>合同编号：{{CONTRACT_NO}}</div>
      <div>履约地点：兰考</div>
      <div>签订时间：{{SIGN_DATE_ZH}}</div>
    </td>
  </tr>
</table>
</div>
<p style="margin:8px 0;text-indent:2em"><strong>一、产品名称、单价、数量、金额、交货期：</strong></p>
{{ORDER_LINES}}
<p style="margin:8px 0;text-indent:2em"><strong>二、交货地点、交货期：</strong>买方工厂，运费由卖方承担。</p>
<p style="margin:8px 0;text-indent:2em"><strong>三、包装标准：</strong>原生产厂家标准包装。</p>
<p style="margin:8px 0;text-indent:2em"><strong>四、验收标准：</strong>买方按原生产厂家质量标准进行验收。买方可在交货日起三个工作日内对质量提出异议。</p>
<p style="margin:8px 0;text-indent:2em"><strong>五、结算方式及期限：</strong>电汇或承兑结算，押一批货。</p>
<p style="margin:8px 0;text-indent:2em"><strong>六、违约责任：</strong>任何一方不履行本合同的任何一项，均属违约。违约方必须赔偿总货款的百分之二十作为违约金。</p>
<p style="margin:8px 0;text-indent:2em"><strong>七、解决合同纠纷方式：</strong>双方协商解决。如果协商不成，提交卖方办公所在地法院受理。</p>
<p style="margin:8px 0;text-indent:2em"><strong>八、其他约定事项：</strong>本合同复印件有效但涂改无效。</p>
<table class="party-table" style="width:100%;border-collapse:collapse;border:1px solid #000;margin-top:12px;font-size:14px;line-height:1.35">
  <tr>
    <td style="border:1px solid #000;vertical-align:top;padding:5px 8px;width:50%">
      <div class="party-col-title">卖方</div>
      <div>单位：{{COMPANY_NAME_ZH}}</div>
      <div>地址：</div>
      <div>联系人：</div>
      <div>电话：</div>
      <div>传真：</div>
      <div>开户银行：</div>
      <div>账号：</div>
      <div>行号：</div>
    </td>
    <td style="border:1px solid #000;vertical-align:top;padding:5px 8px;width:50%">
      <div class="party-col-title">买方</div>
      <div>单位：{{CUSTOMER_NAME}}</div>
      <div>地址：{{CUSTOMER_ADDRESS}}</div>
      <div>联系人：{{CUSTOMER_CONTACT}}</div>
      <div>电话：{{CUSTOMER_PHONE}}</div>
      <div>传真：</div>
      <div>开户银行：</div>
      <div>账号：</div>
      <div>税号：</div>
    </td>
  </tr>
</table>
</div>`;

export const BLANK_TPL_BODY = '<p></p>';
