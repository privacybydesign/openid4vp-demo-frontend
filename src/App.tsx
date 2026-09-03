import { useCallback, useEffect, useState } from "react"
import "./App.css"
import { tabs, tabGroups, findTab, groupOfTab, issuerModes, resolveMode } from "./tabs"
import type {
  TabId,
  TabGroupId,
  IssuerMode,
  DisclosureGroup,
  IssuanceComplete,
  VerifierSessionResult,
  IssuerSessionResult,
} from "./tabs"
import compactJson from "./compactJson"
import TabBar from "./TabBar"
import RequestEditor from "./RequestEditor"
import SessionPoller from "./SessionPoller"
import WalletResponseView from "./WalletResponseView"
import IssuerSessionPoller from "./IssuerSessionPoller"
import IssuanceCompleteView from "./IssuanceCompleteView"
import ErrorView from "./ErrorView"
import { applyLinkForm } from "./walletLink"
import type { LinkForm } from "./walletLink"

const UNIVERSAL_LINK_HOST = import.meta.env.VITE_UNIVERSAL_LINK_HOST || "open.yivi.app"
const UNIVERSAL_LINK_HOST_STAGING = import.meta.env.VITE_UNIVERSAL_LINK_HOST_STAGING || "open.staging.yivi.app"
const ALL_LINK_FORMS: LinkForm[] = ["scheme", "universal", "universal-staging"]
const DEFAULT_LINK_FORM: LinkForm = "scheme"

function hostForLinkForm(form: LinkForm): string {
  return form === "universal-staging" ? UNIVERSAL_LINK_HOST_STAGING : UNIVERSAL_LINK_HOST
}

const FrontendState = {
  Pending: "Pending",
  Polling: "Polling",
  Done: "Done",
  Error: "Error",
} as const
type FrontendState = typeof FrontendState[keyof typeof FrontendState]

const ALL_ISSUER_MODES: IssuerMode[] = ["pre-authorized-code", "authorization-code", "irma-issuance"]

function defaultRequestFor(tabId: TabId, mode: IssuerMode | null): string {
  const tab = findTab(tabId)
  if (tab.kind === "issuer") {
    return compactJson(resolveMode(tab, mode ?? tab.defaultMode).defaultRequest)
  }
  return compactJson(tab.defaultRequest)
}

const allTabs = tabs.map((t) => t.tab)

// Tab ids as they were before the tabs were grouped, so links shared back then
// still land where they used to.
const LEGACY_TAB_IDS: Record<string, TabId> = {
  irma: "irma-verifier",
  eudi: "eudi-verifier",
}

// Where a visit with no (or an unrecognised) ?tab= lands. Stated outright rather
// than derived from the first group, so reordering the tab bar does not silently
// move where the tool opens.
const DEFAULT_TAB: TabId = "irma-issuer"

// Where switching to a group lands before it has been visited.
const firstTabPerGroup = Object.fromEntries(
  tabGroups.map((g) => [g.id, g.tabs[0].tab])
) as Record<TabGroupId, TabId>

// One request per tab, not per (tab, mode): RequestEditor only remounts when
// activeTab changes, so keying any finer would leave the editor showing text that
// is no longer the state. Switching mode therefore keeps whatever is in the
// editor, which is also what this tool did before it had a second issuer tab.
const defaultRequestPerTab = Object.fromEntries(
  tabs.map((t) => [t.tab, defaultRequestFor(t.tab, null)])
) as Record<TabId, string>

const defaultIssuerMode: IssuerMode = "pre-authorized-code"

function readStateFromUrl(): {
  tab: TabId
  mode: IssuerMode
  linkForm: LinkForm
  requestPerTab: Record<TabId, string>
} {
  const params = new URLSearchParams(window.location.search)

  const tabParam = params.get("tab") ?? ""
  const named = (LEGACY_TAB_IDS[tabParam] ?? tabParam) as TabId
  const tab: TabId = allTabs.includes(named) ? named : DEFAULT_TAB

  const modeParam = params.get("mode")
  const mode: IssuerMode = ALL_ISSUER_MODES.includes(modeParam as IssuerMode)
    ? (modeParam as IssuerMode)
    : defaultIssuerMode

  const linkParam = params.get("link")
  const linkForm: LinkForm = ALL_LINK_FORMS.includes(linkParam as LinkForm)
    ? (linkParam as LinkForm)
    : DEFAULT_LINK_FORM

  const requestPerTab = { ...defaultRequestPerTab }

  const requestParam = params.get("request")
  if (requestParam) {
    try {
      requestPerTab[tab] = atob(requestParam)
    } catch { /* ignore invalid base64 */ }
  }

  return { tab, mode, linkForm, requestPerTab }
}

