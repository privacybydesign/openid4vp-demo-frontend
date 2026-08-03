// Shared BFF proxy routes for the Veramo verifier/issuer admin APIs.
//
// Mounted in two places, both running in Node (never the browser):
//   - server.js        — the production server that also serves the built SPA
//   - vite.config.ts   — the dev server, so `npm run dev` behaves like prod
//
// The admin tokens are read from server-side env only (no VITE_ prefix), so
// they are never inlined into the client bundle.

import express from "express"

const UPSTREAM_TIMEOUT_MS = 15_000

// Build a proxy config from an env-like object ({ KEY: value }).
export function proxyConfigFromEnv(env) {
  return {
    verifierApiUrl: env.VERAMO_API_URL ?? "https://veramo-verifier.openid4vc.staging.yivi.app",
    verifierName: env.VERAMO_VERIFIER_NAME ?? "test-verifier",
    verifierToken: env.VERAMO_ADMIN_TOKEN,

    issuerApiUrl: env.VERAMO_ISSUER_API_URL ?? "https://veramo-issuer.openid4vc.staging.yivi.app",
    // Allow-list: the browser sends a stable key, never a raw upstream name.
    issuers: {
      "pre-auth": env.VERAMO_ISSUER_NAME ?? "test-issuer",
      authcode: env.VERAMO_AUTHCODE_ISSUER_NAME ?? "authcode-issuer",
    },
    issuerToken: env.VERAMO_ISSUER_ADMIN_TOKEN,
  }
}

// Throws if a required admin token is missing. Call at startup to fail fast.
export function assertProxyConfig(config) {
  if (!config.verifierToken) throw new Error("Missing required environment variable: VERAMO_ADMIN_TOKEN")
  if (!config.issuerToken) throw new Error("Missing required environment variable: VERAMO_ISSUER_ADMIN_TOKEN")
}

// Forward to an upstream Veramo endpoint and stream the response back unchanged
// (status + body). Never leaks the token to the client.
async function forward(res, url, init) {
  try {
    const upstream = await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
    const body = await upstream.text()
    res
      .status(upstream.status)
      .type(upstream.headers.get("content-type") ?? "application/json")
      .send(body)
  } catch (err) {
    const timedOut = err?.name === "TimeoutError"
    console.error(`Upstream request to ${url} failed:`, err?.message ?? err)
    res.status(timedOut ? 504 : 502).json({ error: "upstream_request_failed" })
  }
}

// Mount the /api/* proxy routes onto an Express app or Router.
export function mountApiProxy(app, config) {
  app.use(express.json({ limit: "256kb" }))

  // --- Verifier -------------------------------------------------------------
  app.post("/api/verifier/offer", (req, res) =>
    forward(res, `${config.verifierApiUrl}/${config.verifierName}/api/create-dcql-offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.verifierToken}` },
      body: JSON.stringify(req.body),
    })
  )

  app.get("/api/verifier/offer/:state", (req, res) =>
    forward(res, `${config.verifierApiUrl}/${config.verifierName}/api/check-offer/${encodeURIComponent(req.params.state)}`, {
      headers: { Authorization: `Bearer ${config.verifierToken}` },
    })
  )

  // --- Issuer ---------------------------------------------------------------
  const resolveIssuer = (req, res) => {
    const name = config.issuers[req.params.issuerKey]
    if (!name) {
      res.status(400).json({ error: "unknown_issuer" })
      return null
    }
    return name
  }

  app.post("/api/issuer/:issuerKey/offer", (req, res) => {
    const name = resolveIssuer(req, res)
    if (!name) return
    forward(res, `${config.issuerApiUrl}/${name}/api/create-offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.issuerToken}` },
      body: JSON.stringify(req.body),
    })
  })

  app.post("/api/issuer/:issuerKey/offer/check", (req, res) => {
    const name = resolveIssuer(req, res)
    if (!name) return
    forward(res, `${config.issuerApiUrl}/${name}/api/check-offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.issuerToken}` },
      body: JSON.stringify(req.body),
    })
  })

  return app
}

// Convenience: build a standalone Express app with only the proxy routes,
// suitable for use as connect-style middleware (e.g. the Vite dev server).
export function createApiProxyApp(config) {
  return mountApiProxy(express(), config)
}
