import type { CardInstance, FormatChoice, Scenario, Source, VeramoFormat } from "./types"
import type { DisclosureGroup } from "../tabs"
import { CARD_BY_ID, cardValues, veramoConfigurationId } from "./cards"
import { irmaCredential } from "./build"
import compactJson from "../compactJson"
import { IRMA_SERVER_URL, startIrmaSession, irmaWalletLink, pollIrmaSession } from "../irma"
import { preAuthGrant, startEudiIssuerSession } from "../issuers"
import { describePresentation, eudiRequest, parseIrmaResult, presentationsOf } from "../verifiers"

// Running what scenarios describe: issuing one card instance from a source, and
// starting a scenario's disclosure with the session options applied.

const VERAMO_ISSUER_KEY = "pre-auth"
const ONE_YEAR_SECONDS = 31536000
const EXPIRE_SOON_SECONDS = 60

// --- issuing -------------------------------------------------------------------

export interface Issuance {
  // What was sent, for display.
  request: object
  walletLink: string
  txCode?: string
  // Resolves true once the wallet has the credential. Absent when the issuer
  // can't be asked (EUDI): the operator confirms instead.
  poll?: () => Promise<boolean>
  // Revokes what this issuance issued. Present only once it is issued and only
  // where the source supports revoking it.
  revoke?: () => Promise<void>
}

export function canIssue(source: Source, instance: CardInstance, format: VeramoFormat = "sd"): string | null {
  const def = CARD_BY_ID[instance.card]
  if (source === "pbdf") return "pbdf-staging cards come from the real staging issuers: add it in the Yivi app."
  if (source === "irma") {
    if (!def.irma) return "No irma-demo type for this card."
    if (instance.state === "revoked" && !def.irma.revocable) return "This irma-demo type can't be revoked."
    return null
  }
  if (source === "veramo") {
    if (!def.veramo) return "No Veramo type for this card."
    if (!def.veramo.available[format]) return `${veramoConfigurationId(def, format)} still has to be added to the Veramo issuer.`
    if (instance.state === "revoked" && !def.veramo.revocable) return `${veramoConfigurationId(def, format)} has no status list, so it can't be revoked yet.`
    return null
  }
  if (!def.eudi?.length) return "The EUDI issuer has nothing for this card."
  if (instance.state) return "The EUDI issuer can't revoke or expire a credential early."
  return null
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
}

async function issueIrma(instances: CardInstance[]): Promise<Issuance> {
  const credentials = instances.map((i) => irmaCredential(i, `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`))
  const request = { "@context": "https://irma.app/ld/request/issuance/v2", credentials }
  const session = await startIrmaSession(JSON.stringify(request))
  let issued = false
  const issuance: Issuance = {
    request,
    walletLink: irmaWalletLink(session.sessionPtr),
    poll: async () => {
      issued = issued || (await pollIrmaSession(session.token)) !== null
      if (issued) {
        const revocable = credentials.filter((c) => "revocationKey" in c) as { credential: string; revocationKey: string }[]
        if (revocable.length) {
          issuance.revoke = async () => {
            for (const c of revocable) {
              const r = await postJson(`${IRMA_SERVER_URL}/revocation`, {
                "@context": "https://irma.app/ld/request/revocation/v1",
                type: c.credential,
                revocationKey: c.revocationKey,
              })
              if (!r.ok) throw new Error(`Revoking ${c.credential} failed (HTTP ${r.status}): ${await r.text()}`)
            }
          }
        }
      }
      return issued
    },
  }
  return issuance
}

