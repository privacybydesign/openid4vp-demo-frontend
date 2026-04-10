import { useState } from "react"
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

function App() {
  const [activeTab, setActiveTab] = useState<VerifierTab>("eudi")
  const [frontendState, setFrontendState] = useState(FrontendState.Pending)
  const [pollingCallbackId, setPollingCallbackId] = useState(0)
  const [walletResponse, setWalletResponse] = useState<DisclosureContent[][]>([])
  const [walletLink, setWalletLink] = useState("")

  const verifier = verifiers.find((v) => v.tab === activeTab)!

  const [requestPerTab, setRequestPerTab] = useState<Record<VerifierTab, string>>({
    eudi: JSON.stringify(verifiers.find((v) => v.tab === "eudi")!.defaultRequest, null, 4),
    veramo: JSON.stringify(verifiers.find((v) => v.tab === "veramo")!.defaultRequest, null, 4),
  })

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

      <TabBar
        verifiers={verifiers}
        activeTab={activeTab}
        onSwitch={(tab) => frontendState === FrontendState.Pending && setActiveTab(tab)}
      />

      {frontendState === FrontendState.Pending && (
        <RequestEditor
          activeTab={activeTab}
          defaultValue={requestPerTab[activeTab]}
          onChange={(value) => setRequestPerTab((prev) => ({ ...prev, [activeTab]: value }))}
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
