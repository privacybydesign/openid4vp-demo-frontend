import type { DcApiTabConfig, DcApiTransaction, DisclosureContent, Preset } from "./tabs"
import { ISSUER_CHAIN, parseSdJwtVc } from "./verifiers"

// ---------------------------------------------------------------------------
// Digital Credentials API verifier
// ---------------------------------------------------------------------------
//
// Drives the separate EUDI verifier deployment that serves OpenID4VP over the W3C
// Digital Credentials API (dcapi-verifier.tf in openid4vc-poc-ops). That instance is a
// deployment of its own because its endpoints run the ETSI TS 119 472-2 profile, which
// the verifier only accepts with clientIdPrefix x509_hash — a server-global setting,
// while the QR flow needs x509_san_dns.
//
// This tab cannot complete a disclosure today: no Yivi wallet registers as a Digital
// Credentials API credential provider, so the browser finds nothing to ask. See
// docs/adr/0002 for why the flow is split into two operator-driven steps.

// `||` (not `??`) so an empty-string env var — which `export FOO=$UNSET` in sh
// produces, and which Vite would otherwise bake in — also falls back to the default.
const DCAPI_BASE =
  import.meta.env.VITE_DCAPI_API_URL || "https://verifierapi-dcapi.openid4vc.staging.yivi.app"

// The intended use the verifier image configures out of the box, same as the EUDI tab.
// From v0.11.0 a transaction that names neither an intended use nor a registration
// certificate is refused.
const DCAPI_INTENDED_USE_ID = "1"

// OpenID4VP 1.0 Appendix A.1. This verifier always produces the signed form: the DC API
// endpoints hardcode the ETSI profile and JAR EmbedOption.ByValue.
const DCAPI_PROTOCOL = "openid4vp-v1-signed"

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

// `DigitalCredential` is the global the platform exposes when the API is present, and is
// the detection the spec documents. Testing `"digital" in navigator.credentials` instead
// would always be false: `digital` is a member of the request options passed to get(),
// not a property of the CredentialsContainer.
export function dcApiSupported(): boolean {
  return typeof window !== "undefined" && "DigitalCredential" in window
}

// ---------------------------------------------------------------------------
// Step 1 — start the transaction
// ---------------------------------------------------------------------------

function randomNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function bodyOf(response: Response): Promise<string> {
  return (await response.text().catch(() => "")).trim()
}

// Fills in `origin` and `nonce` only when the operator left them out, so everything
// visible in the editor is still POSTed verbatim (CONTEXT.md's rule for a Request).
// Both have to be right for the flow to work at all — the response is bound to the
// origin and to the nonce — but overwriting them would also make the expected_origins
// rejection path impossible to exercise from the tab.
async function createRequest(requestText: string): Promise<DcApiTransaction> {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(requestText)
  } catch (error) {
    throw new Error(
      `The request is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }

  const origin = typeof parsed.origin === "string" && parsed.origin ? parsed.origin : window.location.origin
  const nonce = typeof parsed.nonce === "string" && parsed.nonce ? parsed.nonce : randomNonce()

  const response = await fetch(`${DCAPI_BASE}/ui/presentations/dc-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...parsed, origin, nonce }),
  })
  if (!response.ok) {
    // The body is the whole diagnosis here: MissingRegistrationCertificate and the
    // attestation-classification errors are only distinguishable from it.
    const detail = await bodyOf(response)
    throw new Error(
      `The verifier rejected the transaction (HTTP ${response.status})${detail ? `: ${detail}` : ""}`
    )
  }

  const json = await response.json()
  const request = json["request"]
  const transactionId = json["transaction_id"]
  if (typeof request !== "string" || !request) {
    throw new Error("The verifier's response is missing the 'request' object")
  }
  if (typeof transactionId !== "string" || !transactionId) {
    throw new Error("The verifier's response is missing 'transaction_id'")
  }

  return { transactionId, request, nonce, origin }
}

// ---------------------------------------------------------------------------
// Step 2 — hand it to the platform, forward the response, read the claims
// ---------------------------------------------------------------------------

