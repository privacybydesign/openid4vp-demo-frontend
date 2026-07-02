// Helpers for reading environment variables that Vite injects at build time.

// Returns the value of a required environment variable, throwing loudly if it
// is missing or empty. Use this for secrets (admin tokens) that must never fall
// back to a hardcoded default baked into the browser bundle.
export function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
