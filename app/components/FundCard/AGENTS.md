# FundCard Component

## OVERVIEW

The `FundCard` component (`app/components/FundCard/index.jsx`) is the core UI element for displaying individual fund information. It is designed to work in multiple layout modes (standard card and mobile drawer) and handles presenting real-time data, personal holding performance, historical charts, and top holdings.

## KEY RESPONSIBILITIES

- **Fund Identity & Status**: Displays the fund name, code, related sector, DCA (定投) indicator, update status, and user-defined tags.
- **Real-Time Data**: Shows the latest net value (最新净值), estimated net value (估值净值), and corresponding percentage changes.
- **Personal Performance**: Computes and shows holding amount, cost net value, total profit/loss (持有收益), and daily earnings (当日收益). Supports toggling between amount and percentage modes.
- **Data Visualization**: Integrates with sub-components:
  - `FundIntradayChart` for intraday valuation curves.
  - `FundTrendChart` for historical net value trends and transaction markers.
  - `FundDailyEarnings` for personal daily profit/loss history.
- **Holdings Information**: Fetches and renders the top 10 stock holdings (前10重仓) periodically.
- **Layout Adaptability**: Supports `card` mode (default inline rendering) and `drawer` mode (uses `Tabs` for grouping sections, usually for mobile).

## STATE & DATA MANAGEMENT

- **Zustand Store**: Subscribes to `useStorageStore` for the main `funds` list and `refreshMs` setting.
- **Local Polling**: Initiates an interval-based polling mechanism (`useEffect`) to call `fetchFundHoldings` and keep the top holdings data fresh.
- **Props-Driven**: Relies heavily on props passed from the parent (`page.jsx` or layout containers) for data like `holdings`, `fundDailyEarnings`, `valuationSeries`, `transactions`, and specific toggle states.

## COMPONENT ARCHITECTURE & DEPENDENCIES

- **UI Primitives**: Utilizes `shadcn/ui` components (`Tabs`, `Empty`, `Badge`) for structural elements.
- **Sub-components**: `Stat`, `ConsecutiveTrendBadge`, `FundTrendChart`, `FundIntradayChart`, `FundDailyEarnings`.
- **Animations**: Uses `framer-motion` (`motion.div`, `AnimatePresence`) for smooth expand/collapse transitions of sections like "More" details, holdings lists, and charts.

## IMPORTANT CONVENTIONS

- **`isAdded` Preview State**: The component calculates an `isAdded` boolean by checking if the fund exists in the user's `funds` store. If `false` (e.g., previewing a fund from search before adding):
  - Displays an "Add" button (`PlusCircle`) in the header instead of the favorite star, triggering `onAddFund`.
  - Hides the personal holding and profit sections entirely.
  - Renders the `MoreSection` (phase performance like 1-week, 1-month returns) inline directly, without the collapsible "更多/收起" toggle.
- **Callback Delegation**: Emits actions back to the parent component rather than modifying global state directly. Callbacks include `onToggleFavorite`, `onRemoveFund`, `onHoldingClick`, `onActionClick`, `onToggleCollapse`, etc.
- **Data Masking**: Respects the `masked` prop (eye icon toggle) by obfuscating sensitive financial values with `******`.
- **Time Zone Handling**: Uses `dayjs` with `utc` and `timezone` plugins to ensure correct date/time display based on the browser's current timezone.
- **CSS Variables & Glassmorphism**: Relies on global CSS classes (`glass`, `card`, `row`, `stat`) and CSS variables (`var(--primary)`, `var(--muted)`) established in `globals.css` for consistent styling.
