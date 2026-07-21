import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { chunk, isArray, isNil, isNumber, isObject, isString } from 'lodash';
import { storageStore } from '../stores';
import { withRetry, withRetrySmart } from '../lib/asyncHelper';
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
      if (missingCodes.length > 0 && isSupabaseConfigured) {
        try {
          const { data: batchData } = await supabase.rpc('get_fund_sector_ids_batch', {
            p_fund_codes: missingCodes
          });
          if (isArray(batchData)) {
            for (const row of batchData) {
              const code = String(row?.fund_code ?? '').trim();
              const ids = isArray(row?.sector_ids)
                ? row.sector_ids.map((x) => String(x || '').trim()).filter(Boolean)
                : [];
              if (!code) continue;
              qc.setQueryData(qk.fundSectorOptions(code), ids, { staleTime: ONE_DAY_MS });
              if (!foundMap.get(code) && ids.length > 0) {
                foundMap.set(code, ids[0]);
              }
            }
          }
        } catch (e) {}
      }

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

const BK_DETAIL_CACHE_MS = 5 * 60 * 1000;

function runBKDetailInfoJsonp(tp, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const code = String(tp || '').trim();
    if (!code) {
      resolve(null);
      return;
    }
    const cbName = `jsonp_bk_${code}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const url = `https://api.fund.eastmoney.com/ZTJJ/GetBKDetailInfoNew?tp=${encodeURIComponent(code)}&callback=${cbName}&_=${Date.now()}`;

    let done = false;
    const script = document.createElement('script');
    script.src = url;
    script.async = true;

    const cleanup = () => {
      done = true;
      if (timer) clearTimeout(timer);
      try {
        delete window[cbName];
      } catch (e) {
        window[cbName] = undefined;
      }
      try {
        if (document.body && document.body.contains(script)) {
          document.body.removeChild(script);
        }
      } catch (e) {}
    };

    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      resolve(null);
    }, timeoutMs);

    window[cbName] = (res) => {
      if (done) return;
      cleanup();
      try {
        const data = res?.Data;
        if (!data || !data.SEC_NAME) {
          resolve(null);
          return;
        }
        const pctVal = data.D;
        const pct = pctVal != null && Number.isFinite(Number(pctVal)) ? Number(pctVal) : null;
        resolve({
          name: String(data.SEC_NAME).trim(),
          code,
          pct
        });
      } catch (e) {
        resolve(null);
      }
    };

    script.onerror = () => {
      if (done) return;
      cleanup();
      resolve(null);
    };

    document.body.appendChild(script);
  });
}

let bkDataLoaderTimeout = null;
let pendingBkRequests = new Map();

const dispatchBkDataLoader = async () => {
  const currentRequests = pendingBkRequests;
  pendingBkRequests = new Map();
  bkDataLoaderTimeout = null;

  const codes = Array.from(currentRequests.keys());
  if (codes.length === 0) return;

  try {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) {
      throw new Error('Supabase not configured, fallback to JSONP');
    }

    const { data, error } = await supabase.functions.invoke('eastmoney-batch', {
      body: { codes }
    });

    if (error) throw error;

    for (const code of codes) {
      const resolvers = currentRequests.get(code) || [];
      const result = data?.[code] || null;
      resolvers.forEach((resolve) => resolve(result));
    }
  } catch (e) {
    // Fallback to JSONP if edge function fails or Supabase is not configured
    for (const code of codes) {
      const resolvers = currentRequests.get(code) || [];
      runBKDetailInfoJsonp(code)
        .then((result) => {
          resolvers.forEach((resolve) => resolve(result));
        })
        .catch(() => {
          resolvers.forEach((resolve) => resolve(null));
        });
    }
  }
};

const fetchBKDetailInfoSingle = (tp) => {
  return new Promise((resolve) => {
    if (!pendingBkRequests.has(tp)) {
      pendingBkRequests.set(tp, []);
    }
    pendingBkRequests.get(tp).push(resolve);

    if (!bkDataLoaderTimeout) {
      bkDataLoaderTimeout = setTimeout(dispatchBkDataLoader, 50);
    }
  });
};

/**
 * 批量调用 GetBKDetailInfoNew 接口获取板块名称与行情（优先通过 Supabase Edge Function 解决 CORS 限制并批处理，失败回退 JSONP）
 * @param {string[]} tps 板块编码数组
 */
export const fetchBKDetailInfoNewBatch = async (tps, { cacheTime = BK_DETAIL_CACHE_MS } = {}) => {
  if (!isArray(tps) || tps.length === 0) return {};
  const qc = getQueryClient();
  const results = {};
  const missingTps = [];

  for (const tp of tps) {
    const s = tp != null ? String(tp).trim() : '';
    if (!s) continue;
    const cached = qc.getQueryData(qk.bkDetailQuote(s));
    if (cached !== undefined) {
      results[s] = cached;
    } else {
      missingTps.push(s);
    }
  }

  if (missingTps.length === 0) return results;

  await Promise.all(
    missingTps.map(async (tp) => {
      try {
        const quote = await fetchBKDetailInfoSingle(tp);
        results[tp] = quote || null;
        qc.setQueryData(qk.bkDetailQuote(tp), quote || null, { staleTime: cacheTime });
      } catch (e) {
        results[tp] = null;
      }
    })
  );

  return results;
};

/**
 * 统一获取关联板块行情：兼容常规行业名称查询与以 BK 编码直调 GetBKDetailInfoNew
 * @param {string[]} labels
 */
export const fetchSectorQuotesForLabelsBatch = async (labels, { cacheTime = SECTOR_QUOTE_CACHE_MS } = {}) => {
  if (!isArray(labels) || labels.length === 0) return {};

  const bkLabels = labels.filter((l) => /^BK\d+/i.test(String(l || '').trim()));
  const normalLabels = labels.filter((l) => !/^BK\d+/i.test(String(l || '').trim()));

  const [normalQuotes, bkQuotes] = await Promise.all([
    (async () => {
      if (normalLabels.length === 0) return {};
      const secidResults = await fetchFundSecidsBatch(normalLabels, { cacheTime });
      const secids = normalLabels.map((l) => secidResults[l]).filter(Boolean);
      const quotes = await fetchEastmoneySectorQuotesBatch(secids, { cacheTime });
      const map = {};
      for (const l of normalLabels) {
        const secid = secidResults[l];
        if (secid && quotes[secid]) {
          map[l] = quotes[secid];
        }
      }
      return map;
    })(),
    (async () => {
      if (bkLabels.length === 0) return {};
      return await fetchBKDetailInfoNewBatch(bkLabels, { cacheTime });
    })()
  ]);

  return { ...normalQuotes, ...bkQuotes };
};

/**
 * 获取或查询单支基金对应的全部关联板块候选主题编码数组
 * @param {string} fundCode
 * @returns {Promise<string[]>}
 */
