<script setup>
import { useId } from 'vue';

const uid = String(useId()).replace(/[^a-zA-Z0-9_-]/g, 'x');
</script>

<template>
  <svg
    class="word-document-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 44 52"
    role="img"
    aria-label="Word 文档"
  >
    <defs>
      <linearGradient :id="'wdi-paper-' + uid" x1="4" y1="4" x2="40" y2="48" gradientUnits="userSpaceOnUse">
        <stop stop-color="#ffffff" />
        <stop offset="1" stop-color="#e6eaee" />
      </linearGradient>
      <linearGradient :id="'wdi-blue-' + uid" x1="9" y1="9" x2="28" y2="32" gradientUnits="userSpaceOnUse">
        <stop stop-color="#5eb0f7" />
        <stop offset="1" stop-color="#185abd" />
      </linearGradient>
      <filter :id="'wdi-soft-' + uid" x="-35%" y="-35%" width="170%" height="170%">
        <feDropShadow dx="0" dy="0.9" stdDeviation="0.85" flood-color="#0f172a" flood-opacity="0.16" />
      </filter>
    </defs>

    <g :filter="'url(#wdi-soft-' + uid + ')'">
      <rect x="13" y="6" width="26" height="38" rx="3.8" :fill="'url(#wdi-paper-' + uid + ')'" />
      <path d="M33.5 6H39v7L33.5 6z" fill="#b5d6fc" />
      <rect x="23.5" y="29.5" width="12.5" height="2.6" rx="1.3" fill="#c5ccd4" />
      <rect x="23.5" y="34.2" width="9.2" height="2.6" rx="1.3" fill="#d9dee4" />
    </g>

    <g :filter="'url(#wdi-soft-' + uid + ')'">
      <rect x="7" y="9" width="22.5" height="22.5" rx="4" :fill="'url(#wdi-blue-' + uid + ')'" />
      <!-- 蓝块几何中心 (7+11.25, 9+11.25)；略小字号以贴合 Fluent 比例 -->
      <text
        x="18.25"
        y="20.25"
        text-anchor="middle"
        dominant-baseline="central"
        fill="#ffffff"
        font-family="system-ui, 'Segoe UI', sans-serif"
        font-size="11"
        font-weight="700"
      >W</text>
    </g>
  </svg>
</template>

<style scoped>
.word-document-icon {
  display: block;
  width: 100%;
  height: auto;
}
</style>
