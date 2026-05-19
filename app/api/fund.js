import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isString } from 'lodash';
import { storageStore } from '../stores';
import { getQueryClient } from '../lib/get-query-client';
import * as qk from '../lib/query-keys';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { isTradingDay } from '../lib/tradingCalendar';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_TZ = 'Asia/Shanghai';
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  const isTradingTime = tradingDay && (
    (timeNum >= 925 && timeNum <= 1135) ||
    (timeNum >= 1255 && timeNum <= 1505)
  );

  if (isTradingTime) {
    return 30 * 60 * 1000; // 30 分钟
  }
  return 5 * 60 * 1000; // 5 分钟
};

/**
 * 获取基金「关联板块」：查询 Supabase `fund_related` 表（fund_code → related_sector），并做 1 天缓存
 * 返回：展示用字符串，无数据或失败时为空字符串
 * @param {string} [options.authSegment] - 与登录态绑定的缓存分段（如 user.id），避免未登录时缓存的空结果被登录后复用
 */
export const fetchRelatedSectors = async (code, { cacheTime = ONE_DAY_MS, authSegment = 'anon' } = {}) => {
  if (!code) return '';
  const normalized = String(code).trim();
  if (!normalized) return '';
  if (!isSupabaseConfigured) return '';

  const seg = authSegment != null && authSegment !== '' ? String(authSegment) : 'anon';

  try {
    const relatedSectors = await getQueryClient().fetchQuery({
      queryKey: qk.relatedSectors(normalized, seg),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('fund_related')
          .select('related_sector')
          .eq('fund_code', normalized)
          .maybeSingle();

        if (error || !data) return '';
        const raw = data.related_sector;
        return raw != null && raw !== '' ? String(raw).trim() : '';
      },
      staleTime: cacheTime,
    });

    return relatedSectors || '';
  } catch (e) {
    return '';
  }
};

/**
 * 批量获取基金「关联板块」
 * @param {string[]} codes
 */
export const fetchRelatedSectorsBatch = async (codes, { cacheTime = ONE_DAY_MS, authSegment = 'anon' } = {}) => {
  if (!Array.isArray(codes) || codes.length === 0) return {};
  if (!isSupabaseConfigured) return {};

  const seg = authSegment != null && authSegment !== '' ? String(authSegment) : 'anon';
  const qc = getQueryClient();
  const results = {};

  // 1. 筛选出缓存中没有的数据
  const missingCodes = [];
  for (const c of codes) {
    const normalized = String(c).trim();
    if (!normalized) continue;
    const cached = qc.getQueryData(qk.relatedSectors(normalized, seg));
    if (cached !== undefined) {
      results[normalized] = cached;
    } else {
      missingCodes.push(normalized);
    }
  }

  if (missingCodes.length === 0) return results;

  // 2. 批量从 Supabase 查询
  try {
    const { data, error } = await supabase
      .from('fund_related')
      .select('fund_code, related_sector')
      .in('fund_code', missingCodes);

    if (error) throw error;

    const foundMap = new Map();
    if (Array.isArray(data)) {
      data.forEach(item => {
        const c = String(item.fund_code).trim();
        const v = item.related_sector != null ? String(item.related_sector).trim() : '';
        foundMap.set(c, v);
      });
    }

    // 3. 填充结果并更新 React Query 缓存
    for (const code of missingCodes) {
      const value = foundMap.get(code) || '';
      results[code] = value;
      qc.setQueryData(qk.relatedSectors(code, seg), value, { staleTime: cacheTime });
    }
  } catch (e) {
    // 失败时，为 missingCodes 填充空字符串避免重复查询
    missingCodes.forEach(code => {
      if (results[code] === undefined) results[code] = '';
    });
  }

  return results;
};

const SECTOR_QUOTE_CACHE_MS = 60 * 1000;

/**
 * 根据 `fund_secid.related_sector` 查询东方财富 secid（如 2.931066）
 */
