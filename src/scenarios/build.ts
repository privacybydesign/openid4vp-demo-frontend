import type { CardId, CardInstance, DuringGroup, FormatChoice, Values, WalletState } from "./types"
import { CARD_BY_ID, cardValues, veramoVct, veramoVcdmType } from "./cards"

// Small helpers for writing scenario requests by hand. They only fill in what a
// card's source decides (credential ids, vct, the Veramo format the operator
// picked); which claims are asked for, and how options combine, is written out in
// each scenario.

// --- wallet ------------------------------------------------------------------

export function card(id: CardId, values?: Values, state?: CardInstance["state"]): CardInstance {
  return { card: id, ...(values ? { values } : {}), ...(state ? { state } : {}) }
}

export function during(label: string, ...cards: CardInstance[]): DuringGroup {
  return { label, cards }
}

export function wallet(before: CardInstance[], duringGroups: DuringGroup[] = [], absent: CardId[] = []): WalletState {
  return { before, during: duringGroups, absent }
}

// --- IRMA --------------------------------------------------------------------

type IrmaAttribute = string | { type: string; value: string }

// The attribute ids of one card, as one inner con.
export function ia(id: CardId, ...attributes: string[]): string[] {
  const credential = CARD_BY_ID[id].irma!.credential
  return attributes.map((a) => `${credential}.${a}`)
}

// An attribute that must have a value.
export function iv(id: CardId, attribute: string, value: string): IrmaAttribute {
  return { type: `${CARD_BY_ID[id].irma!.credential}.${attribute}`, value }
}

// The credential itself, disclosing none of its attributes.
export function icred(id: CardId): string {
  return CARD_BY_ID[id].irma!.credential
}

export function irmaDisclosure(disclose: IrmaAttribute[][][]): object {
  return { "@context": "https://irma.app/ld/request/disclosure/v2", disclose }
}

// One credential in an IRMA issuance request, with the attribute values of an
// instance. A revocable type gets a fresh revocation key, so that this one
// issuance can be revoked later without touching any other.
export function irmaCredential(instance: CardInstance, revocationKey?: string): object {
  const source = CARD_BY_ID[instance.card].irma!
  return {
    credential: source.credential,
    attributes: source.attributes(cardValues(instance.card, instance.values)),
    ...(source.revocable ? { revocationKey: revocationKey ?? `scenario-${Date.now()}` } : {}),
  }
}

export function irmaIssuance(instances: CardInstance[], disclose?: IrmaAttribute[][][]): object {
  return {
    "@context": "https://irma.app/ld/request/issuance/v2",
    credentials: instances.map((i) => irmaCredential(i)),
    ...(disclose ? { disclose } : {}),
  }
}

// --- DCQL --------------------------------------------------------------------

export type Claim = string | string[] | { path: (string | number | null)[]; values?: unknown[]; id?: string }

function toClaim(c: Claim, prefix: string[] = []): object {
  if (typeof c === "string") return { path: [...prefix, c] }
  if (Array.isArray(c)) return { path: [...prefix, ...c] }
  return { ...c, path: [...prefix, ...c.path] }
}

interface QueryExtras {
  multiple?: boolean
  claim_sets?: string[][]
  // A query asking for the credential alone, without any of its claims.
  noClaims?: boolean
}

function withExtras(query: Record<string, unknown>, claims: Claim[], prefix: string[], extras?: QueryExtras): object {
  if (!extras?.noClaims) query.claims = claims.map((c) => toClaim(c, prefix))
  if (extras?.multiple) query.multiple = true
  if (extras?.claim_sets) query.claim_sets = extras.claim_sets
  return query
}

// A pbdf-staging SD-JWT VC, as the EUDI verifier presets ask for one.
export function pbdfQ(id: string, cardId: CardId, claims: Claim[], extras?: QueryExtras): object {
  return withExtras(
    { id, format: "dc+sd-jwt", meta: { vct_values: [CARD_BY_ID[cardId].pbdf!.credential] } },
    claims,
    [],
    extras
  )
}

// A Veramo credential in the format the operator picked for its card: an SD-JWT
// VC by vct, or a VCDM 2.0 SD-JWT by type, whose claims sit under
// credentialSubject.
export function veramoQ(
  id: string,
  cardId: CardId,
  claims: Claim[],
  formats: FormatChoice,
  extras?: QueryExtras
): object {
  const def = CARD_BY_ID[cardId]
  if (formats[cardId] === "vcdm") {
    return withExtras(
      { id, format: "vc+sd-jwt", meta: { type_values: [veramoVcdmType(def)] } },
      claims,
      ["credentialSubject"],
      extras
    )
  }
  return withExtras({ id, format: "dc+sd-jwt", meta: { vct_values: [veramoVct(def)] } }, claims, [], extras)
}

// The EUDI issuer's PID as an SD-JWT VC.
export function eudiPidQ(id: string, claims: Claim[], extras?: QueryExtras): object {
  return withExtras({ id, format: "dc+sd-jwt", meta: { vct_values: ["urn:eudi:pid:1"] } }, claims, [], extras)
}

// An mdoc: every claim path is [namespace, element].
export function mdocQ(
  id: string,
  docType: string,
  namespace: string,
  elements: { name: string; intentToRetain?: boolean }[]
): object {
  return {
    id,
    format: "mso_mdoc",
    meta: { doctype_value: docType },
    claims: elements.map((e) => ({
      path: [namespace, e.name],
      ...(e.intentToRetain !== undefined ? { intent_to_retain: e.intentToRetain } : {}),
    })),
  }
}

export interface CredentialSet {
  options: string[][]
  required?: boolean
}

export function set(options: string[][], required = true): CredentialSet {
  return required ? { options } : { options, required: false }
}

export function dcql(credentials: object[], credentialSets?: CredentialSet[]): object {
  return credentialSets ? { credentials, credential_sets: credentialSets } : { credentials }
}
