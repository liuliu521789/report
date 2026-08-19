import { http } from './http';

export async function login(username, password, extra = {}) {
  const { data } = await http.post('/api/auth/login', { username, password, ...extra });
  return data;
}

export async function getMe() {
  const { data } = await http.get('/api/auth/me');
  return data;
}

export async function changePassword(oldPassword, newPassword) {
  const { data } = await http.post('/api/auth/change-password', { oldPassword, newPassword });
  return data;
}

/** 超级管理员：以指定员工身份签发会话（权限与该员工一致） */
export async function impersonateUser(userId) {
  const { data } = await http.post('/api/auth/impersonate', { userId });
  return data;
}

export async function totpProvision(pendingToken) {
  const { data } = await http.post('/api/auth/totp/provision', { pendingToken });
  return data;
}

export async function totpActivate(pendingToken, code) {
  const { data } = await http.post('/api/auth/totp/activate', { pendingToken, code });
  return data;
}

export async function totpVerifyLogin(pendingToken, code) {
  const { data } = await http.post('/api/auth/totp/verify-login', { pendingToken, code });
  return data;
}

export async function logout() {
  const { data } = await http.post('/api/auth/logout');
  return data;
}
