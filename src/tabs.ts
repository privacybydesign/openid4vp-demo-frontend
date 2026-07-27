import { irmaVerifier, eudiVerifier, veramoVerifier } from "./verifiers"
import { veramoIssuer } from "./issuers"
import type { LinkForm } from "./walletLink"

export type TabId = "irma" | "eudi" | "veramo-verifier" | "veramo-issuer" | "revocation"

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

// A note the verifier attached to a presentation. Status list outcomes arrive
// this way (STATUS_LIST_REVOKED, STATUS_LIST_VALID, NO_STATUS_LIST, ...): the
// Veramo verifier reports revocation as a message and still marks the session
// VERIFIED, so a revoked credential is only distinguishable from a valid one
// by reading these.
export interface VerifierMessage {
  code: string
  message?: string
  value?: unknown
}

export interface VerifierPollResult {
  disclosures: DisclosureContent[][]
  messages?: VerifierMessage[]
}

export interface VerifierSessionResult {
  walletLink?: string
  poll?: () => Promise<VerifierPollResult | null>
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

// The revocation tab has no request, no session and nothing to poll, so it
// shares none of the fields the other two kinds are built around. It renders
// its own panel and owns its own state.
export interface RevocationTabConfig extends TabBase {
  kind: "revocation"
}

export type TabConfig = VerifierTabConfig | IssuerTabConfig | RevocationTabConfig

export const revocationTab: RevocationTabConfig = {
  kind: "revocation",
  tab: "revocation",
  label: "Revocation",
}

export const tabs: TabConfig[] = [
  irmaVerifier,
  eudiVerifier,
  veramoVerifier,
  veramoIssuer,
  revocationTab,
]
