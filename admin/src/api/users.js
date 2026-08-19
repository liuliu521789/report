import { http } from './http';

/** 分页 / 筛选 / 搜索：{ items, total, page, pageSize } */
export async function listUsers(params) {
  const { data } = await http.get('/api/users', { params: params || {} });
  return data;
}

/** 下拉用：仅 id/username/accountType/isActive/categoryNameZh，含 deleted_at IS NULL 过滤 */
export async function listUsersLite(params) {
  const { data } = await http.get('/api/users/lite', { params: params || {} });
  return data;
}

export async function getUserDetail(id) {
  const { data } = await http.get(`/api/users/${id}`);
  return data;
}

export async function createUser(payload) {
  const { data } = await http.post('/api/users', payload);
  return data;
}

export async function updateUser(id, payload) {
  const { data } = await http.put(`/api/users/${id}`, payload);
  return data;
}

export async function deleteUser(id) {
  const { data } = await http.delete(`/api/users/${id}`);
  return data;
}

/** 重置密码：返回 { temporaryPassword }，并强制下次登录改密 */
export async function resetUserPassword(id, password) {
  const payload = password ? { password } : {};
  const { data } = await http.post(`/api/users/${id}/reset-password`, payload);
  return data;
}

export async function forceLogoutUser(id) {
  const { data } = await http.post(`/api/users/${id}/force-logout`);
  return data;
}

export async function resetUserTotp(id) {
  const { data } = await http.post(`/api/users/${id}/reset-totp`);
  return data;
}

export async function getPermissionSchema() {
  const { data } = await http.get('/api/permissions/schema');
  return data;
}

export async function getRoleDefaultPermissions(code) {
  const { data } = await http.get(`/api/permissions/role-defaults/${encodeURIComponent(code)}`);
  return data;
}

export async function listEmployeeCategories() {
  const { data } = await http.get('/api/employee-categories');
  return data;
}

export async function createEmployeeCategory(payload) {
  const { data } = await http.post('/api/employee-categories', payload);
  return data;
}

export async function updateEmployeeCategory(id, payload) {
  const { data } = await http.put(`/api/employee-categories/${id}`, payload);
  return data;
}

export async function deleteEmployeeCategory(id) {
  const { data } = await http.delete(`/api/employee-categories/${id}`);
  return data;
}

export async function listDepartmentsTree() {
  const { data } = await http.get('/api/departments/tree');
  return data;
}

export async function listDepartmentsFlat() {
  const { data } = await http.get('/api/departments/flat');
  return data;
}

export async function createDepartment(payload) {
  const { data } = await http.post('/api/departments', payload);
  return data;
}

export async function updateDepartment(id, payload) {
  const { data } = await http.put(`/api/departments/${id}`, payload);
  return data;
}

export async function deleteDepartment(id) {
  const { data } = await http.delete(`/api/departments/${id}`);
  return data;
}
