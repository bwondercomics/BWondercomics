/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const domTemplate = `
  <div id="opsLoginScreen"></div>
  <form id="opsLoginForm"></form>
  <input id="opsLoginEmail" />
  <input id="opsLoginPassword" />
  <div id="opsLoginError"></div>
  <div id="opsApp" hidden></div>
  <div id="opsMeta"></div>
  <div id="opsNotice" hidden></div>
  <button id="opsRefresh" type="button"></button>
  <button id="opsLogout" type="button"></button>
  <div id="opsSnapshot"></div>
  <div id="opsCommands"></div>
  <div id="opsRunMeta"></div>
  <pre id="opsRunOutput"></pre>
  <div id="opsRuns"></div>
  <div id="opsBackups"></div>
`;

describe('ops app', () => {
  beforeEach(() => {
    document.body.innerHTML = domTemplate;
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    vi.stubGlobal(
      'EventSource',
      class {
        close() {}
        addEventListener() {}
      }
    );
    vi.stubGlobal(
      'setInterval',
      vi.fn(() => 1)
    );
    vi.stubGlobal('clearInterval', vi.fn());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const path = String(url);
        if (path.endsWith('/api/session')) {
          return {
            ok: true,
            json: async () => ({ user: { email: 'admin@example.com', role: 'admin' } }),
          };
        }
        if (path.endsWith('/api/admin/diagnostics/snapshot')) {
          return {
            ok: true,
            json: async () => ({
              generatedAt: new Date().toISOString(),
              overallStatus: 'ok',
              health: { checks: { database: { status: 'ok', message: 'ok' } } },
              serviceStatus: {
                items: [{ id: 'api', label: 'API', status: 'ok', summary: 'online' }],
              },
            }),
          };
        }
        if (path.endsWith('/api/admin/ops')) {
          return {
            ok: true,
            json: async () => ({
              enabled: false,
              message: 'Command runner disabled.',
              commands: [
                {
                  id: 'tests',
                  label: 'Run Frontend Tests',
                  group: 'Verification',
                  description: 'Run Vitest',
                  command: 'npm test',
                  requiresConfirm: false,
                },
              ],
            }),
          };
        }
        if (path.endsWith('/api/admin/ops/history')) {
          return {
            ok: true,
            json: async () => ({
              runs: [
                {
                  id: '1',
                  label: 'Queue',
                  status: 'queued',
                  startedAt: new Date().toISOString(),
                  userEmail: 'a',
                  output: '',
                },
                {
                  id: '2',
                  label: 'Run',
                  status: 'running',
                  startedAt: new Date().toISOString(),
                  userEmail: 'a',
                  output: '',
                },
                {
                  id: '3',
                  label: 'Done',
                  status: 'completed',
                  startedAt: new Date().toISOString(),
                  userEmail: 'a',
                  output: '',
                },
                {
                  id: '4',
                  label: 'Fail',
                  status: 'failed',
                  startedAt: new Date().toISOString(),
                  userEmail: 'a',
                  output: '',
                },
              ],
            }),
          };
        }
        if (path.endsWith('/api/admin/ops/backups')) {
          return {
            ok: true,
            json: async () => ({
              db: [{ name: 'db.sql', createdAt: new Date().toISOString(), sizePretty: '1 KB' }],
              files: [
                { name: 'files.tar.gz', createdAt: new Date().toISOString(), sizePretty: '2 KB' },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      })
    );
  });

  it('renders commands and queued/running/completed/failed history states', async () => {
    vi.resetModules();
    await import('../ops/app.js');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('opsCommands').textContent).toContain('Run Frontend Tests');
    expect(document.getElementById('opsRuns').textContent).toContain('queued');
    expect(document.getElementById('opsRuns').textContent).toContain('running');
    expect(document.getElementById('opsRuns').textContent).toContain('completed');
    expect(document.getElementById('opsRuns').textContent).toContain('failed');
  });
});
