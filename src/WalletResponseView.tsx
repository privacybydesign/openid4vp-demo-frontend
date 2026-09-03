import type { DisclosureGroup } from "./tabs"

interface WalletResponseViewProps {
  disclosures: DisclosureGroup[]
  onReset: () => void
}

interface DisclosureTableProps {
  rows: { key: string; value: string }[]
  // Distinguishes rows across groups. Element identifiers are unique within one
  // credential but not between two — a PID and an mDL both disclose
  // `family_name` — so the React key needs the group as well.
  keyPrefix: string
}

function DisclosureTable({ rows, keyPrefix }: DisclosureTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#CFE4EF]">
          <th className="text-left px-4 py-3 font-semibold text-[#484747]">Attribute</th>
          <th className="text-left px-4 py-3 font-semibold text-[#484747]">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, value }, i) => (
          <tr key={`${keyPrefix}:${i}:${key}`} className="border-b border-[#CFE4EF] last:border-b-0">
            <td className="px-4 py-3 text-[#484747]">{key}</td>
            <td className="px-4 py-3 text-[#484747] font-medium break-all whitespace-pre-wrap">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function WalletResponseView({ disclosures, onReset }: WalletResponseViewProps) {
  // Grouped only when a group actually names itself. The EUDI tab labels its
  // groups by DCQL query id; the IRMA and Veramo tabs label nothing, and for them
  // one flat table over every group is what this view has always shown — so
  // leaving that path untouched is what keeps this change to the tab it is about.
  const labelled = disclosures.some((group) => group.label)

  return (
    <div className="flex flex-col items-center gap-6 mt-4 w-full max-w-md mx-auto">
      <div className="bg-[#00973a] text-white px-4 py-3 rounded-md text-sm font-semibold w-full">
        Disclosure successful
      </div>
      {labelled ? (
        disclosures.map((group, i) => (
          <div
            key={i}
            className="w-full bg-white rounded-lg border border-[#CFE4EF] overflow-hidden shadow-sm"
          >
            {group.label && (
              <div className="px-4 py-2 bg-[#E8F3F9] border-b border-[#CFE4EF] text-sm font-semibold text-[#00508a] break-all">
                {group.label}
              </div>
            )}
            <DisclosureTable rows={group.disclosures} keyPrefix={String(i)} />
          </div>
        ))
      ) : (
        <div className="w-full bg-white rounded-lg border border-[#CFE4EF] overflow-hidden shadow-sm">
          <DisclosureTable rows={disclosures.flatMap((g) => g.disclosures)} keyPrefix="all" />
        </div>
      )}
      <button className="btn-secondary w-full" onClick={onReset}>
        Go back
      </button>
    </div>
  )
}
