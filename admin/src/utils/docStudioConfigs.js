/** 文档类工具 · 统一版式配置 */

export const DOC_STUDIO_CONFIGS = {
  pdfSplit: {
    steps: ['上传 PDF', '确认文件', '拆分下载'],
    accept: '.pdf,application/pdf',
    uploadLead: '拖拽 PDF 到此处',
    uploadHint: '每一页生成独立 PDF，打包为 ZIP 下载',
    uploadBtn: '选择 PDF 文件',
    uploadBtnActive: '重新选择 PDF',
    uploadFormats: '仅支持 .pdf · 单文件 ≤ 50MB',
    guideItems: [
      { title: '上传 PDF', desc: '选择需要整本按页拆分的 PDF' },
      { title: '确认文件', desc: '右侧可查看文件名与大小' },
      { title: '拆分下载', desc: '每页一个 PDF，全部打包为 ZIP' }
    ],
    actionLabel: '按页拆分下载',
    outputHint: '输出：pages.zip（每页一个 PDF，适合整本拆分）'
  },
  pdfCompress: {
    steps: ['上传 PDF', '确认文件', '压缩下载'],
    accept: '.pdf,application/pdf',
    uploadLead: '拖拽 PDF 到此处',
    uploadHint: '服务器端压缩，减小文件体积',
    uploadBtn: '选择 PDF 文件',
    uploadBtnActive: '重新选择 PDF',
    uploadFormats: '仅支持 .pdf · 单文件 ≤ 50MB',
    guideItems: [
      { title: '上传 PDF', desc: '选择体积较大的 PDF 文件' },
      { title: '确认文件', desc: '查看待压缩文件信息' },
      { title: '压缩下载', desc: '一键压缩并下载 optimized PDF' }
    ],
    actionLabel: '压缩下载',
    outputHint: '输出：compressed.pdf'
  },
  pdfToWord: {
    steps: ['上传 PDF', '确认文件', '转换下载'],
    accept: '.pdf,application/pdf',
    uploadLead: '拖拽 PDF 到此处',
    uploadHint: '文字型 PDF 转为可编辑 Word；扫描件自动按页嵌图',
    uploadBtn: '选择 PDF 文件',
    uploadBtnActive: '重新选择 PDF',
    uploadFormats: '仅支持 .pdf · 单文件 ≤ 50MB',
    guideItems: [
      { title: '上传 PDF', desc: 'Word/Excel 导出的 PDF 可保留可编辑文字' },
      { title: '确认文件', desc: '纯扫描件会转为每页图片（无法直接改字）' },
      { title: '转换下载', desc: '自动去除白色遮罩层后再转换' }
    ],
    actionLabel: '转为 Word',
    outputHint: '输出：document.docx（有文本层时可编辑；纯扫描件为每页图片）'
  },
  pdfToExcel: {
    steps: ['上传 PDF', '确认文件', '转换下载'],
    accept: '.pdf,application/pdf',
    uploadLead: '拖拽 PDF 到此处',
    uploadHint: '适合含表格线的 PDF；纯图片表格识别率较低',
    uploadBtn: '选择 PDF 文件',
    uploadBtnActive: '重新选择 PDF',
    uploadFormats: '仅支持 .pdf · 单文件 ≤ 50MB',
    guideItems: [
      { title: '上传 PDF', desc: '表格线清晰、可选中文本的 PDF 识别最佳' },
      { title: '确认文件', desc: '多页 PDF 按页/表拆分为多个 Sheet' },
      { title: '转换下载', desc: '使用 pdfplumber 提取表格结构写入 Excel' }
    ],
    actionLabel: '转为 Excel',
    outputHint: '输出：document.xlsx'
  },
  pdfToPpt: {
    steps: ['上传 PDF', '确认文件', '转换下载'],
    accept: '.pdf,application/pdf',
    uploadLead: '拖拽 PDF 到此处',
    uploadHint: '需服务器安装 LibreOffice；每页转为幻灯片',
    uploadBtn: '选择 PDF 文件',
    uploadBtnActive: '重新选择 PDF',
    uploadFormats: '仅支持 .pdf · 单文件 ≤ 50MB',
    guideItems: [
      { title: '上传 PDF', desc: '选择待转为演示文稿的 PDF' },
      { title: '确认文件', desc: '右侧查看文件名与大小' },
      { title: '转换下载', desc: '转为 PowerPoint（.pptx）并下载' }
    ],
    actionLabel: '转为 PPT',
    outputHint: '输出：document.pptx'
  },
  wordToPdf: {
    steps: ['上传 Word', '确认文件', '转换下载'],
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    uploadLead: '拖拽 Word 到此处',
    uploadHint: '仅支持 .docx；已安装 LibreOffice 时高保真还原排版',
    uploadBtn: '选择 Word 文件',
    uploadBtnActive: '重新选择 Word',
    uploadFormats: '仅支持 .docx · 单文件 ≤ 50MB',
    guideItems: [
      { title: '上传 Word', desc: '选择 .docx 格式的 Word 文档' },
      { title: '确认文件', desc: '右侧预览与导出 PDF 一致' },
      { title: '转换下载', desc: '复杂排版建议服务器安装 LibreOffice' }
    ],
    actionLabel: '转换为 PDF',
    outputHint: '输出：document.pdf（推荐 LibreOffice 高保真转换）',
    preview: 'pdf'
  },
  officeToPdf: {
    steps: ['上传 Office', '确认文件', '转换下载'],
    accept: '.doc,.xls,.xlsx,.ppt,.pptx,application/msword',
    uploadLead: '拖拽 Office 文件到此处',
    uploadHint: '支持 .doc / Excel / PPT，需服务器安装 LibreOffice',
    uploadBtn: '选择 Office 文件',
    uploadBtnActive: '重新选择文件',
    uploadFormats: '支持 .doc / Excel / PPT · 单文件 ≤ 50MB',
    guideItems: [
      { title: '上传 Office', desc: '选择 .doc、Excel 或 PPT 文件' },
      { title: '确认文件', desc: '需服务器已安装 LibreOffice' },
      { title: '转换下载', desc: '转为 PDF 并下载' }
    ],
    actionLabel: '转换为 PDF',
    outputHint: '输出：document.pdf（.docx 请用「Word 转 PDF」）',
    preview: 'pdf'
  },
  imgToPdf: {
    steps: ['上传图片', '确认顺序', '合成 PDF'],
    accept: 'image/*',
    multiple: true,
    uploadLead: '拖拽图片到此处',
    uploadHint: '可多选，按选择顺序合成 PDF',
    uploadBtn: '选择图片',
    uploadBtnActive: '继续添加图片',
    uploadFormats: '支持 JPG / PNG 等 · 单文件 ≤ 50MB',
    guideItems: [
      { title: '上传图片', desc: '一次选择一张或多张图片' },
      { title: '确认顺序', desc: '右侧按页预览合成效果' },
      { title: '合成 PDF', desc: '点击底部按钮下载合成结果' }
    ],
    actionLabel: '合成 PDF',
    outputHint: '输出：images.pdf',
    multiFile: true,
    preview: 'pdf'
  },
  pdfMerge: {
    steps: ['添加 PDF', '调整顺序', '合并下载'],
    accept: '.pdf,application/pdf',
    multiple: true,
    uploadLead: '拖拽 PDF 到此处',
    uploadLeadActive: '继续添加 PDF',
    uploadHint: '支持多选，按列表顺序合并',
    uploadHintActive: '可继续添加或调整顺序',
    uploadBtn: '选择 PDF 文件',
    uploadBtnActive: '继续添加 PDF',
    uploadFormats: '仅支持 .pdf · 单文件 ≤ 50MB',
    guideItems: [
      { title: '添加 PDF', desc: '在左侧选择需要合并的 PDF，可一次多选' },
      { title: '调整顺序', desc: '在右侧列表中调整合并顺序，预览合并流程' },
      { title: '合并下载', desc: '至少 2 个文件后点击合并，下载 merged.pdf' }
    ],
    queueTitle: '合并顺序',
    queueDesc: '按从上到下顺序合并，可使用箭头调整顺序',
    fileUnit: '个文件',
    tooltipUp: '上移',
    tooltipDown: '下移',
    tooltipRemove: '移除',
    flowAriaLabel: '合并流程预览',
    needMoreHint: '至少需要 2 个 PDF 才能合并',
    clearAll: '清空列表',
    mergeBtn: '合并并下载',
    warnNotPdf: '请选择 PDF 文件（.pdf）',
    infoSkipped: '已忽略 {n} 个非 PDF 文件',
    confirmClear: '确定清空所有已选文件吗？',
    confirmTitle: '清空列表',
    confirmOk: '清空',
    confirmCancel: '取消',
    successMerge: 'PDF 合并成功，已开始下载',
    errorMerge: '合并失败'
  }
};

export function getDocStudioConfig(featureKey) {
  return DOC_STUDIO_CONFIGS[featureKey] || null;
}
