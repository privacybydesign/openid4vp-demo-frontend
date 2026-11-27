// The W3C Digital Credentials API: this page asks the wallet directly through
// navigator.credentials.get, with an unsigned OpenID4VP request (OpenID4VP 1.0
// Appendix A). No verifier is involved: the response comes back to this page,
// which only reads it; nothing checks its signatures.

// Unsigned: the request carries its parameters inline, there is no client_id,
// and the wallet shows the page by its origin.
export const DC_API_PROTOCOL = "openid4vp-v1-unsigned"

// Chrome (on Android, or on a desktop paired with a phone), over HTTPS or localhost.
export function dcApiAvailable(): boolean {
  return typeof window !== "undefined" && "DigitalCredential" in window && typeof navigator.credentials?.get === "function"
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// The `data` of the request: what the wallet reads as the OpenID4VP request.
export function dcApiRequestData(dcqlQuery: object): object {
  return {
    response_type: "vp_token",
    response_mode: "dc_api",
    nonce: randomNonce(),
    dcql_query: dcqlQuery,
  }
}

// The wallet's Authorization Response: {"vp_token": {"<query id>": ["<presentation>"]}}.
export interface DcApiResponse {
  vp_token?: Record<string, unknown>
}

// Asks the wallet; resolves with its response. Must start from a user gesture.
export async function requestViaDcApi(data: object): Promise<DcApiResponse> {
  if (!dcApiAvailable()) {
    throw new Error("This browser has no Digital Credentials API. Use Chrome on Android (or a desktop paired with one), over HTTPS or localhost.")
  }
  const options = { digital: { requests: [{ protocol: DC_API_PROTOCOL, data }] } }
  // The Digital Credentials API is not in TypeScript's DOM types yet.
  const result = await navigator.credentials.get(options as CredentialRequestOptions)
  if (!result) throw new Error("The wallet returned no credential")
  const raw = (result as unknown as { data: unknown }).data
  const response = (typeof raw === "string" ? JSON.parse(raw) : raw) as DcApiResponse
  if (!response?.vp_token) throw new Error("The wallet response carries no vp_token")
  return response
}
