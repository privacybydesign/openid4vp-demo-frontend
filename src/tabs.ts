import { irmaVerifier, eudiVerifier, veramoVerifier } from "./verifiers"
import { veramoIssuer } from "./issuers"

export type TabId = "irma" | "eudi" | "veramo-verifier" | "veramo-issuer"

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
  defaultRequest: object
  presets?: Preset[]
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
  startSession: (request: string) => Promise<VerifierSessionResult>
}

export interface IssuerTabConfig extends TabBase {
  kind: "issuer"
  startSession: (request: string) => Promise<IssuerSessionResult>
}

export type TabConfig = VerifierTabConfig | IssuerTabConfig

export const tabs: TabConfig[] = [irmaVerifier, eudiVerifier, veramoVerifier, veramoIssuer]
