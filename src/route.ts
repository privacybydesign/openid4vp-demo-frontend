import type { FormatChoice, VeramoFormat } from "./scenarios/types"
import type { SessionOptions } from "./scenarios/run"
import { DEFAULT_OPTIONS } from "./scenarios/run"
import type { Variant } from "./scenarios/index"
import { findScenario } from "./scenarios/index"
import type { LinkForm } from "./walletLink"

// Where the tool is, as kept in the URL. The Playground keeps its own URL
// (`?tab=…`, unchanged from before scenarios existed), so any link with `tab` in it
// lands on the Playground: old links still work.

export type Route =
  | { view: "scenario"; scenario: string }
  | { view: "cards" }
  | { view: "coverage" }
  | { view: "playground" }

export interface UrlState {
  route: Route
  variant?: Variant
  formats: FormatChoice
  options: SessionOptions
  linkForm: LinkForm
}

const LINK_FORMS: LinkForm[] = ["scheme", "universal", "universal-staging"]

export function readUrl(search = window.location.search): UrlState {
  const p = new URLSearchParams(search)
  const linkParam = p.get("link") as LinkForm | null
  const linkForm = linkParam && LINK_FORMS.includes(linkParam) ? linkParam : "scheme"
  const options: SessionOptions = {
    kind: p.get("kind") === "sign" ? "sign" : DEFAULT_OPTIONS.kind,
    device: p.get("device") === "same" ? "same" : DEFAULT_OPTIONS.device,
    pairing: p.get("pairing") === "on",
    returnTo: (["website", "email", "phone"] as const).find((r) => r === p.get("return")) ?? DEFAULT_OPTIONS.returnTo,
    prefix: p.get("prefix") === "did:web" ? "did:web" : DEFAULT_OPTIONS.prefix,
  }
  const formats: FormatChoice = {}
  for (const pair of (p.get("fmt") ?? "").split(",").filter(Boolean)) {
    const [card, format] = pair.split(":")
    if (format === "sd" || format === "vcdm") formats[card as keyof FormatChoice] = format as VeramoFormat
  }

  let route: Route
  if (p.has("tab") || p.get("view") === "playground") route = { view: "playground" }
  else if (p.get("view") === "cards") route = { view: "cards" }
  else if (p.has("scenario") && findScenario(p.get("scenario")!)) route = { view: "scenario", scenario: p.get("scenario")! }
  else route = { view: "coverage" }

  const variantParam = p.get("variant")
  const variant = variantParam === "irma" || variantParam === "dcql" ? variantParam : undefined
  return { route, variant, formats, options, linkForm }
}

export function writeUrl(state: UrlState, push: boolean) {
  if (state.route.view === "playground") return // the Playground writes its own
  const p = new URLSearchParams()
  if (state.route.view === "scenario") {
    p.set("scenario", state.route.scenario)
    if (state.variant) p.set("variant", state.variant)
    const fmt = Object.entries(state.formats).filter(([, f]) => f === "vcdm")
    if (fmt.length) p.set("fmt", fmt.map(([c, f]) => `${c}:${f}`).join(","))
  } else {
    p.set("view", state.route.view)
  }
  const o = state.options
  if (o.kind !== DEFAULT_OPTIONS.kind) p.set("kind", o.kind)
  if (o.device !== DEFAULT_OPTIONS.device) p.set("device", o.device)
  if (o.pairing) p.set("pairing", "on")
  if (o.returnTo !== DEFAULT_OPTIONS.returnTo) p.set("return", o.returnTo)
  if (o.prefix !== DEFAULT_OPTIONS.prefix) p.set("prefix", o.prefix)
  if (state.linkForm !== "scheme") p.set("link", state.linkForm)
  const url = `?${p}`
  if (url === window.location.search) return
  if (push) window.history.pushState(null, "", url)
  else window.history.replaceState(null, "", url)
}
