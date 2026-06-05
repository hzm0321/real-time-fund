'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isArray, isNumber, isPlainObject, isString } from 'lodash';

import { useStorageStore, storageStore } from '../stores';
import { recordValuation, setValuationSeries as persistValuationSeries } from '../lib/valuationTimeseries';
import { DAILY_EARNINGS_SCOPE_ALL } from '@/app/constants';
import { asyncPool } from '../lib/asyncHelper';
import { fetchFundData, fetchNetValueRangeFromTrend, fetchFundDividends, fetchFundConfirmDays } from '../api/fund';
import { TZ } from '../lib/fundHelpers';
import { getQueryClient } from '../lib/get-query-client';

dayjs.extend(utc);
dayjs.extend(timezone);

const getAddBaseSnapshotFromFund = (fund) => {
  const dwjz = Number(fund?.dwjz);
  if (Number.isFinite(dwjz) && dwjz > 0) {
    return { nav: dwjz, date: fund?.jzrq || null };
  }
  const gsz = Number(fund?.gsz);
  if (Number.isFinite(gsz) && gsz > 0) {
    return { nav: gsz, date: fund?.gztime || fund?.time || null };
  }
  return { nav: null, date: null };
};

/**
 * 刷新管理 Hook：负责定时刷新、手动刷新、每日收益计算、估值时序记录
 *
 * @param {object} deps
 * @param {Function} deps.scheduleDcaTrades - 生成定投待处理交易
 * @param {Function} deps.processPendingQueue - 执行积压的待处理交易
 * @param {React.RefObject} deps.deviceConflictModalOpenRef - 设备冲突弹窗是否打开
 */
