'use client';

import { useMemo, useEffect } from 'react';
import { isPlainObject, isArray, isNumber } from 'lodash';
import { useStorageStore } from '../stores';
import { SUMMARY_TAB_ID, SUMMARY_SOURCE_GLOBAL, DAILY_EARNINGS_SCOPE_ALL } from '@/app/constants';
import { aggregatePortfolioDailyEarnings } from '../lib/dailyEarnings';

/**
 * 虚拟 Summary Tab 收益/汇总资产计算 Hook
 *
 * @param {object} deps
 * @param {string} deps.currentTab - 当前活跃 Tab ID
 * @param {Function} deps.setCurrentTab - 活跃 Tab 设置方法
 * @param {Function} deps.getHoldingProfit - 获取基金持仓收益的函数方法
 */
export function useSummaryCalculations({ currentTab, setCurrentTab, getHoldingProfit }) {
  const { funds, holdings, groupHoldings, groups, fundDailyEarnings } = useStorageStore();

  // 1. 过滤出当前含有持仓的自定义分组
  const groupsWithHoldings = useMemo(() => {
    const fundByCode = new Map((isArray(funds) ? funds : []).map((f) => [f.code, f]));
    return (groups || []).filter((g) => {
      if (!g?.id || !Array.isArray(g.codes)) return false;
      const bucket = groupHoldings[g.id] || {};
      return g.codes.some((code) => {
        const fund = fundByCode.get(code);
        const h = bucket[code];
        if (!fund || !h) return false;
        const p = getHoldingProfit(fund, h, g.id);
        return p && Number.isFinite(p.amount) && p.amount > 0;
      });
    });
  }, [groups, groupHoldings, funds, getHoldingProfit]);

  // 2. 计算「全部」全局 + 各自定义分组账本的累加数据
  const summaryTabPortfolioTotals = useMemo(() => {
    const fundByCode = new Map((isArray(funds) ? funds : []).map((f) => [f.code, f]));
    let totalAsset = 0;
    let totalProfitToday = 0;
    let totalHoldingReturn = 0;
    let totalCost = 0;
    let totalPrincipalToday = 0;
    let hasHolding = false;
    let hasAnyTodayData = false;

    const accumulate = (fund, holding, scopeGid) => {
      if (!fund || !holding) return;
      const p = getHoldingProfit(fund, holding, scopeGid);
      if (!p || !Number.isFinite(p.amount) || p.amount <= 0) return;
      hasHolding = true;
      totalAsset += Math.round(p.amount * 100) / 100;
      if (p.profitToday != null) {
        totalProfitToday += p.profitToday;
        totalPrincipalToday += p.principalToday || 0;
        hasAnyTodayData = true;
      }
      if (p.profitTotal != null) {
        totalHoldingReturn += p.profitTotal;
        if (typeof holding.cost === 'number' && typeof holding.share === 'number') {
          totalCost += holding.cost * holding.share;
        }
      }
    };

    Object.entries(holdings || {}).forEach(([code, h]) => {
      accumulate(fundByCode.get(code), h, null);
    });
    (groups || []).forEach((g) => {
      if (!g?.id) return;
      const bucket = groupHoldings[g.id] || {};
      Object.entries(bucket).forEach(([code, h]) => {
        accumulate(fundByCode.get(code), h, g.id);
      });
    });

    const roundedTotalProfitToday = Math.round(totalProfitToday * 100) / 100;
    const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;
    const todayReturnRate = totalPrincipalToday > 0 ? (roundedTotalProfitToday / totalPrincipalToday) * 100 : 0;

    return {
      totalAsset,
      totalProfitToday: roundedTotalProfitToday,
      totalHoldingReturn,
      hasHolding,
      returnRate,
      todayReturnRate,
      hasAnyTodayData
    };
  }, [funds, holdings, groupHoldings, groups, getHoldingProfit]);

  // 3. 全局持仓在 Summary 中是否有持仓占比
  const hasGlobalPortfolioForSummary = useMemo(() => {
    const fundByCode = new Map((isArray(funds) ? funds : []).map((f) => [f.code, f]));
    return Object.entries(holdings || {}).some(([code, h]) => {
      const fund = fundByCode.get(code);
      if (!fund || !h) return false;
      const p = getHoldingProfit(fund, h, null);
      return p && Number.isFinite(p.amount) && p.amount > 0;
    });
  }, [funds, holdings, getHoldingProfit]);

  const showPortfolioSummaryTab = summaryTabPortfolioTotals.hasHolding;

  // 4. 多分组汇总持仓合并与最优数据选择
  const { summaryMergedHoldings, summaryHoldingSourceGroupByCode } = useMemo(() => {
    const fundByCode = new Map((isArray(funds) ? funds : []).map((f) => [f.code, f]));
    const merged = {};
    const sourceByCode = {};
    const codes = new Set();
    Object.entries(holdings || {}).forEach(([code, h]) => {
      const fund = fundByCode.get(code);
      if (!fund || !h) return;
      const p = getHoldingProfit(fund, h, null);
      if (p && Number.isFinite(p.amount) && p.amount > 0) codes.add(code);
    });
    for (const g of groupsWithHoldings) {
      for (const c of g.codes || []) codes.add(c);
    }
    for (const code of codes) {
      const fund = fundByCode.get(code);
      if (!fund) continue;
      let bestAmt = -Infinity;
      let bestH = null;
      let bestGid = null;
      const globalH = holdings[code];
      if (globalH) {
        const p = getHoldingProfit(fund, globalH, null);
        const amt = p?.amount;
        if (Number.isFinite(amt) && amt > bestAmt) {
          bestAmt = amt;
          bestH = globalH;
          bestGid = SUMMARY_SOURCE_GLOBAL;
        }
      }
      for (const g of groupsWithHoldings) {
        const h = groupHoldings[g.id]?.[code];
        if (!h) continue;
        const p = getHoldingProfit(fund, h, g.id);
        const amt = p?.amount;
        if (!Number.isFinite(amt)) continue;
        if (amt > bestAmt) {
          bestAmt = amt;
          bestH = h;
          bestGid = g.id;
        }
      }
      if (bestH != null && bestGid != null) {
        merged[code] = bestH;
        sourceByCode[code] = bestGid;
      }
    }
    return { summaryMergedHoldings: merged, summaryHoldingSourceGroupByCode: sourceByCode };
  }, [groupsWithHoldings, groupHoldings, funds, getHoldingProfit, holdings]);

  // 5. 自动跳转：当位于汇总且所有持仓都被清空时，跳回全部 Tab
  useEffect(() => {
    if (currentTab === SUMMARY_TAB_ID && !summaryTabPortfolioTotals.hasHolding) {
      setCurrentTab('all');
    }
  }, [currentTab, summaryTabPortfolioTotals.hasHolding, setCurrentTab]);

  // 6. 各分组详情卡片数据计算
  const summaryCardItems = useMemo(() => {
    if (currentTab !== SUMMARY_TAB_ID) return [];
    const items = [];

    if (hasGlobalPortfolioForSummary) {
      let totalAsset = 0;
      let totalHoldingReturn = 0;
      let totalCost = 0;
      let totalProfitToday = 0;
      let totalPrincipalToday = 0;
      let hasAnyTodayData = false;
      let upCount = 0;
      let downCount = 0;

      for (const fund of funds || []) {
        const holding = holdings[fund.code];
        if (!holding) continue;
        const profit = getHoldingProfit(fund, holding, null);
        if (!profit) continue;
        totalAsset += Math.round(profit.amount * 100) / 100;
        if (profit.profitToday != null) {
          totalProfitToday += profit.profitToday;
          totalPrincipalToday += profit.principalToday || 0;
          hasAnyTodayData = true;
        }
        if (profit.profitTotal !== null) {
          totalHoldingReturn += profit.profitTotal;
          if (typeof holding.cost === 'number' && typeof holding.share === 'number') {
            totalCost += holding.cost * holding.share;
          }
        }
        const ev = fund.noValuation ? null : isNumber(fund.gszzl) ? Number(fund.gszzl) : null;
        if (ev != null && Number.isFinite(ev)) {
          if (ev > 0) upCount += 1;
          else if (ev < 0) downCount += 1;
        }
      }

      const roundedToday = Math.round(totalProfitToday * 100) / 100;
      const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;
      const todayReturnRate = totalPrincipalToday > 0 ? (roundedToday / totalPrincipalToday) * 100 : 0;
      const scopeDaily = isPlainObject(fundDailyEarnings?.[DAILY_EARNINGS_SCOPE_ALL])
        ? fundDailyEarnings[DAILY_EARNINGS_SCOPE_ALL]
        : {};
      const dailySeries = aggregatePortfolioDailyEarnings(scopeDaily);
      let cum = 0;
      const sparkSeries = dailySeries.map((pt) => {
        cum += pt.earnings;
        return { date: pt.date, earnings: cum };
      });

      items.push({
        groupId: SUMMARY_SOURCE_GLOBAL,
        groupName: '全部',
        totalAsset,
        holdingReturn: totalHoldingReturn,
        holdingReturnPercent: returnRate,
        accountReturn: roundedToday,
        accountReturnPercent: todayReturnRate,
        hasAnyTodayData,
        upCount,
        downCount,
        sparkSeries
      });
    }

    items.push(
      ...groupsWithHoldings.map((g) => {
        const bucket = groupHoldings[g.id] || {};
        const groupFunds = (isArray(funds) ? funds : []).filter((f) => g.codes.includes(f.code));
        let totalAsset = 0;
        let totalHoldingReturn = 0;
        let totalCost = 0;
        let totalProfitToday = 0;
        let totalPrincipalToday = 0;
        let hasAnyTodayData = false;
        let upCount = 0;
        let downCount = 0;

        for (const fund of groupFunds) {
          const holding = bucket[fund.code];
          const profit = getHoldingProfit(fund, holding, g.id);
          if (profit) {
            totalAsset += Math.round(profit.amount * 100) / 100;
            if (profit.profitToday != null) {
              totalProfitToday += profit.profitToday;
              totalPrincipalToday += profit.principalToday || 0;
              hasAnyTodayData = true;
            }
            if (profit.profitTotal !== null) {
              totalHoldingReturn += profit.profitTotal;
              if (holding && typeof holding.cost === 'number' && typeof holding.share === 'number') {
                totalCost += holding.cost * holding.share;
              }
            }
          }
          const ev = fund.noValuation ? null : isNumber(fund.gszzl) ? Number(fund.gszzl) : null;
          if (ev != null && Number.isFinite(ev)) {
            if (ev > 0) upCount += 1;
            else if (ev < 0) downCount += 1;
          }
        }

        const roundedToday = Math.round(totalProfitToday * 100) / 100;
        const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;
        const todayReturnRate = totalPrincipalToday > 0 ? (roundedToday / totalPrincipalToday) * 100 : 0;

        const scopeDaily = isPlainObject(fundDailyEarnings?.[g.id]) ? fundDailyEarnings[g.id] : {};
        const dailySeries = aggregatePortfolioDailyEarnings(scopeDaily);
        let cum = 0;
        const sparkSeries = dailySeries.map((pt) => {
          cum += pt.earnings;
          return { date: pt.date, earnings: cum };
        });

        return {
          groupId: g.id,
          groupName: g.name || '分组',
          totalAsset,
          holdingReturn: totalHoldingReturn,
          holdingReturnPercent: returnRate,
          accountReturn: roundedToday,
          accountReturnPercent: todayReturnRate,
          hasAnyTodayData,
          upCount,
          downCount,
          sparkSeries
        };
      })
    );
    return items;
  }, [
    currentTab,
    groupsWithHoldings,
    funds,
    groupHoldings,
    holdings,
    getHoldingProfit,
    fundDailyEarnings,
    hasGlobalPortfolioForSummary
  ]);

  return {
    groupsWithHoldings,
    summaryTabPortfolioTotals,
    hasGlobalPortfolioForSummary,
    showPortfolioSummaryTab,
    summaryMergedHoldings,
    summaryHoldingSourceGroupByCode,
    summaryCardItems
  };
}
