import { useCallback, useRef } from 'react';
import { cachedRequest, clearCachedRequest } from '../lib/cacheRequest';

const FUND_CODE_SEARCH_URL = 'https://fund.eastmoney.com/js/fundcode_search.js';
const FUND_LIST_CACHE_KEY = 'eastmoney_fundcode_search_list';
const FUND_LIST_CACHE_TIME = 24 * 60 * 60 * 1000;

const formatEastMoneyFundList = (rawList) => {
  if (!Array.isArray(rawList)) return [];

  return rawList
    .map((item) => {
      if (!Array.isArray(item)) return null;
      const code = String(item[0] ?? '').trim();
      const name = String(item[2] ?? '').trim();
      if (!code || !name) return null;
      return { code, name };
    })
    .filter(Boolean);
};

export const useFundFuzzyMatcher = () => {
  const allFundFuseRef = useRef(null);
  const allFundLoadPromiseRef = useRef(null);

  const getAllFundFuse = useCallback(async () => {
    if (allFundFuseRef.current) return allFundFuseRef.current;
    if (allFundLoadPromiseRef.current) return allFundLoadPromiseRef.current;

    allFundLoadPromiseRef.current = (async () => {
      const [fuseModule, allFundList] = await Promise.all([
        import('fuse.js'),
        cachedRequest(
          () =>
            new Promise((resolve, reject) => {
              if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
                reject(new Error('NO_BROWSER_ENV'));
                return;
              }

              const prevR = window.r;
              const script = document.createElement('script');
              script.src = `${FUND_CODE_SEARCH_URL}?_=${Date.now()}`;
              script.async = true;

              const cleanup = () => {
                if (document.body.contains(script)) {
                  document.body.removeChild(script);
                }
                if (prevR === undefined) {
                  try {
                    delete window.r;
                  } catch (e) {
                    window.r = undefined;
                  }
                } else {
                  window.r = prevR;
                }
              };

              script.onload = () => {
                const snapshot = Array.isArray(window.r) ? JSON.parse(JSON.stringify(window.r)) : [];
                cleanup();
                const parsed = formatEastMoneyFundList(snapshot);
                if (!parsed.length) {
                  reject(new Error('PARSE_ALL_FUND_FAILED'));
                  return;
                }
                resolve(parsed);
              };

              script.onerror = () => {
                cleanup();
                reject(new Error('LOAD_ALL_FUND_FAILED'));
              };

              document.body.appendChild(script);
            }),
          FUND_LIST_CACHE_KEY,
          { cacheTime: FUND_LIST_CACHE_TIME }
        ),
      ]);
      const Fuse = fuseModule.default;
      const fuse = new Fuse(Array.isArray(allFundList) ? allFundList : [], {
        keys: ['name', 'code'],
        includeScore: true,
        threshold: 0.5,
        ignoreLocation: true,
        minMatchCharLength: 2,
      });

      allFundFuseRef.current = fuse;
      return fuse;
    })();

    try {
      return await allFundLoadPromiseRef.current;
    } catch (e) {
      allFundLoadPromiseRef.current = null;
      clearCachedRequest(FUND_LIST_CACHE_KEY);
      throw e;
    }
  }, []);

  const normalizeFundText = useCallback((value) => {
    if (typeof value !== 'string') return '';
    return value
      .toUpperCase()
      .replace(/[（(]/g, '(')
      .replace(/[）)]/g, ')')
      .replace(/[·•]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^\u4e00-\u9fa5A-Z0-9()]/g, '');
  }, []);

  const parseFundQuerySignals = useCallback((rawName) => {
    const normalized = normalizeFundText(rawName);
    const hasETF = normalized.includes('ETF');
    const hasLOF = normalized.includes('LOF');
    const hasLink = normalized.includes('联接');
    const shareMatch = normalized.match(/([A-Z])(?:类)?$/i);
    const shareClass = shareMatch ? shareMatch[1].toUpperCase() : null;

    const core = normalized
      .replace(/基金/g, '')
      .replace(/ETF联接/g, '')
      .replace(/联接[A-Z]?/g, '')
      .replace(/ETF/g, '')
      .replace(/LOF/g, '')
      .replace(/[A-Z](?:类)?$/g, '');

    return {
      normalized,
      core,
      hasETF,
      hasLOF,
      hasLink,
      shareClass,
    };
  }, [normalizeFundText]);

  const resolveFundCodeByFuzzy = useCallback(async (name) => {
    const querySignals = parseFundQuerySignals(name);
    if (!querySignals.normalized) return null;

    const len = querySignals.normalized.length;
    const strictThreshold = len <= 4 ? 0.16 : len <= 8 ? 0.22 : 0.28;
    const relaxedThreshold = Math.min(0.45, strictThreshold + 0.16);
    const scoreGapThreshold = len <= 5 ? 0.08 : 0.06;

    const fuse = await getAllFundFuse();
    const recalled = fuse.search(name, { limit: 50 });
    if (!recalled.length) return null;

    const stage1 = recalled.filter((item) => (item.score ?? 1) <= relaxedThreshold);
    if (!stage1.length) return null;

    const ranked = stage1
      .map((item) => {
        const candidateSignals = parseFundQuerySignals(item?.item?.name || '');
        let finalScore = item.score ?? 1;

        if (querySignals.hasETF) {
          finalScore += candidateSignals.hasETF ? -0.04 : 0.2;
        }
        if (querySignals.hasLOF) {
          finalScore += candidateSignals.hasLOF ? -0.04 : 0.2;
        }
        if (querySignals.hasLink) {
          finalScore += candidateSignals.hasLink ? -0.03 : 0.18;
        }
        if (querySignals.shareClass) {
          finalScore += candidateSignals.shareClass === querySignals.shareClass ? -0.03 : 0.18;
        }

        if (querySignals.core && candidateSignals.core) {
          if (candidateSignals.core.includes(querySignals.core)) {
            finalScore -= 0.06;
          } else if (!querySignals.core.includes(candidateSignals.core)) {
            finalScore += 0.06;
          }
        }

        return { ...item, finalScore };
      })
      .sort((a, b) => a.finalScore - b.finalScore);

    const top1 = ranked[0];
    if (!top1 || top1.finalScore > strictThreshold) return null;

    const top2 = ranked[1];
    if (top2 && (top2.finalScore - top1.finalScore) < scoreGapThreshold) {
      return null;
    }

    return top1?.item?.code || null;
  }, [getAllFundFuse, parseFundQuerySignals]);

  return {
    resolveFundCodeByFuzzy,
  };
};

export default useFundFuzzyMatcher;
