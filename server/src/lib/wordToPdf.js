import mammoth from 'mammoth';
import puppeteer from 'puppeteer';

let browserPromise = null;

function safeBasename(name, fallback = 'document') {
  const base = String(name || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  const cleaned = base.replace(/[^\w\u4e00-\u9fa5.\-()+ ]+/g, '_').trim();
  return cleaned || fallback;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserPromise;
}

/** 销售合同上传 Word 预览转 PDF */
export async function wordDocxToPdf(buffer, originalName = 'document.docx') {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const title = safeBasename(String(originalName).replace(/\.[^.]+$/i, ''), 'document');
  const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:"Microsoft YaHei",SimSun,Arial,sans-serif;font-size:14px;line-height:1.6;padding:24px;}</style></head><body>${html}</body></html>`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(wrapped, { waitUntil: 'networkidle0', timeout: 120000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' }
    });
    return { buffer: pdf, filename: `${title}.pdf` };
  } finally {
    await page.close();
  }
}
