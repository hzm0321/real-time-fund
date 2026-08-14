import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isArray, isNil, isNumber, isObject, isString } from 'lodash';
import { storageStore } from '../stores';
import { withRetry } from '../lib/asyncHelper';
import { getQueryClient } from '../lib/get-query-client';
import * as qk from '../lib/query-keys';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { isTradingDay } from '../lib/tradingCalendar';

import { DEFAULT_TZ, ONE_DAY_MS } from '@/app/constants';

dayjs.extend(utc);
dayjs.extend(timezone);

const getBrowserTimeZone = () => {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || DEFAULT_TZ;
  }
  return DEFAULT_TZ;
};
const TZ = getBrowserTimeZone();
dayjs.tz.setDefault(TZ);
const nowInTz = () => dayjs().tz(TZ);
const toTz = (input) => (input ? dayjs.tz(input, TZ) : nowInTz());

/**
 * 获取单位净值的缓存时长（单位：毫秒）
 * - 交易日交易时段（09:30-15:00）：30 分钟，减少高频刷新时的冗余请求
 * - 非交易时段（含周末、节假日、闭市）：5 分钟，确保净值更新后能尽快捕获
 */
const getNetValueStaleTime = () => {
  const now = nowInTz();
  const day = now.day();
  const isWeekend = day === 0 || day === 6;

  // 判定是否为交易日（利用 tradingCalendar 的缓存，若未加载则回退到周末判断）
  const tradingDay = isTradingDay(now);

  const hour = now.hour();
  const minute = now.minute();
  const timeNum = hour * 100 + minute;

  // A股交易时段：09:30-11:30, 13:00-15:00
  // 加上前后各 5 分钟冗余：09:25-11:35, 12:55-15:05
  const isTradingTime = tradingDay && ((timeNum >= 925 && timeNum <= 1135) || (timeNum >= 1255 && timeNum <= 1505));

  if (isTradingTime) {
    return 30 * 60 * 1000; // 30 分钟
  }
  return 5 * 60 * 1000; // 5 分钟
};

// ============================================================================
// fund_related & fund_secid 批量微任务合并与防抖去重合并加载器 (DataLoader Pattern)
// ============================================================================

// 1. fund_related 缓存和队列
const relatedSectorsInflight = new Map(); // key = "code|seg" -> { promise, resolve }
const relatedSectorsQueue = new Map(); // key = seg -> Set(code)
let relatedSectorsTimeout = null;

// 2. fund_secid 缓存和队列
const fundSecidsInflight = new Map(); // key = label -> { promise, resolve }
const fundSecidsQueue = new Set(); // Set(label)
let fundSecidsTimeout = null;

const processRelatedSectorsQueue = async () => {
  if (relatedSectorsQueue.size === 0) return;

  const currentQueues = new Map(relatedSectorsQueue);
  relatedSectorsQueue.clear();
  relatedSectorsTimeout = null;

  for (const [seg, codesSet] of currentQueues.entries()) {
    const missingCodes = Array.from(codesSet);
    if (missingCodes.length === 0) continue;

    try {
      const { data, error } = await withRetry(() =>
        supabase.from('fund_related').select('fund_code, related_sector').in('fund_code', missingCodes)
      );

      if (error) throw error;

      const foundMap = new Map();
      if (isArray(data)) {
        data.forEach((item) => {
          const c = String(item.fund_code).trim();
          const v = item.related_sector != null ? String(item.related_sector).trim() : '';
          foundMap.set(c, v);
        });
      }

      const qc = getQueryClient();
      for (const code of missingCodes) {
        const value = foundMap.get(code) || '';
        qc.setQueryData(qk.relatedSectors(code, seg), value, { staleTime: ONE_DAY_MS });

        const key = `${code}|${seg}`;
        const resolver = relatedSectorsInflight.get(key);
        if (resolver) {
          resolver.resolve(value);
          relatedSectorsInflight.delete(key);
        }
      }
    } catch (e) {
      for (const code of missingCodes) {
        const key = `${code}|${seg}`;
        const resolver = relatedSectorsInflight.get(key);
        if (resolver) {
          resolver.resolve('');
          relatedSectorsInflight.delete(key);
        }
      }
    }
  }
};

const processFundSecidsQueue = async () => {
  if (fundSecidsQueue.size === 0) return;

  const missingLabels = Array.from(fundSecidsQueue);
  fundSecidsQueue.clear();
  fundSecidsTimeout = null;

  try {
    const { data, error } = await withRetry(() =>
      supabase.from('fund_secid').select('related_sector, secid').in('related_sector', missingLabels)
    );

    if (error) throw error;

    const foundMap = new Map();
    if (isArray(data)) {
      data.forEach((item) => {
        const l = String(item.related_sector).trim();
        const s = item.secid != null ? String(item.secid).trim() : '';
        foundMap.set(l, s);
      });
    }

    const qc = getQueryClient();
    for (const label of missingLabels) {
      const value = foundMap.get(label) || '';
      qc.setQueryData(qk.fundSecid(label), value, { staleTime: ONE_DAY_MS });

      const resolver = fundSecidsInflight.get(label);
      if (resolver) {
        resolver.resolve(value);
        fundSecidsInflight.delete(label);
      }
    }
  } catch (e) {
    for (const label of missingLabels) {
      const resolver = fundSecidsInflight.get(label);
      if (resolver) {
        resolver.resolve('');
        fundSecidsInflight.delete(label);
      }
    }
  }
};

/**
 * 批量获取基金「关联板块」
 * @param {string[]} codes
 */
export const fetchRelatedSectorsBatch = async (codes, { cacheTime = ONE_DAY_MS, authSegment = 'anon' } = {}) => {
  if (!isArray(codes) || codes.length === 0) return {};
  if (!isSupabaseConfigured) return {};

  const seg = authSegment != null && authSegment !== '' ? String(authSegment) : 'anon';
  const qc = getQueryClient();
  const results = {};

  const promisesToWait = [];

  for (const c of codes) {
    const normalized = String(c).trim();
    if (!normalized) continue;

    // 优先从 React Query 同步缓存中取
    const cached = qc.getQueryData(qk.relatedSectors(normalized, seg));
    if (cached !== undefined) {
      results[normalized] = cached;
      continue;
    }

    const inflightKey = `${normalized}|${seg}`;
    if (relatedSectorsInflight.has(inflightKey)) {
      // 存在正在处理的相同请求，直接复用它的 Promise
      promisesToWait.push(
        relatedSectorsInflight.get(inflightKey).promise.then((val) => {
          results[normalized] = val;
        })
      );
    } else {
      // 新增一个微任务合并的 Promise
      let resolveFn;
      const promise = new Promise((resolve) => {
        resolveFn = resolve;
      });
      relatedSectorsInflight.set(inflightKey, { promise, resolve: resolveFn });

      if (!relatedSectorsQueue.has(seg)) {
        relatedSectorsQueue.set(seg, new Set());
      }
      relatedSectorsQueue.get(seg).add(normalized);

      promisesToWait.push(
        promise.then((val) => {
          results[normalized] = val;
        })
      );
    }
  }

  // 触发微任务级别的合并批量查询
  if (relatedSectorsQueue.size > 0 && !relatedSectorsTimeout) {
    relatedSectorsTimeout = setTimeout(processRelatedSectorsQueue, 0);
  }

  if (promisesToWait.length > 0) {
    await Promise.all(promisesToWait);
  }

  return results;
};

const SECTOR_QUOTE_CACHE_MS = 60 * 1000;

/**
 * 批量获取板块 secid
 * @param {string[]} labels
 */
export const fetchFundSecidsBatch = async (labels, { cacheTime = ONE_DAY_MS } = {}) => {
  if (!isArray(labels) || labels.length === 0) return {};
  if (!isSupabaseConfigured) return {};

  const qc = getQueryClient();
  const results = {};

  const promisesToWait = [];

  for (const label of labels) {
    const normalized = String(label).trim();
    if (!normalized) continue;

    // 优先从 React Query 同步缓存中取
    const cached = qc.getQueryData(qk.fundSecid(normalized));
    if (cached !== undefined) {
      results[normalized] = cached;
      continue;
    }

    if (fundSecidsInflight.has(normalized)) {
      // 存在正在处理的相同请求，直接复用它的 Promise
      promisesToWait.push(
        fundSecidsInflight.get(normalized).promise.then((val) => {
          results[normalized] = val;
        })
      );
    } else {
      // 新增一个微任务合并的 Promise
      let resolveFn;
      const promise = new Promise((resolve) => {
        resolveFn = resolve;
      });
      fundSecidsInflight.set(normalized, { promise, resolve: resolveFn });

      fundSecidsQueue.add(normalized);

      promisesToWait.push(
        promise.then((val) => {
          results[normalized] = val;
        })
      );
    }
  }

  // 触发微任务级别的合并批量查询
  if (fundSecidsQueue.size > 0 && !fundSecidsTimeout) {
    fundSecidsTimeout = setTimeout(processFundSecidsQueue, 0);
  }

  if (promisesToWait.length > 0) {
    await Promise.all(promisesToWait);
  }

  return results;
};

/**
 * 批量获取东方财富板块/指数行情（单次请求）
 * @param {string[]} secids
 * @returns {Promise<Record<string, { name: string, code: string, pct: number|null }|null>>}
 */
