import { newPopup } from "@privacybydesign/yivi-frontend"
import { base64UrlToBase64, parseMdocDeviceResponse } from "./mdoc"
import type {
  DisclosureContent,
  DisclosureGroup,
  Preset,
  VerifierSessionResult,
  VerifierTabConfig,
} from "./tabs"
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

// The vct out of the issuer-signed JWT, for the group heading. Read from the
// presentation rather than from the query that asked for it: the request is
// free-form text in the editor, so what came back is the only thing that cannot
// disagree with what was sent.
function sdJwtVct(sdjwt: string): string | undefined {
  const payload = sdjwt.split("~")[0]?.split(".")[1]
  if (!payload) return undefined
  try {
    const claims = JSON.parse(atob(base64UrlToBase64(payload))) as { vct?: unknown }
    return typeof claims.vct === "string" ? claims.vct : undefined
  } catch {
    return undefined
  }
}

// The verifier answers one query with a single presentation or with an array of
// them, depending on whether the query asked for several (`multiple: true`, or a
// credential_set matched more than once). Both shapes have to be read: assuming
// the array threw a TypeError on the string form.
function presentationsOf(entry: unknown): string[] {
  if (typeof entry === "string") return [entry]
  if (Array.isArray(entry)) return entry.filter((item): item is string => typeof item === "string")
  return []
}

