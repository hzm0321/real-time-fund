'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { isNumber, isString, isPlainObject, isNil, isArray } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import {
  useStorageStore,
  storageStore,
  useUserStore,
  useModalStore,
  getFundCodesSignature,
  SORT_DISPLAY_MODES
} from '../stores';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { withRetry } from '../lib/asyncHelper';
import { DAILY_EARNINGS_SCOPE_ALL, DCA_SCOPE_GLOBAL, DEFAULT_FUND_TAG_THEME } from '@/app/constants';
import { normalizeCode, cleanCodeArray, normalizeNumber, dedupeByCode } from '../lib/normalize';
import {
  hasOwn,
  stripLegacyTagsFromFundObject,
  getFundCodesFromTagRecord,
  sanitizeTagRowForStorage,
  seedGroupHoldingsFromGlobal,
  migrateDcaPlansToScoped,
  nowInTz,
  toTz
} from '../lib/fundHelpers';

export const normalizeFundDailyEarningsScoped = (source) => {
  if (!isPlainObject(source)) return {};
  const values = Object.values(source);
  const hasScoped = values.some((v) => isPlainObject(v));
  if (!hasScoped) {
    return { [DAILY_EARNINGS_SCOPE_ALL]: source };
  }
  return source;
};

const mergeValuationFieldsByGztime = (localFund, cloudFund) => {
  if (!isPlainObject(cloudFund)) return cloudFund;
  if (!isPlainObject(localFund)) return cloudFund;

  const localGzRaw = localFund.gztime;
  const cloudGzRaw = cloudFund.gztime;

  if (!isString(localGzRaw) || !isString(cloudGzRaw)) return cloudFund;

  const localGz = toTz(localGzRaw);
  const cloudGz = toTz(cloudGzRaw);
  if (!localGz?.isValid?.() || !cloudGz?.isValid?.()) return cloudFund;

  if (!localGz.isAfter(cloudGz)) return cloudFund;

  const patch = {};
  if (!isNil(localFund.gsz)) patch.gsz = localFund.gsz;
  if (!isNil(localFund.gszzl)) patch.gszzl = localFund.gszzl;
  if (!isNil(localFund.gztime)) patch.gztime = localFund.gztime;

  return { ...cloudFund, ...patch };
};

/**
 * 云端同步管理 Hook
 *
 * @param {object} deps
 * @param {Function} deps.showToast
 * @param {React.RefObject} deps.refreshAllRef - ref to refreshAll from useRefreshManager (avoids circular dependency)
 * @param {Function} deps.setTempSeconds - UI state setter
 * @param {Function} deps.setFundTagRecords - tag state setter
 */
