import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_APP_API_BASE_URL || 'http://localhost:3001';
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      port: 3000,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true },
        '/miniprogram': { target, changeOrigin: true }
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