export const fetchFundSecidByRelatedSector = async (relatedSector, { cacheTime = ONE_DAY_MS } = {}) => {
  const normalized = relatedSector != null ? String(relatedSector).trim() : '';
  if (!normalized || !isSupabaseConfigured) return '';

  try {
    const secid = await getQueryClient().fetchQuery({
      queryKey: qk.fundSecid(normalized),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('fund_secid')
          .select('secid')
          .eq('related_sector', normalized)
          .maybeSingle();

        if (error || !data?.secid) return '';
        return String(data.secid).trim();
      },
      staleTime: cacheTime,
    });

    return secid || '';
  } catch (e) {
    return '';
  }
};

/**
 * 批量获取板块 secid
 * @param {string[]} labels
 */
export const fetchFundSecidsBatch = async (labels, { cacheTime = ONE_DAY_MS } = {}) => {
  if (!Array.isArray(labels) || labels.length === 0) return {};
  if (!isSupabaseConfigured) return {};

  const qc = getQueryClient();
  const results = {};

  const missingLabels = [];
  for (const label of labels) {
    const normalized = String(label).trim();
    if (!normalized) continue;
    const cached = qc.getQueryData(qk.fundSecid(normalized));
    if (cached !== undefined) {
      results[normalized] = cached;
    } else {
      missingLabels.push(normalized);
    }
  }

  if (missingLabels.length === 0) return results;

  try {
    const { data, error } = await supabase
      .from('fund_secid')
      .select('related_sector, secid')
      .in('related_sector', missingLabels);

    if (error) throw error;

    const foundMap = new Map();
    if (Array.isArray(data)) {
      data.forEach(item => {
        const l = String(item.related_sector).trim();
        const s = item.secid != null ? String(item.secid).trim() : '';
        foundMap.set(l, s);
      });
    }

    for (const label of missingLabels) {
      const value = foundMap.get(label) || '';
      results[label] = value;
      qc.setQueryData(qk.fundSecid(label), value, { staleTime: cacheTime });
    }
  } catch (e) {
    missingLabels.forEach(label => {
      if (results[label] === undefined) results[label] = '';
    });
  }

  return results;
};

/**
 * 东方财富 push2delay 板块/指数行情（涨跌幅等）
 * @returns {{ name: string, code: string, pct: number|null }|null}
 */
export const fetchEastmoneySectorQuote = async (secid, { cacheTime = SECTOR_QUOTE_CACHE_MS } = {}) => {
  const s = secid != null ? String(secid).trim() : '';
  if (!s || typeof fetch === 'undefined') return null;

  try {
    const quote = await getQueryClient().fetchQuery({
      queryKey: qk.eastSectorQuote(s),
      queryFn: async () => {
        const url = `https://push2delay.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(s)}&fields=f58,f57,f43,f170,f169,f124,f86`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const json = await res.json();
        const d = json?.data;
        if (!d) return null;
        const f170 = d.f170;
        const pct = f170 != null && Number.isFinite(Number(f170)) ? Number(f170) / 100 : null;
        return {
          name: d.f58 != null ? String(d.f58) : '',
          code: d.f57 != null ? String(d.f57) : '',
          pct,
        };
      },
      staleTime: cacheTime,
    });

    return quote || null;
  } catch (e) {
    return null;
  }
};

/**
 * 批量获取东方财富板块/指数行情（单次请求）
 * @param {string[]} secids
 * @returns {Promise<Record<string, { name: string, code: string, pct: number|null }|null>>}
 */
export const fetchEastmoneySectorQuotesBatch = async (secids, { cacheTime = SECTOR_QUOTE_CACHE_MS } = {}) => {
  if (!Array.isArray(secids) || secids.length === 0) return {};
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
    await Promise.all(chunks.map(async (chunk) => {
      try {
        const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?fields=f12,f13,f14,f3&secids=${encodeURIComponent(chunk.join(','))}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        const diff = json?.data?.diff;
        if (!Array.isArray(diff)) return;

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
            pct,
          };

          results[key] = quote;
          qc.setQueryData(qk.eastSectorQuote(key), quote, { staleTime: cacheTime });
        }
      } catch (e) {
        console.error('Fetch sector quotes batch chunk error:', e);
      }
    }));

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

