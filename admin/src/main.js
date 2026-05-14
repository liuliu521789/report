import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { getMe } from './api';
import { formatDateTime } from './utils/formatDateTime';
import { axiosUserMessage } from './utils/apiUserMessage';
import './styles/app.css';

const app = createApp(App);
app.config.globalProperties.$dt = formatDateTime;
app.config.globalProperties.$apiUserMsg = axiosUserMessage;
const pinia = createPinia();
app.use(pinia);
const auth = useAuthStore();
auth.hydrateFromStorage();

async function bootstrap() {
  /**
   * 冷启动先和后端对齐会话权限，避免 localStorage 陈旧状态导致路由误判为“无权限”。
   * 仅在已有 token 时触发；失败时保持原有行为（401 会在拦截器中清会话并跳登录）。
   */
  if (auth.token) {
    try {
      const d = await getMe();
      auth.applyMeResponse(d);
    } catch {
      /* ignore */
    }
  }

  app.use(ElementPlus, { locale: zhCn, size: 'default' });
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
  }

  app.use(router);
  app.mount('#app');
}

bootstrap();
