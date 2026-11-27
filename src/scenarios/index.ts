import type { CardId, CardInstance, DcqlVariant, Scenario, Source, WalletState } from "./types"
import { basics } from "./basics"
import { complex } from "./complex"
import { values, rich, extras, edge } from "./more"

export const SCENARIOS: Scenario[] = [...basics, ...complex, ...values, ...rich, ...extras, ...edge]

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

export type Variant = "irma" | "dcql"

// The wallet a variant needs: its own when it has one, else the scenario's, with
// "During" cards moved up front or left out as the DCQL variant says.
export function walletFor(scenario: Scenario, variant: Variant): WalletState {
  if (variant === "irma") return scenario.irma?.wallet ?? scenario.wallet
  const dcql = scenario.dcql!
  const base = dcql.wallet ?? scenario.wallet
  if (dcql.during === "inFlow") return base
  if (dcql.during === "drop") return { ...base, during: [] }
  const moved = base.during.flatMap((g) => g.cards)
  const movedIds = new Set(moved.map((c) => c.card))
  return { before: [...base.before, ...moved], during: [], absent: base.absent.filter((id) => !movedIds.has(id)) }
}

export function sourceFor(scenario: Scenario, variant: Variant): Source {
  return variant === "irma" ? "irma" : scenario.dcql!.source
}

// Which source issues a given instance. In a bewaren-style EUDI variant the mdoc
// comes from the EUDI issuer and the SD-JWT phone from pbdf-staging; everywhere
// else one variant has one source.
export function instanceSource(dcql: DcqlVariant, instance: CardInstance): Source {
  if (dcql.source === "eudi" && instance.card === "phone") return "pbdf"
  return dcql.source
}

// The Veramo cards a variant uses, in wallet order, for the per-card format
// switches.
export function veramoCards(scenario: Scenario): CardId[] {
  if (scenario.dcql?.source !== "veramo") return []
  const w = scenario.dcql.wallet ?? scenario.wallet
  const ids = [...w.before, ...w.during.flatMap((g) => g.cards)].map((c) => c.card)
  return [...new Set(ids)]
}
