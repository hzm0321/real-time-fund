'use client';

import { useEffect, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { PinIcon, PinOffIcon, EyeIcon, EyeOffIcon, SwitchIcon } from './Icons';

// 数字滚动组件（初始化时无动画，后续变更再动画）
function CountUp({ value, prefix = '', suffix = '', decimals = 2, className = '', style = {} }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const isFirstChange = useRef(true);

  useEffect(() => {
    if (previousValue.current === value) return;

    if (isFirstChange.current) {
      isFirstChange.current = false;
      previousValue.current = value;
      setDisplayValue(value);
      return;
    }

    const start = previousValue.current;
    const end = value;
    const duration = 400;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      const current = start + (end - start) * ease;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span className={className} style={style}>
      {prefix}
      {Math.abs(displayValue).toFixed(decimals)}
      {suffix}
    </span>
  );
}

export default function GroupSummary({
  funds,
  holdings,
  groupName,
  getProfit,
  stickyTop,
  masked,
  onToggleMasked,
}) {
  const [showPercent, setShowPercent] = useState(true);
  const [isMasked, setIsMasked] = useState(masked ?? false);
  const [isSticky, setIsSticky] = useState(false);
  const rowRef = useRef(null);
  const [assetSize, setAssetSize] = useState(24);
  const [metricSize, setMetricSize] = useState(18);
  const [winW, setWinW] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWinW(window.innerWidth);
      const onR = () => setWinW(window.innerWidth);
      window.addEventListener('resize', onR);
      return () => window.removeEventListener('resize', onR);
    }
  }, []);

  // 根据窗口宽度设置基础字号，保证小屏数字不会撑破布局
  useEffect(() => {
    if (!winW) return;

    if (winW <= 360) {
      setAssetSize(18);
      setMetricSize(14);
    } else if (winW <= 414) {
      setAssetSize(22);
      setMetricSize(16);
    } else if (winW <= 768) {
      setAssetSize(24);
      setMetricSize(18);
    } else {
      setAssetSize(26);
      setMetricSize(20);
    }
  }, [winW]);

  useEffect(() => {
    if (typeof masked === 'boolean') {
      setIsMasked(masked);
    }
  }, [masked]);

  const summary = useMemo(() => {
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
        totalAsset += profit.amount;
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

    return {
      totalAsset,
      totalProfitToday: roundedTotalProfitToday,
      totalHoldingReturn,
      hasHolding,
      returnRate,
      hasAnyTodayData,
    };
  }, [funds, holdings, getProfit]);

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
    winW,
    summary.totalAsset,
    summary.totalProfitToday,
    summary.totalHoldingReturn,
    summary.returnRate,
    showPercent,
    assetSize,
    metricSize,
  ]);

  if (!summary.hasHolding) return null;

  return (
    <div
      className={isSticky ? 'group-summary-sticky' : ''}
      style={isSticky && stickyTop ? { top: stickyTop } : {}}
    >
      <div
        className="glass card group-summary-card"
        style={{
          marginBottom: 8,
          padding: '16px 20px',
          background: 'rgba(255, 255, 255, 0.03)',
          position: 'relative',
        }}
      >
        <span
          className="sticky-toggle-btn"
          onClick={() => setIsSticky(!isSticky)}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 24,
            height: 24,
            padding: 4,
            opacity: 0.6,
            zIndex: 10,
            color: 'var(--muted)',
          }}
        >
          {isSticky ? (
            <PinIcon width="14" height="14" />
          ) : (
            <PinOffIcon width="14" height="14" />
          )}
        </span>
        <div
          ref={rowRef}
          className="row"
          style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}
            >
              <div className="muted" style={{ fontSize: '12px' }}>
                {groupName}
              </div>
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
                }}
              >
                {isMasked ? (
                  <EyeOffIcon width="16" height="16" />
                ) : (
                  <EyeIcon width="16" height="16" />
                )}
              </button>
            </div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span style={{ fontSize: '16px', marginRight: 2 }}>¥</span>
              {isMasked ? (
                <span
                  className="mask-text"
                  style={{ fontSize: assetSize, position: 'relative', top: 4 }}
                >
                  ******
                </span>
              ) : (
                <CountUp value={summary.totalAsset} style={{ fontSize: assetSize }} />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ textAlign: 'right' }}>
              <div
                className="muted"
                style={{ fontSize: '12px', marginBottom: 4 }}
              >
                当日收益
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
                }}
              >
                {isMasked ? (
                  <span className="mask-text" style={{ fontSize: metricSize }}>
                    ******
                  </span>
                ) : summary.hasAnyTodayData ? (
                  <>
                    <span style={{ marginRight: 1 }}>
                      {summary.totalProfitToday > 0
                        ? '+'
                        : summary.totalProfitToday < 0
                          ? '-'
                          : ''}
                    </span>
                    <CountUp
                      value={Math.abs(summary.totalProfitToday)}
                      style={{ fontSize: metricSize }}
                    />
                  </>
                ) : (
                  <span style={{ fontSize: metricSize }}>--</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                className="muted"
                style={{
                  fontSize: '12px',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                持有收益{showPercent ? '(%)' : ''}{' '}
                <SwitchIcon style={{ opacity: 0.4 }} />
              </div>
              <div
                className={
                  summary.totalHoldingReturn > 0
                    ? 'up'
                    : summary.totalHoldingReturn < 0
                      ? 'down'
                      : ''
                }
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
                onClick={() => setShowPercent(!showPercent)}
                title="点击切换金额/百分比"
              >
                {isMasked ? (
                  <span className="mask-text" style={{ fontSize: metricSize }}>
                    ******
                  </span>
                ) : (
                  <>
                    <span style={{ marginRight: 1 }}>
                      {summary.totalHoldingReturn > 0
                        ? '+'
                        : summary.totalHoldingReturn < 0
                          ? '-'
                          : ''}
                    </span>
                    {showPercent ? (
                      <CountUp
                        value={Math.abs(summary.returnRate)}
                        suffix="%"
                        style={{ fontSize: metricSize }}
                      />
                    ) : (
                      <CountUp
                        value={Math.abs(summary.totalHoldingReturn)}
                        style={{ fontSize: metricSize }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
