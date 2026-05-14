/**
 * 记录每次调用基金估值接口的结果，用于分时图。
 * 存储格式：{ [code]: { [dataSource]: [{ time, value, date }] } }
 * 规则：获取到最新日期的数据时，清掉所有老日期的数据，只保留当日分时点。
 */
import { isPlainObject, isString } from 'lodash';
import { storageStore } from '@/app/stores';

const STORAGE_KEY = 'fundValuationTimeseries';

function getStored() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = storageStore.getItem(STORAGE_KEY);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function setStored(data) {
  if (typeof window === 'undefined') return;
  try {
    storageStore.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('valuationTimeseries persist failed', e);
  }
}

/**
 * 从 gztime 或 Date 得到日期字符串 YYYY-MM-DD
 */
function toDateStr(gztimeOrNow) {
  if (isString(gztimeOrNow) && /^\d{4}-\d{2}-\d{2}/.test(gztimeOrNow)) {
    return gztimeOrNow.slice(0, 10);
  }
  try {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

/**
 * 获取指定基金指定数据源的分时序列
 * @param {string} code
 * @param {number} dataSource
 * @returns {Array<{ time: string, value: number, date: string }>}
 */
function getSeriesBySource(code, dataSource) {
  const all = getStored();
  const ds = String(dataSource || 1);
  const fundData = all[code];
  if (!isPlainObject(fundData)) return [];
  return Array.isArray(fundData[ds]) ? fundData[ds] : [];
}

/**
 * 记录一条估值。仅当 value 为有效数字时写入。
 * 数据清理：若当前点所属日期大于已存点的最大日期，则清空该基金该数据源下所有旧日期的数据，只保留当日分时。
 *
 * @param {string} code - 基金代码
 * @param {{ gsz?: number | null, gztime?: string | null }} payload - 估值与时间（来自接口）
 * @param {number} [dataSource=1] - 数据源编号
 * @returns {Array<{ time: string, value: number, date: string }>} 该基金当前数据源的分时序列（按时间升序）
 */
export function recordValuation(code, payload, dataSource = 1) {
  const value = payload?.gsz != null ? Number(payload.gsz) : NaN;
  if (!Number.isFinite(value)) return getSeriesBySource(code, dataSource);

  const gztime = payload?.gztime ?? null;
  const dateStr = toDateStr(gztime);
  if (!dateStr) return getSeriesBySource(code, dataSource);

  const timeLabel = isString(gztime) && gztime.length > 10
    ? gztime.slice(11, 16)
    : (() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })();

  const newPoint = { time: timeLabel, value, date: dateStr };

  const all = getStored();
  const ds = String(dataSource || 1);
  if (!isPlainObject(all[code])) all[code] = {};
  const list = Array.isArray(all[code][ds]) ? all[code][ds] : [];

  const existingDates = list.map((p) => p.date).filter(Boolean);
  const latestStoredDate = existingDates.length ? existingDates.reduce((a, b) => (a > b ? a : b), '') : '';

  let nextList;
  if (dateStr > latestStoredDate) {
    nextList = [newPoint];
  } else if (dateStr === latestStoredDate) {
    const hasSameTime = list.some((p) => p.time === timeLabel);
    if (hasSameTime) return list;
    nextList = [...list, newPoint];
  } else {
    return list;
  }

  all[code][ds] = nextList;
  setStored(all);
  return nextList;
}

/**
 * 批量设置指定基金指定数据源的分时序列（数据源 2/3 使用）
 * @param {string} code
 * @param {number} dataSource
 * @param {Array<{ time: string, value: number, date: string }>} series
 */
export function setValuationSeries(code, dataSource, series) {
  if (!code || !Array.isArray(series) || series.length === 0) return;
  const all = getStored();
  const ds = String(dataSource || 1);
  if (!isPlainObject(all[code])) all[code] = {};
  all[code][ds] = series;
  setStored(all);
}

/**
 * 获取某基金当前数据源的分时序列（只读）
 * @param {string} code - 基金代码
 * @param {number} [dataSource=1] - 数据源编号
 * @returns {Array<{ time: string, value: number, date: string }>}
 */
export function getValuationSeries(code, dataSource = 1) {
  return getSeriesBySource(code, dataSource);
}

/**
 * 删除某基金的全部分时数据（如用户删除该基金时调用）
 * @param {string} code
 */
export function clearFund(code) {
  const all = getStored();
  if (!(code in all)) return;
  const next = { ...all };
  delete next[code];
  setStored(next);
}

/**
 * 获取全部分时数据，按基金当前数据源展平，用于页面初始 state
 * 格式：{ [code]: [{ time, value, date }] }
 * @param {Array} [funds] - 可选的基金列表，用于确定每个基金的当前数据源
 * @returns {{ [code: string]: Array<{ time: string, value: number, date: string }> }}
 */
export function getAllValuationSeries(funds) {
  const all = getStored();
  const result = {};
  // 构建 code -> dataSource 映射
  const dsMap = new Map();
  if (Array.isArray(funds)) {
    for (const f of funds) {
      if (f?.code) dsMap.set(f.code, String(f.dataSource || 1));
    }
  }
  for (const [code, dsDataMap] of Object.entries(all)) {
    if (!isPlainObject(dsDataMap)) continue;
    // 优先使用基金当前数据源的数据
    const currentDs = dsMap.get(code);
    if (currentDs && Array.isArray(dsDataMap[currentDs]) && dsDataMap[currentDs].length > 0) {
      result[code] = dsDataMap[currentDs];
      continue;
    }
    // 回退：取第一个有数据的数据源
    for (const series of Object.values(dsDataMap)) {
      if (Array.isArray(series) && series.length > 0) {
        result[code] = series;
        break;
      }
    }
  }
  return result;
}

/**
 * 获取全部原始数据（含数据源分层），用于云端同步
 * @returns {{ [code: string]: { [dataSource: string]: Array } }}
 */
export function getAllValuationSeriesRaw() {
  return getStored();
}
