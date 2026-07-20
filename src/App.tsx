import { useCallback, useEffect, useState } from "react"
import "./App.css"
import { tabs } from "./tabs"
import type {
  TabId,
  IssuerMode,
  DisclosureContent,
  IssuanceComplete,
  VerifierSessionResult,
  IssuerSessionResult,
  ClientIdPrefix,
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
const ALL_CLIENT_ID_PREFIXES: ClientIdPrefix[] = ["did:jwk", "did:web"]
const DEFAULT_CLIENT_ID_PREFIX: ClientIdPrefix = "did:jwk"

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

const ISSUER_TAB: TabId = "veramo-issuer"
const ALL_ISSUER_MODES: IssuerMode[] = ["pre-authorized-code", "authorization-code"]

function defaultRequestFor(tabId: TabId, mode: IssuerMode | null): string {
  const tab = tabs.find((t) => t.tab === tabId)!
  if (tab.kind === "issuer") {
    const modeId = mode ?? tab.defaultMode
    return compactJson(tab.modes[modeId].defaultRequest)
  }
  return compactJson(tab.defaultRequest)
}

const allTabs = tabs.map((t) => t.tab)
const issuerTab = tabs.find((t) => t.tab === ISSUER_TAB && t.kind === "issuer")
const defaultIssuerMode: IssuerMode = issuerTab?.kind === "issuer" ? issuerTab.defaultMode : "pre-authorized-code"

const DEFAULT_ISSUER_REQUEST = defaultRequestFor(ISSUER_TAB, "pre-authorized-code")

function readStateFromUrl(): {
  tab: TabId
  mode: IssuerMode
  linkForm: LinkForm
  clientIdPrefix: ClientIdPrefix
  requestPerTab: Record<TabId, string>
  issuerRequest: string
} {
  const params = new URLSearchParams(window.location.search)

  const tabParam = params.get("tab")
  const tab: TabId = allTabs.includes(tabParam as TabId) ? (tabParam as TabId) : "irma"

  const modeParam = params.get("mode")
  const mode: IssuerMode = ALL_ISSUER_MODES.includes(modeParam as IssuerMode)
    ? (modeParam as IssuerMode)
    : defaultIssuerMode

  const linkParam = params.get("link")
  const linkForm: LinkForm = ALL_LINK_FORMS.includes(linkParam as LinkForm)
    ? (linkParam as LinkForm)
    : DEFAULT_LINK_FORM

  const prefixParam = params.get("prefix")
  const clientIdPrefix: ClientIdPrefix = ALL_CLIENT_ID_PREFIXES.includes(prefixParam as ClientIdPrefix)
    ? (prefixParam as ClientIdPrefix)
    : DEFAULT_CLIENT_ID_PREFIX

  const requestPerTab = Object.fromEntries(
    allTabs.map((t) => [t, defaultRequestFor(t, null)])
  ) as Record<TabId, string>

  let issuerRequest = DEFAULT_ISSUER_REQUEST

  const requestParam = params.get("request")
  if (requestParam) {
    try {
      const decoded = atob(requestParam)
      if (tab === ISSUER_TAB) {
        issuerRequest = decoded
      } else {
        requestPerTab[tab] = decoded
      }
    } catch { /* ignore invalid base64 */ }
  }

  return { tab, mode, linkForm, clientIdPrefix, requestPerTab, issuerRequest }
}

function writeStateToUrl(
  tab: TabId,
  mode: IssuerMode,
  linkForm: LinkForm,
  clientIdPrefix: ClientIdPrefix,
  request: string
) {
  const params = new URLSearchParams()
  params.set("tab", tab)

  const defaultRequest = tab === ISSUER_TAB ? DEFAULT_ISSUER_REQUEST : defaultRequestFor(tab, null)
  const isDefault = request === defaultRequest
  if (tab === ISSUER_TAB) {
    params.set("mode", mode)
  }
  if (linkForm !== DEFAULT_LINK_FORM) {
    params.set("link", linkForm)
  }
  if (tab === "veramo-verifier" && clientIdPrefix !== DEFAULT_CLIENT_ID_PREFIX) {
    params.set("prefix", clientIdPrefix)
  }
  if (!isDefault) {
    params.set("request", btoa(request))
  }

  window.history.replaceState(null, "", `?${params}`)
}

function App() {
  const initial = readStateFromUrl()
  const [activeTab, setActiveTab] = useState<TabId>(initial.tab)
  const [activeMode, setActiveMode] = useState<IssuerMode>(initial.mode)
  const [linkForm, setLinkForm] = useState<LinkForm>(initial.linkForm)
  const [clientIdPrefix, setClientIdPrefix] = useState<ClientIdPrefix>(initial.clientIdPrefix)
  const [frontendState, setFrontendState] = useState<FrontendState>(FrontendState.Pending)
  const [pollingCallbackId, setPollingCallbackId] = useState<ReturnType<typeof setInterval> | undefined>(undefined)
  const [walletResponse, setWalletResponse] = useState<DisclosureContent[][]>([])
  const [issuanceResult, setIssuanceResult] = useState<IssuanceComplete | null>(null)
  const [walletLink, setWalletLink] = useState("")
  const [txCode, setTxCode] = useState<string | undefined>(undefined)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [requestPerTab, setRequestPerTab] = useState(initial.requestPerTab)
  const [issuerRequest, setIssuerRequest] = useState(initial.issuerRequest)

  const tab = tabs.find((t) => t.tab === activeTab)!
  const currentRequest = activeTab === ISSUER_TAB ? issuerRequest : requestPerTab[activeTab]
  const displayedLink = applyLinkForm(walletLink, linkForm, hostForLinkForm(linkForm))

  const updateUrl = useCallback(
    (tab: TabId, mode: IssuerMode, linkForm: LinkForm, clientIdPrefix: ClientIdPrefix, request: string) => {
      writeStateToUrl(tab, mode, linkForm, clientIdPrefix, request)
    },
    []
  )

  useEffect(() => {
    if (frontendState === FrontendState.Pending) {
      updateUrl(activeTab, activeMode, linkForm, clientIdPrefix, currentRequest)
    }
  }, [activeTab, activeMode, linkForm, clientIdPrefix, currentRequest, frontendState, updateUrl])

  const switchTab = (next: TabId) => {
    if (frontendState !== FrontendState.Pending) return
    setActiveTab(next)
  }

  const switchMode = (next: IssuerMode) => {
    if (frontendState !== FrontendState.Pending) return
    setActiveMode(next)
  }

  const switchLinkForm = (next: LinkForm) => {
    if (frontendState !== FrontendState.Pending) return
    setLinkForm(next)
  }

  const switchClientIdPrefix = (next: ClientIdPrefix) => {
    if (frontendState !== FrontendState.Pending) return
    setClientIdPrefix(next)
  }

  const changeRequest = (value: string) => {
    if (activeTab === ISSUER_TAB) {
      setIssuerRequest(value)
    } else {
      setRequestPerTab((prev) => ({ ...prev, [activeTab]: value }))
    }
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
    setFrontendState(FrontendState.Polling)

    const id = setInterval(async () => {
      try {
        const result = await session.poll()
        if (result) {
          clearInterval(id)
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
        const session = await tab.startSession(requestPerTab[activeTab], linkForm, clientIdPrefix)
        await startVerifierSession(session)
      } else {
        const session = await tab.modes[activeMode].startSession(issuerRequest)
        await startIssuerSession(session)
      }
    } catch (error) {
      showError(error)
    }
  }

  const cancel = () => {
    clearInterval(pollingCallbackId)
    setFrontendState(FrontendState.Pending)
    setTxCode(undefined)
  }

  const reset = () => {
    clearInterval(pollingCallbackId)
    setFrontendState(FrontendState.Pending)
    setTxCode(undefined)
    setIssuanceResult(null)
    setErrorMessage("")
  }

  const subModes = tab.kind === "issuer"
    ? ALL_ISSUER_MODES.map((id) => ({ id, label: tab.modes[id].label }))
    : undefined
  const presets = tab.kind === "issuer" ? tab.modes[activeMode].presets : tab.presets
  const clientIdPrefixes = tab.kind === "verifier" ? tab.clientIdPrefixes : undefined

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-[#CFE4EF] flex items-center px-4 py-4 gap-4">
        <img src="/yivi-logo.svg" alt="Yivi" className="h-10" />
        <h1 className="text-lg font-bold text-[#484747] m-0">Verifier Tool</h1>
      </header>

      <div className="flex-1 flex flex-col items-center w-full px-3 py-4 md:px-6 md:py-6 overflow-y-auto md:overflow-hidden">
        <TabBar tabs={tabs} activeTab={activeTab} onSwitch={switchTab} />

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
            clientIdPrefixes={clientIdPrefixes}
            clientIdPrefix={clientIdPrefix}
            onClientIdPrefixChange={switchClientIdPrefix}
            onChange={changeRequest}
            onStart={startSession}
          />
        )}

        {frontendState === FrontendState.Polling && tab.kind === "verifier" && (
          <SessionPoller walletLink={displayedLink} linkForm={linkForm} onCancel={cancel} />
        )}

        {frontendState === FrontendState.Polling && tab.kind === "issuer" && (
          <IssuerSessionPoller walletLink={displayedLink} linkForm={linkForm} txCode={txCode} onCancel={cancel} />
        )}

        {frontendState === FrontendState.Done && tab.kind === "verifier" && (
          <WalletResponseView disclosures={walletResponse} onReset={reset} />
        )}

        {frontendState === FrontendState.Done && tab.kind === "issuer" && issuanceResult && (
          <IssuanceCompleteView credentialName={issuanceResult.credentialName} onReset={reset} />
        )}

        {frontendState === FrontendState.Error && (
          <ErrorView message={errorMessage} onReset={reset} />
        )}
      </div>
    </div>
  )
}

export default App
