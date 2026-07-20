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
import { isArray, isNumber, isObject, isPlainObject, isString } from 'lodash';
import { storageStore } from '@/app/stores';
import { DAILY_EARNINGS_SCOPE_ALL } from '@/app/constants';

const STORAGE_KEY = 'fundDailyEarnings';

function normalizeItem(item) {
  if (!item || !isObject(item)) return null;
  const date = item.date;
  const earnings = item.earnings;
  const rate = item.rate;
  const baseCostAmount = item.baseCostAmount;
  if (!isString(date) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!isNumber(earnings) || !Number.isFinite(earnings)) return null;
  const normalizedRate = isNumber(rate) && Number.isFinite(rate) ? rate : null;
  const normalizedBaseCostAmount =
    isNumber(baseCostAmount) && Number.isFinite(baseCostAmount) && baseCostAmount > 0 ? baseCostAmount : null;
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
  const scope =
    arguments.length >= 5 && isString(arguments[4]) && arguments[4] ? arguments[4] : DAILY_EARNINGS_SCOPE_ALL;
  const normalizedRate = isNumber(rate) && Number.isFinite(rate) ? rate : null;

  const all = getStored();
  const scoped = isPlainObject(all[scope]) ? all[scope] : {};
  const list = isArray(scoped[code]) ? scoped[code] : [];
  const existingIndex = list.findIndex((item) => item.date === dateStr);

  const baseCostAmount =
    arguments.length >= 6 && isNumber(arguments[5]) && Number.isFinite(arguments[5]) && arguments[5] > 0
      ? arguments[5]
      : null;

  const nextList =
    existingIndex >= 0
      ? list.map((item, i) =>
          i === existingIndex ? { date: dateStr, earnings, rate: normalizedRate, baseCostAmount } : item
        )
      : [...list, { date: dateStr, earnings, rate: normalizedRate, baseCostAmount }];

  nextList.sort((a, b) => a.date.localeCompare(b.date));

  all[scope] = { ...scoped, [code]: nextList };
  setStored(all);
  return nextList.map(normalizeItem).filter(Boolean);
}

