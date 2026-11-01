import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Exposes whether the dev server holds a Gemini key.
 *
 * The key has no `VITE_` prefix, so Vite never inlines it and the browser cannot
 * read `import.meta.env.GEMINI_API_KEY`. This endpoint answers the one question
 * the UI needs — "is Gemini configured?" — as a boolean. No key material is
 * ever returned.
 */
function aiConfigPlugin(config: { gemini: boolean; model: string | null }) {
  return {
    name: 'nexus-ai-config',
    configureServer(server: {
      middlewares: { use: (path: string, fn: (req: unknown, res: ResponseLike) => void) => void };
    }) {
      server.middlewares.use('/api/ai/config', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ gemini: config.gemini, model: config.model }));
      });
    },
  };
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

export default defineConfig(({ mode }) => {
  // Server-side env only. `GEMINI_API_KEY` has no VITE_ prefix, so Vite never
  // inlines it into the client bundle — it is injected into proxied requests
  // here, on the dev server, and nowhere else.
  const env = loadEnv(mode, process.cwd(), '');
  const geminiKey = env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';

  return {
    plugins: [
      react(),
      aiConfigPlugin({ gemini: Boolean(geminiKey), model: env.GEMINI_MODEL ?? null }),
    ],
    // Keep the dependency pre-bundle at the project root (Vite's documented
    // Windows workaround). Inside node_modules some filesystems race on the
    // deps_temp → deps rename, which surfaces as "504 Outdated Optimize Dep".
    cacheDir: '.vite',
    // Pre-bundle every static entry once up front so the dependency graph stays
    // stable for the whole dev session (late optimisation causes 504s).
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-router-dom',
        '@tanstack/react-query',
        'zustand',
        'zustand/middleware',
        'zustand/middleware/immer',
        'immer',
        'framer-motion',
        'lucide-react',
        'sonner',
        'nanoid',
        'date-fns',
        'clsx',
        'tailwind-merge',
        'class-variance-authority',
      ],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      open: false,
      proxy: {
        /**
         * Gemini proxy — the only AI provider in Phase 5.
         * The browser calls `/api/gemini/v1beta/...`; the dev server attaches the
         * key. No CORS preflight, no deploy, and the key never reaches the bundle.
         */
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/api\/gemini/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (geminiKey) {
                proxyReq.setHeader('x-goog-api-key', geminiKey);
                // Ensure the query-string form is not required.
                proxyReq.removeHeader('authorization');
              }
            });
            proxy.on('proxyRes', (proxyRes) => {
              // SSE must not be buffered or compressed away.
              const type = proxyRes.headers['content-type'];
              if (typeof type === 'string' && type.includes('text/event-stream')) {
                proxyRes.headers['cache-control'] = 'no-cache, no-transform';
                delete proxyRes.headers['content-encoding'];
              }
            });
          },
        },
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
            data: ['@tanstack/react-query', 'zustand', 'immer'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  };
});
