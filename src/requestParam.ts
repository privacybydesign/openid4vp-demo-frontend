// Base64 over UTF-8, so a request with a curly quote or an accented name survives
// the round trip through the URL (plain btoa throws on anything outside Latin-1).
export function encodeRequestParam(request: string): string {
  const bytes = new TextEncoder().encode(request)
  let binary = ""
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary)
}

export function decodeRequestParam(param: string): string {
  const binary = atob(param)
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}