export const fetchEastmoneySectorQuotesBatch = async (secids, { cacheTime = SECTOR_QUOTE_CACHE_MS } = {}) => {
  if (!isArray(secids) || secids.length === 0) return {};
  if (typeof fetch === 'undefined') return {};

  const qc = getQueryClient();
  const results = {};
  const missingSecids = [];

  for (const secid of secids) {
    const s = secid != null ? String(secid).trim() : '';
    if (!s) continue;
    const cached = qc.getQueryData(qk.eastSectorQuote(s));
    if (cached !== undefined) {
      results[s] = cached;
    } else {
      missingSecids.push(s);
    }
  }

  if (missingSecids.length === 0) return results;

  const chunkSize = 20;
  const chunks = [];
  for (let i = 0; i < missingSecids.length; i += chunkSize) {
    chunks.push(missingSecids.slice(i, i + chunkSize));
  }

  try {
    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?fields=f12,f13,f14,f3&secids=${encodeURIComponent(chunk.join(','))}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const json = await res.json();
          const diff = json?.data?.diff;
          if (!isArray(diff)) return;

          for (const item of diff) {
            const code = item.f12 != null ? String(item.f12) : '';
            const market = item.f13 != null ? String(item.f13) : '';
            const key = market && code ? `${market}.${code}` : '';
            if (!key) continue;

            const f3 = item.f3;
            const pct = f3 != null && Number.isFinite(Number(f3)) ? Number(f3) / 100 : null;
            const quote = {
              name: item.f14 != null ? String(item.f14) : '',
              code,
              pct
            };

            results[key] = quote;
            qc.setQueryData(qk.eastSectorQuote(key), quote, { staleTime: cacheTime });
          }
        } catch (e) {
          console.error('Fetch sector quotes batch chunk error:', e);
        }
      })
    );

    for (const s of missingSecids) {
      if (results[s] === undefined) {
        results[s] = null;
        qc.setQueryData(qk.eastSectorQuote(s), null, { staleTime: cacheTime });
      }
    }
  } catch (e) {
    for (const s of missingSecids) {
      if (results[s] === undefined) results[s] = null;
    }
  }

  return results;
};

function normalizeEastmoneyScriptUrl(url) {
  let key = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('_');
    parsed.searchParams.delete('_t');
    key = parsed.toString();
  } catch (e) {}
  return key;
}

/** 东方财富 F10 / FundArchives 等 JSONP（window.apidata），不做缓存；由 loadScript / fetchQuery 控制 staleTime */
function runEastmoneyF10ScriptForApidata(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;

    let done = false;
    const cleanup = () => {
      done = true;
      if (timer) clearTimeout(timer);
      if (document.body.contains(script)) document.body.removeChild(script);
    };

    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      resolve({ ok: false, error: '请求超时' });
    }, timeoutMs);

    script.onload = () => {
      if (done) return;
      cleanup();
      let apidata;
      try {
        apidata = window?.apidata ? JSON.parse(JSON.stringify(window.apidata)) : undefined;
      } catch (e) {
        apidata = window?.apidata;
      }
      resolve({ ok: true, apidata });
    };

    script.onerror = () => {
      if (done) return;
      cleanup();
      resolve({ ok: false, error: '数据加载失败' });
    };

    document.body.appendChild(script);
  });
}

export const loadScript = (url, options = {}) => {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve(null);

  const { staleTime = 10 * 60 * 1000 } = options;
  const norm = normalizeEastmoneyScriptUrl(url);
  const qc = getQueryClient();

  return qc
    .fetchQuery({
      queryKey: qk.eastmoneyScript(norm),
      queryFn: () => runEastmoneyF10ScriptForApidata(url),
      staleTime: staleTime
    })
    .then((result) => {
      if (!result?.ok) {
        qc.removeQueries({ queryKey: qk.eastmoneyScript(norm) });
        throw new Error(result?.error || '数据加载失败');
      }
      return result.apidata;
    });
};

