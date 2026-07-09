'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { isArray, isNumber, isObject } from 'lodash';
import { fetchBestValuationSourceBatch, fetchFundValuationBySource } from '@/app/api/fund';
import { asyncPool } from '@/app/lib/asyncHelper';
import { useMembership } from '@/app/hooks/useMembership';

const TODAY_LABEL = '今日最准';
const YESTERDAY_LABEL = '昨日最准';

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 根据批量获取的 bestValuationSource 结果，为单个基金计算准确度标签。
 *
 * 当 jzrq === todayStr 时，还需额外通过 JSONP 获取 3 个数据源的实时估值，
 * 用实时数据重新计算最准数据源（覆盖 Edge Function 返回的结果）。
 *
 * @param {Object} row - 表格行数据
 * @param {string} todayStr - 今日日期字符串
 * @param {{ bestSource: number|null, isYesterdayAccuracy: boolean, isTodayAccuracy: boolean }|null} bestResult - Edge Function 批量返回的结果
 * @returns {Promise<string|null>} '今日最准' | '昨日最准' | null
 */
async function resolveAccuracyLabel(row, todayStr, bestResult) {
  const fund = row?.rawFund || row;
  const dataSource = Number(fund?.dataSource || 1);

  if (!Number.isFinite(dataSource)) return null;

  if (!bestResult) return null;

  let bestSource = Number(bestResult.bestSource);
  let isTodayAccuracy = bestResult.isTodayAccuracy === true;
  let isYesterdayAccuracy = bestResult.isYesterdayAccuracy === true;

  // 当 jzrq 为今天时，额外用实时估值重新计算最准数据源
  if (fund.jzrq === todayStr) {
    const code = fund?.code != null ? String(fund.code).trim() : '';
    const actualZzl = isNumber(fund?.zzl) && Number.isFinite(fund.zzl) ? fund.zzl : null;
    if (code && actualZzl != null) {
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
  }

  if (bestSource !== dataSource) return null;
  if (isTodayAccuracy) return TODAY_LABEL;
  if (isYesterdayAccuracy) return YESTERDAY_LABEL;
  return null;
}

export function useDataSourceAccuracyLabels(rows, enabled) {
  const { isVip } = useMembership();
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
    if (!enabled || !isVip || !isArray(rows) || rows.length === 0) {
      setLabelsByCode({});
      return;
    }

    // 1. 构建 candidates 列表
    const candidates = [];
    rows.forEach((row) => {
      const fund = row?.rawFund || row;
      const code = fund?.code != null ? String(fund.code).trim() : '';
      if (!code) return;
      const key = [code, fund?.dataSource || 1, fund?.jzrq || '', fund?.zzl ?? ''].join(':');
      candidates.push({ code, key, row });
    });

    // 2. 从本地缓存中取出已计算的标签
    const cached = {};
    candidates.forEach((item) => {
      if (cacheRef.current.has(item.key)) {
        const value = cacheRef.current.get(item.key);
        if (value) cached[item.code] = value;
      }
    });
    setLabelsByCode(cached);

    // 3. 过滤出需要请求的 candidates
    const missing = candidates.filter((item) => !cacheRef.current.has(item.key));
    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      // 4. 构建批量请求参数
      const batchItems = [];
      const missingByKey = {};
      for (const item of missing) {
        const fund = item.row?.rawFund || item.row;
        const actualZzl = isNumber(fund?.zzl) && Number.isFinite(fund.zzl) ? fund.zzl : null;
        if (!item.code || !fund?.jzrq || actualZzl == null) {
          // 参数不完整，直接标记为 null
          cacheRef.current.set(item.key, null);
          continue;
        }
        batchItems.push({ code: item.code, jzrq: fund.jzrq, actualZzl });
        missingByKey[item.key] = item;
      }

      // 5. 一次性批量调用 Edge Function（替代原先 N 次单独调用）
      const batchResults = batchItems.length > 0 ? await fetchBestValuationSourceBatch(batchItems) : {};

      if (cancelled) return;

      // 6. 根据批量结果计算每个基金的标签
      const nextBatch = {};
      await asyncPool(5, missing, async (item) => {
        const fund = item.row?.rawFund || item.row;
        const bestResult = batchResults[item.code] ?? null;
        const label = await resolveAccuracyLabel(item.row, todayStr, bestResult).catch(() => null);
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
  }, [enabled, isVip, rows, rowsKey, todayStr]);

  return labelsByCode;
}
