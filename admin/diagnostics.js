import { fetchAdminAPI } from './api.js';
import { getDiagnosticsSnapshot, refreshDiagnosticsSnapshot } from './diagnostics-data.js';

let diagnosticsInitialized = false;
let refreshIndicatorTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function showRefreshIndicator() {
  const indicator = document.getElementById('diagnostics-refresh-indicator');
  if (!indicator) return;
  indicator.classList.add('refresh-indicator--visible');
  if (refreshIndicatorTimer) clearTimeout(refreshIndicatorTimer);
  refreshIndicatorTimer = setTimeout(() => {
    indicator.classList.remove('refresh-indicator--visible');
  }, 1200);
}

function ageLabel(generatedAt) {
  if (!generatedAt) return { stale: true, label: 'No snapshot generated yet.' };
  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) {
    return { stale: true, label: 'Snapshot timestamp is invalid.' };
  }
  const ageSeconds = Math.max(0, Math.round((Date.now() - generated.getTime()) / 1000));
  if (ageSeconds > 5400) {
    return {
      stale: true,
      label: `Snapshot is stale (${formatDuration(ageSeconds)} old).`,
    };
  }
  return {
    stale: false,
    label: `Snapshot updated ${formatDuration(ageSeconds)} ago.`,
  };
}

function renderBanner(snapshot, message = '') {
  const banner = document.getElementById('diagnosticsBanner');
  const snapshotTime = document.getElementById('diagnosticsSnapshotTime');
  if (!banner || !snapshotTime) return;

  if (!snapshot) {
    banner.className = 'diagnostics-banner diagnostics-banner--warning';
    banner.innerHTML = `
      <strong>Diagnostics snapshot unavailable.</strong>
      <span>${escapeHtml(message || 'Generate a snapshot to populate this panel.')}</span>
    `;
    snapshotTime.textContent = 'Snapshot: unavailable';
    return;
  }

  const age = ageLabel(snapshot.generatedAt);
  const status = age.stale ? 'warning' : String(snapshot.overallStatus || 'ok').toLowerCase();
  const summary = message || age.label;
  banner.className = `diagnostics-banner diagnostics-banner--${status}`;
  banner.innerHTML = `
    <strong>Overall status: ${escapeHtml(String(snapshot.overallStatus || 'ok').toUpperCase())}</strong>
    <span>${escapeHtml(summary)}</span>
  `;
  snapshotTime.textContent = `Snapshot: ${formatDate(snapshot.generatedAt)}`;
}

