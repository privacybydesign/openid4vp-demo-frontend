import { newPopup } from "@privacybydesign/yivi-frontend"

export interface DisclosureContent {
  key: string
  value: string
}

export interface SessionResult {
  // For verifiers with manual QR/polling (EUDI, Veramo)
  walletLink?: string
  poll?: () => Promise<DisclosureContent[][] | null>
  // For verifiers where the UI is managed externally (IRMA/yivi-popup)
  disclosures?: DisclosureContent[][]
}

export type VerifierTab = "eudi" | "veramo" | "irma"

export interface Preset {
  label: string
  request: object
}

export interface Verifier {
  tab: VerifierTab
  label: string
  defaultRequest: object
  presets?: Preset[]
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

// ---------------------------------------------------------------------------
// EUDI verifier
// ---------------------------------------------------------------------------

const ISSUER_CHAIN =
  "-----BEGIN CERTIFICATE-----\nMIICbTCCAhSgAwIBAgIUX8STjkv3TRF5UBstXlp4ILHy2h0wCgYIKoZIzj0EAwQw\nRjELMAkGA1UEBhMCTkwxDTALBgNVBAoMBFlpdmkxKDAmBgNVBAMMH1lpdmkgU3Rh\nZ2luZyBSZXF1ZXN0b3JzIFJvb3QgQ0EwHhcNMjUwODEyMTUwODA1WhcNNDAwODA4\nMTUwODA0WjBMMQswCQYDVQQGEwJOTDENMAsGA1UECgwEWWl2aTEuMCwGA1UEAwwl\nWWl2aSBTdGFnaW5nIEF0dGVzdGF0aW9uIFByb3ZpZGVycyBDQTBZMBMGByqGSM49\nAgEGCCqGSM49AwEHA0IABMDTwj6APykJnBdr0sCO8LpkULpbXFOBWV47hKKsJHsa\nCVMarjLCYU3CV57UdklHSlMrtm7vfoDpYn4BvUv00UqjgdkwgdYwEgYDVR0TAQH/\nBAgwBgEB/wIBADAfBgNVHSMEGDAWgBRjtHvVs5rhDnC0L2AUi+7ncyXe1jBwBgNV\nHR8EaTBnMGWgY6Bhhl9odHRwczovL2NhLnN0YWdpbmcueWl2aS5hcHAvZWpiY2Ev\ncHVibGljd2ViL2NybHMvc2VhcmNoLmNnaT9pSGFzaD1rRkNPdDhOTGhKOGcwV3FN\nQW5sJTJCdm9OMlJ1WTAdBgNVHQ4EFgQUEjcBLRMmQGBJO0h04IL5Jwha1rEwDgYD\nVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMEA0cAMEQCIDEaWIs4uSm8KVQe+fy0EndE\nTaj1ayt6dUgKQY/xZBO3AiAPYGwRlZMzbeCTFQ2ORLJiSowRtXzbmXpNDSyvtn7e\nDw==\n-----END CERTIFICATE-----"

function eudiRequest(dcql_query: object): object {
  return {
    type: "vp_token",
    dcql_query,
    nonce: "nonce",
    jar_mode: "by_reference",
    request_uri_method: "post",
    issuer_chain: ISSUER_CHAIN,
  }
}

const eudiPresets: Preset[] = [
  {
    label: "Mobile number",
    request: eudiRequest({
      credentials: [
        {
          id: "mobilenumber",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.mobilenumber"] },
          claims: [{ path: ["mobilenumber"] }],
        },
      ],
    }),
  },
  {
    label: "Email",
    request: eudiRequest({
      credentials: [
        {
          id: "email",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.email"] },
          claims: [{ path: ["email"] }, { path: ["domain"] }],
        },
      ],
    }),
  },
  {
    label: "Passport",
    request: eudiRequest({
      credentials: [
        {
          id: "passport",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.passport"] },
          claims: [
            { path: ["firstName"] },
            { path: ["lastName"] },
            { path: ["dateOfBirth"] },
            { path: ["nationality"] },
            { path: ["gender"] },
            { path: ["documentNumber"] },
            { path: ["dateOfExpiry"] },
          ],
        },
      ],
    }),
  },
  {
    label: "ID Card",
    request: eudiRequest({
      credentials: [
        {
          id: "idcard",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.idcard"] },
          claims: [
            { path: ["firstName"] },
            { path: ["lastName"] },
            { path: ["dateOfBirth"] },
            { path: ["nationality"] },
            { path: ["gender"] },
            { path: ["documentNumber"] },
            { path: ["dateOfExpiry"] },
          ],
        },
      ],
    }),
  },
  {
    label: "Driving Licence",
    request: eudiRequest({
      credentials: [
        {
          id: "drivinglicence",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.drivinglicence"] },
          claims: [
            { path: ["firstName"] },
            { path: ["lastName"] },
            { path: ["dateOfBirth"] },
            { path: ["documentNumber"] },
            { path: ["dateOfExpiry"] },
          ],
        },
      ],
    }),
  },
  {
    label: "Email OR Mobile number (choice)",
    request: eudiRequest({
      credentials: [
        {
          id: "email",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.email"] },
          claims: [{ path: ["email"] }],
        },
        {
          id: "mobilenumber",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.mobilenumber"] },
          claims: [{ path: ["mobilenumber"] }],
        },
      ],
      credential_sets: [{ options: [["email"], ["mobilenumber"]] }],
    }),
  },
  {
    label: "Passport OR ID Card (choice)",
    request: eudiRequest({
      credentials: [
        {
          id: "passport",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.passport"] },
          claims: [{ path: ["firstName"] }, { path: ["lastName"] }, { path: ["dateOfBirth"] }],
        },
        {
          id: "idcard",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.idcard"] },
          claims: [{ path: ["firstName"] }, { path: ["lastName"] }, { path: ["dateOfBirth"] }],
        },
      ],
      credential_sets: [{ options: [["passport"], ["idcard"]] }],
    }),
  },
  {
    label: "ID + Email (multi-credential)",
    request: eudiRequest({
      credentials: [
        {
          id: "idcard",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.idcard"] },
          claims: [{ path: ["firstName"] }, { path: ["lastName"] }],
        },
        {
          id: "email",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.email"] },
          claims: [{ path: ["email"] }],
        },
      ],
    }),
  },
  {
    label: "Contact + Name",
    request: eudiRequest({
      credentials: [
        {
          id: "email",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.email"] },
          claims: [{ path: ["email"] }],
        },
        {
          id: "mobilenumber",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.mobilenumber"] },
          claims: [{ path: ["mobilenumber"] }],
        },
        {
          id: "passport",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.passport"] },
          claims: [{ path: ["firstName"] }, { path: ["lastName"] }],
        },
        {
          id: "idcard",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.idcard"] },
          claims: [{ path: ["firstName"] }, { path: ["lastName"] }],
        },
        {
          id: "drivinglicence",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.drivinglicence"] },
          claims: [{ path: ["firstName"] }, { path: ["lastName"] }],
        },
      ],
      credential_sets: [
        { options: [["email"], ["mobilenumber"]] },
        { options: [["passport"], ["idcard"], ["drivinglicence"]] },
      ],
    }),
  },
  {
    label: "Email + optional phone",
    request: eudiRequest({
      credentials: [
        {
          id: "email",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.email"] },
          claims: [{ path: ["email"] }],
        },
        {
          id: "mobilenumber",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.sidn-pbdf.mobilenumber"] },
          claims: [{ path: ["mobilenumber"] }],
        },
      ],
      credential_sets: [
        { options: [["email"]] },
        { options: [["mobilenumber"]], required: false },
      ],
    }),
  },
  {
    label: "Age check (over18)",
    request: eudiRequest({
      credentials: [
        {
          id: "passport",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.passport"] },
          claims: [{ path: ["over18"] }],
        },
      ],
    }),
  },
  {
    label: "Dutch nationality (predefined value)",
    request: eudiRequest({
      credentials: [
        {
          id: "passport",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.passport"] },
          claims: [
            { path: ["firstName"] },
            { path: ["lastName"] },
            { path: ["nationality"], values: ["Dutch"] },
          ],
        },
      ],
    }),
  },
  {
    label: "Over 18 = Yes (predefined value)",
    request: eudiRequest({
      credentials: [
        {
          id: "passport",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.passport"] },
          claims: [
            { path: ["over18"], values: ["Yes"] },
          ],
        },
      ],
    }),
  },
  {
    label: "Male or Female (predefined values)",
    request: eudiRequest({
      credentials: [
        {
          id: "passport",
          format: "dc+sd-jwt",
          meta: { vct_values: ["pbdf-staging.pbdf.passport"] },
          claims: [
            { path: ["firstName"] },
            { path: ["lastName"] },
            { path: ["gender"], values: ["M", "F"] },
          ],
        },
      ],
    }),
  },
]

export const eudiVerifier: Verifier = {
  tab: "eudi",
  label: "EUDI",
  defaultRequest: eudiPresets[0].request,
  presets: eudiPresets,
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

// ---------------------------------------------------------------------------
// Veramo verifier
// ---------------------------------------------------------------------------

const VERAMO_API_URL = import.meta.env.VITE_VERAMO_API_URL ?? "https://veramo-verifier.openid4vc.staging.yivi.app"
const VERAMO_VERIFIER_NAME = import.meta.env.VITE_VERAMO_VERIFIER_NAME ?? "test-verifier"
const VERAMO_ADMIN_TOKEN = import.meta.env.VITE_VERAMO_ADMIN_TOKEN ?? "test-verifier-admin-token"

const veramoPresets: Preset[] = [
  {
    label: "Test credential (given_name + email)",
    request: {
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
  },
  {
    label: "eduID (by presentation ID)",
    request: {
      presentationId: "eduid",
    },
  },
  {
    label: "eduID (inline DCQL)",
    request: {
      dcql: {
        credentials: [
          {
            id: "eduid-credential",
            format: "dc+sd-jwt",
            vct_values: ["https://issuer.dev.eduid.nl/vct/eduid"],
            claims: [
              { path: ["given_name"] },
              { path: ["family_name"] },
              { path: ["email"] },
              { path: ["schac_home_organization"] },
            ],
          },
        ],
      },
    },
  },
]

export const veramoVerifier: Verifier = {
  tab: "veramo",
  label: "Veramo",
  defaultRequest: veramoPresets[0].request,
  presets: veramoPresets,
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

// ---------------------------------------------------------------------------
// IRMA verifier (uses yivi-frontend-packages popup)
// ---------------------------------------------------------------------------

const IRMA_SERVER_URL = import.meta.env.VITE_IRMA_SERVER_URL ?? "https://is.openid4vc.staging.yivi.app"

function irmaRequest(disclose: any): object {
  return {
    "@context": "https://irma.app/ld/request/disclosure/v2",
    disclose,
  }
}

const irmaPresets: Preset[] = [
  {
    label: "Full name",
    request: irmaRequest([
      [["irma-demo.MijnOverheid.fullName.firstname", "irma-demo.MijnOverheid.fullName.familyname"]],
    ]),
  },
  {
    label: "BSN",
    request: irmaRequest([
      [["irma-demo.MijnOverheid.root.BSN"]],
    ]),
  },
  {
    label: "Student Card",
    request: irmaRequest([
      [[
        "irma-demo.RU.studentCard.university",
        "irma-demo.RU.studentCard.level",
        "irma-demo.RU.studentCard.studentID",
      ]],
    ]),
  },
  {
    label: "Name OR Student Card (choice)",
    request: irmaRequest([
      [
        ["irma-demo.MijnOverheid.fullName.firstname", "irma-demo.MijnOverheid.fullName.familyname"],
        ["irma-demo.RU.studentCard.university", "irma-demo.RU.studentCard.level"],
      ],
    ]),
  },
  {
    label: "BSN + Name (multi-credential)",
    request: irmaRequest([
      [["irma-demo.MijnOverheid.root.BSN"]],
      [["irma-demo.MijnOverheid.fullName.firstname", "irma-demo.MijnOverheid.fullName.familyname"]],
    ]),
  },
  {
    label: "BSN + Student Card",
    request: irmaRequest([
      [["irma-demo.MijnOverheid.root.BSN"]],
      [["irma-demo.RU.studentCard.university", "irma-demo.RU.studentCard.studentID"]],
    ]),
  },
  {
    label: "(BSN OR Student ID) + Name",
    request: irmaRequest([
      [
        ["irma-demo.MijnOverheid.root.BSN"],
        ["irma-demo.RU.studentCard.studentID"],
      ],
      [["irma-demo.MijnOverheid.fullName.firstname", "irma-demo.MijnOverheid.fullName.familyname"]],
    ]),
  },
  {
    label: "Name + optional BSN",
    request: irmaRequest([
      [["irma-demo.MijnOverheid.fullName.firstname", "irma-demo.MijnOverheid.fullName.familyname"]],
      [
        [],
        ["irma-demo.MijnOverheid.root.BSN"],
      ],
    ]),
  },
  {
    label: "University = Radboud (predefined value)",
    request: irmaRequest([
      [[
        { type: "irma-demo.RU.studentCard.university", value: "Radboud University" },
        "irma-demo.RU.studentCard.level",
      ]],
    ]),
  },
  {
    label: "Student level = PhD (predefined value)",
    request: irmaRequest([
      [[
        "irma-demo.RU.studentCard.university",
        { type: "irma-demo.RU.studentCard.level", value: "PhD" },
      ]],
    ]),
  },
  {
    label: "Name with prefix (predefined value)",
    request: irmaRequest([
      [[
        "irma-demo.MijnOverheid.fullName.firstname",
        "irma-demo.MijnOverheid.fullName.familyname",
        { type: "irma-demo.MijnOverheid.fullName.prefix", value: "van" },
      ]],
    ]),
  },
]

function parseIrmaResult(result: any): DisclosureContent[][] {
  if (!result?.disclosed) return []
  return result.disclosed.map((discon: any[]) =>
    discon.map((attr: any) => ({
      key: attr.id.split(".").pop() ?? attr.id,
      value: attr.rawvalue ?? attr.value?.[""] ?? String(attr.value),
    }))
  )
}

export const irmaVerifier: Verifier = {
  tab: "irma",
  label: "IRMA",
  defaultRequest: irmaPresets[0].request,
  presets: irmaPresets,
  startSession: async (request: string) => {
    const parsedRequest = JSON.parse(request)

    const popup = newPopup({
      debugging: false,
      session: {
        url: IRMA_SERVER_URL,
        start: {
          url: (o: any) => `${o.url}/session`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedRequest),
        },
        mapping: {
          sessionPtr: (r: any) => r.sessionPtr,
          sessionToken: (r: any) => r.token,
        },
        result: {
          url: (o: any, { sessionToken }: any) => `${o.url}/session/${sessionToken}/result`,
          method: "GET",
        },
      },
    })

    const result = await popup.start()
    return { disclosures: parseIrmaResult(result) }
  },
}

export const verifiers: Verifier[] = [irmaVerifier, eudiVerifier, veramoVerifier]
