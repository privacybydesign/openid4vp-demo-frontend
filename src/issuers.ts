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
  group: string
  displayName: string
  data: object
}

// One identity across every preset here, matching irmago's fixtures so a
// credential minted from this tab and one minted by the integration tests
// describe the same person. Thirty-five in 2026, which is what the age thresholds
// below assert.
const JANE_FAMILY_NAME = "Doe"
const JANE_GIVEN_NAME = "Jane"
const JANE_BIRTH_DATE = "1990-05-19"

// A one-pixel PNG in url-safe base64. The issuer runs `urlsafe_b64decode` over
// portrait, picture and the signature elements before signing (formatter_func.py),
// so the element lands as a CBOR byte string — and a payload containing + or /
// would not survive that decode. The metadata calls this element a jpeg;
// `value_type` is advisory and nothing coerces it, so a PNG is what gets signed,
// which is why the response view sniffs the magic bytes rather than trusting the
// element name.
const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

// Upstream's thirteen thresholds — what the reference issuer's own metadata
// declares, and what an age-verification rulebook would carry. The deployed
// metadata is widened to age_over_1 … age_over_99, so any subset of those mints;
// this is the conventional set rather than the maximal one.
//
// True through 28 and false from 40, so the credential describes a thirty-five
// year old rather than asserting every threshold at once. ISO 18013-5 7.2.5
// requires each value to be calculated by the issuing authority to be valid at
// the MSO's validFrom: this issuer calculates nothing and takes these verbatim,
// which is right for a demo where the caller decides what to assert and wrong for
// anything that has to be believed.
const AGE_THRESHOLDS = {
  age_over_13: true,
  age_over_15: true,
  age_over_16: true,
  age_over_18: true,
  age_over_21: true,
  age_over_23: true,
  age_over_25: true,
  age_over_27: true,
  age_over_28: true,
  age_over_40: false,
  age_over_60: false,
  age_over_65: false,
  age_over_67: false,
}

const SD_JWT_GROUP = "SD-JWT"

// Everything mdoc needs a wallet build that bypasses checkDocumentSignerEKU: the
// staging issuer certificate carries `extendedKeyUsage = clientAuth` only, and
// ISO 18013-5 Table B.3 makes the document-signer EKU mandatory and critical, so
// irmago refuses the document signer. Said once here rather than in six labels.
// See environments/dev/eudi-issuer/certs/README.md in openid4vc-poc-ops.
const MDOC_GROUP = "mdoc — needs mdoc wallet build"

