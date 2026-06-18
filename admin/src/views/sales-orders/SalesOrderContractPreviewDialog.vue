<template>
  <el-dialog
    v-model="visible"
    :title="previewTitle"
    width="920px"
    top="4vh"
    class="contract-preview-dialog"
    :close-on-click-modal="false"
    @closed="onClosed"
  >
    <div v-loading="previewLoading" class="contract-preview-dialog-inner">
      <div
        v-if="previewMode === 'html' && previewHtml"
        class="contract-preview-html"
        v-html="previewHtml"
      />
      <iframe
        v-else-if="previewMode === 'pdf' && previewPdfUrl"
        :src="previewPdfUrl"
        class="contract-preview-pdf"
        title="合同 PDF 预览"
      />
      <div
        v-else-if="previewMode === 'docx' && previewDocxHtml"
        class="contract-preview-docx"
        v-html="previewDocxHtml"
      />
      <img
        v-else-if="previewMode === 'image' && previewImageUrl"
        :src="previewImageUrl"
        alt="合同图片预览"
        class="contract-preview-image"
      />
      <div v-else-if="previewMode === 'other'" class="contract-preview-other">
        <p>当前为老版 .doc 或其它格式，无法在页面内预览。</p>
        <el-button type="primary" @click="downloadFile" icon="Download">下载查看</el-button>
      </div>
      <el-empty v-else-if="!previewLoading" description="暂无预览内容" />
    </div>
    <template #footer>
      <el-button @click="visible = false" icon="Close">关闭</el-button>
      <el-button
        v-if="perm('contract_management', 'contract_edit') || perm('contract_management', 'contract_generate')"
        type="primary"
        plain
        @click="goEdit"
        icon="Edit"
      >
        编辑合同
      </el-button>
      <el-tooltip
        placement="top"
        content="若纸上出现日期、网址或页码，请在打印对话框「更多设置」中关闭「页眉和页脚」。"
        :show-after="300"
      >
        <span class="print-tooltip-trigger">
          <el-button
            type="primary"
            :disabled="previewMode === 'other' || (previewMode === 'html' && !previewHtml)"
            @click="printPreview"
            icon="Printer"
          >打印</el-button>
        </span>
      </el-tooltip>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import mammoth from 'mammoth';
import { perm } from '../../utils/permissions';
import {
  getSalesContract,
  fetchSalesContractDocumentBlob,
  downloadSalesContractDocx
} from '../../api';
import {
  finalizeContractBodyForPreview,
  printContractPreviewFromHtml,
  printHtmlInNewWindow,
  escapeHtmlText
} from '../../utils/contractPreviewHtml';
import { startDownload } from '../../composables/useDownloadProgress.js';

const visible = defineModel({ type: Boolean, default: false });

const props = defineProps({
  contractId: { type: Number, default: null },
  fieldDefinitions: { type: Array, default: () => [] }
});

const router = useRouter();

const previewLoading = ref(false);
const previewHtml = ref('');
const previewMode = ref('html');
const previewPdfUrl = ref('');
const previewDocxHtml = ref('');
const previewImageUrl = ref('');
const previewDocName = ref('');
const previewTitle = ref('合同预览');

watch([visible, () => props.contractId], async ([open, id]) => {
  if (open && id) await loadPreview();
});