function writeStateToUrl(tab: TabId, mode: IssuerMode, linkForm: LinkForm, request: string) {
  const params = new URLSearchParams()
  params.set("tab", tab)

  const tabConfig = findTab(tab)
  const isDefault = request === defaultRequestFor(tab, mode)
  // Only worth carrying when the tab has more than one flow to name.
  if (tabConfig.kind === "issuer" && issuerModes(tabConfig).length > 1) {
    params.set("mode", mode)
  }
  if (linkForm !== DEFAULT_LINK_FORM) {
    params.set("link", linkForm)
  }
  if (!isDefault) {
    params.set("request", btoa(request))
  }

  window.history.replaceState(null, "", `?${params}`)
}

function App() {
  const initial = readStateFromUrl()
  const [activeTab, setActiveTab] = useState<TabId>(initial.tab)
  // Which tab each group returns to, so moving between Verifier and Issuer keeps
  // your place in both rather than resetting to the first tab.
  const [lastTabPerGroup, setLastTabPerGroup] = useState<Record<TabGroupId, TabId>>({
    ...firstTabPerGroup,
    [groupOfTab(initial.tab).id]: initial.tab,
  })
  const [activeMode, setActiveMode] = useState<IssuerMode>(initial.mode)
  const [linkForm, setLinkForm] = useState<LinkForm>(initial.linkForm)
  const [frontendState, setFrontendState] = useState<FrontendState>(FrontendState.Pending)
  const [pollingCallbackId, setPollingCallbackId] = useState<ReturnType<typeof setInterval> | undefined>(undefined)
  const [walletResponse, setWalletResponse] = useState<DisclosureGroup[]>([])
  const [issuanceResult, setIssuanceResult] = useState<IssuanceComplete | null>(null)
  const [walletLink, setWalletLink] = useState("")
  const [txCode, setTxCode] = useState<string | undefined>(undefined)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [requestPerTab, setRequestPerTab] = useState(initial.requestPerTab)
  // Set for issuer tabs whose issuer has no offer state to poll: the finish is the
  // operator's assertion, so the name to show has to be decided up front.
  const [pendingCredentialName, setPendingCredentialName] = useState<string | undefined>(undefined)
  // Tracked explicitly rather than inferred from pollingCallbackId, which is not
  // cleared on cancel and would leave a stale id behind after a polled session.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  // Whether the Done state rests on the issuer saying so, or on the operator.
  const [issuanceObserved, setIssuanceObserved] = useState(true)

  const tab = findTab(activeTab)
  const currentRequest = requestPerTab[activeTab]
  const displayedLink = applyLinkForm(walletLink, linkForm, hostForLinkForm(linkForm))

  const updateUrl = useCallback(
    (tab: TabId, mode: IssuerMode, linkForm: LinkForm, request: string) => {
      writeStateToUrl(tab, mode, linkForm, request)
    },
    []
  )

  useEffect(() => {
    if (frontendState === FrontendState.Pending) {
      updateUrl(activeTab, activeMode, linkForm, currentRequest)
    }
  }, [activeTab, activeMode, linkForm, currentRequest, frontendState, updateUrl])

  const switchTab = (next: TabId) => {
    if (frontendState !== FrontendState.Pending) return
    setActiveTab(next)
    setLastTabPerGroup((prev) => ({ ...prev, [groupOfTab(next).id]: next }))
  }

  const switchGroup = (next: TabGroupId) => {
    switchTab(lastTabPerGroup[next])
  }

  const switchMode = (next: IssuerMode) => {
    if (frontendState !== FrontendState.Pending) return
    setActiveMode(next)
  }

  const switchLinkForm = (next: LinkForm) => {
    if (frontendState !== FrontendState.Pending) return
    setLinkForm(next)
  }

  const changeRequest = (value: string) => {
    setRequestPerTab((prev) => ({ ...prev, [activeTab]: value }))
  }

  const showError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    setErrorMessage(message)
    setFrontendState(FrontendState.Error)
  }

  const startVerifierSession = async (session: VerifierSessionResult) => {
    if (session.disclosures) {
      setWalletResponse(session.disclosures)
      setFrontendState(FrontendState.Done)
      return
    }

    setWalletLink(session.walletLink!)
    setFrontendState(FrontendState.Polling)

    const id = setInterval(async () => {
      try {
        const result = await session.poll!()
        if (result) {
          clearInterval(id)
          setWalletResponse(result)
          setFrontendState(FrontendState.Done)
        }
      } catch (error) {
        clearInterval(id)
        showError(error)
      }
    }, 500)

    setPollingCallbackId(id)
  }

  const startIssuerSession = async (session: IssuerSessionResult) => {
    setWalletLink(session.walletLink)
    setTxCode(session.txCode)
    setPendingCredentialName(session.credentialName)
    setFrontendState(FrontendState.Polling)

    // No poll means the issuer keeps no offer state to ask about, so there is
    // nothing to watch and no interval to start. The poller renders a confirm
    // button instead, and `confirmIssuance` below ends the session.
    if (!session.poll) {
      setAwaitingConfirmation(true)
      return
    }

    const poll = session.poll
    const id = setInterval(async () => {
      try {
        const result = await poll()
        if (result) {
          clearInterval(id)
          setIssuanceObserved(true)
          setIssuanceResult(result)
          setFrontendState(FrontendState.Done)
        }
      } catch (error) {
        clearInterval(id)
        showError(error)
      }
    }, 500)

    setPollingCallbackId(id)
  }

  const startSession = async () => {
    try {
      if (tab.kind === "verifier") {
        const session = await tab.startSession(currentRequest, linkForm)
        await startVerifierSession(session)
      } else {
        const session = await resolveMode(tab, activeMode).startSession(currentRequest)
        await startIssuerSession(session)
      }
    } catch (error) {
      showError(error)
    }
  }

  // The operator saying the wallet has the credential, for issuers that cannot be
  // asked. Deliberately not dressed up as an observation: the success view names
  // the credential that was offered, which is all anyone here actually knows.
  const confirmIssuance = () => {
    setAwaitingConfirmation(false)
    setIssuanceObserved(false)
    setIssuanceResult({ credentialName: pendingCredentialName ?? "Credential" })
    setFrontendState(FrontendState.Done)
  }

  const cancel = () => {
    clearInterval(pollingCallbackId)
    setPollingCallbackId(undefined)
    setAwaitingConfirmation(false)
    setFrontendState(FrontendState.Pending)
    setTxCode(undefined)
  }

  const reset = () => {
    clearInterval(pollingCallbackId)
    setPollingCallbackId(undefined)
    setAwaitingConfirmation(false)
    setFrontendState(FrontendState.Pending)
    setTxCode(undefined)
    setIssuanceResult(null)
    setErrorMessage("")
  }

  // Only the modes this tab actually declares, and only worth a switcher when
  // there is a choice to make.
  const subModes = tab.kind === "issuer" && issuerModes(tab).length > 1
    ? issuerModes(tab).map((id) => ({ id, label: tab.modes[id]!.label }))
    : undefined
  const presets = tab.kind === "issuer" ? resolveMode(tab, activeMode).presets : tab.presets

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-[#CFE4EF] flex items-center px-4 py-4 gap-4">
        <img src="/yivi-logo.svg" alt="Yivi" className="h-10" />
        <h1 className="text-lg font-bold text-[#484747] m-0">Session Tool</h1>
      </header>

      <div className="flex-1 flex flex-col items-center w-full px-3 py-4 md:px-6 md:py-6 overflow-y-auto md:overflow-hidden">
        <TabBar
          groups={tabGroups}
          activeTab={activeTab}
          onSwitchGroup={switchGroup}
          onSwitch={switchTab}
        />

        {frontendState === FrontendState.Pending && (
          <RequestEditor
            activeTab={activeTab}
            defaultValue={currentRequest}
            presets={presets}
            subModes={subModes}
            activeSubMode={tab.kind === "issuer" ? activeMode : undefined}
            onSubModeChange={(id) => switchMode(id as IssuerMode)}
            linkForm={linkForm}
            onLinkFormChange={switchLinkForm}
            onChange={changeRequest}
            onStart={startSession}
          />
        )}

        {frontendState === FrontendState.Polling && tab.kind === "verifier" && (
          <SessionPoller walletLink={displayedLink} linkForm={linkForm} onCancel={cancel} />
        )}

        {frontendState === FrontendState.Polling && tab.kind === "issuer" && (
          <IssuerSessionPoller
            walletLink={displayedLink}
            linkForm={linkForm}
            txCode={txCode}
            onCancel={cancel}
            onConfirm={awaitingConfirmation ? confirmIssuance : undefined}
          />
        )}

        {frontendState === FrontendState.Done && tab.kind === "verifier" && (
          <WalletResponseView disclosures={walletResponse} onReset={reset} />
        )}

        {frontendState === FrontendState.Done && tab.kind === "issuer" && issuanceResult && (
          <IssuanceCompleteView
            credentialName={issuanceResult.credentialName}
            observed={issuanceObserved}
            onReset={reset}
          />
        )}

        {frontendState === FrontendState.Error && (
          <ErrorView message={errorMessage} onReset={reset} />
        )}
      </div>
    </div>
  )
}

export default App
