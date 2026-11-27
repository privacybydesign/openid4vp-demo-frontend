// The scenario model: what the wallet prototype's cases need from this tool.
//
// A scenario describes the wallet in abstract cards ("two passports and an email
// address"), and has a native request per protocol. The card catalogue
// (cards.ts) decides what a card concretely is in each source. See CONTEXT.md.

export type CardId =
  | "email"
  | "phone"
  | "passport"
  | "idcard"
  | "driving"
  | "personal"
  | "address"
  | "pid"
  | "iban"
  | "diploma"
  | "exam"
  | "study"
  | "bsn"

// Canonical card values, keyed by the names cards.ts uses. Each source maps them
// onto its own attribute or claim names.
export type Values = Record<string, string>

export interface CardInstance {
  card: CardId
  // Overrides on top of the card's example values: a second email address, a
  // Belgian EU identity, an address in Utrecht.
  values?: Values
  // Set up after issuing: revoke the credential, or issue it so it expires within
  // a minute.
  state?: "revoked" | "expired"
}

// Cards the wallet adds during the session. One group is one thing to do; the
// cards inside it are the ways to do it ("passport, ID card or licence: any one").
export interface DuringGroup {
  label: string
  cards: CardInstance[]
}

export interface WalletState {
  before: CardInstance[]
  during: DuringGroup[]
  absent: CardId[]
}

// Where a variant's cards come from. `irma` is irma-demo issued by this tool;
// `pbdf` is pbdf-staging from the real staging issuers (added in the flow);
// `veramo` and `eudi` are OpenID4VCI issuers this tool drives.
export type Source = "irma" | "pbdf" | "veramo" | "eudi"

export type VeramoFormat = "sd" | "vcdm"
export type FormatChoice = Partial<Record<CardId, VeramoFormat>>

// native: works as intended. flagged: works, but its "During" cards are issued
// up front because OpenID4VCI cards can't be added mid-session. check: expected
// to work, but something on staging or in the setup is unconfirmed or manual.
export type VariantStatus = "native" | "flagged" | "check"

export interface IrmaVariant {
  // The session request, POSTed to the IRMA server as-is (disclosure, or an
  // issuance request with `disclose` for disclose-and-receive).
  request: object
  // A wallet that differs from the scenario's (another card stands in).
  wallet?: WalletState
  status: VariantStatus
  note?: string
  // For a chained session: the name of the next-session request the BFF serves.
  nextSession?: string
}

export interface DcqlVariant {
  source: "pbdf" | "veramo" | "eudi"
  // Veramo variants take the operator's format per card; the others ignore it.
  query: (formats: FormatChoice) => object
  wallet?: WalletState
  // What happens to the scenario's "During" cards: added in the flow (pbdf),
  // issued up front (Veramo/EUDI, flagged), or left out (the scenario still
  // tests something without them).
  during: "inFlow" | "upFront" | "drop"
  status: VariantStatus
  note?: string
}

export type GroupId = "basics" | "complex" | "values" | "rich" | "extras" | "edge"

export interface Scenario {
  id: string
  group: GroupId
  title: string
  description: string
  // Artboard name on the wallet prototype canvas.
  prototypeFrame: string
  wallet: WalletState
  irma?: IrmaVariant
  dcql?: DcqlVariant
  // Why a variant is missing. Present exactly where a variant is.
  unavailable: { irma?: string; dcql?: string }
  expected: string
  lookFor: string[]
}

export const GROUPS: { id: GroupId; title: string }[] = [
  { id: "basics", title: "Basics" },
  { id: "complex", title: "Complex requests" },
  { id: "values", title: "One of several values" },
  { id: "rich", title: "Nested data and images" },
  { id: "extras", title: "DCQL and IRMA extras" },
  { id: "edge", title: "Edge cases" },
]
