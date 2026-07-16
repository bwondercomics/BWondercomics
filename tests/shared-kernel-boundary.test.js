import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Phase E of docs/BUILDER_REFACTOR_PLAN.md: shared/page-builder is the dual-use kernel
// rendered by both the admin builder and the live reader. This boundary is structural:
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
});
