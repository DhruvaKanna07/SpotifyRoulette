// Tiny fetch wrapper. All requests are same-origin (Vite proxies /api to the
// server), so the session cookie rides along automatically.
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  login: () => request('/auth/login'),
  callback: (code, state) =>
    request('/auth/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    }),
  me: () => request('/me'),
  rescan: () => request('/rescan', { method: 'POST' }),
};
