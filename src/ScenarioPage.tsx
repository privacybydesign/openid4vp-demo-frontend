import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { CardInstance, FormatChoice, Scenario, VeramoFormat } from "./scenarios/types"
import type { Variant } from "./scenarios/index"
import { instanceSource, veramoCards, walletFor } from "./scenarios/index"
import { CARD_BY_ID, inSentence, summarise, veramoConfigurationId } from "./scenarios/cards"
import { forgetResume, requestBody, resumeIrma, saveResume, startDisclosure, takeResume } from "./scenarios/run"
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
import { Hint, Panel, Segmented, SmallButton, SubHeading, Tag } from "./ui"
import { STATUS_LABEL, STATUS_TONE } from "./status"

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
  const flagged = variant === "dcql" && scenario.dcql!.during === "upFront" && (scenario.dcql!.wallet ?? scenario.wallet).during.length > 0

  return (
    <Panel
      title="Wallet setup"
      id="setup-h"
      className={className}
      aside={<Tag tone={ready === w.before.length ? "green" : "amber"}>{w.before.length ? `${ready} of ${w.before.length} ready` : "Nothing up front"}</Tag>}
    >
      <div className="flex flex-col gap-1">
        <SubHeading aside={flagged ? <Tag tone="amber">Add flow not testable</Tag> : undefined}>Before</SubHeading>
        {flagged && <Hint>OpenID4VCI cards can't be added during a session, so this variant issues its “During” cards up front too.</Hint>}
        {w.before.length === 0 && <Hint>Nothing: this scenario starts without these cards.</Hint>}
        {bulk.length > 1 && (
          <IssueRow
            title={`All ${bulk.length} cards in one session`}
            subtitle="IRMA issuance session"
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
          <SubHeading>During: when the wallet asks to add</SubHeading>
          <Hint>
            {variant === "dcql" && scenario.dcql!.source !== "veramo"
              ? "Don't add these up front. When the wallet asks, it sends you to the real staging issuer; this tool isn't involved."
              : "Don't issue these up front: this tests adding in the middle of a session. Issue one when the wallet sends you to add it."}
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
          <SubHeading>Wallet must not contain</SubHeading>
          {[...new Set(w.absent)].map((id) => (
            <label key={id} className="flex items-center gap-2 min-h-8 text-[14px] text-[#484747]">
              <input type="checkbox" className="w-4 h-4 accent-[#00508a]" /> No {inSentence(CARD_BY_ID[id].name)} besides the ones above
            </label>
          ))}
          <Hint>This tool can't remove cards. Delete them in the app, or start with a fresh wallet.</Hint>
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
  const veramo = variant === "dcql" && scenario.dcql!.source === "veramo"
  return (
    <div className="flex flex-col gap-3">
      <SubHeading aside={<span className="text-[12.5px] text-[#6b6969]">Kept for every scenario</span>}>Session options</SubHeading>
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
      <Row label="Started on">
        <Segmented label="Started on" disabled={disabled} value={options.device} onChange={set("device")} options={[{ id: "qr", label: "Other device (QR)" }, { id: "same", label: "This phone" }]} />
      </Row>
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
          <Segmented
            label="Afterwards return to"
            disabled={disabled}
            value={options.returnTo}
            onChange={set("returnTo")}
            options={[{ id: "none", label: "Nothing" }, { id: "website", label: "This page" }, { id: "email", label: "Email" }, { id: "phone", label: "Phone" }]}
          />
        </Row>
      )}
      <Row label="Wallet link">
        <Segmented
          label="Wallet link"
          disabled={disabled}
          value={linkForm}
          onChange={onLinkForm}
          options={[{ id: "scheme", label: "Custom scheme" }, { id: "universal", label: "Universal" }, { id: "universal-staging", label: "Universal (staging)" }]}
        />
      </Row>
      {!irma && <Hint>Signing, a pairing code and a return address are IRMA-only, so they're hidden here.</Hint>}
    </div>
  )
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
    <div className="flex flex-col gap-2">
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
      <Hint>
        {vcdmCount === 0 ? "All SD-JWT VC" : vcdmCount === cards.length ? "All VCDM 2.0 SD-JWT" : `Mixed: ${vcdmCount} of ${cards.length} cards as VCDM`}. Changing a format changes what setup issues too.
      </Hint>
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
  const [resumeId] = useState(() => new URLSearchParams(window.location.search).get("resume") ?? Math.random().toString(36).slice(2, 10))
  const [resumed] = useState(() => {
    const record = takeResume(new URLSearchParams(window.location.search).get("resume"))
    return record && record.scenario === scenario.id && record.variant === variant ? record : null
  })
  const generated = useMemo(() => requestBody(scenario, variant, formats, options, resumeId), [scenario, variant, formats, options, resumeId])
  // Below xl the three panels become tabs; Request comes first, since setup is
  // done once and the request every run.
  const [tab, setTab] = useState<"request" | "setup" | "result">(resumed ? "result" : "request")
  const [setupTodo, setSetupTodo] = useState(0)
  const [edited, setEdited] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [sheetQr, setSheetQr] = useState(false)
  const [phase, setPhase] = useState<Phase>(resumed ? "running" : "ready")
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
          forgetResume(resumeId)
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
    if (resumed) follow(resumeIrma(resumed.token))
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
        saveResume(resumeId, { token: d.token, scenario: scenario.id, variant, at: Date.now() })
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
  const statusLabel = { ready: "No session yet", running: "Waiting", done: "Done", error: "Failed" }[phase]
  const endpoint = variant === "irma" ? "IRMA server" : scenario.dcql!.source === "veramo" ? `Veramo verifier (${options.prefix})` : "EUDI verifier"
  const checkedCount = Object.values(checks).filter(Boolean).length
  const sameDevice = options.device === "same"
  const showSessionQr = !sameDevice || sheetQr
  const comesBack = variant === "irma" && options.returnTo === "website"
  const continueText =
    variant === "dcql"
      ? "The session is ready on this phone. Yivi opens and asks what to share. This verifier can’t send you back: switch back to this page when Yivi is done."
      : comesBack
        ? "The session is ready on this phone. Yivi opens, asks what to share, and brings you back to this page when you’re done."
        : "The session is ready on this phone. Yivi opens and asks what to share; switch back to this page when you’re done."
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
    <div className="flex flex-col gap-6 xl:h-full xl:min-h-0">
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
          <span className="text-[12px] font-semibold uppercase tracking-wide text-[#6b6969]">
            {scenario.group} · {scenario.id}
          </span>
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

      <div className="flex flex-col gap-1 shrink-0">
        {(["irma", "dcql"] as const).map((p) =>
          scenario.unavailable[p] ? (
            <Hint key={p}>
              No {p === "irma" ? "IRMA" : "DCQL"} variant: {scenario.unavailable[p]}
            </Hint>
          ) : null
        )}
        {v.status !== "native" || v.note ? (
          <div className="flex gap-2 items-start">
            <Tag tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Tag>
            {v.note && <span className="text-[13.5px] text-[#484747]">{v.note}</span>}
          </div>
        ) : null}
      </div>

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

        <Panel
          title="Request"
          id="req-h"
          className={tab === "request" ? "" : "max-xl:hidden"}
          aside={<span className="font-mono text-[12px] text-[#6b6969]">{endpoint}</span>}
        >
          {setupTodo > 0 && (
            <button
              type="button"
              onClick={() => setTab("setup")}
              className="xl:hidden flex items-center justify-between gap-3 min-h-12 px-4 rounded-lg border border-[#EBD3A6] bg-[#FBEFD8] text-left text-[14.5px] text-[#484747] cursor-pointer"
            >
              <span>
                <strong>{setupTodo === 1 ? "1 card" : `${setupTodo} cards`} to set up</strong> before this works
              </span>
              <span className="font-semibold text-[#00508a]">Set up ›</span>
            </button>
          )}
          <FormatSwitches scenario={variant === "dcql" ? scenario : { ...scenario, dcql: undefined }} formats={formats} onFormats={onFormats} disabled={running} />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg bg-[#F5FAFC] border border-[#CFE4EF]">
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-semibold text-[#484747]">{summary.title}</span>
                <span className="text-[13px] text-[#6b6969]">{summary.detail}</span>
              </div>
              <SmallButton onClick={() => setDialogOpen(true)}>Open request</SmallButton>
            </div>
            <RequestDialog
              open={dialogOpen}
              title={`${scenario.title} · ${variant === "irma" ? "IRMA request" : "DCQL request"}`}
              value={body}
              onChange={setEdited}
              onClose={() => setDialogOpen(false)}
            />
            <div className="flex flex-wrap gap-1">
              {edited !== null && (
                <SmallButton variant="ghost" disabled={running} onClick={() => setEdited(null)}>
                  Reset to scenario
                </SmallButton>
              )}
              <SmallButton variant="ghost" onClick={() => onOpenInPlayground(variant, body)}>
                Open in playground
              </SmallButton>
            </div>
            {edited !== null && <Hint>Edited: options and formats no longer change this text until you reset it.</Hint>}
          </div>
          <div className="pt-2 border-t border-[#EFEBE8]">
            <OptionsBar variant={variant} scenario={scenario} options={options} onOptions={onOptions} linkForm={linkForm} onLinkForm={onLinkForm} disabled={running} />
          </div>
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

        <Panel title="Result" id="res-h" className={tab === "result" ? "" : "max-xl:hidden"} aside={<Tag tone={statusTone}>{statusLabel}</Tag>}>
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
          ) : (
            phase !== "error" && <Hint>Disclosed attributes appear here, one table per credential.</Hint>
          )}
          <div className="flex flex-col gap-1">
            <SubHeading>Expected disclosure</SubHeading>
            <p className="text-[14px] leading-[21px] text-[#484747] m-0">{scenario.expected}</p>
          </div>
          <div className="flex flex-col gap-1 pt-2 border-t border-[#EFEBE8]">
            <SubHeading aside={<span className="text-[12.5px] text-[#6b6969]">{checkedCount} of {scenario.lookFor.length}</span>}>Look for</SubHeading>
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

      <div className="xl:hidden sticky bottom-0 -mx-4 md:-mx-8 -mb-6 px-4 md:px-8 py-3 bg-white border-t border-[#E6E1DD] shrink-0">{startControls}</div>
    </div>
  )
}
