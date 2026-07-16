export type LinkForm = "scheme" | "universal" | "universal-staging"

const UNIVERSAL_PATH_BY_SCHEME: Record<string, string> = {
  "openid4vp:": "/-/openid4vp",
  "eudi-openid4vp:": "/-/openid4vp",
  "openid-credential-offer:": "/-/openid-credential-offer",
}

// IRMA session links carry the session pointer in the path (scheme form) or
// fragment (universal form), unlike the query-based openid4vp links.
const IRMA_SCHEME_PREFIX = "irma://qr/json/"

export function toUniversalLink(uri: string, host: string): string {
  if (uri.startsWith(IRMA_SCHEME_PREFIX)) {
    return `https://${host}/-/session#${uri.slice(IRMA_SCHEME_PREFIX.length)}`
  }

  const schemeEnd = uri.indexOf("://")
  if (schemeEnd === -1) return uri

  const scheme = uri.slice(0, schemeEnd + 1)
  const path = UNIVERSAL_PATH_BY_SCHEME[scheme]
  if (!path) return uri

  const rest = uri.slice(schemeEnd + 3)
  const queryStart = rest.indexOf("?")
  const query = queryStart === -1 ? "" : rest.slice(queryStart + 1)

  return query ? `https://${host}${path}?${query}` : `https://${host}${path}`
}

export function applyLinkForm(uri: string, form: LinkForm, host: string): string {
  return form === "scheme" ? uri : toUniversalLink(uri, host)
}
