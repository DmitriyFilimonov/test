# AGENTS.md

See `CLAUDE.md` for workflow rules, decision journal format, and detailed architecture guidance.

## Setup

```sh
# Node >= 22.22 required (.nvmrc points to 24).
# On Node 20 vitest dies at startup with ERR_INVALID_ARG_VALUE from rolldown.
source "$HOME/.nvm/nvm.sh" && nvm use
npm install
npm run dev  # mock-api :3001 + Vite :5173
```

## Commands

```sh
npm test                    # all vitest tests (node + dom projects)
npm run typecheck           # lerna run across all packages
npm run lint                # lerna run across all packages
npm run build -w @app/web   # production build
npm run test:mutation       # mutation testing (expensive, run once per task)
npm run test:mutation -- <suite-name>  # single mutation suite
npm run format              # prettier --write
```

Run a single package's tests: `npm test -- packages/<layer>/<name>/` or `vitest run <path>`.

## Architecture

**Monorepo structure:**

- `apps/web` — React app (Vite, redux-saga, react-router)
- `apps/mock-api` — Express mock server (deterministic org-tree data)
- `packages/<layer>/<name>` — FSD packages: `shared`, `entities`, `features`, `widgets`, `pages`
- `scripts/mutation` — mutation test runner

**Layer boundaries (enforced by ESLint):**

- Each layer imports only lower layers: `shared` < `entities` < `features` < `widgets` < `pages`
- Packages import only what's declared in their `package.json` dependencies
- `@pages/*` cannot import redux/redux-saga directly—only via `@entities/*` public hooks

**Package boundaries (enforced by exports field + ESLint):**

- Each package has its own `package.json` with `exports: { ".": "./src/index.ts" }`
- Deep imports like `@shared/query/src/internal` do NOT resolve (verified by tsc and vite build)
- New functionality = new package in its layer, not a subfolder in existing package

**Packages don't build:** TypeScript source is consumed directly via workspace symlinks. No bundling step per package.

## Testing

**Two vitest projects** in root `vitest.config.ts`:

- `node` (default): `**/*.test.{ts,tsx}` excluding dom tests
- `dom`: `**/*.dom.test.{ts,tsx}` with jsdom + Testing Library

DOM tests need `import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'`.

**Test store setup in dom tests:** When a component uses redux selectors (e.g., `useOrgTreeLiveStatus`), the test must configure the store with ALL required reducers and sagas, not just the one being tested. Missing reducer = `Cannot read properties of undefined` in selector.

**Mutation testing:** Suites in `scripts/mutation/src/suites/`. If you change a file with a suite, run that suite. Full run (`npm run test:mutation`) is expensive—run once at task end. `survived` = write a test, don't delete the mutation. `invalid` = update `from`/`to` to match new code.

## Conventions

**Component model:** State and logic live in a hook (`model/use<Name>Model.ts`), component renders what hook returns. Applies to new code and code being changed; no blanket refactoring.

**Redux sagas:** Use `typed-redux-saga` effects (`yield* put(...)`, `yield* call(...)`). ESLint plugin enforces this.

**No inline styles:** ESLint forbids `style` props and `el.style.*` writes. Use styled-components (declared at module top level, not inside functions).

**No layout reads from DOM:** `getBoundingClientRect`, `offsetWidth`, etc. forbidden. Node sizes come from theme constants.

**Imports:** Between packages use package name (`@shared/query`). Inside package use relative paths.

## Language

Codebase is in Russian: variable names in English, comments/docs/UI strings in Russian. CLAUDE.md and README in Russian. Keep this convention when adding content.
