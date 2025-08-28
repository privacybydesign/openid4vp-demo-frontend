import { useState } from 'react'
import './App.css'
import { Editor } from '@monaco-editor/react'
import QRCodeComponent from './QrCodeComponent'

const request = {
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


function App() {
  const [frontendState, setFrontendState] = useState(FrontendState.Pending)
  const [pollingCallbackId, setPollingCallbackId] = useState(0)
  const [walletResponse, setWalletResponse] = useState<DisclosureContent[][]>([])
  const [sessionRequest, setSessionRequest] = useState(JSON.stringify(request, null, 4));
  const [walletLink, setWalletLink] = useState("")

  const startSession = async (request: string) => {
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

  const cancel = () => {
    setFrontendState(FrontendState.Pending)
    clearInterval(pollingCallbackId)
  }

  const reset = () => setFrontendState(FrontendState.Pending)

  return (
    <div className="w-screen h-screen flex items-center flex-col align-center">
      <h2 className="text-3xl">Yivi OpenID4VP Verifier</h2>
      {frontendState == FrontendState.Pending &&
        <div className="h-full w-full flex items-center flex-col">
          <button className="m-5" onClick={() => startSession(sessionRequest)}>
            Start Session
          </button>
          <Editor
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