// What each configuration expects in `data`, established against the running
// 0.9.4 image rather than read off its metadata.
//
// Three things decide whether an entry here works, and none of them is the
// metadata document:
//
//   * A country bucket with signing keys for whichever country the offer lands
//     in. preauthorization.py's request_preauth_token hardcodes "AV" for the two
//     age-verification configurations and "FC" for everything else, so both
//     buckets have to exist in config_issuer_backend.yaml — they do.
//     `countries.<CC>.supported_credential_ids` is *not* consulted on this path;
//     it drives the browser form flow alone, which is why PID, mDL, Photo ID and
//     AAMVA mDL issue without being listed there.
//   * Every element the configuration marks `mandatory` and does not fill itself.
//     irmago's requireMandatoryMdocElements refuses an mdoc missing one, after
//     the wallet has already completed the token exchange.
//   * The claims array of the configuration, which is an allowlist: populate_pdata
//     copies `data[attr]` only for attributes the configuration declares, and
//     drops anything else silently.
//
// What the issuer fills on its own: the issuance/issue and expiry dates (ninety
// days apart, per the pinned `validity`), `issuing_authority` and
// `issuing_authority_unicode` from the configuration's `issuer_config`,
// `un_distinguishing_sign` from the country bucket, `issuing_country` from the
// country bucket's *name* — so "FC" or "AV" rather than an ISO 3166-1 code, and
// unoverridable from here because credentialCreation applies it after the posted
// data — and Photo ID's `age_over_18`, computed from `birth_date`.
const eudiCredentials: EudiCredentialSpec[] = [
  {
    configurationId: "eu.europa.ec.eudi.pid_vc_sd_jwt",
    label: "PID",
    group: SD_JWT_GROUP,
    displayName: "PID (SD-JWT VC)",
    // `place_of_birth` and `nationalities` are mandatory for this vct and were
    // missing until now, so the PID this minted was incomplete and a verifier
    // preset asking for either found nothing to match. Their shapes come from
    // upstream's own dynamic_R2_data_collect — a list of objects and a list of
    // country codes — which disagrees with what the metadata's `value_type`
    // implies; the collector is what actually posts, so it wins.
    //
    // The rest is optional, requested by the "PID — full identity" verifier
    // preset. If this offer ever starts failing at the credential endpoint,
    // `address` is the first thing to drop: it is the one claim whose posted shape
    // is inferred rather than observed (misc.py folds its sub-claims under the
    // `address` key and then calls the type a list).
    data: {
      family_name: JANE_FAMILY_NAME,
      given_name: JANE_GIVEN_NAME,
      birthdate: JANE_BIRTH_DATE,
      place_of_birth: [{ locality: "Amsterdam", country: "NL" }],
      nationalities: ["NL"],
      address: {
        street_address: "Damrak 1",
        locality: "Amsterdam",
        region: "Noord-Holland",
        postal_code: "1012 LG",
        country: "NL",
      },
      sex: 2,
      email_address: "jane.doe@example.com",
      mobile_phone_number: "+31612345678",
      birth_family_name: "de Vries",
      document_number: "SPEC12345",
    },
  },
  {
    // docType eu.europa.ec.av.1, issued under the pseudo-country "AV".
    configurationId: "eu.europa.ec.eudi.age_verification_mdoc",
    label: "Age verification — over 18 only",
    group: MDOC_GROUP,
    displayName: "Age verification (mdoc)",
    data: {
      // The one element the AV profile makes mandatory; every other age_over_NN
      // is optional and this offer mints none of them.
      age_over_18: true,
    },
  },
  {
    configurationId: "eu.europa.ec.eudi.age_verification_mdoc",
    label: "Age verification — thirteen thresholds",
    group: MDOC_GROUP,
    displayName: "Age verification (mdoc)",
    data: AGE_THRESHOLDS,
  },
  {
    // docType eu.europa.ec.eudi.pid.1, namespace the same string.
    configurationId: "eu.europa.ec.eudi.pid_mdoc",
    label: "PID",
    group: MDOC_GROUP,
    displayName: "PID (mdoc)",
    // Mandatory and user-sourced: family_name, given_name, birth_date,
    // place_of_birth, nationality. Note the shapes are not the SD-JWT ones —
    // `birth_date` not `birthdate`, a map not a list for place_of_birth, and
    // `nationality` singular.
    data: {
      family_name: JANE_FAMILY_NAME,
      given_name: JANE_GIVEN_NAME,
      birth_date: JANE_BIRTH_DATE,
      place_of_birth: { country: "NL", locality: "Amsterdam" },
      nationality: ["NL"],
      sex: 2,
      resident_city: "Amsterdam",
      document_number: "SPEC12345",
    },
  },
  {
    // docType org.iso.18013.5.1.mDL, namespace org.iso.18013.5.1.
    configurationId: "eu.europa.ec.eudi.mdl_mdoc",
    label: "mDL",
    group: MDOC_GROUP,
    displayName: "mDL (mdoc)",
    // portrait and driving_privileges are both mandatory and user-sourced, which
    // is what makes this the one credential here that cannot be minted from names
    // alone.
    data: {
      family_name: JANE_FAMILY_NAME,
      given_name: JANE_GIVEN_NAME,
      birth_date: JANE_BIRTH_DATE,
      document_number: "X1234",
      portrait: ONE_PIXEL_PNG,
      driving_privileges: [{ vehicle_category_code: "B" }],
      sex: 2,
      nationality: "NL",
      resident_city: "Amsterdam",
      age_over_18: true,
    },
  },
  {
    // The same docType as mdl_mdoc — org.iso.18013.5.1.mDL — with a second
    // namespace, org.iso.18013.5.1.aamva, alongside the ISO one. Hold both and a
    // single doctype_value query has two candidates, which is what the "mDL — two
    // candidates" verifier preset is for.
    configurationId: "eu.europa.ec.eudi.aamva_mdl_mdoc",
    label: "mDL (AAMVA)",
    group: MDOC_GROUP,
    displayName: "mDL, AAMVA (mdoc)",
    // The AAMVA namespace adds three mandatory user-sourced elements of its own:
    // family_name_truncation, given_name_truncation and sex. `sex` is declared in
    // both namespaces, so the one posted value lands in both — which is why the
    // response view qualifies keys with the namespace once a document discloses
    // from more than one.
    data: {
      family_name: JANE_FAMILY_NAME,
      given_name: JANE_GIVEN_NAME,
      birth_date: JANE_BIRTH_DATE,
      document_number: "X1234",
      portrait: ONE_PIXEL_PNG,
      driving_privileges: [{ vehicle_category_code: "B" }],
      family_name_truncation: "N",
      given_name_truncation: "N",
      sex: 2,
    },
  },
  {
    // docType org.iso.23220.2.photoid.1 with namespace org.iso.23220.photoid.1 —
    // the two differ by more than a suffix, and that is upstream's, not a typo.
    // Deliberately not an 18013-5 docType: irmago's profileFor falls back to
    // plain 18013-5 for a docType it does not know, and this is what exercises
    // that branch against a real credential.
    configurationId: "eu.europa.ec.eudi.photoid",
    label: "Photo ID",
    group: MDOC_GROUP,
    displayName: "Photo ID (mdoc)",
    // age_over_18 is mandatory here but issuer-sourced, and
    // update_dates_and_special_claims computes it from birth_date — so posting
    // birth_date is what satisfies it, and posting age_over_18 would be ignored.
    data: {
      portrait: ONE_PIXEL_PNG,
      family_name_unicode: JANE_FAMILY_NAME,
      given_name_unicode: JANE_GIVEN_NAME,
      birth_date: JANE_BIRTH_DATE,
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
  group: spec.group,
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