function renderHealth(snapshot) {
  const container = document.getElementById('diagnosticsHealth');
  if (!container) return;
  const checks = (snapshot?.health?.checks && Object.entries(snapshot.health.checks)) || [];
  if (!checks.length) {
    container.innerHTML = '<div class="warning">No health data available.</div>';
    return;
  }

  container.innerHTML = `
    <div class="health-checks">
      ${checks
        .map(
          ([name, item]) => `
            <div class="health-check">
              <div class="check-header">
                <span class="check-name">${escapeHtml(name.replace(/([A-Z])/g, ' $1').trim())}</span>
                <span class="status-pill status-pill--${escapeHtml(item.status || 'warning')}">${escapeHtml(item.status || 'warning')}</span>
              </div>
              <div class="check-details">${escapeHtml(item.message || '')}</div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderServices(snapshot) {
  const container = document.getElementById('diagnosticsServices');
  if (!container) return;
  const items = snapshot?.serviceStatus?.items || [];
  if (!items.length) {
    container.innerHTML = '<div class="warning">No service summary available.</div>';
    return;
  }

  container.innerHTML = `
    <div class="service-grid">
      ${items
        .map(
          (item) => `
            <div class="service-card">
              <div class="service-title">${escapeHtml(item.label || item.id || 'Service')}</div>
              <div class="service-status service-status--${escapeHtml(item.status || 'warning')}">${escapeHtml(item.status || 'warning')}</div>
              <div class="service-meta">${escapeHtml(item.summary || '')}</div>
              <div class="service-detail">${escapeHtml(item.details || '')}</div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderDatabase(snapshot) {
  const container = document.getElementById('diagnosticsDatabase');
  if (!container) return;
  const stats = snapshot?.databaseStats || {};
  const overview = snapshot?.databaseOverview || {};
  const users = stats.users || { total: 0, byRole: {} };
  const series = stats.series || { total: 0, published: 0, premiumOnly: 0 };
  const comments = stats.comments || { total: 0, approved: 0 };
  const database = overview.database || {};
  const alembic = overview.alembic || {};
  const connections = overview.connections || {};
  const tables = Array.isArray(overview.tables) ? overview.tables.slice(0, 8) : [];

  let html = `
    <div class="stats-grid">
      <div class="stat-card">
        <h4>Users</h4>
        <div class="stat-value">${users.total || 0}</div>
        <div class="stat-breakdown">
          <div>Regular: ${users.byRole?.user || 0}</div>
          <div>Premium: ${users.byRole?.premium || 0}</div>
          <div>Admin: ${users.byRole?.admin || 0}</div>
        </div>
      </div>
      <div class="stat-card">
        <h4>Series</h4>
        <div class="stat-value">${series.total || 0}</div>
        <div class="stat-breakdown">
          <div>Published: ${series.published || 0}</div>
          <div>Premium: ${series.premiumOnly || 0}</div>
        </div>
      </div>
      <div class="stat-card">
        <h4>Comments</h4>
        <div class="stat-value">${comments.total || 0}</div>
        <div class="stat-breakdown">
          <div>Approved: ${comments.approved || 0}</div>
          <div>Posts: ${stats.posts || 0}</div>
        </div>
      </div>
      <div class="stat-card">
        <h4>Database</h4>
        <div class="stat-value">${escapeHtml(database.sizePretty || 'Unknown')}</div>
        <div class="stat-breakdown">
          <div>${escapeHtml(database.name || 'Unknown DB')}</div>
          <div>Alembic: ${escapeHtml(alembic.version || 'unknown')}</div>
          <div>${escapeHtml(`${connections.active || 0} active / ${connections.idle || 0} idle`)}</div>
        </div>
      </div>
    </div>
  `;

  if (tables.length) {
    html += `
      <table class="db-table">
        <thead>
          <tr>
            <th>Table</th>
            <th>Rows</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          ${tables
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.name || '')}</td>
                  <td>${escapeHtml(String(row.rowsEstimate ?? 0))}</td>
                  <td>${escapeHtml(row.sizePretty || '')}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  container.innerHTML = html;
}

function renderDeploy(snapshot) {
  const container = document.getElementById('diagnosticsDeploy');
  if (!container) return;
  const deploy = snapshot?.deployStatus || {};
  const server = deploy.server || {};
  const git = deploy.git || {};
  const dist = deploy.dist || {};
  const releaseSnapshots = deploy.releaseSnapshots || {};
  const latestRelease = releaseSnapshots.latest || {};

  container.innerHTML = `
    <div class="deploy-grid">
      <div class="deploy-card">
        <div class="deploy-title">API Uptime</div>
        <div class="deploy-value">${escapeHtml(formatDuration(server.uptimeSeconds))}</div>
        <div class="deploy-meta">Started: ${escapeHtml(formatDate(server.startedAt))}</div>
      </div>
      <div class="deploy-card">
        <div class="deploy-title">Frontend Dist</div>
        <div class="deploy-value">${escapeHtml(dist.exists ? 'Present' : 'Missing')}</div>
        <div class="deploy-meta">Last build: ${escapeHtml(formatDate(dist.lastModified))}</div>
      </div>
      <div class="deploy-card">
        <div class="deploy-title">Git</div>
        <div class="deploy-value">${escapeHtml((git.commit || '').slice(0, 7) || 'Unknown')}</div>
        <div class="deploy-meta">${escapeHtml(git.ref || 'unknown ref')} · ${escapeHtml(git.status || 'unknown')}</div>
      </div>
      <div class="deploy-card">
        <div class="deploy-title">Release Snapshots</div>
        <div class="deploy-value">${escapeHtml(String(releaseSnapshots.count || 0))}</div>
        <div class="deploy-meta">${escapeHtml(latestRelease.name || 'No snapshot yet')}</div>
      </div>
    </div>
  `;
}

function renderBackups(snapshot) {
  const container = document.getElementById('diagnosticsBackups');
  if (!container) return;
  const backups = snapshot?.backups || {};
  const dbBackups = backups.db || [];
  const fileBackups = backups.files || [];
  const latestDb = backups.latest?.db;
  const latestFiles = backups.latest?.files;
  const jobs = backups.jobs || {};
  const freshness = backups.freshness || {};
  const counts = backups.validatedCounts || {};

  const renderCard = (title, kind, items, latest) => {
    const attempt = jobs[kind]?.lastAttempt;
    const freshnessState = freshness[kind];
    const validation = latest?.validation;
    return `
    <div class="backup-card">
      <div class="backup-title">${escapeHtml(title)}</div>
      <div class="backup-count">Validated ${Number(counts[kind === 'database' ? 'db' : 'files']) || items.length}</div>
      <div class="backup-meta-row">Latest: ${escapeHtml(latest?.name || 'None')}</div>
      <div class="backup-meta-row">${escapeHtml(latest?.createdAt ? formatDate(latest.createdAt) : 'No recent snapshot')}</div>
      <div class="backup-meta-row">${escapeHtml(latest?.sizePretty || '')}</div>
      <div class="backup-meta-row">Freshness: ${escapeHtml(freshnessState?.status || 'unknown')}${freshnessState?.ageHours != null ? ` · ${escapeHtml(String(freshnessState.ageHours))}h old` : ''}</div>
      <div class="backup-meta-row">Last attempt: ${escapeHtml(attempt?.status || 'unrecorded')}${attempt?.errorCode ? ` · ${escapeHtml(attempt.errorCode)}` : ''}</div>
      <div class="backup-meta-row">Validation: ${escapeHtml(validation?.method || 'unavailable')}</div>
      <div class="backup-meta-row">Source: ${escapeHtml(backups.source || 'unknown')}</div>
      <div class="backup-meta-row">Root: ${escapeHtml(backups.root || 'unknown')}</div>
    </div>
  `;
  };

  container.innerHTML = `
    <div class="backup-grid">
      ${renderCard('Database backups', 'database', dbBackups, latestDb)}
      ${renderCard('File backups', 'files', fileBackups, latestFiles)}
    </div>
    <div class="backup-note">
      ${escapeHtml(backups.message || '')} Ops handles creation and detailed backup history. Source: ${escapeHtml(backups.source || 'unknown')}. Backup root: ${escapeHtml(backups.root || 'unknown')}
    </div>
  `;
}

function renderTests(snapshot) {
  const container = document.getElementById('diagnosticsTests');
  if (!container) return;
  const testStatus = snapshot?.testStatus || {};
  const latestRun = testStatus.latestRun || null;

  container.innerHTML = `
    <div class="test-info">
      <p>Discovered tests: <strong>${testStatus.discoveredCount || 0}</strong></p>
      <p>Last run: <strong>${escapeHtml(latestRun?.status || 'idle')}</strong></p>
      <p>Finished: ${escapeHtml(latestRun?.finishedAt ? formatDate(latestRun.finishedAt) : 'No recorded run yet')}</p>
      <p>Exit code: ${escapeHtml(latestRun?.exitCode ?? 'n/a')}</p>
      <p>${testStatus.runnerEnabled ? 'Use /ops/ to run the suite.' : 'Command runner disabled; diagnostics still records the latest known result.'}</p>
    </div>
  `;
}

function renderLoadingState(message = 'Loading diagnostics snapshot...') {
  const targets = [
    'diagnosticsHealth',
    'diagnosticsServices',
    'diagnosticsDatabase',
    'diagnosticsDeploy',
    'diagnosticsBackups',
    'diagnosticsTests',
  ];
  targets.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="loading">${escapeHtml(message)}</div>`;
  });
}

function renderSnapshot(snapshot, message = '') {
  renderBanner(snapshot, message);
  renderHealth(snapshot);
  renderServices(snapshot);
  renderDatabase(snapshot);
  renderDeploy(snapshot);
  renderBackups(snapshot);
  renderTests(snapshot);
}

async function loadSnapshot(showLoading = false) {
  if (showLoading) renderLoadingState();
  showRefreshIndicator();
  try {
    const result = await getDiagnosticsSnapshot(fetchAdminAPI);
    renderSnapshot(result.snapshot, result.fallbackMessage);
  } catch (error) {
    const isMissing = /No diagnostics snapshot available/i.test(error.message || '');
    renderLoadingState('');
    renderBanner(null, isMissing ? error.message : `Failed to load snapshot: ${error.message}`);
  }
}

async function refreshSnapshot() {
  const button = /** @type {HTMLButtonElement | null} */ (
    document.getElementById('diagnostics-refresh')
  );
  if (button) button.disabled = true;
  showRefreshIndicator();
  try {
    const result = await refreshDiagnosticsSnapshot(fetchAdminAPI);
    renderSnapshot(result.snapshot, result.fallbackMessage || 'Snapshot refreshed.');
  } catch (error) {
    renderBanner(null, `Failed to refresh snapshot: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

export async function initDiagnostics() {
  const container = document.getElementById('diagnosticsSection');
  if (!container) return;

  if (!diagnosticsInitialized) {
    diagnosticsInitialized = true;
    const refreshBtn = document.getElementById('diagnostics-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', refreshSnapshot);
    }
  }

  await loadSnapshot(true);
}

window.initDiagnostics = initDiagnostics;
