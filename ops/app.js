import { getDiagnosticsSnapshot } from '../admin/diagnostics-data.js';

const state = {
  currentRunId: '',
  stream: null,
  historyTimer: null,
  commandsEnabled: false,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchJSON(url, options = {}) {
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

function formatDate(value) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${Math.floor(seconds)}s`;
}

function setNotice(message = '', level = 'warning') {
  const notice = document.getElementById('opsNotice');
  if (!notice) return;
  if (!message) {
    notice.hidden = true;
    notice.textContent = '';
    notice.className = 'ops-notice';
    return;
  }
  notice.hidden = false;
  notice.className = `ops-notice ops-notice--${level}`;
  notice.textContent = message;
}

function showLogin(error = '') {
  const login = document.getElementById('opsLoginScreen');
  const app = document.getElementById('opsApp');
  const errorBox = document.getElementById('opsLoginError');
  if (state.stream) {
    state.stream.close();
    state.stream = null;
  }
  if (state.historyTimer) {
    clearInterval(state.historyTimer);
    state.historyTimer = null;
  }
  if (login) login.hidden = false;
  if (app) app.hidden = true;
  if (errorBox) {
    errorBox.hidden = !error;
    errorBox.textContent = error || '';
  }
}

function showApp(meta = '') {
  const login = document.getElementById('opsLoginScreen');
  const app = document.getElementById('opsApp');
  const metaBox = document.getElementById('opsMeta');
  if (login) login.hidden = true;
  if (app) app.hidden = false;
  if (metaBox) metaBox.textContent = meta || '';
}

function appendRunLine(line) {
  const output = document.getElementById('opsRunOutput');
  if (!output) return;
  output.textContent = `${output.textContent}${line}\n`;
  output.scrollTop = output.scrollHeight;
}

function renderSnapshot(snapshot) {
  const container = document.getElementById('opsSnapshot');
  const meta = document.getElementById('opsMeta');
  if (!container || !meta) return;
  const healthChecks = Object.entries(snapshot?.health?.checks || {});
  const serviceItems = snapshot?.serviceStatus?.items || [];
  meta.textContent = `Snapshot ${formatDate(snapshot?.generatedAt)}`;
  container.innerHTML = `
    <div class="ops-summary-banner ops-summary-banner--${escapeHtml(snapshot?.overallStatus || 'warning')}">
      <strong>${escapeHtml(String(snapshot?.overallStatus || 'unknown').toUpperCase())}</strong>
      <span>${escapeHtml(formatDate(snapshot?.generatedAt))}</span>
    </div>
    <div class="ops-summary-grid">
      ${healthChecks
        .map(
          ([name, item]) => `
            <div class="ops-summary-card">
              <div class="ops-summary-title">${escapeHtml(name)}</div>
              <div class="ops-status ops-status--${escapeHtml(item.status || 'warning')}">${escapeHtml(item.status || 'warning')}</div>
              <div class="ops-summary-text">${escapeHtml(item.message || '')}</div>
            </div>
          `
        )
        .join('')}
      ${serviceItems
        .map(
          (item) => `
            <div class="ops-summary-card">
              <div class="ops-summary-title">${escapeHtml(item.label || item.id || 'Service')}</div>
              <div class="ops-status ops-status--${escapeHtml(item.status || 'warning')}">${escapeHtml(item.status || 'warning')}</div>
              <div class="ops-summary-text">${escapeHtml(item.summary || '')}</div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderCommands(payload) {
  const container = document.getElementById('opsCommands');
  if (!container) return;
  const commands = Array.isArray(payload.commands) ? payload.commands : [];
  state.commandsEnabled = !!payload.enabled;

  if (!commands.length) {
    container.innerHTML = '<div class="ops-empty">No commands configured.</div>';
    return;
  }

  container.innerHTML = `
    <div class="ops-command-grid">
      ${commands
        .map(
          (command) => `
            <div class="ops-command-card">
              <div class="ops-command-group">${escapeHtml(command.group || 'Other')}</div>
              <div class="ops-command-title">${escapeHtml(command.label || command.id)}</div>
              <div class="ops-command-text">${escapeHtml(command.description || '')}</div>
              <code class="ops-command-terminal">${escapeHtml(command.command || '')}</code>
              <button
                class="btn-primary ops-command-run"
                type="button"
                data-command-id="${escapeHtml(command.id)}"
                data-confirm="${command.requiresConfirm ? '1' : '0'}"
                ${state.commandsEnabled ? '' : 'disabled'}
              >
                Queue Run
              </button>
            </div>
          `
        )
        .join('')}
    </div>
  `;

  container.querySelectorAll('.ops-command-run').forEach((button) => {
    button.addEventListener('click', async () => {
      const commandId = button.getAttribute('data-command-id') || '';
      const requiresConfirm = button.getAttribute('data-confirm') === '1';
      if (requiresConfirm && !window.confirm('Queue this command?')) {
        return;
      }
      button.disabled = true;
      try {
        const payload = await fetchJSON('/api/admin/ops/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commandId, confirm: requiresConfirm }),
        });
        setNotice(`Queued ${payload.run.label}.`, 'ok');
        await Promise.all([loadHistory(), loadBackups(), loadSnapshot()]);
        openRun(payload.run.id, true);
      } catch (error) {
        setNotice(error.message, 'error');
      } finally {
        button.disabled = !state.commandsEnabled;
      }
    });
  });
}

function renderHistory(runs) {
  const container = document.getElementById('opsRuns');
  if (!container) return;
  if (!runs.length) {
    container.innerHTML = '<div class="ops-empty">No runs recorded yet.</div>';
    return;
  }

  container.innerHTML = `
    <div class="ops-run-grid">
      ${runs
        .map(
          (run) => `
            <button class="ops-run-card" type="button" data-run-id="${escapeHtml(run.id)}">
              <div class="ops-run-card-header">
                <span class="ops-run-title">${escapeHtml(run.label || run.commandId)}</span>
                <span class="ops-status ops-status--${escapeHtml(run.status || 'warning')}">${escapeHtml(run.status || 'unknown')}</span>
              </div>
              <div class="ops-run-card-meta">Started: ${escapeHtml(formatDate(run.startedAt))}</div>
              <div class="ops-run-card-meta">Duration: ${escapeHtml(run.durationSeconds != null ? formatDuration(run.durationSeconds) : 'n/a')}</div>
              <div class="ops-run-card-meta">${escapeHtml(run.userEmail || 'Unknown user')}</div>
            </button>
          `
        )
        .join('')}
    </div>
  `;

  container.querySelectorAll('.ops-run-card').forEach((button) => {
    button.addEventListener('click', () => {
      const runId = button.getAttribute('data-run-id') || '';
      openRun(runId, false);
    });
  });
}

function renderBackups(backups) {
  const container = document.getElementById('opsBackups');
  if (!container) return;
  const dbBackups = backups?.db || [];
  const fileBackups = backups?.files || [];
  const renderList = (kind, items) => {
    const attempt = backups?.jobs?.[kind]?.lastAttempt;
    const state = `<div class="ops-backup-meta">Freshness: ${escapeHtml(backups?.freshness?.[kind]?.status || 'unknown')} · Last attempt: ${escapeHtml(attempt?.status || 'unrecorded')}${attempt?.errorCode ? ` · ${escapeHtml(attempt.errorCode)}` : ''} · Source: ${escapeHtml(backups?.source || 'unknown')} · Root: ${escapeHtml(backups?.root || 'unknown')}</div>`;
    return items.length
      ? `${state}<ul class="ops-backup-list">${items
          .slice(0, 6)
          .map(
            (item) => `
              <li>
                <div>${escapeHtml(item.name || '')}</div>
                <div class="ops-backup-meta">${escapeHtml(formatDate(item.createdAt))} · ${escapeHtml(item.sizePretty || '')}</div>
              </li>
            `
          )
          .join('')}</ul>`
      : `${state}<div class="ops-empty">No backups found.</div>`;
  };

  container.innerHTML = `
    <div class="ops-backup-grid">
      <div class="ops-backup-card">
        <div class="ops-command-title">Database Backups</div>
        ${renderList('database', dbBackups)}
      </div>
      <div class="ops-backup-card">
        <div class="ops-command-title">File Backups</div>
        ${renderList('files', fileBackups)}
      </div>
    </div>
    <div class="ops-backup-meta">${escapeHtml(backups?.message || '')} Source: ${escapeHtml(backups?.source || 'unknown')}. Root: ${escapeHtml(backups?.root || 'unknown')}</div>
  `;
}

async function loadSnapshot() {
  try {
    const result = await getDiagnosticsSnapshot(fetchJSON);
    renderSnapshot(result.snapshot);
  } catch (error) {
    document.getElementById('opsSnapshot').innerHTML =
      `<div class="ops-empty">${escapeHtml(error.message)}</div>`;
    throw error;
  }
}

async function loadCommands() {
  try {
    const payload = await fetchJSON('/api/admin/ops');
    renderCommands(payload);
    if (!payload.enabled) {
      setNotice(payload.message || 'Command runner disabled.', 'warning');
    }
  } catch (error) {
    document.getElementById('opsCommands').innerHTML =
      `<div class="ops-empty">${escapeHtml(error.message)}</div>`;
    throw error;
  }
}

async function loadHistory() {
  try {
    const payload = await fetchJSON('/api/admin/ops/history');
    renderHistory(Array.isArray(payload.runs) ? payload.runs : []);
  } catch (error) {
    document.getElementById('opsRuns').innerHTML =
      `<div class="ops-empty">${escapeHtml(error.message)}</div>`;
    throw error;
  }
}

async function loadBackups() {
  try {
    const payload = await fetchJSON('/api/admin/ops/backups');
    renderBackups(payload);
  } catch (error) {
    document.getElementById('opsBackups').innerHTML =
      `<div class="ops-empty">${escapeHtml(error.message)}</div>`;
    throw error;
  }
}

function closeStream() {
  if (state.stream) {
    state.stream.close();
    state.stream = null;
  }
}

async function showRun(runId) {
  const payload = await fetchJSON(`/api/admin/ops/runs/${encodeURIComponent(runId)}`);
  const run = payload.run;
  const meta = document.getElementById('opsRunMeta');
  const output = document.getElementById('opsRunOutput');
  state.currentRunId = run.id;
  if (meta) {
    meta.textContent = `${run.label} · ${run.status} · ${formatDate(run.startedAt)}`;
  }
  if (output) {
    output.textContent = run.output || '';
  }
  return run;
}

function streamRun(runId) {
  closeStream();
  const output = document.getElementById('opsRunOutput');
  if (output) output.textContent = '';
  const source = new EventSource(`/api/admin/ops/runs/${encodeURIComponent(runId)}/stream`);
  state.stream = source;

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data || '{}');
      if (payload.line) appendRunLine(payload.line);
    } catch {
      appendRunLine(event.data || '');
    }
  };

  source.addEventListener('meta', (event) => {
    try {
      const payload = JSON.parse(event.data || '{}');
      const meta = document.getElementById('opsRunMeta');
      if (meta) meta.textContent = `${payload.label || 'Run'} · streaming`;
    } catch {
      // no-op
    }
  });

  source.addEventListener('complete', async (event) => {
    closeStream();
    try {
      const payload = JSON.parse(event.data || '{}');
      const run = payload.run;
      if (run) {
        const meta = document.getElementById('opsRunMeta');
        const outputBox = document.getElementById('opsRunOutput');
        if (meta) {
          meta.textContent = `${run.label} · ${run.status} · ${formatDate(run.finishedAt || run.startedAt)}`;
        }
        if (outputBox) outputBox.textContent = run.output || outputBox.textContent;
      }
    } catch {
      // no-op
    }
    await Promise.all([loadHistory(), loadBackups(), loadSnapshot()]);
  });

  source.onerror = () => {
    const meta = document.getElementById('opsRunMeta');
    if (meta) meta.textContent = 'Stream disconnected.';
  };
}

async function openRun(runId, preferStream) {
  try {
    const run = await showRun(runId);
    if (preferStream || run.status === 'queued' || run.status === 'running') {
      streamRun(run.id);
    } else {
      closeStream();
    }
  } catch (error) {
    setNotice(error.message, 'error');
  }
}

async function loadAll() {
  setNotice('');
  try {
    await Promise.all([loadSnapshot(), loadCommands(), loadHistory(), loadBackups()]);
  } catch (error) {
    setNotice(error.message, 'warning');
  }
}

async function checkSession() {
  try {
    const payload = await fetchJSON('/api/session');
    const user = payload.user;
    if (!user || user.role !== 'admin') {
      showLogin('');
      return;
    }
    showApp(`Signed in as ${user.email}`);
    await loadAll();
    if (!state.historyTimer) {
      state.historyTimer = setInterval(() => {
        loadHistory().catch(() => undefined);
      }, 5000);
    }
  } catch (error) {
    showLogin(error.message);
  }
}

async function login(event) {
  event.preventDefault();
  const email = document.getElementById('opsLoginEmail')?.value || '';
  const password = document.getElementById('opsLoginPassword')?.value || '';
  try {
    await fetchJSON('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    await checkSession();
  } catch (error) {
    showLogin(error.message);
  }
}

async function logout() {
  try {
    await fetchJSON('/api/logout', { method: 'POST' });
  } catch {
    // ignore logout errors
  }
  showLogin('');
}

document.getElementById('opsLoginForm')?.addEventListener('submit', login);
document.getElementById('opsLogout')?.addEventListener('click', logout);
document.getElementById('opsRefresh')?.addEventListener('click', () => {
  loadAll().catch((error) => setNotice(error.message, 'warning'));
});

checkSession();