export function getDailyEarnings(code, scope = DAILY_EARNINGS_SCOPE_ALL) {
  const all = getStored();
  const scoped = isPlainObject(all[scope]) ? all[scope] : {};
  const list = isArray(scoped[code]) ? scoped[code] : [];
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
 * 合并所有 scope 的收益数据（累加同日收益，同一基金在不同 scope 独立持有）
 * @param {Object} scopedDaily - { [scope]: { [code]: Array<{date, earnings, ...}> } }
 * @returns {Object} - { [code]: Array<{date, earnings, ...}> }
 */
export function mergeAllScopedDailyEarnings(scopedDaily) {
  const merged = {};
  if (!isPlainObject(scopedDaily)) return merged;
  Object.values(scopedDaily).forEach((bucket) => {
    if (!isPlainObject(bucket)) return;
    Object.entries(bucket).forEach(([code, list]) => {
      if (!isArray(list)) return;
      if (!merged[code]) {
        merged[code] = new Map();
      }
      const dateMap = merged[code];
      list.forEach((item) => {
        if (!item?.date) return;
        const existing = dateMap.get(item.date);
        if (existing) {
          // 累加 earnings 和 baseCostAmount
          dateMap.set(item.date, {
            ...existing,
            earnings: (existing.earnings || 0) + (item.earnings || 0),
            baseCostAmount: (existing.baseCostAmount || 0) + (item.baseCostAmount || 0),
            rate: null // 合并不同分组的收益后，重置 rate 为 null 促使消费端重算
          });
        } else {
          dateMap.set(item.date, { ...item });
        }
      });
    });
  });
  // 将 Map 转换回数组
  const result = {};
  Object.entries(merged).forEach(([code, dateMap]) => {
    result[code] = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  });
  return result;
}

/**
 * 合并全局 holdings 和分组 holdings（累加持仓，计算加权平均成本）
 * @param {Object} globalHoldings - 全局 holdings
 * @param {Object} groupHoldings - 分组 holdings
 * @returns {Object} - 合并后的 holdings
 */
export function mergeAllHoldings(globalHoldings, groupHoldings) {
  const merged = {};
  // 合并全局 holdings
  if (isPlainObject(globalHoldings)) {
    Object.entries(globalHoldings).forEach(([code, holding]) => {
      if (isPlainObject(holding) && isNumber(holding.share) && holding.share > 0) {
        merged[code] = { ...holding };
      }
    });
  }
  // 累加分组 holdings
  if (isPlainObject(groupHoldings)) {
    Object.values(groupHoldings).forEach((group) => {
      if (!isPlainObject(group)) return;
      Object.entries(group).forEach(([code, holding]) => {
        if (!isPlainObject(holding) || !isNumber(holding.share) || holding.share <= 0) return;
        if (merged[code]) {
          // 计算加权平均成本
          const existingTotalCost = (merged[code].share || 0) * (merged[code].cost || 0);
          const newTotalCost = holding.share * (holding.cost || 0);
          const totalShare = (merged[code].share || 0) + holding.share;
          merged[code] = {
            ...merged[code],
            share: totalShare,
            cost: totalShare > 0 ? (existingTotalCost + newTotalCost) / totalShare : 0
          };
        } else {
          merged[code] = { ...holding };
        }
      });
    });
  }
  return merged;
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
    if (!isArray(list)) continue;
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

/**
 * 估算 YTD (今年以来) 收益率。采用每日收益率累乘法（时间加权收益率近似）。
 * @param {Record<string, unknown>} fundDailyEarningsMap - 全局收益记录 { [code]: Array<{date, earnings, baseCostAmount?}> }
 * @param {Record<string, {share: number, cost: number}>} holdings - 当前全局持仓，用作降级时的分母
 * @returns {number|null} YTD 收益率百分比，如 1.23 表示 +1.23%。若无有效数据则返回 null。
 */
export function calculateYtdReturnRate(fundDailyEarningsMap, holdings) {
  if (!isPlainObject(fundDailyEarningsMap)) return null;

  const currentYear = new Date().getFullYear();
  const yearStartStr = `${currentYear}-01-01`;

  // 按日期聚合每日的总收益和总成本快照
  const dailyStats = new Map();

  for (const code of Object.keys(fundDailyEarningsMap)) {
    const list = fundDailyEarningsMap[code];
    if (!isArray(list)) continue;
    for (const raw of list) {
      const item = normalizeItem(raw);
      if (!item) continue;
      if (item.date >= yearStartStr) {
        const stat = dailyStats.get(item.date) || { earnings: 0, cost: 0, hasCost: false };
        stat.earnings += item.earnings;
        // 如果有当天的快照成本，则累加
        if (isNumber(item.baseCostAmount) && item.baseCostAmount > 0) {
          stat.cost += item.baseCostAmount;
          stat.hasCost = true;
        } else if (isNumber(item.rate) && item.rate !== 0) {
          // 如果没有快照成本但存了单日收益率，反推当天的成本
          const impliedCost = item.earnings / (item.rate / 100);
          if (impliedCost > 0) {
            stat.cost += impliedCost;
            stat.hasCost = true;
          }
        }
        dailyStats.set(item.date, stat);
      }
    }
  }

  if (dailyStats.size === 0) return null;

  // 计算当前持仓总成本（作为部分历史数据无 baseCostAmount 时的 fallback）
  let currentTotalCost = 0;
  if (isPlainObject(holdings)) {
    for (const code of Object.keys(holdings)) {
      const holding = holdings[code];
      if (isObject(holding) && isNumber(holding.share) && isNumber(holding.cost)) {
        currentTotalCost += holding.share * holding.cost; // 份额 × 单位成本 = 总成本
      }
    }
  }

  // 按日期排序并累乘每日收益率
  const sortedDates = [...dailyStats.keys()].sort();
  let compounded = 1;
  let hasValidData = false;

  for (const date of sortedDates) {
    const stat = dailyStats.get(date);
    // 优先使用当天所有基金记录的成本快照和；如果没有，则降级使用当前的持仓总成本
    const dailyCost = stat.hasCost && stat.cost > 0 ? stat.cost : currentTotalCost;

    if (dailyCost > 0) {
      const dailyRate = stat.earnings / dailyCost;
      compounded *= 1 + dailyRate;
      hasValidData = true;
    }
  }

  if (!hasValidData) return null;

  return Number(((compounded - 1) * 100).toFixed(2));
}