function describeGetFailure(error: unknown): string {
  switch (error instanceof DOMException ? error.name : "") {
    case "NotAllowedError":
    case "NotSupportedError":
      // NotAllowedError also covers a lost transient user activation, which is why the
      // button stays armed: clicking again rules that reading out, and the two-step
      // flow exists precisely so the two causes do not blur together.
      return (
        "No wallet on this device is registered as a Digital Credentials API provider. " +
        "Yivi does not register as one yet, so this is the expected outcome today. " +
        "(Chrome raises the same error when the click that triggered the call was too " +
        "long ago — clicking the button again rules that out.)"
      )
    case "AbortError":
      return "The request was dismissed before a credential was selected."
    case "InvalidStateError":
      return "The browser refused the request as malformed. The decoded request object above is what was handed to it."
    default:
      return error instanceof Error ? error.message : String(error)
  }
}

function readResponseObject(credential: DigitalCredential): Record<string, unknown> {
  // Chrome has exposed `data` both as a parsed object and as its JSON text across
  // versions, so accept either rather than pinning to whichever shipped last.
  const data = credential.data
  const parsed = typeof data === "string" ? JSON.parse(data) : data
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The wallet response carries no object in its 'data' member")
  }
  return parsed as Record<string, unknown>
}

async function forwardResponse(tx: DcApiTransaction, responseObject: Record<string, unknown>): Promise<void> {
  // Form-encoded, not JSON: the platform posts one form parameter per member of the
  // response object, string members verbatim and everything else (vp_token is an
  // object) as its JSON text. Mirrors PostDcApiWalletResponseToEudiVerifier in
  // irmago's session tests, which stands in for the platform there.
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(responseObject)) {
    params.set(name, typeof value === "string" ? value : JSON.stringify(value))
  }

  const response = await fetch(`${DCAPI_BASE}/ui/presentations/${tx.transactionId}/dc-api`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  if (!response.ok) {
    const detail = await bodyOf(response)
    throw new Error(
      `The verifier rejected the wallet response (HTTP ${response.status})${detail ? `: ${detail}` : ""}`
    )
  }
}

// The same endpoint the EUDI tab polls, so the vp_token shape is identical.
async function readDisclosures(tx: DcApiTransaction): Promise<DisclosureContent[][]> {
  const result = await fetch(`${DCAPI_BASE}/ui/presentations/${tx.transactionId}`)
  if (!result.ok) {
    throw new Error(`Could not read the disclosed claims (HTTP ${result.status})`)
  }
  const response = await result.json()
  const entries = new Map<string, string[]>(Object.entries(response["vp_token"]))
  return Array.from(entries.values(), (sdjwts) => sdjwts.map(parseSdJwtVc).flat())
}

async function present(tx: DcApiTransaction): Promise<DisclosureContent[][]> {
  if (!dcApiSupported()) {
    throw new Error(
      "This browser does not implement the Digital Credentials API. Chrome on Android is the realistic target."
    )
  }

  // navigator.credentials.get() requires transient user activation, so nothing may be
  // awaited before it — not here and not in the caller. See docs/adr/0002.
  let credential: DigitalCredential | null
  try {
    credential = (await navigator.credentials.get({
      digital: {
        // `data` is an object per Appendix A.3.2.1. Early Chrome builds wanted its JSON
        // text instead; if a browser rejects the request as malformed, that is the first
        // thing to check.
        requests: [{ protocol: DCAPI_PROTOCOL, data: { request: tx.request } }],
      },
    })) as DigitalCredential | null
  } catch (error) {
    throw new Error(describeGetFailure(error), { cause: error })
  }
  if (!credential) {
    throw new Error("The browser returned no credential and reported no error")
  }

  await forwardResponse(tx, readResponseObject(credential))
  return await readDisclosures(tx)
}

// ---------------------------------------------------------------------------
// Reading the signed request back
// ---------------------------------------------------------------------------

export interface DecodedRequest {
  header: Record<string, unknown>
  payload: Record<string, unknown>
}

