/**
 * Diagnostics and Troubleshooting Panel
 * 
 * Displays system health, configuration, and allows running tests.
 */

import { fetchAdminAPI } from './api.js';

// Health check indicators
const healthIndicators = {
    ok: '✅',
    warning: '⚠️',
    error: '❌',
    info: 'ℹ️'
};

let diagnosticsInitialized = false;
let testSuites = [];
let opsCommands = [];
let opsRunnerEnabled = false;
let opsRunnerMessage = '';
let logStreamSource = null;
let activeOpsStream = null;
let refreshIndicatorTimer = null;
const opsRecoveryPending = new Set();
const OPS_RECOVERY_WINDOW_MS = 10 * 60 * 1000;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function showRefreshIndicator() {
    const indicator = document.getElementById('diagnostics-refresh-indicator');
    if (!indicator) return;
    indicator.classList.add('refresh-indicator--visible');
    if (refreshIndicatorTimer) {
        clearTimeout(refreshIndicatorTimer);
    }
    refreshIndicatorTimer = setTimeout(() => {
        indicator.classList.remove('refresh-indicator--visible');
    }, 1200);
}

function lockDiagnosticsBox(container) {
    if (!container || container.dataset.locked === 'true') return;
    const height = container.getBoundingClientRect().height;
    const minHeight = Math.max(120, Math.round(height));
    container.style.setProperty('--diagnostics-lock-height', `${minHeight}px`);
    container.classList.add('diagnostics-lock');
    container.dataset.locked = 'true';
}

function confirmDangerousAction(spec) {
    if (!spec?.dangerous) return true;
    const label = spec?.label ? `"${spec.label}"` : 'this action';
    const response = window.prompt(
        `This will overwrite data.\n\nType RESTORE to confirm ${label}.`,
        ''
    );
    return String(response || '').trim().toUpperCase() === 'RESTORE';
}

function captureScrollAnchor() {
    const scrollY = window.scrollY || 0;
    const probeY = Math.min(window.innerHeight - 1, 120);
    const probeX = Math.min(window.innerWidth - 1, Math.floor(window.innerWidth * 0.5));
    const element = document.elementFromPoint(probeX, probeY);
    const rect = element?.getBoundingClientRect();
    return {
        scrollY,
        element,
        top: rect?.top ?? null,
    };
}

function restoreScrollAnchor(anchor) {
    if (!anchor) return;
    if (anchor.element && document.contains(anchor.element) && anchor.top != null) {
        const rect = anchor.element.getBoundingClientRect();
        const delta = rect.top - anchor.top;
        if (Math.abs(delta) > 1) {
            window.scrollBy(0, delta);
            return;
        }
    }
    if (typeof anchor.scrollY === 'number') {
        window.scrollTo({ top: anchor.scrollY });
    }
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

function setLogsStatus(message, level = '') {
    const status = document.getElementById('logs-status');
    if (!status) return;
    status.textContent = message || '';
    status.className = 'logs-status';
    if (level) status.classList.add(`logs-status--${level}`);
}

function appendLogLine(line) {
    const output = document.getElementById('logs-output');
    if (!output) return;
    const next = `${output.textContent}${line}\n`;
    const maxChars = 200000;
    output.textContent = next.length > maxChars ? next.slice(-maxChars) : next;
    const autoScroll = /** @type {HTMLInputElement | null} */ (document.getElementById('logs-autoscroll'));
    if (autoScroll && autoScroll.checked) {
        output.scrollTop = output.scrollHeight;
    }
}

function appendOpsOutput(output, line) {
    if (!output) return;
    const next = `${output.textContent}${line}\n`;
    const maxChars = 200000;
    output.textContent = next.length > maxChars ? next.slice(-maxChars) : next;
    output.scrollTop = output.scrollHeight;
}

function closeActiveOpsStream() {
    if (!activeOpsStream) return;
    activeOpsStream.source.close();
    activeOpsStream.button.disabled = false;
    activeOpsStream.button.textContent = activeOpsStream.originalLabel;
    activeOpsStream = null;
}

function updateLogServiceOptions(services = []) {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('logs-service'));
    if (!select) return;
    const current = select.value || 'bwondercomics-api';
    const labelMap = {
        'bwondercomics-api': 'API',
        'bwondercomics-db': 'Database',
        'caddy': 'Caddy',
        'umami': 'Umami',
        'umami-db': 'Umami DB',
        'all': 'All services',
    };
    const unique = Array.from(new Set(services.filter(Boolean)));
    if (!unique.length) return;
    const options = unique.map((name) => ({
        value: name,
        label: labelMap[name] || name,
    }));
    options.push({ value: 'all', label: labelMap.all });
    select.innerHTML = '';
    options.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        select.appendChild(opt);
    });
    select.value = options.some((item) => item.value === current) ? current : options[0].value;
}

