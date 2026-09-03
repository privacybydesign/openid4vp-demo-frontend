import { irmaVerifier, eudiVerifier, veramoVerifier } from "./verifiers"
import { irmaIssuer, veramoIssuer, eudiIssuer } from "./issuers"
import type { LinkForm } from "./walletLink"

export type TabId =
  | "irma-verifier"
  | "eudi-verifier"
  | "veramo-verifier"
  | "irma-issuer"
  | "veramo-issuer"
  | "eudi-issuer"

// Which of a tab's flows is selected. The two OpenID4VCI entries are grant types,
// as advertised in a credential offer's `grants`. `irma-issuance` is not one:
// IRMA issuance is not OpenID4VCI and has no grant to name, so it gets its own
// entry rather than borrowing a grant name it does not use.
export type IssuerMode = "pre-authorized-code" | "authorization-code" | "irma-issuance"

export interface DisclosureContent {
  key: string
  value: string
}

// One credential's worth of disclosures, and what to call it.
//
// The outer dimension was always per-credential — an IRMA discon, a DCQL query id
// — but nothing carried the credential's name and WalletResponseView flattened it
// away. Survivable for a single SD-JWT; not for a request that answers with a PID
// and an mDL, where `family_name` arrives twice with nothing to tell the two
// apart.
//
// `label` is optional because only the EUDI tab has a name worth showing (the
// DCQL query id, plus the docType or vct it asked for). The IRMA and Veramo tabs
// pass none and render exactly as they did.
export interface DisclosureGroup {
  label?: string
  disclosures: DisclosureContent[]
}

export interface Preset {
  label: string
  // Optional heading in the preset picker. A tab whose presets set none renders
  // one flat list, as before.
  group?: string
  request: object
}

interface TabBase {
  tab: TabId
  label: string
}

export interface VerifierSessionResult {
  walletLink?: string
  poll?: () => Promise<DisclosureGroup[] | null>
  disclosures?: DisclosureGroup[]
}

export interface IssuanceComplete {
  credentialName: string
}

export interface IssuerSessionResult {
  walletLink: string
  txCode?: string
  // Absent when the issuer keeps no queryable offer state, so there is nothing to
  // ask. The EUDI issuer's /credentialOfferReq2 returns no offer id and exposes no
  // per-offer status, so its tab ends on the operator saying the wallet has the
  // credential rather than on an observation.
  poll?: () => Promise<IssuanceComplete | null>
  // What the success view names when the operator confirms the finish. Only read
  // when `poll` is absent; otherwise the name comes from the poll result.
  credentialName?: string
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
  // Partial: an issuer tab declares only the flows its issuer actually has. The
  // mode switcher is derived from the keys present, so a single-mode tab shows
  // none. Not every issuer offers both grants.
  modes: Partial<Record<IssuerMode, IssuerModeConfig>>
  defaultMode: IssuerMode
}

export type TabConfig = VerifierTabConfig | IssuerTabConfig

// Modes an issuer tab declares, in display order.
export function issuerModes(tab: IssuerTabConfig): IssuerMode[] {
  return (Object.keys(tab.modes) as IssuerMode[]).filter((m) => tab.modes[m])
}

// The mode to use for a tab, falling back to its default when the URL names one
// the tab does not have (e.g. after switching tabs with ?mode= still set).
export function resolveMode(tab: IssuerTabConfig, mode: IssuerMode): IssuerModeConfig {
  return tab.modes[mode] ?? tab.modes[tab.defaultMode]!
}

// --- Groups ----------------------------------------------------------------
//
// Tabs are grouped by what the tool is playing the part of — verifier or issuer —
// with one tab per implementation inside. The grouping is only navigation: a tab
// behaves the same whichever row it is reached from. A tab's label is therefore
// just the implementation ("EUDI"), since the group above it already says which
// side of the flow it is on.

export type TabGroupId = "verifier" | "issuer"

export interface TabGroup {
  id: TabGroupId
  label: string
  tabs: TabConfig[]
}

export const tabGroups: TabGroup[] = [
  { id: "issuer", label: "Issuer", tabs: [irmaIssuer, eudiIssuer, veramoIssuer] },
  { id: "verifier", label: "Verifier", tabs: [irmaVerifier, eudiVerifier, veramoVerifier] },
]

export const tabs: TabConfig[] = tabGroups.flatMap((g) => g.tabs)

export function findTab(id: TabId): TabConfig {
  return tabs.find((t) => t.tab === id)!
}

export function groupOfTab(id: TabId): TabGroup {
  return tabGroups.find((g) => g.tabs.some((t) => t.tab === id))!
}
