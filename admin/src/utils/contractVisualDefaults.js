/** 与 server/src/lib/contractOrderLines.js CONTRACT_ORDER_LINE_HEADERS 一致 */
export const CONTRACT_ORDER_LINE_HEADERS = [
  '品名',
  '型号',
  '不含税单价（元）',
  '单位（吨）',
  '数量（桶）',
  '不含税金额（元）',
  '税率',
  '税额（元）',
  '价税合计（元）'
];

export function createDefaultVisual() {
  return {
    headerCompanyZh: '开封物源化工有限公司',
    headerTitleZh: '销售合同',
    headerItemsLeft: [
      { label: '买方', value: '', placeholder: '留空则系统带入买方名称', fallback: '{{CUSTOMER_NAME}}' },
      { label: '卖方', value: '', placeholder: '留空则使用公司抬头', fallback: '__HEADER_COMPANY__' }
    ],
    headerItemsRight: [
      { label: '合同编号', value: '', placeholder: '留空则系统自动生成', fallback: '{{CONTRACT_NO}}' },
      { label: '履约地点', value: '兰考', placeholder: '例如：兰考', fallback: '兰考' },
      { label: '签订时间', value: '', placeholder: '留空则系统带入签订日期', fallback: '{{SIGN_DATE_ZH}}' }
    ],
    clauses: [
      { title: '一、产品名称、单价、数量、金额：', body: '', useTable: true },
      { title: '二、交货地点、交货期限、运费：', body: '买方工厂，运费由卖方承担。', useTable: false },
      { title: '三、包装标准：', body: '原生产厂家标准包装。', useTable: false },
      { title: '四、验收标准：方法及提出异议期限：', body: '买方按原生产厂家质量标准进行验收。买方可在交货日起三个工作日内对质量提出异议。', useTable: false },
      { title: '五、结算方式及期限：', body: '电汇或承兑结算，押一批货。', useTable: false },
      { title: '六、违约责任：', body: '任何一方不履行本合同的任何一项，均属违约。违约方必须赔偿总货款的百分之二十作为违约金。', useTable: false },
      { title: '七、解决合同纠纷方式：', body: '双方协商解决。如果协商不成，提交卖方办公所在地法院受理。', useTable: false },
      { title: '八、其他约定事项：', body: '本合同复印件有效但涂改无效。', useTable: false }
    ],
    tableRows: [
      ['树脂', 'NL385', '9469.02', '吨', '15', '142035.30', '13%', '18464.70', '160500.00'],
      ['助剂', 'NL1681', '23008.85', '吨', '3', '69026.55', '13%', '8973.45', '78000.00']
    ],
    tableTotalText: '贰拾叁万捌仟伍佰元整（￥238500.00）',
    showPartyBlock: true,
    sellerUnit: '开封物源化工有限公司',
    sellerAddress: '',
    sellerContact: '',
    sellerPhone: '',
    sellerFax: '',
    sellerBank: '',
    sellerAccount: '',
    sellerBankNo: '',
    buyerUnit: '',
    buyerAddress: '',
    buyerContact: '',
    buyerPhone: '',
    buyerFax: '',
    buyerBank: '',
    buyerAccount: '',
    buyerTaxNo: ''
  };
}
