import type { SessionPtr } from "@privacybydesign/yivi-frontend"

// The IRMA server both IRMA tabs talk to — the verifier tab for disclosure
// sessions, the issuer tab for issuance sessions.
//
// The default is the demo server rather than `is.openid4vc.staging.yivi.app`:
// that one configures `requestors`, so it answers an unauthenticated
// POST /session with "request could not be authenticated", and this tool sends no
// requestor JWT. It is also the only one holding the `irma-demo` scheme this tool
// discloses and issues.
//
// `||` (not `??`) so an empty-string env var falls back to the default rather
// than being baked in as "".
export const IRMA_SERVER_URL = import.meta.env.VITE_IRMA_SERVER_URL || "https://is.demo.staging.yivi.app"

// Response shape of the IRMA server's POST /session endpoint.
export interface IrmaSessionResponse {
  sessionPtr: SessionPtr
  token: string
}

// Starts a session directly against the IRMA server — the same endpoint the yivi
// popup uses — so the session link and its host are under our control.
export async function startIrmaSession(request: string): Promise<IrmaSessionResponse> {
  const response = await fetch(`${IRMA_SERVER_URL}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: request,
  })
  if (!response.ok) {
    throw new Error(`Failed to create IRMA session (HTTP ${response.status})`)
  }
  return (await response.json()) as IrmaSessionResponse
}

// An IRMA session link carries the whole session pointer in its path, unlike the
// query-based openid4vp links. walletLink.ts maps this prefix to the
// universal-link forms.
export function irmaWalletLink(sessionPtr: SessionPtr): string {
  return `irma://qr/json/${encodeURIComponent(JSON.stringify(sessionPtr))}`
}

// Issuance sessions come back with `pairingHint: true` in `frontendRequest`, but
// pairing is opt-in: it only happens once a frontend POSTs
// `pairingMethod: "pin"` to the session's /frontend/options. This tool never
// does, so the server keeps its `none` default and a scanned QR proceeds straight
// to the wallet's consent screen with no code to type.

// The finished session result, or null while it is still running. Throws when the
// user or the clock ended it, so the tab says why instead of polling forever.
export async function pollIrmaSession(token: string): Promise<unknown | null> {
  const response = await fetch(`${IRMA_SERVER_URL}/session/${token}/result`)
  if (response.status !== 200) return null

  const result = (await response.json()) as { status?: string }
  if (result.status === "CANCELLED" || result.status === "TIMEOUT") {
    throw new Error(`IRMA session ${result.status.toLowerCase()}`)
  }
  if (result.status !== "DONE") return null
  return result
}
