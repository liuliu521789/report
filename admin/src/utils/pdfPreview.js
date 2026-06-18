let pdfjsModule = null;
let activeRenderTask = null;

async function getPdfJs() {
  if (!pdfjsModule) {
    const lib = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjsModule = lib;
  }
  return pdfjsModule;
}

export function cancelPdfPageRender() {
  if (!activeRenderTask) return;
  try {
    activeRenderTask.cancel();
  } catch {
    /* ignore */
  }
  activeRenderTask = null;
}

export async function loadPdfFromBlob(blob) {
  const pdfjs = await getPdfJs();
  const data = await blob.arrayBuffer();
  return pdfjs.getDocument({ data }).promise;
}

/** 将 PDF 某一页绘制到 canvas，按容器尺寸完整适配（不滚动） */
export async function renderPdfPageFit(pdfDoc, pageNum, canvas, containerEl) {
  if (!pdfDoc || !canvas || !containerEl) return;

  cancelPdfPageRender();

  const page = await pdfDoc.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const pad = 4;
  const maxW = Math.max(containerEl.clientWidth - pad, 120);
  const maxH = Math.max(containerEl.clientHeight - pad, 160);
  const scale = Math.min(maxW / baseViewport.width, maxH / baseViewport.height);
  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const task = page.render({ canvasContext: ctx, viewport });
  activeRenderTask = task;
  try {
    await task.promise;
  } catch (e) {
    if (e?.name === 'RenderingCancelledException') return;
    throw e;
  } finally {
    if (activeRenderTask === task) activeRenderTask = null;
  }
}

export async function destroyPdfDoc(pdfDoc) {
  cancelPdfPageRender();
  if (pdfDoc?.destroy) {
    try {
      await pdfDoc.destroy();
    } catch {
      /* ignore */
    }
  }
}
