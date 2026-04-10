export interface DisclosureContent {
  key: string
  value: string
}

export interface SessionResult {
  walletLink: string
  poll: () => Promise<DisclosureContent[][] | null>
}

export type VerifierTab = "eudi" | "veramo"

export interface Verifier {
  tab: VerifierTab
  label: string
  defaultRequest: object
  startSession: (request: string) => Promise<SessionResult>
}

function parseSdJwtVc(sdjwt: string): DisclosureContent[] {
  const components = sdjwt.split("~")
  const disclosures = components.slice(1, components.length - 1).map((value) => atob(value))

  return disclosures.map((value) => {
    const res = JSON.parse(value) as string[]
    return { key: res[1], value: res[2] }
  })
}

export const eudiVerifier: Verifier = {
  tab: "eudi",
  label: "EUDI",
  defaultRequest: {
    type: "vp_token",
    dcql_query: {
      credentials: [
        {
          id: "mobilenumber",
          format: "dc+sd-jwt",
          meta: {
            vct_values: ["pbdf-staging.sidn-pbdf.mobilenumber"],
          },
          claims: [
            {
              id: "mn",
              path: ["mobilenumber"],
            },
          ],
        },
      ],
    },
    nonce: "nonce",
    jar_mode: "by_reference",
    request_uri_method: "post",
    issuer_chain:
      "-----BEGIN CERTIFICATE-----\nMIICbTCCAhSgAwIBAgIUX8STjkv3TRF5UBstXlp4ILHy2h0wCgYIKoZIzj0EAwQw\nRjELMAkGA1UEBhMCTkwxDTALBgNVBAoMBFlpdmkxKDAmBgNVBAMMH1lpdmkgU3Rh\nZ2luZyBSZXF1ZXN0b3JzIFJvb3QgQ0EwHhcNMjUwODEyMTUwODA1WhcNNDAwODA4\nMTUwODA0WjBMMQswCQYDVQQGEwJOTDENMAsGA1UECgwEWWl2aTEuMCwGA1UEAwwl\nWWl2aSBTdGFnaW5nIEF0dGVzdGF0aW9uIFByb3ZpZGVycyBDQTBZMBMGByqGSM49\nAgEGCCqGSM49AwEHA0IABMDTwj6APykJnBdr0sCO8LpkULpbXFOBWV47hKKsJHsa\nCVMarjLCYU3CV57UdklHSlMrtm7vfoDpYn4BvUv00UqjgdkwgdYwEgYDVR0TAQH/\nBAgwBgEB/wIBADAfBgNVHSMEGDAWgBRjtHvVs5rhDnC0L2AUi+7ncyXe1jBwBgNV\nHR8EaTBnMGWgY6Bhhl9odHRwczovL2NhLnN0YWdpbmcueWl2aS5hcHAvZWpiY2Ev\ncHVibGljd2ViL2NybHMvc2VhcmNoLmNnaT9pSGFzaD1rRkNPdDhOTGhKOGcwV3FN\nQW5sJTJCdm9OMlJ1WTAdBgNVHQ4EFgQUEjcBLRMmQGBJO0h04IL5Jwha1rEwDgYD\nVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMEA0cAMEQCIDEaWIs4uSm8KVQe+fy0EndE\nTaj1ayt6dUgKQY/xZBO3AiAPYGwRlZMzbeCTFQ2ORLJiSowRtXzbmXpNDSyvtn7e\nDw==\n-----END CERTIFICATE-----",
  },
  startSession: async (request: string) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/ui/presentations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: request,
    })
    const json = await response.json()

    const params = new URLSearchParams(json)
    const walletLink = `eudi-openid4vp://?${params}`
    const transactionId = json["transaction_id"]

    return {
      walletLink,
      poll: async () => {
        const result = await fetch(`${import.meta.env.VITE_API_URL}/ui/presentations/${transactionId}`)
        if (result.status !== 200) return null

        const response = await result.json()
        const entries = new Map<string, string[]>(Object.entries(response["vp_token"]))
        return Array.from(entries, ([_, sdjwts]) => sdjwts.map(parseSdJwtVc).flat())
      },
    }
  },
}

const VERAMO_API_URL = import.meta.env.VITE_VERAMO_API_URL ?? "https://veramo-verifier.openid4vc.staging.yivi.app"
const VERAMO_VERIFIER_NAME = import.meta.env.VITE_VERAMO_VERIFIER_NAME ?? "test-verifier"
const VERAMO_ADMIN_TOKEN = import.meta.env.VITE_VERAMO_ADMIN_TOKEN ?? "test-verifier-admin-token"

export const veramoVerifier: Verifier = {
  tab: "veramo",
  label: "Veramo",
  defaultRequest: {
    dcql: {
      credentials: [
        {
          id: "test-credential",
          format: "dc+sd-jwt",
          claims: [{ path: ["given_name"] }, { path: ["email"] }],
        },
      ],
    },
  },
  startSession: async (request: string) => {
    const response = await fetch(`${VERAMO_API_URL}/${VERAMO_VERIFIER_NAME}/api/create-dcql-offer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VERAMO_ADMIN_TOKEN}`,
      },
      body: request,
    })
    const json = await response.json()
    const state = json.state

    return {
      walletLink: json.requestUri,
      poll: async () => {
        const result = await fetch(`${VERAMO_API_URL}/${VERAMO_VERIFIER_NAME}/api/check-offer/${state}`, {
          headers: { Authorization: `Bearer ${VERAMO_ADMIN_TOKEN}` },
        })
        if (result.status !== 200) return null

        const response = await result.json()
        if (response.status !== "VERIFIED" && response.status !== "RESPONSE_RECEIVED") return null

        const credentials = response.result?.credentials ?? {}
        return Object.values(credentials).map((creds: any) =>
          creds
            .map((cred: any) =>
              Object.entries(cred.claims).map(([key, value]) => ({
                key,
                value: String(value),
              }))
            )
            .flat()
        )
      },
    }
  },
}

export const verifiers: Verifier[] = [eudiVerifier, veramoVerifier]