async function issueVeramo(instance: CardInstance, format: VeramoFormat): Promise<Issuance> {
  const def = CARD_BY_ID[instance.card]
  const configurationId = veramoConfigurationId(def, format)
  const request = {
    credentials: [configurationId],
    grants: preAuthGrant,
    credentialMetadata: { expiration: instance.state === "expired" ? EXPIRE_SOON_SECONDS : ONE_YEAR_SECONDS },
    credentialDataSupplierInput: def.veramo!.data(cardValues(instance.card, instance.values)),
  }
  const response = await postJson(`/api/issuer/${VERAMO_ISSUER_KEY}/offer`, request)
  if (response.status === 401)
    throw new Error("The Veramo issuer rejected the admin token (HTTP 401). Set a token it accepts as VERAMO_ISSUER_ADMIN_TOKEN in .env and restart the dev server.")
  if (!response.ok) throw new Error(`Failed to create credential offer (HTTP ${response.status})`)
  const offer = (await response.json()) as { uri?: string; id?: string; txCode?: string }
  if (!offer.uri || !offer.id) throw new Error("Offer response is missing 'uri' or 'id'")

  const issuance: Issuance = {
    request,
    walletLink: offer.uri,
    txCode: offer.txCode,
    poll: async () => {
      const r = await postJson(`/api/issuer/${VERAMO_ISSUER_KEY}/offer/check`, { id: offer.id })
      if (r.status !== 200) return false
      const { status } = (await r.json()) as { status?: string }
      if (status !== "CREDENTIAL_ISSUED") return false
      if (def.veramo!.revocable) {
        issuance.revoke = async () => {
          // The issuance record carries the revocation handle; the newest one of
          // this type is the one just issued.
          const list = await postJson(`/api/issuer/${VERAMO_ISSUER_KEY}/credentials`, { credential: configurationId })
          if (!list.ok) throw new Error(`Listing issued credentials failed (HTTP ${list.status})`)
          const records = (await list.json()) as { uuid: string }[]
          const uuid = records[records.length - 1]?.uuid
          if (!uuid) throw new Error("The issuer has no record of this credential")
          const r = await postJson(`/api/issuer/${VERAMO_ISSUER_KEY}/revoke`, { uuid, state: "revoke" })
          const result = (await r.json().catch(() => ({}))) as { status?: string }
          // UNKNOWN comes back as HTTP 200 but means nothing was revoked.
          if (!r.ok || result.status === "UNKNOWN") throw new Error(`Revoking failed (${result.status ?? `HTTP ${r.status}`})`)
        }
      }
      return true
    },
  }
  return issuance
}

async function issueEudi(instance: CardInstance, configuration: number): Promise<Issuance> {
  const def = CARD_BY_ID[instance.card]
  const config = def.eudi![configuration] ?? def.eudi![0]
  const request = {
    credentials: [
      { credential_configuration_id: config.configurationId, data: config.data(cardValues(instance.card, instance.values)) },
    ],
  }
  const session = await startEudiIssuerSession(JSON.stringify(request))
  return { request, walletLink: session.walletLink, txCode: session.txCode }
}

export interface IssueOptions {
  veramoFormat?: VeramoFormat
  eudiConfiguration?: number
}

export async function issue(source: Source, instances: CardInstance[], options: IssueOptions = {}): Promise<Issuance> {
  if (source === "irma") return issueIrma(instances)
  if (instances.length !== 1) throw new Error("OpenID4VCI issues one credential per offer")
  if (source === "veramo") return issueVeramo(instances[0], options.veramoFormat ?? "sd")
  if (source === "eudi") return issueEudi(instances[0], options.eudiConfiguration ?? 0)
  throw new Error("pbdf-staging cards can't be issued by this tool")
}

// --- session options -------------------------------------------------------------

export interface SessionOptions {
  kind: "disclose" | "sign"
  device: "qr" | "same"
  pairing: boolean
  returnTo: "none" | "website" | "email" | "phone"
  prefix: "did:jwk" | "did:web"
}

export const DEFAULT_OPTIONS: SessionOptions = {
  kind: "disclose",
  device: "qr",
  pairing: false,
  returnTo: "none",
  prefix: "did:jwk",
}

// On a phone the wallet is on this device: start the session here, and have Yivi
// bring you back to this page afterwards.
export function isPhone(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 767px)").matches
}

export function defaultOptions(): SessionOptions {
  return isPhone() ? { ...DEFAULT_OPTIONS, device: "same", returnTo: "website" } : DEFAULT_OPTIONS
}

