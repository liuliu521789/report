import axios from 'axios';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';

const baseURL = process.env.VUE_APP_API_BASE_URL || 'http://localhost:3001';

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
  startProgress();
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
    doneProgress();
    return res;
  },
  (err) => {
    doneProgress();
    const status = err?.response?.status;
    if (status === 401) {
      const p = getActivePinia();
      if (p) useAuthStore().clearTokenOnly();
      else localStorage.removeItem('token');
      // let router guard handle redirect; avoid circular import
    }
    return Promise.reject(err);
  }
);