const fallbackOps = [
    {
        id: 'stack-up',
        group: 'Stack',
        label: 'Rebuild + restart stack',
        description: 'Build and start all services (API, DB, Caddy).',
        command: 'make up',
        disrupts_api: true
    },
    {
        id: 'stack-restart',
        group: 'Stack',
        label: 'Restart containers',
        description: 'Restart all running services without rebuilding.',
        command: 'make restart',
        disrupts_api: true
    },
    {
        id: 'stack-logs',
        group: 'Stack',
        label: 'Tail all logs',
        description: 'Stream logs from every container.',
        command: 'make logs'
    },
    {
        id: 'host-reboot',
        group: 'Host',
        label: 'Reboot host machine',
        description: 'Reboot the physical/VM host (last resort after container restart).',
        command: 'sudo shutdown -r now',
        disrupts_api: true,
        dangerous: true,
        available_message: 'Run on host: sudo shutdown -r now (not available inside container).'
    },
    {
        id: 'db-migrate',
        group: 'Backend / DB',
        label: 'Run DB migrations',
        description: 'Apply Alembic migrations inside the API container.',
        command: 'make migrate'
    },
    {
        id: 'api-logs',
        group: 'Backend / DB',
        label: 'API logs',
        description: 'Tail FastAPI logs only.',
        command: 'make api-logs'
    },
    {
        id: 'db-shell',
        group: 'Backend / DB',
        label: 'Open DB shell',
        description: 'Launch psql inside the DB container.',
        command: 'make psql'
    },
    {
        id: 'frontend-build',
        group: 'Frontend / Analytics',
        label: 'Save current build + rebuild',
        description: 'Save current dist/ as a snapshot, then rebuild static assets (admin + reader).',
        alias: 'npm run build',
        command: 'sh scripts/frontend-build.sh',
        streamable: true
    },
    {
        id: 'frontend-rollback',
        group: 'Frontend / Analytics',
        label: 'Restore last saved build',
        description: 'Restore the most recent snapshot and save the current build as a rollback backup.',
        command: 'sh scripts/frontend-rollback.sh',
        streamable: true
    },
    {
        id: 'frontend-restore-rollback',
        group: 'Frontend / Analytics',
        label: 'Restore last rollback backup',
        description: 'Restore the build that was saved when you last ran a rollback.',
        command: 'sh scripts/frontend-restore-rollback.sh',
        streamable: true
    },
    {
        id: 'analytics-up',
        group: 'Frontend / Analytics',
        label: 'Start stack with Umami',
        description: 'Bring up analytics containers alongside the main stack.',
        command: 'make up-analytics',
        disrupts_api: true
    },
    {
        id: 'analytics-logs',
        group: 'Frontend / Analytics',
        label: 'Tail Umami logs',
        description: 'Stream analytics container logs.',
        command: 'make analytics-logs'
    },
    {
        id: 'backup-all',
        group: 'Backups',
        label: 'Create backup (DB + files)',
        description: 'Write new backups into var/backups.',
        command: 'make backup',
        streamable: true
    },
    {
        id: 'backup-db',
        group: 'Backups',
        label: 'Backup database only',
        description: 'Create a database-only backup in var/backups.',
        command: 'make backup-db',
        streamable: true
    },
    {
        id: 'backup-files',
        group: 'Backups',
        label: 'Backup files only',
        description: 'Create a files-only backup in var/backups.',
        command: 'make backup-files',
        streamable: true
    },
    {
        id: 'restore-db-latest',
        group: 'Backups',
        label: 'Restore latest DB backup',
        description: 'Restore the most recent database backup (destructive).',
        command: 'make restore-db FILE=var/backups/db-YYYYMMDD-HHMMSS.sql CONFIRM=1',
        streamable: true,
        dangerous: true
    },
    {
        id: 'restore-files-latest',
        group: 'Backups',
        label: 'Restore latest files backup',
        description: 'Restore the most recent files backup (destructive).',
        command: 'make restore-files FILE=var/backups/files-YYYYMMDD-HHMMSS.tar.gz CONFIRM=1',
        streamable: true,
        dangerous: true
    }
];

export async function initDiagnostics() {
    const container = document.getElementById('diagnosticsSection');
    if (!container) return;

    if (!diagnosticsInitialized) {
        diagnosticsInitialized = true;
        // Set up refresh button
        const refreshBtn = document.getElementById('diagnostics-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', refreshAllDiagnostics);
        }

        // Set up run tests button
        const runTestsBtn = document.getElementById('run-tests-btn');
        if (runTestsBtn) {
            runTestsBtn.addEventListener('click', () => runTests());
        }

        const logsStart = document.getElementById('logs-start');
        const logsStop = document.getElementById('logs-stop');
        const logsClear = document.getElementById('logs-clear');
        if (logsStart) logsStart.addEventListener('click', startLogStream);
        if (logsStop) logsStop.addEventListener('click', stopLogStream);
        if (logsClear) logsClear.addEventListener('click', () => {
            const output = document.getElementById('logs-output');
            if (output) output.textContent = '';
        });
    }

    // Initial load
    await refreshAllDiagnostics();
}

async function refreshAllDiagnostics() {
    showRefreshIndicator();
    loadOperations();
    loadOpsHistory();
    await Promise.all([
        loadSystemHealth(),
        loadDatabaseStats(),
        loadDbInsights(),
        loadDeployStatus(),
        loadBackups(),
        loadServiceStatus(),
        loadTestStatus(),
        loadConfiguration()
    ]);
}