export const fetchFundSectorOptions = async (fundCode) => {
  const code = String(fundCode || '').trim();
  if (!code || !isSupabaseConfigured) return [];
  const qc = getQueryClient();
  const cached = qc.getQueryData(qk.fundSectorOptions(code));
  if (cached !== undefined && isArray(cached)) return cached;
  try {
    const { data: batchData } = await supabase.rpc('get_fund_sector_ids_batch', {
      p_fund_codes: [code]
    });
    let validOptions = [];
    if (isArray(batchData)) {
      const row = batchData.find((r) => String(r?.fund_code ?? '').trim() === code);
      const ids = row && isArray(row.sector_ids) ? row.sector_ids : [];
      validOptions = ids.map((x) => String(x || '').trim()).filter(Boolean);
    }
    qc.setQueryData(qk.fundSectorOptions(code), validOptions, { staleTime: ONE_DAY_MS });
    return validOptions;
  } catch (e) {
    return [];
  }
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

    const valid = trend
      .filter((d) => isObject(d) && isNumber(d.x) && Number.isFinite(Number(d.y)))
      .sort((a, b) => a.x - b.x);

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
      const point = pointByDate.get(date);
      let growth = null;
      if (!isNil(point?.equityReturn) && Number.isFinite(Number(point.equityReturn))) {
        growth = Number(point.equityReturn);
      } else if (i > 0) {
        const prevNav = byDate.get(allDates[i - 1]);
        if (Number.isFinite(prevNav) && prevNav > 0) {
          growth = ((nav - prevNav) / prevNav) * 100;
        }
      }
      let dividend = null;
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
    const valid = trend
      .filter((d) => isObject(d) && isNumber(d.x) && Number.isFinite(Number(d.y)))
      .sort((a, b) => a.x - b.x);

    // 按日期去重（同一天可能有多个数据点，取最后一条）并保存数据点用于获取涨跌幅
    const byDate = new Map();
    const pointByDate = new Map();
    for (const d of valid) {
      const date = dayjs(d.x).tz(TZ).format('YYYY-MM-DD');
      const nav = Number(d.y);
      if (!Number.isFinite(nav) || nav <= 0) continue;
      byDate.set(date, nav); // 同日覆盖取最后一条
      pointByDate.set(date, d);
    }

    // 提取范围内数据并计算 growth（日涨跌幅）
    const allDates = Array.from(byDate.keys()).sort();
    const results = [];
    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      if (date < sdate || date > edate) continue;
      const nav = byDate.get(date);
      const point = pointByDate.get(date);
      let growth = null;
      if (!isNil(point?.equityReturn) && Number.isFinite(Number(point.equityReturn))) {
        growth = Number(point.equityReturn);
      } else if (i > 0) {
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
 * 用于 F10 历史净值接口（lsjz）无法返回最新涨跌幅时的兜底。
 * @param {string} code 基金代码
 * @returns {Promise<{ dwjz: string, zzl: number, jzrq: string, lastNav: string|null, yesterdayZzl: number|null, yesterdayNavDelta: number|null }|null>}
 */
export const fetchNavMetricsFromTrendFallback = async (code) => {
  if (typeof window === 'undefined') return null;
  if (!isString(code) || !String(code).trim()) return null;

  try {
    const pz = await fetchFundPingzhongdata(String(code).trim(), { cacheTime: getNetValueStaleTime() });
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

// ============================================================================
// 腾讯财经 jj 接口批量净值获取 (DataLoader Pattern)
// 来源: https://qt.gtimg.cn/q=jj{code1},jj{code2},...
// 返回格式: v_jj110022="110022~基金名称~gsz~gszzl~~DWJZ~LJJZ~RZDF~jzrq~"
// 优势: 支持批量、无 Referer 限制、CORS 友好、~89 bytes/只、~0.12s
// ============================================================================

/** 腾讯 jj 批量请求单次最大基金数（实测 100+ 无问题，保守取 50） */
const TENCENT_JJ_BATCH_MAX = 50;
/** 腾讯 jj script 加载超时（ms） */
const TENCENT_JJ_TIMEOUT = 8000;

/**
 * 解析腾讯 jj 接口返回的单行数据字符串。
 * @param {string} dataStr - v_jj{code} 的值（~ 分隔）
 * @returns {{code:string,name:string,gsz:number|null,gszzl:number|null,gztime:string|null,dwjz:string,ljjz:string,zzl:number|null,jzrq:string}|null}
 */
const parseTencentJJData = (dataStr) => {
  if (!isString(dataStr) || !dataStr) return null;
  const parts = dataStr.split('~');
  if (parts.length < 9) return null;

  const code = String(parts[0] || '').trim();
  const name = String(parts[1] || '').trim();
  const gszRaw = parts[2];
  const gszzlRaw = parts[3];
  const gztimeRaw = parts[4];
  const dwjzRaw = String(parts[5] || '').trim();
  const ljjzRaw = String(parts[6] || '').trim();
  const zzlRaw = parts[7];
  const jzrqRaw = String(parts[8] || '').trim();

  if (!code || !dwjzRaw || !Number.isFinite(Number(dwjzRaw))) return null;

  const gsz = Number(gszRaw);
  const gszzl = Number(gszzlRaw);
  const zzl = Number(zzlRaw);

  const navNum = Number(dwjzRaw);
  const lastNavNum = Number.isFinite(navNum) && Number.isFinite(zzl) && zzl !== -100 ? navNum / (1 + zzl / 100) : null;

  return {
    code,
    name: name || null,
    gsz: Number.isFinite(gsz) && gsz > 0 ? gsz : null,
    gszzl: Number.isFinite(gszzl) ? gszzl : null,
    gztime: isString(gztimeRaw) && gztimeRaw.trim() ? gztimeRaw.trim() : null,
    dwjz: dwjzRaw,
    lastNav: Number.isFinite(lastNavNum) && lastNavNum > 0 ? lastNavNum.toFixed(4) : null,
    ljjz: ljjzRaw,
    zzl: Number.isFinite(zzl) ? zzl : null,
    jzrq: jzrqRaw || null
  };
};

/** DataLoader 队列：微任务合并同一 tick 内的多个单基金请求为一次批量请求 */
const tencentNavInflight = new Map(); // code -> { promise, resolve, reject }
const tencentNavQueue = new Set(); // Set(code)
let tencentNavTimeout = null;

/**
 * 执行一次腾讯 jj 批量 script 注入请求。
 * 从队列中取出所有待查代码，分批发起请求，解析全局变量并分发结果。
 */
const processTencentNavQueue = async () => {
  if (tencentNavQueue.size === 0) return;

  const codes = Array.from(tencentNavQueue);
  tencentNavQueue.clear();
  tencentNavTimeout = null;

  // 分批：每批最多 TENCENT_JJ_BATCH_MAX 只
  const batches = [];
  for (let i = 0; i < codes.length; i += TENCENT_JJ_BATCH_MAX) {
    batches.push(codes.slice(i, i + TENCENT_JJ_BATCH_MAX));
  }

  await Promise.all(
    batches.map(
      (batch) =>
        new Promise((batchResolve) => {
          if (typeof document === 'undefined' || !document.body) {
            // 非浏览器环境，全部 reject
            for (const c of batch) {
              const entry = tencentNavInflight.get(c);
              if (entry) {
                entry.reject(new Error('无浏览器环境'));
                tencentNavInflight.delete(c);
              }
            }
            batchResolve();
            return;
          }

          const jjCodes = batch.map((c) => `jj${c}`).join(',');
          const url = `https://qt.gtimg.cn/q=${jjCodes}&_=${Date.now()}`;
          const script = document.createElement('script');
          script.src = url;
          script.async = true;

          let done = false;
          let timer = null;

          const cleanup = () => {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            script.onload = null;
            script.onerror = null;
            if (document.body.contains(script)) document.body.removeChild(script);
          };

          const settle = (resolverFn) => {
            if (done) return;
            done = true;
            cleanup();
            for (const c of batch) {
              const entry = tencentNavInflight.get(c);
              if (!entry) continue;
              tencentNavInflight.delete(c);
              try {
                const varName = `v_jj${c}`;
                const dataStr = typeof window !== 'undefined' ? window[varName] : null;
                if (typeof window !== 'undefined' && varName in window) {
                  try {
                    delete window[varName];
                  } catch (e) {
                    window[varName] = undefined;
                  }
                }
                if (dataStr) {
                  const parsed = parseTencentJJData(dataStr);
                  if (parsed) {
                    // 写入 TanStack Query 缓存
                    const qc = getQueryClient();
                    qc.setQueryData(qk.tencentNav(c), parsed, { staleTime: getNetValueStaleTime() });
                    entry.resolve(parsed);
                  } else {
                    entry.resolve(null);
                  }
                } else {
                  entry.resolve(null);
                }
              } catch (e) {
                entry.resolve(null);
              }
            }
            resolverFn();
          };

          timer = setTimeout(() => {
            fundDebugLog('tencentNav batch timeout', { batch });
            settle(() => batchResolve());
          }, TENCENT_JJ_TIMEOUT);

          script.onload = () => {
            fundDebugLog('tencentNav batch loaded', { count: batch.length });
            settle(() => batchResolve());
          };

          script.onerror = () => {
            fundDebugLog('tencentNav batch script error', { batch });
            settle(() => batchResolve());
          };

          document.body.appendChild(script);
        })
    )
  );
};

/**
 * 获取单只基金的最新净值（腾讯 jj 接口）。
 * 内部使用 DataLoader 模式：同一微任务窗口内的多个调用会自动合并为一次批量请求。
 *
 * @param {string} code - 基金代码
 * @returns {Promise<object|null>} 解析后的净值数据，或 null（获取失败/基金不存在）
 */
export const fetchNavFromTencent = (code) => {
  const c = code != null ? String(code).trim() : '';
  if (!c) return Promise.resolve(null);

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  const qc = getQueryClient();

  // 1. 优先从 TanStack Query 缓存中取
  const cached = qc.getQueryData(qk.tencentNav(c));
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  // 2. 检查是否有 inflight 请求
  const existing = tencentNavInflight.get(c);
  if (existing) {
    return existing.promise;
  }

  // 3. 创建新的 inflight 条目并加入队列
  let resolveFn;
  let rejectFn;
  const promise = new Promise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  tencentNavInflight.set(c, { promise, resolve: resolveFn, reject: rejectFn });
  tencentNavQueue.add(c);

  // 4. 触发微任务级别的合并批量查询
  if (!tencentNavTimeout) {
    tencentNavTimeout = setTimeout(processTencentNavQueue, 0);
  }

  return promise;
};

/**
 * 批量获取多只基金的最新净值（腾讯 jj 接口）。
 * 一次调用可获取多只基金数据，内部自动分批（每批最多 50 只）。
 *
 * @param {string[]} codes - 基金代码数组
 * @returns {Promise<Record<string, object|null>>} 以基金代码为 key 的净值数据映射
 */
export const fetchNavFromTencentBatch = async (codes) => {
  if (!isArray(codes) || codes.length === 0) return {};

  const normalized = codes.map((c) => String(c).trim()).filter(Boolean);
  if (normalized.length === 0) return {};

  const results = {};
  const promises = normalized.map((c) =>
    fetchNavFromTencent(c).then((data) => {
      results[c] = data;
    })
  );
  await Promise.all(promises);
  return results;
};

const extractHoldingsReportDate = (html) => {
  if (!html || !isString(html)) return null;

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

/**
 * 检测基金名称是否为兜底占位名称（如 "基金(110022)"）
 * @param {string} name - 待检测的基金名称
 * @param {string} code - 基金代码
 * @returns {boolean}
 */
export const isFallbackFundName = (name, code) => {
  if (!isString(name) || !name.trim()) return true;
  if (!isString(code) || !code.trim()) return false;
  return name.trim() === `基金(${code.trim()})`;
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
        // 优先使用 localStorage 中已存储的真实基金名称，避免不必要的 searchFunds 网络请求
        try {
          const arr = storageStore.getItem('funds', []);
          if (isArray(arr)) {
            const f = arr.find((x) => x.code === c);
            if (f && f.name && !isFallbackFundName(f.name, c)) {
              return f.name;
            }
          }
        } catch (e) {}
        // 存储的名称不可用，尝试通过搜索接口查询该代码对应的基金详情
        try {
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
/**
 * 从 OCR 识别的 pic6 净值估算图文本中解析估值数据。
 *
 * pic6 图片底部固定格式示例（OCR 会在字符间插入空格）：
 *   "净值 估算 :3. 3521 元 估算 涨幅 : 0.24% 2023-12-27 15:00"
 *   "净值 估算 :0. 7608 元 估算 张 幅 : -0. 68% 2023-12-27 15:00"
 *
 * @param {string} text - Tesseract OCR 输出的原始文本
 * @param {string} code - 基金编码
 * @returns {UnifiedFundValuation}
 */
function parseOcrValuationText(text, code) {
  // 先去除 OCR 在数字内部插入的多余空格，如 "3. 3521" -> "3.3521"、"-0. 68" -> "-0.68"
  const cleaned = text.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2').replace(/(-\s*)(\d)/g, '-$2');

  // 1. 提取净值估算（gsz）：匹配 "净值估算" 后跟的数值
  //    OCR 可能输出 "净值 估算" 或 "净值估算"，冒号可能有空格
  const gszMatch = cleaned.match(/净\s*值\s*估\s*算\s*[:：]?\s*([\d.]+)\s*元/i);
  const gsz = gszMatch ? parseFloat(gszMatch[1]) : null;

  // 2. 提取估算涨幅（gszzl）：匹配 "估算涨幅" / "估算张幅" 后跟的百分比
  //    OCR 常将 "涨" 误识别为 "张"
  const gszzlMatch = cleaned.match(/估\s*算\s*[涨张]\s*幅\s*[:：]?\s*([+-]?[\d.]+)\s*%/i);
  const gszzl = gszzlMatch ? parseFloat(gszzlMatch[1]) : null;

  // 3. 提取日期时间（gztime）：匹配 "YYYY-MM-DD HH:MM"
  const dateMatch = cleaned.match(/(\d{4}-\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{2})/);
  const gztime = dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : null;

  // 必须成功匹配出完整日期时间，且年份必须等于当前自然年
  if (!gztime) {
    throw new Error('OCR 无法解析完整估值时间');
  }
  const yearMatch = gztime.match(/^(\d{4})/);
  const currentYear = String(new Date().getFullYear());
  if (!yearMatch || yearMatch[1] !== currentYear) {
    throw new Error(`OCR 估值时间非今年数据（解析年份：${yearMatch ? yearMatch[1] : '未知'}）`);
  }

  // 至少需要解析出 gsz 或 gszzl
  if (gsz == null && gszzl == null) {
    throw new Error('OCR 无法解析估值净值或涨幅数据');
  }

  return {
    code,
    gsz: Number.isFinite(gsz) ? gsz : null,
    gztime,
    gszzl: Number.isFinite(gszzl) ? gszzl : null,
    valuationSource: 'fundgz'
  };
}

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

/** QDII 估值缓存时长：交易时段 2 分钟，非交易时段 10 分钟 */
const getQdiiStaleTime = () => {
  const now = nowInTz();
  const tradingDay = isTradingDay(now);
  const hour = now.hour();
  const minute = now.minute();
  const timeNum = hour * 100 + minute;
  const isTradingTime = tradingDay && ((timeNum >= 925 && timeNum <= 1135) || (timeNum >= 1255 && timeNum <= 1505));
  return isTradingTime ? 2 * 60 * 1000 : 10 * 60 * 1000;
};

/**
 * 从 Supabase gs_qdii 表获取 QDII 基金的估值数据（数据源 4）。
 *
 * 优化：直接使用 PostgREST 查询 gs_qdii 表（RLS 已启用），替代原先的 Edge Function 调用，
 * 并通过 TanStack Query 缓存避免同一刷新周期内重复请求。
 *
 * @param {string} code - 基金编码
 * @returns {Promise<{ gztime: string|null, gszzl: number|null, valuationSource: string, gzstatus: string|null }|null>}
 */
export const fetchQdiiValuationFromSupabase = async (code) => {
  if (!code || !isSupabaseConfigured) return null;
  const normalized = String(code).trim();
  if (!normalized) return null;

  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: qk.qdiiValuation(normalized),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('gs_qdii')
          .select('gztime, gszzl, gzstatus')
          .eq('fund_code', normalized)
          .maybeSingle();

        if (error || !data) return null;

        const gztime = data.gztime != null ? String(data.gztime).replace(/:(\d{2}):\d{2}$/, ':$1') : null;
        return {
          gztime,
          gszzl: data.gszzl != null && Number.isFinite(Number(data.gszzl)) ? Number(data.gszzl) : null,
          valuationSource: 'supabase_qdii',
          gzstatus: data.gzstatus
        };
      },
      staleTime: getQdiiStaleTime()
    });
  } catch {
    return null;
  }
};

/**
 * 从 Supabase gs_tt 表获取基金的估值数据（作为 OCR 识别异常时的降级方案）。
 * 通过 TanStack Query 缓存 2 分钟。
 *
 * @param {string} code - 基金编码
 * @returns {Promise<{ gztime: string|null, gszzl: number|null, gsz: number|null, valuationSource: string }|null>}
 */
export const fetchTtValuationFromSupabase = async (code) => {
  if (!code || !isSupabaseConfigured) return null;
  const normalized = String(code).trim();
  if (!normalized) return null;

  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: qk.ttValuation(normalized),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('gs_tt')
          .select('gztime, gszzl, gsz')
          .eq('fund_code', normalized)
          .maybeSingle();

        if (error || !data || !data.gztime) return null;

        const gztime = String(data.gztime).replace(/:(\d{2}):\d{2}$/, ':$1');
        const yearMatch = gztime.match(/^(\d{4})/);
        const currentYear = String(new Date().getFullYear());
        if (!yearMatch || yearMatch[1] !== currentYear) {
          return null; // 年份非今年数据，判定为过期/无效
        }

        return {
          gztime,
          gszzl: data.gszzl != null && Number.isFinite(Number(data.gszzl)) ? Number(data.gszzl) : null,
          gsz: data.gsz != null && Number.isFinite(Number(data.gsz)) ? Number(data.gsz) : null,
          valuationSource: 'fundgz'
        };
      },
      staleTime: 2 * 60 * 1000 // 2 分钟缓存
    });
  } catch {
    return null;
  }
};

