import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

import { normalizeAdminApiBaseUrl, normalizeProxyTargetFromEnv } from './src/utils/apiBaseNormalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvedApiPort(env) {
  const raw = String(env.VITE_APP_API_BASE_URL || '').trim();
  if (!raw) return 3001;
  try {
    const u = new URL(normalizeAdminApiBaseUrl(raw));
    if (u.port) return Number(u.port);
    return u.protocol === 'https:' ? 443 : 80;
  } catch {
    return 3001;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  /** 后端默认 PORT=3001；勿写成 3000（与 Vite 自身端口冲突导致代理失败） */
  const target = normalizeProxyTargetFromEnv(env.VITE_APP_API_BASE_URL);
  const adminPort = Number(env.VITE_ADMIN_DEV_PORT || 3000);
  const apiPort = resolvedApiPort(env);
  if (adminPort === apiPort) {
    throw new Error(
      `[vite] Admin dev port (${adminPort}) cannot equal API port (${apiPort}). Set VITE_ADMIN_DEV_PORT or VITE_APP_API_BASE_URL so they differ.`
    );
  }
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      host: '0.0.0.0',
      port: adminPort,
      proxy: {
        // 批量导入/导出等接口可能耗时较长；避免开发代理默认超时过早断开
        '/api': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/qc-yearbooks': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/uploads': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/miniprogram': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 }
      }
    },
    preview: {
      proxy: {
        '/api': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/qc-yearbooks': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/uploads': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/miniprogram': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 }
      }
    },
    build: {
      // 路由级拆包 + 体积预算门禁
      chunkSizeWarningLimit: 800, // 降低警告阈值，鼓励拆包
      rollupOptions: {
        output: {
          manualChunks: {
            // 核心 vendor 拆分
            vendor: ['vue', 'vue-router', 'pinia'],
            // UI 库（Element Plus 体积大，可进一步按需但需 unplugin）
            ui: ['element-plus'],
            // 图表库
            charts: ['echarts'],
            // 其他大依赖
            utils: ['axios', 'mammoth']
          }
        }
      }
    }
  };
});
