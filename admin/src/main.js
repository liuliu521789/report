import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { formatDateTime } from './utils/formatDateTime';
import { axiosUserMessage } from './utils/apiUserMessage';
import './styles/app.css';

const app = createApp(App);
app.config.globalProperties.$dt = formatDateTime;
app.config.globalProperties.$apiUserMsg = axiosUserMessage;
const pinia = createPinia();
app.use(pinia);
useAuthStore().hydrateFromStorage();

app.use(ElementPlus, { locale: zhCn, size: 'default' });
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(router);
app.mount('#app');