let activeTtBatchPromise = null;
let activeTtBatchSignature = null;

/**
 * 批量预取多个基金在 gs_tt 表中的存在状态与估值数据，同时填充 TanStack Query 缓存。
 *
 * 带有请求去重机制（Deduplication）：当并发触发时直接复用。
 * 支持 RPC 批量调用与单次 PostgREST IN 降级方案，高效解决单次查 gs_tt 的瓶颈。
 *
 * @param {string[]} codes - 基金编码数组
 * @returns {Promise<Record<string, { gztime: string|null, gszzl: number|null, gsz: number|null, valuationSource: string }|null>>}
 */
export async function prefetchTtValuations(codes) {
  if (!isSupabaseConfigured || !isArray(codes) || codes.length === 0) return {};

  const qc = getQueryClient();
  const results = {};
  const missing = [];
  const seenCodes = new Set();

  for (const c of codes) {
    const code = c != null ? String(c).trim() : '';
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);

    const cachedVal = qc.getQueryData(qk.ttValuation(code));
    const cachedExist = qc.getQueryData(qk.isTtFund(code));
    const isValStale = qc.getQueryState(qk.ttValuation(code))?.isStale ?? true;
    const isExistStale = qc.getQueryState(qk.isTtFund(code))?.isStale ?? true;

    if (cachedVal !== undefined) {
      results[code] = cachedVal;
    }
    // 只要估值或存在性其一缺失或已过期，即放入待批量获取队列
    if (cachedVal === undefined || cachedExist === undefined || isValStale || isExistStale) {
      missing.push(code);
    }
  }

  if (missing.length === 0) return results;

  missing.sort();
  const signature = missing.join(',');
  if (activeTtBatchPromise && activeTtBatchSignature === signature) {
    try {
      await activeTtBatchPromise;
      for (const code of missing) {
        const cached = qc.getQueryData(qk.ttValuation(code));
        if (cached !== undefined) results[code] = cached;
      }
      return results;
    } catch (e) {}
  }

  activeTtBatchSignature = signature;
  activeTtBatchPromise = (async () => {
    let data = null;
    let error = null;

    try {
      const rpcRes = await supabase.rpc('get_tt_valuations_batch', {
        p_fund_codes: missing
      });
      if (!rpcRes.error) {
        data = rpcRes.data;
      } else {
        error = rpcRes.error;
      }
    } catch (e) {
      error = e;
    }

    // 若 RPC 调用失败（如未部署或签名不匹配），降级为 PostgREST IN 批量查询
    if (error || !isArray(data)) {
      try {
        const restRes = await supabase.from('gs_tt').select('fund_code, gztime, gszzl, gsz').in('fund_code', missing);
        if (!restRes.error && isArray(restRes.data)) {
          data = restRes.data;
          error = null;
        }
      } catch (e) {}
    }

    const foundMap = new Map();
    const currentYear = String(new Date().getFullYear());

    if (isArray(data)) {
      for (const row of data) {
        const code = String(row?.fund_code || '').trim();
        if (!code) continue;

        // 1. 存在于数据返回集中即说明 gs_tt 中存在
        foundMap.set(code, { exist: true, valuation: null });

        if (!row.gztime) continue;
        const gztime = String(row.gztime).replace(/:(\d{2}):\d{2}$/, ':$1');
        const yearMatch = gztime.match(/^(\d{4})/);
        if (yearMatch && yearMatch[1] === currentYear) {
          foundMap.set(code, {
            exist: true,
            valuation: {
              gztime,
              gszzl: row.gszzl != null && Number.isFinite(Number(row.gszzl)) ? Number(row.gszzl) : null,
              gsz: row.gsz != null && Number.isFinite(Number(row.gsz)) ? Number(row.gsz) : null,
              valuationSource: 'fundgz'
            }
          });
        }
      }
    }

    // 双向写入 TanStack Query 缓存
    for (const code of missing) {
      const entry = foundMap.get(code);
      if (entry) {
        qc.setQueryData(qk.isTtFund(code), true, { staleTime: 12 * 60 * 60 * 1000 });
        qc.setQueryData(qk.ttValuation(code), entry.valuation, { staleTime: 2 * 60 * 1000 });
        if (entry.valuation !== undefined) results[code] = entry.valuation;
      } else {
        // 未从表中查出该代码记录：写 false 并写 null 避免后续重复触发请求
        qc.setQueryData(qk.isTtFund(code), false, { staleTime: 12 * 60 * 60 * 1000 });
        qc.setQueryData(qk.ttValuation(code), null, { staleTime: 2 * 60 * 1000 });
        results[code] = null;
      }
    }
  })();

  try {
    await activeTtBatchPromise;
  } finally {
    if (activeTtBatchSignature === signature) {
      activeTtBatchPromise = null;
      activeTtBatchSignature = null;
    }
  }

  return results;
}

