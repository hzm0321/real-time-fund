# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-21T03:22:46Z
**Commit:** 270bc3a
**Branch:** main

## OVERVIEW

Real-time mutual fund valuation tracker (基估宝). Next.js 16 App Router, pure JavaScript (JSX, no TypeScript), static export to GitHub Pages. Glassmorphism UI with heavy custom CSS variables (3557-line globals.css). All data via JSONP/script injection to external Chinese financial APIs (天天基金, 东方财富, 腾讯财经). localStorage as primary database; Supabase for optional cloud sync.

## STRUCTURE

```
real-time-fund/
├── app/                          # Next.js App Router root
│   ├── page.jsx                  # MONOLITHIC SPA entry (~7400 lines) — state + logic + main layout
│   ├── layout.jsx                # Root layout (theme init, PWA, GA, Toaster)
│   ├── globals.css               # Tailwind v4 + glassmorphism CSS variables (~3557 lines)
│   ├── api/fund.js               # ALL external data fetching (~954 lines, JSONP + script injection)
│   ├── components/               # 47 app-specific UI components (modals, cards, tables, charts)
│   ├── lib/                      # Core utilities: supabase, get-query-client, query-keys, tradingCalendar, valuationTimeseries
│   ├── hooks/                    # Custom hooks: useBodyScrollLock, useFundFuzzyMatcher
│   └── assets/                   # Static images (GitHub SVG, donation QR codes)
├── components/ui/                # 15 shadcn/ui primitives (accordion, button, dialog, drawer, etc.)
├── lib/utils.js                  # cn() helper only (clsx + tailwind-merge)
├── public/                       # Static: allFund.json, PWA manifest, service worker, icon
├── doc/                          # Documentation: localStorage schema, Supabase SQL, dev group QR
├── .github/workflows/            # CI/CD: nextjs.yml (GitHub Pages), docker-ci.yml (Docker build)
├── .husky/                       # Pre-commit: lint-staged → ESLint
├── Dockerfile                    # Multi-stage: Node 22 build → Nginx Alpine serve
├── docker-compose.yml            # Docker Compose config
├── entrypoint.sh                 # Runtime env var placeholder replacement
├── nginx.conf                    # Nginx config (port 3000, SPA fallback)
├── next.config.js                # Static export, reactStrictMode, reactCompiler
├── jsconfig.json                 # Path aliases: @/* → ./*
├── eslint.config.mjs             # ESLint flat config: next/core-web-vitals
├── postcss.config.mjs            # Tailwind v4 PostCSS plugin
├── components.json               # shadcn/ui config (new-york, JSX, RSC)
└── package.json                  # Node >= 20.9.0, lint-staged, husky
```

## WHERE TO LOOK

| Task                     | Location                                                                | Notes                                                |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Fund valuation logic     | `app/api/fund.js`                                                       | JSONP to 天天基金, script injection to 腾讯财经      |
| Main UI orchestration    | `app/page.jsx`                                                          | Monolithic — all useState, business logic, rendering |
| Modal rendering layer    | `app/components/ModalsLayer.jsx`                                        | All modal rendering extracted from page.jsx          |
| Fund card display        | `app/components/FundCard.jsx`                                           | Individual fund card with holdings                   |
| Desktop table            | `app/components/PcFundTable.jsx`                                        | PC-specific table layout                             |
| Mobile table             | `app/components/MobileFundTable.jsx`                                    | Mobile-specific layout, swipe actions                |
| Holding calculations     | `app/page.jsx` (getHoldingProfit)                                       | Profit/loss computation                              |
| Cloud sync               | `app/lib/supabase.js` + page.jsx sync functions                         | Supabase auth + data sync                            |
| Trading/DCA              | `app/components/TradeModal.jsx`, `DcaModal.jsx`                         | Buy/sell, dollar-cost averaging                      |
| Fund fuzzy search        | `app/hooks/useFundFuzzyMatcher.js`                                      | Fuse.js based name/code matching                     |
| OCR import               | `app/page.jsx` (processFiles)                                           | Tesseract.js + LLM parsing                           |
| Valuation intraday chart | `app/lib/valuationTimeseries.js`                                        | localStorage time-series                             |
| Trading calendar         | `app/lib/tradingCalendar.js`                                            | Chinese holiday detection via CDN                    |
| Request caching          | TanStack Query (`app/lib/get-query-client.js`, `app/lib/query-keys.js`) | Dedup + staleTime/gcTime                             |
| UI primitives            | `components/ui/`                                                        | shadcn/ui — accordion, dialog, drawer, select, etc.  |
| Global styles            | `app/globals.css`                                                       | CSS variables, glassmorphism, responsive             |
| CI/CD                    | `.github/workflows/nextjs.yml`                                          | Build + deploy to GitHub Pages                       |
| Docker                   | `Dockerfile`, `docker-compose.yml`                                      | Multi-stage build with runtime env injection         |
| localStorage schema      | `doc/localStorage 数据结构.md`                                          | Full documentation of stored data shapes             |
| Supabase schema          | `doc/supabase.sql`                                                      | Database tables for cloud sync                       |

