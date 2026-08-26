import type { IssuerTabConfig, IssuerModeConfig, IssuerSessionResult, Preset } from "./tabs"
import { startIrmaSession, irmaWalletLink, pollIrmaSession } from "./irma"

// The issuer admin token and the real upstream issuer names live on the backend
// proxy (see server.js). The browser addresses issuers by an allow-listed key
// that the proxy maps to a concrete issuer name.
const PRE_AUTH_ISSUER_KEY = "pre-auth"
const AUTH_CODE_ISSUER_KEY = "authcode"

const credentialDisplayNames: Record<string, string> = {
  EmailCredentialSdJwt: "Email Credential (SD-JWT)",
  StudentCardCredentialSdJwt: "Student Card Credential (SD-JWT)",
  HouseCredentialSdJwt: "House Possession Credential (SD-JWT)",
  MembershipCredentialSdJwt: "Membership Credential (SD-JWT)",
  EduIdCredentialSdJwt: "eduID",
  OrganizationCredentialSdJwt: "Organization Credential (SD-JWT)",
}

function displayNameFor(credentialId: string): string {
  return credentialDisplayNames[credentialId] ?? credentialId
}

const preAuthGrant = {
  "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
    "pre-authorized_code": "generate",
  },
}

const preAuthGrantWithTxCode = {
  "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
    "pre-authorized_code": "generate",
    tx_code: { input_mode: "numeric", length: 6 },
  },
}

const authCodeGrant = {
  authorization_code: {
    issuer_state: "generate",
  },
}

const credentialDataByCredential: Record<string, object> = {
  EmailCredentialSdJwt: {
    email: "alice@example.com",
    domain: "example.com",
  },
  StudentCardCredentialSdJwt: {
    university: "Radboud University",
    level: "Bachelor",
    student_id: "s1234567",
    courses: ["Cryptography", "Distributed Systems"],
  },
  HouseCredentialSdJwt: {
    owner_name: "Alice de Vries",
    address: { street: "Damrak 1", city: "Amsterdam", country: "NL" },
  },
  MembershipCredentialSdJwt: {
    member_name: "Alice de Vries",
    member_since: "2020-09-01",
    membership_type: "Premium",
    benefits: ["Lounge access", "Priority boarding"],
  },
  EduIdCredentialSdJwt: {
    schac_home_organization: "ru.nl",
    name: "Alice de Vries",
    given_name: "Alice",
    family_name: "de Vries",
    email: "alice@ru.nl",
    eduperson_scoped_affiliation: "student@ru.nl",
    eduperson_assurance: "https://refeds.org/assurance/IAP/medium",
    is_student: true,
    is_faculty: false,
    is_member: true,
    is_staff: false,
    is_alum: false,
    is_affiliate: false,
    is_employee: false,
    "is_library-walk-in": false,
  },
  OrganizationCredentialSdJwt: {
    name: "Radboud University",
    founded: "1923",
    faculties: [
      {
        faculty_name: "Faculty of Science",
        departments: [
          {
            dept_name: "Computer Science",
            courses: ["Cryptography", "Distributed Systems"],
          },
        ],
      },
      {
        faculty_name: "Faculty of Arts",
        departments: [
          { dept_name: "History", courses: ["Medieval Europe", "Modern Asia"] },
          { dept_name: "Linguistics", courses: ["Phonetics", "Syntax"] },
        ],
      },
    ],
  },
}

interface PresetSpec {
  credentialId: string
  label: string
}

const presetOrder: PresetSpec[] = [
  { credentialId: "EmailCredentialSdJwt", label: "Email Credential" },
  { credentialId: "StudentCardCredentialSdJwt", label: "Student Card Credential" },
  { credentialId: "HouseCredentialSdJwt", label: "House Possession Credential" },
  { credentialId: "MembershipCredentialSdJwt", label: "Membership Credential" },
  { credentialId: "EduIdCredentialSdJwt", label: "eduID Credential" },
  { credentialId: "OrganizationCredentialSdJwt", label: "Organization Credential" },
]

const ONE_YEAR_SECONDS = 31536000

function preAuthOfferRequest(credentialId: string, withTxCode: boolean): object {
  return {
    credentials: [credentialId],
    grants: withTxCode ? preAuthGrantWithTxCode : preAuthGrant,
    credentialMetadata: { expiration: ONE_YEAR_SECONDS },
    credentialDataSupplierInput: credentialDataByCredential[credentialId],
  }
}

function authCodeOfferRequest(credentialId: string): object {
  return {
    credentials: [credentialId],
    grants: authCodeGrant,
    credentialMetadata: { expiration: ONE_YEAR_SECONDS },
    credentialDataSupplierInput: credentialDataByCredential[credentialId],
  }
}

