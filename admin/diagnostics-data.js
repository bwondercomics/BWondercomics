function formatBytes(sizeBytes) {
  const size = Number(sizeBytes) || 0;
  if (size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return index === 0
    ? `${Math.floor(value)} ${units[index]}`
    : `${value.toFixed(1)} ${units[index]}`;
}

function mergeStatuses(...values) {
  const normalized = values.map((value) => String(value || 'ok').toLowerCase());
  if (normalized.includes('error')) return 'error';
  if (normalized.includes('warning') || normalized.includes('degraded')) return 'warning';
  return 'ok';
}

function normalizeCheck(item, fallbackStatus, fallbackMessage) {
  return {
    status: String(item?.status || fallbackStatus || 'warning').toLowerCase(),
    message: item?.message || fallbackMessage || '',
    updatedAt: item?.updatedAt || null,
    jails: item?.jails || '',
    currentlyBanned: Number(item?.currentlyBanned) || 0,
    totalBanned: Number(item?.totalBanned) || 0,
    jailBreakdown: item?.jailBreakdown || '',
  };
}

function normalizeLegacyDatabaseStats(stats) {
  const users = stats?.users || {};
  const series = stats?.series || {};
  const comments = stats?.comments || {};
  const premiumCodes = stats?.premium_codes || {};
  return {
    users: {
      total: Number(users.total) || 0,
      byRole: {
        user: Number(users.by_role?.user) || 0,
        premium: Number(users.by_role?.premium) || 0,
        admin: Number(users.by_role?.admin) || 0,
      },
    },
    series: {
      total: Number(series.total) || 0,
      published: Number(series.published) || 0,
      premiumOnly: Number(series.premium_only) || 0,
    },
    comments: {
      total: Number(comments.total) || 0,
      approved: Number(comments.approved) || 0,
    },
    premiumCodes: {
      total: Number(premiumCodes.total) || 0,
      active: Number(premiumCodes.active) || 0,
    },
    posts: Number(stats?.posts) || 0,
    entries: Number(stats?.entries) || 0,
    entryPages: Number(stats?.entry_pages) || 0,
    mediaItems: Number(stats?.media_items) || 0,
    emailSubscribers: Number(stats?.email_subscribers) || 0,
  };
}

function normalizeLegacyDatabaseOverview(overview) {
  const database = overview?.database || {};
  const connections = overview?.connections || {};
  const alembic = overview?.alembic || {};
  const tables = Array.isArray(overview?.tables) ? overview.tables : [];
  return {
    database: {
      name: database.name || '',
      version: database.version || '',
      sizePretty: database.size_pretty || '',
    },
    connections: {
      active: Number(connections.active) || 0,
      idle: Number(connections.idle) || 0,
      total: Number(connections.total) || 0,
      max: Number(connections.max) || 0,
    },
    alembic: {
      version: alembic.version || '',
    },
    tables: tables.map((row) => ({
      name: row?.name || '',
      rowsEstimate: Number(row?.rows_estimate ?? row?.liveRows) || 0,
      deadRows: Number(row?.deadRows) || 0,
      lastVacuum: row?.lastVacuum || null,
      lastAutovacuum: row?.lastAutovacuum || null,
      sizePretty: row?.size_pretty || '',
    })),
  };
}

function classifyBackup(name) {
  if (typeof name !== 'string') return '';
  if (name.startsWith('db-')) return 'db';
  if (name.startsWith('files-')) return 'files';
  return '';
}

function normalizeLegacyBackups(backups) {
  const db = [];
  const files = [];
  const sourceItems =
    Array.isArray(backups?.db) || Array.isArray(backups?.files)
      ? [
          ...(backups?.db || []).map((item) => ({ ...item, backupKind: 'db' })),
          ...(backups?.files || []).map((item) => ({ ...item, backupKind: 'files' })),
        ]
      : Array.isArray(backups?.items)
        ? backups.items
        : [];
  for (const item of sourceItems) {
    const bucket = item?.backupKind || classifyBackup(item?.name);
    if (!bucket) continue;
    const sizeBytes = Number(item?.sizeBytes ?? item?.size) || 0;
    const normalized = {
      name: item?.name || '',
      path: item?.path || '',
      artifactId: item?.artifactId || '',
      createdAt: item?.createdAt || item?.modifiedAt || null,
      sizeBytes,
      sizePretty: item?.sizePretty || formatBytes(sizeBytes),
      validation: item?.validation || null,
    };
    if (bucket === 'db') db.push(normalized);
    if (bucket === 'files') files.push(normalized);
  }

  const inferredStatus =
    db.length && files.length ? 'ok' : db.length || files.length ? 'warning' : 'error';
  const status = String(backups?.status || inferredStatus).toLowerCase();
  return {
    status,
    message:
      backups?.message ||
      (status === 'error'
        ? 'No validated DB or file backups found.'
        : `Validated DB backups: ${db.length}, file backups: ${files.length}`),
    source: backups?.source || 'legacy-files',
    root: backups?.backupDir || backups?.root || 'var/backups',
    db,
    files,
    latest: backups?.latest || { db: db[0] || null, files: files[0] || null },
    jobs: backups?.jobs || {},
    freshness: backups?.freshness || {},
    validatedCounts: backups?.validatedCounts || {
      db: db.length,
      files: files.length,
      total: db.length + files.length,
    },
    integrity: backups?.integrity || {},
  };
}

function normalizeLegacyDeploy(deploy) {
  const server = deploy?.server || {};
  const dist = deploy?.dist || {};
  const snapshots = deploy?.snapshots || {};
  const latestName =
    typeof snapshots.latest === 'string' ? snapshots.latest : snapshots.latest?.name || '';
  return {
    server: {
      startedAt: server.started_at || null,
      uptimeSeconds: Number(server.uptime_seconds) || 0,
    },
    git: {
      commit: deploy?.git?.commit || '',
      ref: deploy?.git?.ref || '',
      status: deploy?.git?.status || '',
    },
    dist: {
      exists: !!dist.exists,
      lastModified: dist.last_modified || null,
      manifest: dist.manifest || null,
    },
    releaseSnapshots: {
      count: Number(snapshots.count) || 0,
      latest: latestName ? { name: latestName } : null,
    },
  };
}

function normalizeLegacyTests(testStatus) {
  const suites = Array.isArray(testStatus?.suites) ? testStatus.suites : [];
  const suite = suites[0] || {};
  const latestRun =
    testStatus?.startedAt ||
    testStatus?.finishedAt ||
    testStatus?.exitCode != null ||
    testStatus?.status
      ? {
          status: testStatus?.status || 'idle',
          startedAt: testStatus?.startedAt || null,
          finishedAt: testStatus?.finishedAt || null,
          exitCode: testStatus?.exitCode ?? null,
          errorMessage: testStatus?.errorMessage || '',
        }
      : null;

  return {
    available: !!testStatus?.available,
    discoveredCount: Number(testStatus?.count ?? suite.count) || 0,
    files: Array.isArray(suite.test_files) ? suite.test_files : [],
    runnerEnabled: !!suite.runner_available,
    latestRun,
  };
}

function buildLegacyServiceStatus(
  serviceStatus,
  healthChecks,
  deployStatus,
  backups,
  databaseStats
) {
  const process = serviceStatus?.process || {};
  const system = serviceStatus?.system || {};
  const disk = system.disk || {};
  const diskDetails =
    disk.totalBytes && disk.freeBytes
      ? `${formatBytes(disk.freeBytes)} free of ${formatBytes(disk.totalBytes)}`
      : 'Disk details unavailable';

  return {
    items: [
      {
        id: 'api',
        label: 'API',
        status: 'ok',
        summary: 'API process responding.',
        details:
          process.pid || process.uptimeSeconds
            ? `PID ${process.pid || 'unknown'} · uptime ${Number(process.uptimeSeconds) || deployStatus.server.uptimeSeconds}s`
            : 'Runtime details unavailable',
      },
      {
        id: 'database',
        label: 'Database',
        status: healthChecks.database.status,
        summary: healthChecks.database.message,
        details: `Users ${databaseStats.users.total}, posts ${databaseStats.posts}`,
      },
      {
        id: 'dist',
        label: 'Frontend Dist',
        status: healthChecks.dist.status,
        summary: healthChecks.dist.message,
        details: deployStatus.dist.manifest || 'No manifest found',
      },
      {
        id: 'backups',
        label: 'Backups',
        status: backups.status,
        summary: backups.message,
        details: backups.root,
      },
      {
        id: 'system',
        label: 'System',
        status: disk.totalBytes ? 'ok' : 'warning',
        summary: system.platform || 'System details unavailable',
        details: `${system.python || 'unknown python'} · ${diskDetails}`,
      },
      {
        id: 'fail2ban',
        label: 'fail2ban',
        status: healthChecks.fail2ban.status,
        summary: healthChecks.fail2ban.message,
        details: healthChecks.fail2ban.jailBreakdown || 'No jail details',
      },
    ],
  };
}

async function buildLegacySnapshot(fetcher) {
  const [
    healthResult,
    statsResult,
    overviewResult,
    deployResult,
    backupsResult,
    serviceResult,
    testsResult,
  ] = await Promise.allSettled([
    fetcher('/api/admin/diagnostics/health'),
    fetcher('/api/admin/diagnostics/db-stats'),
    fetcher('/api/admin/diagnostics/db-overview'),
    fetcher('/api/admin/diagnostics/deploy-status'),
    fetcher('/api/admin/diagnostics/backups'),
    fetcher('/api/admin/diagnostics/service-status'),
    fetcher('/api/admin/diagnostics/test-status'),
  ]);

  const health = healthResult.status === 'fulfilled' ? healthResult.value : {};
  const databaseStats = normalizeLegacyDatabaseStats(
    statsResult.status === 'fulfilled' ? statsResult.value : {}
  );
  const databaseOverview = normalizeLegacyDatabaseOverview(
    overviewResult.status === 'fulfilled' ? overviewResult.value : {}
  );
  const deployStatus = normalizeLegacyDeploy(
    deployResult.status === 'fulfilled' ? deployResult.value : {}
  );
  const backups = normalizeLegacyBackups(
    backupsResult.status === 'fulfilled' ? backupsResult.value : {}
  );
  const testStatus = normalizeLegacyTests(
    testsResult.status === 'fulfilled' ? testsResult.value : {}
  );

  const distCheck = {
    status: deployStatus.dist.exists ? 'ok' : 'error',
    message: deployStatus.dist.exists
      ? `dist/ present; last build ${deployStatus.dist.lastModified || 'unknown'}.`
      : 'dist/ is missing.',
  };
  const backupCheck = {
    status: backups.status,
    message: backups.message,
  };
  const healthChecks = {
    database: normalizeCheck(health?.checks?.database, 'warning', 'Database status unavailable.'),
    dist: distCheck,
    backups: backupCheck,
    fail2ban: normalizeCheck(health?.checks?.fail2ban, 'warning', 'Fail2ban status unavailable.'),
  };

  const overallStatus = mergeStatuses(
    healthChecks.database.status,
    healthChecks.dist.status,
    healthChecks.backups.status,
    healthChecks.fail2ban.status
  );
  const serviceStatus = buildLegacyServiceStatus(
    serviceResult.status === 'fulfilled' ? serviceResult.value : {},
    healthChecks,
    deployStatus,
    backups,
    databaseStats
  );

  const deployGeneratedAt =
    deployResult.status === 'fulfilled' ? deployResult.value?.generatedAt || null : null;
  const statsGeneratedAt =
    statsResult.status === 'fulfilled' ? statsResult.value?.generatedAt || null : null;
  const generatedAt =
    health?.timestamp || deployGeneratedAt || statsGeneratedAt || new Date().toISOString();

  return {
    schemaVersion: 1,
    source: 'legacy-live',
    generatedAt,
    overallStatus,
    health: {
      status: overallStatus,
      checks: healthChecks,
    },
    databaseStats,
    databaseOverview,
    deployStatus,
    backups,
    serviceStatus,
    testStatus,
  };
}

function canFallbackToLegacy(error) {
  return error && (error.status === 404 || error.status === 405);
}

export async function getDiagnosticsSnapshot(fetcher) {
  try {
    return {
      snapshot: await fetcher('/api/admin/diagnostics/snapshot'),
      fallbackMessage: '',
      usedLegacyFallback: false,
    };
  } catch (error) {
    if (!canFallbackToLegacy(error)) throw error;
    return {
      snapshot: await buildLegacySnapshot(fetcher),
      fallbackMessage:
        'Loaded live diagnostics from legacy endpoints while the new snapshot API is unavailable.',
      usedLegacyFallback: true,
    };
  }
}

export async function refreshDiagnosticsSnapshot(fetcher) {
  try {
    return {
      snapshot: await fetcher('/api/admin/diagnostics/refresh', { method: 'POST' }),
      fallbackMessage: '',
      usedLegacyFallback: false,
    };
  } catch (error) {
    if (!canFallbackToLegacy(error)) throw error;
    return {
      snapshot: await buildLegacySnapshot(fetcher),
      fallbackMessage:
        'Loaded live diagnostics from legacy endpoints because the backend refresh route is not available yet.',
      usedLegacyFallback: true,
    };
  }
}
