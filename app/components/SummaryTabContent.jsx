'use client';

import React from 'react';
import GroupSummary from './GroupSummary';
import GroupAccountSummaryCard from './GroupAccountSummaryCard';
import { SUMMARY_TAB_ID, SUMMARY_SOURCE_GLOBAL } from '@/app/constants';

export default function SummaryTabContent({
  funds,
  holdings,
  groups,
  getProfit,
  summaryTabPortfolioTotals,
  navbarHeight,
  filterBarHeight,
  isGroupSummarySticky,
  setIsGroupSummarySticky,
  maskAmounts,
  setMaskAmounts,
  shouldShowMarketIndex,
  summaryCardItems,
  isMobile,
  startTransition,
  setCurrentTab
}) {
  return (
    <>
      <GroupSummary
        funds={funds}
        holdings={holdings}
        portfolioTabId={SUMMARY_TAB_ID}
        groups={groups}
        getProfit={getProfit}
        summaryTotalsOverride={summaryTabPortfolioTotals}
        stickyTop={navbarHeight + filterBarHeight + (isMobile ? -14 : 0)}
        isSticky={isGroupSummarySticky}
        onToggleSticky={(next) => setIsGroupSummarySticky(next)}
        masked={maskAmounts}
        onToggleMasked={() => setMaskAmounts((v) => !v)}
        shouldShowMarketIndex={shouldShowMarketIndex}
        navbarHeight={navbarHeight}
      />
      {summaryCardItems.length > 0 && (
        <div
          className="grid"
          style={{
            marginTop: isGroupSummarySticky ? 50 : 10,
            gridColumn: 'span 12',
            gap: isMobile ? 10 : 16
          }}
        >
          {summaryCardItems.map((row) => (
            <div
              key={row.groupId}
              style={{
                minWidth: 0,
                gridColumn: isMobile ? 'span 12' : 'span 6'
              }}
            >
              <GroupAccountSummaryCard
                onActivate={() =>
                  startTransition(() => setCurrentTab(row.groupId === SUMMARY_SOURCE_GLOBAL ? 'all' : row.groupId))
                }
                groupName={row.groupName}
                totalAsset={row.totalAsset}
                holdingReturn={row.holdingReturn}
                holdingReturnPercent={row.holdingReturnPercent}
                accountReturn={row.accountReturn}
                accountReturnPercent={row.accountReturnPercent}
                hasAnyTodayData={row.hasAnyTodayData}
                upCount={row.upCount}
                downCount={row.downCount}
                sparkSeries={row.sparkSeries}
                masked={maskAmounts}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
