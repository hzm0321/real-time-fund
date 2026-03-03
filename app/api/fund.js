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
        const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${c}&page=1&per=1&sdate=&edate=`;
        loadScript(url)
          .then((apidata) => {
            const content = apidata?.content || '';
            const latest = parseLatestNetValueFromLsjzContent(content);
            if (latest && latest.nav) {
              resolveT({
                dwjz: String(latest.nav),
                zzl: Number.isFinite(latest.growth) ? latest.growth : null,
                jzrq: latest.date
              });
            } else {
              resolveT(null);
            }
          })
          .catch(() => resolveT(null));
      });
      const holdingsPromise = new Promise((resolveH) => {
        const holdingsUrl = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${c}&topline=10&year=&month=&_=${Date.now()}`;
        loadScript(holdingsUrl).then(async (apidata) => {
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
              const m = tds[idxCode].match(/(\d{6})/);
              code = m ? m[1] : tds[idxCode];
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
          const needQuotes = holdings.filter(h => /^\d{6}$/.test(h.code) || /^\d{5}$/.test(h.code));
          if (needQuotes.length) {
            try {
              const tencentCodes = needQuotes.map(h => {
                const cd = String(h.code || '');
                if (/^\d{6}$/.test(cd)) {
                  const pfx = cd.startsWith('6') || cd.startsWith('9') ? 'sh' : ((cd.startsWith('4') || cd.startsWith('8')) ? 'bj' : 'sz');
                  return `s_${pfx}${cd}`;
                }
                if (/^\d{5}$/.test(cd)) {
                  return `s_hk${cd}`;
                }
                return null;
              }).filter(Boolean).join(',');
              if (!tencentCodes) {
                resolveH(holdings);
                return;
              }
              const quoteUrl = `https://qt.gtimg.cn/q=${tencentCodes}`;
              await new Promise((resQuote) => {
                const scriptQuote = document.createElement('script');
                scriptQuote.src = quoteUrl;
                scriptQuote.onload = () => {
                  needQuotes.forEach(h => {
                    const cd = String(h.code || '');
                    let varName = '';
                    if (/^\d{6}$/.test(cd)) {
                      const pfx = cd.startsWith('6') || cd.startsWith('9') ? 'sh' : ((cd.startsWith('4') || cd.startsWith('8')) ? 'bj' : 'sz');
                      varName = `v_s_${pfx}${cd}`;
                    } else if (/^\d{5}$/.test(cd)) {
                      varName = `v_s_hk${cd}`;
                    } else {
                      return;
                    }
                    const dataStr = window[varName];
                    if (dataStr) {
                      const parts = dataStr.split('~');
                      if (parts.length > 5) {
                        h.change = parseFloat(parts[5]);
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

// 使用智谱 GLM 从 OCR 文本中抽取基金名称
export const extractFundNamesWithLLM = async (ocrText) => {
  const apiKey = '8df8ccf74a174722847c83b7e222f2af.4A39rJvUeBVDmef1';
  if (!apiKey || !ocrText) return [];

  try {
    const models = ['glm-4.5-flash', 'glm-4.7-flash'];
    const model = models[Math.floor(Math.random() * models.length)];

    const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content:
              '你是一个基金 OCR 文本解析助手。' +
              '从下面的 OCR 文本中抽取其中出现的「基金名称列表」。' +
              '要求：1）基金名称一般为中文，中间不能有空字符串,可包含部分英文或括号' +
              '2）名称后面通常会跟着金额或持有金额（数字，可能带千分位逗号和小数）；' +
              '3）忽略无关信息，只返回你判断为基金名称的字符串；' +
              '4）去重后输出。输出格式：严格返回 JSON，如 {"fund_names": ["基金名称1","基金名称2"]}，不要输出任何多余说明',
          },
          {
            role: 'user',
            content: String(ocrText),
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        thinking: {
          type: 'disabled',
        },
      }),
    });

    if (!resp.ok) {
      return [];
    }

    const data = await resp.json();
    let content = data?.choices?.[0]?.message?.content?.match(/\{[\s\S]*?\}/)?.[0];
    if (!isString(content)) return [];

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return [];
    }

    const names = parsed?.fund_names;
    if (!Array.isArray(names)) return [];
    return names
      .map((n) => (isString(n) ? n.trim().replaceAll(' ','') : ''))
      .filter(Boolean);
  } catch (e) {
    return [];
  }
};

let historyQueue = Promise.resolve();

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
    default: start = start.subtract(1, 'month');
  }

  const sdate = start.format('YYYY-MM-DD');
  const edate = end.format('YYYY-MM-DD');
  const per = 49;

  return new Promise((resolve) => {
    historyQueue = historyQueue.then(async () => {
      let allData = [];
      let page = 1;
      let totalPages = 1;

      try {
        const parseContent = (content) => {
            if (!content) return [];
            const rows = content.split('<tr>');
            const data = [];
            for (const row of rows) {
                const cells = row.match(/<td[^>]*>(.*?)<\/td>/g);
                if (cells && cells.length >= 2) {
                    const dateStr = cells[0].replace(/<[^>]+>/g, '').trim();
                    const valStr = cells[1].replace(/<[^>]+>/g, '').trim();
                    const val = parseFloat(valStr);
                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(val)) {
                        data.push({ date: dateStr, value: val });
                    }
                }
            }
            return data;
        };

        // Fetch first page to get metadata
        const firstUrl = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=${page}&per=${per}&sdate=${sdate}&edate=${edate}`;
        const firstApidata = await loadScript(firstUrl);

        if (!firstApidata || !firstApidata.content || firstApidata.content.includes('暂无数据')) {
          resolve([]);
          return;
        }

        // Parse total pages
        if (firstApidata.pages) {
            totalPages = parseInt(firstApidata.pages, 10) || 1;
        }

        allData = allData.concat(parseContent(firstApidata.content));

        // Fetch remaining pages
        for (page = 2; page <= totalPages; page++) {
             const nextUrl = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=${page}&per=${per}&sdate=${sdate}&edate=${edate}`;
             const nextApidata = await loadScript(nextUrl);
             if (nextApidata && nextApidata.content) {
                 allData = allData.concat(parseContent(nextApidata.content));
             }
        }

        // The data comes in reverse chronological order (newest first), so we need to reverse it for the chart (oldest first)
        resolve(allData.reverse());

      } catch (e) {
        console.error('Fetch history error:', e);
        resolve([]);
      }
    }).catch((e) => {
       console.error('Queue error:', e);
       resolve([]);
    });
  });
};
