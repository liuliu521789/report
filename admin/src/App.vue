<template>
  <div id="app">
    <router-view />
    <DownloadProgress ref="downloadProgressEl" />
  </div>
</template>

<script>
import DownloadProgress from './components/DownloadProgress.vue'
import { downloadProgressRef } from './composables/useDownloadProgress.js'

export default {
  name: 'App',
  components: { DownloadProgress },
  mounted() {
    downloadProgressRef.value = this.$refs.downloadProgressEl
  }
};
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
</style>

