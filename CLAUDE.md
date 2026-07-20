# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server at localhost:3000
npm run build        # Static export to out/
npm run lint         # ESLint (flat config)
npm run lint:fix     # ESLint auto-fix
```

Node >= 20.9.0 required. No test framework is configured.

## Architecture

**real-time-fund** (基估宝) — a pure-JavaScript (JSX, no TypeScript) Next.js 16 App Router application that tracks real-time mutual fund valuations. Deploys as a static site to GitHub Pages (`output: 'export'` in next.config.js).

- `app/page.jsx` (~7400 lines) — monolithic SPA entry point: all application state (useState), business logic, and main layout in one file
- `app/api/fund.js` — all external data fetching via JSONP/script tag injection (not fetch) to 天天基金, 东方财富, 腾讯财经
- `app/stores/` — Zustand stores: `storageStore` (localStorage wrapper, the single source of truth for all user data), `modalStore` (dialog state), `settingsStore`, `userStore`
- `app/components/` — 47+ app components; `ModalsLayer.jsx` renders all modals centrally
- `app/lib/` — utilities: `supabase.js` (optional cloud sync), `tradingCalendar.js`, `valuationTimeseries.js`, `get-query-client.js` (TanStack Query)
- `app/hooks/` — custom hooks including `useFundFuzzyMatcher.js` (Fuse.js), `useSyncManager.js`, `useRefreshManager.js`
- `components/ui/` — 15 shadcn/ui primitives (new-york style, Lucide icons)

Data flow: localStorage (`storageStore`) is the primary database. Supabase sync is optional and secondary. All localStorage reads/writes MUST go through `storageStore` — never use `window.localStorage` directly.

## Conventions

- **JavaScript only** — no TypeScript anywhere. shadcn configured with `tsx: false`.
- **Lodash for type checks** — use `isFunction`, `isObject`, `isString`, `isNumber`, `isArray`, `isNil`, `isEqual` etc. instead of native `typeof`/`Array.isArray`. Exception: `typeof x === 'undefined'` is allowed for global environment checks (`window`, `document`, `process`).
- **JSONP + script injection** — all financial API calls use `<script>` tags to bypass CORS, not `fetch()`.
- **Modal conventions** — modal state lives in `modalStore.js` (Zustand), all modals render in `ModalsLayer.jsx`, page.jsx never subscribes to modal state. Pass page-level functions to modals via `modalCbRef` (a useRef). See AGENTS.md for the full 7-step modal workflow.
- **Responsive layouts** — `PcFundTable` (desktop) and `MobileFundTable` (mobile) switch at 640px breakpoint.
- **CSS units** — PC uses `px`; global `px` auto-converts to `rem` via `postcss-pxtorem` (rootValue 16). Inside `@media (max-width: 640px)` blocks, `px` is preserved. Use uppercase `PX` to prevent conversion.
- **React Compiler** — enabled (`reactCompiler: true`); auto-memoization is active.
- **Linting** — ESLint flat config (`eslint.config.mjs`) + Prettier plugin + lint-staged on pre-commit via Husky.

## Environment

Copy `env.example` to `.env.local`. Required variables:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — cloud sync (optional)
- `NEXT_PUBLIC_GA_ID` — Google Analytics (optional)
- `NEXT_PUBLIC_IS_GITHUB_LOGIN` — GitHub OAuth toggle (`true`/`false`)
- `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` — feedback form (optional)

## Path Aliases

`@/*` maps to `./*` (via jsconfig.json). Use `@/components/ui/...`, `@/lib/utils`, `@/app/...`.
