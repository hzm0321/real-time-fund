'use client';

import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import { PinIcon, PinOffIcon, EyeIcon, EyeOffIcon, SwitchIcon } from './Icons';
import FitText from './FitText';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

import { SUMMARY_TAB_ID } from '@/app/constants';

// 数字滚动组件（初始化时无动画，后续变更再动画）
function CountUp({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  className = '',
  style = {},
  maxFontSize,
  minFontSize,
  as = 'span'
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const isFirstChange = useRef(true);
  const rafIdRef = useRef(null);
  const displayValueRef = useRef(value);

  useEffect(() => {
    if (previousValue.current === value) return;

    if (isFirstChange.current) {
      isFirstChange.current = false;
      previousValue.current = value;
      displayValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const start = displayValueRef.current;
    const end = value;
    const duration = 300;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      const current = start + (end - start) * ease;
      displayValueRef.current = current;
      setDisplayValue(current);

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [value]);

  const text = `${prefix}${Math.abs(displayValue).toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  const styleFontSize = typeof style.fontSize === 'number' ? style.fontSize : parseFloat(style.fontSize);
  const resolvedMaxFontSize = maxFontSize ?? (Number.isFinite(styleFontSize) ? styleFontSize : undefined);

  return (
    <FitText as={as} className={className} style={style} maxFontSize={resolvedMaxFontSize} minFontSize={minFontSize}>
      {text}
    </FitText>
  );
}

export default function GroupSummary({
  funds,
  holdings,
  /** 当前首页分组 Tab：用于标题文案，避免仅依赖父级传入的 groupName 时偶发不同步 */
  portfolioTabId,
  groups = [],
  getProfit,
  /** 与内部 summary 同结构；传入时顶部汇总数字以此为准（如汇总 Tab 下全局+分组双账本合计） */
  summaryTotalsOverride = null,
  stickyTop,
  isSticky = false,
  onToggleSticky,
  masked,
  onToggleMasked,
  shouldShowMarketIndex,
  navbarHeight
}) {
  const isMobile = useIsMobile();
  const [showPercent, setShowPercent] = useState(true);
  const [showTodayPercent, setShowTodayPercent] = useState(false);
  const [isMasked, setIsMasked] = useState(masked ?? false);
  const [isAssetMasked, setIsAssetMasked] = useState(false);
  const rowRef = useRef(null);
  const [assetSize, setAssetSize] = useState(26);
  const [metricSize, setMetricSize] = useState(20);

  useEffect(() => {
    if (typeof masked === 'boolean') {
      setIsMasked(masked);
    }
  }, [masked]);

  const portfolioScopeLabel = useMemo(() => {
    const tab = portfolioTabId;
    if (tab === 'all') return '全部资产';
    if (tab === 'fav') return '自选资产';
    if (tab === SUMMARY_TAB_ID) return '汇总资产';
    const group = (groups || []).find((g) => g.id === tab);
    return group ? `${group.name}资产` : '分组资产';
  }, [portfolioTabId, groups]);

  const derivedSummary = useMemo(() => {
    let totalAsset = 0;
    let totalProfitToday = 0;
    let totalHoldingReturn = 0;
    let totalCost = 0;
    let hasHolding = false;
    let hasAnyTodayData = false;

    funds.forEach((fund) => {
      const holding = holdings[fund.code];
      const profit = getProfit(fund, holding);

      if (profit) {
        hasHolding = true;
        totalAsset += Math.round(profit.amount * 100) / 100;
        if (profit.profitToday != null) {
          // 先累加原始当日收益，最后统一做一次四舍五入，避免逐笔四舍五入造成的总计误差
          totalProfitToday += profit.profitToday;
          hasAnyTodayData = true;
        }
        if (profit.profitTotal !== null) {
          totalHoldingReturn += profit.profitTotal;
          if (holding && typeof holding.cost === 'number' && typeof holding.share === 'number') {
            totalCost += holding.cost * holding.share;
          }
        }
      }
    });

    // 将当日收益总和四舍五入到两位小数，和卡片展示保持一致
    const roundedTotalProfitToday = Math.round(totalProfitToday * 100) / 100;

    const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;
    const todayReturnRate = totalCost > 0 ? (roundedTotalProfitToday / totalCost) * 100 : 0;

    return {
      totalAsset,
      totalProfitToday: roundedTotalProfitToday,
      totalHoldingReturn,
      hasHolding,
      returnRate,
      todayReturnRate,
      hasAnyTodayData
    };
  }, [funds, holdings, getProfit]);

  const summary =
    summaryTotalsOverride != null && typeof summaryTotalsOverride === 'object'
      ? {
          totalAsset: summaryTotalsOverride.totalAsset,
          totalProfitToday: summaryTotalsOverride.totalProfitToday,
          totalHoldingReturn: summaryTotalsOverride.totalHoldingReturn,
          hasHolding: summaryTotalsOverride.hasHolding,
          returnRate: summaryTotalsOverride.returnRate,
          todayReturnRate: summaryTotalsOverride.todayReturnRate,
          hasAnyTodayData: summaryTotalsOverride.hasAnyTodayData
        }
      : derivedSummary;

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const height = el.clientHeight;
    const tooTall = height > 80;
    if (tooTall) {
      setAssetSize((s) => Math.max(16, s - 1));
      setMetricSize((s) => Math.max(12, s - 1));
    }
  }, [
    summary.totalAsset,
    summary.totalProfitToday,
    summary.totalHoldingReturn,
    summary.returnRate,
    showPercent,
    assetSize,
    metricSize
  ]);

  const style = useMemo(() => {
    const style = {};
    if (isSticky) {
      style.top = `calc(${stickyTop}px + var(--market-index-height, 0px) + 14px)`;
    } else if (!shouldShowMarketIndex) {
      style.marginTop = navbarHeight;
    }
    return style;
  }, [isSticky, stickyTop, shouldShowMarketIndex, navbarHeight]);

  if (!summary.hasHolding) return null;

  const todayProfitPrefix = summary.totalProfitToday > 0 ? '+' : summary.totalProfitToday < 0 ? '-' : '';
  const holdingReturnPrefix = summary.totalHoldingReturn > 0 ? '+' : summary.totalHoldingReturn < 0 ? '-' : '';

  return (
    <div className={isSticky ? 'group-summary-sticky' : ''} style={style}>
      <div
        className="glass card group-summary-card"
        style={{
          marginBottom: 8,
          padding: '16px 20px',
          background: 'rgba(255, 255, 255, 0.03)',
          position: 'relative'
        }}
      >
        <span
          className="sticky-toggle-btn"
          onClick={() => {
            onToggleSticky?.(!isSticky);
          }}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            padding: 4,
            opacity: 0.6,
            zIndex: 10,
            color: 'var(--muted)'
          }}
        >
          {isSticky ? <PinIcon width="14" height="14" /> : <PinOffIcon width="14" height="14" />}
        </span>
        <div
          ref={rowRef}
          className="row"
          style={{ alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 0 }}
        >
          <div style={{ flex: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div className="muted" style={{ fontSize: '12px' }} key={portfolioTabId}>
                {portfolioScopeLabel}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="fav-button"
                    onClick={() => {
                      if (onToggleMasked) {
                        onToggleMasked();
                      } else {
                        setIsMasked((value) => !value);
                      }
                    }}
                    aria-label={isMasked ? '显示资产' : '隐藏资产'}
                    style={{
                      margin: 0,
                      padding: 2,
                      display: 'inline-flex',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    {isMasked ? <EyeOffIcon width="16" height="16" /> : <EyeIcon width="16" height="16" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isMasked ? '点击显示所有持仓数据' : '点击隐藏所有持仓数据'}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                minWidth: 0,
                cursor: 'pointer'
              }}
              onClick={() => setIsAssetMasked((v) => !v)}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <span style={{ display: 'inline-block' }}>
                    {isMasked || isAssetMasked ? (
                      <span className="mask-text" style={{ fontSize: assetSize, position: 'relative', top: 4 }}>
                        ******
                      </span>
                    ) : (
                      <CountUp value={summary.totalAsset} maxFontSize={assetSize} minFontSize={16} as="div" />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isMasked || isAssetMasked ? '点击显示资产金额' : '点击隐藏资产金额'}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flex: 5, minWidth: 0 }}>
            <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
              <div
                className="muted"
                style={{
                  fontSize: '12px',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 2
                }}
              >
                当日收益{showTodayPercent ? '(%)' : ''} <SwitchIcon style={{ opacity: 0.4 }} />
              </div>
              <div
                className={
                  summary.hasAnyTodayData
                    ? summary.totalProfitToday > 0
                      ? 'up'
                      : summary.totalProfitToday < 0
                        ? 'down'
                        : ''
                    : 'muted'
                }
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: summary.hasAnyTodayData ? 'pointer' : 'default'
                }}
                onClick={() => summary.hasAnyTodayData && setShowTodayPercent(!showTodayPercent)}
              >
                {summary.hasAnyTodayData ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span style={{ display: 'inline-block' }}>
                        {isMasked ? (
                          <span className="mask-text" style={{ fontSize: metricSize }}>
                            ******
                          </span>
                        ) : (
                          <>
                            {showTodayPercent ? (
                              <CountUp
                                value={Math.abs(summary.todayReturnRate)}
                                prefix={todayProfitPrefix}
                                suffix="%"
                                style={{ fontSize: metricSize }}
                              />
                            ) : (
                              <CountUp
                                value={Math.abs(summary.totalProfitToday)}
                                prefix={todayProfitPrefix}
                                maxFontSize={metricSize}
                                minFontSize={12}
                                as="div"
                                style={{ textAlign: 'right' }}
                              />
                            )}
                          </>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>点击切换金额/百分比</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span style={{ display: 'inline-block', fontSize: metricSize }}>--</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', flex: isMobile ? 1 : null, minWidth: 0 }}>
              <div
                className="muted"
                style={{
                  fontSize: '12px',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 2
                }}
              >
                持有收益{showPercent ? '(%)' : ''} <SwitchIcon style={{ opacity: 0.4 }} />
              </div>
              <div
                className={summary.totalHoldingReturn > 0 ? 'up' : summary.totalHoldingReturn < 0 ? 'down' : ''}
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer'
                }}
                onClick={() => setShowPercent(!showPercent)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span style={{ display: 'inline-block' }}>
                      {isMasked ? (
                        <span className="mask-text" style={{ fontSize: metricSize }}>
                          ******
                        </span>
                      ) : (
                        <>
                          {showPercent ? (
                            <CountUp
                              value={Math.abs(summary.returnRate)}
                              prefix={holdingReturnPrefix}
                              suffix="%"
                              style={{ fontSize: metricSize }}
                            />
                          ) : (
                            <CountUp
                              value={Math.abs(summary.totalHoldingReturn)}
                              maxFontSize={metricSize}
                              minFontSize={12}
                              as="div"
                              style={{ textAlign: 'right' }}
                            />
                          )}
                        </>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>点击切换金额/百分比</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
