import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the app build never has to resolve
// vitest. The env value is needed because src/veramoIssuer.ts requires the
// admin token at import time and the modules under test import it; nothing in
// the test suite makes a request, so the value itself does not matter.
export default defineConfig({
  test: {
    env: {
      VITE_VERAMO_ISSUER_ADMIN_TOKEN: 'test-token',
    },
  },
})