export const fetchFundNetValue = async (code, date) => {
  if (typeof window === 'undefined') return null;
  // F10DataApi.aspx 已失效，改用 pingzhongdata 查找指定日期净值
  try {
    const pz = await fetchFundPingzhongdata(String(code).trim(), { cacheTime: getNetValueStaleTime() });
    const trend = pz?.Data_netWorthTrend;
    if (!isArray(trend) || trend.length === 0) return null;
    for (const d of trend) {
      if (!d || !isNumber(d.x)) continue;
      const pointDate = dayjs(d.x).tz(TZ).format('YYYY-MM-DD');
      if (pointDate === date) {
        const nav = Number(d.y);
        return Number.isFinite(nav) ? nav : null;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

const parseLatestNetValueFromLsjzContent = (content) => {
  if (!content || content.includes('暂无数据')) return null;
  const rowMatches = content.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rowMatches) {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
    if (!cells.length) continue;
    const getText = (td) => td.replace(/<[^>]+>/g, '').trim();
    const dateStr = getText(cells[0] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    const navStr = getText(cells[1] || '');
    const nav = parseFloat(navStr);
    if (!Number.isFinite(nav)) continue;
    let growth = null;
    for (const c of cells) {
      const txt = getText(c);
      const m = txt.match(/([-+]?\d+(?:\.\d+)?)\s*%/);
      if (m) {
        growth = parseFloat(m[1]);
        break;
      }
    }
    return { date: dateStr, nav, growth };
  }
  return null;
};

/**
 * 解析历史净值数据（支持多条记录）
 * 返回按日期升序排列的净值数组
 */
/**
 * 根据 lsjz 升序净值列表推算「上一完整交易日」相对再前一日的涨跌幅与每份净值差（用于昨日收益）
 */
const computeYesterdayNavMetricsFromList = (navList) => {
  const out = { yesterdayZzl: null, yesterdayNavDelta: null };
  try {
    const len = navList.length;
    if (len < 2) return out;
    const rowPrev = navList[len - 2];
    out.yesterdayZzl = Number.isFinite(rowPrev?.growth) ? rowPrev.growth : null;
    if (len >= 3) {
      const navP = navList[len - 2].nav;
      const navPP = navList[len - 3].nav;
      if (Number.isFinite(navP) && Number.isFinite(navPP)) {
        out.yesterdayNavDelta = navP - navPP;
      }
    } else if (len === 2) {
      const r0 = navList[0];
      const g = r0.growth;
      if (Number.isFinite(g) && Number.isFinite(r0.nav)) {
        out.yesterdayNavDelta = r0.nav - r0.nav / (1 + g / 100);
      }
    }
  } catch {
    return out;
  }
  return out;
};

const parseNetValuesFromLsjzContent = (content) => {
  if (!content || content.includes('暂无数据')) return [];
  const rowMatches = content.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const results = [];
  for (const row of rowMatches) {
    const cells = row.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
    if (!cells.length) continue;
    const getText = (td) => td.replace(/<[^>]+>/g, '').trim();
    const dateStr = getText(cells[0] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    const navStr = getText(cells[1] || '');
    const nav = parseFloat(navStr);
    if (!Number.isFinite(nav)) continue;
    let growth = null;
    for (const c of cells) {
      const txt = getText(c);
      const m = txt.match(/([-+]?\d+(?:\.\d+)?)\s*%/);
      if (m) {
        growth = parseFloat(m[1]);
        break;
      }
    }

    let dividend = null;
    const divText = getText(cells[6] || '');
    const divMatch = divText.match(/派现金(\d+(?:\.\d+)?)/);
    if (divMatch) {
      dividend = parseFloat(divMatch[1]);
    }

    results.push({ date: dateStr, nav, growth, dividend });
  }
  // 返回按日期升序排列的结果（API返回的是倒序，需要反转）
  return results.reverse();
};

/**
 * 按日期区间批量拉取历史净值（lsjz），支持分页，减少逐日请求次数。
 * @param {string} code 基金代码
 * @param {string} sdate 开始 YYYY-MM-DD
 * @param {string} edate 结束 YYYY-MM-DD
 * @returns {Promise<Array<{ date: string, nav: number, growth: number|null }>>} 按日期升序
 */
export const fetchFundNetValueRange = async (code, sdate, edate) => {
  if (typeof window === 'undefined') return [];
  if (!isString(code) || !String(code).trim()) return [];
  if (
    !isString(sdate) ||
    !isString(edate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(sdate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(edate)
  ) {
    return [];
  }
  if (sdate > edate) return [];

  // F10DataApi.aspx 已失效，改用 pingzhongdata 作为数据源
  const c = String(code).trim();
  try {
    const pz = await fetchFundPingzhongdata(c);
    const trend = pz?.Data_netWorthTrend;
    if (!isArray(trend) || trend.length === 0) return [];

    const valid = trend.filter((d) => d && isNumber(d.x) && Number.isFinite(Number(d.y))).sort((a, b) => a.x - b.x);

    const byDate = new Map();
    const pointByDate = new Map();
    for (const d of valid) {
      const date = dayjs(d.x).tz(TZ).format('YYYY-MM-DD');
      const nav = Number(d.y);
      if (!Number.isFinite(nav) || nav <= 0) continue;
      byDate.set(date, nav);
      pointByDate.set(date, d);
    }

    const allDates = Array.from(byDate.keys()).sort();
    const results = [];
    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      if (date < sdate || date > edate) continue;
      const nav = byDate.get(date);
      let growth = null;
      if (i > 0) {
        const prevNav = byDate.get(allDates[i - 1]);
        if (Number.isFinite(prevNav) && prevNav > 0) {
          growth = ((nav - prevNav) / prevNav) * 100;
        }
      }
      let dividend = null;
      const point = pointByDate.get(date);
      const unitMoney = String(point?.unitMoney || '').trim();
      const divMatch = unitMoney.match(/派现金(\d+(?:\.\d+)?)/);
      if (divMatch) {
        dividend = parseFloat(divMatch[1]);
      }
      results.push({ date, nav, growth, dividend });
    }
    return results;
  } catch {
    return [];
  }
};

/**
 * 拉取基金历史分红数据。
 * @param {string} code 基金代码
 * @param {string} sdate 开始 YYYY-MM-DD
 * @returns {Promise<Array<{ date: string, dividend: number, nav: number }>>} 按日期升序
 */
export const fetchFundDividends = async (code, sdate) => {
  const edate = dayjs().format('YYYY-MM-DD');
  const rows = await fetchFundNetValueRange(code, sdate, edate);
  return rows
    .filter((r) => r.dividend !== undefined && r.dividend !== null)
    .map((r) => ({
      date: r.date,
      dividend: r.dividend,
      nav: r.nav
    }));
};

/**
 * 从业绩趋势接口（pingzhongdata.Data_netWorthTrend）提取指定日期范围的净值序列。
 * 返回格式与 fetchFundNetValueRange 完全一致，可作为 lsjz 的替代数据源。
 * @param {string} code 基金代码
 * @param {string} sdate 开始日期 YYYY-MM-DD（含）
 * @param {string} edate 结束日期 YYYY-MM-DD（含）
 * @param {object} [options]
 * @param {number} [options.cacheTime] - pingzhongdata 缓存时长，默认 1 小时
 * @returns {Promise<Array<{ date: string, nav: number, growth: number|null }>>} 按日期升序
 */
export const fetchNetValueRangeFromTrend = async (code, sdate, edate, options = {}) => {
  if (typeof window === 'undefined') return [];
  if (!isString(code) || !String(code).trim()) return [];
  if (
    !isString(sdate) ||
    !isString(edate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(sdate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(edate)
  ) {
    return [];
  }
  if (sdate > edate) return [];

  const { cacheTime = 60 * 60 * 1000 } = options;

  try {
    const pz = await fetchFundPingzhongdata(String(code).trim(), { cacheTime });
    const trend = pz?.Data_netWorthTrend;
    if (!isArray(trend) || trend.length === 0) return [];

    // 过滤出有效数据点并按时间升序排列
    const valid = trend.filter((d) => d && isNumber(d.x) && Number.isFinite(Number(d.y))).sort((a, b) => a.x - b.x);

    // 按日期去重（同一天可能有多个数据点，取最后一条）并转换格式
    const byDate = new Map();
    for (const d of valid) {
      const date = dayjs(d.x).tz(TZ).format('YYYY-MM-DD');
      const nav = Number(d.y);
      if (!Number.isFinite(nav) || nav <= 0) continue;
      byDate.set(date, nav); // 同日覆盖取最后一条
    }

    // 提取范围内数据并计算 growth（日涨跌幅）
    const allDates = Array.from(byDate.keys()).sort();
    const results = [];
    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      if (date < sdate || date > edate) continue;
      const nav = byDate.get(date);
      let growth = null;
      // 寻找前一个交易日净值用于计算涨跌幅
      if (i > 0) {
        const prevNav = byDate.get(allDates[i - 1]);
        if (Number.isFinite(prevNav) && prevNav > 0) {
          growth = ((nav - prevNav) / prevNav) * 100;
        }
      }
      results.push({ date, nav, growth });
    }

    return results;
  } catch {
    return [];
  }
};

/**
 * 从业绩趋势接口（pingzhongdata.Data_netWorthTrend）中提取最新有效的净值与涨跌幅信息，
 * 用于 F10 历史净值接口（lsjz）失效时的替代数据源。
 * @param {string} code 基金代码
 * @returns {Promise<{ dwjz: string, zzl: number, jzrq: string, lastNav: string|null, yesterdayZzl: number|null, yesterdayNavDelta: number|null }|null>}
 */
export const fetchNavMetricsFromTrendFallback = async (code) => {
  if (typeof window === 'undefined') return null;
  if (!isString(code) || !String(code).trim()) return null;

  try {
    const pz = await fetchFundPingzhongdata(String(code).trim(), { cacheTime: 60 * 60 * 1000 });
    const trend = pz?.Data_netWorthTrend;
    if (!isArray(trend) || trend.length === 0) return null;

    const valid = trend
      .filter(
        (d) =>
          isObject(d) &&
          isNumber(d.x) &&
          Number.isFinite(Number(d.y)) &&
          !isNil(d.equityReturn) &&
          Number.isFinite(Number(d.equityReturn))
      )
      .sort((a, b) => a.x - b.x);

    if (valid.length === 0) return null;

    const latest = valid[valid.length - 1];
    const prev = valid.length > 1 ? valid[valid.length - 2] : null;

    const dwjz = String(latest.y);
    const zzl = Number(latest.equityReturn);
    const jzrq = dayjs(latest.x).tz(TZ).format('YYYY-MM-DD');
    const lastNav = !isNil(prev) ? String(prev.y) : null;
    const yesterdayZzl =
      !isNil(prev) && !isNil(prev.equityReturn) && Number.isFinite(Number(prev.equityReturn))
        ? Number(prev.equityReturn)
        : null;
    const yesterdayNavDelta =
      !isNil(prev) && Number.isFinite(Number(prev.y)) ? Number(latest.y) - Number(prev.y) : null;

    return {
      dwjz,
      zzl,
      jzrq,
      lastNav,
      yesterdayZzl,
      yesterdayNavDelta
    };
  } catch {
    return null;
  }
};

const extractHoldingsReportDate = (html) => {
  if (!html) return null;

  // 优先匹配带有“报告期 / 截止日期”等关键字附近的日期
  const m1 = html.match(/(报告期|截止日期)[^0-9]{0,20}(\d{4}-\d{2}-\d{2})/);
  if (m1) return m1[2];

  // 兜底：取文中出现的第一个 yyyy-MM-dd 格式日期
  const m2 = html.match(/(\d{4}-\d{2}-\d{2})/);
  return m2 ? m2[1] : null;
};

const isLastQuarterReport = (reportDateStr) => {
  if (!reportDateStr) return false;

  const report = dayjs(reportDateStr, 'YYYY-MM-DD');
  if (!report.isValid()) return false;

  const now = nowInTz();
  // 允许最近 6 个月内的报告（覆盖上一季度 + 上上季度，兼容披露延迟）
  const sixMonthsAgo = now.subtract(6, 'month');
  return report.isAfter(sixMonthsAgo) && report.isBefore(now.add(7, 'day'));
};

export const fetchSmartFundNetValue = async (code, startDate) => {
  const today = nowInTz().startOf('day');
  let current = toTz(startDate).startOf('day');
  for (let i = 0; i < 30; i++) {
    if (current.isAfter(today)) break;
    const dateStr = current.format('YYYY-MM-DD');
    const val = await fetchFundNetValue(code, dateStr);
    if (val !== null) {
      return { date: dateStr, value: val };
    }
    current = current.add(1, 'day');
  }
  return null;
};

export const fetchSmartFundNetValueBackward = async (code, startDate) => {
  const today = nowInTz().startOf('day');
  let current = toTz(startDate).startOf('day');
  if (current.isAfter(today)) current = today;
  for (let i = 0; i < 30; i++) {
    const dateStr = current.format('YYYY-MM-DD');
    const val = await fetchFundNetValue(code, dateStr);
    if (val !== null) {
      return { date: dateStr, value: val };
    }
    current = current.subtract(1, 'day');
  }
  return null;
};

export const fetchFundDataFallback = async (c) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }
  return new Promise(async (resolve, reject) => {
    try {
      // 尝试并行获取 F10 数据和通过搜索接口获取基金名称
      const f10Promise = (async () => {
        // F10DataApi.aspx 已失效，直接使用 pingzhongdata 获取净值指标
        const trendFallback = await fetchNavMetricsFromTrendFallback(c);
        if (!isNil(trendFallback)) {
          return {
            latest: {
              date: trendFallback.jzrq,
              nav: trendFallback.dwjz,
              growth: trendFallback.zzl
            },
            previousNav: !isNil(trendFallback.lastNav) ? { nav: trendFallback.lastNav } : null,
            yM: {
              yesterdayZzl: trendFallback.yesterdayZzl,
              yesterdayNavDelta: trendFallback.yesterdayNavDelta
            }
          };
        }
        return { latest: null, previousNav: null, yM: { yesterdayZzl: null, yesterdayNavDelta: null } };
      })();

      const namePromise = (async () => {
        try {
          // 通过搜索接口查询该代码对应的基金详情
          const results = await searchFunds(c);
          const found = results.find((item) => item.CODE === c);
          return found ? found.NAME || found.SHORTNAME : null;
        } catch (e) {
          return null;
        }
      })();

      const [navResult, fundName] = await Promise.all([f10Promise, namePromise]);

      if (navResult && navResult.latest && navResult.latest.nav) {
        const { latest, previousNav, yM } = navResult;
        resolve({
          code: c,
          name: fundName || `基金(${c})`,
          dwjz: String(latest.nav),
          lastNav: previousNav ? String(previousNav.nav) : null,
          gsz: null,
          gztime: null,
          jzrq: latest.date,
          gszzl: null,
          zzl: Number.isFinite(latest.growth) ? latest.growth : null,
          yesterdayZzl: yM.yesterdayZzl,
          yesterdayNavDelta: yM.yesterdayNavDelta,
          noValuation: true,
          valuationSource: 'fallback',
          holdings: [],
          holdingsReportDate: null,
          holdingsIsLastQuarter: false
        });
      } else {
        reject(new Error('未能获取到基金数据'));
      }
    } catch (e) {
      reject(new Error('基金数据加载失败'));
    }
  });
};

const RTF_FUND_DEBUG_LS_KEY = 'rtf_debug_fund';
function fundDebugEnabled() {
  try {
    // 仅开发环境允许输出调试日志（避免生产环境污染控制台）
    if (typeof process !== 'undefined' && process?.env?.NODE_ENV === 'production') return false;
    if (typeof window === 'undefined') return false;
    const v = storageStore.getItem(RTF_FUND_DEBUG_LS_KEY);
    return v === '1' || v === 'true';
  } catch (e) {
    return false;
  }
}
function fundDebugLog(...args) {
  try {
    if (!fundDebugEnabled()) return;

    console.debug('[fund][debug]', ...args);
  } catch (e) {}
}

// ============================================================================
// FundValuationLast 批量微任务合并加载器 (DataLoader Pattern)
// 替代原 fundgz.1234567.com.cn 单只 JSONP 接口，支持批量获取
// 接口：https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast
// ============================================================================

const fundValuationLastInflight = new Map(); // code -> { promise, resolve, reject }
const fundValuationLastQueue = new Set(); // Set(code)
let fundValuationLastTimeout = null;

const FUND_VALUATION_LAST_FIELDS = 'FCODE,SHORTNAME,GSZZL,GZTIME,GSZ,NAV,PDATE';
const FUND_VALUATION_LAST_BATCH_SIZE = 50;
const FUND_VALUATION_LAST_STALE_TIME = 10 * 1000; // 10s
const FUND_VALUATION_LAST_TIMEOUT_MS = 8000;

const processFundValuationLastQueue = async () => {
  if (fundValuationLastQueue.size === 0) return;

  const currentQueue = Array.from(fundValuationLastQueue);
  fundValuationLastQueue.clear();
  fundValuationLastTimeout = null;

  // 按 BATCH_SIZE 分块请求
  const chunks = [];
  for (let i = 0; i < currentQueue.length; i += FUND_VALUATION_LAST_BATCH_SIZE) {
    chunks.push(currentQueue.slice(i, i + FUND_VALUATION_LAST_BATCH_SIZE));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FUND_VALUATION_LAST_TIMEOUT_MS);
      try {
        const url = `https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast?FCODES=${encodeURIComponent(chunk.join(','))}&FIELDS=${encodeURIComponent(FUND_VALUATION_LAST_FIELDS)}`;
        fundDebugLog('processFundValuationLastQueue', { count: chunk.length, codes: chunk });
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`FundValuationLast HTTP ${res.status}`);
        const json = await res.json();
        if (!json?.success) throw new Error('FundValuationLast API returned failure');
        const items = isArray(json.data) ? json.data : [];

        const qc = getQueryClient();
        const foundMap = new Map();
        for (const item of items) {
          const code = item.FCODE != null ? String(item.FCODE).trim() : '';
          if (!code) continue;
          // 注意：Number(null) === 0，必须先用 isNil 排除 null/undefined 再转换
          const gszNum = !isNil(item.GSZ) ? Number(item.GSZ) : NaN;
          const gszzlNum = !isNil(item.GSZZL) ? Number(item.GSZZL) : NaN;
          const navNum = !isNil(item.NAV) ? Number(item.NAV) : NaN;
          const valuation = {
            code,
            gsz: Number.isFinite(gszNum) ? gszNum : null,
            gztime: !isNil(item.GZTIME) ? String(item.GZTIME).replace(/:(\d{2}):\d{2}$/, ':$1') : null,
            gszzl: Number.isFinite(gszzlNum) ? gszzlNum : null,
            valuationSource: 'fundgz'
          };
          // 附带字段（新接口比旧 fundgz JSONP 多提供净值与名称，供 fetchFundData 直接使用）
          if (!isNil(item.SHORTNAME)) valuation.name = String(item.SHORTNAME);
          if (Number.isFinite(navNum)) valuation.dwjz = String(navNum);
          if (!isNil(item.PDATE)) valuation.jzrq = String(item.PDATE);

          foundMap.set(code, valuation);
          qc.setQueryData(qk.fundValuationLast(code), valuation, { staleTime: FUND_VALUATION_LAST_STALE_TIME });
        }

        // 分发结果
        for (const code of chunk) {
          const resolver = fundValuationLastInflight.get(code);
          if (!resolver) continue;
          const val = foundMap.get(code);
          if (val) {
            resolver.resolve(val);
          } else {
            resolver.reject(new Error(`FundValuationLast no data for ${code}`));
          }
          fundValuationLastInflight.delete(code);
        }
      } catch (e) {
        clearTimeout(timer);
        fundDebugLog('processFundValuationLastQueue error', { error: e?.message, codes: chunk });
        // 该分片内所有 code 统一 reject
        for (const code of chunk) {
          const resolver = fundValuationLastInflight.get(code);
          if (!resolver) continue;
          resolver.reject(e);
          fundValuationLastInflight.delete(code);
        }
      }
    })
  );
};

/**
 * 批量获取基金估值（FundValuationLast API）
 * 内部使用微任务合并（setTimeout 0），将同一事件循环内的并发单只请求合并为一次批量 API 调用。
 * @param {string} code - 基金编码
 * @returns {Promise<UnifiedFundValuation>}
 */
const fetchFundValuationLastBatched = (code) => {
  const c = code != null ? String(code).trim() : '';
  if (!c) return Promise.reject(new Error('基金编码无效'));

  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.reject(new Error('无浏览器环境'));
  }

  // 优先读 TanStack Query 缓存
  const qc = getQueryClient();
  const cached = qc.getQueryData(qk.fundValuationLast(c));
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  // 去重：已有相同 code 的 inflight 请求时直接复用
  const existing = fundValuationLastInflight.get(c);
  if (existing) return existing.promise;

  // 新增 inflight + 入队
  let resolveFn;
  let rejectFn;
  const promise = new Promise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  fundValuationLastInflight.set(c, { promise, resolve: resolveFn, reject: rejectFn });
  fundValuationLastQueue.add(c);

  // 触发微任务合并
  if (fundValuationLastQueue.size > 0 && !fundValuationLastTimeout) {
    fundValuationLastTimeout = setTimeout(processFundValuationLastQueue, 0);
  }

  return promise;
};