async function loadSystemHealth() {
    const container = document.getElementById('health-status');
    if (!container) return;

    const anchor = captureScrollAnchor();
    container.innerHTML = '<div class="loading">Loading health status...</div>';

    try {
        const health = await fetchAdminAPI('/api/admin/diagnostics/health');

        const statusClass = health.status === 'healthy' ? 'status-ok' : 'status-warning';

        let html = `
      <div class="health-summary ${statusClass}">
        <h3>System Status: ${health.status.toUpperCase()}</h3>
        <p class="timestamp">Last checked: ${new Date(health.timestamp).toLocaleString()}</p>
      </div>
      <div class="health-checks">
    `;

        for (const [check, result] of Object.entries(health.checks)) {
            const indicator = healthIndicators[result.status] || '❓';
            html += `
        <div class="health-check">
          <div class="check-header">
            <span class="indicator">${indicator}</span>
            <span class="check-name">${check.replace(/_/g, ' ').toUpperCase()}</span>
          </div>
          <div class="check-details">
            ${result.message || Object.entries(result).filter(([k]) => k !== 'status').map(([k, v]) =>
                `<div><strong>${k}:</strong> ${v}</div>`
            ).join('')}
          </div>
        </div>
      `;
        }

        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="error">Failed to load health status: ${error.message}</div>`;
    } finally {
        lockDiagnosticsBox(container);
        requestAnimationFrame(() => restoreScrollAnchor(anchor));
    }
}

async function loadDatabaseStats() {
    const container = document.getElementById('database-stats');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading database stats...</div>';

    try {
        const stats = await fetchAdminAPI('/api/admin/diagnostics/database-stats');

        let html = '<div class="stats-grid">';

        // Users
        html += `
      <div class="stat-card">
        <h4>Users</h4>
        <div class="stat-value">${stats.users.total}</div>
        <div class="stat-breakdown">
          <div>Regular: ${stats.users.by_role.user || 0}</div>
          <div>Premium: ${stats.users.by_role.premium || 0}</div>
          <div>Admin: ${stats.users.by_role.admin || 0}</div>
        </div>
      </div>
    `;

        // Series
        html += `
      <div class="stat-card">
        <h4>Series</h4>
        <div class="stat-value">${stats.series.total}</div>
        <div class="stat-breakdown">
          <div>Published: ${stats.series.published}</div>
          <div>Premium: ${stats.series.premium_only}</div>
        </div>
      </div>
    `;

        // Comments
        html += `
      <div class="stat-card">
        <h4>Comments</h4>
        <div class="stat-value">${stats.comments.total}</div>
        <div class="stat-breakdown">
          <div>Approved: ${stats.comments.approved}</div>
        </div>
      </div>
    `;

        // Premium Codes
        html += `
      <div class="stat-card">
        <h4>Premium Codes</h4>
        <div class="stat-value">${stats.premium_codes.total}</div>
        <div class="stat-breakdown">
          <div>Active: ${stats.premium_codes.active}</div>
        </div>
      </div>
    `;

        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="error">Failed to load database stats: ${error.message}</div>`;
    } finally {
        lockDiagnosticsBox(container);
    }
}

