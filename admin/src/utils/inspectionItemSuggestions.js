/** 常用化学检验项目中英文（报告单检测项目快捷输入） */

const HEADER_OR_META = new Set([
  '检验项目', '检测项目', '检验指标', '检测指标', '单位', '标准值', '技术指标', '技术要求',
  '标准要求', '指标', '检测值', '检验值', '检验结果', '检测结果', '实测值', '结果',
  '单项检验依据', '检验依据', '检测依据', '试验方法', '检验方法', '分析方法', '方法',
  '备注', '说明', '合格', '不合格', '符合', '不符合', '达标', '不达标',
  '一级', '二级', '三级', '优级', '一级品', '合格品'
]);

/** @type {Array<[string, string]>} */
const INSPECTION_ITEM_PAIRS = [
  ['外观', 'Appearance'],
  ['色泽', 'Color'],
  ['色度', 'Color(Fe-Co)'],
  ['颜色', 'Color'],
  ['透明度', 'Transparency'],
  ['透明', 'Transparent'],
  ['清澈', 'Clear'],
  ['浑浊', 'Turbid'],
  ['固体份', 'Solidity'],
  ['固体分', 'Solidity'],
  ['固含量', 'Solid content'],
  ['不挥发份', 'Non-volatile'],
  ['挥发份', 'Volatile'],
  ['挥发物', 'Volatile matter'],
  ['灰分', 'Ash content'],
  ['粘度', 'Viscosity'],
  ['黏度', 'Viscosity'],
  ['稠度', 'Consistency'],
  ['酸值', 'Acid value'],
  ['酸价', 'Acid value'],
  ['胺值', 'Amine value'],
  ['羟值', 'Hydroxyl value'],
  ['皂化值', 'Saponification value'],
  ['碘值', 'Iodine value'],
  ['环氧值', 'Epoxy value'],
  ['异氰酸值', 'Isocyanate value'],
  ['水分', 'Moisture'],
  ['含水量', 'Water content'],
  ['湿度', 'Humidity'],
  ['密度', 'Density'],
  ['比重', 'Specific gravity'],
  ['相对密度', 'Relative density'],
  ['闪点', 'Flash point'],
  ['熔点', 'Melting point'],
  ['沸点', 'Boiling point'],
  ['凝固点', 'Freezing point'],
  ['软化点', 'Softening point'],
  ['滴点', 'Drop point'],
  ['细度', 'Fineness'],
  ['粒径', 'Particle size'],
  ['粒度', 'Particle size'],
  ['筛余物', 'Sieve residue'],
  ['硬度', 'Hardness'],
  ['附着力', 'Adhesion'],
  ['柔韧性', 'Flexibility'],
  ['冲击强度', 'Impact strength'],
  ['光泽', 'Gloss'],
  ['光泽度', 'Gloss level'],
  ['PH值', 'PH value'],
  ['PH', 'PH'],
  ['电导率', 'Conductivity'],
  ['分子量', 'Molecular weight'],
  ['纯度', 'Purity'],
  ['含量', 'Content'],
  ['浓度', 'Concentration'],
  ['拉伸强度', 'Tensile strength'],
  ['断裂伸长率', 'Elongation at break'],
  ['抗压强度', 'Compressive strength'],
  ['弯曲强度', 'Flexural strength'],
  ['沉淀', 'Sediment'],
  ['机械杂质', 'Mechanical impurities'],
  ['残渣', 'Residue'],
  ['氯含量', 'Chlorine content'],
  ['硫含量', 'Sulfur content'],
  ['氮含量', 'Nitrogen content'],
  ['铁含量', 'Iron content'],
  ['重金属', 'Heavy metals'],
  ['砷', 'Arsenic'],
  ['铅', 'Lead'],
  ['汞', 'Mercury'],
  ['镉', 'Cadmium'],
  ['铬', 'Chromium']
];

const PRIORITY_ZH = [
  '外观', '色度', '颜色', '固体份', '固含量', '粘度', '酸值', '水分', '密度', '细度',
  '闪点', '光泽', 'PH值', '羟值', '环氧值', '附着力', '硬度', '含量', '纯度', '机械杂质'
];

export function normalizeInspectionItemZh(text) {
  let s = String(text ?? '').trim();
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
  }
  return s;
}

function buildLookup() {
  const map = new Map();
  for (const [zh, en] of INSPECTION_ITEM_PAIRS) {
    if (HEADER_OR_META.has(zh)) continue;
    const key = normalizeInspectionItemZh(zh);
    if (!key || map.has(key)) continue;
    map.set(key, en);
    const spaced = zh.split('').join(' ');
    if (spaced !== key) map.set(normalizeInspectionItemZh(spaced), en);
  }
  return map;
}

const LOOKUP = buildLookup();

const SUGGESTIONS = INSPECTION_ITEM_PAIRS
  .filter(([zh]) => !HEADER_OR_META.has(zh))
  .map(([zh, en]) => ({ zh, en, value: zh }));

const PRIORITY_INDEX = new Map(PRIORITY_ZH.map((zh, i) => [zh, i]));

function suggestionRank(item) {
  const idx = PRIORITY_INDEX.get(item.zh);
  return idx == null ? 1000 + item.zh.localeCompare('') : idx;
}

/** 按中文精确匹配常用检验项目英文 */
export function lookupInspectionItemEn(zh) {
  const key = normalizeInspectionItemZh(zh);
  if (!key) return '';
  return LOOKUP.get(key) || '';
}

/**
 * 过滤检验项目联想列表
 * @param {string} query
 * @param {{ limit?: number, emptyLimit?: number }} [opts]
 */
export function filterInspectionItemSuggestions(query, opts = {}) {
  const limit = opts.limit ?? 30;
  const emptyLimit = opts.emptyLimit ?? 18;
  const q = String(query ?? '').trim().toLowerCase();
  let list = SUGGESTIONS;
  if (q) {
    list = SUGGESTIONS.filter(
      (item) =>
        item.zh.toLowerCase().includes(q) ||
        item.en.toLowerCase().includes(q)
    );
  }
  const sorted = [...list].sort((a, b) => suggestionRank(a) - suggestionRank(b));
  const max = q ? limit : emptyLimit;
  return sorted.slice(0, max);
}
