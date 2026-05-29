import { irmaVerifier, eudiVerifier, veramoVerifier } from "./verifiers"
import { veramoIssuer } from "./issuers"

export type TabId = "irma" | "eudi" | "veramo-verifier" | "veramo-issuer"

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
  startSession: (request: string) => Promise<VerifierSessionResult>
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

export type TabConfig = VerifierTabConfig | IssuerTabConfig

export const tabs: TabConfig[] = [irmaVerifier, eudiVerifier, veramoVerifier, veramoIssuer]