/** 同一基金代码并发的新浪估值 JSONP 去重，避免数据源 2/3 各打一遍 */
const sinaEstimateNetworthInflight = new Map();

function normalizeValuationDataSource(dataSource) {
  const n = Number(dataSource);
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 1;
}

/**
 * 新浪 FdFundService.getEstimateNetworthPic 原始响应（含 networth 序列）
 * @param {string} code
 * @returns {Promise<object|null>}
 */
function fetchSinaEstimateNetworthResponse(code) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('无浏览器环境'));
  }
  const c = code != null ? String(code).trim() : '';
  if (!c) return Promise.reject(new Error('基金编码无效'));

  const existing = sinaEstimateNetworthInflight.get(c);
  if (existing) return existing;

  const p = new Promise((resolve, reject) => {
    fundDebugLog('fetchSinaEstimateNetworth start', { code: c });
    const callbackName = `jsonp_sina_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const url = `https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getEstimateNetworthPic?symbol=${c}&callback=${callbackName}`;

    const scriptSina = document.createElement('script');
    let timer;

    const cleanupScript = () => {
      if (timer) clearTimeout(timer);
      try {
        delete window[callbackName];
      } catch (e) {}
      if (document.body && document.body.contains(scriptSina)) {
        document.body.removeChild(scriptSina);
      }
    };

    window[callbackName] = (res) => {
      cleanupScript();
      resolve(res);
    };

    timer = setTimeout(() => {
      cleanupScript();
      resolve(null);
    }, 10000);

    scriptSina.src = url;
    scriptSina.async = true;
    scriptSina.onerror = () => {
      cleanupScript();
      reject(new Error('sina script error'));
    };
    document.body.appendChild(scriptSina);
  }).finally(() => {
    sinaEstimateNetworthInflight.delete(c);
  });

  sinaEstimateNetworthInflight.set(c, p);
  return p;
}

/**
 * 统一估值结构（仅估值相关字段）
 * @typedef {object} UnifiedFundValuation
 * @property {string} code
 * @property {number | null} gsz - 估算净值
 * @property {string | null} gztime - 估值时间
 * @property {number | null} gszzl - 估算涨跌幅（百分比数值，如 1.23 表示 +1.23%）
 * @property {string} valuationSource - 如 fundgz、sina_ds2、sina_ds3
 */

/**
 * 从 Supabase gs_qdii 表获取 QDII 基金的估值数据（数据源 4）
 */
export const fetchQdiiValuationFromSupabase = async (code) => {
  if (!code || !isSupabaseConfigured) return null;
  const normalized = String(code).trim();
  if (!normalized) return null;

  try {
    const { data, error } = await withRetry(() =>
      supabase.from('gs_qdii').select('gztime, gszzl, gzstatus').eq('fund_code', normalized).maybeSingle()
    );

    if (error || !data) return null;

    // gszzl 在表中是 real，通常为百分比数值（如 1.23 表示 1.23%）
    return {
      gztime: data.gztime != null ? String(data.gztime).replace(/:(\d{2}):\d{2}$/, ':$1') : null,
      gszzl: data.gszzl != null && Number.isFinite(Number(data.gszzl)) ? Number(data.gszzl) : null,
      valuationSource: 'supabase_qdii',
      gzstatus: data.gzstatus
    };
  } catch (e) {
    return null;
  }
};

/**
 * 检查指定基金编码是否存在于 Supabase gs_qdii 表中
 * 结果通过 TanStack Query 缓存 12 小时。
 * @param {string} code - 基金编码
 * @returns {Promise<boolean>}
 */
export const isQdiiFund = async (code) => {
  if (!code || !isSupabaseConfigured) return false;
  const normalized = String(code).trim();
  if (!normalized) return false;

  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: qk.isQdiiFund(normalized),
      queryFn: async () => {
        const { data, error } = await withRetry(() =>
          supabase.from('gs_qdii').select('fund_code').eq('fund_code', normalized).maybeSingle()
        );
        return !error && data != null;
      },
      staleTime: 12 * 60 * 60 * 1000
    });
  } catch {
    return false;
  }
};

/**
 * 通过 Edge Function best-valuation-source 查询指定日期各数据源估值，
 * 与实际涨跌幅比对，返回最准确的数据源编号。
 *
 * @param {string} code - 基金代码
 * @param {string} jzrq - 最新净值日期（如 "2026-06-10"）
 * @param {number} actualZzl - 实际涨跌幅（百分比，如 1.23 表示 +1.23%）
 * @returns {Promise<{ bestSource: number|null, isYesterdayAccuracy: boolean, isTodayAccuracy: boolean, diffs: Object<string,number>, diff?: number }|null>}
 */
export async function fetchBestValuationSource(code, jzrq, actualZzl) {
  if (!isSupabaseConfigured || !supabase?.functions?.invoke) return null;
  const c = code != null ? String(code).trim() : '';
  if (!c || !jzrq || !isNumber(actualZzl) || !Number.isFinite(actualZzl)) return null;

  const qc = getQueryClient();
  const cacheKey = qk.bestValuationSource(c, jzrq, actualZzl);
  const cached = qc.getQueryData(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const { data, error } = await withRetry(() =>
      supabase.functions.invoke('best-valuation-source', {
        body: { code: c, jzrq, actualZzl }
      })
    );

    if (error || !data?.success) return null;
    const res = data.data || null;
    qc.setQueryData(cacheKey, res, { staleTime: 60 * 60 * 1000 });
    return res;
  } catch (e) {
    return null;
  }
}

/**
 * 调用 Supabase RPC 获取基金最佳数据源（从 fund_pingzhongdata 表中预计算的 source 字段）
 * @param {string} fundCode - 基金编码
 * @returns {Promise<number|null>} 数据源 ID (1/2/3) 或 null
 */
const SOURCE_NAME_TO_ID = { fundgz: 1, sina_ds2: 2, sina_ds3: 3, supabase_qdii: 4 };

export async function fetchFundBestSource(fundCode) {
  if (!isSupabaseConfigured) return null;
  const code = fundCode != null ? String(fundCode).trim() : '';
  if (!code) return null;

  const qc = getQueryClient();
  const cacheKey = qk.fundBestSource(code);
  const cached = qc.getQueryData(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const { data, error } = await supabase.rpc('get_fund_best_source', {
      p_fund_code: code
    });
    if (error || !data?.source) return null;
    const res = SOURCE_NAME_TO_ID[data.source] ?? null;
    if (res != null) {
      qc.setQueryData(cacheKey, res, { staleTime: 60 * 60 * 1000 });
    }
    return res;
  } catch {
    return null;
  }
}

/**
 * 批量获取多个基金的最佳数据源
 * @param {string[]} fundCodes - 基金编码数组
 * @returns {Promise<Record<string, number>>} 返回对象格式 { "110022": 1, "000001": 2 }
 */
export async function fetchFundsBestSources(fundCodes) {
  if (!isSupabaseConfigured || !isArray(fundCodes) || fundCodes.length === 0) return {};

  const qc = getQueryClient();
  const result = {};
  const missingCodes = [];

  for (const c of fundCodes) {
    const code = c != null ? String(c).trim() : '';
    if (!code) continue;
    const cached = qc.getQueryData(qk.fundBestSource(code));
    if (cached !== undefined) {
      result[code] = cached;
    } else {
      missingCodes.push(code);
    }
  }

  if (missingCodes.length === 0) return result;

  try {
    const { data, error } = await supabase.rpc('get_fund_best_source', {
      p_fund_codes: missingCodes
    });
    if (error || !data) return result;

    // 返回的 data 类似 { "110022": "sina_ds2", "000001": "fundgz" }
    Object.entries(data).forEach(([code, sourceName]) => {
      const id = SOURCE_NAME_TO_ID[sourceName];
      if (id != null) {
        result[code] = id;
        qc.setQueryData(qk.fundBestSource(code), id, { staleTime: 60 * 60 * 1000 });
      }
    });
    return result;
  } catch {
    return result;
  }
}

/**
 * 按基金编码与数据源类型获取估值（天天基金 fundgz 或新浪估算曲线末点）。
 * @param {string} code - 基金编码
 * @param {number | string} [dataSource=1] - 1 天天基金；2、3 新浪估算不同口径；4 Supabase QDII
 * @returns {Promise<UnifiedFundValuation>}
 */
export async function fetchFundValuationBySource(code, dataSource = 1) {
  const c = code != null ? String(code).trim() : '';
  if (!c) throw new Error('基金编码无效');

  const ds = normalizeValuationDataSource(dataSource);

  // 数据源 4：Supabase gs_qdii 表
  if (ds === 4) {
    const qdii = await fetchQdiiValuationFromSupabase(c);
    if (!qdii) throw new Error('gs_qdii no data');
    return {
      code: c,
      ...qdii,
      gsz: null // 由 fetchFundData 等调用方配合 dwjz 计算
    };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }

  if (ds === 2 || ds === 3) {
    fundDebugLog('fetchFundValuationBySource sina', { code: c, dataSource: ds });
    const res = await fetchSinaEstimateNetworthResponse(c);
    if (!res?.result?.data?.networth || !isArray(res.result.data.networth) || res.result.data.networth.length === 0) {
      throw new Error('sina no data');
    }
    const networth = res.result.data.networth;
    const lastPoint = networth[networth.length - 1];
    const gRate = ds === 2 ? parseFloat(lastPoint.growthrate) : parseFloat(lastPoint.growthrate2);
    const preNav = ds === 2 ? parseFloat(lastPoint.pre_nav) : parseFloat(lastPoint.pre_nav2);
    const gsz = Number.isFinite(preNav) ? preNav : null;
    const gszzl = Number.isFinite(gRate) ? gRate * 100 : null;
    if (gsz == null && gszzl == null) {
      throw new Error('sina empty point');
    }

    // 构建分时估值序列，格式与 fundValuationTimeseries 一致
    const navKey = ds === 2 ? 'pre_nav' : 'pre_nav2';
    const timeseries = [];
    const seen = new Set();
    for (const point of networth) {
      const value = parseFloat(point[navKey]);
      if (!Number.isFinite(value)) continue;
      const time = point.min_time || null;
      const date = point.pre_date || null;
      if (!time || !date) continue;
      const key = `${date} ${time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      timeseries.push({ time, value, date });
    }

    return {
      code: c,
      gsz,
      gztime: lastPoint.min_time
        ? `${lastPoint.pre_date} ${lastPoint.min_time}`.replace(/:(\d{2}):\d{2}$/, ':$1')
        : null,
      gszzl,
      valuationSource: `sina_ds${ds}`,
      fundValuationTimeseries: { [c]: timeseries }
    };
  }

  // 数据源 1：天天基金 FundValuationLast API（支持批量，内部自动合并并发请求）
  fundDebugLog('fetchFundValuationBySource fundvaluationlast', { code: c });
  return fetchFundValuationLastBatched(c);
}