// ============================================================================
// 天天基金 FundValuationLast 实时估值接口（CORS 直连，支持批量）
// 作为数据源 1 的主接口，替代原先的 OCR pic6 方案；OCR pic6 → gs_tt 保留为降级路径
// ============================================================================

const FUND_VALUATION_LAST_URL = 'https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast';
const FUND_VALUATION_LAST_FIELDS = 'FCODE,SHORTNAME,GSZZL,GZTIME,GSZ,NAV,PDATE';
// 单次批量请求的基金编码上限，避免 URL 过长
const FUND_VALUATION_LAST_BATCH_SIZE = 50;

/** FundValuationLast 实时估值缓存时长：交易时段 2 分钟，非交易时段 10 分钟 */
const getTtValuationLastStaleTime = () => {
  const now = nowInTz();
  const tradingDay = isTradingDay(now);
  const hour = now.hour();
  const minute = now.minute();
  const timeNum = hour * 100 + minute;
  const isTradingTime = tradingDay && ((timeNum >= 925 && timeNum <= 1135) || (timeNum >= 1255 && timeNum <= 1505));
  return isTradingTime ? 2 * 60 * 1000 : 10 * 60 * 1000;
};

/**
 * 解析 FundValuationLast 接口单条记录为统一估值结构。
 *
 * 无论基金是否有实时估值数据，只要存在单位净值(NAV)就返回有效记录。
 * 对于仅有 NAV 而无估值字段的记录（如货币基金），会标记 noValuation: true，
 * 调用方可据此跳过估值降级路径。
 *
 * @param {object} item - 接口返回的 data 数组中的单条记录
 * @returns {{code:string,gsz:number|null,gszzl:number|null,gztime:string|null,dwjz:string|null,jzrq:string|null,name:string|null,valuationSource:string,noValuation:boolean}|null}
 */
function parseTtValuationLastItem(item) {
  if (!isObject(item)) return null;
  const code = isString(item.FCODE) ? item.FCODE.trim() : String(item.FCODE || '').trim();
  if (!code) return null;

  const toNum = (v) => (v != null && v !== '' ? Number(v) : NaN);
  const gsz = toNum(item.GSZ);
  const gszzl = toNum(item.GSZZL);
  const nav = toNum(item.NAV);
  const gztimeRaw = isString(item.GZTIME) ? item.GZTIME.trim() : '';
  const gztime = gztimeRaw ? gztimeRaw.replace(/:(\d{2}):\d{2}$/, ':$1') : null;
  const pdate = isString(item.PDATE) ? item.PDATE.trim() : null;
  const shortname = isString(item.SHORTNAME) ? item.SHORTNAME.trim() : null;

  // 年份校验：GZTIME 存在时必须是今年数据
  if (gztime) {
    const yearMatch = gztime.match(/^(\d{4})/);
    const currentYear = String(new Date().getFullYear());
    if (!yearMatch || yearMatch[1] !== currentYear) return null;
  }

  const hasGsz = Number.isFinite(gsz);
  const hasGszzl = Number.isFinite(gszzl);
  const hasNav = Number.isFinite(nav);
  // 必须至少有估值净值(GSZ)、估算涨幅(GSZZL) 或 单位净值(NAV) 才算有效记录
  if (!hasGsz && !hasGszzl && !hasNav) return null;

  const noValuation = !hasGsz && !hasGszzl;

  return {
    code,
    gsz: hasGsz ? gsz : null,
    gszzl: hasGszzl ? gszzl : null,
    gztime,
    dwjz: hasNav ? String(nav) : null,
    jzrq: pdate,
    name: shortname,
    valuationSource: 'fundgz',
    noValuation
  };
}

