import { http } from './http';

export async function getCompanySettings() {
  const { data } = await http.get('/api/company/settings');
  return data;
}

export async function updateCompanySettings(payload) {
  const { data } = await http.put('/api/company/settings', payload);
  return data;
}

export async function updateFooterSealPosition(footerSealPosition) {
  const { data } = await http.patch('/api/company/settings/footer-seal-position', {
    footerSealPosition
  });
  return data;
}

export async function getQuickRoleUsers() {
  const { data } = await http.get('/api/company/quick-role-users');
  return data;
}

export async function updateQuickRoleUsers(payload) {
  const { data } = await http.put('/api/company/quick-role-users', payload);
  return data;
}

export async function getSupportContact() {
  const { data } = await http.get('/api/support-contact');
  return data;
}

export async function updateSupportContact(payload) {
  const { data } = await http.put('/api/support-contact', payload);
  return data;
}

export async function requestSupportContact(payload = {}) {
  const { data } = await http.post('/api/support-contact/request', payload);
  return data;
}