/**
 * 获取基金申赎确认天数（SSBCFMDATA）
 * 通过天天基金移动端 API FundMNBaseInfo 获取。
 * - 返回 1 表示 T+1 确认（普通 A 股基金）
 * - 返回 2 表示 T+2 确认（QDII 等跨境基金）
 * - 返回 null 表示获取失败
 *
 * 结果通过 TanStack Query 缓存 24 小时（此属性极少变动）。
 * @param {string} code - 基金代码
 * @returns {Promise<number|null>}
 */
export const fetchFundConfirmDays = async (code) => {
  const c = code != null ? String(code).trim() : '';
  if (!c) return null;

  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: qk.fundConfirmDays(c),
      queryFn: async () => {
        const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNBaseInfo?FCODE=${c}&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=rtf${Date.now()}`;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const json = await resp.json();
        if (!json || !json.Success || !json.Datas) return null;
        const raw = json.Datas.SSBCFMDATA;
        const num = Number(raw);
        return Number.isFinite(num) && num > 0 ? num : null;
      },
      staleTime: ONE_DAY_MS
    });
  } catch (e) {
    return null;
  }
};

export const fetchFundData = async (c, overrideDataSource) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }

  const code = c != null ? String(c).trim() : '';
  if (!code) return fetchFundDataFallback(c);

  let dataSource = overrideDataSource || 1;
  let storedName = null;
  let storedValuationSource = null;
  if (!overrideDataSource) {
    try {
      const arr = storageStore.getItem('funds', []);
      if (isArray(arr)) {
        const f = arr.find((x) => x.code === code);
        if (f) {
          if (f.dataSource) dataSource = f.dataSource;
          if (f.name) storedName = f.name;
          if (f.valuationSource) storedValuationSource = f.valuationSource;
        }
      }
    } catch (e) {}
  }

  // F10DataApi.aspx 已失效，直接使用 pingzhongdata 获取历史净值指标
  const lsjzPromise = fetchNavMetricsFromTrendFallback(code);

  // 2. 发起估值请求
  const gzPromise = fetchFundValuationBySource(code, dataSource);

  // 3. 编排并合并数据
  return new Promise(async (resolve, reject) => {
    let baseData = null;
    try {
      baseData = await gzPromise;
    } catch (e) {
      try {
        baseData = await fetchFundDataFallback(code);
      } catch (fbErr) {
        reject(fbErr);
        return;
      }
    }

    const [tData] = await Promise.all([lsjzPromise]);

    if (tData) {
      if (tData.jzrq && (!baseData.jzrq || tData.jzrq >= baseData.jzrq)) {
        baseData.dwjz = tData.dwjz;
        baseData.jzrq = tData.jzrq;
        baseData.zzl = tData.zzl;
        baseData.lastNav = tData.lastNav;
      } else if (!baseData.dwjz && tData.dwjz) {
        // Fallback for Sina which doesn't provide dwjz/jzrq
        baseData.dwjz = tData.dwjz;
        baseData.jzrq = tData.jzrq;
        baseData.zzl = tData.zzl;
        baseData.lastNav = tData.lastNav;
      }
      if (Object.prototype.hasOwnProperty.call(tData, 'yesterdayZzl')) {
        baseData.yesterdayZzl = tData.yesterdayZzl;
      }
      if (Object.prototype.hasOwnProperty.call(tData, 'yesterdayNavDelta')) {
        baseData.yesterdayNavDelta = tData.yesterdayNavDelta;
      }
    }

    // 针对 supabase_qdii 等仅提供 gszzl 的数据源，使用最新的 dwjz 计算 gsz
    if (baseData.valuationSource === 'supabase_qdii' || (baseData.gsz == null && baseData.gszzl != null)) {
      const nav = Number(baseData.dwjz);
      const gszzl = Number(baseData.gszzl);
      if (Number.isFinite(nav) && Number.isFinite(gszzl)) {
        baseData.gsz = nav * (1 + gszzl / 100);
      }
    }

    if (!baseData.name) {
      // 优先使用 localStorage 中已存储的基金名称，避免不必要的 searchFunds 网络请求
      if (storedName) {
        baseData.name = storedName;
      } else {
        try {
          const results = await searchFunds(code);
          const found = results.find((item) => item.CODE === code);
          if (found) baseData.name = found.NAME || found.SHORTNAME;
        } catch (e) {}
      }
    }

    resolve({
      ...baseData
    });
  });
};

export const fetchFundHoldings = async (code) => {
  if (!code) return { holdings: [], holdingsReportDate: null, holdingsIsLastQuarter: false };
  return new Promise((resolveH) => {
    fundDebugLog('fetchFundHoldings start', { code });
    // FundArchivesDatas.aspx 已失效，改用移动端 API FundMNInverstPosition
    const holdingsUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE=${code}&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0`;
    getQueryClient()
      .fetchQuery({
        queryKey: qk.fundHoldingsArchives(code),
        queryFn: async () => {
          const resp = await fetch(holdingsUrl);
          if (!resp.ok) throw new Error('数据加载失败');
          const json = await resp.json();
          if (!json || !json.Success) throw new Error(json?.ErrMsg || '数据加载失败');
          return json;
        },
        staleTime: 60 * 60 * 1000
      })
      .then(async (json) => {
        let holdings = [];
        const holdingsReportDate = json?.Expansion || null;
        const holdingsIsLastQuarter = isLastQuarterReport(holdingsReportDate);

        // 如果不是上一季度末的披露数据，则不展示重仓（并避免继续解析/请求行情）
        if (!holdingsIsLastQuarter) {
          resolveH({ holdings: [], holdingsReportDate, holdingsIsLastQuarter: false });
          return;
        }

        // 从移动端 API 响应中解析重仓股
        const fundStocks = json?.Datas?.fundStocks || [];
        for (const s of fundStocks) {
          const hc = String(s.GPDM || '').trim();
          const hn = String(s.GPJC || '').trim();
          const hw = s.JZBL ? `${s.JZBL}%` : '';
          if (hc || hn || hw) {
            holdings.push({ code: hc, name: hn, weight: hw, change: null });
          }
        }
        holdings = holdings.slice(0, 10);
        const normalizeTencentCode = (input) => {
          const raw = String(input || '').trim();
          if (!raw) return null;
          // already normalized tencent styles (normalize prefix casing)
          const mPref = raw.match(/^(us|hk|sh|sz|bj)(.+)$/i);
          if (mPref) {
            const p = mPref[1].toLowerCase();
            const rest = String(mPref[2] || '').trim();
            // usAAPL / usIXIC: rest use upper; hk00700 keep digits
            return `${p}${/^\d+$/.test(rest) ? rest : rest.toUpperCase()}`;
          }
          const mSPref = raw.match(/^s_(sh|sz|bj|hk)(.+)$/i);
          if (mSPref) {
            const p = mSPref[1].toLowerCase();
            const rest = String(mSPref[2] || '').trim();
            return `s_${p}${/^\d+$/.test(rest) ? rest : rest.toUpperCase()}`;
          }

          // A股/北证
          if (/^\d{6}$/.test(raw)) {
            const pfx =
              raw.startsWith('6') || raw.startsWith('9')
                ? 'sh'
                : raw.startsWith('4') || raw.startsWith('8')
                  ? 'bj'
                  : 'sz';
            return `s_${pfx}${raw}`;
          }
          // 港股（数字）
          if (/^\d{5}$/.test(raw)) return `s_hk${raw}`;

          // 形如 0700.HK / 00001.HK
          const mHkDot = raw.match(/^(\d{4,5})\.(?:HK)$/i);
          if (mHkDot) return `s_hk${mHkDot[1].padStart(5, '0')}`;

          // 形如 AAPL / TSLA.US / AAPL.O / BRK.B（腾讯接口对“.”支持不稳定，优先取主代码）
          const mUsDot = raw.match(/^([A-Za-z]{1,10})(?:\.[A-Za-z]{1,6})$/);
          if (mUsDot) return `us${mUsDot[1].toUpperCase()}`;
          if (/^[A-Za-z]{1,10}$/.test(raw)) return `us${raw.toUpperCase()}`;

          return null;
        };

        const getTencentVarName = (tencentCode) => {
          const cd = String(tencentCode || '').trim();
          if (!cd) return '';
          // s_* uses v_s_*
          if (/^s_/i.test(cd)) return `v_${cd}`;
          // us/hk/sh/sz/bj uses v_{code}
          return `v_${cd}`;
        };

        const needQuotes = holdings
          .map((h) => ({
            h,
            tencentCode: normalizeTencentCode(h.code)
          }))
          .filter((x) => Boolean(x.tencentCode));
        if (needQuotes.length) {
          try {
            const tencentCodes = needQuotes.map((x) => x.tencentCode).join(',');
            if (!tencentCodes) {
              resolveH({ holdings, holdingsReportDate, holdingsIsLastQuarter });
              return;
            }
            const quoteUrl = `https://qt.gtimg.cn/q=${tencentCodes}`;
            await new Promise((resQuote) => {
              const scriptQuote = document.createElement('script');
              scriptQuote.src = quoteUrl;
              let quoteDone = false;
              const cleanupQuote = () => {
                quoteDone = true;
                if (quoteTimer) clearTimeout(quoteTimer);
                if (document.body.contains(scriptQuote)) document.body.removeChild(scriptQuote);
              };
              const quoteTimer = setTimeout(() => {
                if (quoteDone) return;
                cleanupQuote();
                resQuote();
              }, 10000);
              scriptQuote.onload = () => {
                if (quoteDone) return;
                needQuotes.forEach(({ h, tencentCode }) => {
                  const varName = getTencentVarName(tencentCode);
                  const dataStr = varName ? window[varName] : null;
                  if (dataStr) {
                    const parts = dataStr.split('~');
                    const isUS = /^us/i.test(String(tencentCode || ''));
                    const idx = isUS ? 32 : 5;
                    if (parts.length > idx) {
                      h.change = parseFloat(parts[idx]);
                    }
                  }
                });
                cleanupQuote();
                resQuote();
              };
              scriptQuote.onerror = () => {
                cleanupQuote();
                resQuote();
              };
              document.body.appendChild(scriptQuote);
            });
          } catch (e) {}
        }

        let assetAllocation = [];
        try {
          const pz = await fetchFundPingzhongdata(code);
          const rawSeries = pz?.Data_assetAllocation?.series || [];
          let filtered = rawSeries.filter((s) => s.type !== 'line' && !String(s.name || '').includes('净资产'));
          let sum = 0;
          let parsedSeries = [];
          filtered.forEach((s) => {
            if (s.data && s.data.length > 0) {
              const val = Number(s.data[s.data.length - 1]);
              if (!Number.isNaN(val) && val > 0) {
                sum += val;
                parsedSeries.push({ name: String(s.name).replace('占净比', ''), value: val });
              }
            }
          });
          if (sum < 100 && parsedSeries.length > 0) {
            const other = 100 - sum;
            if (other >= 0.01) {
              parsedSeries.push({ name: '其他', value: other });
            }
          }
          assetAllocation = parsedSeries;
        } catch (e) {}

        resolveH({ holdings, holdingsReportDate, holdingsIsLastQuarter, assetAllocation });
        fundDebugLog('fetchFundHoldings resolved', {
          code,
          holdingsCount: holdings?.length || 0,
          holdingsReportDate,
          holdingsIsLastQuarter
        });
      })
      .catch(() =>
        resolveH({ holdings: [], holdingsReportDate: null, holdingsIsLastQuarter: false, assetAllocation: [] })
      );
  });
};