async function loadDbInsights() {
    const container = document.getElementById('db-insights');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading database overview...</div>';

    try {
        const payload = await fetchAdminAPI('/api/admin/diagnostics/db-insights');
        const database = payload.database || {};
        const connections = payload.connections || {};
        const alembic = payload.alembic || {};
        const tables = Array.isArray(payload.tables) ? payload.tables : [];

        const dbName = database.name || 'Unknown';
        const dbVersion = database.version || 'Unknown';
        const sizePretty = database.size_pretty || 'Unknown';
        const alembicVersion = alembic.version || 'Unknown';

        const connectionLabel = `${connections.active || 0} active / ${connections.idle || 0} idle`;
        const connectionMeta = `Total: ${connections.total || 0} / Max: ${connections.max || 0}`;

        let html = `
      <div class="db-grid">
        <div class="db-card">
          <div class="db-title">Database</div>
          <div class="db-value">${escapeHtml(dbName)}</div>
          <div class="db-meta">${escapeHtml(dbVersion)}</div>
        </div>
        <div class="db-card">
          <div class="db-title">Size</div>
          <div class="db-value">${escapeHtml(sizePretty)}</div>
          <div class="db-meta">Current database size</div>
        </div>
        <div class="db-card">
          <div class="db-title">Connections</div>
          <div class="db-value">${escapeHtml(connectionLabel)}</div>
          <div class="db-meta">${escapeHtml(connectionMeta)}</div>
        </div>
        <div class="db-card">
          <div class="db-title">Alembic</div>
          <div class="db-value">${escapeHtml(alembicVersion)}</div>
          <div class="db-meta">Migration version</div>
        </div>
      </div>
    `;

        if (tables.length) {
            html += `
        <table class="db-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Rows (est)</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            ${tables
                .map(
                    (row) => `
              <tr>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(String(row.rows_estimate ?? 0))}</td>
                <td>${escapeHtml(row.size_pretty || '')}</td>
              </tr>
            `
                )
                .join('')}
          </tbody>
        </table>
      `;
        } else {
            html += `<div class="warning">${healthIndicators.warning} No table stats available.</div>`;
        }

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="error">Failed to load database overview: ${error.message}</div>`;
    } finally {
        lockDiagnosticsBox(container);
    }
}

async function loadDeployStatus() {
    const container = document.getElementById('deploy-status');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading deployment status...</div>';

    try {
        const payload = await fetchAdminAPI('/api/admin/diagnostics/deploy-status');
        const server = payload.server || {};
        const dist = payload.dist || {};
        const git = payload.git || {};
        const snapshots = payload.snapshots || {};

        const startedAt = server.started_at ? new Date(server.started_at).toLocaleString() : 'Unknown';
        const uptime = server.uptime_seconds != null ? formatDuration(server.uptime_seconds) : 'Unknown';
        const distUpdated = dist.last_modified ? new Date(dist.last_modified).toLocaleString() : 'Unknown';
        const distStatus = dist.exists ? 'Present' : 'Missing';

        const ref = typeof git.ref === 'string' ? git.ref.replace('refs/heads/', '') : '';
        const commitShort = typeof git.commit === 'string' ? git.commit.slice(0, 7) : '';
        const commitLabel = commitShort ? `${commitShort}${ref ? ` (${ref})` : ''}` : 'Not available';

        const manifestLabel = dist.manifest ? dist.manifest : 'Not found';
        const snapshotCount = snapshots.count ?? 0;
        const latestSnapshot = snapshots.latest || {};
        const snapshotMeta = latestSnapshot.created_at
            ? `Latest: ${new Date(latestSnapshot.created_at).toLocaleString()}${latestSnapshot.size_pretty ? ` (${latestSnapshot.size_pretty})` : ''}`
            : 'Run a build to create a snapshot';

        container.innerHTML = `
      <div class="deploy-grid">
        <div class="deploy-card">
          <div class="deploy-title">API Uptime</div>
          <div class="deploy-value">${escapeHtml(uptime)}</div>
          <div class="deploy-meta">Started: ${escapeHtml(startedAt)}</div>
        </div>
        <div class="deploy-card">
          <div class="deploy-title">Frontend Build</div>
          <div class="deploy-value">${escapeHtml(distStatus)}</div>
          <div class="deploy-meta">Last build: ${escapeHtml(distUpdated)}</div>
        </div>
        <div class="deploy-card">
          <div class="deploy-title">Build Manifest</div>
          <div class="deploy-value">${escapeHtml(manifestLabel)}</div>
          <div class="deploy-meta">dist/assets</div>
        </div>
        <div class="deploy-card">
          <div class="deploy-title">Git Commit</div>
          <div class="deploy-value">${escapeHtml(commitLabel)}</div>
          <div class="deploy-meta">Repo state</div>
        </div>
        <div class="deploy-card">
          <div class="deploy-title">Rollback Snapshot</div>
          <div class="deploy-value">${escapeHtml(snapshotCount ? `${snapshotCount} saved` : 'None')}</div>
          <div class="deploy-meta">${escapeHtml(snapshotMeta)}</div>
        </div>
      </div>
    `;
    } catch (error) {
        container.innerHTML = `<div class="error">Failed to load deployment status: ${error.message}</div>`;
    } finally {
        lockDiagnosticsBox(container);
    }
}

async function loadBackups() {
    const container = document.getElementById('backups-status');
    if (!container) return;

    const anchor = captureScrollAnchor();
    container.innerHTML = '<div class="loading">Loading backups...</div>';

    try {
        const payload = await fetchAdminAPI('/api/admin/diagnostics/backups');
        const dbBackups = Array.isArray(payload.db) ? payload.db : [];
        const fileBackups = Array.isArray(payload.files) ? payload.files : [];
        const rootPath = payload.root || 'var/backups';

        const renderList = (items) => {
            if (!items.length) {
                return '<div class="backup-empty">No backups yet.</div>';
            }
            const slice = items.slice(0, 6);
            return `
        <ul class="backup-list">
          ${slice
                .map(
                    (item) => `
            <li>
              <div class="backup-name">${escapeHtml(item.name)}</div>
              <div class="backup-meta-row">${escapeHtml(new Date(item.created_at).toLocaleString())} · ${escapeHtml(item.size_pretty || '')}</div>
            </li>
          `
                )
                .join('')}
        </ul>
      `;
        };

        container.innerHTML = `
      <div class="backup-grid">
        <div class="backup-card">
          <div class="backup-title">Database backups</div>
          <div class="backup-count">Found ${dbBackups.length}</div>
          ${renderList(dbBackups)}
        </div>
        <div class="backup-card">
          <div class="backup-title">Files backups</div>
          <div class="backup-count">Found ${fileBackups.length}</div>
          ${renderList(fileBackups)}
        </div>
      </div>
      <div class="backup-note">Backups live in ${escapeHtml(rootPath)}. Use Operations → Backups to create or restore.</div>
    `;
    } catch (error) {
        container.innerHTML = `<div class="error">Failed to load backups: ${error.message}</div>`;
    } finally {
        lockDiagnosticsBox(container);
        requestAnimationFrame(() => restoreScrollAnchor(anchor));
    }
}

async function loadServiceStatus() {
    const container = document.getElementById('service-status');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading service status...</div>';

    try {
        const payload = await fetchAdminAPI('/api/admin/diagnostics/service-status');
        const services = Array.isArray(payload.services) ? payload.services : [];

        if (!services.length) {
            container.innerHTML = `<div class="warning">${healthIndicators.warning} No service status available.</div>`;
            return;
        }

        const serviceNames = services.map((item) => item.service).filter(Boolean);
        updateLogServiceOptions(serviceNames);

        let html = '<div class="service-grid">';
        services.forEach((service) => {
            const state = String(service.state || '').toLowerCase();
            const status = String(service.status || '').trim();
            let statusClass = 'service-status--warn';
            if (state.includes('running') || status.toLowerCase().includes('up')) {
                statusClass = 'service-status--ok';
            } else if (state.includes('exit') || state.includes('dead') || status.toLowerCase().includes('exited')) {
                statusClass = 'service-status--error';
            }

            html += `
        <div class="service-card">
          <div class="service-title">${escapeHtml(service.service || service.name || 'Service')}</div>
          <div class="service-meta">${escapeHtml(service.name || '')}</div>
          <div class="service-status ${statusClass}">${escapeHtml(status || service.state || 'Unknown')}</div>
        </div>
      `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="warning">${healthIndicators.warning} ${escapeHtml(error.message)}</div>`;
    } finally {
        lockDiagnosticsBox(container);
    }
}

function startLogStream() {
    const startBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('logs-start'));
    const stopBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('logs-stop'));
    const serviceSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('logs-service'));
    const tailInput = /** @type {HTMLInputElement | null} */ (document.getElementById('logs-tail'));
    if (!startBtn || !stopBtn || !serviceSelect || !tailInput) return;

    stopLogStream();

    const service = serviceSelect.value || 'bwondercomics-api';
    const tail = Math.max(0, Math.min(1000, parseInt(tailInput.value || '200', 10) || 200));

    const params = new URLSearchParams({
        service,
        tail: String(tail),
        follow: '1',
    });
    const url = `/api/admin/diagnostics/logs-stream?${params.toString()}`;

    setLogsStatus('Connecting...', 'warn');
    startBtn.disabled = true;
    stopBtn.disabled = false;

    const source = new EventSource(url);
    logStreamSource = source;

    source.addEventListener('meta', (event) => {
        try {
            const meta = JSON.parse(event.data || '{}');
            const label = meta.service ? meta.service.replace('bwondercomics-', '') : service;
            setLogsStatus(`Streaming ${label} logs...`, 'ok');
        } catch {
            setLogsStatus('Streaming logs...', 'ok');
        }
    });

    source.onmessage = (event) => {
        if (event?.data) {
            appendLogLine(event.data);
        }
    };

    source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) {
            setLogsStatus('Disconnected. Press Start to reconnect.', 'error');
            startBtn.disabled = false;
            stopBtn.disabled = true;
        } else {
            setLogsStatus('Connection lost. Reconnecting...', 'warn');
        }
    };
}