async function loadPreview() {
  previewLoading.value = true;
  previewHtml.value = '';
  previewDocxHtml.value = '';
  previewMode.value = 'html';
  revokeBlob(previewPdfUrl.value);
  previewPdfUrl.value = '';
  revokeBlob(previewImageUrl.value);
  previewImageUrl.value = '';
  previewDocName.value = '';
  try {
    const d = await getSalesContract(props.contractId);
    const c = d?.contract;
    const cust = c?.customer_name || '';
    const no = c?.contract_no || `#${props.contractId}`;
    previewTitle.value = `${cust} · 销售合同 · ${no}`;
    if (c?.contract_source === 'upload') {
      const mime = String(c.document_mime_type || '').toLowerCase();
      const fn = String(c.document_original_filename || '').toLowerCase();
      previewDocName.value = c.document_original_filename || '合同文件';
      if (mime.includes('pdf') || fn.endsWith('.pdf')) {
        const blob = await fetchSalesContractDocumentBlob(props.contractId);
        previewPdfUrl.value = URL.createObjectURL(blob);
        previewMode.value = 'pdf';
        return;
      }
      const isDocx = mime.includes('wordprocessingml') || fn.endsWith('.docx') || (mime.includes('officedocument') && mime.includes('word'));
      if (isDocx) {
        try {
          const blob = await fetchSalesContractDocumentBlob(props.contractId);
          const ab = await blob.arrayBuffer();
          const { value: html } = await mammoth.convertToHtml({ arrayBuffer: ab });
          previewDocxHtml.value = html || '<p>（暂无解析内容）</p>';
          previewMode.value = 'docx';
        } catch {
          previewMode.value = 'other';
        }
        return;
      }
      if (mime.startsWith('image/')) {
        const blob = await fetchSalesContractDocumentBlob(props.contractId);
        previewImageUrl.value = URL.createObjectURL(blob);
        previewMode.value = 'image';
        return;
      }
      previewMode.value = 'other';
      return;
    }
    const vars = {
      CUSTOMER_NAME: c?.customer_name || '',
      CUSTOMER_ADDRESS: c?.customer_address || '',
      CUSTOMER_CONTACT: c?.customer_contact || '',
      CUSTOMER_PHONE: c?.customer_phone || '',
      CUSTOMER_FAX: c?.customer_fax || '',
      CUSTOMER_BANK: c?.customer_bank || '',
      CUSTOMER_ACCOUNT: c?.customer_account || '',
      CUSTOMER_TAX_ID: c?.customer_tax_id || '',
      CONTRACT_NO: c?.contract_no || '',
      COMPANY_NAME_ZH: c?.company_name_zh || ''
    };
    previewHtml.value = finalizeContractBodyForPreview(c?.body_html, d?.orders || [], vars, {
      orderFieldDefinitions: props.fieldDefinitions
    });
    previewMode.value = 'html';
  } catch {
    ElMessage.error('加载失败');
    visible.value = false;
  } finally {
    previewLoading.value = false;
  }
}

function revokeBlob(url) {
  if (url) URL.revokeObjectURL(url);
}

function onClosed() {
  previewHtml.value = '';
  previewDocxHtml.value = '';
  previewMode.value = 'html';
  revokeBlob(previewPdfUrl.value);
  previewPdfUrl.value = '';
  revokeBlob(previewImageUrl.value);
  previewImageUrl.value = '';
}

async function downloadFile() {
  if (!props.contractId) return;
  try {
    const blob = await downloadSalesContractDocx(props.contractId);
    startDownload({ request: blob, filename: previewDocName.value || '合同文件.docx' });
  } catch {
    ElMessage.error('下载失败');
  }
}

function goEdit() {
  if (!props.contractId) return;
  visible.value = false;
  router.push(`/sales/contracts/editor/${props.contractId}`);
}

function printPreview() {
  const docTitle = previewTitle.value || '合同打印';
  if (previewMode.value === 'pdf' && previewPdfUrl.value) {
    const pdfHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtmlText(docTitle)}</title><style>body{margin:0;height:100vh;}embed{width:100%;height:100%;border:none;}</style></head><body><embed src="${previewPdfUrl.value}" type="application/pdf"></body></html>`;
    printHtmlInNewWindow(pdfHtml);
    return;
  }
  if (previewMode.value === 'docx' && previewDocxHtml.value) {
    const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtmlText(docTitle)}</title><style>
      body{margin:0;padding:16px;font-family:SimSun,宋体,Segoe UI,sans-serif;font-size:14px;line-height:1.65;color:#111;}
      table{border-collapse:collapse;} td,th{border:1px solid #ccc;padding:4px 8px;}
      @media print{@page{margin:0;}body{padding:12mm;}}
      </style></head><body>${previewDocxHtml.value}</body></html>`;
    printHtmlInNewWindow(full);
    return;
  }
  if (previewMode.value === 'image' && previewImageUrl.value) {
    const src = previewImageUrl.value;
    const srcEsc = String(src).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtmlText(docTitle)}</title><style>
      body{margin:0;text-align:center;padding:12px;} img{max-width:100%;height:auto;}
      @media print{@page{margin:0;} body{padding:10mm;} img{max-width:100%;}}
      </style></head><body><img src="${srcEsc}" alt="" /></body></html>`;
    printHtmlInNewWindow(full);
    return;
  }
  if (previewHtml.value) printContractPreviewFromHtml(previewHtml.value, docTitle);
}
</script>
