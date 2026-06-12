import { useCallback, useRef } from 'react';
import { isArray, isNumber, isString } from 'lodash';
import { useStorageStore } from '../stores';
import { useTradingDay } from './useTradingDay';
import { formatDate, toTz, isNavUpdated } from '../lib/fundHelpers';

/**
 * 基金持仓与当日/累计收益计算逻辑自定义 Hook
 * @param {object} deps
 * @param {string | null} deps.activeGroupId - 当前活跃分组 ID
 */
export function useHoldingProfit({ activeGroupId } = {}) {
  const { isTradingDay } = useTradingDay();
  const todayStr = formatDate();
  const cacheRef = useRef(new Map());

  const getHoldingProfit = useCallback(
    (fund, holding, scopeGroupIdOverride) => {
      if (!holding || !isNumber(holding.share)) return null;

      const txScope = scopeGroupIdOverride !== undefined ? scopeGroupIdOverride : activeGroupId;

      const hasExactTodayData = isString(fund.jzrq) && fund.jzrq === todayStr;
      const hasTodayData = isNavUpdated(fund.jzrq, todayStr, fund.confirmDays);
      const hasTodayValuation = isString(fund.gztime) && fund.gztime.startsWith(todayStr);
      const canCalcTodayProfit = hasTodayData || hasTodayValuation;

      // 分红与基本份额相关的计算缓存
      const currentStore = useStorageStore.getState();
      const cachedDivs = currentStore.fundDividends?.[fund.code]?.list;
      const txs = currentStore.transactions?.[fund.code] || [];

      const cacheKey = `${fund.code}_${txScope}`;
      const cached = cacheRef.current.get(cacheKey);
      const isCacheValid =
        cached &&
        cached.txsRef === txs &&
        cached.cachedDivsRef === cachedDivs &&
        cached.share === holding.share &&
        cached.firstPurchaseDate === holding.firstPurchaseDate &&
        cached.dividendMethod === holding.dividendMethod &&
        cached.txScope === txScope &&
        cached.todayStr === todayStr &&
        cached.canCalcTodayProfit === canCalcTodayProfit;

      let extraShares = 0;
      let dividendCash = 0;
      let shareForTodayProfit = holding.share;

      if (isCacheValid) {
        extraShares = cached.extraShares;
        dividendCash = cached.dividendCash;
        shareForTodayProfit = cached.shareForTodayProfit;
      } else {
        // 1. 计算分红逻辑
        if (cachedDivs && isArray(cachedDivs)) {
          let earliestDate = holding.firstPurchaseDate;
          if (!earliestDate) {
            for (const tx of txs) {
              if (tx.type !== 'buy' || !tx.date) continue;
              const gid = tx.groupId || null;
              if (
                txScope !== undefined ? (txScope ? gid !== txScope : gid) : activeGroupId ? gid !== activeGroupId : gid
              )
                continue;
              if (!earliestDate || tx.date < earliestDate) earliestDate = tx.date;
            }
          }

          if (earliestDate) {
            const getShareAtDate = (date) => {
              let s = 0;
              let hasTx = false;
              for (const tx of txs) {
                const gid = tx.groupId || null;
                if (
                  txScope !== undefined
                    ? txScope
                      ? gid !== txScope
                      : gid
                    : activeGroupId
                      ? gid !== activeGroupId
                      : gid
                )
                  continue;
                if (tx.isHistoryOnly) continue;
                if (tx.date <= date) {
                  hasTx = true;
                  if (tx.type === 'buy') s += Number(tx.share) || 0;
                  if (tx.type === 'sell') s -= Number(tx.share) || 0;
                }
              }
              if (hasTx) return Math.max(0, s);
              if (date >= earliestDate) return holding.share;
              return 0;
            };

            const sortedDivs = [...cachedDivs].sort((a, b) => a.date.localeCompare(b.date));
            for (const div of sortedDivs) {
              if (div.date < earliestDate) continue;
              if (div.date > todayStr) continue;
              const baseShare = getShareAtDate(div.date);
              if (baseShare > 0) {
                const actualShare = baseShare + extraShares;
                if (!holding.dividendMethod || holding.dividendMethod === 'reinvest') {
                  if (div.nav > 0) {
                    extraShares += (actualShare * div.dividend) / div.nav;
                  }
                } else {
                  // 现金分红 (cash)
                  dividendCash += actualShare * div.dividend;
                }
              }
            }
          }
        }

        // 2. 计算有效份额及当日收益口径份额
        let effectiveShare = holding.share;
        if (!holding.dividendMethod || holding.dividendMethod === 'reinvest') {
          effectiveShare += extraShares;
        }

        shareForTodayProfit = effectiveShare;

        if (canCalcTodayProfit) {
          let buyToday = 0;
          let sellToday = 0;
          const list = txs;
          for (const tx of list) {
            if (!tx || tx.date !== todayStr) continue;
            const gid = tx.groupId || null;
            if (txScope) {
              if (gid !== txScope) continue;
            } else {
              if (gid) continue;
            }
            if (tx.isHistoryOnly) continue;
            const s = Number(tx.share);
            if (!Number.isFinite(s) || s <= 0) continue;
            if (tx.type === 'buy') buyToday += s;
            else if (tx.type === 'sell') sellToday += s;
          }
          shareForTodayProfit = Math.max(0, effectiveShare - buyToday + sellToday);
        }

        // 写入缓存
        cacheRef.current.set(cacheKey, {
          txsRef: txs,
          cachedDivsRef: cachedDivs,
          share: holding.share,
          firstPurchaseDate: holding.firstPurchaseDate,
          dividendMethod: holding.dividendMethod,
          txScope,
          todayStr,
          canCalcTodayProfit,
          extraShares,
          dividendCash,
          shareForTodayProfit
        });
      }

      let effectiveShare = holding.share;
      if (!holding.dividendMethod || holding.dividendMethod === 'reinvest') {
        effectiveShare += extraShares;
      }

      // QDII 等基金净值日期会延迟，isNavUpdated 可能把近几日净值视为已更新。
      // 当存在今天估值时，优先用今天估值计算当日收益，避免用延迟确认净值覆盖估算口径。
      const useValuation = hasTodayValuation && !hasExactTodayData ? true : isTradingDay && !hasTodayData;

      let currentNav;
      let profitToday;

      if (!useValuation) {
        // 使用确权净值 (dwjz)
        currentNav = Number(fund.dwjz);
        if (!currentNav) return null;

        if (canCalcTodayProfit) {
          const amount = shareForTodayProfit * currentNav;
          // 优先使用昨日净值直接计算（更精确，避免涨跌幅四舍五入误差）
          const lastNav = fund.lastNav != null && fund.lastNav !== '' ? Number(fund.lastNav) : null;
          if (lastNav && Number.isFinite(lastNav) && lastNav > 0) {
            profitToday = (currentNav - lastNav) * shareForTodayProfit;
          } else {
            const gz = isString(fund.gztime) ? toTz(fund.gztime) : null;
            const jz = isString(fund.jzrq) ? toTz(fund.jzrq) : null;
            const preferGszzl =
              !!gz && !!jz && gz.isValid() && jz.isValid() && gz.startOf('day').isAfter(jz.startOf('day'));

            let rate;
            if (preferGszzl) {
              rate = Number(fund.gszzl);
            } else {
              const zzl = fund.zzl !== undefined ? Number(fund.zzl) : Number.NaN;
              rate = Number.isFinite(zzl) ? zzl : Number(fund.gszzl);
            }
            if (!Number.isFinite(rate)) rate = 0;
            profitToday = amount - amount / (1 + rate / 100);
          }
        } else {
          profitToday = null;
        }
      } else {
        // 否则使用估值
        currentNav = isNumber(fund.gsz) ? fund.gsz : Number(fund.dwjz);

        if (!currentNav) return null;

        if (canCalcTodayProfit) {
          const amount = shareForTodayProfit * currentNav;
          // 估算涨幅
          const gzChange = Number(fund.gszzl) || 0;
          profitToday = amount - amount / (1 + gzChange / 100);
        } else {
          profitToday = null;
        }
      }

      // 持仓金额强制使用确权净值
      const exactNav = Number(fund.dwjz) || currentNav;
      const amount = effectiveShare * exactNav;

      // 总收益 = (确权净值 * 当前有效份额) - 成本总额 + 现金分红
      const profitTotal = isNumber(holding.cost)
        ? exactNav * effectiveShare - holding.cost * holding.share + dividendCash
        : null;

      return {
        amount,
        nav: exactNav,
        profitToday,
        profitTotal,
        principalToday: isNumber(holding.cost) ? holding.cost * shareForTodayProfit : 0
      };
    },
    [isTradingDay, todayStr, activeGroupId]
  );

  return { getHoldingProfit };
}
