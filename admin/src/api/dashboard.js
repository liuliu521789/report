import { http } from './http';

export async function getDashboardSummary() {
  const { data } = await http.get('/api/dashboard/summary');
  return data?.data ?? data;
}

export async function getDashboardActivityHeatmap(params = {}) {
  const { data } = await http.get('/api/dashboard/activity-heatmap', { params });
  return data?.data ?? data;
}
