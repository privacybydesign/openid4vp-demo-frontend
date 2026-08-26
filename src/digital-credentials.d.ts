// Ambient declarations for the W3C Digital Credentials API, which TypeScript's DOM
// library does not ship yet. Declaration merging with the built-in DOM interfaces, so
// this file must stay a global script: adding a top-level import or export would turn
// it into a module and the merges would silently stop applying.

interface DigitalCredentialGetRequest {
  // "openid4vp-v1-signed" / "openid4vp-v1-unsigned" for OpenID4VP; the registry is open.
  protocol: string
  // Per OpenID4VP 1.0 Appendix A.3 this is an object. Typed loosely because the shape
  // is protocol-specific, not because it is optional.
  data: unknown
}

interface DigitalCredentialRequestOptions {
  requests: DigitalCredentialGetRequest[]
}

interface CredentialRequestOptions {
  digital?: DigitalCredentialRequestOptions
}

interface DigitalCredential extends Credential {
  readonly protocol: string
  // Chrome has exposed this both as a parsed object and as its JSON text across
  // versions, so it is deliberately not narrowed here — see readResponseObject.
  readonly data: unknown
}
