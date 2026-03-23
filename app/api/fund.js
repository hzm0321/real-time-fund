import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isString } from 'lodash';
import { cachedRequest, clearCachedRequest } from '../lib/cacheRequest';

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
 * 获取基金「关联板块/跟踪标的」信息（走本地 API，并做 1 天缓存）
 * 接口：/api/related-sectors?code=xxxxxx
 * 返回：{ code: string, relatedSectors: string }
 */
export const fetchRelatedSectors = async (code, { cacheTime = ONE_DAY_MS } = {}) => {
  if (!code) return '';
  const normalized = String(code).trim();
  if (!normalized) return '';

  const url = `/api/related-sectors?code=${encodeURIComponent(normalized)}`;
  const cacheKey = `relatedSectors:${normalized}`;

  try {
    const data = await cachedRequest(async () => {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    }, cacheKey, { cacheTime });

    const relatedSectors = data?.relatedSectors;
    return relatedSectors ? String(relatedSectors).trim() : '';
  } catch (e) {
    return '';
  }
};

export const loadScript = (url) => {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve(null);

  let cacheKey = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('_');
    parsed.searchParams.delete('_t');
    cacheKey = parsed.toString();
  } catch (e) {
  }

  const cacheTime = 10 * 60 * 1000;

  return cachedRequest(
    () =>
      new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;

        const cleanup = () => {
          if (document.body.contains(script)) document.body.removeChild(script);
        };

        script.onload = () => {
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
          cleanup();
          resolve({ ok: false, error: '数据加载失败' });
        };

        document.body.appendChild(script);
      }),
    cacheKey,
    { cacheTime }
  ).then((result) => {
    if (!result?.ok) {
      clearCachedRequest(cacheKey);
      throw new Error(result?.error || '数据加载失败');
    }
    return result.apidata;
  });
};

