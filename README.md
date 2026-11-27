# openid4vp-demo-frontend

A small Vite + React tool for exercising the Yivi verifier and Veramo
verifier/issuer flows. It is organised around **scenarios**: the 44 cases of the
wallet prototype, each with the wallet setup it needs and a native request per
protocol. The old per-implementation tabs live on as the **Playground**.

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
| `POST /api/didweb-verifier/offer` | `…/{verifier}/api/create-dcql-offer`          |
| `GET  /api/didweb-verifier/offer/:state` | `…/{verifier}/api/check-offer/{state}` |
| `POST /api/issuer/:key/offer`       | `…/{issuer}/api/create-offer`             |
| `POST /api/issuer/:key/offer/check` | `…/{issuer}/api/check-offer`              |
| `POST /api/issuer/:key/credentials` | `…/{issuer}/api/list-credentials`         |
| `POST /api/issuer/:key/revoke`      | `…/{issuer}/api/revoke-credential`        |
| `POST /api/irma/next-session/:name` | (served here: an allow-listed IRMA next-session request) |

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
That builds once and serves the result like production, so edits don't show up
until a restart. To develop in Docker with live reload instead, run the dev
server in the container:

```sh
docker compose -f compose.dev.yml up --build
```

Open http://localhost:5173/. It mounts the source, polls it for changes and
reads the same `.env`.

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

| Var                             | Used by                                 |
| ------------------------------- | --------------------------------------- |
| `VERAMO_API_URL`                | Veramo verifier API                     |
| `VERAMO_VERIFIER_NAME`          | Veramo verifier instance name           |
| `VERAMO_ADMIN_TOKEN`            | Veramo verifier admin token (secret)    |
| `VERAMO_DIDWEB_VERIFIER_NAME`   | Veramo verifier instance name (did:web) |
| `VERAMO_DIDWEB_ADMIN_TOKEN`     | Veramo verifier admin token (did:web)   |
| `VERAMO_ISSUER_API_URL`         | Veramo issuer API                       |
| `VERAMO_ISSUER_NAME`            | Issuer name for the `pre-auth` key      |
| `VERAMO_AUTHCODE_ISSUER_NAME`   | Issuer name for the `authcode` key      |
| `VERAMO_ISSUER_ADMIN_TOKEN`     | Veramo issuer admin token (secret)      |

## Digital Credentials API tab

The Verifier > Digital Credentials API tab asks the Yivi wallet for a credential
through the [Digital Credentials API](https://wicg.github.io/digital-credentials/),
with an unsigned OpenID4VP request (`openid4vp-v1-unsigned`, response mode
`dc_api`) sent straight from the page. The verifier backend is not involved. Yivi
shows the site by its origin, as an unknown party, and the page shows the response
without verifying it.

You pick the credential and its attributes from the credential types of the `pbdf`
scheme that are still issued, because the Yivi app registers those with the
Android Credential Manager. The list is in `src/pbdfCredentials.json`; regenerate
it from a checkout of the scheme with:

```sh
scripts/generate-pbdf-credentials.py path/to/irma_configuration/pbdf
```

It needs Chrome 128+ on Android with `chrome://flags/#digital-credentials`
enabled, the Yivi app with Digital Credentials support, and HTTPS (or localhost).

## Scenarios

The sidebar lists the wallet prototype's scenarios, grouped as on the prototype
canvas. A scenario page has three columns:

- **Wallet setup**: what has to be in the wallet *Before* the session, what the
  wallet adds *During* it, and what it *must not contain*. Every card can be
  issued from its row; rows that need a revoked or expiring card do that step
  right after issuing.
- **Request**: the exact body that is POSTed, highlighted (or editable), the
  per-card Veramo format (SD-JWT VC or VCDM) and the session options.
- **Result**: one table per disclosed credential, the raw response, the expected
  disclosure and a Look-for checklist.

A variant exists only where its protocol expresses the scenario natively. Where
the cards come from is decided per variant: irma-demo for IRMA, pbdf-staging on
the EUDI verifier when the wallet has to add cards mid-session, Veramo when the
values matter, and the EUDI issuer for the real PID and mdocs. The scenarios live
in `src/scenarios/`; the card catalogue (`cards.ts`) maps each abstract card onto
each source. **Coverage** (generated from that data) shows what every scenario
can and can't do, and why.

On a phone the tool works on the same device as the wallet: the scenario list
is the first screen, a scenario opens on its Request tab (Setup shows how many
cards are still to issue), sessions start on this phone with an Open Yivi sheet,
and IRMA sessions return to the page. The return URL carries a resume id, so the
result is picked up again even if the browser opens it in a new tab.

All raw JSON is shown through `JsonView`, so it is always highlighted; ESLint
rejects `JSON.stringify` inside JSX.

## Build / lint / test

```sh
npm run build   # tsc -b && vite build
npm run lint
npm test        # scenario data consistency checks (vitest)
```
