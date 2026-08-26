import { irmaVerifier, eudiVerifier, veramoVerifier } from "./verifiers"
import { veramoIssuer } from "./issuers"
import { dcApiVerifier } from "./dcApi"
import type { LinkForm } from "./walletLink"

export type TabId = "irma" | "eudi" | "veramo-verifier" | "veramo-issuer" | "dc-api"

export type IssuerMode = "pre-authorized-code" | "authorization-code"

export interface DisclosureContent {
  key: string
  value: string
}

export interface Preset {
  label: string
  request: object
}

interface TabBase {
  tab: TabId
  label: string
}

export interface VerifierSessionResult {
  walletLink?: string
  poll?: () => Promise<DisclosureContent[][] | null>
  disclosures?: DisclosureContent[][]
}

export interface IssuanceComplete {
  credentialName: string
}

export interface IssuerSessionResult {
  walletLink: string
  txCode?: string
  poll: () => Promise<IssuanceComplete | null>
}

export interface VerifierTabConfig extends TabBase {
  kind: "verifier"
  defaultRequest: object
  presets?: Preset[]
  startSession: (request: string, linkForm: LinkForm) => Promise<VerifierSessionResult>
}

export interface IssuerModeConfig {
  label: string
  defaultRequest: object
  presets: Preset[]
  startSession: (request: string) => Promise<IssuerSessionResult>
}

export interface IssuerTabConfig extends TabBase {
  kind: "issuer"
  modes: Record<IssuerMode, IssuerModeConfig>
  defaultMode: IssuerMode
}

// A transaction started at the DC API verifier, plus the two values this tool filled
// in for the operator. Keeping the nonce and origin we actually sent is what lets the
// request view check the signed request against them rather than against itself.
export interface DcApiTransaction {
  transactionId: string
  // The request object, inline as a compact JWS. The DC API endpoints hardcode JAR
  // EmbedOption.ByValue, so there is no request_uri and nothing to fetch.
  request: string
  nonce: string
  origin: string
}

// The Digital Credentials API tab is a kind of its own, not a verifier tab: the
// exchange runs in two operator-driven steps, there is no wallet link and no polling,
// and it lands on its own view between them.
export interface DcApiTabConfig extends TabBase {
  kind: "dcapi"
  defaultRequest: object
  presets?: Preset[]
  createRequest: (request: string) => Promise<DcApiTransaction>
  present: (tx: DcApiTransaction) => Promise<DisclosureContent[][]>
}

export type TabConfig = VerifierTabConfig | IssuerTabConfig | DcApiTabConfig

export const tabs: TabConfig[] = [irmaVerifier, eudiVerifier, veramoVerifier, veramoIssuer, dcApiVerifier]
