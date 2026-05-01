import { useCallback, useEffect, useState } from "react"
import "./App.css"
import { tabs } from "./tabs"
import type { TabId, DisclosureContent, IssuanceComplete, VerifierSessionResult, IssuerSessionResult } from "./tabs"
import compactJson from "./compactJson"
import TabBar from "./TabBar"
import RequestEditor from "./RequestEditor"
import SessionPoller from "./SessionPoller"
import WalletResponseView from "./WalletResponseView"
import IssuerSessionPoller from "./IssuerSessionPoller"
import IssuanceCompleteView from "./IssuanceCompleteView"

enum FrontendState {
  Pending,
  Polling,
  Done,
}

function defaultRequestForTab(tab: TabId): string {
  return compactJson(tabs.find((t) => t.tab === tab)!.defaultRequest)
}

const allTabs = tabs.map((t) => t.tab)

function readStateFromUrl(): { tab: TabId; requestPerTab: Record<TabId, string> } {
  const params = new URLSearchParams(window.location.search)

  const tabParam = params.get("tab")
  const tab: TabId = allTabs.includes(tabParam as TabId) ? (tabParam as TabId) : "irma"

  const defaults = Object.fromEntries(allTabs.map((t) => [t, defaultRequestForTab(t)])) as Record<TabId, string>

  const requestParam = params.get("request")
  if (requestParam) {
    try {
      defaults[tab] = atob(requestParam)
    } catch { /* ignore invalid base64 */ }
  }

  return { tab, requestPerTab: defaults }
}

function writeStateToUrl(tab: TabId, request: string) {
  const params = new URLSearchParams()
  params.set("tab", tab)

  const isDefault = request === defaultRequestForTab(tab)
  if (!isDefault) {
    params.set("request", btoa(request))
  }

  window.history.replaceState(null, "", `?${params}`)
}

function App() {
  const initial = readStateFromUrl()
  const [activeTab, setActiveTab] = useState<TabId>(initial.tab)
  const [frontendState, setFrontendState] = useState(FrontendState.Pending)
  const [pollingCallbackId, setPollingCallbackId] = useState<ReturnType<typeof setInterval> | undefined>(undefined)
  const [walletResponse, setWalletResponse] = useState<DisclosureContent[][]>([])
  const [issuanceResult, setIssuanceResult] = useState<IssuanceComplete | null>(null)
  const [walletLink, setWalletLink] = useState("")
  const [txCode, setTxCode] = useState<string | undefined>(undefined)
  const [requestPerTab, setRequestPerTab] = useState(initial.requestPerTab)

  const tab = tabs.find((t) => t.tab === activeTab)!

  const updateUrl = useCallback(
    (tab: TabId, requests: Record<TabId, string>) => {
      writeStateToUrl(tab, requests[tab])
    },
    []
  )

  useEffect(() => {
    if (frontendState === FrontendState.Pending) {
      updateUrl(activeTab, requestPerTab)
    }
  }, [activeTab, requestPerTab, frontendState, updateUrl])

  const switchTab = (next: TabId) => {
    if (frontendState !== FrontendState.Pending) return
    setActiveTab(next)
  }

  const changeRequest = (value: string) => {
    setRequestPerTab((prev) => ({ ...prev, [activeTab]: value }))
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
      const result = await session.poll!()
      if (result) {
        clearInterval(id)
        setWalletResponse(result)
        setFrontendState(FrontendState.Done)
      }
    }, 500)

    setPollingCallbackId(id)
  }

  const startIssuerSession = async (session: IssuerSessionResult) => {
    setWalletLink(session.walletLink)
    setTxCode(session.txCode)
    setFrontendState(FrontendState.Polling)

    const id = setInterval(async () => {
      const result = await session.poll()
      if (result) {
        clearInterval(id)
        setIssuanceResult(result)
        setFrontendState(FrontendState.Done)
      }
    }, 500)

    setPollingCallbackId(id)
  }

  const startSession = async () => {
    if (tab.kind === "verifier") {
      const session = await tab.startSession(requestPerTab[activeTab])
      await startVerifierSession(session)
    } else {
      const session = await tab.startSession(requestPerTab[activeTab])
      await startIssuerSession(session)
    }
  }

  const cancel = () => {
    clearInterval(pollingCallbackId)
    setFrontendState(FrontendState.Pending)
    setTxCode(undefined)
  }

  const reset = () => {
    setFrontendState(FrontendState.Pending)
    setTxCode(undefined)
    setIssuanceResult(null)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-[#CFE4EF] flex items-center px-4 py-4 gap-4">
        <img src="/yivi-logo.svg" alt="Yivi" className="h-10" />
        <h1 className="text-lg font-bold text-[#484747] m-0">Verifier Tool</h1>
      </header>

      <div className="flex-1 flex flex-col items-center w-full px-6 py-6 overflow-hidden">
        <TabBar tabs={tabs} activeTab={activeTab} onSwitch={switchTab} />

        {frontendState === FrontendState.Pending && (
          <RequestEditor
            activeTab={activeTab}
            defaultValue={requestPerTab[activeTab]}
            presets={tab.presets}
            onChange={changeRequest}
            onStart={startSession}
          />
        )}

        {frontendState === FrontendState.Polling && tab.kind === "verifier" && (
          <SessionPoller walletLink={walletLink} onCancel={cancel} />
        )}

        {frontendState === FrontendState.Polling && tab.kind === "issuer" && (
          <IssuerSessionPoller walletLink={walletLink} txCode={txCode} onCancel={cancel} />
        )}

        {frontendState === FrontendState.Done && tab.kind === "verifier" && (
          <WalletResponseView disclosures={walletResponse} onReset={reset} />
        )}

        {frontendState === FrontendState.Done && tab.kind === "issuer" && issuanceResult && (
          <IssuanceCompleteView credentialName={issuanceResult.credentialName} onReset={reset} />
        )}
      </div>
    </div>
  )
}

export default App