## CONVENTIONS

- **JavaScript only** — no TypeScript. `tsx: false` in shadcn config.
- **No src/ directory** — app/, components/, lib/ at root level.
- **Static export** — `output: 'export'` in next.config.js. No server-side runtime.
- **JSONP + script injection** — all external API calls bypass CORS via `<script>` tags, not fetch().
- **localStorage-first** — all user data stored locally; Supabase sync is optional/secondary.
- **Unified Data Access** — **Strict Requirement**: ALL `localStorage` reads and writes MUST go through `storageStore` (or `useStorageStore` in React). Never use `window.localStorage` directly for business data to ensure state synchronization, cloud sync triggering, and data integrity (e.g., automatic JSON parsing/stringifying).
- **Monolithic page.jsx** — entire app state and logic in one file (~7400 lines). No state management library.
- **Dual responsive layouts** — `PcFundTable` and `MobileFundTable` switch at 640px breakpoint.
- **shadcn/ui conventions** — new-york style, CSS variables enabled, Lucide icons, path aliases (`@/components`, `@/lib/utils`).
- **Linting only** — ESLint + lint-staged on pre-commit. No Prettier, no auto-formatting.
- **Lodash for type checks** — 数据类型判断必须全部使用 lodash 方法（如 `isFunction`, `isObject`, `isString`, `isNumber`, `isBoolean`, `isArray`, `isNil`, `isEqual` 等），禁止使用原生 `Array.isArray` 和 `typeof` 判断数据类型（注意：检测全局环境对象如 `window`, `document`, `process`, `Intl`, `fetch` 等是否未定义时，为避免 ReferenceError 允许保留原生 `typeof === 'undefined'` 判断）。
- **React Compiler** — `reactCompiler: true` in next.config.js (experimental auto-memoization).
- **单位规范（px/rem）** — PC 端（`> 640px`）使用 `px`；全局（media query 外）的 `px` 由 `postcss-pxtorem`（`rootValue: 16`，`mediaQuery: false`）自动转换为 `rem`，PC 端 `html { font-size: 16px }` 保证 rem 与原 px 视觉完全一致。`@media (max-width: 640px)` 块**内**的 `px` 保留不转。移动端 `html { font-size: clamp(13px, 3.84vw, 16px) }` 让全局 rem 值随视口弹性缩放。`1px` 边框（`minPixelValue: 2`）保留为 px。如需阻止某个值被转换，使用大写 `PX` 书写。
- **Modal 写法规范** — 所有弹框统一按以下规则组织：
  1. **Modal state 归 Zustand** — 弹框开关状态、参数、data 全部放在 `app/stores/modalStore.js` 的 Zustand store 中。不要在 page.jsx 中用 `useState` 管理弹框状态。
  2. **所有弹框渲染集中在 ModalsLayer** — 新增弹框在 `app/components/ModalsLayer.jsx` 中渲染，不放在 page.jsx。ModalsLayer 订阅 `useModalStore`，弹框开关时仅 ModalsLayer 重渲染，不触发 page.jsx 主体。
  3. **page.jsx 不订阅 modal state** — 弹框使用过程中需要的 page 级变量（callbacks、数据、refs）统一通过 `modalCbRef`（`useRef({})`）传递。page.jsx 中如需在 handler 中读取 modal state（如 `tradeModal.groupId`），使用 `useModalStore.getState().xxx` 而非 `useModalStore((s) => s.xxx)`（不订阅）。
  4. **低频弹框懒加载** — 低频弹框（DonateModal、FeedbackModal、CloudConfigModal 等）使用 `dynamic(() => import(...), { ssr: false })`。高频弹框（TradeModal、DcaModal、SettingsModal 等）静态 import。
  5. **setter 直接操作 Zustand** — 弹框 close handler 使用 `useModalStore.setState` / `useModalStore.getState` 直接读写 store（`setSettingsOpen = (v) => _ms({ settingsOpen: ... })`），不走 page.jsx 的 setState。
  6. **弹框访问 page 级 function** — 通过 `cb.current.handleXxx` 调用。如新增弹框需要访问 page.jsx 中的函数或数据，先在 `page.jsx` 的 `modalCbRef.current = { ... }` 中添加，再在 ModalsLayer 中通过 `cb.current.xxx` 使用。
  7. **快速新增弹框流程**：
     - `modalStore.js` 添加 state 字段 + 初始值
     - 创建弹框组件（静态 import 或 dynamic）
     - `ModalsLayer.jsx` 中添加 `<AnimatePresence> + modal component + onClose/onConfirm` 渲染
     - 如需 page 级回调 → 先在 `modalCbRef` 注册，再在 ModalsLayer 中用 `cb.current.xxx` 调用
