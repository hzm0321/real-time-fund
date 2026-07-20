# app/lib/ — Core Utilities

## OVERVIEW

Core utilities: Supabase client, React Query client factory + query keys, trading calendar, valuation time-series.

## WHERE TO LOOK

| File | Exports | Purpose |
|------|---------|---------|
| `supabase.js` | `supabase`, `isSupabaseConfigured` | Supabase client (or noop fallback). Auth + DB + realtime |
| `get-query-client.js` | `getQueryClient()` | Browser singleton `QueryClient` (shared with `QueryClientProviderWrapper`) |
| `query-keys.js` | `fundHistory()`, `pingzhongdata()`, … | Stable TanStack Query keys for `fund.js` / hooks |
| `tradingCalendar.js` | `loadHolidaysForYear()`, `loadHolidaysForYears()`, `isTradingDay()` | Chinese stock market holiday detection via CDN |
| `valuationTimeseries.js` | `recordValuation()`, `getValuationSeries()`, `clearFund()`, `getAllValuationSeries()` | Fund valuation time-series (localStorage) |

## CONVENTIONS

- **supabase.js**: creates `createNoopSupabase()` when env vars missing — all auth/DB methods return safe defaults
- **get-query-client.js**: imperative `fetchQuery` / `removeQueries` in `app/api/fund.js` share the same cache as UI `useQuery`
- **tradingCalendar.js**: downloads `chinese-days` JSON from cdn.jsdelivr.net; caches per-year in Map
- **valuationTimeseries.js**: localStorage key `fundValuationTimeseries`; auto-clears old dates on new data

## ANTI-PATTERNS (THIS DIRECTORY)

- **No error reporting** — all modules silently fail (console.warn at most)
- **localStorage quota not handled** — valuationTimeseries writes without checking available space
- **React Query cache in-memory** — cleared on full page reload unless persisted elsewhere
- **No request cancellation** — JSONP scripts can't be aborted once injected