export function useRefreshManager({ scheduleDcaTrades, processPendingQueue, deviceConflictModalOpenRef }) {
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef(null);
  const refreshCycleStartRef = useRef(Date.now());
  const refreshingRef = useRef(false);
  const refreshCodesRef = useRef([]);

  const scheduleDcaTradesRef = useRef(scheduleDcaTrades);
  const processPendingQueueRef = useRef(processPendingQueue);

  useEffect(() => {
    scheduleDcaTradesRef.current = scheduleDcaTrades;
    processPendingQueueRef.current = processPendingQueue;
  }, [scheduleDcaTrades, processPendingQueue]);

  // 同步 funds → refreshCodesRef
  const funds = useStorageStore((s) => s.funds);
  useEffect(() => {
    refreshCodesRef.current = Array.from(new Set((isArray(funds) ? funds : []).map((f) => f.code))).filter(Boolean);
  }, [funds]);

  const refreshAll = useCallback(
    async (codes) => {
      const store = useStorageStore.getState();

      // 如果弹窗拦截同步中，则不允许执行数据刷新，但保持心跳循环
      if (deviceConflictModalOpenRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const nextCodes = refreshCodesRef.current || [];
          if (nextCodes.length) refreshAll(nextCodes);
        }, store.refreshMs);
        return;
      }

      // 重入锁检查
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);

      const uniqueCodes = Array.from(new Set(codes));

      const fundCodeStillInStorage = (code) => {
        if (!code) return false;
        try {
          const currentFunds = storageStore.getItem('funds', []);
          return currentFunds.some((f) => f.code === code);
        } catch (e) {
          return false;
        }
      };

      const getStoredFundSnapshot = (code) => {
        if (!code) return null;
        try {
          const currentFunds = storageStore.getItem('funds', []);
          return currentFunds.find((f) => f.code === code) || null;
        } catch (e) {
          return null;
        }
      };

      try {
        const updated = [];
        const dailyChanges = {};
        let earningsChanged = false;

        const isValidDateStr = (s) => isString(s) && /^\d{4}-\d{2}-\d{2}$/.test(s);
        const addDays = (dateStr, days) => dayjs.tz(dateStr, TZ).add(days, 'day').format('YYYY-MM-DD');
        const subDays = (dateStr, days) => dayjs.tz(dateStr, TZ).subtract(days, 'day').format('YYYY-MM-DD');
        const calcEarningsFromNavs = (nav, prevNav, share) => (nav - prevNav) * share;
        const calcRateFromEarnings = (earnings, baseCostAmount) => {
          if (!Number.isFinite(earnings) || !Number.isFinite(baseCostAmount) || baseCostAmount <= 0) return null;
          return (earnings / baseCostAmount) * 100;
        };

        const calcLatestDayFromFund = (u, share, baseCostAmount) => {
          const nav = Number(u?.dwjz);
          if (!Number.isFinite(nav) || nav <= 0) return null;
          const lastNav = u?.lastNav != null && u.lastNav !== '' ? Number(u.lastNav) : null;
          if (lastNav != null && Number.isFinite(lastNav) && lastNav > 0) {
            const earnings = calcEarningsFromNavs(nav, lastNav, share);
            return { earnings, rate: calcRateFromEarnings(earnings, baseCostAmount) };
          }
          const zzl = u?.zzl != null && u.zzl !== '' ? Number(u.zzl) : Number.NaN;
          if (Number.isFinite(zzl)) {
            const prev = nav / (1 + zzl / 100);
            if (Number.isFinite(prev) && prev > 0) {
              const earnings = calcEarningsFromNavs(nav, prev, share);
              return { earnings, rate: calcRateFromEarnings(earnings, baseCostAmount) };
            }
          }
          return null;
        };

        const findPrevTradingNav = async (code, dateStr, navCache, u) => {
          if (u && isValidDateStr(u.jzrq) && u.jzrq === dateStr) {
            const lastNav = u?.lastNav != null && u.lastNav !== '' ? Number(u.lastNav) : null;
            if (lastNav != null && Number.isFinite(lastNav) && lastNav > 0) return lastNav;
          }
          if (navCache && navCache.size) {
            let bestD = '';
            let bestNav = null;
            for (const d of navCache.keys()) {
              if (!isValidDateStr(d) || d >= dateStr) continue;
              const v = navCache.get(d);
              if (!Number.isFinite(v) || v <= 0) continue;
              if (!bestD || d > bestD) {
                bestD = d;
                bestNav = v;
              }
            }
            if (bestNav != null) return bestNav;
          }
          const end = subDays(dateStr, 1);
          const start = subDays(dateStr, 120);
          const rows = await fetchNetValueRangeFromTrend(code, start, end);
          for (const r of rows) {
            if (navCache) navCache.set(r.date, r.nav);
          }
          for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i].date < dateStr) {
              const v = rows[i].nav;
              if (Number.isFinite(v) && v > 0) return v;
            }
          }
          return null;
        };

        const localRecordToChanges = (scope, code, earnings, dateStr, rate, baseCostAmount, force = false) => {
          const currentStore = useStorageStore.getState();
          if (!dailyChanges[scope]) dailyChanges[scope] = {};
          const list =
            dailyChanges[scope][code] ||
            (currentStore.fundDailyEarnings[scope] && isArray(currentStore.fundDailyEarnings[scope][code])
              ? currentStore.fundDailyEarnings[scope][code]
              : []);
          const existingIndex = list.findIndex((item) => item.date === dateStr);
          const normalizedRate = isNumber(rate) && Number.isFinite(rate) ? rate : null;
          const normalizedBaseCostAmount =
            Number.isFinite(Number(baseCostAmount)) && Number(baseCostAmount) > 0 ? Number(baseCostAmount) : null;
          const nextList =
            existingIndex >= 0
              ? list.map((item, i) => {
                  if (i !== existingIndex) return item;
                  const prevRate = Number(item?.rate);
                  const prevBaseCostAmount = Number(item?.baseCostAmount);
                  const shouldUpdateRate = force || !Number.isFinite(prevRate);
                  const shouldUpdateBase = force || !(Number.isFinite(prevBaseCostAmount) && prevBaseCostAmount > 0);
                  return {
                    date: dateStr,
                    earnings,
                    rate: shouldUpdateRate ? normalizedRate : prevRate,
                    baseCostAmount: shouldUpdateBase ? normalizedBaseCostAmount : prevBaseCostAmount
                  };
                })
              : [...list, { date: dateStr, earnings, rate: normalizedRate, baseCostAmount: normalizedBaseCostAmount }];
          nextList.sort((a, b) => a.date.localeCompare(b.date));
          dailyChanges[scope][code] = nextList;
          earningsChanged = true;
        };

        const currentValuationSeries = useStorageStore.getState().valuationSeries;
        const nextValuationSeries = { ...currentValuationSeries };
        let valuationChanged = false;

        const currentFundDividends = useStorageStore.getState().fundDividends || {};
        const nextFundDividends = { ...currentFundDividends };
        let dividendsChanged = false;

        await asyncPool(3, uniqueCodes, async (c) => {
          if (!fundCodeStillInStorage(c)) return;
          let data = null;
          try {
            data = await fetchFundData(c);
          } catch (e) {
            console.error(`刷新基金 ${c} 失败`, e);
            if (fundCodeStillInStorage(c)) {
              try {
                const arr = storageStore.getItem('funds', []);
                data = arr.find((f) => f.code === c);
              } catch {}
            }
          }

          if (!data || !fundCodeStillInStorage(c)) return;

          const oldData = getStoredFundSnapshot(c);
          const hasValidGsz = (row) => row?.gsz != null && row?.gsz !== '' && Number.isFinite(Number(row?.gsz));
          if (oldData && !hasValidGsz(data) && hasValidGsz(oldData)) {
            data.gsz = oldData.gsz;
            data.gszzl = oldData.gszzl;
            data.gztime = oldData.gztime;
            if (oldData.valuationSource) data.valuationSource = oldData.valuationSource;
            data.noValuation = false;
          }

          updated.push(data);

          // 按需获取基金确认天数（仅在 localStorage 中无缓存时请求）
          try {
            const storedForConfirm = getStoredFundSnapshot(data.code);
            if (storedForConfirm?.confirmDays == null) {
              const days = await fetchFundConfirmDays(data.code);
              if (days != null) data.confirmDays = days;
            }
          } catch (e) {
            // 获取确认天数失败不影响主流程
          }

          // 估值时序记录
          const storedFund = getStoredFundSnapshot(data.code);
          const fundDs = storedFund?.dataSource || 1;
          if (data.code != null && !data.noValuation && Number.isFinite(Number(data.gsz))) {
            if (data.fundValuationTimeseries && isPlainObject(data.fundValuationTimeseries)) {
              for (const [tsCode, tsList] of Object.entries(data.fundValuationTimeseries)) {
                if (isArray(tsList) && tsList.length > 0) {
                  persistValuationSeries(tsCode, fundDs, tsList);
                  nextValuationSeries[tsCode] = tsList;
                  valuationChanged = true;
                }
              }
            } else {
              const recorded = recordValuation(data.code, { gsz: data.gsz, gztime: data.gztime }, fundDs);
              if (recorded) {
                nextValuationSeries[data.code] = recorded;
                valuationChanged = true;
              }
            }
          }

          // 收益补齐逻辑
          try {
            const currentStore = useStorageStore.getState();
            const targetScopes = [];
            if (
              currentStore.holdings[data.code] &&
              isNumber(currentStore.holdings[data.code].share) &&
              currentStore.holdings[data.code].share > 0
            ) {
              targetScopes.push(DAILY_EARNINGS_SCOPE_ALL);
            }
            Object.keys(currentStore.groupHoldings || {}).forEach((gid) => {
              if (
                currentStore.groupHoldings[gid]?.[data.code] &&
                isNumber(currentStore.groupHoldings[gid][data.code].share) &&
                currentStore.groupHoldings[gid][data.code].share > 0
              ) {
                targetScopes.push(gid);
              }
            });

            if (targetScopes.length === 0) return;

            // ----- 获取并缓存分红数据 -----
            let earliestDate = null;
            if (currentStore.holdings[data.code]?.firstPurchaseDate) {
              earliestDate = currentStore.holdings[data.code].firstPurchaseDate;
            }
            Object.values(currentStore.groupHoldings || {}).forEach((g) => {
              if (g[data.code]?.firstPurchaseDate) {
                if (!earliestDate || g[data.code].firstPurchaseDate < earliestDate)
                  earliestDate = g[data.code].firstPurchaseDate;
              }
            });
            const txs = currentStore.transactions[data.code] || [];
            for (const tx of txs) {
              if (tx.type === 'buy' && isValidDateStr(tx.date)) {
                if (!earliestDate || tx.date < earliestDate) earliestDate = tx.date;
              }
            }

            if (earliestDate) {
              const cached = currentFundDividends[data.code];
              const todayStr = dayjs().tz(TZ).format('YYYY-MM-DD');
              if (!cached || cached.lastFetchDate !== todayStr) {
                try {
                  const divs = await fetchFundDividends(data.code, earliestDate);
                  nextFundDividends[data.code] = { lastFetchDate: todayStr, list: divs };
                  dividendsChanged = true;
                } catch (e) {
                  console.error(`拉取 ${data.code} 历史分红失败`, e);
                }
              }
            }
            // ----- 分红数据获取完毕 -----

            const latestNavDate = data.jzrq;
            if (!isValidDateStr(latestNavDate)) return;

            const navCache = new Map();

            for (const scope of targetScopes) {
              const h =
                scope === DAILY_EARNINGS_SCOPE_ALL
                  ? currentStore.holdings[data.code]
                  : currentStore.groupHoldings[scope][data.code];
              const existing =
                dailyChanges[scope]?.[data.code] ||
                (currentStore.fundDailyEarnings[scope] && isArray(currentStore.fundDailyEarnings[scope][data.code])
                  ? currentStore.fundDailyEarnings[scope][data.code]
                  : []);
              const lastRecordedDate = existing.length ? existing[existing.length - 1]?.date : null;

              const getEffectiveShare = (targetDate) => {
                let baseShare = h.share;
                const list = currentStore.transactions[data.code] || [];
                for (const tx of list) {
                  if (!tx || !tx.date || tx.date < targetDate) continue;
                  const gid = tx.groupId || null;
                  const txInScope = scope === DAILY_EARNINGS_SCOPE_ALL ? !gid : gid === scope;
                  if (!txInScope) continue;
                  if (tx.isHistoryOnly) continue;
                  const s = Number(tx.share) || 0;
                  if (tx.type === 'buy') baseShare -= s;
                  else if (tx.type === 'sell') baseShare += s;
                }
                return Math.max(0, baseShare);
              };

              if (!existing.length) {
                const share = getEffectiveShare(latestNavDate);
                const unitCost = Number(h?.cost);
                const baseCostAmount = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * share : null;
                if (share > 0) {
                  const v = calcLatestDayFromFund(data, share, baseCostAmount);
                  if (v && Number.isFinite(v.earnings) && fundCodeStillInStorage(data.code)) {
                    localRecordToChanges(scope, data.code, v.earnings, latestNavDate, v.rate, baseCostAmount, true);
                  }
                }
                if (!(dailyChanges[scope] && dailyChanges[scope][data.code])) {
                  try {
                    const nav = Number(data.dwjz);
                    if (Number.isFinite(nav) && nav > 0) {
                      navCache.set(latestNavDate, nav);
                      const prevNav = await findPrevTradingNav(data.code, latestNavDate, navCache, data);
                      const share = getEffectiveShare(latestNavDate);
                      if (fundCodeStillInStorage(data.code) && Number.isFinite(prevNav) && prevNav > 0 && share > 0) {
                        const earnings = calcEarningsFromNavs(nav, prevNav, share);
                        const unitCost = Number(h?.cost);
                        const baseCostAmount = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * share : null;
                        const rate = calcRateFromEarnings(earnings, baseCostAmount);
                        if (Number.isFinite(earnings)) {
                          localRecordToChanges(scope, data.code, earnings, latestNavDate, rate, baseCostAmount, true);
                        }
                      }
                    }
                  } catch {}
                }
              } else if (isValidDateStr(lastRecordedDate) && lastRecordedDate < latestNavDate) {
                const latestNav = Number(data.dwjz);
                if (Number.isFinite(latestNav) && latestNav > 0) navCache.set(latestNavDate, latestNav);

                const start = addDays(lastRecordedDate, 1);
                const navRows = await fetchNetValueRangeFromTrend(data.code, lastRecordedDate, latestNavDate);
                if (Number.isFinite(latestNav) && latestNav > 0 && !navRows.some((r) => r.date === latestNavDate)) {
                  navRows.push({ date: latestNavDate, nav: latestNav });
                  navRows.sort((a, b) => a.date.localeCompare(b.date));
                }
                if (fundCodeStillInStorage(data.code)) {
                  for (const r of navRows) navCache.set(r.date, r.nav);
                  const firstIdx = navRows.findIndex((r) => r.date >= start);
                  if (firstIdx !== -1) {
                    for (let j = firstIdx; j < navRows.length; j++) {
                      const prevNav =
                        j > 0
                          ? navRows[j - 1].nav
                          : await findPrevTradingNav(data.code, navRows[j].date, navCache, data);
                      if (!fundCodeStillInStorage(data.code)) break;
                      if (!Number.isFinite(prevNav) || prevNav <= 0) continue;
                      const nav = navRows[j].nav;
                      const cursor = navRows[j].date;
                      if (!Number.isFinite(nav) || nav <= 0) continue;
                      const share = getEffectiveShare(cursor);
                      if (share <= 0) continue;
                      const earnings = calcEarningsFromNavs(nav, prevNav, share);
                      const unitCost = Number(h?.cost);
                      const baseCostAmount = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * share : null;
                      const rate = calcRateFromEarnings(earnings, baseCostAmount);
                      if (Number.isFinite(earnings)) {
                        localRecordToChanges(scope, data.code, earnings, cursor, rate, baseCostAmount, true);
                      }
                    }
                  }
                }
              } else if (isValidDateStr(lastRecordedDate) && lastRecordedDate === latestNavDate) {
                const share = getEffectiveShare(latestNavDate);
                const unitCost = Number(h?.cost);
                const baseCostAmount = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * share : null;
                if (share > 0) {
                  const v = calcLatestDayFromFund(data, share, baseCostAmount);
                  if (v && Number.isFinite(v.earnings) && fundCodeStillInStorage(data.code)) {
                    localRecordToChanges(scope, data.code, v.earnings, latestNavDate, v.rate, baseCostAmount, true);
                  }
                }
              }
            }
          } catch (e) {
            console.warn(`记录 ${data.code} 每日收益失败`, e);
          }
        });

        // UI 与存储同步
        if (updated.length > 0) {
          useStorageStore.getState().setFunds((prev) => {
            const updatedMap = new Map(updated.map((x) => [x.code, x]));
            let changed = false;
            const next = prev.map((f) => {
              const u = updatedMap.get(f.code);
              if (!u) return f;
              changed = true;
              const merged = { ...u };
              if (f.addedAt != null) merged.addedAt = f.addedAt;
              if (f.addBaseNav != null) merged.addBaseNav = f.addBaseNav;
              if (f.addBaseDate != null) merged.addBaseDate = f.addBaseDate;
              if (f.dataSource != null) merged.dataSource = f.dataSource;
              if (f.showImageChart !== undefined) merged.showImageChart = f.showImageChart;
              if (f.confirmDays != null) merged.confirmDays = f.confirmDays;
              if (merged.addedAt == null || merged.addBaseNav == null || merged.addBaseDate == null) {
                const snap = getAddBaseSnapshotFromFund(merged);
                if (merged.addedAt == null) merged.addedAt = Date.now();
                if (merged.addBaseNav == null && snap.nav != null) merged.addBaseNav = snap.nav;
                if (merged.addBaseDate == null && snap.date) merged.addBaseDate = snap.date;
              }
              return merged;
            });
            return changed ? next : prev;
          });
          if (valuationChanged) {
            useStorageStore.getState().setValuationSeries((prev) => {
              const next = { ...prev };
              Object.entries(nextValuationSeries).forEach(([code, list]) => {
                next[code] = list;
              });
              return next;
            });
          }
        }

        if (earningsChanged) {
          useStorageStore.getState().setFundDailyEarnings((prev) => {
            const next = { ...prev };
            for (const [scope, bucket] of Object.entries(dailyChanges)) {
              next[scope] = { ...next[scope], ...bucket };
            }
            return next;
          });
        }

        if (dividendsChanged) {
          useStorageStore.getState().setFundDividends((prev) => {
            const next = { ...prev };
            for (const [code, entry] of Object.entries(nextFundDividends)) {
              next[code] = entry;
            }
            return next;
          });
        }
      } catch (e) {
        console.error('刷新过程出错', e);
      } finally {
        const currentRefreshMs = useStorageStore.getState().refreshMs;
        refreshingRef.current = false;
        setRefreshing(false);
        refreshCycleStartRef.current = Date.now();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const codes = refreshCodesRef.current || [];
          if (codes.length) refreshAll(codes);
        }, currentRefreshMs);

        try {
          if (scheduleDcaTradesRef.current) await scheduleDcaTradesRef.current();
        } catch (e) {
          console.warn('生成定投待处理交易出错', e);
        }

        try {
          if (processPendingQueueRef.current) await processPendingQueueRef.current();
        } catch (e) {
          console.warn('待交易处理出错', e);
        }

        try {
          const qc = getQueryClient();
          qc.refetchQueries({ queryKey: ['hotSectors'], type: 'active', stale: true });
          qc.refetchQueries({ queryKey: ['valuationRanking'], type: 'active', stale: true });
        } catch (e) {
          console.warn('刷新行情数据出错', e);
        }
      }
    },
    [deviceConflictModalOpenRef]
  );

  const manualRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    const currentFunds = useStorageStore.getState().funds;
    const codes = Array.from(new Set((isArray(currentFunds) ? currentFunds : []).map((f) => f.code)));
    if (!codes.length) return;
    await refreshAll(codes);
  }, [refreshAll]);

  // 定时刷新 effect
  const refreshMs = useStorageStore((s) => s.refreshMs);
  useEffect(() => {
    refreshCycleStartRef.current = Date.now();

    const tick = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const codes = refreshCodesRef.current || [];
        if (codes.length) {
          refreshAll(codes);
        } else {
          tick();
        }
      }, refreshMs);
    };

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refreshMs, refreshAll]);

  return { refreshing, refreshCycleStartRef, manualRefresh, refreshAll };
}
