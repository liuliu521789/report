import axios from 'axios';

const baseURL = process.env.VUE_APP_API_BASE_URL || 'http://localhost:3001';

export const http = axios.create({
  baseURL,
  timeout: 15000
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      // let router guard handle redirect; avoid circular import
    }
    return Promise.reject(err);
  }
);