/**
 * 批量调用天天基金 FundValuationLast 接口获取实时估值。
 *
 * 该接口支持 CORS（Access-Control-Allow-Origin: *），可直接使用 fetch。
 * 单次请求最多 {@link FUND_VALUATION_LAST_BATCH_SIZE} 只基金（通过 chunk 分批），每批独立容错。
 *
 * @param {string[]} codes - 基金编码数组
 * @returns {Promise<Map<string, object>>} code -> 估值对象
 */
async function fetchTtValuationLastBatch(codes) {
  if (typeof fetch === 'undefined') return new Map();

  const validCodes = [];
  const seen = new Set();
  for (const c of codes) {
    const code = c != null ? String(c).trim() : '';
    if (!code || seen.has(code)) continue;
    seen.add(code);
    validCodes.push(code);
  }
  if (validCodes.length === 0) return new Map();

  const result = new Map();
  const chunks = chunk(validCodes, FUND_VALUATION_LAST_BATCH_SIZE);

  await Promise.all(
    chunks.map(async (chunkCodes) => {
      const params = new URLSearchParams();
      params.set('FCODES', chunkCodes.join(','));
      params.set('FIELDS', FUND_VALUATION_LAST_FIELDS);
      const url = `${FUND_VALUATION_LAST_URL}?${params.toString()}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        fundDebugLog('fetchTtValuationLastBatch request', { count: chunkCodes.length });
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) {
          fundDebugLog('fetchTtValuationLastBatch http error', { status: resp.status });
          return;
        }
        const json = await resp.json();
        if (!json || !json.success || !isArray(json.data)) return;
        for (const item of json.data) {
          const parsed = parseTtValuationLastItem(item);
          if (parsed) result.set(parsed.code, parsed);
        }
      } catch (e) {
        fundDebugLog('fetchTtValuationLastBatch chunk error', { err: e?.message, count: chunkCodes.length });
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return result;
}

/**
 * 获取单个基金的天天基金实时估值（FundValuationLast 接口）。
 * 优先读取 TanStack Query 缓存（由 prefetchTtValuationLast 批量预热），缓存未命中时单次请求。
 * @param {string} code - 基金编码
 * @param {{ bypassCache?: boolean }} [options] - bypassCache 为 true 时跳过缓存强制重新请求
 * @returns {Promise<object|null>}
 */
export const fetchTtValuationLast = async (code, { bypassCache = false } = {}) => {
  const c = code != null ? String(code).trim() : '';
  if (!c) return null;

  const qc = getQueryClient();
  if (!bypassCache) {
    const cached = qc.getQueryData(qk.ttValuationLast(c));
    if (cached !== undefined) return cached;
  }

  const staleTime = getTtValuationLastStaleTime();
  const batchMap = await fetchTtValuationLastBatch([c]);
  const val = batchMap.get(c) || null;
  const prev = qc.getQueryData(qk.ttValuationLast(c));
  // 当 bypassCache 为 true（强制刷新），或者本次拉取结果为 null 但已有有效旧缓存时，不使用 null 覆盖现有的有效缓存
  if (!isNil(val) || (!bypassCache && isNil(prev))) {
    qc.setQueryData(qk.ttValuationLast(c), val, { staleTime });
  }
  return val;
};

let activeLastBatchPromise = null;
let activeLastBatchSignature = null;

/**
 * 批量预取多个基金的天天基金实时估值并写入 TanStack Query 缓存。
 *
 * 利用 FundValuationLast 接口的批量能力，一次请求获取多只基金估值，
 * 后续 fetchTtValuationLast 单基金调用将直接命中缓存。
 * 带有请求去重机制：相同 signature 的并发调用复用同一 Promise。
 *
 * @param {string[]} codes - 基金编码数组
 * @returns {Promise<Record<string, object|null>>}
 */
export async function prefetchTtValuationLast(codes) {
  if (!isArray(codes) || codes.length === 0) return {};

  const qc = getQueryClient();
  const staleTime = getTtValuationLastStaleTime();
  const results = {};
  const missing = [];
  const seen = new Set();

  for (const c of codes) {
    const code = c != null ? String(c).trim() : '';
    if (!code || seen.has(code)) continue;
    seen.add(code);

    const cached = qc.getQueryData(qk.ttValuationLast(code));
    const isStale = qc.getQueryState(qk.ttValuationLast(code))?.isStale ?? true;
    if (cached !== undefined && !isStale) {
      if (cached) results[code] = cached;
    } else {
      missing.push(code);
    }
  }

  if (missing.length === 0) return results;

  missing.sort();
  const signature = missing.join(',');
  if (activeLastBatchPromise && activeLastBatchSignature === signature) {
    try {
      await activeLastBatchPromise;
    } catch (e) {}
  } else {
    activeLastBatchSignature = signature;
    activeLastBatchPromise = (async () => {
      const batchMap = await fetchTtValuationLastBatch(missing);
      for (const code of missing) {
        const val = batchMap.get(code) || null;
        const prev = qc.getQueryData(qk.ttValuationLast(code));
        // 若本次拉取为 null 但旧缓存已存在有效数据（即过期重拉失败），不使用 null 覆盖已有有效缓存
        if (!isNil(val) || isNil(prev)) {
          qc.setQueryData(qk.ttValuationLast(code), val, { staleTime });
        }
      }
    })();
    try {
      await activeLastBatchPromise;
    } finally {
      if (activeLastBatchSignature === signature) {
        activeLastBatchPromise = null;
        activeLastBatchSignature = null;
      }
    }
  }

  for (const code of missing) {
    const cached = qc.getQueryData(qk.ttValuationLast(code));
    if (cached) results[code] = cached;
  }

  return results;
}

/**
 * 批量预取多个 QDII 基金的估值数据并写入 TanStack Query 缓存。
 *
 * 使用单次 PostgREST IN 查询替代原先 N 次 Edge Function 调用，
 * 后续 fetchQdiiValuationFromSupabase 单基金调用将直接命中缓存。
 *
 * @param {string[]} codes - 基金编码数组
 * @returns {Promise<Record<string, { gztime: string|null, gszzl: number|null, valuationSource: string, gzstatus: string|null }|null>>}
 */
export async function prefetchQdiiValuations(codes) {
  if (!isSupabaseConfigured || !isArray(codes) || codes.length === 0) return {};

  const qc = getQueryClient();
  const staleTime = getQdiiStaleTime();
  const results = {};
  const missing = [];

  for (const c of codes) {
    const code = c != null ? String(c).trim() : '';
    if (!code) continue;
    const cached = qc.getQueryData(qk.qdiiValuation(code));
    if (cached !== undefined) {
      if (cached) results[code] = cached;
    } else {
      missing.push(code);
    }
  }

  if (missing.length === 0) return results;

  try {
    const { data, error } = await supabase
      .from('gs_qdii')
      .select('fund_code, gztime, gszzl, gzstatus')
      .in('fund_code', missing);

    if (error) return results;

    const foundMap = new Map();
    if (isArray(data)) {
      for (const row of data) {
        const code = String(row.fund_code || '').trim();
        if (!code) continue;
        const gztime = row.gztime != null ? String(row.gztime).replace(/:(\d{2}):\d{2}$/, ':$1') : null;
        const valuation = {
          gztime,
          gszzl: row.gszzl != null && Number.isFinite(Number(row.gszzl)) ? Number(row.gszzl) : null,
          valuationSource: 'supabase_qdii',
          gzstatus: row.gzstatus
        };
        foundMap.set(code, valuation);
      }
    }

    for (const code of missing) {
      const valuation = foundMap.get(code) || null;
      qc.setQueryData(qk.qdiiValuation(code), valuation, { staleTime });
      if (valuation) results[code] = valuation;
    }
  } catch (e) {
    // 查询失败时缓存 null 避免后续重复请求
    for (const code of missing) {
      qc.setQueryData(qk.qdiiValuation(code), null, { staleTime });
    }
  }

  return results;
}

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
 * 检查指定基金编码是否存在于 Supabase gs_tt 表中
 * 结果通过 TanStack Query 缓存 12 小时。
 * @param {string} code - 基金编码
 * @returns {Promise<boolean>}
 */
export const isTtFund = async (code) => {
  if (!code || !isSupabaseConfigured) return false;
  const normalized = String(code).trim();
  if (!normalized) return false;

  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: qk.isTtFund(normalized),
      queryFn: async () => {
        const { data, error } = await withRetry(() =>
          supabase.from('gs_tt').select('fund_code').eq('fund_code', normalized).maybeSingle()
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
  if (!isSupabaseConfigured) return null;
  const c = code != null ? String(code).trim() : '';
  if (!c || !jzrq || !isNumber(actualZzl) || !Number.isFinite(actualZzl)) return null;

  const qc = getQueryClient();
  const cacheKey = qk.bestValuationSource(c, jzrq, actualZzl);
  const cached = qc.getQueryData(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    // 使用 RPC 替代 Edge Function，减少配额消耗
    const { data, error } = await supabase.rpc('get_best_valuation_source_batch', {
      p_items: [{ code: c, jzrq, actualZzl }]
    });

    if (error || !data?.success) return null;
    const res = data.data?.[c] ?? null;
    qc.setQueryData(cacheKey, res, { staleTime: 60 * 60 * 1000 });
    return res;
  } catch (e) {
    return null;
  }
}

let activeBatchPromise = null;
let activeBatchSignature = null;

/**
 * 批量调用 Edge Function 检测基金最准数据源。
 *
 * 带有请求去重机制（Deduplication）：如果在相同参数的请求尚未返回时又发起了相同的请求，
 * 将直接复用正在进行中的 Promise，避免 PC 和移动端表格同时渲染时发出重复网络请求。
 *
 * 同时会将每个基金的独立结果写入 TanStack Query 缓存（key = qk.bestValuationSource），
 * 使得后续单次 fetchBestValuationSource 调用可直接命中缓存。
 *
 * @param {Array<{ code: string, jzrq: string, actualZzl: number }>} items - 基金查询列表
 * @returns {Promise<Record<string, { bestSource: number|null, isYesterdayAccuracy: boolean, isTodayAccuracy: boolean, diffs: Object<string,number>, diff?: number }|null>>}
 *   以基金代码为 key 的结果 map，无数据的基金值为 null
 */
export async function fetchBestValuationSourceBatch(items) {
  if (!isSupabaseConfigured) return {};
  if (!isArray(items) || items.length === 0) return {};

  const qc = getQueryClient();

  // 1. 规范化 + 去重 + 过滤缓存命中
  const normalized = [];
  const cachedResults = {};
  const seenCodes = new Set();

  for (const item of items) {
    const code = item?.code != null ? String(item.code).trim() : '';
    const jzrq = isString(item?.jzrq) ? item.jzrq.trim() : '';
    const actualZzl = isNumber(item?.actualZzl) && Number.isFinite(item.actualZzl) ? item.actualZzl : null;

    if (!code || !jzrq || actualZzl == null) continue;
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    // 优先从单条缓存中读取
    const cacheKey = qk.bestValuationSource(code, jzrq, actualZzl);
    const cached = qc.getQueryData(cacheKey);
    if (cached !== undefined) {
      cachedResults[code] = cached;
    } else {
      normalized.push({ code, jzrq, actualZzl });
    }
  }

  if (normalized.length === 0) return cachedResults;

  // 生成当前这批请求的唯一签名
  const signature = normalized
    .map((item) => `${item.code}_${item.jzrq}_${item.actualZzl}`)
    .sort()
    .join('|');

  // 并发请求去重：如果已有完全相同的请求在进行中，则复用其 Promise
  if (activeBatchPromise && activeBatchSignature === signature) {
    try {
      const batchResults = await activeBatchPromise;
      const allResults = { ...cachedResults };
      for (const batch of batchResults) {
        Object.assign(allResults, batch);
      }
      return allResults;
    } catch (e) {
      // 若复用失败，则忽略并继续发起新请求
    }
  }

  // 2. 调用批量 RPC（每批最多 100 条），替代 Edge Function 以减少配额消耗
  const BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    batches.push(normalized.slice(i, i + BATCH_SIZE));
  }

  const promise = Promise.all(
    batches.map(async (batch) => {
      try {
        const { data, error } = await supabase.rpc('get_best_valuation_source_batch', {
          p_items: batch
        });

        if (error || !data?.success) return {};

        const res = data.data || {};
        // 3. 将每个基金的结果写入单条缓存，供后续单次调用复用
        for (const item of batch) {
          const singleResult = res[item.code] ?? null;
          qc.setQueryData(qk.bestValuationSource(item.code, item.jzrq, item.actualZzl), singleResult, {
            staleTime: 60 * 60 * 1000
          });
        }
        return res;
      } catch {
        return {};
      }
    })
  );

  activeBatchSignature = signature;
  activeBatchPromise = promise;

  let batchResults;
  try {
    batchResults = await promise;
  } finally {
    if (activeBatchSignature === signature) {
      activeBatchPromise = null;
      activeBatchSignature = null;
    }
  }

  // 4. 合并所有结果
  const allResults = { ...cachedResults };
  for (const batch of batchResults) {
    Object.assign(allResults, batch);
  }

  return allResults;
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
 * 按基金编码与数据源类型获取估值。
 * - 数据源 1：优先天天基金 FundValuationLast 批量接口（CORS 直连），降级 gs_tt
 * - 数据源 2/3：新浪估算曲线末点（不同口径）
 * - 数据源 4：Supabase gs_qdii 表
 * @param {string} code - 基金编码
 * @param {number | string} [dataSource=1] - 1 天天基金；2、3 新浪估算不同口径；4 Supabase QDII
 * @param {{ forceRefresh?: boolean }} [options] - forceRefresh 为 true 时跳过缓存强制重新请求（数据源 1）
 * @returns {Promise<UnifiedFundValuation>}
 */
export async function fetchFundValuationBySource(code, dataSource = 1, { forceRefresh = false } = {}) {
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

  // 数据源 1：优先使用天天基金 FundValuationLast 批量接口（CORS 直连），
  // 无数据或无估值字段时降级到 gs_tt（OCR pic6 降级路径临时禁用）
  fundDebugLog('fetchFundValuationBySource ttValuationLast', { code: c, forceRefresh });
  const lastVal = await fetchTtValuationLast(c, { bypassCache: forceRefresh });
  if (lastVal && (lastVal.gsz != null || lastVal.gszzl != null)) {
    return lastVal;
  }

  // FundValuationLast 无数据、无估值字段或标记 noValuation 时，统一降级到 gs_tt
  // TODO: OCR pic6 降级路径临时禁用，后续如需恢复取消下方注释即可
  // fundDebugLog('fetchFundValuationBySource ttValuationLast no valuation, falling back to ocr_pic6', { code: c });
  // const inGsTt = await isTtFund(c);
  // if (!inGsTt) {
  //   fundDebugLog('fetchFundValuationBySource ocr_pic6 not in gs_tt', { code: c });
  //   throw new Error('FundValuationLast 无数据且基金编码不存在于 gs_tt 表中');
  // }
  // const qc = getQueryClient();
  // try {
  //   return await qc.fetchQuery({
  //     queryKey: qk.ocrValuation(c),
  //     queryFn: async () => {
  //       const { getOcrWorker, fetchPic6ImageAndCrop } = await import('@/app/lib/ocr');
  //       const [worker, imageInput] = await Promise.all([
  //         getOcrWorker('chi_sim+eng'),
  //         fetchPic6ImageAndCrop(c, { timeoutMs: 4000, maxRetries: 1, cropRatio: 0.15 })
  //       ]);
  //       const res = await worker.recognize(imageInput);
  //       const text = res?.data?.text || '';
  //       fundDebugLog('fetchFundValuationBySource ocr_pic6 text', { code: c, text });
  //       return parseOcrValuationText(text, c);
  //     },
  //     staleTime: 2 * 60 * 1000, // 2 分钟缓存
  //     retry: false // OCR 解析不需要失败后重试，出现异常立刻抛出并降级到 gs_tt
  //   });
  // } catch (ocrErr) {
  //   fundDebugLog('fetchFundValuationBySource ocr_pic6 failed, falling back to gs_tt', {
  //     code: c,
  //     err: ocrErr?.message || String(ocrErr)
  //   });
  //   const ttVal = await fetchTtValuationFromSupabase(c);
  //   if (!ttVal) {
  //     throw new Error('FundValuationLast、OCR 与 gs_tt 降级均失败或数据非今年');
  //   }
  //   return {
  //     code: c,
  //     gsz: ttVal.gsz,
  //     gztime: ttVal.gztime,
  //     gszzl: ttVal.gszzl,
  //     valuationSource: ttVal.valuationSource
  //   };
  // }

  fundDebugLog('fetchFundValuationBySource falling back to gs_tt', { code: c });
  const ttVal = await fetchTtValuationFromSupabase(c);
  if (!ttVal) {
    throw new Error('FundValuationLast 与 gs_tt 降级均失败或数据非今年');
  }
  return {
    code: c,
    gsz: ttVal.gsz,
    gztime: ttVal.gztime,
    gszzl: ttVal.gszzl,
    valuationSource: ttVal.valuationSource
  };
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

  // 1. 始终获取 FundValuationLast 数据（包含最新净值 NAV/PDATE 和数据源1的估值数据）
  // 已在 useRefreshManager 中通过 prefetchTtValuationLast 批量预取，此处直接命中缓存
  const ttLastPromise = fetchTtValuationLast(code);

  // 2. 对于非数据源 1，发起各自数据源的估值请求
  const ds = normalizeValuationDataSource(dataSource);
  let gzPromise = null;
  if (ds !== 1) {
    gzPromise = fetchFundValuationBySource(code, dataSource);
  }

  // 3. 编排并合并数据
  return new Promise(async (resolve, reject) => {
    // 获取 FundValuationLast 数据（含最新净值 NAV/PDATE）
    const ttLastData = await ttLastPromise;

    let baseData = null;

    if (ds === 1) {
      // 数据源 1：优先直接使用 FundValuationLast 的估值数据，无需额外请求
      if (ttLastData && (ttLastData.gsz != null || ttLastData.gszzl != null)) {
        baseData = { ...ttLastData };
      } else {
        // FundValuationLast 无估值字段（可能仅有 NAV，如非交易时段或货币基金）
        // 降级到 fetchFundValuationBySource（→ gs_tt）尝试获取估值
        try {
          baseData = await fetchFundValuationBySource(code, dataSource);
        } catch (e) {
          // gs_tt 也无估值数据
          if (ttLastData && !isNil(ttLastData.dwjz)) {
            // 有 NAV 但无估值 → 使用 NAV，标记无估值
            baseData = { ...ttLastData, noValuation: true };
          } else {
            try {
              baseData = await fetchFundDataFallback(code);
            } catch (fbErr) {
              reject(fbErr);
              return;
            }
          }
        }
      }
    } else {
      // 数据源 2/3/4：从各自数据源获取估值
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
    }

    // 合并 FundValuationLast 的最新净值（NAV/PDATE）到 baseData
    // FundValuationLast 的 dwjz 是最新已发布净值，优先于 pingzhongdata
    if (ttLastData && !isNil(ttLastData.dwjz)) {
      const ttNav = String(ttLastData.dwjz);
      const ttDate = ttLastData.jzrq;
      if (!baseData.dwjz) {
        // baseData 无净值（如 Sina 数据源）
        baseData.dwjz = ttNav;
        baseData.jzrq = ttDate;
      } else if (ttDate && (!baseData.jzrq || String(ttDate) > String(baseData.jzrq))) {
        // FundValuationLast 净值日期更新 → 更新净值，旧净值保留为 lastNav
        if (String(baseData.dwjz) !== ttNav) {
          baseData.lastNav = baseData.dwjz;
        }
        baseData.dwjz = ttNav;
        baseData.jzrq = ttDate;
      }
    }

    // 使用 pingzhongdata 补充昨日净值等完整指标（zzl、lastNav、yesterdayZzl、yesterdayNavDelta）
    const tData = await fetchNavMetricsFromTrendFallback(code);

    if (tData) {
      const sameDate = tData.jzrq && baseData.jzrq && String(tData.jzrq) === String(baseData.jzrq);

      if (sameDate) {
        // 同一净值日期：pingzhongdata 的 zzl/lastNav 对应当前净值，可直接使用
        if (isNil(baseData.zzl) && !isNil(tData.zzl)) baseData.zzl = tData.zzl;
        if (isNil(baseData.lastNav) && !isNil(tData.lastNav)) baseData.lastNav = tData.lastNav;
      } else if (tData.jzrq && baseData.jzrq && String(tData.jzrq) > String(baseData.jzrq)) {
        // pingzhongdata 净值日期更新（FundValuationLast 未更新）→ 使用 pingzhongdata 的净值
        if (baseData.dwjz && !isNil(tData.dwjz) && String(tData.dwjz) !== String(baseData.dwjz)) {
          baseData.lastNav = baseData.dwjz;
        }
        baseData.dwjz = tData.dwjz;
        baseData.jzrq = tData.jzrq;
        baseData.zzl = tData.zzl;
        if (!isNil(tData.lastNav)) baseData.lastNav = tData.lastNav;
      } else {
        // pingzhongdata 净值日期更旧：
        // - zzl 属于 tData 的日期，不能用于 baseData 的日期，不设置
        // - lastNav 应为 tData.dwjz（最近可用净值，即 baseData 前一日的净值），
        //   而非 tData.lastNav（那是前两日的净值）
        if (isNil(baseData.lastNav) && !isNil(tData.dwjz)) baseData.lastNav = tData.dwjz;
      }

      // baseData 仍无净值时使用 pingzhongdata 兑底
      if (isNil(baseData.dwjz) && !isNil(tData.dwjz)) {
        baseData.dwjz = tData.dwjz;
        baseData.jzrq = tData.jzrq;
        if (isNil(baseData.zzl)) baseData.zzl = tData.zzl;
        if (isNil(baseData.lastNav) && !isNil(tData.lastNav)) baseData.lastNav = tData.lastNav;
      }

      // 昨日指标始终从 pingzhongdata 获取
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

    if (!baseData.name || isFallbackFundName(baseData.name, code)) {
      // 优先使用 localStorage 中已存储的真实基金名称，避免不必要的 searchFunds 网络请求
      if (storedName && !isFallbackFundName(storedName, code)) {
        baseData.name = storedName;
      } else {
        try {
          const results = await searchFunds(code);
          const found = results.find((item) => item.CODE === code);
          if (found) baseData.name = found.NAME || found.SHORTNAME;
        } catch (e) {}
      }
      // 如果所有途径都未能获取到有效名称，使用兜底占位
      if (!baseData.name || isFallbackFundName(baseData.name, code)) {
        baseData.name = `基金(${code})`;
      }
    }

    resolve({
      ...baseData
    });
  });
};

/**
 * 解析 stocks/fundStocks 数组为 holdings 格式。
 * 适用于东方财富 API 响应（json.Datas.fundStocks）和 Supabase RPC 返回的 stocks 数据（结构一致）。
 * @param {Array} fundStocks - 原始 stocks 数组，每项含 GPDM/GPJC/JZBL/INDEXNAME/PCTNVCHGTYPE/PCTNVCHG 等字段
 * @returns {Array<{code: string, name: string, weight: string, change: null, indexName: string, pctNvChgType: string, pctNvChg: string}>}
 */
const parseFundStocksToHoldings = (fundStocks) => {
  if (!isArray(fundStocks)) return [];
  const holdings = [];
  for (const s of fundStocks) {
    if (!isObject(s)) continue;
    const hc = String(s.GPDM || '').trim();
    const hn = String(s.GPJC || '').trim();
    const hw = s.JZBL ? `${s.JZBL}%` : '';
    if (hc || hn || hw) {
      const rawIndexName = String(s.INDEXNAME || '').trim();
      const indexName =
        rawIndexName !== '--' && rawIndexName !== '-' && rawIndexName !== 'null' && rawIndexName !== 'undefined'
          ? rawIndexName
          : '';
      const pctNvChgType = String(s.PCTNVCHGTYPE || '').trim();
      const pctNvChg = String(s.PCTNVCHG || '').trim();
      holdings.push({
        code: hc,
        name: hn,
        weight: hw,
        change: null,
        indexName,
        pctNvChgType,
        pctNvChg
      });
    }
  }
  return holdings.slice(0, 10);
};

/**
 * 将股票代码标准化为腾讯财经接口格式
 */
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
      raw.startsWith('6') || raw.startsWith('9') ? 'sh' : raw.startsWith('4') || raw.startsWith('8') ? 'bj' : 'sz';
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

/**
 * 获取腾讯财经接口的全局变量名
 */
const getTencentVarName = (tencentCode) => {
  const cd = String(tencentCode || '').trim();
  if (!cd) return '';
  // s_* uses v_s_*
  if (/^s_/i.test(cd)) return `v_${cd}`;
  // us/hk/sh/sz/bj uses v_{code}
  return `v_${cd}`;
};

/**
 * 通过腾讯财经 script 注入获取重仓股实时涨跌幅，直接写入 holdings[].change。
 * @param {Array} holdings - parseFundStocksToHoldings 的返回值（会被原地修改 change 字段）
 */
const enrichHoldingsWithTencentQuotes = (holdings) => {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !isArray(holdings) || holdings.length === 0) {
      resolve();
      return;
    }
    const needQuotes = holdings
      .map((h) => ({ h, tencentCode: normalizeTencentCode(h.code) }))
      .filter((x) => Boolean(x.tencentCode));
    if (needQuotes.length === 0) {
      resolve();
      return;
    }
    try {
      const tencentCodes = needQuotes.map((x) => x.tencentCode).join(',');
      if (!tencentCodes) {
        resolve();
        return;
      }
      const quoteUrl = `https://qt.gtimg.cn/q=${tencentCodes}`;
      const scriptQuote = document.createElement('script');
      scriptQuote.src = quoteUrl;
      let quoteDone = false;
      let quoteTimer;
      const cleanupQuote = () => {
        quoteDone = true;
        if (quoteTimer) clearTimeout(quoteTimer);
        if (document.body.contains(scriptQuote)) document.body.removeChild(scriptQuote);
      };
      quoteTimer = setTimeout(() => {
        if (quoteDone) return;
        cleanupQuote();
        resolve();
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
        resolve();
      };
      scriptQuote.onerror = () => {
        cleanupQuote();
        resolve();
      };
      document.body.appendChild(scriptQuote);
    } catch {
      resolve();
    }
  });
};

/**
 * 从 pingzhongdata 获取资产配置数据
 * @param {string} code - 基金代码
 * @returns {Promise<Array<{name: string, value: number}>>}
 */
const fetchAssetAllocationForFund = async (code) => {
  try {
    const pz = await fetchFundPingzhongdata(code, { cacheTime: ONE_DAY_MS });
    const rawSeries = pz?.Data_assetAllocation?.series || [];
    const filtered = rawSeries.filter((s) => s.type !== 'line' && !String(s.name || '').includes('净资产'));
    let sum = 0;
    const parsedSeries = [];
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
    return parsedSeries;
  } catch {
    return [];
  }
};

/**
 * 调用 Supabase RPC 获取基金重仓股数据（从 fund_pingzhongdata.stocks）。
 * 作为东方财富 FundMNInverstPosition 接口报错时的降级数据源。
 * 返回的 stocks 数组结构与东方财富 API 的 fundStocks 完全一致。
 * @param {string} fundCode - 基金代码
 * @returns {Promise<{stocks: Array, updated_at: string}|null>} stocks 数据或 null
 */
export const fetchFundStocksFromSupabase = async (fundCode) => {
  if (!isSupabaseConfigured) return null;
  const code = fundCode != null ? String(fundCode).trim() : '';
  if (!code) return null;

  const qc = getQueryClient();
  try {
    return await qc.fetchQuery({
      queryKey: qk.fundStocks(code),
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_fund_stocks', { p_fund_code: code });
        if (error || !data || !isArray(data.stocks) || data.stocks.length === 0) return null;
        return data;
      },
      staleTime: ONE_DAY_MS,
      gcTime: ONE_DAY_MS,
      retry: false
    });
  } catch {
    return null;
  }
};

