import { supabase } from './supabaseClient.js';

async function request(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getToday: () => request('/api/session/today'),
  postReview: (wordId, body) =>
    request(`/api/reviews/${wordId}`, { method: 'POST', body: JSON.stringify(body) }),
  getWords: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/words${qs ? `?${qs}` : ''}`);
  },
  createWord: (body) => request('/api/words', { method: 'POST', body: JSON.stringify(body) }),
  updateWord: (id, body) => request(`/api/words/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteWord: (id) => request(`/api/words/${id}`, { method: 'DELETE' }),
  importCsv: (csv) => request('/api/words/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  getDashboard: () => request('/api/dashboard'),
  getReviewsChart: (days = 7) => request(`/api/dashboard/reviews-chart?days=${days}`),
};
