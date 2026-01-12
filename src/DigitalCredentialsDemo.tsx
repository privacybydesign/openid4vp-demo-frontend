import { useState } from 'react'
import { Editor } from '@monaco-editor/react'
import './App.css'

const defaultRequest = {
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

const DemoState = {
  Ready: 'Ready',
  Requesting: 'Requesting',
  Success: 'Success',
  Error: 'Error',
} as const

type DemoState = typeof DemoState[keyof typeof DemoState]

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

function DigitalCredentialsDemo() {
  const [demoState, setDemoState] = useState<DemoState>(DemoState.Ready)
  const [sessionRequest, setSessionRequest] = useState(JSON.stringify(defaultRequest, null, 2));
  const [responseData, setResponseData] = useState<any>(null)
  const [error, setError] = useState<string>("")
  const [walletResponse, setWalletResponse] = useState<DisclosureContent[][]>([])

  const requestCredential = async () => {
    setDemoState(DemoState.Requesting)
    setError("")

    try {
      // Check if Digital Credentials API is available
      if (!('IdentityCredential' in window)) {
        throw new Error('Digital Credentials API is not supported in this browser. This API requires Chrome 128+ on Android.')
      }

      // Start the OpenID4VP session with the verifier
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/ui/presentations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: sessionRequest,
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to start session: ${response.statusText}`)
      }

      const sessionData = await response.json()
      console.log('Session started:', sessionData)

      // Create the Digital Credentials API request
      // The wallet will receive the openid4vp:// URL via Android Credential Manager
      const params = new URLSearchParams(sessionData)
      const openid4vpUrl = `openid4vp://?${params}`

      const digitalCredentialRequest = {
        protocol: 'openid4vp',
        request: openid4vpUrl
      }

      console.log('Requesting digital credential:', digitalCredentialRequest)

      // Request the credential using the Digital Credentials API
      // @ts-ignore - Digital Credentials API types not yet in TypeScript
      const credential = await navigator.identity.get({
        digital: {
          providers: [{
            protocol: 'openid4vp',
            request: JSON.stringify(digitalCredentialRequest)
          }]
        }
      })

      console.log('Received credential:', credential)

      // The credential.data contains the vp_token response
      const credentialData = JSON.parse(credential.data)
      setResponseData(credentialData)

      // Parse and display the response
      if (credentialData.vp_token) {
        const entries = new Map<string, string[]>(Object.entries(credentialData.vp_token))
        const parsed = Array.from(entries, ([_, sdjwts]) => {
          return sdjwts.map(parseSdJwtVc).flat()
        })
        setWalletResponse(parsed)
      }

      setDemoState(DemoState.Success)
    } catch (err: any) {
      console.error('Error requesting credential:', err)
      setError(err.message || 'Unknown error occurred')
      setDemoState(DemoState.Error)
    }
  }

  const reset = () => {
    setDemoState(DemoState.Ready)
    setResponseData(null)
    setError("")
    setWalletResponse([])
  }

  return (
    <div className="w-screen h-screen flex items-center flex-col align-center">
      <h2 className="text-3xl">Digital Credentials API Demo</h2>
      <p className="text-sm text-gray-600 max-w-2xl text-center mt-2">
        This demo uses the Android Digital Credentials API to request credentials from the Yivi wallet.
        Requires Chrome 128+ on Android.
      </p>

      {demoState === DemoState.Ready && (
        <div className="h-full w-full flex items-center flex-col">
          <button
            className="m-5 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={requestCredential}
          >
            Request Credential via Digital Credentials API
          </button>
          <div className="w-full max-w-4xl">
            <p className="text-sm text-gray-600 mb-2">OpenID4VP Request:</p>
            <Editor
              height="400px"
              width="100%"
              defaultLanguage="json"
              value={sessionRequest}
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
        </div>
      )}

      {demoState === DemoState.Requesting && (
        <div className="flex flex-col items-center mt-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Waiting for wallet response...</p>
          <p className="mt-2 text-sm text-gray-500">
            The Yivi wallet should open automatically via Android Credential Manager
          </p>
        </div>
      )}

      {demoState === DemoState.Success && (
        <div className="flex flex-col items-center mt-10 w-full max-w-4xl">
          <h3 className="text-2xl text-green-600 mb-4">✓ Credential Received!</h3>

          <div className="w-full mb-6">
            <h4 className="text-lg font-semibold mb-2">Disclosed Attributes:</h4>
            <WalletResponseView disclosures={walletResponse} />
          </div>

          <div className="w-full">
            <h4 className="text-lg font-semibold mb-2">Raw Response Data:</h4>
            <Editor
              height="300px"
              width="100%"
              defaultLanguage="json"
              value={JSON.stringify(responseData, null, 2)}
              theme="vs-dark"
              options={{
                readOnly: true,
                automaticLayout: true,
                minimap: { enabled: false },
              }}
            />
          </div>

          <button
            className="m-5 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={reset}
          >
            Start New Request
          </button>
        </div>
      )}

      {demoState === DemoState.Error && (
        <div className="flex flex-col items-center mt-10 max-w-2xl">
          <h3 className="text-2xl text-red-600 mb-4">✗ Error</h3>
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
          <button
            className="mt-5 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={reset}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}

interface WalletResponseViewProps {
  disclosures: DisclosureContent[][]
}

const WalletResponseView = (disclosures: WalletResponseViewProps) => {
  const discs = disclosures.disclosures.flat()
  return (
    <div className="max-w-md mx-auto border border-gray-200 rounded-md shadow-sm">
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

export default DigitalCredentialsDemo
