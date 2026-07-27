# openid4vp-demo-frontend

A small Vite + React tool for exercising the Yivi verifier and Veramo
verifier/issuer flows (IRMA, EUDI, Veramo Verifier, Veramo Issuer, Revocation
tabs).

## Revocation

The **Revocation** tab lists the credentials the Veramo issuer has issued and
revokes or unrevokes them against the status list agent.

Only `StatusListCredentialSdJwt` can be revoked: it is the single credential
type `test-issuer.json` declares a `statusLists` block for, so it is the only
one that gets a status list entry at issuance. Issue one from the **Veramo
Issuer** tab with the *Status List Credential (revocable)* preset
(pre-authorized-code mode only — `authcode-issuer` has no status list config).

Revoking flips a bit on a published list. It does not touch the holder's copy,
which stays cryptographically valid and will still present successfully — the
**Veramo Verifier** tab shows the difference as a `STATUS_LIST_REVOKED` warning
above the disclosure table, not as a failure.

> **The verifier caches status lists for 60 minutes.** After revoking, the
> Veramo Verifier tab can keep reporting the credential valid for up to an
> hour. Revoke *before* the first presentation, or restart the
> `veramo-verifier` pod between presentations. The Revocation tab is
> unaffected: it reads the status list agent directly.

## Running

Both run paths point at the same staging backends; pick whichever is more
convenient.

### Local (`npm run dev`)

```sh
npm install
npm run dev
```

Vite picks up `.env` automatically, so the staging URLs are pre-wired. Open
http://localhost:5173/.

### Docker

```sh
docker compose up --build
```

`docker-compose.yml` injects the same backend URLs through `entry-point.sh`.
Open http://localhost:8080/.

## Configuration

`.env` defines the staging endpoints the app talks to. Override any of the
following to point at a different environment:

| Var                         | Used by                              |
| --------------------------- | ------------------------------------ |
| `VITE_API_URL`              | OpenID4VP verifier API (IRMA / EUDI) |
| `VITE_VERAMO_API_URL`       | Veramo verifier API                  |
| `VITE_VERAMO_VERIFIER_NAME` | Veramo verifier instance name        |
| `VITE_VERAMO_ADMIN_TOKEN`   | Veramo verifier admin token          |
| `VITE_IRMA_SERVER_URL`      | IRMA server (status / cancel)        |
| `VITE_UNIVERSAL_LINK_HOST`  | Host for OpenID4VC universal links (default `open.yivi.app`) |

The source defaults (`src/verifiers.ts`, `src/issuers.ts`) cover the Veramo
issuer endpoints. Override `VITE_VERAMO_ISSUER_API_URL`,
`VITE_VERAMO_ISSUER_NAME`, or `VITE_VERAMO_ISSUER_ADMIN_TOKEN` if you need to
target a different issuer.

## Build / lint

```sh
npm run build   # tsc -b && vite build
npm run lint
```
