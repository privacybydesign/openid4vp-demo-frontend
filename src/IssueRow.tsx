import { useEffect, useRef, useState } from "react"
import type { CardInstance, Source, VeramoFormat } from "./scenarios/types"
import { canIssue, issue } from "./scenarios/run"
import type { Issuance } from "./scenarios/run"
import { CARD_BY_ID } from "./scenarios/cards"
import QRCodeComponent from "./QrCodeComponent"
import JsonView from "./JsonView"
import { applyLinkForm, stampSecondDeviceForQr } from "./walletLink"
import type { LinkForm } from "./walletLink"
import { SmallButton, Tag } from "./ui"
import { hostForLinkForm } from "./linkHost"

export type RowState = "idle" | "waiting" | "confirm" | "issued" | "revoking" | "revoked" | "error"

interface IssueRowProps {
  title: string
  subtitle: string
  summary?: string
  // Show the summary inline, for a card that appears more than once in a setup.
  showSummary?: boolean
  source: Source
  instances: CardInstance[]
  veramoFormat?: VeramoFormat
  eudiConfiguration?: number
  linkForm: LinkForm
  // "same": the wallet is on this device, so lead with Open Yivi and keep the QR
  // one tap away.
  device?: "qr" | "same"
  // Reports whether this row has done its part, for the setup column's count.
  onDone?: (done: boolean) => void
  // A "Before" row is expected to be issued; a "During" row only when asked.
  buttonLabel?: string
}

const STATE_TAG: Partial<Record<RowState, { label: string; tone: "green" | "amber" | "red" }>> = {
  waiting: { label: "Waiting", tone: "amber" },
  confirm: { label: "Scan, then confirm", tone: "amber" },
  issued: { label: "Issued", tone: "green" },
  revoking: { label: "Revoking…", tone: "amber" },
  revoked: { label: "Revoked", tone: "red" },
  error: { label: "Failed", tone: "red" },
}

const EXPIRES_IN_SECONDS = 60

