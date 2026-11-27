import type { CardId, FormatChoice, Scenario } from "./types"
import { CARD_BY_ID, CARDS, cardValues, VERAMO_ISSUER_BASE } from "./cards"
import { SCENARIOS, walletFor } from "./index"

// Consistency checks over the hand-written scenarios. Each returned string is one
// problem; an empty list means the data hangs together. Run by the test suite, and
// cheap enough to run in dev as well.

type Query = {
  id: string
  format: string
  meta: { vct_values?: string[]; type_values?: string[][]; doctype_value?: string }
  claims?: { path: unknown[] }[]
}

function allVeramoFormats(format: "sd" | "vcdm"): FormatChoice {
  return Object.fromEntries(CARDS.map((c) => [c.id, format])) as FormatChoice
}

function irmaAttributeNames(cardId: CardId): Set<string> {
  const source = CARD_BY_ID[cardId].irma
  if (!source) return new Set()
  // Every attribute this card can carry: its example values, plus every licence
  // category, since which categories are set depends on the instance.
  const names = new Set(Object.keys(source.attributes(cardValues(cardId))))
  if (cardId === "driving") {
    for (const c of ["AM", "A1", "A2", "A", "B1", "B", "C1", "C", "D1", "D", "BE", "C1E", "CE", "D1E", "DE", "T"]) {
      names.add(`category${c}`)
      names.add(`category${c}DateOfIssue`)
      names.add(`category${c}DateOfExpiry`)
    }
  }
  return names
}

function checkIrma(s: Scenario, problems: string[]) {
  const irma = s.irma!
  const w = walletFor(s, "irma")
  const cards = [...w.before, ...w.during.flatMap((g) => g.cards)].map((c) => c.card).concat(w.absent)
  for (const id of new Set(cards)) {
    if (!CARD_BY_ID[id].irma) problems.push(`${s.id}: IRMA variant uses card "${id}", which has no irma-demo type`)
  }
  const byCredential = new Map(
    cards.filter((id) => CARD_BY_ID[id].irma).map((id) => [CARD_BY_ID[id].irma!.credential, id] as const)
  )
  const request = irma.request as { disclose?: unknown[][][] }
  for (const discon of request.disclose ?? []) {
    for (const con of discon) {
      const nonSingletons = new Set(
        con
          .map((attr) => (typeof attr === "string" ? attr : (attr as { type: string }).type).split(".").slice(0, 3).join("."))
          .filter((credential) => {
            const cardId = byCredential.get(credential)
            return cardId && !CARD_BY_ID[cardId].irma!.singleton
          })
      )
      if (nonSingletons.size > 1) {
        problems.push(`${s.id}: IRMA inner con holds several non-singleton credentials (${[...nonSingletons].join(", ")}), which IRMA doesn't allow`)
      }
      for (const attr of con) {
        const id = typeof attr === "string" ? attr : (attr as { type: string }).type
        const parts = id.split(".")
        const credential = parts.slice(0, 3).join(".")
        const cardId = byCredential.get(credential)
        if (!cardId) {
          problems.push(`${s.id}: IRMA request asks for ${credential}, which is not a card in its wallet`)
          continue
        }
        if (parts.length === 4 && !irmaAttributeNames(cardId).has(parts[3])) {
          problems.push(`${s.id}: IRMA request asks for ${id}, which the ${cardId} card never issues`)
        }
      }
    }
  }
}

function veramoClaimKeys(cardId: CardId): Set<string> {
  return new Set(Object.keys(CARD_BY_ID[cardId].veramo!.data(cardValues(cardId)) as object))
}

function cardOfVeramoQuery(q: Query): CardId | undefined {
  const vct = q.meta.vct_values?.[0]
  const type = q.meta.type_values?.[0]?.[1]
  return CARDS.find(
    (c) =>
      c.veramo &&
      (vct === `${VERAMO_ISSUER_BASE}/vct/${c.veramo.vct}` || type === `${c.veramo.name}VcdmCredential`)
  )?.id
}

function checkDcql(s: Scenario, problems: string[]) {
  const dcql = s.dcql!
  for (const format of ["sd", "vcdm"] as const) {
    const query = dcql.query(allVeramoFormats(format)) as { credentials: Query[]; credential_sets?: { options: string[][] }[] }
    const ids = query.credentials.map((c) => c.id)
    if (new Set(ids).size !== ids.length) problems.push(`${s.id}: duplicate DCQL query ids`)
    for (const cs of query.credential_sets ?? []) {
      for (const option of cs.options) {
        for (const id of option) {
          if (!ids.includes(id)) problems.push(`${s.id}: credential_sets names "${id}", which is not a query`)
        }
      }
    }
    for (const q of query.credentials) {
      const vct = q.meta.vct_values?.[0] ?? ""
      const isVeramo = vct.startsWith(VERAMO_ISSUER_BASE) || q.format === "vc+sd-jwt"
      if (dcql.source === "veramo" && !isVeramo) {
        problems.push(`${s.id}: query "${q.id}" is not a Veramo credential, but the variant runs on the Veramo verifier`)
      }
      if (dcql.source !== "veramo" && isVeramo) {
        problems.push(`${s.id}: query "${q.id}" is a Veramo credential, but the variant runs on the EUDI verifier`)
      }
      if (dcql.source === "pbdf" && !vct.startsWith("pbdf-staging.")) {
        problems.push(`${s.id}: query "${q.id}" is not a pbdf-staging credential`)
      }
      if (isVeramo) {
        const cardId = cardOfVeramoQuery(q)
        if (!cardId) {
          problems.push(`${s.id}: query "${q.id}" names no card in the catalogue`)
          continue
        }
        const keys = veramoClaimKeys(cardId)
        for (const claim of q.claims ?? []) {
          const first = (format === "vcdm" ? claim.path[1] : claim.path[0]) as string
          if (!keys.has(first)) problems.push(`${s.id}: query "${q.id}" asks for "${first}", which the ${cardId} card never carries`)
        }
      }
    }
  }
  const w = walletFor(s, "dcql")
  const cards = [...w.before, ...w.during.flatMap((g) => g.cards)]
  for (const c of cards) {
    const def = CARD_BY_ID[c.card]
    const source = dcql.source === "eudi" && c.card === "phone" ? "pbdf" : dcql.source
    if (!def[source]) problems.push(`${s.id}: DCQL variant needs card "${c.card}" from ${source}, which has none`)
  }
}

export function validateScenarios(scenarios: Scenario[] = SCENARIOS): string[] {
  const problems: string[] = []
  const ids = scenarios.map((s) => s.id)
  if (new Set(ids).size !== ids.length) problems.push("Duplicate scenario ids")
  for (const s of scenarios) {
    if (!!s.irma === !!s.unavailable.irma) problems.push(`${s.id}: needs either an IRMA variant or a reason it has none`)
    if (!!s.dcql === !!s.unavailable.dcql) problems.push(`${s.id}: needs either a DCQL variant or a reason it has none`)
    if (s.irma) checkIrma(s, problems)
    if (s.dcql) checkDcql(s, problems)
  }
  return problems
}
