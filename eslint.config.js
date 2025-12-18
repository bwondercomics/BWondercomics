import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                localStorage: 'readonly',
                fetch: 'readonly',
                console: 'readonly',
                IntersectionObserver: 'readonly',
                ResizeObserver: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                performance: 'readonly'
            }
        },
        rules: {
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all'],
            'no-debugger': 'error'
        }
    },
    {
        ignores: ['node_modules/**', 'backend/**', 'tests/**', 'dist/**', '*.min.js']
    }
];