const preAuthPresets: Preset[] = presetOrder.flatMap(({ credentialId, label }) => [
  { label, request: preAuthOfferRequest(credentialId, false) },
  { label: `${label} (tx_code)`, request: preAuthOfferRequest(credentialId, true) },
])

const authCodePresets: Preset[] = presetOrder.map(({ credentialId, label }) => ({
  label,
  request: authCodeOfferRequest(credentialId),
}))

function startSessionFor(issuerKey: string) {
  return async (request: string): Promise<IssuerSessionResult> => {
    const response = await fetch(`/api/issuer/${issuerKey}/offer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: request,
    })
    if (!response.ok) {
      throw new Error(`Failed to create credential offer (HTTP ${response.status})`)
    }
    const json = await response.json()
    if (!json.uri) {
      throw new Error("Offer response is missing 'uri'")
    }
    if (!json.id) {
      throw new Error("Offer response is missing 'id'")
    }

    const credentialId: string = JSON.parse(request).credentials?.[0] ?? ""
    const credentialName = displayNameFor(credentialId)

    return {
      walletLink: json.uri,
      txCode: json.txCode,
      poll: async () => {
        const result = await fetch(`/api/issuer/${issuerKey}/offer/check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: json.id }),
        })
        if (result.status !== 200) return null
        const { status } = await result.json()
        if (status !== "CREDENTIAL_ISSUED") return null
        return { credentialName }
      },
    }
  }
}

const preAuthMode: IssuerModeConfig = {
  label: "Pre-authorized code",
  defaultRequest: preAuthPresets[0].request,
  presets: preAuthPresets,
  startSession: startSessionFor(PRE_AUTH_ISSUER_KEY),
}

const authCodeMode: IssuerModeConfig = {
  label: "Authorization code",
  defaultRequest: authCodePresets[0].request,
  presets: authCodePresets,
  startSession: startSessionFor(AUTH_CODE_ISSUER_KEY),
}

export const veramoIssuer: IssuerTabConfig = {
  kind: "issuer",
  tab: "veramo-issuer",
  label: "Veramo",
  defaultMode: "pre-authorized-code",
  modes: {
    "pre-authorized-code": preAuthMode,
    "authorization-code": authCodeMode,
  },
}

// ---------------------------------------------------------------------------
// EUDI issuer (eu-digital-identity-wallet/eudi-srv-web-issuing-eudiw-py)
//
// Three things make this tab unlike the Veramo one, all of them the issuer's
// doing rather than choices:
//
//   * Its offer endpoint returns the credential offer JSON, not a wallet link.
//     The link is built here, from that JSON.
//   * It embeds the transaction code inside the offer, at
//     grants[<pre-auth>].tx_code.value, which is not in OpenID4VCI. And it emits
//     it as a JSON number, so it needs stringifying before it can be displayed.
//   * It hands back no offer id and exposes no per-offer state, so there is
//     nothing to poll. The tab has no `poll` and ends on the operator's word.
//
// Pre-authorized code only. The issuer's other route in — /auth_choice ->
// /dynamic/form -- is a browser flow that 500s without an in-flight AS session
// and would need cookie-jar and HTML-form driving to reach from here.
// ---------------------------------------------------------------------------

const PRE_AUTHORIZED_CODE_GRANT = "urn:ietf:params:oauth:grant-type:pre-authorized_code"

interface EudiCredentialSpec {
  configurationId: string
  label: string
  displayName: string
  data: object
}

// Only the two configurations whose id and `data` shape are established against
// the running 0.9.4 image (both are driven by irmago's integration tests). The
// image advertises many more in its metadata, but metadata is not the list of
// what it can issue — the issuer's own countries.<CC>.supported_credential_ids is,
// and a configuration missing from there produces an offer that fails at the
// credential endpoint. Add entries here in step with that config, not from the
// metadata document.
const eudiCredentials: EudiCredentialSpec[] = [
  {
    configurationId: "eu.europa.ec.eudi.pid_vc_sd_jwt",
    label: "PID (SD-JWT VC)",
    displayName: "PID (SD-JWT VC)",
    data: {
      family_name: "Doe",
      given_name: "Jane",
      birthdate: "1990-05-19",
    },
  },
  {
    // docType eu.europa.ec.av.1. Needs an mdoc-capable wallet build: irmago only
    // accepts mso_mdoc at the OpenID4VCI format gate on its mdoc branches, and
    // rejects the credential configuration outright before that lands. The offer
    // itself works either way, which is what makes the failure confusing.
    configurationId: "eu.europa.ec.eudi.age_verification_mdoc",
    label: "Age verification (mdoc) — needs mdoc wallet build",
    displayName: "Age verification (mdoc)",
    data: {
      // The one element the AV profile makes mandatory; every other age_over_NN
      // is optional and this offer mints none of them.
      age_over_18: true,
    },
  },
]