function stopLogStream() {
    const startBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('logs-start'));
    const stopBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('logs-stop'));
    if (logStreamSource) {
        logStreamSource.close();
        logStreamSource = null;
    }
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    setLogsStatus('Stopped.', '');
}

async function loadTestStatus() {
    const container = document.getElementById('test-status');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading test status...</div>';

    try {
        const status = await fetchAdminAPI('/api/admin/diagnostics/test-status');
        testSuites = Array.isArray(status.suites) ? status.suites : [];

        if (!status.available) {
            container.innerHTML = `<div class="warning">${healthIndicators.warning} ${status.message || 'No tests found.'}</div>`;
            return;
        }

        const runnableSuites = testSuites.filter((suite) => suite.runner_available && suite.available);
        let html = `
      <div class="test-info">
        <p>${healthIndicators.ok} Tests discovered: <strong>${status.count || 0} files</strong></p>
      </div>
      <div class="test-suite-actions">
        <button id="run-all-tests-btn" class="btn-primary" ${runnableSuites.length ? '' : 'disabled'}>
          ▶️ Run All Available Suites
        </button>
        <span class="test-suite-note">Runs each available suite one at a time.</span>
      </div>
      <div class="test-suite-grid">
    `;

        html += testSuites.map((suite) => renderTestSuiteCard(suite)).join('');
        html += '</div>';
        container.innerHTML = html;

        const runAllBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('run-all-tests-btn'));
        if (runAllBtn) {
            runAllBtn.addEventListener('click', () => runAllTests(runnableSuites));
        }

        container.querySelectorAll('[data-suite][data-action="run"]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const target = event.currentTarget;
                if (!(target instanceof HTMLElement)) return;
                const suiteId = target.getAttribute('data-suite');
                if (suiteId) runTests(suiteId);
            });
        });
    } catch (error) {
        container.innerHTML = `<div class="error">Failed to load test status: ${error.message}</div>`;
    } finally {
        lockDiagnosticsBox(container);
    }
}

function renderTestSuiteCard(suite) {
    const availableIcon = suite.available ? healthIndicators.ok : healthIndicators.warning;
    const runnerIcon = suite.runner_available ? healthIndicators.ok : healthIndicators.error;
    const runnerMessage = suite.runner_message || (suite.runner_available ? 'Runner available' : 'Runner not available');
    const runDisabled = !suite.runner_available || !suite.available;

    return `
      <div class="test-suite-card">
        <div class="test-suite-header">
          <div>
            <div class="test-suite-title">${suite.label || suite.id}</div>
            <div class="test-suite-desc">${suite.description || ''}</div>
          </div>
          <div class="test-suite-status">${availableIcon}</div>
        </div>
        <div class="test-suite-meta">
          <div>Tests: <strong>${suite.count || 0}</strong></div>
          <div>Runner: ${runnerIcon} ${runnerMessage}</div>
        </div>
        <div class="test-suite-actions">
          <button class="btn-primary" data-suite="${suite.id}" data-action="run" ${runDisabled ? 'disabled' : ''}>
            ▶️ Run ${suite.label || suite.id}
          </button>
        </div>
        <div class="test-files">
          <strong>Files:</strong>
          <ul>
            ${(suite.test_files || []).map((file) => `<li>${file}</li>`).join('')}
          </ul>
        </div>
        <div id="test-results-${suite.id}" class="test-results"></div>
      </div>
    `;
}

