import { useCallback, useEffect, useState } from "react"
import "./App.css"
import { verifiers } from "./verifiers"
import type { DisclosureContent, VerifierTab, SessionResult } from "./verifiers"
import compactJson from "./compactJson"
import TabBar from "./TabBar"
import RequestEditor from "./RequestEditor"
import SessionPoller from "./SessionPoller"
import WalletResponseView from "./WalletResponseView"

enum FrontendState {
  Pending,
  Polling,
  Done,
}

function defaultRequestForTab(tab: VerifierTab): string {
  return compactJson(verifiers.find((v) => v.tab === tab)!.defaultRequest)
}

const allTabs = verifiers.map((v) => v.tab)

function readStateFromUrl(): { tab: VerifierTab; requestPerTab: Record<VerifierTab, string> } {
  const params = new URLSearchParams(window.location.search)

  const tabParam = params.get("tab")
  const tab: VerifierTab = allTabs.includes(tabParam as VerifierTab) ? (tabParam as VerifierTab) : "irma"

  const defaults = Object.fromEntries(allTabs.map((t) => [t, defaultRequestForTab(t)])) as Record<VerifierTab, string>

  const requestParam = params.get("request")
  if (requestParam) {
    try {
      defaults[tab] = atob(requestParam)
    } catch { /* ignore invalid base64 */ }
  }

  return { tab, requestPerTab: defaults }
}

function writeStateToUrl(tab: VerifierTab, request: string) {
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
  const [activeTab, setActiveTab] = useState<VerifierTab>(initial.tab)
  const [frontendState, setFrontendState] = useState(FrontendState.Pending)
  const [pollingCallbackId, setPollingCallbackId] = useState(0)
  const [walletResponse, setWalletResponse] = useState<DisclosureContent[][]>([])
  const [walletLink, setWalletLink] = useState("")
  const [requestPerTab, setRequestPerTab] = useState(initial.requestPerTab)

  const verifier = verifiers.find((v) => v.tab === activeTab)!

  const updateUrl = useCallback(
    (tab: VerifierTab, requests: Record<VerifierTab, string>) => {
      writeStateToUrl(tab, requests[tab])
    },
    []
  )

  useEffect(() => {
    if (frontendState === FrontendState.Pending) {
      updateUrl(activeTab, requestPerTab)
    }
  }, [activeTab, requestPerTab, frontendState, updateUrl])

  const switchTab = (tab: VerifierTab) => {
    if (frontendState !== FrontendState.Pending) return
    setActiveTab(tab)
  }

  const changeRequest = (value: string) => {
    setRequestPerTab((prev) => ({ ...prev, [activeTab]: value }))
  }

  const startSession = async () => {
    const session: SessionResult = await verifier.startSession(requestPerTab[activeTab])

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

  const cancel = () => {
    clearInterval(pollingCallbackId)
    setFrontendState(FrontendState.Pending)
  }

  const reset = () => setFrontendState(FrontendState.Pending)

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-[#CFE4EF] flex items-center px-4 py-4 gap-4">
        <img src="/yivi-logo.svg" alt="Yivi" className="h-10" />
        <h1 className="text-lg font-bold text-[#484747] m-0">Verifier Tool</h1>
      </header>

      <div className="flex-1 flex flex-col items-center w-full px-6 py-6 overflow-hidden">
        <TabBar verifiers={verifiers} activeTab={activeTab} onSwitch={switchTab} />

        {frontendState === FrontendState.Pending && (
          <RequestEditor
            activeTab={activeTab}
            defaultValue={requestPerTab[activeTab]}
            presets={verifier.presets}
            onChange={changeRequest}
            onStart={startSession}
          />
        )}

        {frontendState === FrontendState.Polling && (
          <SessionPoller walletLink={walletLink} onCancel={cancel} />
        )}

        {frontendState === FrontendState.Done && (
          <WalletResponseView disclosures={walletResponse} onReset={reset} />
        )}
      </div>
    </div>
  )
}

export default App