const eudiDisplayNames: Record<string, string> = Object.fromEntries(
  eudiCredentials.map((c) => [c.configurationId, c.displayName])
)

function eudiOfferRequest(spec: EudiCredentialSpec): object {
  return {
    credentials: [
      {
        credential_configuration_id: spec.configurationId,
        data: spec.data,
      },
    ],
  }
}

const eudiPresets: Preset[] = eudiCredentials.map((spec) => ({
  label: spec.label,
  request: eudiOfferRequest(spec),
}))

// The issuer emits tx_code.value as a JSON number; everything downstream wants a
// string. Absent rather than empty when the issuer sends no code, so the poller
// hides the block instead of rendering a blank one.
function txCodeFromOffer(offer: { grants?: Record<string, { tx_code?: { value?: unknown } }> }): string | undefined {
  const value = offer.grants?.[PRE_AUTHORIZED_CODE_GRANT]?.tx_code?.value
  if (value === undefined || value === null || value === "") return undefined
  return String(value)
}

async function startEudiIssuerSession(request: string): Promise<IssuerSessionResult> {
  const response = await fetch("/api/eudi-issuer/offer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: request,
  })
  if (!response.ok) {
    throw new Error(`Failed to create credential offer (HTTP ${response.status})`)
  }

  const offer = await response.json()
  if (!offer || typeof offer !== "object" || !offer.credential_issuer) {
    throw new Error("Offer response is not a credential offer (missing 'credential_issuer')")
  }

  // By value rather than by reference: the offer is small, and embedding it keeps
  // the QR self-contained so nothing has to stay reachable between scan and
  // token request. walletLink.ts maps this scheme to the universal-link forms.
  const walletLink =
    "openid-credential-offer://?credential_offer=" + encodeURIComponent(JSON.stringify(offer))

  const configurationId: string = JSON.parse(request).credentials?.[0]?.credential_configuration_id ?? ""

  return {
    walletLink,
    txCode: txCodeFromOffer(offer),
    credentialName: eudiDisplayNames[configurationId] ?? configurationId,
  }
}

const eudiPreAuthMode: IssuerModeConfig = {
  label: "Pre-authorized code",
  defaultRequest: eudiPresets[0].request,
  presets: eudiPresets,
  startSession: startEudiIssuerSession,
}

export const eudiIssuer: IssuerTabConfig = {
  kind: "issuer",
  tab: "eudi-issuer",
  label: "EUDI",
  defaultMode: "pre-authorized-code",
  modes: {
    "pre-authorized-code": eudiPreAuthMode,
  },
}

// ---------------------------------------------------------------------------
// IRMA issuer (irmago's `irma server` — the same server the IRMA verifier tab
// discloses against)
//
// The odd one out among the issuer tabs, because IRMA issuance is not OpenID4VCI:
//
//   * There is no credential offer, so there is nothing to name a grant type
//     after. POST /session starts an issuance session directly, and the request
//     names the credentials and their attribute values outright.
//   * There is no tx_code. Issuance sessions do come back with
//     `pairingHint: true`, but pairing is opt-in by the frontend and this tool
//     does not opt in — see src/irma.ts.
//   * The session, not an offer, is the thing with state. So this tab polls the
//     session result and reaches a real observed finish, unlike the EUDI issuer.
//     The result carries no attributes back for issuance, so the success view
//     names what was requested.
//
// `irma-demo` only: that scheme ships its issuer private keys, so any IRMA server
// can mint from it. The presets deliberately mirror the IRMA verifier tab's, so a
// credential issued here can be disclosed there.
// ---------------------------------------------------------------------------

interface IrmaCredentialSpec {
  credential: string
  attributes: Record<string, string>
  // irma-demo.MijnOverheid.root has revocation enabled, and irmago refuses to
  // issue a revocation-enabled credential without a key to register it under
  // ("revocation enabled for ... but no revocationKey specified").
  revocationKey?: string
}

const irmaCredentialNames: Record<string, string> = {
  "irma-demo.MijnOverheid.fullName": "Full name",
  "irma-demo.MijnOverheid.root": "BSN",
  "irma-demo.MijnOverheid.address": "Address",
  "irma-demo.MijnOverheid.ageLower": "Age (lower bounds)",
  "irma-demo.RU.studentCard": "Student Card",
  "irma-demo.sidn-pbdf.email": "Email",
  "irma-demo.sidn-pbdf.mobilenumber": "Mobile number",
  "irma-demo.gemeente.personalData": "Municipality personal data",
}

// Every attribute each credential type declares as required, taken from what the
// server itself reports missing rather than from the scheme description. Omitting
// one is refused at session start, so these are complete by construction.
const fullNameSpec: IrmaCredentialSpec = {
  credential: "irma-demo.MijnOverheid.fullName",
  attributes: {
    firstnames: "Jane Alice",
    firstname: "Jane",
    prefix: "van",
    familyname: "Doe",
  },
}

