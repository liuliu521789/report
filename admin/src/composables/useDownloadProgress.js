import { ref } from 'vue'

export const downloadProgressRef = ref(null)

export function startDownload(config) {
  if (downloadProgressRef.value) {
    downloadProgressRef.value.start(config)
  } else {
    console.warn('DownloadProgress not mounted yet')
  }
}
