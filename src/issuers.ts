import type { IssuerTabConfig, IssuerModeConfig, IssuerSessionResult, Preset } from "./tabs"

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
  label: "Veramo Issuer",
  defaultMode: "pre-authorized-code",
  modes: {
    "pre-authorized-code": preAuthMode,
    "authorization-code": authCodeMode,
  },
}
