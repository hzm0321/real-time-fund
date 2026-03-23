# app/components/ — UI Components

## OVERVIEW

47 app-specific React components (all client-side). Modals dominate (~26). Core display: FundCard, PcFundTable, MobileFundTable.

## STRUCTURE

```
app/components/
├── Core Display (6)
│   ├── FundCard.jsx            # Individual fund card (valuation + holdings)
│   ├── PcFundTable.jsx         # Desktop table layout
│   ├── MobileFundTable.jsx     # Mobile list with swipe actions
│   ├── MobileFundCardDrawer.jsx# Mobile fund detail drawer
│   ├── GroupSummary.jsx        # Group portfolio summary
│   └── MarketIndexAccordion.jsx# Market indices (24 A/HK/US)
├── Modals (26)
│   ├── Fund ops: AddFundToGroupModal, GroupManageModal, GroupModal, AddResultModal
│   ├── Trading: TradeModal, HoldingEditModal, HoldingActionModal, TransactionHistoryModal, PendingTradesModal, DcaModal, AddHistoryModal
│   ├── Settings: SettingsModal, MarketSettingModal, MobileSettingModal, PcTableSettingModal, SortSettingModal
│   ├── Auth: LoginModal, CloudConfigModal
│   ├── Scan: ScanPickModal, ScanProgressModal, ScanImportConfirmModal, ScanImportProgressModal
│   └── Misc: ConfirmModal, SuccessModal, DonateModal, FeedbackModal, WeChatModal, UpdatePromptModal, FundHistoryNetValueModal
├── Charts (3)
│   ├── FundIntradayChart.jsx   # Intraday valuation chart (localStorage data)
│   ├── FundTrendChart.jsx      # Fund trend chart (pingzhongdata)
│   └── FundHistoryNetValue.jsx # Historical NAV display
└── Utilities (7)
    ├── Icons.jsx               # Custom SVG icons (Close, Eye, Moon, Sun, etc.)
    ├── Common.jsx              # Shared UI helpers
    ├── FitText.jsx             # Auto-fit text sizing
    ├── RefreshButton.jsx       # Manual refresh control
    ├── EmptyStateCard.jsx      # Empty state placeholder
    ├── Announcement.jsx        # Banner announcement
    ├── ThemeColorSync.jsx      # Theme meta tag sync
    ├── PwaRegister.jsx         # Service worker registration
    └── AnalyticsGate.jsx       # Conditional GA loader
```

## CONVENTIONS

- **All client components** — `'use client'` at top, no server components
- **State from parent** — page.jsx manages ALL state; components receive props only
- **shadcn/ui primitives** — imported from `@/components/ui/*`
- **Mobile/Desktop switching** — parent passes `isMobile` prop; 640px breakpoint
- **Modals**: use `useBodyScrollLock(open)` hook for scroll prevention
- **Icons**: mix of custom SVG (Icons.jsx) + lucide-react
- **Styling**: glassmorphism via CSS variables (globals.css), no component-level CSS

## ANTI-PATTERNS (THIS DIRECTORY)

- **No prop drilling avoidance** — all state flows from page.jsx via props (30+ prop holes in FundCard)
- **Modal sprawl** — 26 modals could benefit from a modal manager/context
- **Swipe gesture duplication** — MobileFundTable and MobileFundCardDrawer both implement swipe logic
- **No loading skeletons** — components show spinners, not skeleton placeholders