export const searchFunds = async (val) => {
  const normalized = String(val || '').trim();
  if (!normalized) return [];
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];

  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: qk.fundSearch(normalized),
      queryFn: async () => {
        const callbackName = `SuggestData_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(normalized)}&callback=${callbackName}&_=${Date.now()}`;

        return new Promise((resolve, reject) => {
          let done = false;
          const cleanup = () => {
            done = true;
            if (timer) clearTimeout(timer);
            if (document.body.contains(script)) document.body.removeChild(script);
          };

          const timer = setTimeout(() => {
            if (done) return;
            cleanup();
            delete window[callbackName];
            reject(new Error('搜索请求超时'));
          }, 10000);

          window[callbackName] = (data) => {
            if (done) return;
            let results = [];
            if (data && data.Datas) {
              results = data.Datas.filter(
                (d) => d.CATEGORY === 700 || d.CATEGORY === '700' || d.CATEGORYDESC === '基金'
              );
            }
            cleanup();
            delete window[callbackName];
            resolve(results);
          };

          const script = document.createElement('script');
          script.src = url;
          script.async = true;
          script.onload = () => {
            // Callback usually handles cleanup, but onload is a backup
          };
          script.onerror = () => {
            if (done) return;
            cleanup();
            delete window[callbackName];
            reject(new Error('搜索请求失败'));
          };
          document.body.appendChild(script);
        });
      },
      staleTime: ONE_DAY_MS
    });
  } catch (e) {
    return [];
  }
};

export const fetchShanghaiIndexDate = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://qt.gtimg.cn/q=sh000001&_t=${Date.now()}`;
    let done = false;
    const cleanup = () => {
      done = true;
      if (timer) clearTimeout(timer);
      if (document.body.contains(script)) document.body.removeChild(script);
    };
    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      reject(new Error('数据请求超时'));
    }, 10000);

    script.onload = () => {
      if (done) return;
      const data = window.v_sh000001;
      let dateStr = null;
      if (data) {
        const parts = data.split('~');
        if (parts.length > 30) {
          dateStr = parts[30].slice(0, 8);
        }
      }
      cleanup();
      resolve(dateStr);
    };
    script.onerror = () => {
      if (done) return;
      cleanup();
      reject(new Error('指数数据加载失败'));
    };
    document.body.appendChild(script);
  });
};

/** 大盘指数项：name, code, price, change, changePercent
 *  同时用于：
 *  - qt.gtimg.cn 实时快照（code 用于 q= 参数，varKey 为全局变量名）
 *  - 分时 mini 图（code 传给 minute/query，当不支持分时时会自动回退占位折线）
 *
 *  参照产品图：覆盖主要 A 股宽基 + 创业/科创 + 部分海外与港股指数。
 */
const MARKET_INDEX_KEYS = [
  // 行 1：上证 / 深证
  { code: 'sh000001', varKey: 'v_sh000001', name: '上证指数' },
  { code: 'sh000016', varKey: 'v_sh000016', name: '上证50' },
  { code: 'sz399001', varKey: 'v_sz399001', name: '深证成指' },
  { code: 'sz399330', varKey: 'v_sz399330', name: '深证100' },

  // 行 2：北证 / 沪深300 / 创业板
  { code: 'bj899050', varKey: 'v_bj899050', name: '北证50' },
  { code: 'sh000300', varKey: 'v_sh000300', name: '沪深300' },
  { code: 'sz399006', varKey: 'v_sz399006', name: '创业板指' },
  { code: 'sz399102', varKey: 'v_sz399102', name: '创业板综' },

  // 行 3：创业板 50 / 科创
  { code: 'sz399673', varKey: 'v_sz399673', name: '创业板50' },
  { code: 'sh000688', varKey: 'v_sh000688', name: '科创50' },
  { code: 'sz399005', varKey: 'v_sz399005', name: '中小100' },

  // 行 4：中证系列
  { code: 'sh000905', varKey: 'v_sh000905', name: '中证500' },
  { code: 'sh000906', varKey: 'v_sh000906', name: '中证800' },
  { code: 'sh000852', varKey: 'v_sh000852', name: '中证1000' },
  { code: 'sh000903', varKey: 'v_sh000903', name: '中证A100' },

  // 行 5：等权 / 国证 / 纳指
  { code: 'sh000932', varKey: 'v_sh000932', name: '中证消费' },
  { code: 'sz399303', varKey: 'v_sz399303', name: '国证2000' },
  { code: 'usIXIC', varKey: 'v_usIXIC', name: '纳斯达克' },
  { code: 'usNDX', varKey: 'v_usNDX', name: '纳斯达克100' },

  // 行 6：美股三大 + 恒生
  { code: 'usINX', varKey: 'v_usINX', name: '标普500' },
  { code: 'usDJI', varKey: 'v_usDJI', name: '道琼斯' },
  { code: 'hkHSI', varKey: 'v_hkHSI', name: '恒生指数' },
  { code: 'hkHSTECH', varKey: 'v_hkHSTECH', name: '恒生科技指数' },

  // 行 7：欧洲三大股指
  { code: 'gzFTSE', varKey: 'v_gzFTSE', name: '富时100' },
  { code: 'gzFCHI', varKey: 'v_gzFCHI', name: 'CAC40' },
  { code: 'gzGDAXI', varKey: 'v_gzGDAXI', name: '德国DAX' },

  // 行 8：日本股指
  { code: 'gzN225', varKey: 'v_gzN225', name: '日经225' },
  { code: 'gzTPX', varKey: 'v_gzTPX', name: '东证指数' },

  // 行 9：韩国股指
  { code: 'gzKS11', varKey: 'v_gzKS11', name: '韩国综合' },
  { code: 'gzKOSDAQ', varKey: 'v_gzKOSDAQ', name: '韩国创业板' }
];

