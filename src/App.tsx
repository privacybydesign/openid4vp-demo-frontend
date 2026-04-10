import { useState } from 'react'
import './App.css'
import { Editor } from '@monaco-editor/react'
import QRCodeComponent from './QrCodeComponent'

type VerifierTab = "eudi" | "veramo"

const eudiRequest = {
  "type": "vp_token",
  "dcql_query": {
    "credentials": [
      {
        "id": "mobilenumber",
        "format": "dc+sd-jwt",
        "meta": {
          "vct_values": ["pbdf-staging.sidn-pbdf.mobilenumber"]
        },
        "claims": [
          {
            "id": "mn",
            "path": ["mobilenumber"]
          }
        ]
      },
    ],
  },
  "nonce": "nonce",
  "jar_mode": "by_reference",
  "request_uri_method": "post",
  "issuer_chain": "-----BEGIN CERTIFICATE-----\nMIICbTCCAhSgAwIBAgIUX8STjkv3TRF5UBstXlp4ILHy2h0wCgYIKoZIzj0EAwQw\nRjELMAkGA1UEBhMCTkwxDTALBgNVBAoMBFlpdmkxKDAmBgNVBAMMH1lpdmkgU3Rh\nZ2luZyBSZXF1ZXN0b3JzIFJvb3QgQ0EwHhcNMjUwODEyMTUwODA1WhcNNDAwODA4\nMTUwODA0WjBMMQswCQYDVQQGEwJOTDENMAsGA1UECgwEWWl2aTEuMCwGA1UEAwwl\nWWl2aSBTdGFnaW5nIEF0dGVzdGF0aW9uIFByb3ZpZGVycyBDQTBZMBMGByqGSM49\nAgEGCCqGSM49AwEHA0IABMDTwj6APykJnBdr0sCO8LpkULpbXFOBWV47hKKsJHsa\nCVMarjLCYU3CV57UdklHSlMrtm7vfoDpYn4BvUv00UqjgdkwgdYwEgYDVR0TAQH/\nBAgwBgEB/wIBADAfBgNVHSMEGDAWgBRjtHvVs5rhDnC0L2AUi+7ncyXe1jBwBgNV\nHR8EaTBnMGWgY6Bhhl9odHRwczovL2NhLnN0YWdpbmcueWl2aS5hcHAvZWpiY2Ev\ncHVibGljd2ViL2NybHMvc2VhcmNoLmNnaT9pSGFzaD1rRkNPdDhOTGhKOGcwV3FN\nQW5sJTJCdm9OMlJ1WTAdBgNVHQ4EFgQUEjcBLRMmQGBJO0h04IL5Jwha1rEwDgYD\nVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMEA0cAMEQCIDEaWIs4uSm8KVQe+fy0EndE\nTaj1ayt6dUgKQY/xZBO3AiAPYGwRlZMzbeCTFQ2ORLJiSowRtXzbmXpNDSyvtn7e\nDw==\n-----END CERTIFICATE-----",
}

const veramoRequest = {
  "dcql": {
    "credentials": [
      {
        "id": "test-credential",
        "format": "dc+sd-jwt",
        "claims": [
          { "path": ["given_name"] },
          { "path": ["email"] }
        ]
      }
    ]
  }
}

function createWalletLink(data: any): string {
  const params = new URLSearchParams(data)
  const customUrl = `eudi-openid4vp://?${params}`
  return customUrl
}

function openWallet(link: string) {
  window.location.href = link
}

enum FrontendState {
  Pending,
  Polling,
  Done,
}

interface DisclosureContent {
  key: string;
  value: string;
}

function parseSdJwtVc(sdjwt: string): DisclosureContent[] {
  const components = sdjwt.split("~")
  const disclosures = (components.slice(1, components.length - 1).map((value) => {
    return atob(value)
  }) as string[])


  return disclosures.map((value) => {
    const res = JSON.parse(value) as string[]
    return { key: res[1], value: res[2] }
  })
}

interface WalletResponse {
  vp_token: Map<string, string>,
}

const VERAMO_API_URL = import.meta.env.VITE_VERAMO_API_URL ?? "https://veramo-verifier.openid4vc.staging.yivi.app"
const VERAMO_VERIFIER_NAME = import.meta.env.VITE_VERAMO_VERIFIER_NAME ?? "test-verifier"
const VERAMO_ADMIN_TOKEN = import.meta.env.VITE_VERAMO_ADMIN_TOKEN ?? "test-verifier-admin-token"

