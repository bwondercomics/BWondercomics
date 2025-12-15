/**
 * Test setup for Battle Bros comic reader
 * Configures global test environment and mocks
 */

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

// Reset localStorage before each test
beforeEach(() => {
    localStorage.clear();
});