function parseIndexRaw(data) {
  if (!data || !isString(data)) return null;
  const parts = data.split('~');
  if (parts.length < 33) return null;
  const name = parts[1] || '';
  const price = parseFloat(parts[3], 10);
  const change = parseFloat(parts[31], 10);
  const changePercent = parseFloat(parts[32], 10);
  if (Number.isNaN(price)) return null;
  return {
    name,
    price: Number.isFinite(price) ? price : 0,
    change: Number.isFinite(change) ? change : 0,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0
  };
}

function parseGlobalIndexRaw(data) {
  if (!data || !isString(data)) return null;
  const parts = data.split('~');
  if (parts.length < 6) return null;
  const name = parts[1] || '';
  const price = parseFloat(parts[3], 10);
  const change = parseFloat(parts[4], 10);
  const changePercent = parseFloat(parts[5], 10);
  if (Number.isNaN(price)) return null;
  return {
    name,
    price: Number.isFinite(price) ? price : 0,
    change: Number.isFinite(change) ? change : 0,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0
  };
}

const fetchTopixFromWorker = async () => {
  try {
    const res = await fetch('https://getgztpx.934585316.workers.dev/');
    if (res.ok) {
      const json = await res.json();
      if (json?.success && json?.data) {
        return json.data;
      }
    }
  } catch (e) {
    console.warn('Fetch TOPIX from Cloudflare Worker failed:', e);
  }
  return null;
};

export const fetchMarketIndices = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];

  const fetchTencentIndices = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const codes = MARKET_INDEX_KEYS.map((item) => item.code).join(',');
    script.src = `https://qt.gtimg.cn/q=${codes}&_t=${Date.now()}`;
    let done = false;
    const cleanup = () => {
      done = true;
      if (timer) clearTimeout(timer);
      if (document.body.contains(script)) document.body.removeChild(script);
    };
    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      reject(new Error('数据请求超时'));
    }, 10000);

    script.onload = () => {
      if (done) return;
      const list = MARKET_INDEX_KEYS.map(({ name: defaultName, varKey, code }) => {
        const raw = window[varKey];
        const isGlobal = code.startsWith('gz');
        const parsed = isGlobal ? parseGlobalIndexRaw(raw) : parseIndexRaw(raw);
        if (!parsed) return { name: defaultName, code: '', price: 0, change: 0, changePercent: 0 };
        return { ...parsed, name: defaultName, code: varKey.replace('v_', '') };
      });
      cleanup();
      resolve(list);
    };
    script.onerror = () => {
      if (done) return;
      cleanup();
      reject(new Error('指数数据加载失败'));
    };
    document.body.appendChild(script);
  });

  const [indicesResult, topixResult] = await Promise.allSettled([fetchTencentIndices, fetchTopixFromWorker()]);

  const list = indicesResult.status === 'fulfilled' ? indicesResult.value : [];
  const topixData = topixResult.status === 'fulfilled' ? topixResult.value : null;

  if (topixData && list.length > 0) {
    const idx = list.findIndex((item) => item.code === 'gzTPX');
    if (idx !== -1) {
      list[idx] = {
        name: '东证指数',
        code: 'gzTPX',
        price: topixData.price,
        change: topixData.change,
        changePercent: topixData.changePercent
      };
    }
  }

  return list;
};

export const fetchLatestRelease = async () => {
  const url = process.env.NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL;
  if (!url) return null;

  try {
    const data = await withRetry(
      async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      },
      2,
      500
    );

    if (!data || !data.tag_name) return null;

    return {
      tagName: data.tag_name,
      body: data.body || ''
    };
  } catch (err) {
    console.error('fetchLatestRelease failed after retries:', err);
    return null;
  }
};

export const submitFeedback = async (formData) => {
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    body: formData
  });
  return response.json();
};

const PINGZHONGDATA_GLOBAL_KEYS = [
  'ishb',
  'fS_name',
  'fS_code',
  'fund_sourceRate',
  'fund_Rate',
  'fund_minsg',
  'stockCodes',
  'zqCodes',
  'stockCodesNew',
  'zqCodesNew',
  'syl_1n',
  'syl_6y',
  'syl_3y',
  'syl_1y',
  'Data_fundSharesPositions',
  'Data_netWorthTrend',
  'Data_ACWorthTrend',
  'Data_grandTotal',
  'Data_rateInSimilarType',
  'Data_rateInSimilarPersent',
  'Data_fluctuationScale',
  'Data_holderStructure',
  'Data_assetAllocation',
  'Data_performanceEvaluation',
  'Data_currentFundManager',
  'Data_buySedemption',
  'swithSameType'
];

let pingzhongdataQueue = Promise.resolve();

const enqueuePingzhongdataLoad = (fn) => {
  const p = pingzhongdataQueue.then(fn, fn);
  // 避免队列被 reject 永久阻塞
  pingzhongdataQueue = p.catch(() => undefined);
  return p;
};

const snapshotPingzhongdataGlobals = (fundCode) => {
  const out = {};
  for (const k of PINGZHONGDATA_GLOBAL_KEYS) {
    if (typeof window?.[k] === 'undefined') continue;
    try {
      out[k] = JSON.parse(JSON.stringify(window[k]));
    } catch (e) {
      out[k] = window[k];
    }
  }

  return {
    fundCode: out.fS_code || fundCode,
    fundName: out.fS_name || '',
    ...out
  };
};

