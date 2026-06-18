<template>
  <div class="signature-pad-container">
    <div class="pad-header">
      <span class="title">电子签章</span>
      <div class="actions">
        <el-button size="small" @click="clearCanvas">清空</el-button>
        <el-button type="primary" size="small" :loading="uploading" @click="saveSignature">保存签章</el-button>
        <el-button type="success" size="small" :loading="stamping" :disabled="!signatureData" @click="applyToPDF">盖章到PDF</el-button>
      </div>
    </div>
    
    <canvas ref="canvas" class="signature-canvas" width="600" height="200" @mousedown="startDrawing" @mousemove="draw" @mouseup="stopDrawing" @mouseleave="stopDrawing"></canvas>
    
    <div class="pad-footer">
      <el-alert v-if="signatureData" type="success" :closable="false" size="small">
        签章已保存，可用于合同盖章。支持鼠标或触屏绘制。
      </el-alert>
      <div v-else class="hint">请在画板上签名（支持鼠标/触屏）</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  contractId: { type: [Number, String], default: null }
})

const canvas = ref(null)
const ctx = ref(null)
const isDrawing = ref(false)
const signatureData = ref(null)
const uploading = ref(false)
const stamping = ref(false)
const emit = defineEmits(['signature-saved'])

let lastX = 0
let lastY = 0

onMounted(() => {
  const c = canvas.value
  ctx.value = c.getContext('2d')
  ctx.value.strokeStyle = '#000'
  ctx.value.lineJoin = 'round'
  ctx.value.lineCap = 'round'
  ctx.value.lineWidth = 3
})

function startDrawing(e) {
  isDrawing.value = true
  const rect = canvas.value.getBoundingClientRect()
  lastX = e.clientX - rect.left
  lastY = e.clientY - rect.top
}

function draw(e) {
  if (!isDrawing.value) return
  const rect = canvas.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  ctx.value.beginPath()
  ctx.value.moveTo(lastX, lastY)
  ctx.value.lineTo(x, y)
  ctx.value.stroke()
  
  lastX = x
  lastY = y
}

function stopDrawing() {
  isDrawing.value = false
  signatureData.value = canvas.value.toDataURL('image/png')
  emit('signature-saved', signatureData.value)
}

function clearCanvas() {
  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height)
  signatureData.value = null
  emit('signature-saved', null)
}

async function saveSignature() {
  if (!signatureData.value) {
    ElMessage.warning('请先绘制签章')
    return
  }
  if (!props.contractId) {
    ElMessage.warning('请先保存合同后再上传签章')
    return
  }
  uploading.value = true
  try {
    const { uploadContractSignature } = await import('../api')
    const res = await uploadContractSignature(props.contractId, signatureData.value)
    if (res?.ok) {
      ElMessage.success('签章已保存至服务器')
      emit('signature-saved', res.signatureUrl)
    }
  } catch {
    ElMessage.error('签章上传失败')
  } finally {
    uploading.value = false
  }
}

async function applyToPDF() {
  if (!signatureData.value && !props.contractId) {
    ElMessage.warning('请先绘制并保存签章')
    return
  }
  if (!props.contractId) {
    ElMessage.warning('请先保存合同')
    return
  }
  stamping.value = true
  try {
    const { stampContractPdf } = await import('../api')
    const blob = await stampContractPdf(props.contractId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `合同_${props.contractId}_已签章.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('带签章PDF已生成并下载')
  } catch {
    ElMessage.error('PDF生成失败')
  } finally {
    stamping.value = false
  }
}
</script>

<style scoped>
.signature-pad-container {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 16px;
  background: #fafafa;
}

.pad-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.actions {
  display: flex;
  gap: 8px;
}

.signature-canvas {
  border: 2px dashed #c0c4cc;
  background: #fff;
  cursor: crosshair;
  touch-action: none;
}

.pad-footer {
  margin-top: 12px;
  font-size: 13px;
}

.hint {
  color: #909399;
  font-style: italic;
}
</style>
