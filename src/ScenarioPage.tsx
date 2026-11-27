import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { CardInstance, FormatChoice, Scenario, VeramoFormat } from "./scenarios/types"
import type { Variant } from "./scenarios/index"
import { instanceSource, veramoCards, walletFor } from "./scenarios/index"
import { CARD_BY_ID, inSentence, summarise, veramoConfigurationId } from "./scenarios/cards"
import { newResumeId, requestBody, resumeIrma, saveResume, startDisclosure, takeResume } from "./scenarios/run"
import type { Disclosure, DisclosureResult, SessionOptions } from "./scenarios/run"
import IssueRow from "./IssueRow"
import JsonView from "./JsonView"
import RequestDialog from "./RequestDialog"
import Modal from "./Modal"
import QRCodeComponent from "./QrCodeComponent"
import { DisclosureTable } from "./WalletResponseView"
import { applyLinkForm, stampSecondDeviceForQr } from "./walletLink"
import type { LinkForm } from "./walletLink"
import { hostForLinkForm } from "./linkHost"
import { dcApiAvailable } from "./dcApi"
import { Hint, Panel, Segmented, SmallButton, SubHeading, Tag } from "./ui"

interface ScenarioPageProps {
  scenario: Scenario
  variant: Variant
  onVariant: (v: Variant) => void
  formats: FormatChoice
  onFormats: (f: FormatChoice) => void
  options: SessionOptions
  onOptions: (o: SessionOptions) => void
  linkForm: LinkForm
  onLinkForm: (l: LinkForm) => void
  onOpenInPlayground: (variant: Variant, body: string) => void
  // Phones: back to the scenario list, which is a screen of its own there.
  onBackToList?: () => void
}

function instanceTitle(instance: CardInstance): string {
  return CARD_BY_ID[instance.card].name
}

function typeLabel(instance: CardInstance, source: string, format: VeramoFormat): string {
  const def = CARD_BY_ID[instance.card]
  if (source === "irma") return def.irma?.credential ?? "—"
  if (source === "pbdf") return def.pbdf?.credential ?? "—"
  if (source === "veramo") return def.veramo ? `Veramo · ${veramoConfigurationId(def, format)}` : "—"
  return def.eudi ? `EUDI · ${def.eudi[0].label} (${def.eudi[0].format})` : "—"
}

// --- setup ----------------------------------------------------------------------

