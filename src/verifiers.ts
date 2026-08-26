import { newPopup } from "@privacybydesign/yivi-frontend"
import type { DisclosureContent, Preset, VerifierSessionResult, VerifierTabConfig } from "./tabs"
import type { LinkForm } from "./walletLink"
import { IRMA_SERVER_URL, startIrmaSession, irmaWalletLink, pollIrmaSession } from "./irma"
import type { IrmaSessionResponse } from "./irma"

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

// The intended use the verifier image configures out of the box. From v0.11.0 it
// refuses a transaction that names neither an intended use nor a registration
// certificate, and it does not check the query against the one it resolves — it only
// forwards it to the wallet as verifier_info. So this works for any credential type.
const EUDI_INTENDED_USE_ID = "1"

// No request_uri_method: v0.11.0 enforces the method the transaction was started
// with, and wallets fetch the request object with a GET. Omitting it falls back to
// the server's verifier.requestJwt.requestUriMethod, which the deployment sets to
// PostOrGet (see verifier-eudi.tf in openid4vc-poc-ops).
//
// A pasted query in the request editor for a vct outside the verifier's
// VERIFIER_ATTESTATIONCLASSIFICATIONS fails at presentation validation, after the
// user has already consented in the wallet — not at session start.
function eudiRequest(dcql_query: object): object {
  return {
    dcql_query,
    nonce: "nonce",
    jar_mode: "by_reference",
    intended_use_id: EUDI_INTENDED_USE_ID,
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

export const eudiVerifier: VerifierTabConfig = {
  kind: "verifier",
  tab: "eudi-verifier",
  label: "EUDI",
  defaultRequest: eudiPresets[0].request,
  presets: eudiPresets,
  startSession: async (request: string) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/ui/presentations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: request,
    })
    if (!response.ok) {
      throw new Error(`Failed to create presentation session (HTTP ${response.status})`)
    }
    const json = await response.json()

    const params = new URLSearchParams(json)
    const walletLink = `openid4vp://?${params}`
    const transactionId = json["transaction_id"]
    if (!transactionId) {
      throw new Error("Presentation response is missing 'transaction_id'")
    }

    return {
      walletLink,
      poll: async () => {
        const result = await fetch(`${import.meta.env.VITE_API_URL}/ui/presentations/${transactionId}`)
        if (result.status !== 200) return null

        const response = await result.json()
        const entries = new Map<string, string[]>(Object.entries(response["vp_token"]))
        return Array.from(entries.values(), (sdjwts) => sdjwts.map(parseSdJwtVc).flat())
      },
    }
  },
}

// ---------------------------------------------------------------------------
// Veramo verifier
// ---------------------------------------------------------------------------

// The verifier admin token lives on the backend proxy (see server.js); the
// browser talks to same-origin /api/verifier/* routes with no credentials.
// `||` (not `??`) so an empty-string env var — e.g. `export FOO=$UNSET` in sh —
// also falls back to the default rather than being baked in as "".
const VERAMO_ISSUER_BASE = import.meta.env.VITE_VERAMO_ISSUER_API_URL || "https://veramo-issuer.openid4vc.staging.yivi.app"

// Shape of a single credential in a Veramo check-offer response.
interface VeramoCredential {
  claims: Record<string, unknown>
}

function veramoVct(name: string): string {
  return `${VERAMO_ISSUER_BASE}/vct/${name}`
}

function veramoDcqlRequest(credential: object): object {
  return { dcql: { credentials: [credential] } }
}