// The page to return to after Yivi: this one, marked with a resume id so the page
// can pick the session up again even if the browser opens it in a new tab.
export function returnUrl(resumeId?: string): string {
  const url = new URL(window.location.href)
  url.searchParams.delete("resume")
  if (resumeId) url.searchParams.set("resume", resumeId)
  return url.toString()
}

const RESUME_PREFIX = "session-tool:resume:"

export interface ResumeRecord {
  token: string
  scenario: string
  variant: "irma" | "dcql"
  at: number
}

export function saveResume(id: string, record: ResumeRecord) {
  try {
    localStorage.setItem(RESUME_PREFIX + id, JSON.stringify(record))
  } catch {
    // Without storage the page can't resume, but the session still runs.
  }
}

// A session started on this phone, if this page load is Yivi bringing you back.
export function takeResume(id: string | null): ResumeRecord | null {
  if (!id) return null
  try {
    const raw = localStorage.getItem(RESUME_PREFIX + id)
    if (!raw) return null
    const record = JSON.parse(raw) as ResumeRecord
    // Sessions expire on the server long before this, so anything older is stale.
    return Date.now() - record.at < 30 * 60 * 1000 ? record : null
  } catch {
    return null
  }
}

export function forgetResume(id: string) {
  try {
    localStorage.removeItem(RESUME_PREFIX + id)
  } catch {
    // Nothing to forget.
  }
}

// Picks up an IRMA session's result after returning from Yivi.
export function resumeIrma(token: string): Disclosure {
  return {
    walletLink: "",
    poll: async () => {
      const raw = await pollIrmaSession(token)
      return raw ? { groups: parseIrmaResult(raw), raw } : null
    },
  }
}

const RETURN_URLS: Record<SessionOptions["returnTo"], string | undefined> = {
  none: undefined,
  website: undefined, // this page; filled in at run time
  email: "mailto:demo@example.org",
  phone: "tel:+31201234567",
}

// The body this tool would POST, as text: what the request column shows and the
// editor starts from. Everything a session option changes is in here, so what
// you see is what is sent.
export function requestBody(
  scenario: Scenario,
  variant: "irma" | "dcql",
  formats: FormatChoice,
  options: SessionOptions,
  resumeId?: string
): string {
  if (variant === "irma") {
    const irma = scenario.irma!
    const request: Record<string, unknown> = { ...(irma.request as Record<string, unknown>) }
    const isDisclosure = String(request["@context"]).includes("/disclosure/")
    if (isDisclosure && options.kind === "sign") {
      request["@context"] = "https://irma.app/ld/request/signature/v2"
      request.message = `I agree to the terms of “${scenario.title}”.`
    }
    const clientReturnUrl = options.returnTo === "website" ? returnUrl(resumeId) : RETURN_URLS[options.returnTo]
    if (clientReturnUrl) request.clientReturnUrl = clientReturnUrl
    if (irma.nextSession) request.nextSession = { url: `${window.location.origin}/api/irma/next-session/${irma.nextSession}` }
    return compactJson(request)
  }
  const dcql = scenario.dcql!
  const query = dcql.query(formats)
  return compactJson(dcql.source === "veramo" ? { dcql: query } : eudiRequest(query))
}

// --- disclosure -------------------------------------------------------------------

export interface DisclosureResult {
  groups: DisclosureGroup[]
  raw: unknown
}

export interface Disclosure {
  walletLink: string
  // IRMA's requestor token, to pick the result up again after returning from Yivi.
  token?: string
  poll: () => Promise<DisclosureResult | null>
  // IRMA pairing: the code the frontend must check, and how to finish pairing.
  pairing?: {
    isPairing: () => Promise<boolean>
    complete: (enteredCode: string) => Promise<boolean>
  }
}

