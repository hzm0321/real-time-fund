'use client';

import React, { useMemo, useRef, useEffect, forwardRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { Line } from 'react-chartjs-2';
import { isNumber } from 'lodash';
import { SwitchIcon } from './Icons';
import { useQuery } from '@tanstack/react-query';
import { ocrFundChart } from '@/app/lib/query-keys';
import { useStorageStore } from '../stores';
import { useIsMobile } from '../hooks/useIsMobile';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const CHART_COLORS = {
  dark: {
    danger: '#f87171',
    success: '#34d399',
    primary: '#22d3ee',
    muted: '#9ca3af',
    border: '#1f2937',
    text: '#e5e7eb',
    crosshairText: '#0f172a'
  },
  light: {
    danger: '#dc2626',
    success: '#059669',
    primary: '#0891b2',
    muted: '#475569',
    border: '#e2e8f0',
    text: '#0f172a',
    crosshairText: '#ffffff'
  }
};

function getChartThemeColors(theme) {
  return CHART_COLORS[theme] || CHART_COLORS.dark;
}

/**
 * 分时图：展示当日（或最近一次记录日）的估值序列，纵轴为相对参考净值的涨跌幅百分比。
 * series: Array<{ time: string, value: number, date?: string }>
 * referenceNav: 参考净值（最新单位净值），用于计算涨跌幅；未传则用当日第一个估值作为参考。
 * theme: 'light' | 'dark'，用于亮色主题下坐标轴与 crosshair 样式
 */
// 空的 forwardRef 包装器，用于故意丢弃 ref，使得 react-photo-view 找不到原图位置，从而触发默认的“中心放大”动画效果
const CenterOrigin = forwardRef(({ children, ...props }, ref) => {
  return (
    <div {...props} style={{ width: '100%', height: '100%' }}>
      {children}
    </div>
  );
});
CenterOrigin.displayName = 'CenterOrigin';

export default function FundIntradayChart({
  series = [],
  referenceNav,
  theme = 'dark',
  fundCode,
  valuationSource,
  gztime,
  todayStr
}) {
  const isMobile = useIsMobile();
  const chartRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const chartColors = useMemo(() => getChartThemeColors(theme), [theme]);
  const funds = useStorageStore((s) => s.funds);
  const setFunds = useStorageStore((s) => s.setFunds);

  const currentFund = useMemo(() => funds?.find((f) => f.code === fundCode), [funds, fundCode]);
  const showImageChartPreference = !!currentFund?.showImageChart;

  const isFundgzToday = valuationSource === 'fundgz' && gztime && todayStr && gztime.includes(todayStr);

  const { data: ocrVerified = false } = useQuery({
    queryKey: ocrFundChart(fundCode, todayStr),
    queryFn: async () => {
      if (!isFundgzToday) return false;
      try {
        const { getOcrWorker } = await import('@/app/lib/ocr');
        const worker = await getOcrWorker('chi_sim+eng');
        const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(`j4.dfcfw.com/charts/pic6/${fundCode}.png?v=${Date.now()}`)}`;
        const res = await worker.recognize(proxyUrl);

        const text = res?.data?.text || '';
        const parts = todayStr.split('-');
        if (parts.length === 3) {
          const shortDate1 = `${parts[1]}-${parts[2]}`;
          const shortDate2 = `${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}`;
          if (text.includes(todayStr) || text.includes(shortDate1) || text.includes(shortDate2)) {
            return true;
          }
        }
        return false;
      } catch (e) {
        console.error('OCR check error:', e);
        return false;
      }
    },
    enabled: !!isFundgzToday,
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000
  });

  const actuallyShowImageChart = showImageChartPreference && isFundgzToday && ocrVerified;

  const chartData = useMemo(() => {
    if (!series.length) return { labels: [], datasets: [] };
    const labels = series.map((d) => d.time);
    const values = series.map((d) => d.value);
    const ref = referenceNav != null && Number.isFinite(Number(referenceNav)) ? Number(referenceNav) : values[0];
    const percentages = values.map((v) => (ref ? ((v - ref) / ref) * 100 : 0));
    const lastPct = percentages[percentages.length - 1];
    const riseColor = chartColors.danger;
    const fallColor = chartColors.success;
    const lineColor = lastPct != null && lastPct >= 0 ? riseColor : fallColor;

    return {
      labels,
      datasets: [
        {
          type: 'line',
          label: '涨跌幅',
          data: percentages,
          borderColor: lineColor,
          backgroundColor: (ctx) => {
            if (!ctx.chart.ctx) return lineColor + '33';
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 120);
            gradient.addColorStop(0, lineColor + '33');
            gradient.addColorStop(1, lineColor + '00');
            return gradient;
          },
          borderWidth: 2,
          pointRadius: series.length <= 2 ? 3 : 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.2
        }
      ]
    };
  }, [series, referenceNav, chartColors.danger, chartColors.success]);

  const options = useMemo(() => {
    const colors = getChartThemeColors(theme);
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          mode: 'index',
          intersect: false,
          external: () => {}
        }
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            color: colors.muted,
            font: { size: 10 },
            maxTicksLimit: 6
          }
        },
        y: {
          display: true,
          position: 'left',
          grid: { color: colors.border, drawBorder: false },
          ticks: {
            color: colors.muted,
            font: { size: 10 },
            callback: (v) => (isNumber(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : v)
          }
        }
      },
      onHover: (event, chartElement, chart) => {
        const target = event?.native?.target;
        const currentChart = chart || chartRef.current;
        if (!currentChart) return;

        const tooltipActive = currentChart.tooltip?._active ?? [];
        const activeElements = currentChart.getActiveElements ? currentChart.getActiveElements() : [];
        const hasActive =
          (chartElement && chartElement.length > 0) ||
          (tooltipActive && tooltipActive.length > 0) ||
          (activeElements && activeElements.length > 0);

        if (target) {
          target.style.cursor = hasActive ? 'crosshair' : 'default';
        }

        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }

        if (hasActive) {
          hoverTimeoutRef.current = setTimeout(() => {
            const c = chartRef.current;
            if (!c || !c.canvas) return;
            try {
              c.setActiveElements([]);
              if (c.tooltip) {
                c.tooltip.setActiveElements([], { x: 0, y: 0 });
              }
              c.update();
              if (target && target.style) {
                target.style.cursor = 'default';
              }
            } catch (e) {
              console.warn('Failed to update chart after hover timeout', e);
            }
          }, 2000);
        }
      }
    };
  }, [theme]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const plugins = useMemo(() => {
    const colors = getChartThemeColors(theme);
    return [
      {
        id: 'crosshair',
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          const activeElements = chart.tooltip?._active?.length ? chart.tooltip._active : chart.getActiveElements();
          if (!activeElements?.length) return;

          const activePoint = activeElements[0];
          const x = activePoint.element.x;
          const y = activePoint.element.y;
          const topY = chart.scales.y.top;
          const bottomY = chart.scales.y.bottom;
          const leftX = chart.scales.x.left;
          const rightX = chart.scales.x.right;
          const index = activePoint.index;
          const labels = chart.data.labels;
          const data = chart.data.datasets[0]?.data;

          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = colors.muted;
          ctx.moveTo(x, topY);
          ctx.lineTo(x, bottomY);
          ctx.moveTo(leftX, y);
          ctx.lineTo(rightX, y);
          ctx.stroke();

          const prim = colors.primary;
          const textCol = colors.crosshairText;

          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (labels && index in labels) {
            const timeStr = String(labels[index]);
            const tw = ctx.measureText(timeStr).width + 8;
            const chartLeft = chart.scales.x.left;
            const chartRight = chart.scales.x.right;
            let labelLeft = x - tw / 2;
            if (labelLeft < chartLeft) labelLeft = chartLeft;
            if (labelLeft + tw > chartRight) labelLeft = chartRight - tw;
            const labelCenterX = labelLeft + tw / 2;
            ctx.fillStyle = prim;
            ctx.fillRect(labelLeft, bottomY, tw, 16);
            ctx.fillStyle = textCol;
            ctx.fillText(timeStr, labelCenterX, bottomY + 8);
          }
          if (data && index in data) {
            const val = data[index];
            const valueStr = isNumber(val) ? `${val >= 0 ? '+' : ''}${val.toFixed(2)}%` : String(val);
            const vw = ctx.measureText(valueStr).width + 8;
            ctx.fillStyle = prim;
            ctx.fillRect(leftX, y - 8, vw, 16);
            ctx.fillStyle = textCol;
            ctx.fillText(valueStr, leftX + vw / 2, y);
          }
          ctx.restore();
        }
      }
    ];
  }, [theme]);

  if (series.length < 1) return null;

  const displayDate = series[0]?.date || series[series.length - 1]?.date;

  return (
    <div style={{ marginTop: 12, marginBottom: 4 }}>
      <div
        className="muted"
        style={{
          fontSize: 11,
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          实时估值分时
          {isFundgzToday && ocrVerified && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFunds((prev) =>
                  prev.map((f) => (f.code === fundCode ? { ...f, showImageChart: !showImageChartPreference } : f))
                );
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: chartColors.primary,
                padding: '2px 6px',
                fontSize: 10,
                cursor: 'pointer',
                marginLeft: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <SwitchIcon width="12" height="12" /> {showImageChartPreference ? '本地估值分时图' : '净值估算图'}
            </button>
          )}
        </span>
        {displayDate && <span style={{ fontSize: 11 }}>估值日期 {displayDate}</span>}
      </div>
      <div
        style={{
          position: 'relative',
          height: actuallyShowImageChart ? (isMobile ? 200 : 300) : 100,
          width: '100%',
          touchAction: 'pan-y',
          transition: 'height 0.2s ease-in-out'
        }}
      >
        {actuallyShowImageChart ? (
          <PhotoProvider
            onVisibleChange={(visible) => {
              if (visible) {
                document.body.setAttribute('data-photo-viewer-open', 'true');
              } else {
                setTimeout(() => {
                  document.body.removeAttribute('data-photo-viewer-open');
                }, 300);
              }
            }}
            overlayRender={() => (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'env(safe-area-inset-bottom, 24px)',
                  left: 0,
                  width: '100%',
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 14,
                  pointerEvents: 'none',
                  zIndex: 2000,
                  paddingBottom: 24
                }}
              >
                点击非图片区域退出图片查看器
              </div>
            )}
          >
            <PhotoView
              src={
                isMobile
                  ? `https://j4.dfcfw.com/charts/pic6/${fundCode}.png${gztime ? '?v=' + encodeURIComponent(gztime) : ''}`
                  : undefined
              }
              width={isMobile ? undefined : 817}
              height={isMobile ? undefined : 450}
              render={
                !isMobile
                  ? ({ attrs }) => {
                      return (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          {...attrs}
                          src={`https://j4.dfcfw.com/charts/pic6/${fundCode}.png${gztime ? '?v=' + encodeURIComponent(gztime) : ''}`}
                          alt="净值估算图"
                          style={{
                            ...attrs.style,
                            width: '817px',
                            height: '450px',
                            objectFit: 'contain'
                          }}
                        />
                      );
                    }
                  : undefined
              }
            >
              <CenterOrigin>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://j4.dfcfw.com/charts/pic6/${fundCode}.png${gztime ? '?v=' + encodeURIComponent(gztime) : ''}`}
                  alt="净值估算图"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </CenterOrigin>
            </PhotoView>
          </PhotoProvider>
        ) : (
          <Line ref={chartRef} data={chartData} options={options} plugins={plugins} />
        )}
      </div>
    </div>
  );
}