const veramoPresets: Preset[] = [
  {
    label: "eduID (SURF)",
    request: veramoDcqlRequest({
      id: "eduid-credential",
      format: "dc+sd-jwt",
      meta: { vct_values: ["https://issuer.dev.eduid.nl/vct/eduid"] },
      claims: [
        { path: ["given_name"] },
        { path: ["family_name"] },
        { path: ["email"] },
        { path: ["schac_home_organization"] },
      ],
    }),
  },

  // Email
  {
    label: "Email — address only",
    request: veramoDcqlRequest({
      id: "email",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("email")] },
      claims: [{ path: ["email"] }],
    }),
  },
  {
    label: "Email — full",
    request: veramoDcqlRequest({
      id: "email",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("email")] },
      claims: [{ path: ["email"] }, { path: ["domain"] }],
    }),
  },

  // Student Card
  {
    label: "Student Card — university + level (anonymous)",
    request: veramoDcqlRequest({
      id: "studentcard",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("studentcard")] },
      claims: [{ path: ["university"] }, { path: ["level"] }],
    }),
  },
  {
    label: "Student Card — student ID only",
    request: veramoDcqlRequest({
      id: "studentcard",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("studentcard")] },
      claims: [{ path: ["student_id"] }],
    }),
  },
  {
    label: "Student Card — full",
    request: veramoDcqlRequest({
      id: "studentcard",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("studentcard")] },
      claims: [
        { path: ["university"] },
        { path: ["level"] },
        { path: ["student_id"] },
        { path: ["courses"] },
      ],
    }),
  },

  // House
  {
    label: "House — country only (residence)",
    request: veramoDcqlRequest({
      id: "house",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("house")] },
      claims: [{ path: ["address", "country"] }],
    }),
  },
  {
    label: "House — city + country",
    request: veramoDcqlRequest({
      id: "house",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("house")] },
      claims: [{ path: ["address", "city"] }, { path: ["address", "country"] }],
    }),
  },
  {
    label: "House — full",
    request: veramoDcqlRequest({
      id: "house",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("house")] },
      claims: [
        { path: ["owner_name"] },
        { path: ["address", "street"] },
        { path: ["address", "city"] },
        { path: ["address", "country"] },
      ],
    }),
  },

  // Membership
  {
    label: "Membership — type + since (anonymous status)",
    request: veramoDcqlRequest({
      id: "membership",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("membership")] },
      claims: [{ path: ["membership_type"] }, { path: ["member_since"] }],
    }),
  },
  {
    label: "Membership — name + type",
    request: veramoDcqlRequest({
      id: "membership",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("membership")] },
      claims: [{ path: ["member_name"] }, { path: ["membership_type"] }],
    }),
  },
  {
    label: "Membership — full",
    request: veramoDcqlRequest({
      id: "membership",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("membership")] },
      claims: [
        { path: ["member_name"] },
        { path: ["member_since"] },
        { path: ["membership_type"] },
        { path: ["benefits"] },
      ],
    }),
  },

  // eduID (Veramo-issued)
  {
    label: "eduID (Veramo) — identity",
    request: veramoDcqlRequest({
      id: "eduid-veramo",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("eduid")] },
      claims: [{ path: ["given_name"] }, { path: ["family_name"] }],
    }),
  },
  {
    label: "eduID (Veramo) — institution only",
    request: veramoDcqlRequest({
      id: "eduid-veramo",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("eduid")] },
      claims: [{ path: ["schac_home_organization"] }],
    }),
  },
  {
    label: "eduID (Veramo) — full",
    request: veramoDcqlRequest({
      id: "eduid-veramo",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("eduid")] },
      claims: [
        { path: ["given_name"] },
        { path: ["family_name"] },
        { path: ["email"] },
        { path: ["schac_home_organization"] },
        { path: ["eduperson_scoped_affiliation"] },
      ],
    }),
  },

  // Organization (nested arrays)
  {
    label: "Organization — university name only",
    request: veramoDcqlRequest({
      id: "organization",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("organization")] },
      claims: [{ path: ["name"] }],
    }),
  },
  {
    label: "Organization — faculty names",
    request: veramoDcqlRequest({
      id: "organization",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("organization")] },
      claims: [{ path: ["faculties", null, "faculty_name"] }],
    }),
  },
  {
    label: "Organization — first course of first dept per faculty",
    request: veramoDcqlRequest({
      id: "organization",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("organization")] },
      claims: [
        { path: ["faculties", null, "faculty_name"] },
        { path: ["faculties", null, "departments", 0, "courses", 0] },
      ],
    }),
  },
  {
    label: "Organization — full",
    request: veramoDcqlRequest({
      id: "organization",
      format: "dc+sd-jwt",
      meta: { vct_values: [veramoVct("organization")] },
      claims: [
        { path: ["name"] },
        { path: ["founded"] },
        { path: ["faculties"] },
      ],
    }),
  },
]