const bsnSpec: IrmaCredentialSpec = {
  credential: "irma-demo.MijnOverheid.root",
  attributes: { BSN: "123456782" },
  revocationKey: "demo-jane-doe",
}

const studentCardSpec: IrmaCredentialSpec = {
  credential: "irma-demo.RU.studentCard",
  attributes: {
    university: "Radboud University",
    studentCardNumber: "1234567",
    studentID: "s1234567",
    level: "Bachelor",
  },
}

const addressSpec: IrmaCredentialSpec = {
  credential: "irma-demo.MijnOverheid.address",
  attributes: {
    street: "Damrak 1",
    city: "Amsterdam",
    zipcode: "1012 LG",
    country: "Nederland",
  },
}

// IRMA has no boolean attribute type; the scheme's convention for these is the
// literal string "yes" or "no".
const ageLowerSpec: IrmaCredentialSpec = {
  credential: "irma-demo.MijnOverheid.ageLower",
  attributes: { over12: "yes", over16: "yes", over18: "yes", over21: "no" },
}

const emailSpec: IrmaCredentialSpec = {
  credential: "irma-demo.sidn-pbdf.email",
  attributes: { email: "jane.doe@example.com", domain: "example.com" },
}

const mobileNumberSpec: IrmaCredentialSpec = {
  credential: "irma-demo.sidn-pbdf.mobilenumber",
  attributes: { mobilenumber: "+31612345678" },
}

const personalDataSpec: IrmaCredentialSpec = {
  credential: "irma-demo.gemeente.personalData",
  attributes: {
    initials: "J.A.",
    firstnames: "Jane Alice",
    prefix: "van",
    familyname: "Doe",
    surname: "van Doe",
    dateofbirth: "19-05-1990",
    gender: "female",
    cityofbirth: "Amsterdam",
    countryofbirth: "Nederland",
    over12: "yes",
    over16: "yes",
    over18: "yes",
    over21: "yes",
    over65: "no",
    bsn: "123456782",
    digidlevel: "Substantieel",
  },
}

function irmaIssuanceRequest(specs: IrmaCredentialSpec[]): object {
  return {
    "@context": "https://irma.app/ld/request/issuance/v2",
    credentials: specs,
  }
}

const irmaPresets: Preset[] = [
  { label: "Full name", request: irmaIssuanceRequest([fullNameSpec]) },
  { label: "BSN", request: irmaIssuanceRequest([bsnSpec]) },
  { label: "Student Card", request: irmaIssuanceRequest([studentCardSpec]) },
  { label: "Address", request: irmaIssuanceRequest([addressSpec]) },
  { label: "Age (lower bounds)", request: irmaIssuanceRequest([ageLowerSpec]) },
  { label: "Email", request: irmaIssuanceRequest([emailSpec]) },
  { label: "Mobile number", request: irmaIssuanceRequest([mobileNumberSpec]) },
  { label: "Municipality personal data", request: irmaIssuanceRequest([personalDataSpec]) },
  {
    label: "Full name + Student Card (multi-credential)",
    request: irmaIssuanceRequest([fullNameSpec, studentCardSpec]),
  },
  // One scan that satisfies every preset on the IRMA verifier tab.
  {
    label: "Everything the IRMA verifier asks for",
    request: irmaIssuanceRequest([fullNameSpec, bsnSpec, studentCardSpec]),
  },
]

// What the success view names. An issuance result reports no attributes, so this
// is the credentials the operator asked for — read from the request, which the
// server has already accepted by the time this runs.
function irmaCredentialNameFor(request: string): string {
  const credentials: { credential?: string }[] = JSON.parse(request).credentials ?? []
  const names = credentials.map((c) => irmaCredentialNames[c.credential ?? ""] ?? c.credential ?? "Credential")
  return names.length > 0 ? names.join(" + ") : "Credential"
}

async function startIrmaIssuerSession(request: string): Promise<IssuerSessionResult> {
  const session = await startIrmaSession(request)
  const credentialName = irmaCredentialNameFor(request)

  return {
    walletLink: irmaWalletLink(session.sessionPtr),
    poll: async () => {
      const result = await pollIrmaSession(session.token)
      return result ? { credentialName } : null
    },
  }
}

const irmaIssuanceMode: IssuerModeConfig = {
  label: "IRMA issuance",
  defaultRequest: irmaPresets[0].request,
  presets: irmaPresets,
  startSession: startIrmaIssuerSession,
}

export const irmaIssuer: IssuerTabConfig = {
  kind: "issuer",
  tab: "irma-issuer",
  label: "IRMA",
  defaultMode: "irma-issuance",
  modes: {
    "irma-issuance": irmaIssuanceMode,
  },
}