function decodeSegment(segment: string): Record<string, unknown> {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function decodeRequest(jws: string): DecodedRequest {
  const segments = jws.split(".")
  if (segments.length !== 3) {
    throw new Error(`Expected a compact JWS with three segments, got ${segments.length}`)
  }
  return { header: decodeSegment(segments[0]), payload: decodeSegment(segments[1]) }
}

export interface RequestCheck {
  label: string
  ok: boolean
  detail: string
}

// RFC 6454 origin comparison. `new URL()` already drops a default port, so comparing
// protocol and host is enough to make https://example.com and https://example.com:443
// equal — the same normalisation irmago's sameOrigin does on the wallet side.
function sameOrigin(a: string, b: string): boolean {
  if (a === b) return true
  try {
    const left = new URL(a)
    const right = new URL(b)
    return left.protocol === right.protocol && left.host.toLowerCase() === right.host.toLowerCase()
  } catch {
    return false
  }
}

function show(value: unknown): string {
  return value === undefined || value === null ? "absent" : String(value)
}

// What the tab is for: the checks that say whether the deployment and this frontend
// actually agree, rather than leaving them to be eyeballed against a plan document.
export function checkRequest(tx: DcApiTransaction, decoded: DecodedRequest): RequestCheck[] {
  const { header, payload } = decoded
  const clientId = typeof payload.client_id === "string" ? payload.client_id : ""
  const expectedOrigins = Array.isArray(payload.expected_origins)
    ? payload.expected_origins.filter((value): value is string => typeof value === "string")
    : []
  const x5c = Array.isArray(header.x5c) ? header.x5c : []

  return [
    {
      // Deliberately only the prefix. The certificate hash itself is already committed
      // as a terraform literal (verifier_dcapi_client_id); a second copy here would be
      // a second place to forget when the keystore is replaced, and the prefix is what
      // catches the misconfiguration that actually happens.
      label: "client_id uses the x509_hash prefix",
      ok: clientId.startsWith("x509_hash:"),
      detail: clientId || "absent",
    },
    {
      label: "expected_origins contains this browser's origin",
      ok: expectedOrigins.some((origin) => sameOrigin(origin, window.location.origin)),
      detail: expectedOrigins.length ? expectedOrigins.join(", ") : "absent",
    },
    {
      label: "response_mode is dc_api.jwt",
      ok: payload.response_mode === "dc_api.jwt",
      detail: show(payload.response_mode),
    },
    {
      label: "response_type is vp_token",
      ok: payload.response_type === "vp_token",
      detail: show(payload.response_type),
    },
    {
      label: "nonce matches the one sent",
      ok: payload.nonce === tx.nonce,
      detail: show(payload.nonce),
    },
    {
      label: "header carries a certificate chain (x5c)",
      ok: x5c.length > 0,
      detail: x5c.length ? `${x5c.length} certificate(s)` : "absent",
    },
  ]
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

// No jar_mode: the DC API endpoints hardcode EmbedOption.ByValue, so the request comes
// back inline. No origin and no nonce either — createRequest fills those in, and
// omitting them is what makes that filling-in visible rather than an overwrite.
//
// Presets are capped by the shared RP certificate, not by the verifier's attestation
// classifications: environments/dev/keystore.p12 carries Yivi RP metadata in OID
// 2.1.123.1 authorizing seven vcts (pbdf-staging and irma-demo sidn-pbdf.mobilenumber
// and sidn-pbdf.email, plus pbdf-staging.pbdf.passport, .idcard and .drivinglicence).
// A query outside those fails in the wallet, not at the verifier.
function dcApiRequest(dcql_query: object): object {
  return {
    dcql_query,
    intended_use_id: DCAPI_INTENDED_USE_ID,
    issuer_chain: ISSUER_CHAIN,
  }
}

const dcApiPresets: Preset[] = [
  {
    label: "Email",
    request: dcApiRequest({
      credentials: [
        {
          id: "email",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.email"] },
          claims: [{ path: ["email"] }, { path: ["domain"] }],
        },
      ],
    }),
  },
  {
    label: "Passport",
    request: dcApiRequest({
      credentials: [
        {
          id: "passport",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.passport"] },
          claims: [{ path: ["firstName"] }, { path: ["lastName"] }, { path: ["dateOfBirth"] }],
        },
      ],
    }),
  },
  {
    label: "ID + Email (multi-credential)",
    request: dcApiRequest({
      credentials: [
        {
          id: "idcard",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.idcard"] },
          claims: [{ path: ["firstName"] }, { path: ["lastName"] }],
        },
        {
          id: "email",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.email"] },
          claims: [{ path: ["email"] }],
        },
      ],
    }),
  },
]

export const dcApiVerifier: DcApiTabConfig = {
  kind: "dcapi",
  tab: "dc-api",
  label: "DC API",
  defaultRequest: dcApiPresets[0].request,
  presets: dcApiPresets,
  createRequest,
  present,
}
