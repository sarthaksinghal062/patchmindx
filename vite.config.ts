import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { defineConfig, Plugin } from 'vite';

let backendProcess: ChildProcess | null = null;

function fastApiPlugin(): Plugin {
  return {
    name: 'fastapi-backend-runner',
    configureServer() {
      if (!backendProcess) {
        console.log('[FastAPI] Spawning PatchMind Backend on 127.0.0.1:8080...');
        backendProcess = spawn(
          'python3',
          ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8080'],
          {
            stdio: 'inherit',
            env: {
              ...process.env,
              PATCHMIND_OFFLINE_MODE: process.env.PATCHMIND_OFFLINE_MODE || 'true',
            },
          }
        );

        backendProcess.on('error', (err) => {
          console.error('[FastAPI] Failed to spawn backend process:', err);
        });

        const cleanup = () => {
          if (backendProcess) {
            try {
              backendProcess.kill('SIGTERM');
            } catch (_) {}
            backendProcess = null;
          }
        };

        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), fastApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
        '/docs': {
          target: 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
        '/openapi.json': {
          target: 'http://127.0.0.1:8080',
          changeOrigin: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
