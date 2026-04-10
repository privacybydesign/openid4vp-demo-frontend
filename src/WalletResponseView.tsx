import type { DisclosureContent } from "./verifiers"

interface WalletResponseViewProps {
  disclosures: DisclosureContent[][]
  onReset: () => void
}

export default function WalletResponseView({ disclosures, onReset }: WalletResponseViewProps) {
  const discs = disclosures.flat()
  return (
    <div className="flex flex-col items-center gap-6 mt-4 w-full">
      <div className="bg-[#00973a] text-white px-4 py-3 rounded-md text-sm font-semibold w-full">
        Disclosure successful
      </div>
      <div className="w-full bg-white rounded-lg border border-[#CFE4EF] overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#CFE4EF]">
              <th className="text-left px-4 py-3 font-semibold text-[#484747]">Attribute</th>
              <th className="text-left px-4 py-3 font-semibold text-[#484747]">Value</th>
            </tr>
          </thead>
          <tbody>
            {discs.map(({ key, value }) => (
              <tr key={key} className="border-b border-[#CFE4EF] last:border-b-0">
                <td className="px-4 py-3 text-[#484747]">{key}</td>
                <td className="px-4 py-3 text-[#484747] font-medium">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn-secondary" onClick={onReset}>
        New session
      </button>
    </div>
  )
}
