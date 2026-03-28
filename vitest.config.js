import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      all: false,
      include: ['reader/**/*.js', 'admin/**/*.js', 'ops/**/*.js'],
      exclude: [
        'dist/**',
        'coverage/**',
        'backend/**',
        'docs/**',
        'assets/**',
        'media/**',
        'tests/**',
        '**/*.html',
        '**/*.json'
      ]
    }
  }
});
