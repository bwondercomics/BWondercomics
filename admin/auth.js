import { el } from './dom.js';

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase();
}

function isAdminUser(user) {
  return !!user && normalizeRole(user.role) === 'admin';
}

function setLoginError(message = '') {
  if (!el.loginError) return;

  const text = String(message || '').trim();
  if (!text) {
    el.loginError.textContent = '';
    el.loginError.style.display = 'none';
    el.loginError.className = '';
    return;
  }

  el.loginError.textContent = text;
  el.loginError.className = 'error-message';
  el.loginError.style.display = 'block';
}

async function getSessionUser() {
  // Read the current session (cookie-based) to detect admin access.
  const res = await fetch('/api/session', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('Session check failed');
  const data = await res.json().catch(() => ({}));
  return data && typeof data === 'object' ? data.user || null : null;
}

export async function checkSession(showDashboard) {
  // Gate admin UI behind admin role.
  try {
    const user = await getSessionUser();
    if (isAdminUser(user)) {
      setLoginError('');
      await showDashboard();
      return true;
    }
    if (user) {
      setLoginError(
        `Signed in as ${user.email || 'user'} (${user.role || 'user'}). This account isn't an admin.`
      );
    } else {
      setLoginError('');
    }
    return false;
  } catch (err) {
    console.error('Admin session check failed:', err);
    setLoginError('Session check failed. Please sign in again.');
    return false;
  }
}

export async function login(email, password, showDashboard) {
  // Login via API and show dashboard on admin role.
  try {
    setLoginError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorText = data && typeof data === 'object' ? data.error : null;
      setLoginError(errorText || 'Invalid credentials');
      return false;
    }

    const user = data && typeof data === 'object' ? data.user || null : null;
    if (!isAdminUser(user)) {
      setLoginError(
        `Signed in as ${user?.email || 'user'} (${user?.role || 'user'}). This account isn't an admin.`
      );
      return false;
    }

    await showDashboard();
    return true;
  } catch (err) {
    console.error('Admin login failed:', err);
    setLoginError('Sign-in failed. Please try again.');
    return false;
  }
}

export async function logout() {
  // Clear session cookie server-side and reset the admin UI.
  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch (err) {
    console.warn('Logout request failed:', err);
  }

  if (el.loginEmail) el.loginEmail.value = '';
  if (el.loginPassword) el.loginPassword.value = '';
  setLoginError('');

  el.loginScreen.style.display = 'flex';
  el.adminDashboard.style.display = 'none';
}