export const fetchFundNetValue = async (code, date) => {
  if (typeof window === 'undefined') return null;
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=1&sdate=${date}&edate=${date}`;
  try {
    const apidata = await loadScript(url);
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
  const m = now.month(); // 0-11
  const q = Math.floor(m / 3); // 当前季度 0-3 => Q1-Q4

  let lastQ;
  let year;
  if (q === 0) {
    // 当前为 Q1，则上一季度是上一年的 Q4
    lastQ = 3;
    year = now.year() - 1;
  } else {
    lastQ = q - 1;
    year = now.year();
  }

  const quarterEnds = [
    { month: 2, day: 31 }, // Q1 -> 03-31
    { month: 5, day: 30 }, // Q2 -> 06-30
    { month: 8, day: 30 }, // Q3 -> 09-30
    { month: 11, day: 31 } // Q4 -> 12-31
  ];

  const { month: endMonth, day: endDay } = quarterEnds[lastQ];
  const lastQuarterEnd = dayjs(
    `${year}-${String(endMonth + 1).padStart(2, '0')}-${endDay}`,
    'YYYY-MM-DD'
  );

  return report.isSame(lastQuarterEnd, 'day');
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

export const fetchFundDataFallback = async (c) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }
  return new Promise(async (resolve, reject) => {
    const searchCallbackName = `SuggestData_fallback_${Date.now()}`;
    const searchUrl = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(c)}&callback=${searchCallbackName}&_=${Date.now()}`;
    let fundName = '';
    try {
      await new Promise((resSearch, rejSearch) => {
        window[searchCallbackName] = (data) => {
          if (data && data.Datas && data.Datas.length > 0) {
            const found = data.Datas.find(d => d.CODE === c);
            if (found) {
              fundName = found.NAME || found.SHORTNAME || '';
            }
          }
          delete window[searchCallbackName];
          resSearch();
        };
        const script = document.createElement('script');
        script.src = searchUrl;
        script.async = true;
        script.onload = () => {
          if (document.body.contains(script)) document.body.removeChild(script);
        };
        script.onerror = () => {
          if (document.body.contains(script)) document.body.removeChild(script);
          delete window[searchCallbackName];
          rejSearch(new Error('搜索接口失败'));
        };
        document.body.appendChild(script);
        setTimeout(() => {
          if (window[searchCallbackName]) {
            delete window[searchCallbackName];
            resSearch();
          }
        }, 3000);
      });
    } catch (e) {
    }
    try {
      const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${c}&page=1&per=1&sdate=&edate=`;
      const apidata = await loadScript(url);
      const content = apidata?.content || '';
      const latest = parseLatestNetValueFromLsjzContent(content);
      if (latest && latest.nav) {
        const name = fundName || `未知基金(${c})`;
        resolve({
          code: c,
          name,
          dwjz: String(latest.nav),
          gsz: null,
          gztime: null,
          jzrq: latest.date,
          gszzl: null,
          zzl: Number.isFinite(latest.growth) ? latest.growth : null,
          noValuation: true,
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

export const fetchFundData = async (c) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }
  return new Promise(async (resolve, reject) => {
    const gzUrl = `https://fundgz.1234567.com.cn/js/${c}.js?rt=${Date.now()}`;
    const scriptGz = document.createElement('script');
    scriptGz.src = gzUrl;
    const originalJsonpgz = window.jsonpgz;
    window.jsonpgz = (json) => {
      window.jsonpgz = originalJsonpgz;
      if (!json || typeof json !== 'object') {
        fetchFundDataFallback(c).then(resolve).catch(reject);
        return;
      }
      const gszzlNum = Number(json.gszzl);
      const gzData = {
        code: json.fundcode,
        name: json.name,
        dwjz: json.dwjz,
        gsz: json.gsz,
        gztime: json.gztime,
        jzrq: json.jzrq,
        gszzl: Number.isFinite(gszzlNum) ? gszzlNum : json.gszzl
      };
      const lsjzPromise = new Promise((resolveT) => {
        const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${c}&page=1&per=2&sdate=&edate=`;
        loadScript(url)
          .then((apidata) => {
            const content = apidata?.content || '';
            const navList = parseNetValuesFromLsjzContent(content);
            if (navList.length > 0) {
              const latest = navList[navList.length - 1];
              const previousNav = navList.length > 1 ? navList[navList.length - 2] : null;
              resolveT({
                dwjz: String(latest.nav),
                zzl: Number.isFinite(latest.growth) ? latest.growth : null,
                jzrq: latest.date,
                lastNav: previousNav ? String(previousNav.nav) : null
              });
            } else {
              resolveT(null);
            }
          })
          .catch(() => resolveT(null));
      });
      const holdingsPromise = new Promise((resolveH) => {
        const holdingsUrl = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${c}&topline=10&year=&month=&_=${Date.now()}`;
        const holdingsCacheKey = `fund_holdings_archives_${c}`;
        cachedRequest(
          () => loadScript(holdingsUrl),
          holdingsCacheKey,
          { cacheTime: 60 * 60 * 1000 }
        ).then(async (apidata) => {
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
            let code = '';
            let name = '';
            let weight = '';
            if (idxCode >= 0 && tds[idxCode]) {
              const raw = String(tds[idxCode] || '').trim();
              const mA = raw.match(/(\d{6})/);
              const mHK = raw.match(/(\d{5})/);
              // 海外股票常见为英文代码（如 AAPL / usAAPL / TSLA.US / 0700.HK）
              const mAlpha = raw.match(/\b([A-Za-z]{1,10})\b/);
              code = mA ? mA[1] : (mHK ? mHK[1] : (mAlpha ? mAlpha[1].toUpperCase() : raw));
            } else {
              const codeIdx = tds.findIndex(txt => /^\d{6}$/.test(txt));
              if (codeIdx >= 0) code = tds[codeIdx];
            }
            if (idxName >= 0 && tds[idxName]) {
              name = tds[idxName];
            } else if (code) {
              const i = tds.findIndex(txt => txt && txt !== code && !/%$/.test(txt));
              name = i >= 0 ? tds[i] : '';
            }
            if (idxWeight >= 0 && tds[idxWeight]) {
              const wm = tds[idxWeight].match(/([\d.]+)\s*%/);
              weight = wm ? `${wm[1]}%` : tds[idxWeight];
            } else {
              const wIdx = tds.findIndex(txt => /\d+(?:\.\d+)?\s*%/.test(txt));
              weight = wIdx >= 0 ? tds[wIdx].match(/([\d.]+)\s*%/)?.[1] + '%' : '';
            }
            if (code || name || weight) {
              holdings.push({ code, name, weight, change: null });
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
                scriptQuote.onload = () => {
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
                  if (document.body.contains(scriptQuote)) document.body.removeChild(scriptQuote);
                  resQuote();
                };
                scriptQuote.onerror = () => {
                  if (document.body.contains(scriptQuote)) document.body.removeChild(scriptQuote);
                  resQuote();
                };
                document.body.appendChild(scriptQuote);
              });
            } catch (e) {
            }
          }
          resolveH({ holdings, holdingsReportDate, holdingsIsLastQuarter });
        }).catch(() => resolveH({ holdings: [], holdingsReportDate: null, holdingsIsLastQuarter: false }));
      });
      Promise.all([lsjzPromise, holdingsPromise]).then(([tData, holdingsResult]) => {
        const {
          holdings,
          holdingsReportDate,
          holdingsIsLastQuarter
        } = holdingsResult || {};
        if (tData) {
          if (tData.jzrq && (!gzData.jzrq || tData.jzrq >= gzData.jzrq)) {
            gzData.dwjz = tData.dwjz;
            gzData.jzrq = tData.jzrq;
            gzData.zzl = tData.zzl;
            gzData.lastNav = tData.lastNav;
          }
        }
        resolve({
          ...gzData,
          holdings,
          holdingsReportDate,
          holdingsIsLastQuarter
        });
      });
    };
    scriptGz.onerror = () => {
      window.jsonpgz = originalJsonpgz;
      if (document.body.contains(scriptGz)) document.body.removeChild(scriptGz);
      reject(new Error('基金数据加载失败'));
    };
    document.body.appendChild(scriptGz);
    setTimeout(() => {
      if (document.body.contains(scriptGz)) document.body.removeChild(scriptGz);
    }, 5000);
  });
};

