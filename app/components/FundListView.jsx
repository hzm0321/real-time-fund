'use client';
import { isArray } from 'lodash';

import React from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import FundCard from './FundCard';
import { useIsMobile } from '../hooks/useIsMobile';

// 动态 import 实现代码分割：移动端不加载 PC 表格代码，反之亦然
const PcFundTable = dynamic(() => import('./PcFundTable'), { ssr: false });
const MobileFundTable = dynamic(() => import('./MobileFundTable'), { ssr: false });

const FundListView = React.memo(function FundListView({
  viewMode,
  isGroupSummarySticky,
  navbarHeight,
  filterBarHeight,
  pcFundTableData,
  userId,
  currentTab,
  groups,
  favorites,
  sortBy,
  sortOrder,
  sortRules,
  setSortBy,
  setSortOrder,
  startTransition,
  handleReorder,
  handleRemoveFundEntry,
  removeFundsFromCurrentTabHandler,
  handleMoveFunds,
  pcBatchClearSelectionRef,
  handleToggleFavoriteRow,
  handleHoldingAmountClickRow,
  handleHoldingProfitClickRow,
  triggerCustomSettingsSync,
  fundDetailDialogCloseRef,
  maskAmounts,
  getFundCardPropsForRow,
  openFundTagsEdit,
  fundExtraDataByCode,
  fundDetailDrawerCloseRef,
  mobileBatchClearSelectionRef,
  handleFundCardDrawerOpenChange,
  handleMobileSettingModalOpenChange,
  displayFunds,
  linkedHoldingsForAllFav,
  todayStr,
  dcaPlansForTab,
  holdingsForTabWithLinked,
  percentModes,
  todayPercentModes,
  currentFundDailyEarnings,
  valuationSeries,
  collapsedCodes,
  collapsedTrends,
  collapsedValuationTrends,
  collapsedEarnings,
  transactionsForTab,
  theme,
  isTradingDay,
  getHoldingProfitForTab,
  toggleFavorite,
  openHoldingModal,
  openActionModal,
  openDataSourceModal,
  togglePercentMode,
  toggleTodayPercentMode,
  toggleCollapse,
  toggleTrendCollapse,
  toggleValuationTrendCollapse,
  toggleEarningsCollapse,
  fundTagListsByCode,
  groupTotalHoldingAmount
}) {
  const isMobile = useIsMobile();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewMode + (isMobile ? '-mobile' : '-pc')}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className={viewMode === 'card' ? 'grid' : 'table-container glass'}
        style={{ marginTop: isGroupSummarySticky ? 50 : 0 }}
      >
        <div
          className={viewMode === 'card' ? 'grid col-12' : ''}
          style={viewMode === 'card' ? { gridColumn: 'span 12', gap: 16 } : {}}
        >
          {/* PC 列表：使用 PcFundTable + 右侧冻结操作列 */}
          {viewMode === 'list' && !isMobile && (
            <PcFundTable
              stickyTop={navbarHeight + filterBarHeight}
              data={pcFundTableData}
              relatedSectorSessionKey={userId ?? ''}
              currentTab={currentTab}
              groups={groups}
              favorites={favorites}
              sortBy={sortBy}
              sortOrder={sortOrder}
              sortRules={sortRules}
              onSortChange={(id) => {
                startTransition(() => {
                  if (sortBy === id) {
                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortBy(id);
                    setSortOrder('desc');
                  }
                });
              }}
              onReorder={handleReorder}
              onRemoveFund={handleRemoveFundEntry}
              onRemoveFunds={removeFundsFromCurrentTabHandler}
              onMoveFunds={handleMoveFunds}
              batchSelectionClearRef={pcBatchClearSelectionRef}
              onToggleFavorite={handleToggleFavoriteRow}
              onHoldingAmountClick={handleHoldingAmountClickRow}
              onHoldingProfitClick={handleHoldingProfitClickRow}
              onCustomSettingsChange={triggerCustomSettingsSync}
              closeDialogRef={fundDetailDialogCloseRef}
              masked={maskAmounts}
              getFundCardProps={getFundCardPropsForRow}
              onFundTagsClick={openFundTagsEdit}
              fundExtraDataByCode={fundExtraDataByCode}
            />
          )}

          {/* 移动端列表：使用 MobileFundTable */}
          {viewMode === 'list' && isMobile && (
            <MobileFundTable
              data={pcFundTableData}
              relatedSectorSessionKey={userId ?? ''}
              currentTab={currentTab}
              groups={groups}
              onMoveFunds={handleMoveFunds}
              favorites={favorites}
              sortBy={sortBy}
              sortOrder={sortOrder}
              sortRules={sortRules}
              onSortChange={(id) => {
                startTransition(() => {
                  if (sortBy === id) {
                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortBy(id);
                    setSortOrder('desc');
                  }
                });
              }}
              stickyTop={navbarHeight + filterBarHeight}
              closeDrawerRef={fundDetailDrawerCloseRef}
              onReorder={handleReorder}
              onRemoveFund={handleRemoveFundEntry}
              onRemoveFunds={removeFundsFromCurrentTabHandler}
              onToggleFavorite={handleToggleFavoriteRow}
              onHoldingAmountClick={handleHoldingAmountClickRow}
              onHoldingProfitClick={handleHoldingProfitClickRow}
              batchSelectionClearRef={mobileBatchClearSelectionRef}
              onCustomSettingsChange={triggerCustomSettingsSync}
              onFundCardDrawerOpenChange={handleFundCardDrawerOpenChange}
              onMobileSettingModalOpenChange={handleMobileSettingModalOpenChange}
              getFundCardProps={getFundCardPropsForRow}
              masked={maskAmounts}
              onFundTagsClick={openFundTagsEdit}
              fundExtraDataByCode={fundExtraDataByCode}
            />
          )}

          {/* 卡片视图：使用 FundCard */}
          <AnimatePresence mode="popLayout">
            {viewMode === 'card' &&
              displayFunds.map((f) => (
                <motion.div
                  layout="position"
                  key={f.code}
                  className="col-6"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  style={{ position: 'relative', overflow: 'hidden' }}
                >
                  <FundCard
                    fundCode={f.code}
                    isHoldingLinked={
                      (currentTab === 'all' || currentTab === 'fav') && linkedHoldingsForAllFav.linked?.has?.(f?.code)
                    }
                    todayStr={todayStr}
                    currentTab={currentTab}
                    favorites={favorites}
                    dcaPlans={dcaPlansForTab}
                    holdings={holdingsForTabWithLinked}
                    percentModes={percentModes}
                    todayPercentModes={todayPercentModes}
                    fundDailyEarnings={currentFundDailyEarnings}
                    valuationSeries={valuationSeries}
                    collapsedCodes={collapsedCodes}
                    collapsedTrends={collapsedTrends}
                    collapsedValuationTrends={collapsedValuationTrends}
                    collapsedEarnings={collapsedEarnings}
                    transactions={transactionsForTab}
                    theme={theme}
                    isTradingDay={isTradingDay}
                    getHoldingProfit={getHoldingProfitForTab}
                    onToggleFavorite={toggleFavorite}
                    onRemoveFund={handleRemoveFundEntry}
                    onHoldingClick={openHoldingModal}
                    onActionClick={openActionModal}
                    onDataSourceClick={openDataSourceModal}
                    onPercentModeToggle={togglePercentMode}
                    onTodayPercentModeToggle={toggleTodayPercentMode}
                    onToggleCollapse={toggleCollapse}
                    onToggleTrendCollapse={toggleTrendCollapse}
                    onToggleValuationTrendCollapse={toggleValuationTrendCollapse}
                    onToggleEarningsCollapse={toggleEarningsCollapse}
                    masked={maskAmounts}
                    fundTags={isArray(fundTagListsByCode[f.code]) ? fundTagListsByCode[f.code] : []}
                    onFundTagsClick={openFundTagsEdit}
                    fundExtraData={fundExtraDataByCode[f.code]}
                    groupTotalHoldingAmount={groupTotalHoldingAmount}
                    hasDca={f.hasDca}
                    hasPending={f.hasPending}
                    userId={userId}
                  />
                </motion.div>
              ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

export default FundListView;