/**
 * 关联板块名称 → 实时涨跌幅（先查 fund_secid，再拉东方财富）
 */
export const fetchRelatedSectorLiveQuote = async (relatedSectorLabel) => {
  const secid = await fetchFundSecidByRelatedSector(relatedSectorLabel);
  if (!secid) return null;
  return fetchEastmoneySectorQuote(secid);
};

/**
 * 获取板块/指数实时详情（包含涨跌幅和资金流入）
 * @param {string} secid - 板块secid，如 "0.399006"
 * @returns {Promise<{name: string, code: string, price: number, change: number, fundFlow: number}|null>}
 */
export const fetchSectorDetail = async (secid) => {
  const s = secid != null ? String(secid).trim() : '';
  if (!s || typeof fetch === 'undefined') return null;

  try {
    const detail = await getQueryClient().fetchQuery({
      queryKey: ['sectorDetail', s],
      queryFn: async () => {
        const url = `https://push2delay.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(s)}&fields=f58,f57,f43,f170,f169,f124,f86`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const json = await res.json();
        const d = json?.data;
        if (!d) return null;
        const change = d.f170 != null && Number.isFinite(Number(d.f170)) ? Number(d.f170) / 100 : 0;
        const fundFlow = d.f184 != null && Number.isFinite(Number(d.f184)) ? Number(d.f184) * 10000 : 0;
        return {
          name: d.f58 != null ? String(d.f58) : '',
          code: d.f57 != null ? String(d.f57) : '',
          price: d.f43 != null && Number.isFinite(Number(d.f43)) ? Number(d.f43) / 1000 : 0,
          change,
          fundFlow,
        };
      },
      staleTime: 60 * 1000, // 1分钟缓存
    });
    return detail || null;
  } catch (e) {
    return null;
  }
};

/**
 * 获取板块资金流向K线数据
 * @param {string} secid - 板块secid，如 "90.BK1128"
 * @returns {Promise<{time: string, mainFlow: number, smallFlow: number, mediumFlow: number, largeFlow: number, superLargeFlow: number}|null>}
 */
