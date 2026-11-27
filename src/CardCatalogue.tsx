import { useState } from "react"
import { CARDS, CARD_BY_ID, veramoConfigurationId } from "./scenarios/cards"
import type { CardDef } from "./scenarios/cards"
import type { CardId, Source, Values, VeramoFormat } from "./scenarios/types"
import IssueRow from "./IssueRow"
import type { LinkForm } from "./walletLink"
import { Hint, Segmented, Tag } from "./ui"

type Format = "Idemix" | "SD-JWT VC" | "VCDM" | "mdoc"
const FORMATS: Format[] = ["Idemix", "SD-JWT VC", "VCDM", "mdoc"]
const FORMAT_TITLE: Record<Format, string> = { Idemix: "Idemix", "SD-JWT VC": "SD-JWT VC", VCDM: "VCDM 2.0 SD-JWT", mdoc: "mdoc" }

// Every way to get a card, in format order. The format is what the block is
// titled; where it comes from only goes in the subtitle.
interface Way {
  key: string
  format: Format
  source: Source
  subtitle: string
  type: string
  veramoFormat?: VeramoFormat
  eudiConfiguration?: number
  available: boolean
}

function waysOf(card: CardDef): Way[] {
  const ways: Way[] = []
  if (card.irma) ways.push({ key: "irma", format: "Idemix", source: "irma", subtitle: "irma-demo · issued by this tool", type: card.irma.credential, available: true })
  if (card.pbdf)
    ways.push({ key: "pbdf", format: "SD-JWT VC", source: "pbdf", subtitle: "pbdf-staging · from the real staging issuer", type: card.pbdf.credential, available: true })
  if (card.veramo) {
    for (const f of ["sd", "vcdm"] as const) {
      ways.push({
        key: `veramo-${f}`,
        format: f === "sd" ? "SD-JWT VC" : "VCDM",
        source: "veramo",
        subtitle: "Veramo · issued by this tool",
        type: `${veramoConfigurationId(card, f)} · ${f === "sd" ? "dc+sd-jwt" : "vc+sd-jwt"}`,
        veramoFormat: f,
        available: card.veramo.available[f],
      })
    }
  }
  card.eudi?.forEach((e, i) =>
    ways.push({
      key: `eudi-${i}`,
      format: e.format,
      source: "eudi",
      subtitle: `EUDI issuer · ${e.label} · issued by this tool, you confirm`,
      type: e.configurationId,
      eudiConfiguration: i,
      available: true,
    })
  )
  return ways.sort((a, b) => FORMATS.indexOf(a.format) - FORMATS.indexOf(b.format))
}

function chips(card: CardDef): { label: Format; ready: boolean }[] {
  const ways = waysOf(card)
  return FORMATS.filter((f) => ways.some((w) => w.format === f)).map((f) => ({ label: f, ready: ways.some((w) => w.format === f && w.available) }))
}

// "givenName" -> "Given name", "over18" -> "Over 18".
function label(key: string): string {
  const words = key.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export default function CardCatalogue({ linkForm, onLinkForm }: { linkForm: LinkForm; onLinkForm: (l: LinkForm) => void }) {
  const [filter, setFilter] = useState<"All" | Format>("All")
  const visible = CARDS.filter((c) => filter === "All" || waysOf(c).some((w) => w.format === filter))
  const [selected, setSelected] = useState<CardId>("driving")
  const current = visible.find((c) => c.id === selected) ?? visible[0]
  const [values, setValues] = useState<Partial<Record<CardId, Values>>>({})
  const cardValues = { ...current.values, ...values[current.id] }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 max-w-3xl">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[#6b6969]">Card catalogue</span>
        <h1 className="text-2xl font-bold text-[#484747] m-0">Cards and where to get them</h1>
        <p className="text-[14px] leading-[22px] text-[#5f5d5d] m-0">
          Scenarios describe the wallet in these cards. Pick one to see what it is in each format, and to issue it by hand,
          for example before trying something in the playground.
        </p>
      </header>

      <div className="flex flex-wrap gap-6 items-start">
        <nav aria-label="Cards" className="flex-1 basis-72 max-w-sm min-w-0 bg-white rounded-lg border border-[#E6E1DD] p-2 flex flex-col gap-0.5 md:sticky md:top-0 md:max-h-[calc(100vh-7.5rem)] md:overflow-y-auto">
          <div className="px-2 pt-2 pb-3 border-b border-[#EFEBE8] mb-1">
            <Segmented<"All" | Format>
              label="Filter by format"
              value={filter}
              onChange={setFilter}
              options={(["All", ...FORMATS] as const).map((f) => ({ id: f, label: f }))}
            />
          </div>
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === current.id}
              onClick={() => setSelected(c.id)}
              className={`flex flex-col gap-1.5 items-start min-h-11 px-3 py-2 rounded-md border-0 cursor-pointer text-left ${
                c.id === current.id ? "bg-[#EFEBE8]" : "bg-transparent hover:bg-[#F5F2EF]"
              }`}
            >
              <span className="font-semibold text-[14px] text-[#484747]">{c.name}</span>
              <span className="flex gap-1 flex-wrap">
                {chips(c).map((ch) => (
                  <Tag key={ch.label} tone={ch.ready ? "green" : "amber"}>
                    {ch.label}
                  </Tag>
                ))}
              </span>
            </button>
          ))}
        </nav>

        <section aria-labelledby="card-h" className="flex-[999_1_520px] min-w-0 flex flex-col gap-4">
          <div className="bg-white rounded-lg border border-[#E6E1DD] p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="card-h" className="text-xl font-bold text-[#484747] m-0">
                {current.name}
              </h2>
              {current.note && <Hint>{current.note}</Hint>}
            </div>
            <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {Object.keys(current.values).map((k) => (
                <div key={k} className="flex flex-col gap-1">
                  <label htmlFor={`value-${k}`} className="text-[13px] text-[#6b6969]">
                    {label(k)}
                  </label>
                  <input
                    id={`value-${k}`}
                    value={cardValues[k] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [current.id]: { ...v[current.id], [k]: e.target.value } }))}
                    className="min-h-10 px-3 rounded-md border border-[#D7D2CD] bg-white text-[14px]"
                  />
                </div>
              ))}
            </div>
            <Hint>Used by every format this tool issues. pbdf-staging cards carry whatever the real issuer hands out.</Hint>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-[#6b6969]">Wallet link</span>
              <Segmented
                label="Wallet link"
                value={linkForm}
                onChange={onLinkForm}
                options={[{ id: "scheme", label: "Custom scheme" }, { id: "universal", label: "Universal" }, { id: "universal-staging", label: "Universal (staging)" }]}
              />
            </div>
          </div>

          {waysOf(current).map((w) => (
            <div key={`${current.id}-${w.key}`} className="bg-white rounded-lg border border-[#E6E1DD] px-4 py-2">
              <IssueRow
                title={FORMAT_TITLE[w.format]}
                subtitle={w.type}
                summary={w.subtitle}
                source={w.source}
                instances={[{ card: current.id, values: values[current.id] }]}
                veramoFormat={w.veramoFormat}
                eudiConfiguration={w.eudiConfiguration}
                linkForm={linkForm}
              />
            </div>
          ))}
          {CARD_BY_ID[current.id] && waysOf(current).length === 0 && <Hint>No source has this card yet.</Hint>}
        </section>
      </div>
    </div>
  )
}
