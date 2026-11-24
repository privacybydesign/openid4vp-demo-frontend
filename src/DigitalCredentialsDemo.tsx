import { useMemo, useState } from 'react'
import { Editor } from '@monaco-editor/react'
import './App.css'
import pbdfCredentials from './pbdfCredentials.json'

// The Yivi app registers the credential types of the pbdf scheme with the
// Android Credential Manager, so these are the credentials this page can ask
// for; the ones that are no longer issued are left out. Regenerate the list
// with scripts/generate-pbdf-credentials.py.
interface CredentialType {
  id: string
  name: string
  issuer: string
  attributes: { id: string; name: string }[]
}

const credentialTypes: CredentialType[] = pbdfCredentials

const DEFAULT_CREDENTIAL_ID = 'pbdf.sidn-pbdf.email'

// OpenID4VP 1.0 Appendix A.1. An unsigned request carries its parameters
// inline: there is no request_uri over the Digital Credentials API, and the
// response comes back through the browser rather than to a response_uri.
const PROTOCOL = 'openid4vp-v1-unsigned'

const DemoState = {
  Ready: 'Ready',
  Requesting: 'Requesting',
  Success: 'Success',
  Error: 'Error',
} as const

type DemoState = typeof DemoState[keyof typeof DemoState]

interface DisclosureContent {
  key: string
  value: string
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** The `data` member of the request: what the wallet reads as the OpenID4VP request. */
function buildRequestData(credential: CredentialType, attributeIds: string[]) {
  return {
    response_type: 'vp_token',
    response_mode: 'dc_api',
    nonce: randomNonce(),
    dcql_query: {
      credentials: [
        {
          id: 'credential',
          format: 'dc+sd-jwt',
          meta: { vct_values: [credential.id] },
          claims: attributeIds.map((id) => ({ path: [id] })),
        },
      ],
    },
  }
}

function formatRequest(credential: CredentialType, attributeIds: string[]): string {
  return JSON.stringify(buildRequestData(credential, attributeIds), null, 2)
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** The claims an SD-JWT presentation discloses: `<jwt>~<disclosure>~...~<key binding jwt>`. */
function parseSdJwtVc(sdjwt: string): DisclosureContent[] {
  const components = sdjwt.split('~')
  return components.slice(1, components.length - 1)
    .filter((disclosure) => disclosure.length > 0)
    .map((disclosure) => {
      const [, key, value] = JSON.parse(decodeBase64Url(disclosure)) as [string, string, unknown]
      return { key, value: typeof value === 'string' ? value : JSON.stringify(value) }
    })
}

function defaultAttributeIds(credential: CredentialType): string[] {
  return credential.attributes.slice(0, 1).map((attribute) => attribute.id)
}

function DigitalCredentialsDemo() {
  const initialCredential =
    credentialTypes.find((credential) => credential.id === DEFAULT_CREDENTIAL_ID) ?? credentialTypes[0]

  const [demoState, setDemoState] = useState<DemoState>(DemoState.Ready)
  const [credentialId, setCredentialId] = useState(initialCredential.id)
  const [attributeIds, setAttributeIds] = useState(defaultAttributeIds(initialCredential))
  const [requestData, setRequestData] = useState(
    formatRequest(initialCredential, defaultAttributeIds(initialCredential)),
  )
  const [responseData, setResponseData] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [walletResponse, setWalletResponse] = useState<DisclosureContent[]>([])

  const credential = credentialTypes.find((type) => type.id === credentialId) ?? initialCredential

  // Grouped by issuer.
  const groups = useMemo(() => {
    const byIssuer = new Map<string, CredentialType[]>()
    for (const type of credentialTypes) {
      byIssuer.set(type.issuer, [...(byIssuer.get(type.issuer) ?? []), type])
    }
    return [...byIssuer.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [])

  const select = (type: CredentialType, selectedAttributeIds: string[]) => {
    setCredentialId(type.id)
    setAttributeIds(selectedAttributeIds)
    setRequestData(formatRequest(type, selectedAttributeIds))
  }

  const selectCredential = (id: string) => {
    const type = credentialTypes.find((candidate) => candidate.id === id)
    if (type) select(type, defaultAttributeIds(type))
  }

  const toggleAttribute = (id: string) => {
    // Kept in the order of the credential type, not the order of clicking.
    const selected = credential.attributes
      .map((attribute) => attribute.id)
      .filter((attributeId) => (attributeId === id) !== attributeIds.includes(attributeId))
    select(credential, selected)
  }

  const requestCredential = async () => {
    setDemoState(DemoState.Requesting)
    setError('')

    try {
      if (!('DigitalCredential' in window) || typeof navigator.credentials?.get !== 'function') {
        throw new Error(
          'This browser does not support the Digital Credentials API. ' +
          'Use Chrome on Android, served over HTTPS or from localhost.',
        )
      }

      const data = JSON.parse(requestData)
      const options = {
        digital: {
          requests: [{ protocol: PROTOCOL, data }],
        },
      }
      console.log('Credential request options:', options)

      // The Digital Credentials API is not in TypeScript's DOM types yet.
      const result = await navigator.credentials.get(options as CredentialRequestOptions)
      console.log('Received credential:', result)
      if (!result) {
        throw new Error('No credential returned from wallet')
      }

      // The wallet's Authorization Response: {"vp_token": {"<query id>": ["<presentation>"]}}.
      const raw = (result as unknown as { data: unknown }).data
      const response = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        vp_token?: Record<string, string[]>
      }
      setResponseData(response)

      if (!response.vp_token) {
        throw new Error('The wallet response carries no vp_token')
      }
      setWalletResponse(Object.values(response.vp_token).flat().flatMap(parseSdJwtVc))
      setDemoState(DemoState.Success)
    } catch (err) {
      console.error('Error requesting credential:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setDemoState(DemoState.Error)
    }
  }

  const reset = () => {
    setDemoState(DemoState.Ready)
    setResponseData(null)
    setError('')
    setWalletResponse([])
    // A nonce is for one request.
    setRequestData(formatRequest(credential, attributeIds))
  }

  return (
    <div className="flex-1 w-full flex items-center flex-col px-4 pb-8">
      <h2 className="text-3xl mt-4">Digital Credentials API Demo</h2>
      <p className="text-sm text-gray-600 max-w-2xl text-center mt-2">
        Asks the Yivi wallet for a credential through the Digital Credentials API, with an
        unsigned OpenID4VP request. Yivi shows this site by its origin, as an unknown party.
      </p>
      <div className="text-xs text-gray-500 max-w-2xl text-center mt-2 bg-yellow-50 border border-yellow-200 rounded p-2">
        <strong>Requirements:</strong><br />
        • Chrome 128+ on Android device<br />
        • Enable chrome://flags/#digital-credentials<br />
        • Yivi app installed with Digital Credentials support<br />
        • Served over HTTPS (or localhost for testing)
      </div>

      {demoState === DemoState.Ready && (
        <div className="w-full max-w-4xl flex flex-col mt-6">
          <label className="text-sm text-gray-600 mb-1" htmlFor="credential-type">
            Credential
          </label>
          <select
            id="credential-type"
            className="border border-gray-300 rounded p-2 bg-white text-gray-900"
            value={credential.id}
            onChange={(event) => selectCredential(event.target.value)}
          >
            {groups.map(([group, types]) => (
              <optgroup key={group} label={group}>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} ({type.id})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <fieldset className="mt-4">
            <legend className="text-sm text-gray-600 mb-1">Attributes to ask for</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {credential.attributes.map((attribute) => (
                <label key={attribute.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={attributeIds.includes(attribute.id)}
                    onChange={() => toggleAttribute(attribute.id)}
                  />
                  <span>{attribute.name}</span>
                  <code className="text-xs text-gray-500">{attribute.id}</code>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            className="my-5 self-center"
            onClick={requestCredential}
            disabled={attributeIds.length === 0}
          >
            Request Credential via Digital Credentials API
          </button>

          <p className="text-sm text-gray-600 mb-2">
            OpenID4VP request, sent as <code>{PROTOCOL}</code>:
          </p>
          <Editor
            height="400px"
            width="100%"
            defaultLanguage="json"
            value={requestData}
            theme="vs-dark"
            onChange={(value) => setRequestData(value ?? '')}
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              formatOnPaste: true,
              formatOnType: true,
            }}
          />
        </div>
      )}

      {demoState === DemoState.Requesting && (
        <div className="flex flex-col items-center mt-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Waiting for wallet response...</p>
          <p className="mt-2 text-sm text-gray-500">
            Android shows its credential picker, and opens Yivi once you choose it
          </p>
        </div>
      )}

      {demoState === DemoState.Success && (
        <div className="flex flex-col items-center mt-10 w-full max-w-4xl">
          <h3 className="text-2xl text-green-600 mb-4">✓ Credential Received!</h3>

          <div className="w-full mb-6">
            <h4 className="text-lg font-semibold mb-2">Disclosed Attributes:</h4>
            <WalletResponseView disclosures={walletResponse} />
            <p className="text-xs text-gray-500 text-center mt-2">
              Shown as received: this page does not verify the presentation.
            </p>
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

          <button className="m-5" onClick={reset}>
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
          <button className="mt-5" onClick={reset}>
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}

interface WalletResponseViewProps {
  disclosures: DisclosureContent[]
}

const WalletResponseView = ({ disclosures }: WalletResponseViewProps) => {
  return (
    <div className="max-w-md mx-auto border border-gray-200 rounded-md shadow-sm">
      <dl className="divide-y divide-gray-200">
        {disclosures.map(({ key, value }) => (
          <div key={key} className="flex justify-between px-4 py-3 bg-white">
            <dt className="text-gray-600 font-medium">{key}</dt>
            <dd className="text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default DigitalCredentialsDemo
