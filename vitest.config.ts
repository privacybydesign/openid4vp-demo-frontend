import { defineConfig } from "vitest/config"

// Separate from vite.config.ts so tests never mount the BFF proxy plugin.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
})