/**
 * 获取基金前 10 重仓股数据。
 *
 * 数据获取策略（双源降级）：
 * 1. 优先使用东方财富移动端 API（FundMNInverstPosition），该接口提供报告期日期；
 * 2. 当东方财富接口报错时，降级到 Supabase RPC（fund_pingzhongdata.stocks），
 *    使用 updated_at 作为报告日期判断依据。
 *
 * 两个数据源的 stocks 结构完全一致，共用解析逻辑。
 *
 * @param {string} code - 基金代码
 * @returns {Promise<{holdings: Array, holdingsReportDate: string|null, holdingsIsLastQuarter: boolean, assetAllocation: Array}>}
 */
export const fetchFundHoldings = async (code) => {
  if (!code) return { holdings: [], holdingsReportDate: null, holdingsIsLastQuarter: false };
  fundDebugLog('fetchFundHoldings start', { code });

  // --- 1. 优先尝试东方财富移动端 API ---
  try {
    const holdingsUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE=${code}&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0`;
    const json = await getQueryClient().fetchQuery({
      queryKey: qk.fundHoldingsArchives(code),
      queryFn: async () => {
        const resp = await fetch(holdingsUrl);
        if (!resp.ok) throw new Error('数据加载失败');
        const j = await resp.json();
        if (!j || !j.Success) throw new Error(j?.ErrMsg || '数据加载失败');
        return j;
      },
      staleTime: ONE_DAY_MS,
      gcTime: ONE_DAY_MS,
      retry: false
    });

    const holdingsReportDate = extractHoldingsReportDate(
      isString(json?.Expansion) ? json.Expansion : String(json?.Expansion || '')
    );
    const holdingsIsLastQuarter = isLastQuarterReport(holdingsReportDate);

    // 如果不是上一季度末的披露数据，则不展示重仓（并避免继续解析/请求行情）
    if (!holdingsIsLastQuarter) {
      return { holdings: [], holdingsReportDate, holdingsIsLastQuarter: false, assetAllocation: [] };
    }

    const fundStocks = isArray(json?.Datas?.fundStocks) ? json.Datas.fundStocks : [];
    const holdings = parseFundStocksToHoldings(fundStocks);
    if (holdings.length === 0) throw new Error('东方财富 API 解析重仓为空');

    // 获取腾讯实时行情
    await enrichHoldingsWithTencentQuotes(holdings);

    // 获取资产配置
    const assetAllocation = await fetchAssetAllocationForFund(code);

    fundDebugLog('fetchFundHoldings resolved (eastmoney)', {
      code,
      holdingsCount: holdings.length,
      holdingsReportDate,
      holdingsIsLastQuarter
    });

    return { holdings, holdingsReportDate, holdingsIsLastQuarter, assetAllocation };
  } catch (eastmoneyErr) {
    fundDebugLog('fetchFundHoldings eastmoney failed, trying supabase RPC', {
      code,
      error: eastmoneyErr?.message
    });
  }

  // --- 2. 降级：Supabase RPC（fund_pingzhongdata.stocks） ---
  if (isSupabaseConfigured) {
    try {
      const rpcData = await fetchFundStocksFromSupabase(code);
      if (rpcData && isArray(rpcData.stocks) && rpcData.stocks.length > 0) {
        const holdings = parseFundStocksToHoldings(rpcData.stocks);
        if (holdings.length === 0) throw new Error('RPC stocks 解析为空');

        // 使用 updated_at 作为报告日期判断依据（backend 定期刷新，数据应为最新季度）
        const holdingsReportDate = rpcData.updated_at ? toTz(rpcData.updated_at).format('YYYY-MM-DD') : null;
        const holdingsIsLastQuarter = isLastQuarterReport(holdingsReportDate);

        if (!holdingsIsLastQuarter) {
          return { holdings: [], holdingsReportDate, holdingsIsLastQuarter: false, assetAllocation: [] };
        }

        // 获取腾讯实时行情
        await enrichHoldingsWithTencentQuotes(holdings);

        // 获取资产配置
        const assetAllocation = await fetchAssetAllocationForFund(code);

        fundDebugLog('fetchFundHoldings resolved (supabase RPC)', {
          code,
          holdingsCount: holdings.length,
          holdingsReportDate,
          holdingsIsLastQuarter
        });

        return { holdings, holdingsReportDate, holdingsIsLastQuarter, assetAllocation };
      }
    } catch (rpcErr) {
      fundDebugLog('fetchFundHoldings supabase RPC failed', { code, error: rpcErr?.message });
    }
  }

  // --- 3. 全部失败，返回空 ---
  return { holdings: [], holdingsReportDate: null, holdingsIsLastQuarter: false, assetAllocation: [] };
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
  { code: 'sh000932', varKey: 'v_sh000932', name: '500等权' },
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

export const fetchMarketIndices = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  return new Promise((resolve, reject) => {
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
      staleTime: cacheTime,
      gcTime: cacheTime
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

  const { data, error } = await withRetrySmart(() =>
    supabase.functions.invoke('get-fund-valuation-trend', {
      body: { fund_code: code, range }
    })
  );

  if (error || !data || data.error) return [];
  return isArray(data.data) ? data.data : [];
};

export const parseFundTextWithLLM = async (text, imageBase64 = null) => {
  if (!text && !imageBase64) return null;
  if (!isSupabaseConfigured) return null;
  if (!supabase?.functions?.invoke) return null;

  try {
    const { data, error } = await withRetrySmart(() =>
      supabase.functions.invoke('analyze-fund', {
        body: imageBase64 ? { image: imageBase64 } : { text }
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

  const { data, error } = await withRetrySmart(() =>
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