// An SD-JWT VC is tilde-separated by construction, and base64 has no tilde in
// either alphabet — so the presentation itself says which format it is, without
// having to parse back the request that asked for it.
function describePresentation(queryId: string, presentation: string): DisclosureGroup {
  if (presentation.includes("~")) {
    return { label: groupLabel(queryId, sdJwtVct(presentation)), disclosures: parseSdJwtVc(presentation) }
  }
  try {
    const { docType, disclosures } = parseMdocDeviceResponse(presentation)
    return { label: groupLabel(queryId, docType), disclosures }
  } catch (error) {
    // Naming the query is the whole point: the raw failure is an atob
    // DOMException or a CBOR decode error, neither of which says which of several
    // presentations it came from. The poll loop turns a throw into the error
    // view, so this is what the operator reads.
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read the mdoc presentation for query "${queryId}": ${detail}`, {
      cause: error,
    })
  }
}

function groupLabel(queryId: string, credentialType: string | undefined): string {
  return credentialType ? `${queryId} · ${credentialType}` : queryId
}

// ---------------------------------------------------------------------------
// EUDI verifier
// ---------------------------------------------------------------------------

// The CA the verifier is told to trust for the credentials it asks about — both
// certificates of environments/dev/eudi-issuer/certs/ca.pem in openid4vc-poc-ops:
// the Yivi Staging Attestation Providers CA and the Requestors Root CA above it.
//
// One chain covers every preset here, mdoc and SD-JWT alike, because the EUDI
// issuer's document signer (CN=eudi-issuer.openid4vc.staging.yivi.app) is issued
// by the same Attestation Providers CA that signs the pbdf-staging SD-JWT VCs.
//
// Both certificates rather than the intermediate alone: staging is a level deeper
// than a self-signed test CA, so an intermediate on its own is a chain whose own
// issuer is missing. SD-JWT presentations accept that today; for mdoc the failure
// mode is the verifier refusing the presentation X5CNotTrusted, after the wallet
// has already disclosed.
const ISSUER_CHAIN =
  "-----BEGIN CERTIFICATE-----\nMIICbTCCAhSgAwIBAgIUX8STjkv3TRF5UBstXlp4ILHy2h0wCgYIKoZIzj0EAwQw\nRjELMAkGA1UEBhMCTkwxDTALBgNVBAoMBFlpdmkxKDAmBgNVBAMMH1lpdmkgU3Rh\nZ2luZyBSZXF1ZXN0b3JzIFJvb3QgQ0EwHhcNMjUwODEyMTUwODA1WhcNNDAwODA4\nMTUwODA0WjBMMQswCQYDVQQGEwJOTDENMAsGA1UECgwEWWl2aTEuMCwGA1UEAwwl\nWWl2aSBTdGFnaW5nIEF0dGVzdGF0aW9uIFByb3ZpZGVycyBDQTBZMBMGByqGSM49\nAgEGCCqGSM49AwEHA0IABMDTwj6APykJnBdr0sCO8LpkULpbXFOBWV47hKKsJHsa\nCVMarjLCYU3CV57UdklHSlMrtm7vfoDpYn4BvUv00UqjgdkwgdYwEgYDVR0TAQH/\nBAgwBgEB/wIBADAfBgNVHSMEGDAWgBRjtHvVs5rhDnC0L2AUi+7ncyXe1jBwBgNV\nHR8EaTBnMGWgY6Bhhl9odHRwczovL2NhLnN0YWdpbmcueWl2aS5hcHAvZWpiY2Ev\ncHVibGljd2ViL2NybHMvc2VhcmNoLmNnaT9pSGFzaD1rRkNPdDhOTGhKOGcwV3FN\nQW5sJTJCdm9OMlJ1WTAdBgNVHQ4EFgQUEjcBLRMmQGBJO0h04IL5Jwha1rEwDgYD\nVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMEA0cAMEQCIDEaWIs4uSm8KVQe+fy0EndE\nTaj1ayt6dUgKQY/xZBO3AiAPYGwRlZMzbeCTFQ2ORLJiSowRtXzbmXpNDSyvtn7e\nDw==\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nMIIB8jCCAZmgAwIBAgIUd8FwrZvzZ0+08+A0VNFgX5f/eIwwCgYIKoZIzj0EAwQw\nRjELMAkGA1UEBhMCTkwxDTALBgNVBAoMBFlpdmkxKDAmBgNVBAMMH1lpdmkgU3Rh\nZ2luZyBSZXF1ZXN0b3JzIFJvb3QgQ0EwIBcNMjUwODA4MTAwMDUzWhgPMjA1NTA4\nMDExMDAwNTJaMEYxCzAJBgNVBAYTAk5MMQ0wCwYDVQQKDARZaXZpMSgwJgYDVQQD\nDB9ZaXZpIFN0YWdpbmcgUmVxdWVzdG9ycyBSb290IENBMFkwEwYHKoZIzj0CAQYI\nKoZIzj0DAQcDQgAECTtfysVgEPFVKrVL8FM/Jx3E64qquuKSfG2ZqEucIkH6QHGL\neJPEEhA1RUyGtPTLIZTjY5rHwR6foTSVThGrraNjMGEwDwYDVR0TAQH/BAUwAwEB\n/zAfBgNVHSMEGDAWgBRjtHvVs5rhDnC0L2AUi+7ncyXe1jAdBgNVHQ4EFgQUY7R7\n1bOa4Q5wtC9gFIvu53Ml3tYwDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMEA0cA\nMEQCIDCSNbPoyhDZ5A3SWupsyPj/tDF4xNoHYnE0WFIs2pz8AiA9mhXswiJPFbVR\n9dYSupOhXkuQRk8CgJuN++OnESd8uw==\n-----END CERTIFICATE-----"

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
// A pasted query in the request editor for a credential type outside the
// verifier's VERIFIER_ATTESTATIONCLASSIFICATIONS fails at presentation
// validation, after the user has already consented in the wallet — not at session
// start. That list has two halves and they are not interchangeable: an SD-JWT VC
// is classified by its vct and an mso_mdoc by its docType, and an mdoc never
// matches a `vcts` entry. See verifier_attestation_vcts and
// verifier_attestation_doctypes in openid4vc-poc-ops' variables.tf. The mdoc
// presets below have their docTypes listed; a pasted one may not.
function eudiRequest(dcql_query: object): object {
  return {
    dcql_query,
    nonce: "nonce",
    jar_mode: "by_reference",
    intended_use_id: EUDI_INTENDED_USE_ID,
    issuer_chain: ISSUER_CHAIN,
  }
}

// --- credential types the EUDI issuer mints (eudi-issuer.tf) ---------------
//
// A docType is not a credential configuration id: the issuer advertises
// `eu.europa.ec.eudi.pid_mdoc` and mints documents whose docType is
// `eu.europa.ec.eudi.pid.1`. The configuration id belongs in an offer (see
// issuers.ts); only the docType reaches a DCQL query, because that is what the
// signed MSO carries.
//
// PID and the age credential use one string for both docType and namespace; mDL
// and Photo ID do not, and Photo ID's two differ by more than a suffix
// (`org.iso.23220.2.photoid.1` against `org.iso.23220.photoid.1`) — upstream's,
// not a typo here.
const PID_MDOC_DOCTYPE = "eu.europa.ec.eudi.pid.1"
const PID_MDOC_NAMESPACE = "eu.europa.ec.eudi.pid.1"
const MDL_DOCTYPE = "org.iso.18013.5.1.mDL"
const MDL_NAMESPACE = "org.iso.18013.5.1"
const AV_DOCTYPE = "eu.europa.ec.av.1"
const AV_NAMESPACE = "eu.europa.ec.av.1"
const PHOTOID_DOCTYPE = "org.iso.23220.2.photoid.1"
const PHOTOID_NAMESPACE = "org.iso.23220.photoid.1"

// The EUDI issuer's PID as an SD-JWT VC. Already classified by the deployed
// verifier (the `pid` bucket in eudi-verifier.tf), unlike the mdoc docTypes,
// which had to be added.
const EUDI_PID_VCT = "urn:eudi:pid:1"

// A DCQL credential query for an mdoc.
//
// `claims` is not optional and every path is exactly
// [namespace, elementIdentifier]: irmago refuses a query with no claims outright
// and has no presentation_definition path for mdoc at all, so this shape is the
// only one that works.
function mdocCredential(id: string, docType: string, namespace: string, elements: string[]): object {
  return {
    id,
    format: "mso_mdoc",
    meta: { doctype_value: docType },
    claims: elements.map((element) => ({ path: [namespace, element] })),
  }
}

// A DCQL credential query for an SD-JWT VC, for the presets that pair one with an
// mdoc. `paths` are claim paths, so a nested claim is ["address", "locality"].
function sdJwtCredential(id: string, vct: string, paths: string[][]): object {
  return {
    id,
    format: "dc+sd-jwt",
    meta: { vct_values: [vct] },
    claims: paths.map((path) => ({ path })),
  }
}

// Every preset below the "SD-JWT (Yivi)" group is refused in the wallet until the
// relying-party certificate in openid4vc-poc-ops
// (environments/dev/keystore.p12) is reissued: irmago checks each DCQL query
// against `rp.authorized` in the certificate's 2.1.123.1 extension, and the
// certificate deployed today lists the Yivi SD-JWT types plus eu.europa.ec.av.1
// and nothing else — so a PID, mDL or Photo ID query dies with "credential ... is
// not in the authorized set" before the permission screen. The reissue drops the
// extension entirely, which irmago reads as a third-party certificate and
// authorizes wholesale.
//
// The mdoc presets additionally need the *issuer* certificate reissued with the
// ISO 18013-5 document-signer EKU before a wallet will collect an mdoc at all —
// see environments/dev/eudi-issuer/certs/README.md. Neither is fixable here.
const eudiPresets: Preset[] = [
  {
    label: "Mobile number",
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
    group: "SD-JWT (Yivi)",
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
  // --- mdoc ----------------------------------------------------------------

  {
    label: "PID — names",
    group: "mdoc",
    request: eudiRequest({
      credentials: [
        mdocCredential("pid", PID_MDOC_DOCTYPE, PID_MDOC_NAMESPACE, ["family_name", "given_name"]),
      ],
    }),
  },
  {
    // Everything the PID issuer preset mints, so the response covers a tagged
    // full-date (birth_date), an integer (sex), a nested map (place_of_birth) and
    // an array (nationality) in one table. The last four are issuer-filled;
    // issuing_country comes back as "FC", the country bucket the pre-authorized
    // flow hardcodes, not an ISO 3166-1 code.
    label: "PID — full identity",
    group: "mdoc",
    request: eudiRequest({
      credentials: [
        mdocCredential("pid", PID_MDOC_DOCTYPE, PID_MDOC_NAMESPACE, [
          "family_name",
          "given_name",
          "birth_date",
          "place_of_birth",
          "nationality",
          "sex",
          "resident_city",
          "document_number",
          "issuance_date",
          "expiry_date",
          "issuing_authority",
          "issuing_country",
        ]),
      ],
    }),
  },
  {
    // The portrait is a byte string on the wire, so the table reports its size
    // and sniffed type rather than a value.
    label: "mDL — licence number + portrait",
    group: "mdoc",
    request: eudiRequest({
      credentials: [mdocCredential("mdl", MDL_DOCTYPE, MDL_NAMESPACE, ["document_number", "portrait"])],
    }),
  },
  {
    // driving_privileges is an array of maps, and un_distinguishing_sign is the
    // one element the issuer fills from the country config rather than the offer.
    label: "mDL — driving privileges",
    group: "mdoc",
    request: eudiRequest({
      credentials: [
        mdocCredential("mdl", MDL_DOCTYPE, MDL_NAMESPACE, [
          "family_name",
          "given_name",
          "driving_privileges",
          "un_distinguishing_sign",
        ]),
      ],
    }),
  },
  {
    // Two thresholds, not more: ISO 18013-5 7.2.5 says an mdoc reader shall not
    // request more than two age_over_NN elements in one transaction. Nothing in
    // this stack enforces it — the credential holds thirteen — so it is policy
    // here rather than a limit.
    label: "Age — over 18 + over 21",
    group: "mdoc",
    request: eudiRequest({
      credentials: [mdocCredential("age", AV_DOCTYPE, AV_NAMESPACE, ["age_over_18", "age_over_21"])],
    }),
  },
  {
    // ISO 23220-2 rather than 18013-5, which is the point: irmago's profileFor
    // falls back to plain 18013-5 for a docType it does not recognise, and this
    // is the only preset that exercises that branch. age_over_18 is derived by
    // the issuer from birth_date, not posted.
    label: "Photo ID — portrait + over 18",
    group: "mdoc",
    request: eudiRequest({
      credentials: [
        mdocCredential("photoid", PHOTOID_DOCTYPE, PHOTOID_NAMESPACE, [
          "portrait",
          "family_name_unicode",
          "given_name_unicode",
          "age_over_18",
        ]),
      ],
    }),
  },
  {
    // eu.europa.ec.eudi.mdl_mdoc and eu.europa.ec.eudi.aamva_mdl_mdoc mint the
    // same docType, so with both in the wallet this one query has two candidates
    // and the wallet asks which to use. Only elements present in both are
    // requested; the AAMVA credential carries a second namespace on top, which
    // shows up in the response as namespace-qualified keys.
    label: "mDL — two candidates (AAMVA)",
    group: "mdoc",
    request: eudiRequest({
      credentials: [
        mdocCredential("mdl", MDL_DOCTYPE, MDL_NAMESPACE, [
          "family_name",
          "given_name",
          "document_number",
        ]),
      ],
    }),
  },
  {
    // No credential_sets, so both are required: one permission screen, two
    // credentials, two DeviceResponses back under two query ids.
    label: "PID + mDL (two doctypes)",
    group: "mdoc",
    request: eudiRequest({
      credentials: [
        mdocCredential("pid", PID_MDOC_DOCTYPE, PID_MDOC_NAMESPACE, [
          "family_name",
          "given_name",
          "birth_date",
        ]),
        mdocCredential("mdl", MDL_DOCTYPE, MDL_NAMESPACE, ["document_number", "driving_privileges"]),
      ],
    }),
  },
  {
    // The two profiles disagree on the name: PID stamps issuance_date, the mDL
    // stamps issue_date, and both stamp expiry_date. All four are issuer-filled
    // and ninety days apart, per the `validity` pinned in the issuer config.
    label: "PID + mDL — dates",
    group: "mdoc",
    request: eudiRequest({
      credentials: [
        mdocCredential("pid", PID_MDOC_DOCTYPE, PID_MDOC_NAMESPACE, ["issuance_date", "expiry_date"]),
        mdocCredential("mdl", MDL_DOCTYPE, MDL_NAMESPACE, ["issue_date", "expiry_date"]),
      ],
    }),
  },
  {
    // Either credential answers the same question — who this is — so the wallet
    // offers a choice and only the chosen one is presented. The unchosen query id
    // is absent from vp_token entirely rather than present and empty.
    label: "PID OR mDL (choice)",
    group: "mdoc",
    request: eudiRequest({
      credentials: [
        mdocCredential("pid", PID_MDOC_DOCTYPE, PID_MDOC_NAMESPACE, [
          "family_name",
          "given_name",
          "birth_date",
        ]),
        mdocCredential("mdl", MDL_DOCTYPE, MDL_NAMESPACE, [
          "family_name",
          "given_name",
          "birth_date",
        ]),
      ],
      credential_sets: [{ options: [["pid"], ["mdl"]] }],
    }),
  },

  // --- Mixed formats -------------------------------------------------------
  //
  // One request, two formats — the ARF's ordinary case. It works here for a
  // reason worth knowing: the EUDI issuer's document signer is issued by the same
  // Yivi Staging Attestation Providers CA that signs the pbdf-staging SD-JWT VCs,
  // so the single ISSUER_CHAIN above covers both sides and no second chain is
  // needed.

  {
    label: "Email (SD-JWT) + Age (mdoc)",
    group: "Mixed formats",
    request: eudiRequest({
      credentials: [
        sdJwtCredential("email", "pbdf-staging.sidn-pbdf.email", [["email"]]),
        mdocCredential("age", AV_DOCTYPE, AV_NAMESPACE, ["age_over_18"]),
      ],
    }),
  },
  {
    // The same three facts twice over, in two ecosystems: a Yivi passport in
    // camelCase SD-JWT claims next to a PID mdoc in snake_case elements.
    label: "Passport (SD-JWT) + PID (mdoc)",
    group: "Mixed formats",
    request: eudiRequest({
      credentials: [
        sdJwtCredential("passport", "pbdf-staging.pbdf.passport", [
          ["firstName"],
          ["lastName"],
          ["dateOfBirth"],
        ]),
        mdocCredential("pid", PID_MDOC_DOCTYPE, PID_MDOC_NAMESPACE, [
          "family_name",
          "given_name",
          "birth_date",
        ]),
      ],
    }),
  },
  {
    // Both from the EUDI issuer, one in each format — the shape irmago's
    // openid4vp_mixed_format_disclosure_test.go exercises.
    label: "PID (SD-JWT) + Age (mdoc)",
    group: "Mixed formats",
    request: eudiRequest({
      credentials: [
        sdJwtCredential("pid", EUDI_PID_VCT, [["family_name"], ["given_name"], ["birthdate"]]),
        mdocCredential("age", AV_DOCTYPE, AV_NAMESPACE, ["age_over_18"]),
      ],
    }),
  },
  {
    // A credential_sets choice that crosses the format boundary: whichever the
    // holder picks, only that format is presented.
    label: "SD-JWT OR mdoc (choice)",
    group: "Mixed formats",
    request: eudiRequest({
      credentials: [
        sdJwtCredential("passport", "pbdf-staging.pbdf.passport", [
          ["firstName"],
          ["lastName"],
          ["dateOfBirth"],
        ]),
        mdocCredential("pid", PID_MDOC_DOCTYPE, PID_MDOC_NAMESPACE, [
          "family_name",
          "given_name",
          "birth_date",
        ]),
      ],
      credential_sets: [{ options: [["passport"], ["pid"]] }],
    }),
  },

  // --- EUDI PID (SD-JWT) ---------------------------------------------------
  //
  // Same credential as the mdoc PID above, different format, and the claim names
  // are not the same: `birthdate` against `birth_date`, `nationalities` against
  // `nationality`, and an `address` object where the mdoc has flat resident_*
  // elements. The SD-JWT half is also the one with genuinely nested claim paths.

  {
    label: "PID — names",
    group: "EUDI PID (SD-JWT)",
    request: eudiRequest({
      credentials: [sdJwtCredential("pid", EUDI_PID_VCT, [["family_name"], ["given_name"]])],
    }),
  },
  {
    label: "PID — full identity",
    group: "EUDI PID (SD-JWT)",
    request: eudiRequest({
      credentials: [
        sdJwtCredential("pid", EUDI_PID_VCT, [
          ["family_name"],
          ["given_name"],
          ["birthdate"],
          ["place_of_birth"],
          ["nationalities"],
          ["address", "street_address"],
          ["address", "locality"],
          ["address", "country"],
          ["sex"],
          ["email_address"],
          ["mobile_phone_number"],
          ["birth_family_name"],
          ["document_number"],
          ["date_of_issuance"],
          ["date_of_expiry"],
          ["issuing_authority"],
          ["issuing_country"],
        ]),
      ],
    }),
  },
  {
    // Two issuers, two schemes, one question. Both answer "who is this" for a
    // relying party that does not care which ecosystem it came from.
    label: "PID (SD-JWT) OR Passport (choice)",
    group: "EUDI PID (SD-JWT)",
    request: eudiRequest({
      credentials: [
        sdJwtCredential("pid", EUDI_PID_VCT, [["family_name"], ["given_name"], ["birthdate"]]),
        sdJwtCredential("passport", "pbdf-staging.pbdf.passport", [
          ["firstName"],
          ["lastName"],
          ["dateOfBirth"],
        ]),
      ],
      credential_sets: [{ options: [["pid"], ["passport"]] }],
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
        const vpToken = response["vp_token"]
        if (!vpToken || typeof vpToken !== "object") return null

        // One group per presentation, headed by the DCQL query id it answers, so
        // a request for a PID and an mDL reads as two credentials rather than one
        // table carrying `family_name` twice.
        return Object.entries(vpToken as Record<string, unknown>).flatMap(([queryId, entry]) =>
          presentationsOf(entry).map((presentation) => describePresentation(queryId, presentation))
        )
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

        // Unlabelled groups: this verifier reports claims already decoded, and
        // WalletResponseView renders label-less groups as the one flat table it
        // always has. Only the EUDI tab needs headings.
        const credentials: Record<string, VeramoCredential[]> = response.result?.credentials ?? {}
        return Object.values(credentials).map((creds) => ({
          disclosures: creds
            .map((cred) =>
              Object.entries(cred.claims).map(([key, value]) => ({
                key,
                value: String(value),
              }))
            )
            .flat(),
        }))
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

// One group per discon, unlabelled: WalletResponseView renders label-less groups
// as the single flat table this tab has always shown.
function parseIrmaResult(result: unknown): DisclosureGroup[] {
  const disclosed = (result as { disclosed?: IrmaDisclosedAttribute[][] })?.disclosed
  if (!disclosed) return []
  return disclosed.map((discon) => ({
    disclosures: discon.map((attr) => ({
      key: attr.id.split(".").pop() ?? attr.id,
      value: attr.rawvalue ?? attr.value?.[""] ?? String(attr.value),
    })),
  }))
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