- **Safari Input Zoom 防治规范** — 开发 `<input>`、`<Input>` 或任何可聚焦的输入组件时，务必确保其在移动端（或全局）的 `font-size` 计算值不小于 `16px`。由于项目使用了 `postcss-pxtorem`，若使用 `text-xs` 或 `text-sm` 等较小字体类名，会导致在 Safari（尤其是 iOS）下因字体小于 16px 而触发输入框聚焦时自动放大页面的问题。应使用 `text-[16PX]`（大写 PX 以避免被插件转换为 rem）来强制规定字体大小，从而禁用 Safari 的自动缩放行为。

## ANTI-PATTERNS (THIS PROJECT)

- **No test infrastructure** — zero test files, no test framework, no test scripts.
- **Dual ESLint configs** — both `.eslintrc.json` (legacy) and `eslint.config.mjs` (flat) exist. Flat config is active.
- **`--legacy-peer-deps`** — Dockerfile uses this flag, indicating peer dependency conflicts.
- **Console statements** — 20 console.error/warn/log across codebase (mostly error logging in page.jsx).
- **2 eslint-disable comments** — `no-await-in-loop` in MobileFundTable, `react-hooks/exhaustive-deps` in HoldingEditModal.
- **Hardcoded API keys** — `app/api/fund.js` lines 911-914 contain plaintext API keys for LLM service.
- **Empty catch blocks** — several `catch (e) {}` blocks that swallow errors silently.

## UNIQUE STYLES

- **Glassmorphism design** — frosted glass effect via `backdrop-filter: blur()` + semi-transparent backgrounds.
- **CSS variable system** — 50+ CSS custom properties for colors, spacing, transitions in globals.css.
- **Runtime env injection** — Docker entrypoint replaces `__PLACEHOLDER__` strings in static JS/HTML at container start.
- **JSONP everywhere** — financial APIs (天天基金, 腾讯财经) accessed via script tag injection, not fetch().
- **OCR + LLM import** — Tesseract.js OCR → LLM text parsing → fund code extraction.
- **Multiple IDE configs** — .cursor/, .qoder/, .trae/ directories suggest active AI-assisted development.

## COMMANDS

```bash
# Development
npm run dev              # Start dev server (localhost:3000)
npm run build            # Static export to out/
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix

# Docker
docker build -t real-time-fund .
docker run -d -p 3000:3000 --env-file .env real-time-fund
docker compose up -d

# Environment
cp env.example .env.local   # Copy template, fill NEXT_PUBLIC_* values
```

## NOTES

- **Fund code format**: 6-digit numeric codes (e.g., 110022). Stored in localStorage key `localFunds`.
- **Data sources**: 天天基金 (valuation JSONP), 东方财富 (holdings HTML parsing), 腾讯财经 (stock quotes script injection).
- **Deployment**: GitHub Actions auto-deploys main → GitHub Pages. Also supports Vercel, Cloudflare Pages, Docker.
- **Node requirement**: >= 20.9.0 (enforced in package.json engines).
- **License**: AGPL-3.0 — derivative works must be open-sourced under same license.
- **Chinese UI** — all user-facing text is Chinese (zh-CN). README is bilingual (Chinese primary).