export const veramoVerifier: VerifierTabConfig = {
  kind: "verifier",
  tab: "veramo-verifier",
  label: "Veramo",
  defaultRequest: veramoPresets[0].request,
  presets: veramoPresets,
  startSession: async (request: string) => {
    const response = await fetch(`/api/verifier/offer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: request,
    })
    if (!response.ok) {
      throw new Error(`Failed to create DCQL offer (HTTP ${response.status})`)
    }
    const json = await response.json()
    const state = json.state
    if (!state) {
      throw new Error("Offer response is missing 'state'")
    }
    if (!json.requestUri) {
      throw new Error("Offer response is missing 'requestUri'")
    }

    return {
      walletLink: json.requestUri,
      poll: async () => {
        const result = await fetch(`/api/verifier/offer/${encodeURIComponent(state)}`)
        if (result.status !== 200) return null

        const response = await result.json()
        if (response.status !== "VERIFIED" && response.status !== "RESPONSE_RECEIVED") return null

        const credentials: Record<string, VeramoCredential[]> = response.result?.credentials ?? {}
        return Object.values(credentials).map((creds) =>
          creds
            .map((cred) =>
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

// A disclosure request is a "condiscon": a list of "discons", each a list of
// "cons", each a list of attribute identifiers (a plain id, or an id with a
// required value).
type IrmaAttribute = string | { type: string; value: string }
type IrmaCondiscon = IrmaAttribute[][][]

function irmaRequest(disclose: IrmaCondiscon): object {
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

interface IrmaDisclosedAttribute {
  id: string
  rawvalue?: string
  value?: Record<string, string>
}

function parseIrmaResult(result: unknown): DisclosureContent[][] {
  const disclosed = (result as { disclosed?: IrmaDisclosedAttribute[][] })?.disclosed
  if (!disclosed) return []
  return disclosed.map((discon) =>
    discon.map((attr) => ({
      key: attr.id.split(".").pop() ?? attr.id,
      value: attr.rawvalue ?? attr.value?.[""] ?? String(attr.value),
    }))
  )
}

// Drives the session ourselves rather than through the popup, so the session link
// and its host are under our control and can be shown in any link form.
async function startIrmaSessionWithLink(request: string): Promise<VerifierSessionResult> {
  const session = await startIrmaSession(request)

  return {
    walletLink: irmaWalletLink(session.sessionPtr),
    poll: async () => {
      const result = await pollIrmaSession(session.token)
      return result ? parseIrmaResult(result) : null
    },
  }
}

export const irmaVerifier: VerifierTabConfig = {
  kind: "verifier",
  tab: "irma-verifier",
  label: "IRMA",
  defaultRequest: irmaPresets[0].request,
  presets: irmaPresets,
  startSession: async (request: string, linkForm: LinkForm) => {
    if (linkForm !== "scheme") {
      return startIrmaSessionWithLink(request)
    }

    const parsedRequest = JSON.parse(request)

    const popup = newPopup({
      debugging: false,
      session: {
        url: IRMA_SERVER_URL,
        start: {
          url: (o) => `${o.url}/session`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedRequest),
        },
        mapping: {
          sessionPtr: (r) => (r as IrmaSessionResponse).sessionPtr,
          sessionToken: (r) => (r as IrmaSessionResponse).token,
        },
        result: {
          url: (o, { sessionToken }) => `${o.url}/session/${sessionToken}/result`,
          method: "GET",
        },
      },
    })

    const result = await popup.start()
    return { disclosures: parseIrmaResult(result) }
  },
}
