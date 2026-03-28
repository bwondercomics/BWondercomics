import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const adminHtml = readFileSync(resolve(process.cwd(), 'admin/index.html'), 'utf-8');
const bodyMatch = adminHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const adminBody = (bodyMatch ? bodyMatch[1] : adminHtml)
  .replace(/<script\b[\s\S]*?<\/script>/gi, '')
  .trim();

export function jsonResponse(body, options = {}) {
  const { status = 200, statusText = 'OK' } = options;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

export function mountAdminDom() {
  document.body.innerHTML = adminBody;
}

export function stubAdminGlobals(vi) {
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('prompt', vi.fn(() => ''));
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' });
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = vi.fn();
  }
}

export async function flushAdminUi(ticks = 1) {
  for (let index = 0; index < ticks; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
