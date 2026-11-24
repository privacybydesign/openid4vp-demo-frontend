// Production server: serves the built SPA and proxies the Veramo verifier/issuer
// admin APIs so the admin tokens never reach the browser.
//
// Every env var read here is SERVER-ONLY (no VITE_ prefix), so nothing sensitive
// is inlined into the client bundle. The /api/* proxy routes live in apiProxy.js
// and are shared with the Vite dev server (see vite.config.ts).

import express from "express"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { proxyConfigFromEnv, assertProxyConfig, mountApiProxy } from "./apiProxy.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, "dist")

const PORT = Number(process.env.PORT ?? "8080")
const HOST = process.env.HOST ?? "0.0.0.0"

const config = proxyConfigFromEnv(process.env)
try {
  assertProxyConfig(config)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

const app = express()
app.disable("x-powered-by")

app.get("/healthz", (_req, res) => res.json({ ok: true }))

mountApiProxy(app, config)

// Static SPA (the `vite build` output).
app.use(express.static(DIST_DIR))

// SPA fallback: anything not matched above serves index.html. Uses a middleware
// (not a "*" route) so it works on both Express 4 and 5.
app.use((_req, res) => res.sendFile(path.join(DIST_DIR, "index.html")))

app.listen(PORT, HOST, () => {
  console.log(`BFF listening on http://${HOST}:${PORT}`)
})
