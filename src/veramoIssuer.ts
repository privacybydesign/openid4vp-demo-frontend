// Connection details for the Veramo issuer agent, shared by the issuance tab
// (src/issuers.ts), the revocation tab (src/revocation.ts), and the verifier
// presets that need to build VCT URLs (src/verifiers.ts).
import { requireEnv } from "./env"

export const ISSUER_BASE =
  import.meta.env.VITE_VERAMO_ISSUER_API_URL ?? "https://veramo-issuer.openid4vc.staging.yivi.app"

export const PRE_AUTH_ISSUER_NAME = import.meta.env.VITE_VERAMO_ISSUER_NAME ?? "test-issuer"

export const AUTH_CODE_ISSUER_NAME =
  import.meta.env.VITE_VERAMO_AUTHCODE_ISSUER_NAME ?? "authcode-issuer"

export const ISSUER_TOKEN = requireEnv(
  import.meta.env.VITE_VERAMO_ISSUER_ADMIN_TOKEN,
  "VITE_VERAMO_ISSUER_ADMIN_TOKEN"
)

// The admin API on every issuer instance is a bearer-authenticated POST.
export function issuerAuthHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ISSUER_TOKEN}`,
  }
}