export const searchFunds = async (val) => {
  if (!val.trim()) return [];
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  const callbackName = `SuggestData_${Date.now()}`;
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(val)}&callback=${callbackName}&_=${Date.now()}`;
  return new Promise((resolve, reject) => {
    window[callbackName] = (data) => {
      let results = [];
      if (data && data.Datas) {
        results = data.Datas.filter(d =>
          d.CATEGORY === 700 ||
          d.CATEGORY === '700' ||
          d.CATEGORYDESC === '基金'
        );
      }
      delete window[callbackName];
      resolve(results);
    };
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      delete window[callbackName];
      reject(new Error('搜索请求失败'));
    };
    document.body.appendChild(script);
  });
};

export const fetchShanghaiIndexDate = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://qt.gtimg.cn/q=sh000001&_t=${Date.now()}`;
    script.onload = () => {
      const data = window.v_sh000001;
      let dateStr = null;
      if (data) {
        const parts = data.split('~');
        if (parts.length > 30) {
          dateStr = parts[30].slice(0, 8);
        }
      }
      if (document.body.contains(script)) document.body.removeChild(script);
      resolve(dateStr);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
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

export const fetchMarketIndices = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const codes = MARKET_INDEX_KEYS.map((item) => item.code).join(',');
    script.src = `https://qt.gtimg.cn/q=${codes}&_t=${Date.now()}`;
    script.onload = () => {
      const list = MARKET_INDEX_KEYS.map(({ name: defaultName, varKey }) => {
        const raw = window[varKey];
        const parsed = parseIndexRaw(raw);
        if (!parsed) return { name: defaultName, code: '', price: 0, change: 0, changePercent: 0 };
        return { ...parsed, code: varKey.replace('v_', '') };
      });
      if (document.body.contains(script)) document.body.removeChild(script);
      resolve(list);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
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

  const cacheKey = `pingzhongdata_${fundCode}`;

  try {
    return await cachedRequest(
      () => fetchAndParsePingzhongdata(fundCode),
      cacheKey,
      { cacheTime }
    );
  } catch (e) {
    clearCachedRequest(cacheKey);
    throw e;
  }
};

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

const API_KEYS = [
  'sk-25b8a4a3d88a49e82e87c981d9d8f6b4',
  'sk-1565f822d5bd745b6529cfdf28b55574'
  // 添加更多 API Key 到这里
];

// 随机从数组中选择一个 API Key
const getRandomApiKey = () => {
  if (!API_KEYS.length) return null;
  return API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
};

export const parseFundTextWithLLM = async (text) => {
  const apiKey = getRandomApiKey();
  if (!apiKey || !text) return null;

  try {
    const response = await fetch('https://apis.iflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3-max',
        messages: [
          { role: 'system', content: "你是一个基金文本解析助手。请从提供的OCR文本中执行以下任务：\n抽取所有基金信息，包括：基金名称：中文字符串（可含英文或括号），名称后常跟随金额数字。基金代码：6位数字（如果存在）。持有金额：数字格式（可能含千分位逗号或小数，如果存在）。持有收益：数字格式（可能含千分位逗号或小数，如果存在）。忽略无关文本。输出格式：以JSON数组形式返回结果，每个基金信息为一个对象，包含以下字段：基金名称（必填，字符串）基金代码（可选，字符串，不存在时为空字符串）持有金额（可选，字符串，不存在时为空字符串）持有收益（可选，字符串，不存在时为空字符串）示例输出：[{'fundName':'华夏成长混合','fundCode':'000001','holdAmounts':'50,000.00','holdGains':'2,500.00'},{'fundName':'易方达消费行业','fundCode':'','holdAmounts':'10,000.00','holdGains':'}]。除了示例输出的内容外，不要输出任何多余内容"},
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) {
    return null;
  }
};
