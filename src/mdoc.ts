import { decode as cborDecode, Tag } from "cbor2"
import type { DisclosureContent } from "./tabs"

// mdoc presentations, read back from what a verifier accepted.
//
// An mso_mdoc entry in `vp_token` is a base64 ISO 18013-5 DeviceResponse, so it
// unpacks rather than splits:
//
//   base64 -> CBOR -> documents[].issuerSigned.nameSpaces[<namespace>][]
//
// and every element of that array is a tag-24 byte string — 18013-5's
// IssuerSignedItemBytes, `#6.24(bstr .cbor IssuerSignedItem)` — holding
// {digestID, random, elementIdentifier, elementValue}. It is transmitted
// pre-encoded because the MSO digest was taken over exactly those bytes, which is
// why the tag has to be unwrapped by hand instead of arriving as a nested map.
//
// Only disclosed elements travel here, which is what makes this the list of what
// the verifier actually received rather than what the credential holds.
//
// Nothing below verifies anything. The verifier has already checked the document
// signer chain and the device signature by the time it hands the response over;
// this reads what it accepted.
// ---------------------------------------------------------------------------

const TAG_ENCODED_CBOR = 24

interface IssuerSignedItem {
  elementIdentifier?: unknown
  elementValue?: unknown
}

export interface MdocPresentation {
  docType?: string
  disclosures: DisclosureContent[]
}

export function base64UrlToBase64(text: string): string {
  // Handles both alphabets in one pass: standard base64 contains no - or _, and
  // url-safe contains no + or /. The verifier does not say which it emits.
  const normalised = text.replace(/-/g, "+").replace(/_/g, "/")
  return normalised + "=".repeat((4 - (normalised.length % 4)) % 4)
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(base64UrlToBase64(text))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// The element declares no media type — `value_type` in the issuer's metadata is
// advisory and never reaches the wire — so sniff the magic bytes rather than
// trusting the element name. Worth doing here: this deployment's portraits are
// PNGs, in an element its own metadata calls a jpeg.
function describeBytes(bytes: Uint8Array): string {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng =
    bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const kind = isJpeg ? "jpeg, " : isPng ? "png, " : ""
  return `${kind}${bytes.length} bytes`
}

// An mdoc element value is CBOR, so it arrives as more than a string: cbor2 turns
// the date tags (0, 1 and 18013-5's full-date 1004) into a Date, a byte string
// into a Uint8Array, and a map or array into a plain object. The table takes
// strings, so each needs a rendering that is readable without lying about the
// type.
export function formatElementValue(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (value instanceof Date) {
    // 1004 is a full-date and these are all midnight UTC, so the date half is the
    // whole value; showing a time would invent precision the element has not got.
    return value.toISOString().slice(0, 10)
  }
  if (value instanceof Uint8Array) return describeBytes(value)
  if (value instanceof Tag) return `${value.tag}(${formatElementValue(value.contents)})`
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function parseIssuerSignedItems(
  namespace: string,
  items: unknown,
  qualify: boolean
): DisclosureContent[] {
  if (!Array.isArray(items)) return []

  return items.flatMap((item) => {
    const inner = item instanceof Tag && item.tag === TAG_ENCODED_CBOR ? item.contents : null
    if (!(inner instanceof Uint8Array)) return []

    const signed = cborDecode(inner) as IssuerSignedItem
    if (typeof signed.elementIdentifier !== "string") return []

    // Bare element identifiers unless the document disclosed from more than one
    // namespace, which only the AAMVA mDL does — and there `sex` appears in both,
    // so the namespace is the only thing telling the two rows apart.
    const key = qualify ? `${namespace}/${signed.elementIdentifier}` : signed.elementIdentifier
    return [{ key, value: formatElementValue(signed.elementValue) }]
  })
}

export function parseMdocDeviceResponse(encoded: string): MdocPresentation {
  const response = cborDecode(decodeBase64(encoded)) as { documents?: unknown }
  const documents = Array.isArray(response?.documents) ? response.documents : []

  const disclosures = documents.flatMap((document) => {
    const nameSpaces = (document as { issuerSigned?: { nameSpaces?: unknown } })?.issuerSigned?.nameSpaces
    if (!nameSpaces || typeof nameSpaces !== "object") return []

    const entries = Object.entries(nameSpaces as Record<string, unknown>)
    const qualify = entries.length > 1
    return entries.flatMap(([namespace, items]) => parseIssuerSignedItems(namespace, items, qualify))
  })

  // 18013-5 allows several documents in one DeviceResponse; a DCQL query is
  // answered with one, so the first docType names the whole group rather than
  // trying to head a single table with several.
  const docType = (documents[0] as { docType?: unknown })?.docType
  return { docType: typeof docType === "string" ? docType : undefined, disclosures }
}
