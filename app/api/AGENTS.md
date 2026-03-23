# app/api/ — Data Fetching Layer

## OVERVIEW

Single file (`fund.js`, ~954 lines) containing ALL external data fetching for the entire application. Pure client-side: JSONP + script tag injection to bypass CORS.

## WHERE TO LOOK

| Function | Purpose |
|----------|---------|
| `fetchFundData(code)` | Main fund data (valuation + NAV + holdings). Uses 天天基金 JSONP |
| `fetchFundDataFallback(code)` | Backup data source when primary fails |
| `fetchSmartFundNetValue(code, date)` | Smart NAV lookup with date fallback |
| `searchFunds(val)` | Fund search by name/code (东方财富) |
| `fetchFundHistory(code, range)` | Historical NAV data via pingzhongdata |
| `fetchFundPingzhongdata(code)` | Raw eastmoney pingzhongdata (trend, grand total) |
| `fetchMarketIndices()` | 24 A-share/HK/US indices via 腾讯财经 |
| `fetchShanghaiIndexDate()` | Shanghai index date for trading day check |
| `parseFundTextWithLLM(text)` | OCR text → fund codes via LLM (apis.iflow.cn) |
| `loadScript(url)` | JSONP helper — creates script tag, waits for global var |
| `fetchRelatedSectors(code)` | Fund sector/track info (unused in main UI) |

## CONVENTIONS

- **JSONP pattern**: `loadScript(url)` → sets global callback → script.onload → reads `window.XXX` → cleanup
- **All functions return Promises** — async/await throughout
- **Cached via `cachedRequest()`** from `app/lib/cacheRequest.js`
- **Error handling**: try/catch returning null/empty — never throws to UI
- **Market indices**: `MARKET_INDEX_KEYS` array defines 24 indices with `code`, `varKey`, `name`
- **Stock code normalization**: `normalizeTencentCode()` handles A-share (6-digit), HK (5-digit), US (letter codes)

## ANTI-PATTERNS (THIS DIRECTORY)

- **Hardcoded API keys** (lines 911-914) — plaintext LLM service keys in source
- **Empty catch blocks** — several `catch (e) {}` silently swallowing errors
- **Global window pollution** — JSONP callbacks assigned to `window.jsonpgz`, `window.SuggestData_*`, etc.
- **No retry logic** — failed requests return null, no exponential backoff
- **Script cleanup race conditions** — scripts removed from DOM after onload/onerror, but timeout may trigger after removal
