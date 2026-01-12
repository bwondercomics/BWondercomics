/**
 * Test setup for Battle Bros comic reader
 * Configures global test environment and mocks
 */

import { beforeEach, vi } from 'vitest';

// Mock localStorage for tests
const localStorageMock = {
    store: {},
    getItem(key) {
        return this.store[key] || null;
    },
    setItem(key, value) {
        this.store[key] = String(value);
    },
    removeItem(key) {
        delete this.store[key];
    },
    clear() {
        this.store = {};
    }
};

global.localStorage = localStorageMock;

// Default fetch stub to prevent accidental network calls in tests.
vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
        text: async () => ''
    }))
);

if (!global.navigator) {
    global.navigator = {};
}
if (!global.navigator.sendBeacon) {
    global.navigator.sendBeacon = vi.fn(() => true);
}

// Reset localStorage before each test
beforeEach(() => {
    localStorage.clear();
});
