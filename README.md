# openid4vp-demo-frontend

A small Vite + React tool for exercising the Yivi verifier and Veramo
verifier/issuer flows (IRMA, EUDI, Veramo Verifier, Veramo Issuer tabs).

## Architecture

The Veramo verifier/issuer flows require admin bearer tokens. Those tokens are
**never exposed to the browser** — they would be readable by anyone if inlined
into the client bundle. Instead a small backend-for-frontend (BFF) proxy
(`server.js`, routes in `apiProxy.js`) holds the tokens server-side and exposes
credential-free, same-origin routes to the SPA:

| Browser calls              | Proxied to (with `Bearer` token)                   |
| -------------------------- | -------------------------------------------------- |
| `POST /api/verifier/offer` | `…/{verifier}/api/create-dcql-offer`               |
| `GET  /api/verifier/offer/:state` | `…/{verifier}/api/check-offer/{state}`      |
| `POST /api/issuer/:key/offer`       | `…/{issuer}/api/create-offer`             |
| `POST /api/issuer/:key/offer/check` | `…/{issuer}/api/check-offer`              |

`:key` is an allow-listed issuer key (`pre-auth` \| `authcode`) mapped to a real
issuer name server-side. The same proxy is mounted on the Vite dev server (via
`vite.config.ts`), so local dev behaves like production.

## Running

Both run paths point at the same staging backends; pick whichever is more
convenient.

### Local (`npm run dev`)

```sh
npm install
npm run dev
```

Vite picks up `.env` automatically (including the server-only vars used by the
dev proxy), so the staging URLs are pre-wired. Open http://localhost:5173/.

### Docker

```sh
docker compose up --build
```

`docker-compose.yml` injects the config through `entry-point.sh`, which builds
the SPA and serves it behind the BFF (`npm start`). Open http://localhost:8080/.

## Configuration

`.env` defines the staging endpoints the app talks to. Copy `.env.example` and
override any of the following to point at a different environment.

**Public** (`VITE_`-prefixed — inlined into the client bundle; never a secret):

| Var                         | Used by                              |
| --------------------------- | ------------------------------------ |
| `VITE_API_URL`              | OpenID4VP verifier API (IRMA / EUDI) |
| `VITE_VERAMO_ISSUER_API_URL`| Veramo issuer base (VCT display URL) |
| `VITE_IRMA_SERVER_URL`      | IRMA server (status / cancel)        |
| `VITE_UNIVERSAL_LINK_HOST`  | Host for OpenID4VC universal links (default `open.yivi.app`) |

**Server-only** (no `VITE_` prefix — read by the BFF proxy, never sent to the browser):

| Var                             | Used by                              |
| ------------------------------- | ------------------------------------ |
| `VERAMO_API_URL`                | Veramo verifier API                  |
| `VERAMO_VERIFIER_NAME`          | Veramo verifier instance name        |
| `VERAMO_ADMIN_TOKEN`            | Veramo verifier admin token (secret) |
| `VERAMO_ISSUER_API_URL`         | Veramo issuer API                    |
| `VERAMO_ISSUER_NAME`            | Issuer name for the `pre-auth` key   |
| `VERAMO_AUTHCODE_ISSUER_NAME`   | Issuer name for the `authcode` key   |
| `VERAMO_ISSUER_ADMIN_TOKEN`     | Veramo issuer admin token (secret)   |

## Build / lint

```sh
npm run build   # tsc -b && vite build
npm run lint
```
