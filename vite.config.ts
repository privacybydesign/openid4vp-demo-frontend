import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { proxyConfigFromEnv, assertProxyConfig, createApiProxyApp } from './apiProxy.js'

// Dev-only: mount the same BFF /api/* proxy the production server uses, so the
// admin tokens stay in Node (this config runs in Node, not the browser) and are
// never inlined into the client bundle. Reads plain, non-VITE_ env vars from the
// `.env` file (loadEnv with an empty prefix) or the process environment.
function apiProxyPlugin(env: Record<string, string>): PluginOption {
  return {
    name: 'bff-api-proxy',
    apply: 'serve',
    configureServer(server) {
      const config = proxyConfigFromEnv({ ...process.env, ...env })
      try {
        assertProxyConfig(config)
      } catch (err) {
        server.config.logger.warn(
          `[bff-api-proxy] ${(err as Error).message} — /api routes will fail until it is set.`,
        )
      }
      server.middlewares.use(createApiProxyApp(config))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix loads all env vars (including the non-VITE_ server-side ones).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    server: {
      allowedHosts: true,
    },
    plugins: [
      react(),
      tailwindcss(),
      apiProxyPlugin(env),
    ],
  }
})
