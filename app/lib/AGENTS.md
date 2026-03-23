# app/lib/ — Core Utilities

## OVERVIEW

4 utility modules: Supabase client, request cache, trading calendar, valuation time-series.

## WHERE TO LOOK

| File | Exports | Purpose |
|------|---------|---------|
| `supabase.js` | `supabase`, `isSupabaseConfigured` | Supabase client (or noop fallback). Auth + DB + realtime |
| `cacheRequest.js` | `cachedRequest()`, `clearCachedRequest()` | In-memory request dedup + TTL cache |
| `tradingCalendar.js` | `loadHolidaysForYear()`, `loadHolidaysForYears()`, `isTradingDay()` | Chinese stock market holiday detection via CDN |
| `valuationTimeseries.js` | `recordValuation()`, `getValuationSeries()`, `clearFund()`, `getAllValuationSeries()` | Fund valuation time-series (localStorage) |

## CONVENTIONS

- **supabase.js**: creates `createNoopSupabase()` when env vars missing — all auth/DB methods return safe defaults
- **cacheRequest.js**: deduplicates concurrent requests for same key; default 10s TTL
- **tradingCalendar.js**: downloads `chinese-days` JSON from cdn.jsdelivr.net; caches per-year in Map
- **valuationTimeseries.js**: localStorage key `fundValuationTimeseries`; auto-clears old dates on new data

## ANTI-PATTERNS (THIS DIRECTORY)

- **No error reporting** — all modules silently fail (console.warn at most)
- **localStorage quota not handled** — valuationTimeseries writes without checking available space
- **Cache only in-memory** — cacheRequest lost on page reload; no persistent cache
- **No request cancellation** — JSONP scripts can't be aborted once injected
