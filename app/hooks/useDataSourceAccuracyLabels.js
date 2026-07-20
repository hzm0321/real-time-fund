'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { isArray, isNumber, isObject } from 'lodash';
import { fetchBestValuationSource, fetchFundValuationBySource } from '@/app/api/fund';
import { asyncPool } from '@/app/lib/asyncHelper';

const TODAY_LABEL = '今日最准';
const YESTERDAY_LABEL = '昨日最准';

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function resolveAccuracyLabel(row, todayStr) {
  const fund = row?.rawFund || row;
  const code = fund?.code != null ? String(fund.code).trim() : '';
  const dataSource = Number(fund?.dataSource || 1);
  const actualZzl = isNumber(fund?.zzl) && Number.isFinite(fund.zzl) ? fund.zzl : null;

  if (!code || actualZzl == null || !fund?.jzrq || !Number.isFinite(dataSource)) return null;

  const bestResult = await fetchBestValuationSource(code, fund.jzrq, actualZzl);
  if (!bestResult) return null;

  let bestSource = Number(bestResult.bestSource);
  let isTodayAccuracy = bestResult.isTodayAccuracy === true;
  let isYesterdayAccuracy = bestResult.isYesterdayAccuracy === true;

  if (fund.jzrq === todayStr) {
    const values = await Promise.all([
      fetchFundValuationBySource(code, 1).catch(() => null),
      fetchFundValuationBySource(code, 2).catch(() => null),
      fetchFundValuationBySource(code, 3).catch(() => null)
    ]);
    const diffs = {};
    values.forEach((value, index) => {
      if (value?.gszzl != null && Number.isFinite(Number(value.gszzl))) {
        diffs[String(index + 1)] = Math.abs(Number(value.gszzl) - actualZzl);
      }
    });

    if (Object.keys(diffs).length > 0) {
      let minDiff = Infinity;
      let nextBestSource = null;
      Object.entries(diffs).forEach(([source, diff]) => {
        if (diff < minDiff) {
          minDiff = diff;
          nextBestSource = Number(source);
        }
      });
      bestSource = nextBestSource;
      isTodayAccuracy = true;
      isYesterdayAccuracy = false;
    }
  }

  if (bestSource !== dataSource) return null;
  if (isTodayAccuracy) return TODAY_LABEL;
  if (isYesterdayAccuracy) return YESTERDAY_LABEL;
  return null;
}

export function useDataSourceAccuracyLabels(rows, enabled) {
  const [labelsByCode, setLabelsByCode] = useState({});
  const cacheRef = useRef(new Map());
  const todayStr = useMemo(() => getTodayStr(), []);
  const rowsKey = useMemo(() => {
    if (!isArray(rows)) return '';
    return rows
      .map((row) => {
        const fund = row?.rawFund || row;
        const code = fund?.code != null ? String(fund.code).trim() : '';
        if (!code) return '';
        return [code, fund?.dataSource || 1, fund?.jzrq || '', fund?.zzl ?? ''].join(':');
      })
      .filter(Boolean)
      .join('|');
  }, [rows]);

  useEffect(() => {
    if (!enabled || !isArray(rows) || rows.length === 0) {
      setLabelsByCode({});
      return;
    }

    const candidates = [];
    rows.forEach((row) => {
      const fund = row?.rawFund || row;
      const code = fund?.code != null ? String(fund.code).trim() : '';
      if (!code) return;
      const key = [code, fund?.dataSource || 1, fund?.jzrq || '', fund?.zzl ?? ''].join(':');
      candidates.push({ code, key, row });
    });

    const cached = {};
    candidates.forEach((item) => {
      if (cacheRef.current.has(item.key)) {
        const value = cacheRef.current.get(item.key);
        if (value) cached[item.code] = value;
      }
    });
    setLabelsByCode(cached);

    const missing = candidates.filter((item) => !cacheRef.current.has(item.key));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const nextBatch = {};
      await asyncPool(3, missing, async (item) => {
        const label = await resolveAccuracyLabel(item.row, todayStr).catch(() => null);
        cacheRef.current.set(item.key, label);
        if (label) nextBatch[item.code] = label;
      });

      if (cancelled || !isObject(nextBatch)) return;
      setLabelsByCode((prev) => {
        const next = { ...prev };
        let changed = false;
        missing.forEach((item) => {
          if (nextBatch[item.code]) {
            if (next[item.code] !== nextBatch[item.code]) {
              next[item.code] = nextBatch[item.code];
              changed = true;
            }
          } else if (next[item.code] !== undefined) {
            delete next[item.code];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, rows, rowsKey, todayStr]);

  return labelsByCode;
}
