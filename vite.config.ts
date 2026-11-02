import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleAiRoute, readGeminiConfig, splitRoute } from './src/server/geminiProxy';

/**
 * Dev-server twin of the Vercel function in `api/ai/[...route].ts`.
 *
 * Both share `src/server/geminiProxy.ts`, so `pnpm dev` and a Vercel deployment
 * answer the identical contract:
 *
 *   GET  /api/ai/config                          -> { gemini, model }
 *   POST /api/ai/v1beta/models/<model>:<method>  -> proxied Gemini call
 *
 * Previously this plugin only served `/api/ai/config` and the provider called a
 * separate `/api/gemini` proxy - a path that exists only under `vite dev`, which
 * is exactly why the AI 404'd in production. One prefix now, everywhere.
 */
function geminiProxyPlugin(): Plugin {
  return {
    name: 'nexus-ai-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      const apiKey = env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
      const config = readGeminiConfig({ ...env, ...process.env });

      server.middlewares.use('/api/ai', (req: IncomingMessage, res: ServerResponse) => {
        void forward(req, res, config, apiKey);
      });
    },
  };
}

async function forward(
  req: IncomingMessage,
  res: ServerResponse,
  config: ReturnType<typeof readGeminiConfig>,
  apiKey: string,
): Promise<void> {
  const [rawPath = '', rawQuery = ''] = (req.url ?? '/').replace(/^\/api\/ai\/?/, '').split('?');

  const result = await handleAiRoute(
    {
      route: splitRoute(rawPath),
      search: rawQuery,
      method: (req.method ?? 'GET').toUpperCase(),
      body: await readBody(req),
    },
    config,
    apiKey,
  );

  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);

  if (result.status === 204) {
    res.end();
    return;
  }
  if (result.text !== undefined) {
    res.end(result.text);
    return;
  }
  if (!result.body) {
    res.end();
    return;
  }

  // Relay the upstream stream chunk-for-chunk: buffering an SSE body would turn
  // token-by-token output into one long silence.
  const reader = result.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks).toString('utf8') : null));
    req.on('error', () => resolve(null));
  });
}
export default defineConfig(() => {
  return {
    plugins: [react(), geminiProxyPlugin()],
    // Keep the dependency pre-bundle at the project root (Vite's documented
    // Windows workaround). Inside node_modules some filesystems race on the
    // deps_temp â†’ deps rename, which surfaces as "504 Outdated Optimize Dep".
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
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        '@supabase/supabase-js',
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
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      /**
       * The only chunk over 500 kB is Hero3DScene (Three.js + drei), which is
       * lazy and reached only by desktop visitors â€” phones load a static image
       * instead. Raising the limit keeps the warning meaningful for chunks that
       * are actually eager.
       */
      chunkSizeWarningLimit: 950,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
            data: ['@tanstack/react-query', 'zustand', 'immer'],
            icons: ['lucide-react'],
            /**
             * Three.js is deliberately NOT listed here.
             *
             * An explicit `three` chunk forced the entry to reference it, so every
             * route â€” including mobile, where the hero is a static image â€” still
             * downloaded ~250 kB gzip. Rollup splits a lazily-imported graph on
             * its own; letting it do so keeps `three` inside the Hero3DScene chunk
             * where only desktop visitors reach it.
             */
            /**
             * Supabase is optional infrastructure (~45 kB gzip with its Realtime
             * and GoTrue clients) and changes far less often than app code. Its
             * own chunk is cached long-term and keeps the entry chunk small
             * enough that first paint is not gated on it.
             */
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