function SetupColumn({
  scenario,
  variant,
  formats,
  linkForm,
  device,
  onProgress,
  className,
}: {
  scenario: Scenario
  variant: Variant
  formats: FormatChoice
  linkForm: LinkForm
  device: "qr" | "same"
  onProgress: (todo: number) => void
  className?: string
}) {
  const w = walletFor(scenario, variant)
  const sourceOf = (i: CardInstance) => (variant === "irma" ? "irma" : instanceSource(scenario.dcql!, i))
  const [done, setDone] = useState<Record<string, boolean>>({})
  const report = (key: string) => (d: boolean) => setDone((prev) => (prev[key] === d ? prev : { ...prev, [key]: d }))
  const beforeKeys = w.before.map((_, i) => `b${i}`)
  const ready = beforeKeys.filter((k) => done[k]).length
  const onProgressRef = useRef(onProgress)
  useEffect(() => {
    onProgressRef.current = onProgress
  })
  useEffect(() => {
    onProgressRef.current(w.before.length - ready)
  }, [ready, w.before.length])
  // One IRMA session can issue every plain "Before" card at once; revoked or
  // expiring ones keep their own rows, since they need a follow-up step each.
  const bulk = variant === "irma" ? w.before.filter((i) => !i.state) : []
  // A card that appears more than once needs its value to tell the rows apart.
  const all = [...w.before, ...w.during.flatMap((g) => g.cards)]
  const repeated = (i: CardInstance) => all.filter((x) => x.card === i.card).length > 1
  const flagged = variant === "dcql" && scenario.dcql!.during === "upFront" && (scenario.dcql!.wallet ?? scenario.wallet).during.length > 0

  return (
    <Panel
      title="Wallet setup"
      id="setup-h"
      className={className}
      aside={w.before.length ? <Tag tone={ready === w.before.length ? "green" : "amber"}>{`${ready} of ${w.before.length} ready`}</Tag> : undefined}
    >
      <div className="flex flex-col gap-1">
        <SubHeading>Before</SubHeading>
        {flagged && <Hint>Includes the “during” cards: OpenID4VCI can't add cards mid-session.</Hint>}
        {w.before.length === 0 && <Hint>Nothing: the wallet starts without these cards.</Hint>}
        {bulk.length > 1 && (
          <IssueRow
            title={`All ${bulk.length} at once`}
            subtitle="One IRMA issuance session"
            source="irma"
            instances={bulk}
            linkForm={linkForm}
            device={device}
            buttonLabel="Issue all"
          />
        )}
        {w.before.map((instance, i) => {
          const source = sourceOf(instance)
          const format = formats[instance.card] ?? "sd"
          return (
            <IssueRow
              key={`${scenario.id}-${variant}-b${i}-${format}`}
              title={instanceTitle(instance)}
              subtitle={typeLabel(instance, source, format)}
              summary={summarise(instance.card, instance.values)}
              showSummary={repeated(instance)}
              source={source}
              instances={[instance]}
              veramoFormat={format}
              linkForm={linkForm}
              device={device}
              onDone={report(`b${i}`)}
            />
          )
        })}
      </div>

      {w.during.length > 0 && (
        <div className="flex flex-col gap-1 pt-2 border-t border-[#EFEBE8]">
          <SubHeading>During</SubHeading>
          <Hint>
            {variant === "dcql" && scenario.dcql!.source !== "veramo"
              ? "Only when the wallet asks; it sends you to the staging issuer itself."
              : "Only when the wallet asks to add one mid-session."}
          </Hint>
          {w.during.map((group, g) => (
            <div key={g} className="flex flex-col pt-1">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-[#6b6969]">{group.label}</span>
              {group.cards.map((instance, i) => {
                const source = sourceOf(instance)
                return (
                  <IssueRow
                    key={`${scenario.id}-${variant}-d${g}-${i}`}
                    title={instanceTitle(instance)}
                    subtitle={typeLabel(instance, source, formats[instance.card] ?? "sd")}
                    summary={summarise(instance.card, instance.values)}
                    showSummary={repeated(instance)}
                    source={source}
                    instances={[instance]}
                    veramoFormat={formats[instance.card] ?? "sd"}
                    linkForm={linkForm}
                    device={device}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      {w.absent.length > 0 && (
        <div className="flex flex-col gap-1 pt-2 border-t border-[#EFEBE8]">
          <SubHeading>Must not be in the wallet</SubHeading>
          {[...new Set(w.absent)].map((id) => (
            <label key={id} className="flex items-center gap-2 min-h-8 text-[14px] text-[#484747]">
              <input type="checkbox" className="w-4 h-4 accent-[#00508a]" /> Any other {inSentence(CARD_BY_ID[id].name)}
            </label>
          ))}
        </div>
      )}
    </Panel>
  )
}

// --- request --------------------------------------------------------------------

function OptionsBar({
  variant,
  scenario,
  options,
  onOptions,
  linkForm,
  onLinkForm,
  disabled,
}: {
  variant: Variant
  scenario: Scenario
  options: SessionOptions
  onOptions: (o: SessionOptions) => void
  linkForm: LinkForm
  onLinkForm: (l: LinkForm) => void
  disabled: boolean
}) {
  const set = <K extends keyof SessionOptions>(key: K) => (value: SessionOptions[K]) => onOptions({ ...options, [key]: value })
  const irma = variant === "irma"
  const isIssuance = irma && String((scenario.irma!.request as Record<string, unknown>)["@context"]).includes("/issuance/")
  const dcApi = variant === "dcql" && options.transport === "dcapi"
  const veramo = variant === "dcql" && scenario.dcql!.source === "veramo" && !dcApi
  return (
    <div className="flex flex-col gap-3">
      {variant === "dcql" && (
        <Row label="Sent via">
          <Segmented
            label="Sent via"
            disabled={disabled}
            value={options.transport}
            onChange={set("transport")}
            options={[{ id: "link", label: `${scenario.dcql!.source === "veramo" ? "Veramo" : "EUDI"} verifier` }, { id: "dcapi", label: "Digital Credentials API" }]}
          />
        </Row>
      )}
      {dcApi && (
        <Hint>
          This page asks Yivi itself, with an unsigned OpenID4VP request; Yivi shows it by its origin and nothing checks the response's signatures. Yivi only offers SD-JWT VC and mdoc this way, not VCDM.
          {!dcApiAvailable() && " This browser has no Digital Credentials API: use Chrome on Android, or a desktop Chrome paired with one."}
        </Hint>
      )}
      {irma && !isIssuance && (
        <Row label="Session type">
          <Segmented label="Session type" disabled={disabled} value={options.kind} onChange={set("kind")} options={[{ id: "disclose", label: "Disclose" }, { id: "sign", label: "Sign a message" }]} />
        </Row>
      )}
      {veramo && (
        <Row label="Verifier identifier">
          <Segmented label="Verifier identifier" disabled={disabled} value={options.prefix} onChange={set("prefix")} options={[{ id: "did:jwk", label: "did:jwk" }, { id: "did:web", label: "did:web" }]} />
        </Row>
      )}
      {!dcApi && (
        <Row label="Started on">
          <Segmented label="Started on" disabled={disabled} value={options.device} onChange={set("device")} options={[{ id: "qr", label: "Other device (QR)" }, { id: "same", label: "This phone" }]} />
        </Row>
      )}
      {irma && options.device === "qr" && (
        <Row label="Pairing code">
          <Segmented
            label="Pairing code"
            disabled={disabled}
            value={options.pairing ? "on" : "off"}
            onChange={(v) => onOptions({ ...options, pairing: v === "on" })}
            options={[{ id: "off", label: "Off" }, { id: "on", label: "On" }]}
          />
        </Row>
      )}
      {irma && (
        <Row label="Afterwards return to">
          {/* With a QR the app only offers to call a tel: return URL; it ignores the rest on another device. */}
          <Segmented
            label="Afterwards return to"
            disabled={disabled}
            value={effectiveReturn(options)}
            onChange={set("returnTo")}
            options={
              options.device === "qr"
                ? [{ id: "none", label: "Nothing" }, { id: "phone", label: "Phone call" }]
                : [
                    { id: "none", label: "Nothing" },
                    { id: "website", label: "This page" },
                    { id: "inapp", label: "This page, in Yivi" },
                    { id: "email", label: "Email" },
                    { id: "phone", label: "Phone call" },
                  ]
            }
          />
        </Row>
      )}
      {!dcApi && (
        <Row label="Wallet link">
          <Segmented
            label="Wallet link"
            disabled={disabled}
            value={linkForm}
            onChange={onLinkForm}
            options={[{ id: "scheme", label: "Custom scheme" }, { id: "universal", label: "Universal" }, { id: "universal-staging", label: "Universal (staging)" }]}
          />
        </Row>
      )}
    </div>
  )
}

// The return option that applies: a QR session only keeps a phone number.
function effectiveReturn(options: SessionOptions): SessionOptions["returnTo"] {
  return options.device === "qr" && options.returnTo !== "phone" ? "none" : options.returnTo
}

const RETURN_LABEL: Record<SessionOptions["returnTo"], string> = {
  none: "",
  website: "Back to this page",
  inapp: "Back to this page, in Yivi",
  email: "Back to email",
  phone: "Then a phone call",
}

// The options in one line, for the Request column.
function optionsSummary(variant: Variant, scenario: Scenario, options: SessionOptions, linkForm: LinkForm, formats: FormatChoice): string {
  const irma = variant === "irma"
  const dcApi = variant === "dcql" && options.transport === "dcapi"
  const cards = variant === "dcql" ? veramoCards(scenario) : []
  const vcdm = cards.filter((c) => formats[c] === "vcdm").length
  if (dcApi) return ["Digital Credentials API", cards.length ? (vcdm === 0 ? "SD-JWT VC" : `${vcdm} VCDM (not offered)`) : null].filter(Boolean).join(" · ")
  return [
    irma && options.kind === "sign" ? "Sign" : null,
    variant === "dcql" && scenario.dcql!.source === "veramo" ? options.prefix : null,
    cards.length ? (vcdm === 0 ? "SD-JWT VC" : vcdm === cards.length ? "VCDM" : `${vcdm} of ${cards.length} VCDM`) : null,
    options.device === "same" ? "This phone" : "QR",
    irma && options.device === "qr" && options.pairing ? "Pairing code" : null,
    irma ? RETURN_LABEL[effectiveReturn(options)] || null : null,
    { scheme: "Custom scheme", universal: "Universal link", "universal-staging": "Universal link (staging)" }[linkForm],
  ]
    .filter(Boolean)
    .join(" · ")
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] text-[#6b6969]">{label}</span>
      {children}
    </div>
  )
}

function FormatSwitches({ scenario, formats, onFormats, disabled }: { scenario: Scenario; formats: FormatChoice; onFormats: (f: FormatChoice) => void; disabled: boolean }) {
  const cards = veramoCards(scenario)
  if (cards.length === 0) return null
  const setAll = (v: VeramoFormat) => onFormats({ ...formats, ...Object.fromEntries(cards.map((c) => [c, v])) })
  const vcdmCount = cards.filter((c) => formats[c] === "vcdm").length
  return (
    <div className="flex flex-col gap-2 pt-3 border-t border-[#EFEBE8]">
      <SubHeading
        aside={
          <div className="flex gap-1">
            <SmallButton variant="ghost" disabled={disabled} onClick={() => setAll("sd")}>All SD-JWT VC</SmallButton>
            <SmallButton variant="ghost" disabled={disabled} onClick={() => setAll("vcdm")}>All VCDM</SmallButton>
          </div>
        }
      >
        Credential formats
      </SubHeading>
      {cards.map((c) => (
        <div key={c} className="flex items-center justify-between gap-2 flex-wrap min-h-9">
          <span className="text-[14px] text-[#484747]">{CARD_BY_ID[c].name}</span>
          <Segmented
            label={`Format for ${CARD_BY_ID[c].name}`}
            disabled={disabled}
            value={formats[c] ?? "sd"}
            onChange={(v) => onFormats({ ...formats, [c]: v })}
            options={[{ id: "sd", label: "SD-JWT VC" }, { id: "vcdm", label: "VCDM" }]}
          />
        </div>
      ))}
      <Hint>Setup issues the same formats{vcdmCount > 0 && vcdmCount < cards.length ? `; ${vcdmCount} of ${cards.length} as VCDM` : ""}.</Hint>
    </div>
  )
}

type Phase = "ready" | "running" | "done" | "error"

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`
}

// What the request asks for, in one line, so the column can stay compact and the
// full JSON only opens when wanted.
function summariseRequest(body: string): { title: string; detail: string } {
  try {
    const r = JSON.parse(body) as Record<string, unknown>
    const dcql = (r.dcql_query ?? r.dcql) as { credentials?: unknown[]; credential_sets?: { required?: boolean }[] } | undefined
    if (dcql) {
      const sets = dcql.credential_sets ?? []
      const optional = sets.filter((s) => s.required === false).length
      return {
        title: "DCQL query",
        detail: [plural(dcql.credentials?.length ?? 0, "credential query", "credential queries"), sets.length ? plural(sets.length, "credential set") : null, optional ? `${optional} optional` : null]
          .filter(Boolean)
          .join(" · "),
      }
    }
    const context = String(r["@context"] ?? "")
    const kind = context.includes("/signature/") ? "IRMA signature request" : context.includes("/issuance/") ? "IRMA issuance + disclosure" : "IRMA condiscon"
    const disclose = (r.disclose ?? []) as unknown[][][]
    const optional = disclose.filter((d) => d.some((con) => con.length === 0)).length
    return {
      title: kind,
      detail: [plural(disclose.length, "discon"), optional ? `${optional} optional` : null, r.nextSession ? "chained" : null].filter(Boolean).join(" · "),
    }
  } catch {
    return { title: "Edited request", detail: "Not valid JSON yet" }
  }
}

// --- page -------------------------------------------------------------------------

export default function ScenarioPage(props: ScenarioPageProps) {
  const { scenario, variant, onVariant, formats, onFormats, options, onOptions, linkForm, onLinkForm, onOpenInPlayground, onBackToList } = props
  // Marks this page in the return URL, so returning from Yivi (even in a new tab)
  // picks the session up again. A page that is itself such a return keeps its id.
  // A fresh id per page load; a page Yivi brought back reads its record once and
  // then starts over with a new id for the next session.
  const [returnedId] = useState(() => new URLSearchParams(window.location.search).get("resume"))
  const [resumeId] = useState(newResumeId)
  const resumeTaken = useRef(false)
  const generated = useMemo(() => requestBody(scenario, variant, formats, options, resumeId), [scenario, variant, formats, options, resumeId])
  // Below xl the three panels become tabs; Request comes first, since setup is
  // done once and the request every run.
  const [tab, setTab] = useState<"request" | "setup" | "result">(returnedId ? "result" : "request")
  const [setupTodo, setSetupTodo] = useState(0)
  const [edited, setEdited] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [sheetQr, setSheetQr] = useState(false)
  const [phase, setPhase] = useState<Phase>(returnedId ? "running" : "ready")
  const [disclosure, setDisclosure] = useState<Disclosure | null>(null)
  const [result, setResult] = useState<DisclosureResult | null>(null)
  const [error, setError] = useState("")
  const [isPairing, setIsPairing] = useState(false)
  const [pairingCode, setPairingCode] = useState("")
  const [pairingError, setPairingError] = useState("")
  const [showRaw, setShowRaw] = useState(false)
  const [checks, setChecks] = useState<Record<number, boolean>>({})
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const body = edited ?? generated
  const v = variant === "irma" ? scenario.irma! : scenario.dcql!
  const summary = summariseRequest(body)

  const stop = () => clearInterval(timer.current)
  useEffect(() => stop, [])

  const follow = (d: Disclosure) => {
    stop()
    timer.current = setInterval(async () => {
      try {
        if (d.pairing && (await d.pairing.isPairing())) setIsPairing(true)
        const r = await d.poll()
        if (r) {
          stop()
          setResult(r)
          setPhase("done")
          setQrOpen(false)
          setTab("result")
        }
      } catch (e) {
        stop()
        setError(e instanceof Error ? e.message : String(e))
        setPhase("error")
      }
    }, 700)
  }

  // Back from Yivi with a session this phone started: fetch its result.
  useEffect(() => {
    // Once: the record can only be read once, and dev mode runs effects twice.
    if (!returnedId || resumeTaken.current) return
    resumeTaken.current = true
    // The resume id has done its job: drop it from the address bar.
    const url = new URL(window.location.href)
    url.searchParams.delete("resume")
    url.searchParams.delete("inapp")
    window.history.replaceState(null, "", url)
    takeResume(returnedId).then((record) => {
      if (record && record.scenario === scenario.id && record.variant === variant) follow(resumeIrma(record.token))
      else setPhase("ready")
    })
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = async () => {
    setError("")
    setResult(null)
    setIsPairing(false)
    setPairingCode("")
    try {
      JSON.parse(body)
    } catch {
      setError("The request is not valid JSON.")
      setPhase("error")
      return
    }
    try {
      const d = await startDisclosure(scenario, variant, body, options)
      if (d.token && body.includes(`resume=${resumeId}`)) {
        await saveResume(resumeId, { token: d.token, scenario: scenario.id, variant })
      }
      setDisclosure(d)
      setPhase("running")
      setSheetQr(false)
      setQrOpen(true)
      follow(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase("error")
    }
  }

  const cancel = () => {
    stop()
    setPhase("ready")
  }

  const submitPairing = async () => {
    if (!disclosure?.pairing) return
    const ok = await disclosure.pairing.complete(pairingCode)
    setPairingError(ok ? "" : "That code doesn't match the one the wallet shows.")
    if (ok) setIsPairing(false)
  }

  const link = disclosure ? applyLinkForm(disclosure.walletLink, linkForm, hostForLinkForm(linkForm)) : ""
  const running = phase === "running"
  const statusTone = phase === "done" ? "green" : phase === "running" ? "amber" : phase === "error" ? "red" : "grey"
  const statusLabel = { ready: "", running: "Waiting", done: "Done", error: "Failed" }[phase]
  const sameDevice = options.device === "same"
  const showSessionQr = !sameDevice || sheetQr
  const comesBack = variant === "irma" && (options.returnTo === "website" || options.returnTo === "inapp")
  // What happens after Yivi, as the app does it: it opens an IRMA return URL; for
  // OpenID4VP, or without one, Android drops back to this browser and iPhone
  // shows a back arrow to the status bar's "‹ Safari".
  const backByItself = "On Android, Yivi drops you back here when done; on iPhone, tap “‹ Safari” in the top-left corner."
  const continueText =
    variant === "irma" && comesBack
      ? "Yivi opens, asks what to share, and brings you back to this page when you’re done."
      : variant === "irma" && options.returnTo === "email"
        ? "Yivi opens and asks what to share, then opens a new email. Switch back here for the result."
        : variant === "irma" && options.returnTo === "phone"
          ? "Yivi opens and asks what to share, then offers to make a call. Switch back here for the result."
          : `Yivi opens and asks what to share. ${backByItself}`
  const tabs: { id: "request" | "setup" | "result"; label: string }[] = [
    { id: "request", label: "Request" },
    { id: "setup", label: setupTodo > 0 ? `Setup · ${setupTodo}` : "Setup" },
    { id: "result", label: "Result" },
  ]
  const startControls =
    phase !== "running" ? (
      <button type="button" className="btn-primary w-full" onClick={start}>
        {phase === "ready" ? "Start session" : "Start again"}
      </button>
    ) : (
      <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg bg-[#FBEFD8] border border-[#EBD3A6]">
        <span className="text-[14px] font-semibold text-[#484747]">{disclosure?.walletLink ? "Session running" : "Waiting for the result…"}</span>
        <div className="flex gap-1">
          {disclosure?.walletLink && (
            <SmallButton onClick={() => setQrOpen(true)}>{sameDevice ? "Open Yivi" : "Show QR"}</SmallButton>
          )}
          <SmallButton variant="ghost" onClick={cancel}>
            Cancel
          </SmallButton>
        </div>
      </div>
    )

  return (
    <div className="flex flex-col gap-6 max-xl:flex-1 xl:h-full xl:min-h-0">
      <header className="flex flex-wrap gap-4 items-end justify-between shrink-0">
        <div className="flex flex-col gap-1 min-w-0 max-w-3xl">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="md:hidden self-start min-h-10 p-0 bg-transparent border-0 text-[15px] font-semibold text-[#00508a] cursor-pointer"
            >
              ‹ Scenarios
            </button>
          )}
          <h1 className="text-2xl font-bold text-[#484747] m-0">{scenario.title}</h1>
          <p className="text-[14px] leading-[22px] text-[#5f5d5d] m-0">{scenario.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Segmented<Variant>
            label="Protocol variant"
            value={variant}
            onChange={onVariant}
            disabled={running}
            options={[
              { id: "irma", label: "IRMA", disabled: !scenario.irma },
              { id: "dcql", label: scenario.dcql ? `DCQL · ${scenario.dcql.source === "veramo" ? "Veramo" : "EUDI"} verifier` : "DCQL", disabled: !scenario.dcql },
            ]}
          />
        </div>
      </header>

      {(scenario.unavailable.irma || scenario.unavailable.dcql || v.note) && (
      <div className="flex flex-col gap-1 shrink-0">
        {(["irma", "dcql"] as const).map((p) =>
          scenario.unavailable[p] ? (
            <Hint key={p}>
              No {p === "irma" ? "IRMA" : "DCQL"} variant: {scenario.unavailable[p]}
            </Hint>
          ) : null
        )}
        {v.note && <Hint>{v.note}</Hint>}
      </div>
      )}

      <div role="tablist" aria-label="Scenario parts" className="xl:hidden flex shrink-0 border-b border-[#E6E1DD] -mt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-h-11 px-2 bg-transparent border-0 border-b-[3px] text-[14.5px] font-semibold cursor-pointer ${
              tab === t.id ? "border-[#E12747] text-[#484747]" : "border-transparent text-[#6b6969]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 items-start grid-cols-1 xl:grid-cols-3 xl:grid-rows-[minmax(0,1fr)] xl:items-stretch xl:flex-1 xl:min-h-0">
        <SetupColumn
          scenario={scenario}
          variant={variant}
          formats={formats}
          linkForm={linkForm}
          device={options.device}
          onProgress={setSetupTodo}
          className={tab === "setup" ? "" : "max-xl:hidden"}
        />

        <Panel title="Request" id="req-h" className={tab === "request" ? "" : "max-xl:hidden"}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-[14.5px] font-semibold text-[#484747]">{summary.title}{edited !== null ? " (edited)" : ""}</span>
              <span className="text-[13px] text-[#6b6969]">{summary.detail}</span>
            </div>
            <SmallButton onClick={() => setDialogOpen(true)}>Open</SmallButton>
          </div>
          <RequestDialog
            open={dialogOpen}
            title={`${scenario.title} · ${variant === "irma" ? "IRMA request" : "DCQL request"}`}
            value={body}
            onChange={setEdited}
            onClose={() => setDialogOpen(false)}
            actions={
              <>
                {edited !== null && (
                  <SmallButton variant="ghost" disabled={running} onClick={() => setEdited(null)}>
                    Reset to scenario
                  </SmallButton>
                )}
                <SmallButton variant="ghost" onClick={() => onOpenInPlayground(variant, body)}>
                  Open in playground
                </SmallButton>
              </>
            }
          />
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#EFEBE8]">
            <span className="text-[13.5px] text-[#5f5d5d] min-w-0">{optionsSummary(variant, scenario, options, linkForm, formats)}</span>
            <SmallButton variant="ghost" disabled={running} onClick={() => setOptionsOpen(true)}>
              Change
            </SmallButton>
          </div>
          <Modal open={optionsOpen} onClose={() => setOptionsOpen(false)} labelledBy="options-title" className="w-[min(34rem,94vw)] bg-white max-md:w-full max-md:max-w-full max-md:mb-0 max-md:rounded-b-none">
            <div className="flex flex-col gap-4 p-5 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-3">
                <h2 id="options-title" className="text-lg font-bold text-[#484747] m-0">
                  Session options
                </h2>
                <button type="button" className="btn-secondary py-1.5 px-4 text-sm" onClick={() => setOptionsOpen(false)}>
                  Done
                </button>
              </div>
              <OptionsBar variant={variant} scenario={scenario} options={options} onOptions={onOptions} linkForm={linkForm} onLinkForm={onLinkForm} disabled={running} />
              <FormatSwitches scenario={variant === "dcql" ? scenario : { ...scenario, dcql: undefined }} formats={formats} onFormats={onFormats} disabled={running} />
              <Hint>These stay the same for every scenario.</Hint>
            </div>
          </Modal>
          <div className="max-xl:hidden">{startControls}</div>
          <Modal
            open={running && qrOpen && !!disclosure?.walletLink}
            onClose={() => setQrOpen(false)}
            labelledBy="session-dialog-title"
            className="w-[min(30rem,94vw)] bg-white max-md:w-full max-md:max-w-full max-md:mb-0 max-md:rounded-b-none"
          >
            <div className="flex flex-col items-center gap-4 p-6">
              <h2 id="session-dialog-title" className="text-lg font-bold text-[#484747] m-0 text-center">
                {sameDevice ? "Continue in Yivi" : scenario.title}
              </h2>
              {sameDevice && <p className="text-[14.5px] leading-[22px] text-[#484747] m-0 text-center">{continueText}</p>}
              {sameDevice && (
                <a href={link} className="btn-primary no-underline w-full text-center text-[17px]">
                  Open Yivi
                </a>
              )}
              {showSessionQr && <QRCodeComponent text={stampSecondDeviceForQr(link)} size={sameDevice ? 240 : 320} />}
              {!sameDevice && <span className="font-semibold text-[#484747]">Waiting for the wallet…</span>}
              {isPairing && (
                <div className="flex flex-col gap-2 w-full">
                  <label htmlFor="pairing-code" className="text-[13.5px] text-[#484747]">
                    Enter the code the wallet shows
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="pairing-code"
                      inputMode="numeric"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value)}
                      className="flex-1 min-h-9 px-3 rounded-md border border-[#D7D2CD] font-mono tracking-widest"
                    />
                    <SmallButton variant="primary" onClick={submitPairing}>
                      Pair
                    </SmallButton>
                  </div>
                  {pairingError && <span className="text-[13px] text-[#a8172f]">{pairingError}</span>}
                </div>
              )}
              <div className="flex gap-2 flex-wrap justify-center">
                {sameDevice ? (
                  <button type="button" className="btn-secondary" onClick={() => setSheetQr((q) => !q)}>
                    {sheetQr ? "Hide QR" : "Show QR instead"}
                  </button>
                ) : (
                  <a href={link} className="btn-primary no-underline">
                    Open Yivi
                  </a>
                )}
                <button type="button" className="btn-secondary" onClick={() => setQrOpen(false)}>
                  Hide
                </button>
                <button type="button" className="btn-secondary" onClick={cancel}>
                  Cancel
                </button>
              </div>
              <Hint>Hide keeps the session running, for example to issue a card the wallet asks for.</Hint>
            </div>
          </Modal>
        </Panel>

        <Panel title="Result" id="res-h" className={tab === "result" ? "" : "max-xl:hidden"} aside={statusLabel ? <Tag tone={statusTone}>{statusLabel}</Tag> : undefined}>
          {phase === "error" && (
            <p role="alert" className="text-[14px] text-[#a8172f] m-0 break-words">
              {error}
            </p>
          )}
          {result ? (
            <div className="flex flex-col gap-3">
              {result.groups.length === 0 && <Hint>Nothing was disclosed.</Hint>}
              {result.groups.map((g, i) => (
                <div key={i} className="rounded-lg border border-[#CFE4EF] overflow-hidden">
                  {g.label && <div className="px-4 py-2 bg-[#E8F3F9] border-b border-[#CFE4EF] text-[13px] font-semibold text-[#00508a] break-all">{g.label}</div>}
                  <DisclosureTable rows={g.disclosures} keyPrefix={String(i)} />
                </div>
              ))}
              <button
                type="button"
                className="self-start text-[13px] font-semibold text-[#00508a] bg-transparent border-0 p-0 cursor-pointer"
                aria-expanded={showRaw}
                onClick={() => setShowRaw((s) => !s)}
              >
                {showRaw ? "Hide raw response" : "Show raw response"}
              </button>
              {showRaw && <JsonView value={result.raw} maxHeight="24rem" label="raw response" />}
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <SubHeading>Expected</SubHeading>
            <p className="text-[14px] leading-[21px] text-[#484747] m-0">{scenario.expected}</p>
          </div>
          <div className="flex flex-col gap-1 pt-2 border-t border-[#EFEBE8]">
            <SubHeading>Look for</SubHeading>
            {scenario.lookFor.map((text, i) => (
              <label key={i} className="flex gap-2 items-start min-h-8 text-[14px] leading-[21px] text-[#484747]">
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-0.5 shrink-0 accent-[#00508a]"
                  checked={!!checks[i]}
                  onChange={(e) => setChecks((c) => ({ ...c, [i]: e.target.checked }))}
                />
                <span>{text}</span>
              </label>
            ))}
          </div>
        </Panel>
      </div>

      {/* Flush with the bottom: the scroll area has no bottom padding here, or content would show through underneath. */}
      <div className="xl:hidden mt-auto sticky bottom-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white border-t border-[#E6E1DD] shrink-0">
        {startControls}
      </div>
    </div>
  )
}