function App() {
  const [activeTab, setActiveTab] = useState<VerifierTab>("eudi")
  const [frontendState, setFrontendState] = useState(FrontendState.Pending)
  const [pollingCallbackId, setPollingCallbackId] = useState(0)
  const [walletResponse, setWalletResponse] = useState<DisclosureContent[][]>([])
  const [eudiSessionRequest, setEudiSessionRequest] = useState(JSON.stringify(eudiRequest, null, 4));
  const [veramoSessionRequest, setVeramoSessionRequest] = useState(JSON.stringify(veramoRequest, null, 4));
  const [walletLink, setWalletLink] = useState("")

  const sessionRequest = activeTab === "eudi" ? eudiSessionRequest : veramoSessionRequest
  const setSessionRequest = activeTab === "eudi" ? setEudiSessionRequest : setVeramoSessionRequest

  const startEudiSession = async (request: string) => {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/ui/presentations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: request,
      }
    )
    const json = await response.json()
    console.log(`response: ${json}`)

    setWalletLink(createWalletLink(json))
    setFrontendState(FrontendState.Polling)

    const transactionId = json["transaction_id"]
    const id = setInterval(() => {
      (async () => {
        const result = await fetch(`${import.meta.env.VITE_API_URL}/ui/presentations/${transactionId}`)

        if (result.status == 200) {
          setFrontendState(FrontendState.Done)
          clearInterval(id)
          const response = await result.json()
          const entries = new Map<string, string[]>(Object.entries(response["vp_token"]))
          const parsed = Array.from(entries, ([_, sdjwts]) => {
            return sdjwts.map(parseSdJwtVc).flat()
          })
          setWalletResponse(parsed)
        }
      })()

    }, 500)

    setPollingCallbackId(id)
  }

  const startVeramoSession = async (request: string) => {
    const response = await fetch(
      `${VERAMO_API_URL}/${VERAMO_VERIFIER_NAME}/api/create-dcql-offer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${VERAMO_ADMIN_TOKEN}`,
        },
        body: request,
      }
    )
    const json = await response.json()
    console.log("veramo session:", json)

    setWalletLink(json.requestUri)
    setFrontendState(FrontendState.Polling)

    const state = json.state
    const id = setInterval(() => {
      (async () => {
        const result = await fetch(
          `${VERAMO_API_URL}/${VERAMO_VERIFIER_NAME}/api/check-offer/${state}`,
          {
            headers: {
              "Authorization": `Bearer ${VERAMO_ADMIN_TOKEN}`,
            },
          }
        )

        if (result.status == 200) {
          const response = await result.json()
          if (response.status === "VERIFIED" || response.status === "RESPONSE_RECEIVED") {
            setFrontendState(FrontendState.Done)
            clearInterval(id)
            const credentials = response.result?.credentials ?? {}
            const parsed = Object.values(credentials).map((creds: any) => {
              return creds.map((cred: any) =>
                Object.entries(cred.claims).map(([key, value]) => ({
                  key,
                  value: String(value),
                }))
              ).flat()
            })
            setWalletResponse(parsed)
          }
        }
      })()
    }, 500)

    setPollingCallbackId(id)
  }

  const startSession = (request: string) => {
    if (activeTab === "eudi") {
      startEudiSession(request)
    } else {
      startVeramoSession(request)
    }
  }

  const cancel = () => {
    setFrontendState(FrontendState.Pending)
    clearInterval(pollingCallbackId)
  }

  const reset = () => setFrontendState(FrontendState.Pending)

  const switchTab = (tab: VerifierTab) => {
    if (frontendState !== FrontendState.Pending) return
    setActiveTab(tab)
  }

  return (
    <div className="w-screen h-screen flex items-center flex-col align-center">
      <h2 className="text-3xl">Yivi OpenID4VP Verifier</h2>

      <div className="flex border-b border-gray-300 mt-4 mb-4">
        <button
          className={`px-6 py-2 font-medium ${activeTab === "eudi"
            ? "border-b-2 border-blue-500 text-blue-600"
            : "text-gray-500 hover:text-gray-700"
            }`}
          onClick={() => switchTab("eudi")}
        >
          EUDI
        </button>
        <button
          className={`px-6 py-2 font-medium ${activeTab === "veramo"
            ? "border-b-2 border-blue-500 text-blue-600"
            : "text-gray-500 hover:text-gray-700"
            }`}
          onClick={() => switchTab("veramo")}
        >
          Veramo
        </button>
      </div>

      {frontendState == FrontendState.Pending &&
        <div className="h-full w-full flex items-center flex-col">
          <button className="m-5" onClick={() => startSession(sessionRequest)}>
            Start Session
          </button>
          <Editor
            key={activeTab}
            height="100%"
            width="100%"
            defaultLanguage="json"
            defaultValue={sessionRequest}
            theme="vs-dark"
            onChange={(value) => setSessionRequest(value ?? '')}
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              formatOnPaste: true,
              formatOnType: true,
            }}
          />
        </div>
      }
      {frontendState == FrontendState.Polling && (
        <div>
          <button onClick={() => openWallet(walletLink)}>Open Yivi</button>
          <QRCodeComponent text={walletLink} />
          <button className="m-5" onClick={cancel}>Cancel</button>
        </div>
      )}
      {frontendState == FrontendState.Done &&
        <div>
          <WalletResponseView disclosures={walletResponse} />
          <button className="m-5" onClick={reset}>Reset</button>
        </div>}
    </div>
  )
}

interface WalletResponseViewProps {
  disclosures: DisclosureContent[][]
}

const WalletResponseView = (disclosures: WalletResponseViewProps) => {
  const discs = disclosures.disclosures.flat()
  return (
    <div className="max-w-md mx-auto mt-6 border border-gray-200 rounded-md shadow-sm">
      <dl className="divide-y divide-gray-200">
        {discs.map(({ key, value }) => (
          <div key={key} className="flex justify-between px-4 py-3 bg-white">
            <dt className="text-gray-600 font-medium">{key}</dt>
            <dd className="text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default App