// One issuance: a card instance (or, for IRMA, several in one session) from one
// source. Starts on demand, shows its QR inline, and follows through to the state
// the scenario wants: revoked right after issuing, or expiring within a minute.
export default function IssueRow({
  title,
  subtitle,
  summary,
  showSummary = false,
  source,
  instances,
  veramoFormat,
  eudiConfiguration,
  linkForm,
  device = "qr",
  onDone,
  buttonLabel = "Issue",
}: IssueRowProps) {
  const [showQr, setShowQr] = useState(device === "qr")
  const [state, setState] = useState<RowState>("idle")
  const [error, setError] = useState("")
  const [issuance, setIssuance] = useState<Issuance | null>(null)
  const [showRequest, setShowRequest] = useState(false)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [pbdfDone, setPbdfDone] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  })

  const wantRevoked = instances.some((i) => i.state === "revoked")
  const wantExpired = instances.some((i) => i.state === "expired")
  const blocked = instances.map((i) => canIssue(source, i, veramoFormat)).find((r) => r !== null) ?? null
  const done = source === "pbdf" ? pbdfDone : wantRevoked ? state === "revoked" : state === "issued"

  useEffect(() => {
    onDoneRef.current?.(done)
  }, [done])

  useEffect(() => () => clearInterval(timer.current), [])

  useEffect(() => {
    if (expiresAt === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const fail = (e: unknown) => {
    clearInterval(timer.current)
    setError(e instanceof Error ? e.message : String(e))
    setState("error")
  }

  const revoke = async (current: Issuance) => {
    setState("revoking")
    try {
      await current.revoke!()
      setState("revoked")
    } catch (e) {
      fail(e)
    }
  }

  const start = async () => {
    setError("")
    try {
      const next = await issue(source, instances, { veramoFormat, eudiConfiguration })
      setIssuance(next)
      if (!next.poll) {
        setState("confirm")
        return
      }
      setState("waiting")
      clearInterval(timer.current)
      timer.current = setInterval(async () => {
        try {
          if (!(await next.poll!())) return
          clearInterval(timer.current)
          setState("issued")
          if (wantExpired) setExpiresAt(Date.now() + EXPIRES_IN_SECONDS * 1000)
          if (wantRevoked && next.revoke) await revoke(next)
        } catch (e) {
          fail(e)
        }
      }, 1000)
    } catch (e) {
      fail(e)
    }
  }

  const cancel = () => {
    clearInterval(timer.current)
    setState("idle")
  }

  const tag = STATE_TAG[state]
  const open = state === "waiting" || state === "confirm"
  const link = issuance ? applyLinkForm(issuance.walletLink, linkForm, hostForLinkForm(linkForm)) : ""
  const secondsLeft = expiresAt === null ? null : Math.max(0, Math.round((expiresAt - now) / 1000))
  const pbdfHint = CARD_BY_ID[instances[0].card].pbdf?.addHint

  return (
    <div className="flex flex-col gap-2 py-1.5 border-t border-[#EFEBE8] first:border-t-0">
      <div className="flex items-center justify-between gap-3 min-h-9">
        {/* The type and values are on hover: the row itself is just what to issue. */}
        <div className="flex items-baseline gap-2 flex-wrap min-w-0 cursor-default" title={[subtitle, summary].filter(Boolean).join("\n")}>
          <span className="font-semibold text-[14.5px] text-[#484747]">{title}</span>
          {showSummary && summary && <span className="text-[13px] text-[#6b6969] break-all">{summary}</span>}
          {wantRevoked && <span className="text-[13px] text-[#a8172f]">revoked after issuing</span>}
          {wantExpired && (
            <span className="text-[13px] text-[#7a5212]">
              {secondsLeft === null ? `expires ${EXPIRES_IN_SECONDS} s after issuing` : secondsLeft > 0 ? `expires in ${secondsLeft} s` : "expired"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tag && <Tag tone={tag.tone}>{tag.label}</Tag>}
          {source === "pbdf" ? (
            <label className="flex items-center gap-1.5 text-[13px] text-[#484747] cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#00508a]" checked={pbdfDone} onChange={(e) => setPbdfDone(e.target.checked)} />
              In the app
            </label>
          ) : blocked ? (
            <Tag tone="amber">To add</Tag>
          ) : open ? (
            <SmallButton variant="ghost" onClick={cancel}>
              Close
            </SmallButton>
          ) : state === "idle" || state === "error" ? (
            <SmallButton onClick={start}>{buttonLabel}</SmallButton>
          ) : (
            <SmallButton variant="ghost" onClick={start}>
              Again
            </SmallButton>
          )}
        </div>
      </div>

      {source === "pbdf" && pbdfHint && (
        <p className="text-[13px] text-[#6b6969] m-0">In Yivi: Add data → {pbdfHint}</p>
      )}
      {source !== "pbdf" && blocked && <p className="text-[13px] text-[#7a5212] m-0">{blocked}</p>}
      {state === "error" && (
        <p role="alert" className="text-[13px] text-[#a8172f] m-0 break-words">
          {error}
        </p>
      )}
      {state === "issued" && wantRevoked && !issuance?.revoke && (
        <p className="text-[13px] text-[#7a5212] m-0">Issued, but this source can't revoke it: revoke it by hand.</p>
      )}

      {open && issuance && (
        <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-[#F5FAFC] border border-[#CFE4EF]">
          {showQr && <QRCodeComponent text={stampSecondDeviceForQr(link)} size={168} />}
          <div className="flex flex-col gap-2 min-w-[10rem] flex-1">
            <span className="font-semibold text-[#484747]">
              {state === "confirm" ? (showQr ? "Scan, then confirm" : "Add it in Yivi, then confirm") : showQr ? "Waiting for the wallet…" : "Open Yivi to add this card"}
            </span>
            {!showQr && state === "waiting" && (
              <span className="text-[13px] text-[#6b6969]">Come back here when it’s added; this row updates by itself.</span>
            )}
            {state === "confirm" && (
              <span className="text-[13px] text-[#6b6969]">This issuer can't be asked whether the wallet collected it, so confirm it yourself.</span>
            )}
            {issuance.txCode && (
              <span className="text-[13px] text-[#484747]">
                Code: <code className="font-mono text-base tracking-widest">{issuance.txCode}</code>
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <a
                href={link}
                className={`min-h-10 inline-flex items-center px-3 rounded-md border text-[13.5px] font-semibold no-underline ${
                  showQr ? "border-[#484747] text-[#484747] hover:bg-[#eae5e2]" : "border-[#E12747] bg-[#E12747] text-white"
                }`}
              >
                Open Yivi
              </a>
              <SmallButton variant="ghost" onClick={() => setShowQr((s) => !s)}>
                {showQr ? "Hide QR" : "Show QR instead"}
              </SmallButton>
              {state === "confirm" && (
                <SmallButton variant="primary" onClick={() => setState("issued")}>
                  The wallet has it
                </SmallButton>
              )}
            </div>
          </div>
        </div>
      )}

      {issuance && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="self-start text-[13px] font-semibold text-[#00508a] bg-transparent border-0 p-0 cursor-pointer"
            aria-expanded={showRequest}
            onClick={() => setShowRequest((v) => !v)}
          >
            {showRequest ? "Hide request" : "Show request"}
          </button>
          {showRequest && <JsonView value={issuance.request} maxHeight="16rem" label="issuance request" />}
        </div>
      )}
    </div>
  )
}
