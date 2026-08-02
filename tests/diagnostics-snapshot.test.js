/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const domTemplate = `
  <section id="diagnosticsSection"></section>
  <button id="diagnostics-refresh" type="button"></button>
  <div id="diagnosticsBanner"></div>
  <div id="diagnosticsSnapshotTime"></div>
  <div id="diagnosticsHealth"></div>
  <div id="diagnosticsServices"></div>
  <div id="diagnosticsDatabase"></div>
  <div id="diagnosticsDeploy"></div>
  <div id="diagnosticsBackups"></div>
  <div id="diagnosticsTests"></div>
  <div id="diagnostics-refresh-indicator"></div>
`;

function buildSnapshot(generatedAt) {
  return {
    schemaVersion: 1,
    source: 'manual',
    generatedAt,
    overallStatus: 'warning',
    health: {
      checks: {
        database: { status: 'ok', message: 'Database connection successful.' },
        dist: { status: 'ok', message: 'dist/ present.' },
        backups: { status: 'ok', message: 'Backups present.' },
        fail2ban: { status: 'warning', message: 'Snapshot stale.' },
      },
    },
    serviceStatus: {
      items: [
        { id: 'api', label: 'API', status: 'ok', summary: 'API online', details: 'Uptime 10m' },
      ],
    },
    databaseStats: {
      users: { total: 2, byRole: { user: 0, premium: 1, admin: 1 } },
      series: { total: 1, published: 1, premiumOnly: 0 },
      comments: { total: 3, approved: 3 },
      posts: 4,
    },
    databaseOverview: {
      database: { name: 'bwondercomics', sizePretty: '10 MB' },
      alembic: { version: '0015' },
      connections: { active: 1, idle: 2 },
      tables: [{ name: 'users', rowsEstimate: 2, sizePretty: '8 KB' }],
    },
    deployStatus: {
      server: { startedAt: generatedAt, uptimeSeconds: 3600 },
      git: { commit: 'abcdef123456', ref: 'main', status: 'clean' },
      dist: { exists: true, lastModified: generatedAt, manifest: 'app.manifest' },
      releaseSnapshots: { count: 2, latest: { name: 'dist-20260101-010101.tar.gz' } },
    },
    backups: {
      status: 'error',
      message: 'Latest backup attempt failed (database: dump_failed).',
      source: 'production-status',
      root: '/mnt/archive/backups/bwondercomics',
      db: [
        {
          name: 'database.dump',
          createdAt: generatedAt,
          sizePretty: '1 KB',
          validation: { method: 'pg_restore --list', result: 'ok' },
        },
      ],
      files: [
        {
          name: 'files.tar.gz',
          createdAt: generatedAt,
          sizePretty: '2 KB',
          validation: { method: 'tar member allowlist comparison', result: 'ok' },
        },
      ],
      latest: {
        db: {
          name: 'database.dump',
          createdAt: generatedAt,
          sizePretty: '1 KB',
          validation: { method: 'pg_restore --list', result: 'ok' },
        },
        files: {
          name: 'files.tar.gz',
          createdAt: generatedAt,
          sizePretty: '2 KB',
          validation: { method: 'tar member allowlist comparison', result: 'ok' },
        },
      },
      jobs: {
        database: { lastAttempt: { status: 'error', errorCode: 'dump_failed' } },
        files: { lastAttempt: { status: 'ok' } },
      },
      freshness: {
        database: { status: 'ok', ageHours: 1 },
        files: { status: 'warning', ageHours: 200 },
      },
    },
    testStatus: {
      discoveredCount: 5,
      runnerEnabled: false,
      latestRun: { status: 'failed', finishedAt: generatedAt, exitCode: 1 },
    },
  };
}

function legacyDiagnosticsPayload(generatedAt) {
  return {
    health: {
      status: 'healthy',
      timestamp: generatedAt,
      checks: {
        database: { status: 'ok', message: 'Database connection successful.' },
        fail2ban: { status: 'warning', message: 'Snapshot stale.', jailBreakdown: 'sshd 0/0' },
      },
    },
    dbStats: {
      generatedAt,
      users: { total: 2, by_role: { user: 0, premium: 1, admin: 1 } },
      series: { total: 1, published: 1, premium_only: 0 },
      comments: { total: 3, approved: 3 },
      posts: 4,
      entries: 5,
      entry_pages: 6,
      media_items: 7,
      email_subscribers: 8,
    },
    dbOverview: {
      generatedAt,
      database: { name: 'bwondercomics', version: '16', size_pretty: '10 MB' },
      alembic: { version: '0015' },
      connections: { active: 1, idle: 2, total: 3, max: 100 },
      tables: [{ name: 'users', rows_estimate: 2, size_pretty: '8 KB' }],
    },
    deployStatus: {
      generatedAt,
      server: { started_at: generatedAt, uptime_seconds: 3600 },
      git: { commit: 'abcdef123456', ref: 'refs/heads/main', status: 'clean' },
      dist: { exists: true, last_modified: generatedAt, manifest: 'app.manifest' },
      snapshots: { count: 2, latest: 'dist-20260101-010101.tar.gz' },
    },
    backups: {
      generatedAt,
      backupDir: 'var/backups',
      items: [
        {
          name: 'files-20260101-010101.tar.gz',
          path: 'var/backups/files.tar.gz',
          size: 2048,
          modifiedAt: generatedAt,
        },
        {
          name: 'db-20260101-010101.sql',
          path: 'var/backups/db.sql',
          size: 1024,
          modifiedAt: generatedAt,
        },
      ],
    },
    serviceStatus: {
      generatedAt,
      process: { pid: 1234, uptimeSeconds: 3600 },
      system: {
        platform: 'Linux',
        python: '3.12.0',
        disk: { totalBytes: 10_000, freeBytes: 4_000 },
      },
    },
    testStatus: {
      status: 'failed',
      available: true,
      count: 5,
      suites: [{ runner_available: false, test_files: ['tests/example.test.js'] }],
      startedAt: generatedAt,
      finishedAt: generatedAt,
      exitCode: 1,
      errorMessage: 'suite failed',
    },
  };
}

