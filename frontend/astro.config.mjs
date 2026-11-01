import { defineConfig } from 'astro/config';

// Development only: localhost Fastify on PR #5 defaults to port 3100.
// Do not proxy to production databases or expose a development listener publicly.
export default defineConfig({
  output: 'static',
  server: { host: '127.0.0.1', port: 4321 },
  vite: {
    server: {
      proxy: {
        '/api/v1': {
          target: 'http://127.0.0.1:3100',
          changeOrigin: false
        }
      }
    }
  }
});
