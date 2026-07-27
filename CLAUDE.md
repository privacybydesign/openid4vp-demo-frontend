# Notes for working in this repo

## Checks are not gated by CI

`.github/workflows/status-checks.yml` only builds the Docker image. Neither
`npm run lint` nor `npm test` runs there, so run both locally before pushing.
`npm run lint` is clean apart from one pre-existing `react-hooks/exhaustive-deps`
warning in `src/RequestEditor.tsx`.

## Tests

`npm test` runs vitest. Its config is `vitest.config.ts`, kept separate from
`vite.config.ts` so the app build never resolves vitest. That config stubs
`VITE_VERAMO_ISSUER_ADMIN_TOKEN`, because `src/veramoIssuer.ts` calls
`requireEnv` at import time and most modules import it transitively. `vite build`
needs no such placeholder: Vite replaces `import.meta.env.VITE_*` statically and
never evaluates the module, so a missing token fails at page load in the browser
rather than in the build.

Most tests are plain logic tests on `.ts` modules and need no DOM. A component
test needs jsdom, which vitest does not switch on by default. Put
`// @vitest-environment jsdom` on the first line of the test file rather than
setting `test.environment` globally, so the logic tests keep running without it. React 19's `act()` also refuses to run until
`IS_REACT_ACT_ENVIRONMENT` is set on `globalThis`; see
`src/RevocationPanel.test.tsx` for the shape. There is no
`@testing-library/react` here. `createRoot` plus `act` from `react` is enough.

`react-hooks/set-state-in-effect` (eslint-plugin-react-hooks v7) walks the whole
call graph reachable from an effect body and does not model `await`, so moving a
`setState` behind the first `await` does not satisfy it. Hand the result to state
from a `.then` callback instead.

## Styling

There is no DESIGN.md. The `:root` block in `src/index.css` holds the `--yivi-*`
custom properties and is the closest thing to a design source; colours used in
more than one place belong there. Inline Tailwind arbitrary values
(`text-[#484747]`) are the existing convention for one-off reuse of an already
established colour.
