import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Phase E of docs/completed-builder-plans/BUILDER_REFACTOR_PLAN.md:
// shared/page-builder is the dual-use kernel rendered by both the admin builder and
// the live reader. This boundary is structural:
// nothing under shared/ may depend on admin/ or reader/, and the reader must never
// import admin code (an admin-only dependency added to a kernel module would silently
// ship into — or break — the reader bundle).

const IMPORT_RE = /from\s+'([^']+)'/g;

function listJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function importsOf(file) {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(IMPORT_RE)].map((match) => match[1]);
}

describe('shared kernel boundary', () => {
  it('shared/page-builder imports nothing from admin/ or reader/', () => {
    const offenders = [];
    for (const file of listJsFiles('shared')) {
      for (const spec of importsOf(file)) {
        const resolved = path.normalize(path.join(path.dirname(file), spec));
        if (resolved.startsWith('admin/') || resolved.startsWith('reader/')) {
          offenders.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reader/ imports nothing from admin/', () => {
    const offenders = [];
    for (const file of listJsFiles('reader')) {
      for (const spec of importsOf(file)) {
        const resolved = path.normalize(path.join(path.dirname(file), spec));
        if (resolved.startsWith('admin/')) {
          offenders.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('production serves the shared kernel imported by source admin modules', () => {
    const caddyfile = readFileSync('deploy/Caddyfile', 'utf8');

    expect(caddyfile).toMatch(/handle \/shared\/page-builder\/\*/);
    expect(caddyfile).toMatch(
      /handle \/shared\/page-builder\/\* \{[\s\S]*?root \* \/srv\/bwondercomics\/root[\s\S]*?file_server[\s\S]*?\}/
    );
  });

  it('production ingress applies the conservative security header contract', () => {
    const caddyfile = readFileSync('deploy/Caddyfile', 'utf8');
    expect(caddyfile).toContain('Strict-Transport-Security "max-age=31536000"');
    expect(caddyfile).not.toContain('includeSubDomains');
    expect(caddyfile).not.toContain('preload');
    expect(caddyfile).toContain('X-Content-Type-Options "nosniff"');
    expect(caddyfile).toContain('Referrer-Policy "strict-origin-when-cross-origin"');
    expect(caddyfile).toContain('X-Frame-Options "SAMEORIGIN"');
    expect(caddyfile).toContain('Content-Security-Policy "frame-ancestors \'self\'"');
    expect(caddyfile.match(/import security_headers/g)).toHaveLength(2);
  });

  it('production binds the API to loopback and pins the deployed Umami release', () => {
    const compose = readFileSync('deploy/bwondercomics-compose.yml', 'utf8');
    expect(compose).toContain('127.0.0.1:${BWC_API_PORT:-8000}:8000');
    expect(compose).toContain(
      'ghcr.io/umami-software/umami:3.0.3@sha256:28f263fe06f79ebffa5a6a6e9bd33b7a278e9342a88e0bdac812416c9f9e4361'
    );
    expect(compose).not.toContain('umami:postgresql-latest');
  });
});
