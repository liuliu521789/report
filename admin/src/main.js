import Vue from 'vue';
import { createPinia, PiniaVuePlugin, setActivePinia } from 'pinia';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import './styles/app.css';

import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';

Vue.use(PiniaVuePlugin);
Vue.use(ElementUI);
Vue.config.productionTip = false;

const pinia = createPinia();
setActivePinia(pinia);
useAuthStore().hydrateFromStorage();

new Vue({
  pinia,
  router,
  render: (h) => h(App)
}).$mount('#app');

