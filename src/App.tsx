import { useEffect, useState } from "react"
import "./App.css"
import Sidebar from "./Sidebar"
import ScenarioPage from "./ScenarioPage"
import CoveragePage from "./CoveragePage"
import CardCatalogue from "./CardCatalogue"
import Playground from "./Playground"
import { encodeRequestParam } from "./requestParam"
import { findScenario } from "./scenarios/index"
import type { Variant } from "./scenarios/index"
import type { FormatChoice } from "./scenarios/types"
import type { SessionOptions } from "./scenarios/run"
import { readUrl, writeUrl } from "./route"
import { isPhone } from "./scenarios/run"
import type { Route } from "./route"
import type { LinkForm } from "./walletLink"

// The shell: the scenario sidebar on the left, and one of the scenario page, the
// coverage overview, the card catalogue or the Playground (the old tabs) on the
// right. Session options, Veramo formats and the link form are kept across
// scenarios, and in the URL.
export default function App() {
  const initial = readUrl()
  const [route, setRoute] = useState<Route>(initial.route)
  const [variantChoice, setVariantChoice] = useState<Variant | undefined>(initial.variant)
  const [formats, setFormats] = useState<FormatChoice>(initial.formats)
  const [options, setOptions] = useState<SessionOptions>(initial.options)
  const [linkForm, setLinkForm] = useState<LinkForm>(initial.linkForm)
  // Bumped to remount the Playground when a scenario hands it a request, so it
  // re-reads its state from the URL.
  const [playgroundKey, setPlaygroundKey] = useState(0)
  // On a phone the scenario list is a screen of its own, and where the tool opens.
  const [menuOpen, setMenuOpen] = useState(() => isPhone() && initial.route.view !== "scenario")

  const scenario = route.view === "scenario" ? findScenario(route.scenario) : undefined
  const variant: Variant = scenario
    ? variantChoice && scenario[variantChoice]
      ? variantChoice
      : scenario.irma
        ? "irma"
        : "dcql"
    : "irma"

  useEffect(() => {
    writeUrl({ route, variant: scenario ? variant : undefined, formats, options, linkForm }, false)
  }, [route, variant, scenario, formats, options, linkForm])

  useEffect(() => {
    const onPop = () => {
      const s = readUrl()
      setRoute(s.route)
      setVariantChoice(s.variant)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const navigate = (next: Route) => {
    setMenuOpen(false)
    if (next.view === "playground") {
      window.history.pushState(null, "", "?view=playground")
      setPlaygroundKey((k) => k + 1)
    } else {
      writeUrl({ route: next, variant: undefined, formats, options, linkForm }, true)
    }
    setRoute(next)
    setVariantChoice(undefined)
  }

  const openInPlayground = (v: Variant, body: string) => {
    const tab = v === "irma" ? "irma-verifier" : scenario?.dcql?.source === "veramo" ? "veramo-verifier" : "eudi-verifier"
    const p = new URLSearchParams({ tab, request: encodeRequestParam(body) })
    if (tab === "veramo-verifier" && options.prefix === "did:web") p.set("prefix", "did:web")
    if (linkForm !== "scheme") p.set("link", linkForm)
    window.history.pushState(null, "", `?${p}`)
    setPlaygroundKey((k) => k + 1)
    setRoute({ view: "playground" })
  }

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-[#CFE4EF] flex items-center px-4 py-3 gap-4 shrink-0">
        <img src="/yivi-logo.svg" alt="Yivi" className="h-9" />
        <h1 className="text-lg font-bold text-[#484747] m-0">Session Tool</h1>
      </header>
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside
          id="scenario-sidebar"
          className={`${menuOpen ? "block max-md:flex-1" : "hidden"} md:block md:w-80 shrink-0 bg-white md:border-r border-[#E6E1DD] overflow-y-auto`}
        >
          <Sidebar key={route.view === "scenario" ? route.scenario : route.view} route={route} onNavigate={navigate} />
        </aside>
        <main className={`flex-1 min-w-0 min-h-0 ${menuOpen ? "max-md:hidden" : ""} ${route.view === "playground" ? "flex flex-col px-3 py-4 md:px-6" : `flex flex-col overflow-y-auto xl:overflow-hidden px-4 py-6 md:px-8 ${route.view === "scenario" ? "max-xl:pb-0" : ""}`}`}>
          {route.view === "scenario" && scenario && (
            <ScenarioPage
              key={`${scenario.id}-${variant}`}
              scenario={scenario}
              variant={variant}
              onVariant={setVariantChoice}
              formats={formats}
              onFormats={setFormats}
              options={options}
              onOptions={setOptions}
              linkForm={linkForm}
              onLinkForm={setLinkForm}
              onOpenInPlayground={openInPlayground}
              onBackToList={() => setMenuOpen(true)}
            />
          )}
          {route.view !== "scenario" && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="md:hidden self-start shrink-0 min-h-10 p-0 mb-2 bg-transparent border-0 text-[15px] font-semibold text-[#00508a] cursor-pointer"
            >
              ‹ Scenarios
            </button>
          )}
          {route.view === "coverage" && <CoveragePage onNavigate={navigate} />}
          {route.view === "cards" && <CardCatalogue linkForm={linkForm} onLinkForm={setLinkForm} device={options.device} />}
          {route.view === "playground" && <Playground key={playgroundKey} />}
        </main>
      </div>
    </div>
  )
}
