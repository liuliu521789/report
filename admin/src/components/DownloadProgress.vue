<template>
  <el-dialog
    v-model="visible"
    title="文件下载"
    width="400px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="showClose"
  >
    <div class="download-body" style="text-align:center;padding:16px 0;">
      <div v-if="displayFilename" class="download-filename" style="font-size:14px;margin-bottom:20px;word-break:break-all;">
        {{ displayFilename }}
      </div>
      <el-progress
        :percentage="percent"
        :indeterminate="isIndeterminate"
        :status="progressStatus"
        :stroke-width="14"
      />
      <p style="color:#909399;font-size:13px;margin-top:12px;">{{ statusText }}</p>
    </div>
    <template #footer v-if="status === 'error'">
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" @click="retry">重试</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

const visible = ref(false)
const percent = ref(0)
const filename = ref('')
const status = ref('idle')
const errorMsg = ref('')
let lastConfig = null

const isIndeterminate = computed(() => status.value === 'downloading' && percent.value === 0)
const progressStatus = computed(() => {
  if (status.value === 'completed') return 'success'
  if (status.value === 'error') return 'exception'
  return ''
})
const showClose = computed(() => status.value === 'completed' || status.value === 'error')
const displayFilename = computed(() => filename.value || '')
const statusText = computed(() => {
  if (status.value === 'downloading') return percent.value > 0 ? `下载中... ${percent.value}%` : '正在准备下载...'
  if (status.value === 'completed') return '下载完成'
  if (status.value === 'error') return errorMsg.value || '下载失败'
  return ''
})

function start(config) {
  lastConfig = config
  visible.value = true
  filename.value = config.filename || ''
  percent.value = 0
  status.value = 'downloading'
  errorMsg.value = ''

  const promise = typeof config.request === 'function' ? config.request() : config.request
  Promise.resolve(promise).then(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = config.filename || 'download'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    percent.value = 100
    status.value = 'completed'
    if (typeof config.onSuccess === 'function') {
      config.onSuccess(blob)
    } else {
      ElMessage.success(`${config.filename || '文件'} 下载完成`)
    }
    setTimeout(() => { visible.value = false }, 2000)
  }).catch(err => {
    status.value = 'error'
    const msg = (err && err.message) || '下载失败'
    errorMsg.value = msg
    ElMessage.error(`下载失败: ${msg}`)
  })
}

function retry() {
  if (lastConfig) start(lastConfig)
}

defineExpose({ start })
</script>