describe('admin diagnostics snapshot', () => {
  beforeEach(() => {
    document.body.innerHTML = domTemplate;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options = {}) => {
        if (String(url).includes('/api/admin/diagnostics/refresh')) {
          return {
            ok: true,
            json: async () => buildSnapshot(new Date().toISOString()),
          };
        }
        if (String(url).includes('/api/admin/diagnostics/snapshot')) {
          return {
            ok: true,
            json: async () =>
              buildSnapshot(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
          };
        }
        return { ok: true, json: async () => ({}) };
      })
    );
  });

  it('renders the snapshot and shows a stale warning', async () => {
    vi.resetModules();
    const { initDiagnostics } = await import('../admin/diagnostics.js');
    await initDiagnostics();

    expect(document.getElementById('diagnosticsBanner').textContent).toContain('Overall status');
    expect(document.getElementById('diagnosticsBanner').textContent).toContain('stale');
    expect(document.getElementById('diagnosticsHealth').textContent).toContain('database');
    expect(document.getElementById('diagnosticsTests').textContent).toContain('Discovered tests');
    expect(document.getElementById('diagnosticsBackups').textContent).toContain('Validated 1');
    expect(document.getElementById('diagnosticsBackups').textContent).toContain('dump_failed');
    expect(document.getElementById('diagnosticsBackups').textContent).toContain('warning');
    expect(document.getElementById('diagnosticsBackups').textContent).toContain(
      'pg_restore --list'
    );
    expect(document.getElementById('diagnosticsBackups').textContent).toContain(
      'production-status'
    );
  });

  it('renders source, root, freshness, and failed attempts with zero artifacts', async () => {
    const snapshot = buildSnapshot(new Date().toISOString());
    snapshot.backups.db = [];
    snapshot.backups.files = [];
    snapshot.backups.latest = { db: null, files: null };
    snapshot.backups.validatedCounts = { db: 0, files: 0, total: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => snapshot }))
    );
    vi.resetModules();
    const { initDiagnostics } = await import('../admin/diagnostics.js');
    await initDiagnostics();
    const text = document.getElementById('diagnosticsBackups').textContent;
    expect(text).toContain('production-status');
    expect(text).toContain('/mnt/archive/backups/bwondercomics');
    expect(text).toContain('Freshness: ok');
    expect(text).toContain('dump_failed');
  });

  it('falls back to legacy diagnostics endpoints when snapshot routes are unavailable', async () => {
    const generatedAt = new Date().toISOString();
    const legacy = legacyDiagnosticsPayload(generatedAt);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const value = String(url);
        if (value.includes('/api/admin/diagnostics/snapshot')) {
          return { ok: false, status: 404, json: async () => ({ detail: 'Not Found' }) };
        }
        if (value.includes('/api/admin/diagnostics/refresh')) {
          return { ok: false, status: 405, json: async () => ({ detail: 'Method Not Allowed' }) };
        }
        if (value.includes('/api/admin/diagnostics/health')) {
          return { ok: true, status: 200, json: async () => legacy.health };
        }
        if (value.includes('/api/admin/diagnostics/db-stats')) {
          return { ok: true, status: 200, json: async () => legacy.dbStats };
        }
        if (value.includes('/api/admin/diagnostics/db-overview')) {
          return { ok: true, status: 200, json: async () => legacy.dbOverview };
        }
        if (value.includes('/api/admin/diagnostics/deploy-status')) {
          return { ok: true, status: 200, json: async () => legacy.deployStatus };
        }
        if (value.includes('/api/admin/diagnostics/backups')) {
          return { ok: true, status: 200, json: async () => legacy.backups };
        }
        if (value.includes('/api/admin/diagnostics/service-status')) {
          return { ok: true, status: 200, json: async () => legacy.serviceStatus };
        }
        if (value.includes('/api/admin/diagnostics/test-status')) {
          return { ok: true, status: 200, json: async () => legacy.testStatus };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      })
    );

    vi.resetModules();
    const { initDiagnostics } = await import('../admin/diagnostics.js');
    await initDiagnostics();

    expect(document.getElementById('diagnosticsBanner').textContent).toContain('legacy endpoints');
    expect(document.getElementById('diagnosticsServices').textContent).toContain('API');

    document.getElementById('diagnostics-refresh').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('diagnosticsBanner').textContent).toContain(
      'backend refresh route is not available yet'
    );
  });

  it('admin markup removes live ops sections and links to /ops/', () => {
    const html = readFileSync(resolve(process.cwd(), 'admin/index.html'), 'utf-8');
    expect(html).not.toContain('id="logs-output"');
    expect(html).not.toContain('id="ops-commands"');
    expect(html).toContain('href="/ops/"');
  });
});