async function loadConfiguration() {
    const container = document.getElementById('configuration');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading configuration...</div>';

    try {
        const config = await fetchAdminAPI('/api/admin/diagnostics/config');

        let html = '<div class="config-list">';
        for (const [key, value] of Object.entries(config.config)) {
            html += `
        <div class="config-item">
          <span class="config-key">${key}:</span>
          <span class="config-value">${value}</span>
        </div>
      `;
        }
        html += '</div>';

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="error">Failed to load configuration: ${error.message}</div>`;
    } finally {
        lockDiagnosticsBox(container);
    }
}

async function runTests(suiteId = 'backend') {
    const resultsContainer = document.getElementById(`test-results-${suiteId}`);
    const runBtn = /** @type {HTMLButtonElement | null} */ (
        document.querySelector(`[data-suite="${suiteId}"][data-action="run"]`)
    );

    if (!resultsContainer) return;

    if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = '⏳ Running tests...';
    }
    resultsContainer.innerHTML = '<div class="loading">Executing test suite... This may take a minute.</div>';

    try {
        const result = await fetchAdminAPI('/api/admin/diagnostics/run-tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suite: suiteId })
        });

        const statusClass = result.success ? 'test-success' : 'test-failure';
        const statusIcon = result.success ? '✅' : '❌';

        let html = `
      <div class="test-result ${statusClass}">
        <h4>${statusIcon} Test Results - ${suiteId} (Exit Code: ${result.exit_code})</h4>
        <div class="test-output">
          <h5>Output:</h5>
          <pre>${result.stdout || 'No output'}</pre>
          ${result.stderr ? `
            <h5>Errors:</h5>
            <pre class="test-errors">${result.stderr}</pre>
          ` : ''}
        </div>
      </div>
    `;

        resultsContainer.innerHTML = html;
        return result.success;
    } catch (error) {
        resultsContainer.innerHTML = `
      <div class="test-result test-failure">
        <h4>❌ Test Execution Failed</h4>
        <p>${error.message}</p>
      </div>
    `;
        return false;
    } finally {
        if (runBtn) {
            const suite = testSuites.find((item) => item.id === suiteId);
            runBtn.textContent = suite ? `▶️ Run ${suite.label || suite.id}` : '▶️ Run Tests';
            runBtn.disabled = false;
        }
    }
}

async function runAllTests(suites) {
    const runAllBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('run-all-tests-btn'));
    if (runAllBtn) {
        runAllBtn.disabled = true;
        runAllBtn.textContent = '⏳ Running suites...';
    }

    for (const suite of suites) {
        await runTests(suite.id);
    }

    if (runAllBtn) {
        runAllBtn.disabled = false;
        runAllBtn.textContent = '▶️ Run All Available Suites';
    }
}

function loadOperations() {
    const container = document.getElementById('ops-commands');
    if (!container) return;

    closeActiveOpsStream();
    container.innerHTML = '<div class="loading">Loading operations...</div>';

    fetchAdminAPI('/api/admin/diagnostics/ops')
        .then((payload) => {
            opsCommands = Array.isArray(payload.commands) ? payload.commands : [];
            opsRunnerEnabled = payload.enabled === true;
            opsRunnerMessage = payload.message || '';
            renderOperations(container, opsCommands, opsRunnerEnabled, opsRunnerMessage);
        })
        .catch((error) => {
            opsCommands = fallbackOps;
            opsRunnerEnabled = false;
            opsRunnerMessage = error.message || 'Operations runner unavailable.';
            renderOperations(container, opsCommands, opsRunnerEnabled, opsRunnerMessage);
        });
}

function loadOpsHistory() {
    const container = document.getElementById('ops-history');
    if (!container) return;

    const anchor = captureScrollAnchor();
    container.innerHTML = '<div class="loading">Loading operations history...</div>';

    showRefreshIndicator();
    fetchAdminAPI('/api/admin/diagnostics/ops-history')
        .then((payload) => {
            const runs = Array.isArray(payload.runs) ? payload.runs : [];
            renderOpsHistory(container, runs);
            requestAnimationFrame(() => restoreScrollAnchor(anchor));
        })
        .catch((error) => {
            const message = error?.message || 'Unable to load history.';
            container.innerHTML = `<div class="warning">${healthIndicators.warning} ${escapeHtml(message)}</div>`;
            requestAnimationFrame(() => restoreScrollAnchor(anchor));
            lockDiagnosticsBox(container);
        });
}

function isRecentOpsRun(run) {
    if (!run?.started_at) return false;
    const startedAt = Date.parse(run.started_at);
    if (Number.isNaN(startedAt)) return false;
    return Date.now() - startedAt < OPS_RECOVERY_WINDOW_MS;
}

function renderOpsHistory(container, runs) {
    if (!runs.length) {
        container.innerHTML = '<div class="warning">No operations recorded yet.</div>';
        lockDiagnosticsBox(container);
        return;
    }

    let html = '<div class="ops-history-grid">';
    runs.forEach((run) => {
        const status = String(run.status || 'unknown').toLowerCase();
        const recovering = status === 'interrupted' && run.disrupts_api && isRecentOpsRun(run);
        const statusLabel = status === 'success'
            ? 'Success'
            : status === 'running'
                ? 'Running'
                : status === 'failed'
                    ? 'Failed'
                    : recovering
                        ? 'Restarting'
                        : status === 'interrupted'
                            ? 'Interrupted'
                            : 'Error';
        const statusClass = status === 'success'
            ? 'ops-history-status--ok'
            : status === 'running' || recovering
                ? 'ops-history-status--running'
                : status === 'interrupted'
                    ? 'ops-history-status--interrupted'
                    : 'ops-history-status--fail';
        const statusSpinner = status === 'running' || recovering
            ? '<span class="ops-history-spinner" aria-hidden="true"></span>'
            : '';
        const title = escapeHtml(run.label || run.command_id || 'Operation');
        const startedAt = run.started_at ? new Date(run.started_at).toLocaleString() : 'Unknown';
        const duration = run.duration_seconds != null ? `${run.duration_seconds}s` : '—';
        const userLabel = run.user_email ? `By ${escapeHtml(run.user_email)}` : 'By admin';
        const output = escapeHtml(run.output || '');
        const outputNote = run.output_truncated ? '<div class="ops-history-note">Output truncated.</div>' : '';
        const hasOutput = output.length > 0;
        const noteMessage = status === 'success' && run.error_message
            ? `<div class="ops-history-note">${escapeHtml(run.error_message)}</div>`
            : '';
        const errorMessage = status !== 'success' && run.error_message
            ? `<div class="ops-history-error">${escapeHtml(run.error_message)}</div>`
            : '';

        html += `
      <div class="ops-history-card" data-run-id="${escapeHtml(run.id)}">
        <div class="ops-history-header">
          <div class="ops-history-title">${title}</div>
          <div class="ops-history-status ${statusClass}">${statusSpinner}${statusLabel}</div>
        </div>
        <div class="ops-history-meta">
          <span>Started: ${escapeHtml(startedAt)}</span>
          <span>Duration: ${escapeHtml(duration)}</span>
          <span>${userLabel}</span>
        </div>
        ${errorMessage}
        ${noteMessage}
        <div class="ops-history-actions">
          <button class="btn-secondary ops-history-toggle" data-run-id="${run.id}" ${hasOutput ? '' : 'disabled'}>
            ${hasOutput ? 'Show output' : 'No output'}
          </button>
          <button class="btn-secondary ops-history-copy" data-run-id="${run.id}" ${hasOutput ? '' : 'disabled'}>Copy output</button>
        </div>
        ${outputNote}
        <pre class="ops-history-output" id="ops-history-output-${run.id}">${output}</pre>
      </div>
    `;
    });
    html += '</div>';

    container.innerHTML = html;
    lockDiagnosticsBox(container);

    runs.forEach((run) => {
        if (run.status === 'interrupted' && run.disrupts_api && isRecentOpsRun(run)) {
            confirmOpsRecovery(run.id);
        }
    });

    container.querySelectorAll('.ops-history-toggle').forEach((button) => {
        button.addEventListener('click', (event) => {
            const target = event.currentTarget;
            if (!(target instanceof HTMLElement)) return;
            const runId = target.getAttribute('data-run-id');
            if (!runId) return;
            const output = document.getElementById(`ops-history-output-${runId}`);
            if (!output) return;
            output.classList.toggle('ops-history-output--visible');
            target.textContent = output.classList.contains('ops-history-output--visible') ? 'Hide output' : 'Show output';
        });
    });

    container.querySelectorAll('.ops-history-copy').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const target = event.currentTarget;
            if (!(target instanceof HTMLElement)) return;
            const runId = target.getAttribute('data-run-id');
            if (!runId) return;
            const output = document.getElementById(`ops-history-output-${runId}`);
            if (!output) return;
            try {
                await navigator.clipboard.writeText(output.textContent || '');
                target.textContent = 'Copied';
            } catch (err) {
                target.textContent = 'Copy failed';
            } finally {
                setTimeout(() => {
                    target.textContent = 'Copy output';
                }, 1500);
            }
        });
    });
}

function renderOperations(container, commands, runnerEnabled, runnerMessage) {
    const groupMap = new Map();
    commands.forEach((cmd) => {
        const group = cmd.group || 'Other';
        if (!groupMap.has(group)) groupMap.set(group, []);
        groupMap.get(group).push(cmd);
    });

    let html = '<p class="ops-note">Run these from the repo root (where the Makefile lives).</p>';
    if (!runnerEnabled) {
        const safeMessage = escapeHtml(runnerMessage || 'Command runner disabled.');
        html += `<div class="warning">${healthIndicators.warning} ${safeMessage}</div>`;
    }

    for (const [group, items] of groupMap.entries()) {
        const groupLabel = escapeHtml(group);
        const groupLower = String(group || '').toLowerCase();
        html += `<div class="ops-group"><h4>${groupLabel}</h4>`;
        if (groupLower.includes('stack')) {
            html += `
        <div class="ops-help">
          <strong>Restart order:</strong>
          Restart containers first. If the API is still unhealthy, reboot the host machine.
        </div>
      `;
        }
        if (groupLower.includes('frontend')) {
            html += `
        <div class="ops-help">
          <strong>Quick guide:</strong>
          Save current build + rebuild = save a snapshot, then rebuild.
          Restore last saved build = restore snapshot and save current as rollback backup.
          Restore last rollback backup = restore the build saved by rollback.
        </div>
      `;
        }
        html += '<div class="ops-grid">';
        items.forEach((item) => {
            const available = item.available !== false;
            const canRun = runnerEnabled && available;
            let availability = item.available_message || (available ? 'Ready to run' : 'Unavailable');
            if (item.disrupts_api && canRun) {
                availability = `${availability} - Restarts API`;
            }
            if (item.streamable && canRun) {
                availability = `${availability} - Live output`;
            }
            if (item.dangerous && canRun) {
                availability = `${availability} - Destructive`;
            }
            availability = escapeHtml(availability);
            const safeLabel = escapeHtml(item.label);
            const safeDesc = escapeHtml(item.description);
            const safeCommand = escapeHtml(item.command);
            const alias = item.alias ? `<div class="ops-alias">Terminal: <code>${escapeHtml(item.alias)}</code></div>` : '';
            const runLabel = item.streamable ? 'Run (Live)' : 'Run';
            html += `
        <div class="ops-card">
          <div class="ops-title">${safeLabel}</div>
          <div class="ops-desc">${safeDesc}</div>
          ${alias}
          <div class="ops-meta">${availability}</div>
          <pre class="ops-command">${safeCommand}</pre>
          <div class="ops-actions">
            <button class="btn-primary ops-run" data-op-id="${item.id}" ${canRun ? '' : 'disabled'}>${runLabel}</button>
            <button class="btn-secondary ops-copy" data-op-id="${item.id}">Copy</button>
            <span class="ops-copy-status" data-status-for="${item.id}"></span>
          </div>
          <pre class="ops-output" id="ops-output-${item.id}"></pre>
        </div>
      `;
        });
        html += '</div></div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('.ops-copy').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const target = event.currentTarget;
            if (!(target instanceof HTMLButtonElement)) return;
            const opId = target.getAttribute('data-op-id');
            if (!opId) return;
            await copyCommand(opId, target);
        });
    });

    container.querySelectorAll('.ops-run').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const target = event.currentTarget;
            if (!(target instanceof HTMLButtonElement)) return;
            const opId = target.getAttribute('data-op-id');
            if (!opId) return;
            await runOperation(opId, target);
        });
    });
}

function getOperationCommand(opId) {
    const match = opsCommands.find((item) => item.id === opId);
    return match?.command || '';
}

function getOperationSpec(opId) {
    return opsCommands.find((item) => item.id === opId) || null;
}

async function copyCommand(opId, button) {
    const command = getOperationCommand(opId);
    if (!command) {
        showCopyStatus(button, 'Command unavailable');
        return;
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(command);
        } else {
            const helper = document.createElement('textarea');
            helper.value = command;
            helper.style.position = 'fixed';
            helper.style.opacity = '0';
            document.body.appendChild(helper);
            helper.select();
            document.execCommand('copy');
            document.body.removeChild(helper);
        }
        showCopyStatus(button, 'Copied');
    } catch (err) {
        showCopyStatus(button, 'Copy failed');
    }
}

function showCopyStatus(button, message) {
    const opId = button.getAttribute('data-op-id');
    if (!opId) return;
    const status = button.parentElement?.querySelector(`[data-status-for="${opId}"]`);
    if (status) {
        status.textContent = message;
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    }
}

async function runOperation(opId, button) {
    const output = document.getElementById(`ops-output-${opId}`);
    if (!output) return;

    const spec = getOperationSpec(opId);
    if (!confirmDangerousAction(spec)) {
        output.classList.add('ops-output--visible');
        output.textContent = 'Canceled.';
        return;
    }
    if (spec?.streamable) {
        runOperationStream(opId, button, output, spec);
        return;
    }

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Running...';
    output.classList.add('ops-output--visible');
    output.textContent = 'Executing...';

    try {
        const result = await fetchAdminAPI('/api/admin/diagnostics/run-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: opId })
        });

        const lines = [
            `Command: ${result.command}`,
            `Exit code: ${result.exit_code}`,
            `Duration: ${result.duration_seconds}s`,
            '',
            result.stdout || '(no stdout)',
        ];
        if (result.stderr) {
            lines.push('', '--- stderr ---', result.stderr);
        }
        if (result.stdout_truncated || result.stderr_truncated) {
            lines.push('', 'Output truncated.');
        }
        output.textContent = lines.join('\n');
    } catch (error) {
        const message = error?.message || 'Request failed';
        if (spec?.disrupts_api && /NetworkError|Failed to fetch/i.test(message)) {
            output.textContent = 'Command dispatched. The API is restarting; confirming recovery...';
            const recovered = await waitForApiRecovery(output);
            if (recovered) {
                loadSystemHealth();
            }
            return;
        }
        output.textContent = `Failed: ${message}`;
    } finally {
        button.disabled = false;
        button.textContent = originalLabel;
        loadOpsHistory();
    }
}

function runOperationStream(opId, button, output, spec) {
    closeActiveOpsStream();

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Running (Live)...';
    output.classList.add('ops-output--visible');
    output.textContent = 'Connecting...';

    const params = new URLSearchParams({ id: opId });
    const source = new EventSource(`/api/admin/diagnostics/run-command-stream?${params.toString()}`);
    activeOpsStream = { source, button, originalLabel, output };

    source.addEventListener('meta', (event) => {
        output.textContent = '';
        try {
            const meta = JSON.parse(event.data || '{}');
            if (meta.command) {
                appendOpsOutput(output, `Command: ${meta.command}`);
            }
            if (meta.started_at) {
                appendOpsOutput(output, `Started: ${new Date(meta.started_at).toLocaleString()}`);
            }
        } catch {
            appendOpsOutput(output, 'Command started.');
        }
        appendOpsOutput(output, '---');
    });

    source.addEventListener('ops-error', (event) => {
        let message = event.data || 'Command error';
        try {
            const payload = JSON.parse(event.data || '{}');
            message = payload.error || message;
        } catch {}
        appendOpsOutput(output, `Error: ${message}`);
        source.close();
        button.disabled = false;
        button.textContent = originalLabel;
        activeOpsStream = null;
        loadOpsHistory();
    });

    source.onmessage = (event) => {
        if (event?.data) {
            appendOpsOutput(output, event.data);
        }
    };

    source.addEventListener('done', (event) => {
        let payload = {};
        try {
            payload = JSON.parse(event.data || '{}');
        } catch {}
        appendOpsOutput(output, '');
        appendOpsOutput(
            output,
            `Exit code: ${payload.exit_code ?? 'unknown'} | Duration: ${payload.duration_seconds ?? 'n/a'}s`
        );
        if (payload.success) {
            appendOpsOutput(output, '✅ Command finished successfully.');
        } else {
            appendOpsOutput(output, '❌ Command finished with errors.');
        }
        loadOpsHistory();
        source.close();
        button.disabled = false;
        button.textContent = originalLabel;
        activeOpsStream = null;
        if (opId === 'frontend-build' || opId === 'frontend-rollback') {
            loadDeployStatus();
        }
    });

    source.onerror = () => {
        if (!activeOpsStream) return;
        source.close();
        if (spec?.disrupts_api) {
            output.textContent = 'Command dispatched. The API is restarting; confirming recovery...';
            waitForApiRecovery(output).then((recovered) => {
                if (recovered) loadSystemHealth();
            });
        } else {
            appendOpsOutput(output, 'Connection lost. Try again if needed.');
        }
        button.disabled = false;
        button.textContent = originalLabel;
        activeOpsStream = null;
        loadOpsHistory();
    };
}

async function waitForApiRecoverySilent() {
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        await delay(1500 + attempt * 500);
        try {
            await fetchAdminAPI('/api/admin/diagnostics/health');
            return true;
        } catch (err) {
            // keep trying
        }
    }
    return false;
}

async function confirmOpsRecovery(runId) {
    if (!runId || opsRecoveryPending.has(runId)) return;
    opsRecoveryPending.add(runId);
    try {
        const recovered = await waitForApiRecoverySilent();
        if (recovered) {
            await fetchAdminAPI('/api/admin/diagnostics/ops-history/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: runId })
            });
            loadOpsHistory();
        }
    } catch (err) {
        console.warn('Failed to confirm ops recovery.', err);
    } finally {
        opsRecoveryPending.delete(runId);
    }
}

async function waitForApiRecovery(output) {
    const maxAttempts = 6;
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        await delay(2000 + attempt * 500);
        try {
            const health = await fetchAdminAPI('/api/admin/diagnostics/health');
            const timestamp = health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'now';
            output.textContent = `API is back up. Health check OK (${timestamp}).`;
            return true;
        } catch (err) {
            lastError = err?.message || 'Request failed';
            output.textContent = `Waiting for API... (${attempt}/${maxAttempts})`;
        }
    }
    output.textContent = `Still waiting for API. Try refreshing. Last error: ${lastError}`;
    return false;
}

// Auto-refresh health status every 30 seconds
setInterval(() => {
    if (!diagnosticsInitialized) return;
    showRefreshIndicator();
    loadSystemHealth();
}, 30000);

// Expose initDiagnostics for admin panel
(/** @type {any} */ (window)).initDiagnostics = initDiagnostics;
