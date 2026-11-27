import { useMemo, useState } from "react"
import { GROUPS } from "./scenarios/types"
import type { GroupId, Scenario } from "./scenarios/types"
import { SCENARIOS } from "./scenarios/index"
import type { Route } from "./route"

type Filter = "all" | "irma" | "dcql"

interface SidebarProps {
  route: Route
  onNavigate: (route: Route) => void
}

// What the row shows on hover: which protocols the scenario has, and why one is missing.
function protocolHint(s: Scenario): string {
  const line = (name: string, v: { status: string } | undefined, reason: string | undefined) =>
    v ? `${name}${v.status === "native" ? "" : ` (${v.status})`}` : `No ${name}${reason ? `: ${reason}` : ""}`
  return [line("IRMA", s.irma, s.unavailable.irma), line("DCQL", s.dcql, s.unavailable.dcql)].join("\n")
}

function matches(s: Scenario, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return [s.id, s.title, s.description].some((t) => t.toLowerCase().includes(q))
}

export default function Sidebar({ route, onNavigate }: SidebarProps) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const current = route.view === "scenario" ? route.scenario : null
  const currentGroup = SCENARIOS.find((s) => s.id === current)?.group
  const [open, setOpen] = useState<Partial<Record<GroupId, boolean>>>(currentGroup ? { [currentGroup]: true } : { basics: true })

  const visible = useMemo(
    () =>
      SCENARIOS.filter(
        (s) => matches(s, query) && (filter === "all" || (filter === "irma" ? !!s.irma : !!s.dcql))
      ),
    [query, filter]
  )

  const linkClass = (on: boolean) =>
    `w-full text-left min-h-11 px-3 rounded-md border-0 cursor-pointer text-[14px] ${
      on ? "bg-[#EFEBE8] font-semibold text-[#484747]" : "bg-transparent text-[#5f5d5d] hover:bg-[#F5F2EF]"
    }`

  return (
    <nav aria-label="Scenarios" className="flex flex-col gap-2 p-3">
      <input
        id="scenario-search"
        aria-label="Find a scenario"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a scenario"
        className="min-h-10 px-3 rounded-md border border-[#D7D2CD] bg-white text-[14px]"
      />
      <div role="radiogroup" aria-label="Protocol filter" className="flex gap-1">
        {(["all", "irma", "dcql"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={`flex-1 min-h-8 rounded-md text-[13px] font-semibold border ${
              filter === f ? "bg-[#484747] border-[#484747] text-white" : "bg-white border-[#D7D2CD] text-[#484747]"
            }`}
          >
            {f === "all" ? "All" : f.toUpperCase()}
          </button>
        ))}
      </div>

      {GROUPS.map((g) => {
        const items = visible.filter((s) => s.group === g.id)
        const isOpen = !!open[g.id] || !!query
        return (
          <div key={g.id} className="flex flex-col">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}
              className="flex items-center justify-between min-h-10 px-1 bg-transparent border-0 cursor-pointer text-[14px] font-bold text-[#484747]"
            >
              <span>{g.title}</span>
              <span className="font-mono text-[12px] font-normal text-[#6b6969]">{items.length}</span>
            </button>
            {isOpen &&
              items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-current={s.id === current ? "page" : undefined}
                  onClick={() => onNavigate({ view: "scenario", scenario: s.id })}
                  title={protocolHint(s)}
                  className={`${linkClass(s.id === current)} py-1`}
                >
                  {s.title}
                </button>
              ))}
          </div>
        )
      })}

      <div className="h-px bg-[#E6E1DD] my-2" />
      <button type="button" className={linkClass(route.view === "coverage")} onClick={() => onNavigate({ view: "coverage" })}>
        Coverage
      </button>
      <button type="button" className={linkClass(route.view === "cards")} onClick={() => onNavigate({ view: "cards" })}>
        Card catalogue
      </button>
      <button type="button" className={linkClass(route.view === "playground")} onClick={() => onNavigate({ view: "playground" })}>
        Playground
      </button>
    </nav>
  )
}
