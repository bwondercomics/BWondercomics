import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readerHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
const bodyMatch = readerHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const readerBody = (bodyMatch ? bodyMatch[1] : readerHtml)
  .replace(/<script\b[\s\S]*?<\/script>/gi, '')
  .trim();

export function mountReaderDom() {
  document.body.innerHTML = readerBody;
}

export function stubReaderGlobals(vi) {
  vi.stubGlobal('open', vi.fn());
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );

  if (!document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve());
  } else {
    vi.spyOn(document.documentElement, 'requestFullscreen').mockResolvedValue();
  }

  if (!document.exitFullscreen) {
    document.exitFullscreen = vi.fn();
  } else {
    vi.spyOn(document, 'exitFullscreen').mockResolvedValue();
  }

  if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
}

export function setFullscreenElement(value) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value,
    writable: true,
  });
}

export function createPointerEvent(type, options = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    deltaY: 0,
    ...options,
  });
  return event;
}

export async function flushReaderUi(ticks = 2) {
  for (let index = 0; index < ticks; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
