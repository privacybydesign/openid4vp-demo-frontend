import { useCallback, useEffect, useState } from "react"
import "./App.css"
import { verifiers } from "./verifiers"
import type { DisclosureContent, VerifierTab, SessionResult } from "./verifiers"
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
  return JSON.stringify(verifiers.find((v) => v.tab === tab)!.defaultRequest, null, 4)
}

function readStateFromUrl(): { tab: VerifierTab; requestPerTab: Record<VerifierTab, string> } {
  const params = new URLSearchParams(window.location.search)

  const tabParam = params.get("tab")
  const tab: VerifierTab = tabParam === "veramo" ? "veramo" : "eudi"

  const defaults: Record<VerifierTab, string> = {
    eudi: defaultRequestForTab("eudi"),
    veramo: defaultRequestForTab("veramo"),
  }

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
    setWalletLink(session.walletLink)
    setFrontendState(FrontendState.Polling)

    const id = setInterval(async () => {
      const result = await session.poll()
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
    <div className="w-screen h-screen flex items-center flex-col align-center">
      <h2 className="text-3xl">Yivi OpenID4VP Verifier</h2>

      <TabBar verifiers={verifiers} activeTab={activeTab} onSwitch={switchTab} />

      {frontendState === FrontendState.Pending && (
        <RequestEditor
          activeTab={activeTab}
          defaultValue={requestPerTab[activeTab]}
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
  )
}

export default App
