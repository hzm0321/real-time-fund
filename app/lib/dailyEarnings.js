/**
 * 每日收益数据管理（按作用域分桶）：
 * {
 *   [scope]: {
 *     [code]: Array<{ date: string, earnings: number, rate?: number|null, baseCostAmount?: number|null }>
 *   }
 * }
 * - scope: 'all'（全局）或自定义分组 id
 * - date: YYYY-MM-DD
 * - earnings: 当日收益（元）
 * - rate: 当日收益率（百分比数值，如 1.23 表示 +1.23%），基于用户成本价计算，即 (当日收益 / 成本金额) × 100
 * - baseCostAmount: 当日成本快照金额（元），用于冻结当日收益率分母
 */
import { isPlainObject, isString, isNumber } from 'lodash';
import { storageStore } from '@/app/stores';

const STORAGE_KEY = 'fundDailyEarnings';
export const DAILY_EARNINGS_SCOPE_ALL = 'all';

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const date = item.date;
  const earnings = item.earnings;
  const rate = item.rate;
  const baseCostAmount = item.baseCostAmount;
  if (!isString(date) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!isNumber(earnings) || !Number.isFinite(earnings)) return null;
  const normalizedRate =
    isNumber(rate) && Number.isFinite(rate) ? rate : null;
  const normalizedBaseCostAmount =
    isNumber(baseCostAmount) && Number.isFinite(baseCostAmount) && baseCostAmount > 0
      ? baseCostAmount
      : null;
  return { date, earnings, rate: normalizedRate, baseCostAmount: normalizedBaseCostAmount };
}

function getStored() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = storageStore.getItem(STORAGE_KEY);
    if (!isPlainObject(parsed)) return {};
    // 兼容旧格式：{ [code]: list } -> { all: { [code]: list } }
    const hasScopeBucket = Object.values(parsed).some((v) => isPlainObject(v));
    if (!hasScopeBucket) {
      return { [DAILY_EARNINGS_SCOPE_ALL]: parsed };
    }
    return parsed;
  } catch {
    return {};
  }
}

function setStored(data) {
  if (typeof window === 'undefined') return;
  try {
    storageStore.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('dailyEarnings persist failed', e);
  }
}

export function recordDailyEarnings(code, earnings, dateStr) {
  if (!isString(code) || !code) return getDailyEarnings(code);
  if (!isNumber(earnings) || !Number.isFinite(earnings)) return getDailyEarnings(code);
  if (!isString(dateStr) || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return getDailyEarnings(code);

  // 兼容老调用：recordDailyEarnings(code, earnings, dateStr, rate)
  const rate = arguments.length >= 4 ? arguments[3] : null;
  const scope = arguments.length >= 5 && isString(arguments[4]) && arguments[4]
    ? arguments[4]
    : DAILY_EARNINGS_SCOPE_ALL;
  const normalizedRate = isNumber(rate) && Number.isFinite(rate) ? rate : null;

  const all = getStored();
  const scoped = isPlainObject(all[scope]) ? all[scope] : {};
  const list = Array.isArray(scoped[code]) ? scoped[code] : [];
  const existingIndex = list.findIndex(item => item.date === dateStr);

  const baseCostAmount = arguments.length >= 6 && isNumber(arguments[5]) && Number.isFinite(arguments[5]) && arguments[5] > 0
    ? arguments[5]
    : null;

  const nextList = existingIndex >= 0
    ? list.map((item, i) => i === existingIndex ? { date: dateStr, earnings, rate: normalizedRate, baseCostAmount } : item)
    : [...list, { date: dateStr, earnings, rate: normalizedRate, baseCostAmount }];

  nextList.sort((a, b) => a.date.localeCompare(b.date));

  all[scope] = { ...scoped, [code]: nextList };
  setStored(all);
  return nextList.map(normalizeItem).filter(Boolean);
}

export function getDailyEarnings(code, scope = DAILY_EARNINGS_SCOPE_ALL) {
  const all = getStored();
  const scoped = isPlainObject(all[scope]) ? all[scope] : {};
  const list = Array.isArray(scoped[code]) ? scoped[code] : [];
  return list.map(normalizeItem).filter(Boolean);
}

export function clearDailyEarnings(code, scope = null) {
  const all = getStored();
  let changed = false;
  const next = { ...all };
  if (scope && isPlainObject(next[scope]) && code in next[scope]) {
    const bucket = { ...next[scope] };
    delete bucket[code];
    next[scope] = bucket;
    changed = true;
  } else if (!scope) {
    Object.keys(next).forEach((sc) => {
      if (!isPlainObject(next[sc])) return;
      if (!(code in next[sc])) return;
      const bucket = { ...next[sc] };
      delete bucket[code];
      next[sc] = bucket;
      changed = true;
    });
  }
  if (!changed) return;
  setStored(next);
}

export function getAllDailyEarnings(scope = DAILY_EARNINGS_SCOPE_ALL) {
  const all = getStored();
  const scoped = all[scope];
  return isPlainObject(scoped) ? scoped : {};
}

export function getAllDailyEarningsScoped() {
  return getStored();
}

export function setAllDailyEarningsScoped(scopedMap) {
  const next = isPlainObject(scopedMap) ? scopedMap : {};
  setStored(next);
}

/**
 * 将多基金的每日收益按日期合并为组合序列（同日 earnings 求和；组合层面 rate 无统一定义，置为 null）。
 * @param {Record<string, unknown>} fundDailyEarningsMap - 与 localStorage 结构一致：{ [code]: Array<{date, earnings, rate?}> }
 * @returns {Array<{ date: string, earnings: number, rate: null }>}
 */
export function aggregatePortfolioDailyEarnings(fundDailyEarningsMap) {
  if (!isPlainObject(fundDailyEarningsMap)) return [];
  const byDate = new Map();
  for (const code of Object.keys(fundDailyEarningsMap)) {
    const list = fundDailyEarningsMap[code];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const item = normalizeItem(raw);
      if (!item) continue;
      byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.earnings);
    }
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, earnings]) => ({ date, earnings, rate: null }));
}
