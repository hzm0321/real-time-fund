'use client';
import { isNumber } from 'lodash';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { fetchFundValuationBySource, fetchBestValuationSource, fetchFundBestSource, isQdiiFund } from '@/app/api/fund';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useStorageStore, useUserStore } from '@/app/stores';
import DataSourceAccuracyBadge from './DataSourceAccuracyBadge';

function formatGszzlEstimate(gszzl) {
  const n = isNumber(gszzl) ? gszzl : Number(gszzl);
  if (!Number.isFinite(n)) return '--';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export default function FundDataSourceSelector({ fund, onClose, onSelect }) {
  const isAdded = useStorageStore((s) => s.funds?.some((item) => item.code === fund?.code));
  const user = useUserStore((s) => s.user);
  const [sourceId, setSourceId] = useState('1');
  const [loading, setLoading] = useState(true);
  const [estimates, setEstimates] = useState({
    1: null,
    2: null,
    3: null,
    4: null
  });
  const [valuationSources, setValuationSources] = useState({
    1: null,
    2: null,
    3: null,
    4: null
  });
  const [bestSource, setBestSource] = useState(null);
  const [isYesterdayAccuracy, setIsYesterdayAccuracy] = useState(false);
  const [isTodayAccuracy, setIsTodayAccuracy] = useState(false);
  const [accuracyDiffs, setAccuracyDiffs] = useState({});

  // 是否为 QDII 基金（决定是否展示数据源 4）
  const [isQdii, setIsQdii] = useState(false);

  // 自动数据源状态
  const [autoSource, setAutoSource] = useState(!!fund?.autoSource);
  const [autoLoading, setAutoLoading] = useState(false);

  // 调用 RPC 获取最佳数据源
  const fetchAndApplyBestSource = useCallback(async (fundCode) => {
    if (!fundCode) return;
    setAutoLoading(true);
    try {
      const bestId = await fetchFundBestSource(fundCode);
      if (bestId != null) {
        setSourceId(String(bestId));
      } else {
        sonnerToast.warning('未找到最佳数据源，已自动关闭');
        setAutoSource(false);
      }
    } catch {
      sonnerToast.warning('获取最佳数据源失败，已自动关闭');
      setAutoSource(false);
    } finally {
      setAutoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fund?.dataSource) {
      setSourceId(String(fund.dataSource));
    }

    if (!fund?.code) {
      setEstimates({ 1: '--', 2: '--', 3: '--', 4: '--' });
      setLoading(false);
      setBestSource(null);
      setIsYesterdayAccuracy(false);
      setIsTodayAccuracy(false);
      setAccuracyDiffs({});
      setIsQdii(false);
      return undefined;
    }

    let isMounted = true;
    setLoading(true);
    setBestSource(null);
    setIsYesterdayAccuracy(false);
    setIsTodayAccuracy(false);
    setAccuracyDiffs({});
    setIsQdii(false);

    // 只要有实际涨跌幅，就尝试进行比对
    const actualZzl = isNumber(fund.zzl) && Number.isFinite(fund.zzl) ? fund.zzl : null;

    // 先检查是否为 QDII 基金，再并行获取估值
    isQdiiFund(fund.code).then((qdii) => {
      if (!isMounted) return;
      setIsQdii(qdii);

      // 并行获取实时估算值（用于展示）和历史最准数据源（用于标签判断）
      const estimatePromises = [
        fetchFundValuationBySource(fund.code, 1).catch(() => null),
        fetchFundValuationBySource(fund.code, 2).catch(() => null),
        fetchFundValuationBySource(fund.code, 3).catch(() => null)
      ];
      // 仅 QDII 基金获取数据源 4
      if (qdii) {
        estimatePromises.push(fetchFundValuationBySource(fund.code, 4).catch(() => null));
      }

      const bestSourcePromise =
        actualZzl != null && fund.jzrq
          ? fetchBestValuationSource(fund.code, fund.jzrq, actualZzl).catch(() => null)
          : Promise.resolve(null);

      Promise.all([Promise.all(estimatePromises), bestSourcePromise]).then(([estResults, bestResult]) => {
        if (!isMounted) return;
        const [v1, v2, v3, v4] = estResults;
        const e1 = formatGszzlEstimate(v1?.gszzl);
        const e2 = formatGszzlEstimate(v2?.gszzl);
        const e3 = formatGszzlEstimate(v3?.gszzl);
        const e4 = qdii ? formatGszzlEstimate(v4?.gszzl) : null;
        setEstimates({ 1: e1, 2: e2, 3: e3, 4: e4 });
        setValuationSources({
          1: v1?.valuationSource,
          2: v2?.valuationSource,
          3: v3?.valuationSource,
          4: v4?.valuationSource
        });

        if (bestResult) {
          setBestSource(bestResult.bestSource);

          // 判断今日净值是否已公布：jzrq 为今天时，用实时估值数据计算预测误差
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const isTodayNav = fund.jzrq === todayStr && actualZzl != null;

          if (isTodayNav) {
            // 今日净值已公布 —— 用实时估值计算误差，保证与用户看到的估值一致
            const rtDiffs = {};
            [v1, v2, v3].forEach((v, i) => {
              if (v?.gszzl != null && Number.isFinite(Number(v.gszzl))) {
                rtDiffs[String(i + 1)] = Math.abs(Number(v.gszzl) - actualZzl);
              }
            });
            // QDII 数据源也参与误差计算
            if (v4?.gszzl != null && Number.isFinite(Number(v4.gszzl))) {
              rtDiffs['4'] = Math.abs(Number(v4.gszzl) - actualZzl);
            }
            if (Object.keys(rtDiffs).length > 0) {
              // 从实时误差中找出误差最小的数据源
              let minDiff = Infinity;
              let bestSrc = null;
              for (const [src, d] of Object.entries(rtDiffs)) {
                if (d < minDiff) {
                  minDiff = d;
                  bestSrc = Number(src);
                }
              }
              setBestSource(bestSrc);
              setIsYesterdayAccuracy(false);
              setIsTodayAccuracy(true);
              setAccuracyDiffs(rtDiffs);
            } else {
              // 实时估值不可用，回退到边缘函数结果
              setIsYesterdayAccuracy(bestResult.isYesterdayAccuracy);
              setIsTodayAccuracy(bestResult.isTodayAccuracy || false);
              if (bestResult.diffs) {
                setAccuracyDiffs(bestResult.diffs);
              }
            }
          } else {
            // 净值未更新（交易时段等），使用边缘函数的历史比对结果
            setIsYesterdayAccuracy(bestResult.isYesterdayAccuracy);
            setIsTodayAccuracy(bestResult.isTodayAccuracy || false);
            if (bestResult.diffs) {
              setAccuracyDiffs(bestResult.diffs);
            } else if (bestResult.diff != null && bestResult.bestSource != null) {
              // Fallback for older edge function responses
              setAccuracyDiffs({ [bestResult.bestSource]: bestResult.diff });
            }
          }
        }

        setLoading(false);
      });
    });

    // 如果已开启 autoSource，打开弹框时自动调用 RPC
    if (fund.autoSource) {
      fetchAndApplyBestSource(fund.code);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // 自动开关切换处理
  const handleAutoToggle = useCallback(
    (checked) => {
      setAutoSource(checked);
      if (checked && fund?.code) {
        fetchAndApplyBestSource(fund.code);
      }
    },
    [fund?.code, fetchAndApplyBestSource]
  );

  const handleConfirm = () => {
    onSelect(parseInt(sourceId, 10), autoSource);
    onClose();
  };

  // 是否禁用手动选择（自动模式开启时）
  const isManualDisabled = autoSource;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        style={{ maxWidth: '400px', zIndex: 999, width: '90vw', padding: '24px' }}
      >
        <DialogTitle className="sr-only">切换数据源</DialogTitle>
        <div className="title" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ fontSize: '18px', fontWeight: 600, flexShrink: 0 }}>切换数据源</span>
            {isAdded && user && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: autoSource ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'var(--secondary)',
                  padding: '4px 8px 4px 12px',
                  borderRadius: '99px',
                  border: `1px solid ${autoSource ? 'color-mix(in srgb, var(--primary) 20%, transparent)' : 'var(--border)'}`,
                  transition: 'all 0.2s ease'
                }}
              >
                <Label
                  htmlFor="auto-source-switch"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    color: autoSource ? 'var(--primary)' : 'var(--muted)',
                    fontWeight: 500,
                    userSelect: 'none',
                    margin: 0
                  }}
                >
                  {autoLoading ? <Loader2 className="animate-spin" size={14} /> : <span>自动</span>}
                </Label>
                <Switch id="auto-source-switch" size="sm" checked={autoSource} onCheckedChange={handleAutoToggle} />
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 0',
                color: 'var(--muted)'
              }}
            >
              <Loader2 className="animate-spin mb-4" size={24} />
              <span style={{ fontSize: '14px' }}>正在获取估算数据...</span>
            </div>
          ) : (
            <RadioGroup
              value={sourceId}
              onValueChange={(v) => {
                if (!isManualDisabled) setSourceId(v);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                opacity: isManualDisabled ? 0.75 : 1,
                pointerEvents: isManualDisabled ? 'none' : 'auto',
                transition: 'opacity 0.2s ease'
              }}
            >
              {[
                { id: '1', name: '数据源 1', est: estimates[1] },
                { id: '2', name: '数据源 2', est: estimates[2] },
                { id: '3', name: '数据源 3', est: estimates[3] },
                ...(isQdii ? [{ id: '4', name: '数据源 4', est: estimates[4] }] : [])
              ].map((item) => {
                const isSelected = sourceId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!isManualDisabled) setSourceId(item.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      borderRadius: '12px',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected
                        ? 'color-mix(in srgb, var(--primary) 8%, var(--card))'
                        : 'var(--secondary)',
                      cursor: isManualDisabled ? 'not-allowed' : 'pointer',
                      width: '100%',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', width: '100%' }}>
                      <RadioGroupItem value={item.id} id={`source-${item.id}`} style={{ marginTop: '4px' }} />
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          width: '100%'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <Label
                              htmlFor={`source-${item.id}`}
                              style={{
                                fontSize: '15px',
                                cursor: isManualDisabled ? 'not-allowed' : 'pointer',
                                fontWeight: 500
                              }}
                            >
                              {item.name}
                            </Label>
                            {bestSource === Number(item.id) && (isYesterdayAccuracy || isTodayAccuracy) && (
                              <DataSourceAccuracyBadge label={isTodayAccuracy ? '今日最准' : '昨日最准'} />
                            )}
                            {item.id === '4' && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-[18px] min-h-0 leading-none font-medium"
                                style={{
                                  borderColor: 'rgba(249, 115, 22, 0.5)',
                                  color: '#f97316',
                                  background: 'rgba(249, 115, 22, 0.1)'
                                }}
                              >
                                限免
                              </Badge>
                            )}
                          </div>
                          {accuracyDiffs[item.id] != null && (
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--muted)',
                                lineHeight: 1,
                                background: 'color-mix(in srgb, var(--muted) 12%, transparent)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                width: 'fit-content'
                              }}
                            >
                              {isTodayAccuracy ? '今日预测误差' : '昨日预测误差'}: {accuracyDiffs[item.id].toFixed(2)}%
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: '6px',
                            flexShrink: 0
                          }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              color: 'var(--muted)',
                              lineHeight: 1,
                              background: 'color-mix(in srgb, var(--muted) 12%, transparent)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            当前预测
                          </span>
                          <span
                            className={
                              item.est === '--'
                                ? 'muted'
                                : item.est.startsWith('+')
                                  ? 'up'
                                  : item.est.startsWith('-')
                                    ? 'down'
                                    : 'muted'
                            }
                            style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              lineHeight: 1
                            }}
                          >
                            {item.est}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        </div>

        <div className="row" style={{ gap: 12 }}>
          <button type="button" className="button secondary" onClick={onClose} style={{ flex: 1 }}>
            取消
          </button>
          <button
            type="button"
            className="button"
            onClick={handleConfirm}
            disabled={loading || autoLoading}
            style={{ flex: 1, opacity: loading || autoLoading ? 0.6 : 1 }}
          >
            确定
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
