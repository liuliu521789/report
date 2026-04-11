import axios from 'axios';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { enrichApiErrorBody } from '../../../shared/apiErrorZh.js';

/** 开发环境默认空串：请求发到当前页所在源，由 Vite 把 /api、/uploads 代理到后端（见 vite.config.js）。须同时启动 server。 */
const baseURL =
  import.meta.env.VITE_APP_API_BASE_URL ||
  (import.meta.env.DEV ? '' : 'http://localhost:3001');

export const http = axios.create({
  baseURL,
  timeout: 15000
});

let reqCount = 0;
let barEl = null;
let progressTimer = null;
let progressValue = 0;

function ensureBar() {
  if (barEl) return barEl;
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.height = '3px';
  el.style.width = '0%';
  el.style.opacity = '0';
  el.style.zIndex = '99999';
  el.style.background = 'linear-gradient(90deg, #409eff, #67c23a)';
  el.style.boxShadow = '0 0 8px rgba(64, 158, 255, 0.6)';
  el.style.transition = 'width 0.2s ease, opacity 0.25s ease';
  document.body.appendChild(el);
  barEl = el;
  return barEl;
}

function startProgress() {
  reqCount += 1;
  const el = ensureBar();
  if (!el) return;
  if (reqCount > 1) return;
  progressValue = 12;
  el.style.opacity = '1';
  el.style.width = `${progressValue}%`;
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (progressValue >= 88) return;
    progressValue += progressValue < 50 ? 8 : 3;
    el.style.width = `${Math.min(progressValue, 88)}%`;
  }, 180);
}

function doneProgress() {
  reqCount = Math.max(0, reqCount - 1);
  const el = ensureBar();
  if (!el || reqCount > 0) return;
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  progressValue = 100;
  el.style.width = '100%';
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.width = '0%';
    progressValue = 0;
  }, 220);
}

http.interceptors.request.use((config) => {
  config.silentProgress = config.silentProgress === true;
  if (!config.silentProgress) startProgress();
  const p = getActivePinia();
  const token = p ? useAuthStore().token : localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    if (!res.config.silentProgress) doneProgress();
    return res;
  },
  (err) => {
    if (!err.config?.silentProgress) doneProgress();
    const data = err?.response?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      err.response.data = enrichApiErrorBody(data);
    }
    const status = err?.response?.status;
    if (status === 401) {
      const p = getActivePinia();
      if (p) useAuthStore().clearSession();
      else {
        localStorage.removeItem('token');
        localStorage.removeItem('accountType');
        localStorage.removeItem('permissions');
        localStorage.removeItem('idleTimeoutMinutes');
        localStorage.removeItem('confirmSensitiveOperations');
      }
      import('../router').then((m) => {
        const r = m.default;
        if (r.currentRoute.value?.path !== '/login') r.replace('/login');
      });
    }
    return Promise.reject(err);
  }
);

