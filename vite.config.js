import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    publicDir: 'assets',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: 'index.html',
                feed: 'feed.html',
                comics: 'comics.html',
                media: 'media.html',
                admin: 'admin/index.html'
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true, // Remove console.log in production
                drop_debugger: true
            }
        },
        sourcemap: true, // Generate source maps for debugging
        chunkSizeWarningLimit: 1000 // Increase limit for larger chunks
    },
    server: {
        port: 3000,
        host: '0.0.0.0', // Allow LAN access
        proxy: {
            '/api': {
                target: 'http://localhost:8001', // Proxy to bw-quality test server
                changeOrigin: true
            },
            '/data.json': {
                target: 'http://localhost:8001',
                changeOrigin: true
            },
            '/series.json': {
                target: 'http://localhost:8001',
                changeOrigin: true
            },
            '/page-config.json': {
                target: 'http://localhost:8001',
                changeOrigin: true
            },
            '/media.json': {
                target: 'http://localhost:8001',
                changeOrigin: true
            },
            '/series': {
                target: 'http://localhost:8001',
                changeOrigin: true
            },
            '/analytics.js': {
                target: 'http://localhost:8001',
                changeOrigin: true
            }
        }
    },
    preview: {
        port: 4173,
        host: '0.0.0.0'
    }
});
