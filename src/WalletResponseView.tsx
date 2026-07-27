import type { DisclosureContent, VerifierMessage } from "./tabs"

interface WalletResponseViewProps {
  disclosures: DisclosureContent[][]
  messages?: VerifierMessage[]
  onReset: () => void
}

// Codes that mean nothing went wrong. Shown muted rather than hidden, because
// seeing that the status list was actually consulted is worth something.
const INFO_CODES = new Set(["STATUS_LIST_VALID", "NO_STATUS_LIST"])

const MESSAGE_LABELS: Record<string, string> = {
  STATUS_LIST_VALID: "Status list checked — not revoked",
  NO_STATUS_LIST: "Credential carries no status list — revocation cannot be checked",
  STATUS_LIST_REVOKED: "Credential is REVOKED",
  STATUS_LIST_SUSPENDED: "Credential is suspended",
  STATUS_LIST_INVALID: "Status list could not be checked",
  STATUS_LIST_MESSAGE: "Status list reports a non-default status",
}

function labelFor({ code, message }: VerifierMessage): string {
  const label = MESSAGE_LABELS[code]
  if (label) return label
  return message ? `${code} — ${message}` : code
}

export default function WalletResponseView({
  disclosures,
  messages = [],
  onReset,
}: WalletResponseViewProps) {
  const discs = disclosures.flat()
  const warnings = messages.filter((m) => !INFO_CODES.has(m.code))
  const infos = messages.filter((m) => INFO_CODES.has(m.code))

  return (
    <div className="flex flex-col items-center gap-6 mt-4 w-full max-w-md mx-auto">
      {/* Reports what the backend decided, which is VERIFIED even for a revoked
          credential. The strip below is what distinguishes the two. */}
      <div className="bg-[#00973a] text-white px-4 py-3 rounded-md text-sm font-semibold w-full">
        Disclosure successful
      </div>

      {warnings.length > 0 && (
        <div
          role="alert"
          className="w-full bg-[#fff4e0] border border-[#e6a400] text-[#7a4f00] px-4 py-3 rounded-md text-sm"
        >
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {warnings.map((m, i) => (
              <li key={i} className="font-semibold">
                ⚠ {labelFor(m)}
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {infos.length > 0 && (
        <ul className="list-none m-0 p-0 w-full flex flex-col gap-1 text-xs text-[#8a8a8a]">
          {infos.map((m, i) => (
            <li key={i}>{labelFor(m)}</li>
          ))}
        </ul>
      )}

      <button className="btn-secondary w-full" onClick={onReset}>
        Go back
      </button>
    </div>
  )
}