export const fetchSectorFlowKline = async (secid) => {
  const timestamp = Date.now();
  const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=1&klt=1&secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56&ut=fa5fd1943c7b386f172d6893dbfba10b&_=${timestamp}`;

  try {
    const res = await fetch(url);
    const text = await res.text();

    // 解析响应（可能是 JSON 或 JSONP）
    let json;
    try {
      // 先尝试直接解析 JSON
      json = JSON.parse(text);
    } catch {
      // 如果不是纯JSON，尝试JSONP格式
      const match = text.match(/\(({.*})\)/);
      if (!match) return null;
      json = JSON.parse(match[1]);
    }

    if (!json.data?.klines?.length) return null;

    // 取最新的一条数据
    const latest = json.data.klines[json.data.klines.length - 1];
    const parts = latest.split(',');

    // 检查数据长度：至少有 6 个字段（时间+5个资金流）
    if (parts.length < 6) return null;

    // f52:主力净流入, f53:小单净流入, f54:中单净流入, f55:大单净流入, f56:超大单净流入
    return {
      //格式2026-04-27 14:49
      time: parts[0],
      mainFlow: parseFloat(parts[1]) || 0,      // 主力净流入
      smallFlow: parseFloat(parts[2]) || 0,     // 小单净流入
      mediumFlow: parseFloat(parts[3]) || 0,    // 中单净流入
      largeFlow: parseFloat(parts[4]) || 0,     // 大单净流入
      superLargeFlow: parseFloat(parts[5]) || 0,             // 超大单净流入（可能为0）
    };
  } catch (e) {
    console.error('获取板块资金流向失败:', e);
    return null;
  }
};

function normalizeEastmoneyScriptUrl(url) {
  let key = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('_');
    parsed.searchParams.delete('_t');
    key = parsed.toString();
  } catch (e) {
  }
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
      staleTime: staleTime,
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
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=1&sdate=${date}&edate=${date}`;
  try {
    const apidata = await loadScript(url, { staleTime: getNetValueStaleTime() });
    if (apidata && apidata.content) {
      const content = apidata.content;
      if (content.includes('暂无数据')) return null;
      const rows = content.split('<tr>');
      for (const row of rows) {
        if (row.includes(`<td>${date}</td>`)) {
          const cells = row.match(/<td[^>]*>(.*?)<\/td>/g);
          if (cells && cells.length >= 2) {
            const valStr = cells[1].replace(/<[^>]+>/g, '');
            const val = parseFloat(valStr);
            return isNaN(val) ? null : val;
          }
        }
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
    results.push({ date: dateStr, nav, growth });
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
  if (!isString(sdate) || !isString(edate) || !/^\d{4}-\d{2}-\d{2}$/.test(sdate) || !/^\d{4}-\d{2}-\d{2}$/.test(edate)) {
    return [];
  }
  if (sdate > edate) return [];

  const c = String(code).trim();
  const merged = new Map();
  let pageNum = 1;
  const per = 500;
  while (true) {
    const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${c}&page=${pageNum}&per=${per}&sdate=${sdate}&edate=${edate}`;
    try {
      const apidata = await loadScript(url);
      const content = apidata?.content || '';
      const batch = parseNetValuesFromLsjzContent(content);
      if (!batch.length) break;
      for (const row of batch) {
        merged.set(row.date, row);
      }
      if (batch.length < per) break;
      pageNum += 1;
    } catch {
      break;
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
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
  if (!isString(sdate) || !isString(edate) || !/^\d{4}-\d{2}-\d{2}$/.test(sdate) || !/^\d{4}-\d{2}-\d{2}$/.test(edate)) {
    return [];
  }
  if (sdate > edate) return [];

  const { cacheTime = 60 * 60 * 1000 } = options;

  try {
    const pz = await fetchFundPingzhongdata(String(code).trim(), { cacheTime });
    const trend = pz?.Data_netWorthTrend;
    if (!Array.isArray(trend) || trend.length === 0) return [];

    // 过滤出有效数据点并按时间升序排列
    const valid = trend
      .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)))
      .sort((a, b) => a.x - b.x);

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
        const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${c}&page=1&per=3&sdate=&edate=`;
        const apidata = await loadScript(url);
        const content = apidata?.content || '';
        const navList = parseNetValuesFromLsjzContent(content);
        const latest = navList.length > 0 ? navList[navList.length - 1] : null;
        const previousNav = navList.length > 1 ? navList[navList.length - 2] : null;
        const yM = computeYesterdayNavMetricsFromList(navList);
        return { latest, previousNav, yM };
      })();

      const namePromise = (async () => {
        try {
          // 通过搜索接口查询该代码对应的基金详情
          const results = await searchFunds(c);
          const found = results.find(item => item.CODE === c);
          return found ? (found.NAME || found.SHORTNAME) : null;
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

// fundgz JSONP 固定回调名为 window.jsonpgz；这里做成“常驻分发器”以支持并发请求，避免覆盖全局回调导致串数据/悬挂。
const JSONPGZ_DISPATCHER_KEY = '__rtf_jsonpgz_dispatcher_v1__';
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
  } catch (e) {
  }
}
function ensureJsonpgzDispatcher() {
  if (typeof window === 'undefined') return null;
  if (window[JSONPGZ_DISPATCHER_KEY]) return window[JSONPGZ_DISPATCHER_KEY];

  const previous = typeof window.jsonpgz === 'function' ? window.jsonpgz : null;
  const pendingByCode = new Map(); // code -> Set(entry)

  const dispatcher = (json) => {
    try {
      if (!json || typeof json !== 'object') {
        fundDebugLog('jsonpgz called with invalid payload', json);
        // 部分情况下接口会回调 jsonpgz() 但不给参数（undefined）。
        // 若当前只有 1 个 pending，可视为该请求失败信号，直接触发其 fallback，避免一直等到超时。
        if (pendingByCode.size === 1) {
          const onlyKey = Array.from(pendingByCode.keys())[0];
          const set = pendingByCode.get(onlyKey);
          if (set && set.size > 0) {
            fundDebugLog('jsonpgz invalid payload -> fail single pending', { fundcode: onlyKey, listeners: set.size });
            pendingByCode.delete(onlyKey);
            for (const entry of set) {
              try {
                entry?.cleanup?.();
              } catch (e) {
              }
              try {
                entry?.onError?.(new Error('jsonpgz invalid payload'));
              } catch (e) {
              }
            }
            return;
          }
        }
        if (previous) previous(json);
        return;
      }
      const code = json.fundcode != null ? String(json.fundcode).trim() : '';
      const set = code ? pendingByCode.get(code) : null;
      if (!set || set.size === 0) {
        fundDebugLog('jsonpgz no pending match', { fundcode: code, pendingKeys: Array.from(pendingByCode.keys()) });
        if (previous) previous(json);
        return;
      }

      fundDebugLog('jsonpgz dispatch', { fundcode: code, listeners: set.size });
      pendingByCode.delete(code);
      for (const entry of set) {
        try {
          entry?.cleanup?.();
        } catch (e) {
        }
        try {
          entry?.onJson?.(json);
        } catch (e) {
          try {
            entry?.onError?.(e);
          } catch (e2) {
          }
        }
      }
    } catch (e) {
      if (previous) previous(json);
    }
  };

  const api = {
    add(code, entry) {
      const k = code != null ? String(code).trim() : '';
      if (!k) return () => {};
      let set = pendingByCode.get(k);
      if (!set) {
        set = new Set();
        pendingByCode.set(k, set);
      }
      set.add(entry);
      fundDebugLog('jsonpgz add pending', { fundcode: k, pendingCount: set.size });
      return () => {
        const cur = pendingByCode.get(k);
        if (!cur) return;
        cur.delete(entry);
        if (cur.size === 0) pendingByCode.delete(k);
        fundDebugLog('jsonpgz remove pending', { fundcode: k, remaining: cur.size });
      };
    },
    previous,
  };

  window.jsonpgz = dispatcher;
  window[JSONPGZ_DISPATCHER_KEY] = api;
  fundDebugLog('jsonpgz dispatcher installed', { hadPrevious: Boolean(previous) });
  return api;
}

/** 同一基金代码并发的新浪估值 JSONP 去重，避免数据源 2/3 各打一遍 */
const sinaEstimateNetworthInflight = new Map();

function normalizeValuationDataSource(dataSource) {
  const n = Number(dataSource);
  if (n === 2) return 2;
  if (n === 3) return 3;
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
 * 按基金编码与数据源类型获取估值（天天基金 fundgz 或新浪估算曲线末点）。
 * @param {string} code - 基金编码
 * @param {number | string} [dataSource=1] - 1 天天基金；2、3 新浪估算不同口径
 * @returns {Promise<UnifiedFundValuation>}
 */
export async function fetchFundValuationBySource(code, dataSource = 1) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }
  const c = code != null ? String(code).trim() : '';
  if (!c) throw new Error('基金编码无效');

  const ds = normalizeValuationDataSource(dataSource);

  if (ds === 2 || ds === 3) {
    fundDebugLog('fetchFundValuationBySource sina', { code: c, dataSource: ds });
    const res = await fetchSinaEstimateNetworthResponse(c);
    if (!res?.result?.data?.networth || !Array.isArray(res.result.data.networth) || res.result.data.networth.length === 0) {
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
      gztime: lastPoint.min_time ? `${lastPoint.pre_date} ${lastPoint.min_time}`.replace(/:(\d{2}):\d{2}$/, ':$1') : null,
      gszzl,
      valuationSource: `sina_ds${ds}`,
      fundValuationTimeseries: { [c]: timeseries },
    };
  }

  const dispatcher = ensureJsonpgzDispatcher();
  if (!dispatcher) throw new Error('无浏览器环境');

  fundDebugLog('fetchFundValuationBySource fundgz', { code: c });
  const gzUrl = `https://fundgz.1234567.com.cn/js/${c}.js?rt=${Date.now()}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settleOnce = (fn) => (arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };
    const safeResolve = settleOnce(resolve);
    const safeReject = settleOnce(reject);

    const scriptGz = document.createElement('script');
    scriptGz.src = gzUrl;
    scriptGz.async = true;

    const cleanupScript = () => {
      try {
        if (timer) clearTimeout(timer);
      } catch (e) {}
      try {
        if (document.body && document.body.contains(scriptGz)) document.body.removeChild(scriptGz);
      } catch (e) {}
      try {
        if (removePending) removePending();
      } catch (e) {}
    };

    const onTimeout = () => {
      fundDebugLog('fetchFundValuationBySource gz timeout', { code: c, timeoutMs: 10000 });
      cleanupScript();
      safeReject(new Error('gz timeout'));
    };

    const timer = setTimeout(onTimeout, 10000);

    let removePending = null;
    removePending = dispatcher.add(c, {
      cleanup: cleanupScript,
      onJson: (json) => {
        fundDebugLog('fetchFundValuationBySource jsonpgz', { code: c, fundcode: json?.fundcode });
        cleanupScript();

        if (!json || typeof json !== 'object') {
          safeReject(new Error('invalid json'));
          return;
        }

        const gszzlNum = Number(json.gszzl);
        const gszNum = Number(json.gsz);
        safeResolve({
          code: json.fundcode != null ? String(json.fundcode).trim() : c,
          gsz: Number.isFinite(gszNum) ? gszNum : json.gsz,
          gztime: json.gztime != null ? String(json.gztime).replace(/:(\d{2}):\d{2}$/, ':$1') : null,
          gszzl: Number.isFinite(gszzlNum) ? gszzlNum : json.gszzl,
          valuationSource: 'fundgz',
        });
      },
      onError: (e) => {
        cleanupScript();
        safeReject(e || new Error('gz error callback'));
      },
    });

    scriptGz.onerror = () => {
      fundDebugLog('fetchFundValuationBySource gz script error', { code: c, url: gzUrl });
      cleanupScript();
      safeReject(new Error('gz script error'));
    };

    document.body.appendChild(scriptGz);
  });
}

export const fetchFundData = async (c) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }

  const code = c != null ? String(c).trim() : '';
  if (!code) return fetchFundDataFallback(c);

  let dataSource = 1;
  try {
    const arr = storageStore.getItem('funds', []);
    if (Array.isArray(arr)) {
      const f = arr.find(x => x.code === code);
      if (f && f.dataSource) dataSource = f.dataSource;
    }
  } catch (e) {}

  // 1. 发起并发的历史净值和重仓请求
  const lsjzPromise = new Promise((resolveT) => {
    const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=3&sdate=&edate=`;
    loadScript(url, { staleTime: getNetValueStaleTime() })
      .then((apidata) => {
        const content = apidata?.content || '';
        const navList = parseNetValuesFromLsjzContent(content);
        if (navList.length > 0) {
          const latest = navList[navList.length - 1];
          const previousNav = navList.length > 1 ? navList[navList.length - 2] : null;
          const yM = computeYesterdayNavMetricsFromList(navList);
          resolveT({
            dwjz: String(latest.nav),
            zzl: Number.isFinite(latest.growth) ? latest.growth : null,
            jzrq: latest.date,
            lastNav: previousNav ? String(previousNav.nav) : null,
            yesterdayZzl: yM.yesterdayZzl,
            yesterdayNavDelta: yM.yesterdayNavDelta,
          });
        } else {
          resolveT(null);
        }
      })
      .catch(() => resolveT(null));
  });

  const holdingsPromise = new Promise((resolveH) => {
    fundDebugLog('holdingsPromise start', { code });
    const holdingsUrl = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=10&year=&month=&_=${Date.now()}`;
    getQueryClient()
      .fetchQuery({
        queryKey: qk.fundHoldingsArchives(code),
        queryFn: async () => {
          const r = await runEastmoneyF10ScriptForApidata(holdingsUrl);
          if (!r?.ok) throw new Error(r?.error || '数据加载失败');
          return r.apidata;
        },
        staleTime: 60 * 60 * 1000,
      })
      .then(async (apidata) => {
      let holdings = [];
      const html = apidata?.content || '';
      const holdingsReportDate = extractHoldingsReportDate(html);
      const holdingsIsLastQuarter = isLastQuarterReport(holdingsReportDate);

    // 如果不是上一季度末的披露数据，则不展示重仓（并避免继续解析/请求行情）
    if (!holdingsIsLastQuarter) {
      resolveH({ holdings: [], holdingsReportDate, holdingsIsLastQuarter: false });
      return;
    }

    const headerRow = (html.match(/<thead[\s\S]*?<tr[\s\S]*?<\/tr>[\s\S]*?<\/thead>/i) || [])[0] || '';
    const headerCells = (headerRow.match(/<th[\s\S]*?>([\s\S]*?)<\/th>/gi) || []).map(th => th.replace(/<[^>]*>/g, '').trim());
    let idxCode = -1, idxName = -1, idxWeight = -1;
    headerCells.forEach((h, i) => {
      const t = h.replace(/\s+/g, '');
      if (idxCode < 0 && (t.includes('股票代码') || t.includes('证券代码'))) idxCode = i;
      if (idxName < 0 && (t.includes('股票名称') || t.includes('证券名称'))) idxName = i;
      if (idxWeight < 0 && (t.includes('占净值比例') || t.includes('占比'))) idxWeight = i;
    });
    const rows = html.match(/<tbody[\s\S]*?<\/tbody>/i) || [];
    const dataRows = rows.length ? rows[0].match(/<tr[\s\S]*?<\/tr>/gi) || [] : html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const r of dataRows) {
      const tds = (r.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi) || []).map(td => td.replace(/<[^>]*>/g, '').trim());
      if (!tds.length) continue;
      let hc = '';
      let hn = '';
      let hw = '';
      if (idxCode >= 0 && tds[idxCode]) {
        const raw = String(tds[idxCode] || '').trim();
        const mA = raw.match(/(\d{6})/);
        const mHK = raw.match(/(\d{5})/);
        // 海外股票常见为英文代码（如 AAPL / usAAPL / TSLA.US / 0700.HK）
        const mAlpha = raw.match(/\b([A-Za-z]{1,10})\b/);
        hc = mA ? mA[1] : (mHK ? mHK[1] : (mAlpha ? mAlpha[1].toUpperCase() : raw));
      } else {
        const codeIdx = tds.findIndex(txt => /^\d{6}$/.test(txt));
        if (codeIdx >= 0) hc = tds[codeIdx];
      }
      if (idxName >= 0 && tds[idxName]) {
        hn = tds[idxName];
      } else if (hc) {
        const i = tds.findIndex(txt => txt && txt !== hc && !/%$/.test(txt));
        hn = i >= 0 ? tds[i] : '';
      }
      if (idxWeight >= 0 && tds[idxWeight]) {
        const wm = tds[idxWeight].match(/([\d.]+)\s*%/);
        hw = wm ? `${wm[1]}%` : tds[idxWeight];
      } else {
        const wIdx = tds.findIndex(txt => /\d+(?:\.\d+)?\s*%/.test(txt));
        hw = wIdx >= 0 ? tds[wIdx].match(/([\d.]+)\s*%/)?.[1] + '%' : '';
      }
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
        tencentCode: normalizeTencentCode(h.code),
      }))
      .filter((x) => Boolean(x.tencentCode));
    if (needQuotes.length) {
      try {
        const tencentCodes = needQuotes.map((x) => x.tencentCode).join(',');
        if (!tencentCodes) {
          resolveH(holdings);
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
      } catch (e) {
      }
    }
      resolveH({ holdings, holdingsReportDate, holdingsIsLastQuarter });
    fundDebugLog('holdingsPromise resolved', { code, holdingsCount: holdings?.length || 0, holdingsReportDate, holdingsIsLastQuarter });
      })
      .catch(() => resolveH({ holdings: [], holdingsReportDate: null, holdingsIsLastQuarter: false }));
  });

  // 2. 发起估值请求（各数据源统一走 fetchFundValuationBySource）
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

    const [tData, holdingsResult] = await Promise.all([lsjzPromise, holdingsPromise]);

    const {
      holdings,
      holdingsReportDate,
      holdingsIsLastQuarter
    } = holdingsResult || {};

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

    if (!baseData.name) {
      try {
        const results = await searchFunds(code);
        const found = results.find((item) => item.CODE === code);
        if (found) baseData.name = found.NAME || found.SHORTNAME;
      } catch (e) {}
    }

    resolve({
      ...baseData,
      holdings,
      holdingsReportDate,
      holdingsIsLastQuarter
    });
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
              results = data.Datas.filter(d =>
                d.CATEGORY === 700 ||
                d.CATEGORY === '700' ||
                d.CATEGORYDESC === '基金'
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
      staleTime: ONE_DAY_MS,
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
  { code: 'gzKOSDAQ', varKey: 'v_gzKOSDAQ', name: '韩国创业板' },
];

function parseIndexRaw(data) {
  if (!data || typeof data !== 'string') return null;
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
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
  };
}

function parseGlobalIndexRaw(data) {
  if (!data || typeof data !== 'string') return null;
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
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
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

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    tagName: data.tag_name,
    body: data.body || ''
  };
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
  'swithSameType',
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
    ...out,
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
  if (!Array.isArray(trend) || trend.length < 2) return null;
  const valid = trend
    .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)))
    .sort((a, b) => a.x - b.x);
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
  if (!Array.isArray(trend) || trend.length < 2) return null;
  const valid = trend
    .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)))
    .sort((a, b) => a.x - b.x);
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
      consecutiveTrend: calculateConsecutiveTrend(pz?.Data_netWorthTrend),
    };
  } catch {
    return empty;
  }
}

export const fetchFundHistory = async (code, range = '1m') => {
  if (typeof window === 'undefined') return [];

  const end = nowInTz();
  let start = end.clone();

  switch (range) {
    case '1m': start = start.subtract(1, 'month'); break;
    case '3m': start = start.subtract(3, 'month'); break;
    case '6m': start = start.subtract(6, 'month'); break;
    case '1y': start = start.subtract(1, 'year'); break;
    case '3y': start = start.subtract(3, 'year'); break;
    case 'all': start = dayjs(0).tz(TZ); break;
    default: start = start.subtract(1, 'month');
  }

  // 业绩走势统一走 pingzhongdata.Data_netWorthTrend，
  // 同时附带 Data_grandTotal（若存在，格式为 [{ name, data: [[ts, val], ...] }, ...]）
  try {
    const pz = await fetchFundPingzhongdata(code);
    const trend = pz?.Data_netWorthTrend;
    const grandTotal = pz?.Data_grandTotal;

    if (Array.isArray(trend) && trend.length) {
      const startMs = start.startOf('day').valueOf();
      const endMs = end.endOf('day').valueOf();

      // 若起始日没有净值，则往前推到最近一日有净值的数据作为有效起始
      const validTrend = trend
        .filter((d) => d && typeof d.x === 'number' && Number.isFinite(Number(d.y)) && d.x <= endMs)
        .sort((a, b) => a.x - b.x);
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
          return { date, value };
        });

      // 解析 Data_grandTotal 为多条对比曲线，使用同一有效起始日
      if (Array.isArray(grandTotal) && grandTotal.length) {
        const grandTotalSeries = grandTotal
          .map((series) => {
            if (!series || !series.data || !Array.isArray(series.data)) return null;
            const name = series.name || '';
            const points = series.data
              .filter((item) => Array.isArray(item) && typeof item[0] === 'number')
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

export const parseFundTextWithLLM = async (text) => {
  if (!text) return null;
  if (!isSupabaseConfigured) return null;
  if (!supabase?.functions?.invoke) return null;

  try {
    const { data, error } = await supabase.functions.invoke('analyze-fund', {
      body: { text }
    });

    if (error) return null;
    if (!data || data.success !== true) return null;
    if (!Array.isArray(data.data)) return null;

    // 保持与旧实现兼容：返回 JSON 字符串，由调用方 JSON.parse
    return JSON.stringify(data.data);
  } catch (e) {
    return null;
  }
};
