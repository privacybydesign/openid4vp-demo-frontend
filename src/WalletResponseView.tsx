import type { DisclosureContent } from "./verifiers"

interface WalletResponseViewProps {
  disclosures: DisclosureContent[][]
  onReset: () => void
}

export default function WalletResponseView({ disclosures, onReset }: WalletResponseViewProps) {
  const discs = disclosures.flat()
  return (
    <div>
      <div className="max-w-md mx-auto mt-6 border border-gray-200 rounded-md shadow-sm">
        <dl className="divide-y divide-gray-200">
          {discs.map(({ key, value }) => (
            <div key={key} className="flex justify-between px-4 py-3 bg-white">
              <dt className="text-gray-600 font-medium">{key}</dt>
              <dd className="text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <button className="m-5" onClick={onReset}>
        Reset
      </button>
    </div>
  )
}
