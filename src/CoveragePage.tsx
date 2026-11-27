import { SCENARIOS, walletFor } from "./scenarios/index"
import { GROUPS } from "./scenarios/types"
import type { Scenario, VariantStatus, WalletState } from "./scenarios/types"
import { CARD_BY_ID, inSentence } from "./scenarios/cards"
import { Tag } from "./ui"
import { STATUS_LABEL, STATUS_TONE } from "./status"
import type { Route } from "./route"

// Generated from the scenario data, never written by hand, so it can't drift from
// what the scenario pages actually do.

function countCards(instances: { card: keyof typeof CARD_BY_ID }[]): string {
  const counts = new Map<string, number>()
  for (const i of instances) counts.set(CARD_BY_ID[i.card].name, (counts.get(CARD_BY_ID[i.card].name) ?? 0) + 1)
  return [...counts].map(([name, n]) => (n > 1 ? `${n} × ${inSentence(name)}` : inSentence(name))).join(", ")
}

function setupSummary(w: WalletState): string {
  const parts = []
  if (w.before.length) parts.push(`Before: ${countCards(w.before)}.`)
  if (w.during.length) parts.push(`During: ${w.during.map((g) => inSentence(g.label)).join("; ")}.`)
  if (w.absent.length) parts.push(`Absent: ${[...new Set(w.absent)].map((id) => inSentence(CARD_BY_ID[id].name)).join(", ")}.`)
  return parts.join(" ") || "Nothing."
}

function VariantCell({ status, note, missing, verifier }: { status?: VariantStatus; note?: string; missing?: string; verifier?: string }) {
  if (!status) {
    return (
      <div className="flex flex-col gap-1">
        <Tag>Not possible</Tag>
        <span className="text-[13px] text-[#6b6969]">{missing}</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <Tag tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Tag>
      {verifier && <span className="text-[13px] text-[#484747]">{verifier}</span>}
      {note && <span className="text-[13px] text-[#6b6969]">{note}</span>}
    </div>
  )
}

function verifierOf(s: Scenario): string | undefined {
  if (!s.dcql) return undefined
  return { pbdf: "EUDI verifier · pbdf-staging cards", veramo: "Veramo verifier · Veramo cards", eudi: "EUDI verifier · EUDI issuer" }[s.dcql.source]
}

export default function CoveragePage({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const irma = SCENARIOS.filter((s) => s.irma)
  const dcql = SCENARIOS.filter((s) => s.dcql)
  const both = SCENARIOS.filter((s) => s.irma && s.dcql)
  const stats = [
    { label: "Scenarios", value: SCENARIOS.length, sub: "from the wallet prototype" },
    { label: "IRMA variants", value: irma.length, sub: `${irma.filter((s) => s.irma!.status !== "native").length} need a check or manual step` },
    {
      label: "DCQL variants",
      value: dcql.length,
      sub: `${dcql.filter((s) => s.dcql!.status === "flagged").length} flagged, ${dcql.filter((s) => s.dcql!.status === "check").length} to check`,
    },
    { label: "In both", value: both.length, sub: "scenarios with two variants" },
  ]

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 max-w-3xl">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[#6b6969]">Coverage</span>
        <h1 className="text-2xl font-bold text-[#484747] m-0">Every prototype scenario, per protocol</h1>
        <p className="text-[14px] leading-[22px] text-[#5f5d5d] m-0">
          A variant exists only where the protocol expresses the scenario natively. Flagged: the DCQL variant issues its
          “During” cards up front, because the wallet can't add OpenID4VCI cards mid-session, so it tests choosing rather
          than adding. Check: something on staging or in the setup still has to be confirmed or done by hand.
        </p>
      </header>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-lg border border-[#E6E1DD] p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[#6b6969]">{s.label}</div>
            <div className="text-2xl font-bold text-[#484747] mt-1">{s.value}</div>
            <div className="text-[13px] text-[#6b6969]">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border border-[#E6E1DD] overflow-x-auto">
        <table className="w-full min-w-[960px] text-[14px] border-collapse">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-[#6b6969] bg-[#FAF8F6]">
              <th scope="col" className="px-4 py-3 font-semibold">Scenario</th>
              <th scope="col" className="px-4 py-3 font-semibold">Wallet setup</th>
              <th scope="col" className="px-4 py-3 font-semibold">IRMA</th>
              <th scope="col" className="px-4 py-3 font-semibold">DCQL</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.flatMap((g) =>
              SCENARIOS.filter((s) => s.group === g.id).map((s) => (
                <tr key={s.id} className="border-t border-[#EFEBE8] align-top">
                  <td className="px-4 py-3 w-[22%]">
                    <span className="text-[12px] uppercase tracking-wide text-[#6b6969]">
                      {g.title} · {s.id}
                    </span>
                    <br />
                    <button
                      type="button"
                      onClick={() => onNavigate({ view: "scenario", scenario: s.id })}
                      className="p-0 bg-transparent border-0 cursor-pointer text-left font-semibold text-[#00508a] hover:underline"
                    >
                      {s.title}
                    </button>
                  </td>
                  <td className="px-4 py-3 w-[34%] text-[13px] leading-5 text-[#5f5d5d]">{setupSummary(walletFor(s, s.irma ? "irma" : "dcql"))}</td>
                  <td className="px-4 py-3 w-[22%]">
                    <VariantCell status={s.irma?.status} note={s.irma?.note} missing={s.unavailable.irma} />
                  </td>
                  <td className="px-4 py-3 w-[22%]">
                    <VariantCell status={s.dcql?.status} note={s.dcql?.note} missing={s.unavailable.dcql} verifier={verifierOf(s)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
