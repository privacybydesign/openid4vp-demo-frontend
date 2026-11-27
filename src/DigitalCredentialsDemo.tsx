import { useMemo, useState } from 'react'
import JsonEditor from './JsonEditor'
import JsonView from './JsonView'
import pbdfCredentials from './pbdfCredentials.json'
import ErrorView from './ErrorView'
import WalletResponseView from './WalletResponseView'
import type { DisclosureContent } from './tabs'

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
    <div className="flex-1 w-full min-h-0 overflow-y-auto">
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-4">
        <p className="text-sm text-[#484747]">
          Asks the Yivi wallet for a credential through the Digital Credentials API, with an
          unsigned OpenID4VP request. Yivi shows this site by its origin, as an unknown party.
        </p>
        <div className="bg-[#E8F3F9] border border-[#CFE4EF] rounded-md px-4 py-3 text-sm text-[#484747]">
          <p className="font-semibold">Requirements</p>
          <ul className="list-disc pl-5">
            <li>Chrome 128+ on an Android device</li>
            <li>Enable chrome://flags/#digital-credentials</li>
            <li>Yivi app installed with Digital Credentials support</li>
            <li>Served over HTTPS (or localhost for testing)</li>
          </ul>
        </div>

        {demoState === DemoState.Ready && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-[15px] font-semibold text-[#484747]" htmlFor="credential-type">
                Credential
              </label>
              <select
                id="credential-type"
                className="border border-[#CFE4EF] rounded-md px-4 py-[0.65rem] text-[16px] font-semibold text-[#484747] bg-white focus:outline-none focus:border-[#00508a]"
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
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-[15px] font-semibold text-[#484747] mb-2">Attributes to ask for</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {credential.attributes.map((attribute) => (
                  <label
                    key={attribute.id}
                    className="flex items-center gap-1.5 text-[15px] text-[#484747] cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      className="accent-[#00508a]"
                      checked={attributeIds.includes(attribute.id)}
                      onChange={() => toggleAttribute(attribute.id)}
                    />
                    <span>{attribute.name}</span>
                    <code className="text-xs">{attribute.id}</code>
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              className="btn-primary self-start disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={requestCredential}
              disabled={attributeIds.length === 0}
            >
              Request Credential via Digital Credentials API
            </button>

            <p className="text-[15px] font-semibold text-[#484747]">
              OpenID4VP request, sent as <code>{PROTOCOL}</code>:
            </p>
            <JsonEditor value={requestData} onChange={setRequestData} minHeight="400px" />
          </>
        )}

        {demoState === DemoState.Requesting && (
          <div className="flex flex-col items-center gap-2 mt-4 text-center text-[#484747]">
            <p className="font-semibold">Waiting for wallet response...</p>
            <p className="text-sm">Android shows its credential picker, and opens Yivi once you choose it</p>
          </div>
        )}

        {demoState === DemoState.Success && (
          <>
            <WalletResponseView disclosures={[{ disclosures: walletResponse }]} onReset={reset} />
            <p className="text-xs text-[#484747] text-center">
              Shown as received: this page does not verify the presentation.
            </p>
            <h3 className="text-[15px] font-semibold text-[#484747]">Raw response</h3>
            <JsonView value={responseData} label="raw response" />
          </>
        )}

        {demoState === DemoState.Error && <ErrorView message={error} onReset={reset} />}
      </div>
    </div>
  )
}

export default DigitalCredentialsDemo