const jsonpLoadPingzhongdata = (fundCode, timeoutMs = 20000) => {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || !document.body) {
      reject(new Error('无浏览器环境'));
      return;
    }

    const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`;
    const script = document.createElement('script');
    script.src = url;
    script.async = true;

    let done = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      script.onload = null;
      script.onerror = null;
      if (document.body.contains(script)) document.body.removeChild(script);
    };

    timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('pingzhongdata 请求超时'));
    }, timeoutMs);

    script.onload = () => {
      if (done) return;
      done = true;
      const data = snapshotPingzhongdataGlobals(fundCode);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('pingzhongdata 加载失败'));
    };

    document.body.appendChild(script);
  });
};

const fetchAndParsePingzhongdata = async (fundCode) => {
  // 使用 JSONP(script 注入) 方式获取并解析 pingzhongdata
  return enqueuePingzhongdataLoad(() => jsonpLoadPingzhongdata(fundCode));
};

/**
 * 获取并解析「基金走势图/资产等」数据（pingzhongdata）
 * 来源：https://fund.eastmoney.com/pingzhongdata/${fundCode}.js
 */
export const fetchFundPingzhongdata = async (fundCode, { cacheTime = 60 * 60 * 1000 } = {}) => {
  if (!fundCode) throw new Error('fundCode 不能为空');
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }

  const qc = getQueryClient();
  const key = qk.pingzhongdata(fundCode);

  try {
    return await qc.fetchQuery({
      queryKey: key,
      queryFn: () => fetchAndParsePingzhongdata(fundCode),
      staleTime: cacheTime
    });
  } catch (e) {
    qc.removeQueries({ queryKey: key });
    throw e;
  }
};

function parsePingzhongSylNumber(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * 用净值走势估算「近一周」涨跌幅：最新净值相对约 7 个自然日前最近一条净值。
 * pingzhongdata 另提供 syl_6y（近六月）等；近周无独立字段，由走势推算。
 */
export function computeWeekReturnFromNetWorthTrend(trend) {
  if (!isArray(trend) || trend.length < 2) return null;
  const valid = trend.filter((d) => d && isNumber(d.x) && Number.isFinite(Number(d.y))).sort((a, b) => a.x - b.x);
  if (valid.length < 2) return null;
  const latest = valid[valid.length - 1];
  const latestMs = latest.x;
  const latestNav = Number(latest.y);
  if (!Number.isFinite(latestNav) || latestNav === 0) return null;
  const cutoff = latestMs - 7 * 24 * 60 * 60 * 1000;
  let before = null;
  for (const d of valid) {
    if (d.x <= cutoff) before = d;
    else break;
  }
  if (!before) before = valid[0];
  const firstNav = Number(before.y);
  if (!Number.isFinite(firstNav) || firstNav === 0) return null;
  return ((latestNav - firstNav) / firstNav) * 100;
}

/**
 * 计算基金连涨连跌天数
 * @param {Array<{x: number, y: any}>} trend - pingzhongdata.Data_netWorthTrend 原始数据
 * @returns {{ type: 'up' | 'down', days: number } | null}
 */
export function calculateConsecutiveTrend(trend) {
  if (!isArray(trend) || trend.length < 2) return null;
  const valid = trend.filter((d) => d && isNumber(d.x) && Number.isFinite(Number(d.y))).sort((a, b) => a.x - b.x);
  if (valid.length < 2) return null;

  let count = 0;
  let type = null;

  for (let i = valid.length - 1; i > 0; i--) {
    const curr = Number(valid[i].y);
    const prev = Number(valid[i - 1].y);

    if (curr > prev) {
      if (type === 'down') break;
      type = 'up';
      count++;
    } else if (curr < prev) {
      if (type === 'up') break;
      type = 'down';
      count++;
    } else {
      break;
    }
  }

  if (count >= 3) {
    return { type, days: count };
  }
  return null;
}

/**
 * 基金阶段涨跌幅（东方财富 pingzhongdata：近一月/三月/六月/一年为接口字段；近一周由净值走势推算）
 * @returns {Promise<{ week: number|null, month: number|null, month3: number|null, month6: number|null, year1: number|null, consecutiveTrend: { type: 'up'|'down', days: number }|null }>}
 */
export async function fetchFundPeriodReturns(fundCode, { cacheTime = 60 * 60 * 1000 } = {}) {
  const empty = { week: null, month: null, month3: null, month6: null, year1: null, consecutiveTrend: null };
  if (!fundCode) return empty;
  try {
    const pz = await fetchFundPingzhongdata(fundCode, { cacheTime });
    return {
      week: computeWeekReturnFromNetWorthTrend(pz?.Data_netWorthTrend),
      month: parsePingzhongSylNumber(pz?.syl_1y),
      month3: parsePingzhongSylNumber(pz?.syl_3y),
      month6: parsePingzhongSylNumber(pz?.syl_6y),
      year1: parsePingzhongSylNumber(pz?.syl_1n),
      consecutiveTrend: calculateConsecutiveTrend(pz?.Data_netWorthTrend)
    };
  } catch {
    return empty;
  }
}

export const fetchFundHistory = async (code, range = '1m', options = {}) => {
  if (typeof window === 'undefined') return [];
  const { netValueType = 'unit' } = options;
  const useAccumulatedNetValue = netValueType === 'accumulated';

  const end = nowInTz();
  let start = end.clone();

  switch (range) {
    case '1m':
      start = start.subtract(1, 'month');
      break;
    case '3m':
      start = start.subtract(3, 'month');
      break;
    case '6m':
      start = start.subtract(6, 'month');
      break;
    case '1y':
      start = start.subtract(1, 'year');
      break;
    case '3y':
      start = start.subtract(3, 'year');
      break;
    case 'all':
      start = dayjs(0).tz(TZ);
      break;
    default:
      start = start.subtract(1, 'month');
  }

  // 业绩走势默认走 pingzhongdata.Data_netWorthTrend；需要累计净值展示时走 Data_ACWorthTrend。
  // 同时附带 Data_grandTotal（若存在，格式为 [{ name, data: [[ts, val], ...] }, ...]）
  try {
    const pz = await fetchFundPingzhongdata(code);
    const unitTrend = pz?.Data_netWorthTrend;
    const accumulatedTrend = pz?.Data_ACWorthTrend;
    const hasAccumulatedTrend = isArray(accumulatedTrend) && accumulatedTrend.length > 0;
    const trend = useAccumulatedNetValue && hasAccumulatedTrend ? accumulatedTrend : unitTrend;
    const actualNetValueType = useAccumulatedNetValue && hasAccumulatedTrend ? 'accumulated' : 'unit';
    const grandTotal = pz?.Data_grandTotal;

    if (isArray(trend) && trend.length) {
      const startMs = start.startOf('day').valueOf();
      const endMs = end.endOf('day').valueOf();

      // 若起始日没有净值，则往前推到最近一日有净值的数据作为有效起始
      const normalizeTrendPoint = (d) => {
        if (isArray(d)) {
          const ts = Number(d[0]);
          const value = Number(d[1]);
          if (!Number.isFinite(ts) || !Number.isFinite(value)) return null;
          return { x: ts, y: value, equityReturn: null };
        }
        if (d && isNumber(d.x) && Number.isFinite(Number(d.y))) return d;
        return null;
      };
      const buildValueByDate = (list) => {
        const out = new Map();
        if (!isArray(list)) return out;
        list
          .map(normalizeTrendPoint)
          .filter(Boolean)
          .forEach((d) => {
            const date = dayjs(d.x).tz(TZ).format('YYYY-MM-DD');
            out.set(date, Number(d.y));
          });
        return out;
      };
      const validTrend = trend
        .map(normalizeTrendPoint)
        .filter((d) => d && d.x <= endMs)
        .sort((a, b) => a.x - b.x);
      const unitValueByDate = buildValueByDate(unitTrend);
      const accumulatedValueByDate = buildValueByDate(accumulatedTrend);
      const unitReturnByDate = new Map();
      if (useAccumulatedNetValue && isArray(unitTrend)) {
        unitTrend
          .filter((d) => d && isNumber(d.x))
          .forEach((d) => {
            const date = dayjs(d.x).tz(TZ).format('YYYY-MM-DD');
            const equityReturn = isNumber(d.equityReturn) ? Number(d.equityReturn) : null;
            if (equityReturn != null) unitReturnByDate.set(date, equityReturn);
          });
      }
      const startDayEndMs = startMs + 24 * 60 * 60 * 1000 - 1;
      const hasPointOnStartDay = validTrend.some((d) => d.x >= startMs && d.x <= startDayEndMs);
      let effectiveStartMs = startMs;
      if (!hasPointOnStartDay) {
        const lastBeforeStart = validTrend.filter((d) => d.x < startMs).pop();
        if (lastBeforeStart) effectiveStartMs = lastBeforeStart.x;
      }

      const out = validTrend
        .filter((d) => d.x >= effectiveStartMs && d.x <= endMs)
        .map((d) => {
          const value = Number(d.y);
          const date = dayjs(d.x).tz(TZ).format('YYYY-MM-DD');
          const equityReturn = useAccumulatedNetValue
            ? (unitReturnByDate.get(date) ?? null)
            : isNumber(d.equityReturn)
              ? Number(d.equityReturn)
              : null;
          return {
            date,
            value,
            unitNetValue: unitValueByDate.get(date) ?? (actualNetValueType === 'unit' ? value : null),
            accumulatedNetValue:
              accumulatedValueByDate.get(date) ?? (actualNetValueType === 'accumulated' ? value : null),
            equityReturn
          };
        });
      out.netValueType = actualNetValueType;

      // 解析 Data_grandTotal 为多条对比曲线，使用同一有效起始日
      if (isArray(grandTotal) && grandTotal.length) {
        const grandTotalSeries = grandTotal
          .map((series) => {
            if (!series || !series.data || !isArray(series.data)) return null;
            const name = series.name || '';
            const points = series.data
              .filter((item) => isArray(item) && isNumber(item[0]))
              .map(([ts, val]) => {
                if (ts < effectiveStartMs || ts > endMs) return null;
                const numVal = Number(val);
                if (!Number.isFinite(numVal)) return null;
                const date = dayjs(ts).tz(TZ).format('YYYY-MM-DD');
                return { ts, date, value: numVal };
              })
              .filter(Boolean);
            if (!points.length) return null;
            return { name, points };
          })
          .filter(Boolean);

        if (grandTotalSeries.length) {
          out.grandTotalSeries = grandTotalSeries;
        }
      }

      if (out.length) return out;
    }
  } catch (e) {
    return [];
  }
  return [];
};

export const fetchFundValuationTrend = async (code, range = '3m') => {
  if (!isSupabaseConfigured) return [];
  if (!supabase?.functions?.invoke) return [];

  const { data, error } = await withRetry(() =>
    supabase.functions.invoke('get-fund-valuation-trend', {
      body: { fund_code: code, range }
    })
  );

  if (error || !data || data.error) return [];
  return isArray(data.data) ? data.data : [];
};

export const parseFundTextWithLLM = async (text) => {
  if (!text) return null;
  if (!isSupabaseConfigured) return null;
  if (!supabase?.functions?.invoke) return null;

  try {
    const { data, error } = await withRetry(() =>
      supabase.functions.invoke('analyze-fund', {
        body: { text }
      })
    );

    // 处理每日 OCR 用量限流
    if (data?.error === 'DAILY_LIMIT_EXCEEDED') {
      const err = new Error(data.message || '今日 OCR 识别次数已达上限');
      err.code = 'DAILY_LIMIT_EXCEEDED';
      err.remaining = 0;
      throw err;
    }

    if (error) return null;
    if (!data || data.success !== true) return null;
    if (!isArray(data.data)) return null;

    // 保持与旧实现兼容：返回 JSON 字符串，由调用方 JSON.parse
    return JSON.stringify(data.data);
  } catch (e) {
    // 限流错误向上传播，让调用方捕获并展示提示
    if (e?.code === 'DAILY_LIMIT_EXCEEDED') throw e;
    return null;
  }
};

/**
 * 通过 Supabase Edge Function 获取天天基金估值排行
 * @param {string|number} sort 排序字段 (3:估值涨幅, 4:成交热度, 5:实际涨幅)
 * @param {string} order 排序方向 (desc | asc)
 * @param {number} page 页码
 * @param {number} pageSize 每页条数
 * @returns {Promise<{Data: {list: Array, allRecords: number}} | null>}
 */
export const fetchFundValuationRanking = async (sort = 3, order = 'desc', page = 1, pageSize = 20) => {
  if (!isSupabaseConfigured) return null;
  if (!supabase?.functions?.invoke) return null;

  const { data, error } = await withRetry(() =>
    supabase.functions.invoke('fund-valuation-ranking', {
      body: { sort, order, page, pageSize }
    })
  );

  if (error) throw new Error(error.message || '加载估值排行失败');
  if (!data || data.success !== true) throw new Error(data?.error || '加载估值排行失败');

  // 保持与原 JSONP 返回结构一致：{ Data: { list: [...], ... } }
  return { Data: data.data };
};

/**
 * 查询当前用户今日 OCR 剩余可用次数
 * @param {string} userId 当前用户 ID
 * @param {number} [maxLimit=5] 每日上限
 * @returns {Promise<{ remaining: number, used: number, max: number }>}
 */
export const fetchOcrDailyRemaining = async (userId, maxLimit = 5) => {
  if (!userId || !isSupabaseConfigured) return { remaining: maxLimit, used: 0, max: maxLimit };

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('ocr_daily_usage')
      .select('count')
      .eq('user_id', userId)
      .eq('usage_date', today)
      .maybeSingle();

    if (error) return { remaining: maxLimit, used: 0, max: maxLimit };
    const used = data?.count || 0;
    return { remaining: Math.max(0, maxLimit - used), used, max: maxLimit };
  } catch {
    return { remaining: maxLimit, used: 0, max: maxLimit };
  }
};
