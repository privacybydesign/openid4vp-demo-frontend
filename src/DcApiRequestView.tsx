import { useMemo, useState } from "react"
import type { DcApiTransaction } from "./tabs"
import { checkRequest, dcApiSupported, decodeRequest } from "./dcApi"

interface DcApiRequestViewProps {
  transaction: DcApiTransaction
  inlineError: string
  onPresent: () => void
  onCancel: () => void
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 px-4 py-2.5 border-b border-[#CFE4EF] last:border-b-0">
      <span
        aria-hidden="true"
        className={`shrink-0 font-bold leading-5 ${ok ? "text-[#00973a]" : "text-[#d0021b]"}`}
      >
        {ok ? "✓" : "✗"}
      </span>
      <span className="sr-only">{ok ? "pass" : "fail"}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[#484747]">{label}</span>
        <span className="block font-mono text-xs text-[#6b6b6b] break-all">{detail}</span>
      </span>
    </li>
  )
}

function Json({ value }: { value: Record<string, unknown> }) {
  return (
    <pre className="bg-white rounded-lg border border-[#CFE4EF] p-3 text-xs font-mono text-[#484747] overflow-x-auto whitespace-pre">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function DcApiRequestView({
  transaction,
  inlineError,
  onPresent,
  onCancel,
}: DcApiRequestViewProps) {
  const [copied, setCopied] = useState(false)

  // A malformed request object is itself a finding, so a decode failure is rendered
  // rather than thrown — the raw JWS below stays visible either way.
  const decoded = useMemo(() => {
    try {
      return { value: decodeRequest(transaction.request), error: "" }
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [transaction.request])

  const checks = useMemo(
    () => (decoded.value ? checkRequest(transaction, decoded.value) : []),
    [transaction, decoded.value]
  )
  const failed = checks.filter((check) => !check.ok).length

  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(transaction.request)
      setCopied(true)
    } catch {
      // Clipboard access can be refused outright. Not worth its own error surface: the
      // JWS is rendered below and stays selectable by hand.
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 mt-2 w-full max-w-2xl mx-auto md:overflow-y-auto">
      <div className="bg-[#00508a] text-white px-4 py-3 rounded-md text-sm font-semibold">
        Request created — transaction{" "}
        <span className="font-mono font-normal break-all">{transaction.transactionId}</span>
      </div>

      {/* The tab ships unable to complete a disclosure. Saying so up front is the
          difference between "not supported yet" and "the demo is broken". */}
      <p className="text-sm text-[#484747] bg-[#FDF3D1] border border-[#E8D9A0] rounded-md px-4 py-3">
        {dcApiSupported()
          ? "No Yivi wallet registers as a Digital Credentials API provider yet, so the browser call below is expected to fail. Everything above it is the part that works."
          : "This browser does not implement the Digital Credentials API, so the call below cannot run at all. Chrome on Android is the realistic target."}
      </p>

      <button className="btn-primary" onClick={onPresent}>
        Call browser API
      </button>

      {inlineError && (
        <p
          role="alert"
          className="text-sm text-[#484747] bg-[#FDE8EA] border border-[#F3B7BF] rounded-md px-4 py-3 break-words"
        >
          {inlineError}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[#484747] m-0">
          Checks{" "}
          <span className={`font-normal ${failed ? "text-[#d0021b]" : "text-[#00973a]"}`}>
            {decoded.value ? `${checks.length - failed}/${checks.length} passed` : "unavailable"}
          </span>
        </h2>
        {decoded.value ? (
          <ul className="list-none m-0 p-0 bg-white rounded-lg border border-[#CFE4EF] text-sm overflow-hidden">
            {checks.map((check) => (
              <CheckRow key={check.label} {...check} />
            ))}
          </ul>
        ) : (
          <p role="alert" className="text-sm text-[#d0021b] break-words">
            The request object could not be decoded: {decoded.error}
          </p>
        )}
      </section>

      {decoded.value && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-[#484747] m-0">Request header</h2>
            <Json value={decoded.value.header} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-[#484747] m-0">Request payload</h2>
            <Json value={decoded.value.payload} />
          </section>
        </>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[#484747] m-0">Signed request (JWS)</h2>
          <button
            className="text-sm font-semibold text-[#00508a] bg-transparent border-none p-0 cursor-pointer"
            onClick={copyRequest}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="bg-white rounded-lg border border-[#CFE4EF] p-3 text-xs font-mono text-[#484747] break-all whitespace-pre-wrap max-h-40 overflow-y-auto">
          {transaction.request}
        </pre>
      </section>

      <button className="btn-secondary" onClick={onCancel}>
        Go back
      </button>
    </div>
  )
}