export function useSyncManager({ showToast, refreshAllRef, setTempSeconds, setFundTagRecords }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const deviceIdRef = useRef('');

  const syncDebounceRef = useRef(null);
  const lastSyncedRef = useRef('');
  const skipSyncRef = useRef(isSupabaseConfigured);
  const userIdRef = useRef(null);
  const deviceConflictModalOpenRef = useRef(false);
  const dirtyKeysRef = useRef(new Set());
  const syncUserConfigRef = useRef(null);

  // deviceId init
  useEffect(() => {
    try {
      const key = 'rtfDeviceId';
      let id = storageStore.getItem(key);
      if (!id) {
        id = uuidv4();
        storageStore.setItem(key, id);
      }
      deviceIdRef.current = id;
    } catch {
      deviceIdRef.current = uuidv4();
    }
  }, []);

  // lastSyncTime init
  useEffect(() => {
    const stored = storageStore.getItem('localUpdatedAt');
    if (stored) {
      setLastSyncTime(stored);
    } else {
      setLastSyncTime(null);
    }
  }, []);

  // user → userIdRef
  const user = useUserStore((s) => s.user);
  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user]);

  // deviceConflictModalOpenRef sync
  useEffect(() => {
    const unsub = useModalStore.subscribe(
      (s) => s.deviceConflictModal.open,
      (open) => {
        deviceConflictModalOpenRef.current = open;
      }
    );
    deviceConflictModalOpenRef.current = useModalStore.getState().deviceConflictModal.open;
    return unsub;
  }, []);

  // --- getComparablePayload ---
  function getComparablePayload(payload) {
    if (!isPlainObject(payload)) return '';
    const rawFunds = Array.isArray(payload.funds) ? payload.funds : [];
    const fundCodes = rawFunds.map((fund) => normalizeCode(fund?.code || fund?.CODE)).filter(Boolean);
    const uniqueFundCodes = Array.from(new Set(fundCodes)).sort();

    const favorites = Array.isArray(payload.favorites)
      ? Array.from(
          new Set(payload.favorites.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))
        ).sort()
      : [];

    const collapsedCodes = Array.isArray(payload.collapsedCodes)
      ? Array.from(
          new Set(payload.collapsedCodes.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))
        ).sort()
      : [];

    const collapsedTrends = Array.isArray(payload.collapsedTrends)
      ? Array.from(
          new Set(payload.collapsedTrends.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))
        ).sort()
      : [];

    const collapsedEarnings = Array.isArray(payload.collapsedEarnings)
      ? Array.from(
          new Set(payload.collapsedEarnings.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))
        ).sort()
      : [];

    const groups = Array.isArray(payload.groups)
      ? payload.groups
          .map((group) => {
            const id = normalizeCode(group?.id);
            if (!id) return null;
            const name = isString(group?.name) ? group.name : '';
            const codes = Array.isArray(group?.codes)
              ? Array.from(
                  new Set(group.codes.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))
                ).sort()
              : [];
            return { id, name, codes };
          })
          .filter(Boolean)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];

    const validGroupIds = new Set(groups.map((g) => g.id));

    const holdingsSource = isPlainObject(payload.holdings) ? payload.holdings : {};
    const holdings = {};
    Object.keys(holdingsSource)
      .map(normalizeCode)
      .filter((code) => uniqueFundCodes.includes(code))
      .sort()
      .forEach((code) => {
        const value = holdingsSource[code] || {};
        const share = normalizeNumber(value.share);
        const cost = normalizeNumber(value.cost);
        if (share === null && cost === null) return;
        holdings[code] = { share, cost };
      });

    const ghSource = isPlainObject(payload.groupHoldings) ? payload.groupHoldings : {};
    const groupHoldingsNorm = {};
    Object.keys(ghSource)
      .map(normalizeCode)
      .filter((gid) => validGroupIds.has(gid))
      .sort()
      .forEach((gid) => {
        const bucket = ghSource[gid] || {};
        const inner = {};
        Object.keys(bucket)
          .map(normalizeCode)
          .filter((code) => uniqueFundCodes.includes(code))
          .sort()
          .forEach((code) => {
            const value = bucket[code] || {};
            const share = normalizeNumber(value.share);
            const cost = normalizeNumber(value.cost);
            if (share === null && cost === null) return;
            inner[code] = { share, cost };
          });
        if (Object.keys(inner).length) groupHoldingsNorm[gid] = inner;
      });

    const pendingTrades = Array.isArray(payload.pendingTrades)
      ? payload.pendingTrades
          .map((trade) => {
            const fundCode = normalizeCode(trade?.fundCode);
            if (!fundCode) return null;
            const row = {
              id: trade?.id ? String(trade.id) : '',
              fundCode,
              type: trade?.type || '',
              share: normalizeNumber(trade?.share),
              amount: normalizeNumber(trade?.amount),
              feeRate: normalizeNumber(trade?.feeRate),
              feeMode: trade?.feeMode || '',
              feeValue: normalizeNumber(trade?.feeValue),
              date: trade?.date || '',
              isAfter3pm: !!trade?.isAfter3pm,
              isDca: !!trade?.isDca
            };
            const g = trade?.groupId != null && trade.groupId !== '' ? normalizeCode(trade.groupId) : null;
            if (g) {
              if (!validGroupIds.has(g)) return null;
              row.groupId = g;
            }
            return row;
          })
          .filter((trade) => trade && uniqueFundCodes.includes(trade.fundCode))
          .sort((a, b) => {
            const gidA = a.groupId || '';
            const gidB = b.groupId || '';
            const keyA =
              a.id ||
              `${gidA}|${a.fundCode}|${a.type}|${a.date}|${a.share ?? ''}|${a.amount ?? ''}|${a.feeMode}|${a.feeValue ?? ''}|${a.feeRate ?? ''}|${a.isAfter3pm ? 1 : 0}|${a.isDca ? 1 : 0}`;
            const keyB =
              b.id ||
              `${gidB}|${b.fundCode}|${b.type}|${b.date}|${b.share ?? ''}|${b.amount ?? ''}|${b.feeMode}|${b.feeValue ?? ''}|${b.feeRate ?? ''}|${b.isAfter3pm ? 1 : 0}|${b.isDca ? 1 : 0}`;
            return keyA.localeCompare(keyB);
          })
      : [];

    const transactionsSource = isPlainObject(payload.transactions) ? payload.transactions : {};
    const transactions = {};
    Object.keys(transactionsSource)
      .map(normalizeCode)
      .filter((code) => uniqueFundCodes.includes(code))
      .sort()
      .forEach((code) => {
        const list = Array.isArray(transactionsSource[code]) ? transactionsSource[code] : [];
        const normalized = list
          .map((t) => {
            const id = t?.id ? String(t.id) : '';
            const type = t?.type || '';
            const share = normalizeNumber(t?.share);
            const amount = normalizeNumber(t?.amount);
            const price = normalizeNumber(t?.price);
            const date = t?.date || '';
            const timestamp = Number.isFinite(t?.timestamp) ? t.timestamp : 0;
            const isDca = !!t?.isDca;
            const isHistoryOnly = !!t?.isHistoryOnly;
            const row = { id, type, share, amount, price, date, timestamp, isDca, isHistoryOnly };
            const g = t?.groupId != null && t.groupId !== '' ? normalizeCode(t.groupId) : null;
            if (g) {
              if (!validGroupIds.has(g)) return null;
              row.groupId = g;
            }
            return row;
          })
          .filter((t) => t && (t.id || t.timestamp))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (normalized.length > 0) transactions[code] = normalized;
      });

    const dcaScoped = migrateDcaPlansToScoped(isPlainObject(payload.dcaPlans) ? payload.dcaPlans : {});
    const dcaPlans = {};
    Object.keys(dcaScoped)
      .sort()
      .forEach((scopeKeyRaw) => {
        const scopeKey = normalizeCode(scopeKeyRaw);
        if (scopeKey !== DCA_SCOPE_GLOBAL && !validGroupIds.has(scopeKey)) return;
        const bucket = dcaScoped[scopeKeyRaw];
        if (!isPlainObject(bucket)) return;
        const inner = {};
        Object.keys(bucket)
          .map(normalizeCode)
          .filter((code) => uniqueFundCodes.includes(code))
          .sort()
          .forEach((code) => {
            const plan = bucket[code] || {};
            const amount = normalizeNumber(plan.amount);
            const feeRate = normalizeNumber(plan.feeRate);
            const cycle = ['daily', 'weekly', 'biweekly', 'monthly'].includes(plan.cycle) ? plan.cycle : '';
            const firstDate = plan.firstDate ? String(plan.firstDate) : '';
            const enabled = !!plan.enabled;
            const weeklyDay = normalizeNumber(plan.weeklyDay);
            const monthlyDay = normalizeNumber(plan.monthlyDay);
            const lastDate = plan.lastDate ? String(plan.lastDate) : '';
            if (
              amount === null &&
              feeRate === null &&
              !cycle &&
              !firstDate &&
              !enabled &&
              weeklyDay === null &&
              monthlyDay === null &&
              !lastDate
            )
              return;
            inner[code] = {
              amount,
              feeRate,
              cycle,
              firstDate,
              enabled,
              weeklyDay: weeklyDay !== null ? weeklyDay : null,
              monthlyDay: monthlyDay !== null ? monthlyDay : null,
              lastDate
            };
          });
        if (Object.keys(inner).length) dcaPlans[scopeKey] = inner;
      });

    const customSettings = isPlainObject(payload.customSettings) ? payload.customSettings : {};
    const fundDailyEarningsSource = normalizeFundDailyEarningsScoped(payload.fundDailyEarnings);
    const fundDailyEarningsSig = Object.keys(fundDailyEarningsSource)
      .sort()
      .flatMap((scopeKey) => {
        const bucket = fundDailyEarningsSource[scopeKey];
        if (!isPlainObject(bucket)) return [];
        return Object.keys(bucket)
          .map(normalizeCode)
          .filter((code) => uniqueFundCodes.includes(code))
          .sort()
          .map((code) => {
            const list = Array.isArray(bucket[code]) ? bucket[code] : [];
            const last = list.length ? list[list.length - 1] : null;
            const date = last?.date ? String(last.date) : '';
            const earnings = Number(last?.earnings);
            return `${scopeKey}|${code}|${date}|${Number.isFinite(earnings) ? earnings.toFixed(2) : ''}|${list.length}`;
          });
      });

    const tagRows = Array.isArray(payload.tags) ? payload.tags : [];
    const tagsSig = tagRows
      .map((r) => {
        const codes = getFundCodesFromTagRecord(r)
          .map((c) => normalizeCode(c))
          .filter(Boolean)
          .sort()
          .join(',');
        return `${codes}|${String(r?.id ?? '')}|${String(r?.name ?? '')}|${String(r?.theme ?? '')}`;
      })
      .sort()
      .join('\n');

    return JSON.stringify({
      funds: uniqueFundCodes,
      tagsSig,
      favorites,
      groups,
      collapsedCodes,
      collapsedTrends,
      refreshMs: Number.isFinite(payload.refreshMs) ? payload.refreshMs : 30000,
      holdings,
      groupHoldings: groupHoldingsNorm,
      pendingTrades,
      transactions,
      dcaPlans,
      customSettings,
      fundDailyEarningsSig
    });
  }

  // --- collectLocalPayload ---
  const collectLocalPayload = (keys = null) => {
    try {
      const all = {};
      if (!keys || keys.has('fundValuationTimeseries')) {
        all.fundValuationTimeseries = storageStore.getItem('fundValuationTimeseries', {});
      }
      if (!keys || keys.has('funds')) {
        all.funds = storageStore.getItem('funds', []);
      }
      if (!keys || keys.has('favorites')) {
        all.favorites = storageStore.getItem('favorites', []);
      }
      if (!keys || keys.has('groups')) {
        all.groups = storageStore.getItem('groups', []);
      }
      if (!keys || keys.has('collapsedCodes')) {
        all.collapsedCodes = storageStore.getItem('collapsedCodes', []);
      }
      if (!keys || keys.has('collapsedTrends')) {
        all.collapsedTrends = storageStore.getItem('collapsedTrends', []);
      }
      if (!keys || keys.has('collapsedEarnings')) {
        all.collapsedEarnings = storageStore.getItem('collapsedEarnings', []);
      }
      if (!keys || keys.has('refreshMs')) {
        all.refreshMs = storageStore.getItem('refreshMs', 30000);
      }
      if (!keys || keys.has('holdings')) {
        all.holdings = storageStore.getItem('holdings', {});
      }
      if (!keys || keys.has('groupHoldings')) {
        all.groupHoldings = storageStore.getItem('groupHoldings', {});
      }
      if (!keys || keys.has('pendingTrades')) {
        all.pendingTrades = storageStore.getItem('pendingTrades', []);
      }
      if (!keys || keys.has('transactions')) {
        all.transactions = storageStore.getItem('transactions', {});
      }
      if (!keys || keys.has('dcaPlans')) {
        all.dcaPlans = storageStore.getItem('dcaPlans', {});
      }
      if (!keys || keys.has('customSettings')) {
        all.customSettings = storageStore.getItem('customSettings', {});
      }
      if (!keys || keys.has('fundDailyEarnings')) {
        all.fundDailyEarnings = storageStore.getItem('fundDailyEarnings', {});
      }
      if (!keys || keys.has('tags')) {
        all.tags = storageStore.getItem('tags', []);
      }

      if (!keys) {
        all.funds = Array.isArray(all.funds) ? all.funds.map(stripLegacyTagsFromFundObject) : [];
        const fundCodes = new Set(Array.isArray(all.funds) ? all.funds.map((f) => f?.code).filter(Boolean) : []);

        const cleanedHoldings = isPlainObject(all.holdings)
          ? Object.entries(all.holdings).reduce((acc, [code, value]) => {
              if (!fundCodes.has(code) || !isPlainObject(value)) return acc;
              const parsedShare = isNumber(value.share)
                ? value.share
                : isString(value.share)
                  ? Number(value.share)
                  : NaN;
              const parsedCost = isNumber(value.cost) ? value.cost : isString(value.cost) ? Number(value.cost) : NaN;
              const nextShare = Number.isFinite(parsedShare) ? parsedShare : null;
              const nextCost = Number.isFinite(parsedCost) ? parsedCost : null;
              if (nextShare === null && nextCost === null) return acc;
              acc[code] = {
                ...value,
                share: nextShare,
                cost: nextCost
              };
              return acc;
            }, {})
          : {};

        const cleanedFavorites = Array.isArray(all.favorites)
          ? all.favorites.filter((code) => fundCodes.has(code))
          : [];
        const cleanedCollapsed = Array.isArray(all.collapsedCodes)
          ? all.collapsedCodes.filter((code) => fundCodes.has(code))
          : [];
        const cleanedCollapsedTrends = Array.isArray(all.collapsedTrends)
          ? all.collapsedTrends.filter((code) => fundCodes.has(code))
          : [];
        const cleanedCollapsedEarnings = Array.isArray(all.collapsedEarnings)
          ? all.collapsedEarnings.filter((code) => fundCodes.has(code))
          : [];
        const cleanedGroups = Array.isArray(all.groups)
          ? all.groups.map((g) => ({
              ...g,
              codes: Array.isArray(g.codes) ? g.codes.filter((c) => fundCodes.has(c)) : []
            }))
          : [];

        const validGroupIdSet = new Set(cleanedGroups.map((g) => g?.id).filter(Boolean));

        const cleanedGroupHoldings = isPlainObject(all.groupHoldings)
          ? Object.entries(all.groupHoldings).reduce((acc, [gid, bucket]) => {
              if (!validGroupIdSet.has(gid) || !isPlainObject(bucket)) return acc;
              const inner = Object.entries(bucket).reduce((bacc, [code, value]) => {
                if (!fundCodes.has(code) || !isPlainObject(value)) return bacc;
                const parsedShare = isNumber(value.share)
                  ? value.share
                  : isString(value.share)
                    ? Number(value.share)
                    : NaN;
                const parsedCost = isNumber(value.cost) ? value.cost : isString(value.cost) ? Number(value.cost) : NaN;
                const nextShare = Number.isFinite(parsedShare) ? parsedShare : null;
                const nextCost = Number.isFinite(parsedCost) ? parsedCost : null;
                if (nextShare === null && nextCost === null) return bacc;
                bacc[code] = {
                  ...value,
                  share: nextShare,
                  cost: nextCost
                };
                return bacc;
              }, {});
              if (Object.keys(inner).length) acc[gid] = inner;
              return acc;
            }, {})
          : {};

        const scopedDca = migrateDcaPlansToScoped(isPlainObject(all.dcaPlans) ? all.dcaPlans : {});
        const cleanedDcaPlans = Object.entries(scopedDca).reduce((acc, [scopeKey, bucket]) => {
          const sk = String(scopeKey);
          if (sk !== DCA_SCOPE_GLOBAL && !validGroupIdSet.has(sk)) return acc;
          if (!isPlainObject(bucket)) return acc;
          const inner = Object.entries(bucket).reduce((bacc, [code, plan]) => {
            if (!fundCodes.has(code) || !isPlainObject(plan)) return bacc;
            bacc[code] = plan;
            return bacc;
          }, {});
          if (Object.keys(inner).length) acc[sk] = inner;
          return acc;
        }, {});
        if (!cleanedDcaPlans[DCA_SCOPE_GLOBAL]) cleanedDcaPlans[DCA_SCOPE_GLOBAL] = {};

        const dailyScoped = normalizeFundDailyEarningsScoped(all.fundDailyEarnings);
        const cleanedFundDailyEarnings = Object.entries(dailyScoped).reduce((acc, [scopeKey, bucket]) => {
          if (!isPlainObject(bucket)) return acc;
          if (scopeKey !== DAILY_EARNINGS_SCOPE_ALL && !validGroupIdSet.has(scopeKey)) return acc;
          const normalizedBucket = Object.entries(bucket).reduce((bacc, [code, list]) => {
            if (!fundCodes.has(code) || !Array.isArray(list)) return bacc;
            const normalized = list
              .map((item) => {
                const date = item?.date ? String(item.date) : '';
                const earnings = Number(item?.earnings);
                const rateRaw = item?.rate;
                const rate = rateRaw === null || rateRaw === undefined || rateRaw === '' ? null : Number(rateRaw);
                const baseCostAmountRaw = item?.baseCostAmount;
                const baseCostAmount =
                  baseCostAmountRaw === null || baseCostAmountRaw === undefined || baseCostAmountRaw === ''
                    ? null
                    : Number(baseCostAmountRaw);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
                if (!Number.isFinite(earnings)) return null;
                return {
                  date,
                  earnings,
                  ...(Number.isFinite(rate) ? { rate } : { rate: null }),
                  ...(Number.isFinite(baseCostAmount) && baseCostAmount > 0
                    ? { baseCostAmount }
                    : { baseCostAmount: null })
                };
              })
              .filter(Boolean)
              .sort((a, b) => a.date.localeCompare(b.date));
            if (normalized.length === 0) return bacc;
            bacc[code] = normalized;
            return bacc;
          }, {});
          if (Object.keys(normalizedBucket).length === 0) return acc;
          acc[scopeKey] = normalizedBucket;
          return acc;
        }, {});

        const cleanedTags = Array.isArray(all.tags)
          ? all.tags
              .map((r) => {
                const codes = getFundCodesFromTagRecord(r).filter((c) => fundCodes.has(c));
                const name = String(r?.name ?? '').trim();
                if (!name) return null;
                return sanitizeTagRowForStorage({
                  ...r,
                  id: String(r?.id ?? '').trim() || uuidv4(),
                  name,
                  theme: String(r?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME,
                  fundCodes: codes
                });
              })
              .filter(Boolean)
          : [];

        return {
          funds: all.funds,
          tags: cleanedTags,
          favorites: cleanedFavorites,
          groups: cleanedGroups,
          collapsedCodes: cleanedCollapsed,
          collapsedTrends: cleanedCollapsedTrends,
          collapsedEarnings: cleanedCollapsedEarnings,
          refreshMs: all.refreshMs,
          holdings: cleanedHoldings,
          groupHoldings: cleanedGroupHoldings,
          pendingTrades: all.pendingTrades,
          transactions: all.transactions,
          dcaPlans: cleanedDcaPlans,
          customSettings: isPlainObject(all.customSettings) ? all.customSettings : {},
          fundDailyEarnings: cleanedFundDailyEarnings,
          fundValuationTimeseries: isPlainObject(all.fundValuationTimeseries) ? all.fundValuationTimeseries : {}
        };
      }

      return all;
    } catch {
      if (keys) return {};
      return {
        funds: [],
        tags: [],
        favorites: [],
        groups: [],
        collapsedCodes: [],
        collapsedTrends: [],
        collapsedEarnings: [],
        refreshMs: 30000,
        holdings: {},
        groupHoldings: {},
        pendingTrades: [],
        transactions: {},
        dcaPlans: { [DCA_SCOPE_GLOBAL]: {} },
        customSettings: {},
        exportedAt: nowInTz().toISOString()
      };
    }
  };

  // --- scheduleSync ---
  // 通过 syncUserConfigRef 间接调用 syncUserConfig，避免空依赖导致的闭包陷阱
  const scheduleSync = useCallback(() => {
    if (!userIdRef.current) return;
    if (skipSyncRef.current) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      const dirtyKeys = new Set(dirtyKeysRef.current);
      if (dirtyKeys.size === 0) {
        // Fallback to full sync if needed
      }

      const payload = collectLocalPayload(dirtyKeys.size > 0 ? dirtyKeys : null);

      dirtyKeysRef.current.clear();

      const doSync = syncUserConfigRef.current;
      if (!doSync) return;

      if (dirtyKeys.size > 0) {
        doSync(userIdRef.current, false, payload, true);
      } else {
        const next = getComparablePayload(payload);
        if (next === lastSyncedRef.current) return;
        lastSyncedRef.current = next;
        doSync(userIdRef.current, false, payload, false);
      }
    }, 1000 * 2);
  }, []);

  // --- syncUserConfig (defined after scheduleSync but referenced by it) ---
  const syncUserConfig = useCallback(
    async (userId, showTip = true, payload = null, isPartial = false, options = {}) => {
      const forceTakeover = options?.forceTakeover || false;
      if (!userId) {
        showToast(`userId 不存在，请重新登录`, 'error');
        return;
      }
      try {
        setIsSyncing(true);
        const baseData = payload || collectLocalPayload();
        const now = nowInTz().toISOString();
        let deviceId = deviceIdRef.current || '';
        if (!deviceId) {
          try {
            const key = 'rtfDeviceId';
            deviceId = storageStore.getItem(key) || '';
            if (!deviceId) {
              deviceId = uuidv4();
              storageStore.setItem(key, deviceId);
            }
            deviceIdRef.current = deviceId;
          } catch {
            deviceId = uuidv4();
            deviceIdRef.current = deviceId;
          }
        }
        const dataToSync = isPlainObject(baseData)
          ? {
              ...baseData,
              _syncMeta: {
                ...(isPlainObject(baseData._syncMeta) ? baseData._syncMeta : {}),
                deviceId,
                at: now
              }
            }
          : { _syncMeta: { deviceId, at: now } };

        if (isPartial) {
          const { error: rpcError } = await withRetry(() =>
            supabase.rpc('update_user_config_partial', {
              payload: dataToSync,
              p_last_device_id: deviceId,
              p_force_takeover: forceTakeover
            })
          );

          if (rpcError) {
            if (rpcError.message?.includes('DEVICE_CONFLICT')) {
              setIsSyncing(false);
              skipSyncRef.current = true;
              useModalStore.setState({
                deviceConflictModal: {
                  open: true,
                  message:
                    '您的账号已在其他设备登录。当前设备的同步已被拦截。是否确认拉取云端最新数据覆盖本地并恢复同步？',
                  userId,
                  payload,
                  isPartial
                }
              });
              return;
            }
            console.error('增量同步失败，尝试全量同步', rpcError);
            const fullPayload = collectLocalPayload();
            const { error: fullError } = await withRetry(() =>
              supabase.rpc('update_user_config_full', {
                payload: fullPayload,
                p_last_device_id: deviceId,
                p_force_takeover: forceTakeover
              })
            );
            if (fullError) {
              if (fullError.message?.includes('DEVICE_CONFLICT')) {
                setIsSyncing(false);
                skipSyncRef.current = true;
                useModalStore.setState({
                  deviceConflictModal: {
                    open: true,
                    message:
                      '您的账号已在其他设备登录。当前设备的同步已被拦截。是否确认拉取云端最新数据覆盖本地并恢复同步？',
                    userId,
                    payload,
                    isPartial
                  }
                });
                return;
              }
              throw fullError;
            }
          }
        } else {
          const { error } = await withRetry(() =>
            supabase.rpc('update_user_config_full', {
              payload: dataToSync,
              p_last_device_id: deviceId,
              p_force_takeover: forceTakeover
            })
          );
          if (error) {
            if (error.message?.includes('DEVICE_CONFLICT')) {
              setIsSyncing(false);
              skipSyncRef.current = true;
              useModalStore.setState({
                deviceConflictModal: {
                  open: true,
                  message:
                    '您的账号已在其他设备登录。当前设备的同步已被拦截。是否确认拉取云端最新数据覆盖本地并恢复同步？',
                  userId,
                  payload,
                  isPartial
                }
              });
              return;
            }
            throw error;
          }
        }

        storageStore.setItem('localUpdatedAt', now);
        setLastSyncTime(now);

        if (forceTakeover) {
          lastSyncedRef.current = getComparablePayload(dataToSync);
        }

        if (showTip) {
          useModalStore.setState({ successModal: { open: true, message: '已同步云端配置' } });
        }
      } catch (e) {
        console.error('同步云端配置异常', e);
      } finally {
        setIsSyncing(false);
        skipSyncRef.current = false;
      }
    },
    [showToast]
  );

  // 保持 syncUserConfigRef 与最新 syncUserConfig 同步
  useEffect(() => {
    syncUserConfigRef.current = syncUserConfig;
  }, [syncUserConfig]);

  // --- storageHelper ---
  const { setOnSync } = useStorageStore();

  const storageHelper = useMemo(() => storageStore, []);

  // 将 setOnSync 注册移到 useEffect 中，避免在 useMemo 中执行副作用
  useEffect(() => {
    const triggerSync = (key, prevValue, nextValue) => {
      if (key === '__clear__') {
        return;
      }
      dirtyKeysRef.current.add(key);

      if (key === 'fundValuationTimeseries') {
        return;
      }

      if (!skipSyncRef.current) {
        const now = nowInTz().toISOString();
        storageStore.setItem('localUpdatedAt', now);
        setLastSyncTime(now);
      }
      scheduleSync();
    };

    setOnSync(triggerSync);
  }, [setOnSync, scheduleSync]);

  // --- cross-tab storage listener ---
  useEffect(() => {
    const keys = new Set([
      'funds',
      'tags',
      'favorites',
      'groups',
      'collapsedCodes',
      'collapsedTrends',
      'collapsedEarnings',
      'refreshMs',
      'holdings',
      'groupHoldings',
      'pendingTrades',
      'dcaPlans',
      'customSettings',
      'fundDailyEarnings'
    ]);
    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key === 'localUpdatedAt') {
        setLastSyncTime(e.newValue);
      }
      if (!keys.has(e.key)) return;

      import('../stores/storageStore').then(({ getFundCodesSignature, getTagsStoreSignature }) => {
        if (e.key === 'funds') {
          const prevSig = getFundCodesSignature(e.oldValue);
          const nextSig = getFundCodesSignature(e.newValue);
          if (prevSig === nextSig) return;
        }
        if (e.key === 'tags') {
          const prevSig = getTagsStoreSignature(e.oldValue);
          const nextSig = getTagsStoreSignature(e.newValue);
          if (prevSig === nextSig) return;
        }
        scheduleSync();
      });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [scheduleSync]);

  // --- triggerCustomSettingsSync ---
  const triggerCustomSettingsSync = useCallback(() => {
    queueMicrotask(() => {
      dirtyKeysRef.current.add('customSettings');
      if (!skipSyncRef.current) {
        const now = nowInTz().toISOString();
        storageStore.setItem('localUpdatedAt', now);
        setLastSyncTime(now);
      }
      scheduleSync();
    });
  }, [scheduleSync]);

  // --- applyCloudConfig ---
  const applyCloudConfig = useCallback(
    async (cloudData, cloudUpdatedAt, options = {}) => {
      if (!isPlainObject(cloudData)) return;
      skipSyncRef.current = true;
      try {
        if (cloudUpdatedAt) {
          storageStore.setItem('localUpdatedAt', cloudUpdatedAt);
        }
        let localFundsForMerge = [];
        try {
          localFundsForMerge = storageStore.getItem('funds', []);
        } catch {}
        const localFundByCode = new Map(
          localFundsForMerge
            .map(stripLegacyTagsFromFundObject)
            .filter((f) => f && f.code != null)
            .map((f) => [String(f.code), f])
        );

        const cloudFunds = Array.isArray(cloudData.funds)
          ? dedupeByCode(cloudData.funds.map(stripLegacyTagsFromFundObject))
          : [];
        const nextFunds = cloudFunds.map((cf) =>
          mergeValuationFieldsByGztime(localFundByCode.get(String(cf?.code)), cf)
        );
        useStorageStore.getState().setFunds(nextFunds);
        const nextFundCodes = new Set(nextFunds.map((f) => f.code));

        if (hasOwn(cloudData, 'tags')) {
          const cleanedTagRows = (Array.isArray(cloudData.tags) ? cloudData.tags : [])
            .map((r) => {
              const codes = getFundCodesFromTagRecord(r).filter((c) => nextFundCodes.has(c));
              const name = String(r?.name ?? '').trim();
              if (!name) return null;
              return sanitizeTagRowForStorage({
                ...r,
                id: String(r?.id ?? '').trim() || uuidv4(),
                name,
                theme: String(r?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME,
                fundCodes: codes
              });
            })
            .filter(Boolean);
          setFundTagRecords(cleanedTagRows);
          storageStore.setItem('tags', JSON.stringify(cleanedTagRows));
        } else {
          try {
            const localTags = storageStore.getItem('tags', []);
            const normalized = localTags
              .map((r) => {
                const codes = getFundCodesFromTagRecord(r).filter((c) => nextFundCodes.has(c));
                return sanitizeTagRowForStorage({
                  ...r,
                  id: String(r.id || '').trim() || uuidv4(),
                  name: String(r.name || '').trim(),
                  theme: String(r.theme || '').trim() || DEFAULT_FUND_TAG_THEME,
                  fundCodes: codes
                });
              })
              .filter(Boolean);
            setFundTagRecords(normalized);
          } catch {
            setFundTagRecords([]);
          }
        }

        const nextFavorites = cleanCodeArray(cloudData.favorites, nextFundCodes);
        useStorageStore.getState().setFavorites(new Set(nextFavorites));

        const nextGroups = Array.isArray(cloudData.groups)
          ? cloudData.groups
              .map((g) => ({
                ...g,
                id: String(g?.id ?? '').trim() || uuidv4(),
                name: String(g?.name ?? '').trim(),
                codes: cleanCodeArray(g?.codes, nextFundCodes)
              }))
              .filter((g) => g.name.length > 0)
          : [];
        useStorageStore.getState().setGroups(nextGroups);

        const nextCollapsed = Array.isArray(cloudData.collapsedCodes) ? cloudData.collapsedCodes : [];
        useStorageStore.getState().setCollapsedCodes(new Set(nextCollapsed));

        if (Array.isArray(cloudData.collapsedTrends)) {
          useStorageStore.getState().setCollapsedTrends(new Set(cloudData.collapsedTrends));
        }
        if (Array.isArray(cloudData.collapsedEarnings)) {
          useStorageStore.getState().setCollapsedEarnings(new Set(cloudData.collapsedEarnings));
        }

        const nextRefreshMs =
          Number.isFinite(cloudData.refreshMs) && cloudData.refreshMs >= 5000 ? cloudData.refreshMs : 30000;
        useStorageStore.getState().setRefreshMs(nextRefreshMs);
        setTempSeconds(Math.round(nextRefreshMs / 1000));

        const nextHoldings = isPlainObject(cloudData.holdings) ? cloudData.holdings : {};
        useStorageStore.getState().setHoldings(nextHoldings);

        const cloudGroupIds = new Set(nextGroups.map((g) => g?.id).filter(Boolean));

        let nextGroupHoldings = isPlainObject(cloudData.groupHoldings) ? cloudData.groupHoldings : {};
        const seedAfterCloud = seedGroupHoldingsFromGlobal(nextHoldings, nextGroups, nextGroupHoldings);
        if (seedAfterCloud.changed) {
          nextGroupHoldings = seedAfterCloud.next;
        }
        useStorageStore.getState().setGroupHoldings(nextGroupHoldings);

        if (hasOwn(cloudData, 'pendingTrades')) {
          const nextPendingTrades = Array.isArray(cloudData.pendingTrades)
            ? cloudData.pendingTrades.filter((trade) => {
                if (!trade || !nextFundCodes.has(trade.fundCode)) return false;
                if (trade.groupId && !cloudGroupIds.has(trade.groupId)) return false;
                return true;
              })
            : [];
          useStorageStore.getState().setPendingTrades(nextPendingTrades);
        } else {
          try {
            const localPending = storageStore.getItem('pendingTrades', []);
            useStorageStore.getState().setPendingTrades(Array.isArray(localPending) ? localPending : []);
          } catch {}
        }

        if (hasOwn(cloudData, 'transactions')) {
          const nextTransactions = isPlainObject(cloudData.transactions) ? cloudData.transactions : {};
          useStorageStore.getState().setTransactions(nextTransactions);
        } else {
          try {
            const localTx = storageStore.getItem('transactions', {});
            useStorageStore.getState().setTransactions(isPlainObject(localTx) ? localTx : {});
          } catch {}
        }

        if (hasOwn(cloudData, 'dcaPlans')) {
          const cloudDcaScoped = migrateDcaPlansToScoped(isPlainObject(cloudData.dcaPlans) ? cloudData.dcaPlans : {});
          const nextDcaPlans = {};
          Object.entries(cloudDcaScoped).forEach(([scopeKey, bucket]) => {
            if (scopeKey !== DCA_SCOPE_GLOBAL && !cloudGroupIds.has(scopeKey)) return;
            if (!isPlainObject(bucket)) return;
            const inner = {};
            Object.entries(bucket).forEach(([code, plan]) => {
              if (!nextFundCodes.has(code) || !isPlainObject(plan)) return;
              inner[code] = plan;
            });
            if (Object.keys(inner).length) nextDcaPlans[scopeKey] = inner;
          });
          if (!nextDcaPlans[DCA_SCOPE_GLOBAL]) nextDcaPlans[DCA_SCOPE_GLOBAL] = {};
          useStorageStore.getState().setDcaPlans(nextDcaPlans);
        } else {
          try {
            const localDca = storageStore.getItem('dcaPlans', {});
            useStorageStore.getState().setDcaPlans(migrateDcaPlansToScoped(isPlainObject(localDca) ? localDca : {}));
          } catch {}
        }

        const cloudDaily = normalizeFundDailyEarningsScoped(cloudData.fundDailyEarnings);
        const nextFundDailyEarnings = Object.entries(cloudDaily).reduce((acc, [scopeKey, bucket]) => {
          if (!isPlainObject(bucket)) return acc;
          if (scopeKey !== DAILY_EARNINGS_SCOPE_ALL && !cloudGroupIds.has(scopeKey)) return acc;
          const normalizedBucket = Object.entries(bucket).reduce((bacc, [code, list]) => {
            if (!nextFundCodes.has(code) || !Array.isArray(list)) return bacc;
            const normalized = list
              .map((item) => {
                const date = item?.date ? String(item.date) : '';
                const earnings = Number(item?.earnings);
                const rateRaw = item?.rate;
                const rate = rateRaw === null || rateRaw === undefined || rateRaw === '' ? null : Number(rateRaw);
                const baseCostAmountRaw = item?.baseCostAmount;
                const baseCostAmount =
                  baseCostAmountRaw === null || baseCostAmountRaw === undefined || baseCostAmountRaw === ''
                    ? null
                    : Number(baseCostAmountRaw);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
                if (!Number.isFinite(earnings)) return null;
                return {
                  date,
                  earnings,
                  ...(Number.isFinite(rate) ? { rate } : { rate: null }),
                  ...(Number.isFinite(baseCostAmount) && baseCostAmount > 0
                    ? { baseCostAmount }
                    : { baseCostAmount: null })
                };
              })
              .filter(Boolean)
              .sort((a, b) => a.date.localeCompare(b.date));
            if (normalized.length === 0) return bacc;
            bacc[code] = normalized;
            return bacc;
          }, {});
          if (Object.keys(normalizedBucket).length === 0) return acc;
          acc[scopeKey] = normalizedBucket;
          return acc;
        }, {});
        useStorageStore.getState().setFundDailyEarnings(nextFundDailyEarnings);

        if (hasOwn(cloudData, 'fundValuationTimeseries')) {
          const nextTimeseries = isPlainObject(cloudData.fundValuationTimeseries)
            ? cloudData.fundValuationTimeseries
            : {};
          const localTimeseries = storageStore.getItem('fundValuationTimeseries', {});
          const mergedTimeseries = { ...localTimeseries };

          const mergeSeries = (cloudArr, localArr) => {
            const pointsMap = new Map();
            localArr.forEach((pt) => {
              if (pt && pt.date && pt.time) pointsMap.set(`${pt.date}_${pt.time}`, pt);
            });
            cloudArr.forEach((pt) => {
              if (pt && pt.date && pt.time) pointsMap.set(`${pt.date}_${pt.time}`, pt);
            });
            let mergedArr = Array.from(pointsMap.values()).sort((a, b) => {
              if (a.date !== b.date) return a.date.localeCompare(b.date);
              return a.time.localeCompare(b.time);
            });
            const maxDate = mergedArr.reduce((max, pt) => (pt.date > max ? pt.date : max), '');
            if (maxDate) mergedArr = mergedArr.filter((pt) => pt.date === maxDate);
            return mergedArr;
          };

          Object.keys(nextTimeseries).forEach((code) => {
            if (!nextFundCodes.has(code)) return;
            const cloudEntry = nextTimeseries[code];
            const localEntry = mergedTimeseries[code];
            if (Array.isArray(cloudEntry)) {
              const localArr = Array.isArray(localEntry) ? localEntry : [];
              mergedTimeseries[code] = { 1: mergeSeries(cloudEntry, localArr) };
              return;
            }
            if (isPlainObject(cloudEntry)) {
              const localDsMap = isPlainObject(localEntry) ? localEntry : {};
              const mergedDsMap = { ...localDsMap };
              Object.keys(cloudEntry).forEach((ds) => {
                if (!Array.isArray(cloudEntry[ds])) return;
                const localArr = Array.isArray(mergedDsMap[ds]) ? mergedDsMap[ds] : [];
                mergedDsMap[ds] = mergeSeries(cloudEntry[ds], localArr);
              });
              mergedTimeseries[code] = mergedDsMap;
            }
          });

          const cleanedTimeseries = {};
          Object.keys(mergedTimeseries).forEach((code) => {
            if (nextFundCodes.has(code)) {
              cleanedTimeseries[code] = mergedTimeseries[code];
            }
          });
          storageStore.setItem('fundValuationTimeseries', JSON.stringify(cleanedTimeseries));
        }

        if (isPlainObject(cloudData.customSettings)) {
          try {
            const currentCustomSettings = useStorageStore.getState().customSettings;
            const merged = { ...(currentCustomSettings || {}), ...cloudData.customSettings };
            useStorageStore.getState().setCustomSettings(merged);
            if (
              typeof merged.localSortDisplayMode === 'string' &&
              SORT_DISPLAY_MODES.has(merged.localSortDisplayMode)
            ) {
              useStorageStore.getState().setPcSortDisplayMode(merged.localSortDisplayMode);
              useStorageStore.getState().setMobileSortDisplayMode(merged.localSortDisplayMode);
            } else {
              if (
                typeof merged.pcLocalSortDisplayMode === 'string' &&
                SORT_DISPLAY_MODES.has(merged.pcLocalSortDisplayMode)
              ) {
                useStorageStore.getState().setPcSortDisplayMode(merged.pcLocalSortDisplayMode);
              }
              if (
                typeof merged.mobileLocalSortDisplayMode === 'string' &&
                SORT_DISPLAY_MODES.has(merged.mobileLocalSortDisplayMode)
              ) {
                useStorageStore.getState().setMobileSortDisplayMode(merged.mobileLocalSortDisplayMode);
              }
            }
          } catch {}
        }

        if (options.forceTakeover) {
          const currentUser = useUserStore.getState().user;
          const currentUserId = options.userId || userIdRef.current || currentUser?.id;
          if (currentUserId) {
            await syncUserConfig(currentUserId, true, null, false, { forceTakeover: true });
          }
        }

        if (nextFunds.length) {
          const codes = Array.from(new Set(nextFunds.map((f) => f.code)));
          const localCodesSet = new Set(localFundsForMerge.map((f) => f?.code).filter(Boolean));
          const hasNewFunds = codes.some((code) => !localCodesSet.has(code));

          if (hasNewFunds && typeof refreshAllRef.current === 'function') {
            await refreshAllRef.current(codes);
          }
          const currentUser = useUserStore.getState().user;
          const currentUserId = userIdRef.current || currentUser?.id;
          if (currentUserId) {
            try {
              const latestFunds = storageStore.getItem('funds', []);
              const localSig = getFundCodesSignature(latestFunds, ['gztime']);
              const cloudSig = getFundCodesSignature(Array.isArray(cloudData.funds) ? cloudData.funds : [], ['gztime']);
              if (localSig !== cloudSig) {
                await syncUserConfig(
                  currentUserId,
                  false,
                  { funds: Array.isArray(latestFunds) ? latestFunds : [] },
                  true,
                  options
                );
              }
            } catch (e) {
              console.error('刷新后强制同步 funds 到云端失败', e);
            }
          }
        }

        const payload = collectLocalPayload();
        lastSyncedRef.current = getComparablePayload(payload);
      } finally {
        skipSyncRef.current = false;
      }
    },
    [showToast, setTempSeconds, setFundTagRecords, syncUserConfig]
  );

  // --- fetchCloudConfig ---
  const fetchCloudConfig = useCallback(
    async (userId, checkConflict = false, options = {}) => {
      if (!userId) return;
      try {
        const { data: meta, error: metaError } = await withRetry(() =>
          supabase.from('user_configs').select('id, data, updated_at').eq('user_id', userId).maybeSingle()
        );

        if (metaError) throw metaError;

        if (!meta?.id) {
          const { error: insertError } = await withRetry(() =>
            supabase.from('user_configs').insert({ user_id: userId })
          );
          if (insertError) throw insertError;
          useModalStore.setState({ cloudConfigModal: { open: true, userId, type: 'empty' } });
          return;
        }

        if (checkConflict) {
          useModalStore.setState({ cloudConfigModal: { open: true, userId, type: 'conflict', cloudData: meta.data } });
          return;
        }

        if (meta.data && isPlainObject(meta.data) && Object.keys(meta.data).length > 0) {
          await applyCloudConfig(meta.data, meta.updated_at, { ...options, userId });
          return;
        }

        useModalStore.setState({ cloudConfigModal: { open: true, userId, type: 'empty' } });
      } catch (e) {
        console.error('获取云端配置失败', e);
        skipSyncRef.current = false;
      }
    },
    [applyCloudConfig]
  );

  // --- handleSyncLocalConfig ---
  const handleSyncLocalConfig = useCallback(async () => {
    const cloudConfigModal = useModalStore.getState().cloudConfigModal;
    const userId = cloudConfigModal.userId;
    useModalStore.setState({ cloudConfigModal: { open: false, userId: null } });
    await syncUserConfig(userId, true, null, false, { forceTakeover: true });
  }, [syncUserConfig]);

  return {
    isSyncing,
    lastSyncTime,
    scheduleSync,
    syncUserConfig,
    fetchCloudConfig,
    applyCloudConfig,
    handleSyncLocalConfig,
    triggerCustomSettingsSync,
    skipSyncRef,
    deviceConflictModalOpenRef,
    storageHelper
  };
}
