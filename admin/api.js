// Shared helper for admin API requests (JSON + cookie session).
export async function fetchAdminAPI(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}