async function startIrma(body: string, options: SessionOptions): Promise<Disclosure> {
  const session = await startIrmaSession(body)
  const frontendUrl = (session.sessionPtr as unknown as { u: string }).u + "/frontend"
  const authorization = session.frontendRequest?.authorization ?? ""
  let pairing: Disclosure["pairing"]

  if (options.pairing) {
    const r = await fetch(`${frontendUrl}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({ "@context": "https://irma.app/ld/request/frontendoptions/v1", pairingMethod: "pin" }),
    })
    if (!r.ok) throw new Error(`Enabling pairing failed (HTTP ${r.status})`)
    const { pairingCode } = (await r.json()) as { pairingCode?: string }
    pairing = {
      isPairing: async () => {
        const s = await fetch(`${IRMA_SERVER_URL}/session/${session.token}/status`)
        return s.ok && (await s.json()) === "PAIRING"
      },
      // The wallet shows the code; the person types it here, and only a match
      // lets the session continue.
      complete: async (entered) => {
        if (entered.trim() !== pairingCode) return false
        const done = await fetch(`${frontendUrl}/pairingcompleted`, { method: "POST", headers: { Authorization: authorization } })
        return done.ok
      },
    }
  }

  return {
    walletLink: irmaWalletLink(session.sessionPtr),
    token: session.token,
    pairing,
    poll: async () => {
      const raw = await pollIrmaSession(session.token)
      return raw ? { groups: parseIrmaResult(raw), raw } : null
    },
  }
}

async function startEudiVerifier(body: string): Promise<Disclosure> {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/ui/presentations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
  if (!response.ok) throw new Error(`Failed to create presentation session (HTTP ${response.status})`)
  const json = (await response.json()) as Record<string, string>
  const transactionId = json.transaction_id
  if (!transactionId) throw new Error("Presentation response is missing 'transaction_id'")
  return {
    walletLink: `openid4vp://?${new URLSearchParams(json)}`,
    poll: async () => {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/ui/presentations/${transactionId}`)
      if (r.status !== 200) return null
      const raw = (await r.json()) as { vp_token?: Record<string, unknown> }
      if (!raw.vp_token || typeof raw.vp_token !== "object") return null
      const groups = Object.entries(raw.vp_token).flatMap(([queryId, entry]) =>
        presentationsOf(entry).map((p) => describePresentation(queryId, p))
      )
      return { groups, raw }
    },
  }
}

async function startVeramoVerifier(body: string, prefix: SessionOptions["prefix"]): Promise<Disclosure> {
  const verifier = prefix === "did:web" ? "didweb-verifier" : "verifier"
  const response = await fetch(`/api/${verifier}/offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
  if (response.status === 401)
    throw new Error(
      `The Veramo ${verifier} rejected the admin token (HTTP 401). Set a token it accepts as ${verifier === "verifier" ? "VERAMO_ADMIN_TOKEN" : "VERAMO_DIDWEB_ADMIN_TOKEN"} in .env and restart the dev server.`
    )
  if (!response.ok) throw new Error(`Failed to create DCQL offer (HTTP ${response.status})`)
  const json = (await response.json()) as { state?: string; requestUri?: string }
  if (!json.state || !json.requestUri) throw new Error("Offer response is missing 'state' or 'requestUri'")
  return {
    walletLink: json.requestUri,
    poll: async () => {
      const r = await fetch(`/api/${verifier}/offer/${encodeURIComponent(json.state!)}`)
      if (r.status !== 200) return null
      const raw = (await r.json()) as {
        status?: string
        result?: { credentials?: Record<string, { claims: Record<string, unknown> }[]> }
      }
      if (raw.status !== "VERIFIED" && raw.status !== "RESPONSE_RECEIVED") return null
      const groups = Object.entries(raw.result?.credentials ?? {}).map(([queryId, creds]) => ({
        label: queryId,
        disclosures: creds.flatMap((c) =>
          Object.entries(c.claims).map(([key, value]) => ({
            key,
            value: typeof value === "string" ? value : JSON.stringify(value),
          }))
        ),
      }))
      return { groups, raw }
    },
  }
}

export async function startDisclosure(
  scenario: Scenario,
  variant: "irma" | "dcql",
  body: string,
  options: SessionOptions
): Promise<Disclosure> {
  if (variant === "irma") return startIrma(body, options)
  return scenario.dcql!.source === "veramo" ? startVeramoVerifier(body, options.prefix) : startEudiVerifier(body)
}
