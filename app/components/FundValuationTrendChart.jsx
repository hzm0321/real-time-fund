'use client';
import { isArray, isNumber } from 'lodash';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFundValuationTrend, fetchFundHistory } from '../api/fund';
import * as qk from '../lib/query-keys';
import { getChartAxisAvoidRects, getChartTooltipPosition } from '../lib/chartTooltipPosition';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronIcon } from './Icons';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { isSupabaseConfigured } from '../lib/supabase';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const TOOLTIP_SIZE = {
  width: 170,
  height: 88
};

const CHART_COLORS = {
  dark: {
    primary: '#22d3ee',
    muted: '#9ca3af',
    border: '#1f2937',
    text: '#e5e7eb',
    crosshairText: '#0f172a',
    danger: '#f87171',
    success: '#34d399',
    lines: ['#22d3ee', '#fb923c', '#a78bfa'],
    grandLine: ['rgba(34,211,238,0.55)', 'rgba(156,163,175,0.55)', 'rgba(251,146,60,0.55)', 'rgba(229,231,235,0.45)']
  },
  light: {
    primary: '#0891b2',
    muted: '#475569',
    border: '#e2e8f0',
    text: '#0f172a',
    crosshairText: '#ffffff',
    danger: '#dc2626',
    success: '#059669',
    lines: ['#0891b2', '#f97316', '#8b5cf6'],
    grandLine: ['rgba(8,145,178,0.5)', 'rgba(71,85,105,0.45)', 'rgba(249,115,22,0.5)', 'rgba(15,23,42,0.35)']
  }
};

function getChartThemeColors(theme) {
  return CHART_COLORS[theme] || CHART_COLORS.dark;
}

const SOURCES = {
  actual: '本基金',
  fundgz: '数据源 1',
  sina_ds2: '数据源 2',
  sina_ds3: '数据源 3',
  supabase_qdii: '数据源 4'
};

export default function FundValuationTrendChart({
  code,
  isExpanded,
  onToggleExpand,
  theme = 'dark',
  hideHeader = false,
  userId
}) {
  const [range, setRange] = useState('3m');
  const chartRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const clearActiveIndexRef = useRef(null);
  const [hiddenSources, setHiddenSources] = useState(() => new Set());
  const [activeIndex, setActiveIndex] = useState(null);
  const [tooltipInfo, setTooltipInfo] = useState(null);

  useEffect(() => {
    clearActiveIndexRef.current = () => {
      setActiveIndex(null);
      setTooltipInfo(null);
    };
  });

  const chartColors = useMemo(() => getChartThemeColors(theme), [theme]);

  const {
    data: historyRaw,
    isPending: loadingValuation,
    isError: isErrorValuation
  } = useQuery({
    queryKey: qk.fundValuationTrend(code, range),
    queryFn: () => fetchFundValuationTrend(code, range),
    enabled: Boolean(code && isExpanded && isSupabaseConfigured && userId),
    staleTime: 10 * 60 * 1000
  });

  const {
    data: actualHistoryRaw,
    isPending: loadingActual,
    isError: isErrorActual
  } = useQuery({
    queryKey: qk.fundHistory(code, range),
    queryFn: () => fetchFundHistory(code, range),
    enabled: Boolean(code && isExpanded),
    staleTime: 10 * 60 * 1000
  });

  const rawData = isArray(historyRaw) ? historyRaw : [];
  const actualData = isArray(actualHistoryRaw) ? actualHistoryRaw : [];

  const loading = loadingValuation || loadingActual;
  const isError = isErrorValuation || isErrorActual;

  const change = useMemo(() => {
    if (!actualData.length) return 0;
    const first = actualData[0].value;
    const last = actualData[actualData.length - 1].value;
    return first ? ((last - first) / first) * 100 : 0;
  }, [actualData]);

  const ranges = [
    { label: '近1月', value: '1m' },
    { label: '近3月', value: '3m' },
    { label: '近6月', value: '6m' },
    { label: '近1年', value: '1y' },
    { label: '近3年', value: '3y' },
    { label: '全部', value: 'all' }
  ];

  const processedData = useMemo(() => {
    if (!rawData.length) return { labels: [], datasets: [] };

    const datesSet = new Set();
    const sourceData = {
      actual: new Map(),
      fundgz: new Map(),
      sina_ds2: new Map(),
      sina_ds3: new Map(),
      supabase_qdii: new Map()
    };

    rawData.forEach((row) => {
      if (!row.gztime || !row.source) return;

      let val = Number(row.gszzl);
      if (!Number.isFinite(val)) return;

      if (row.source.startsWith('sina')) {
        val *= 100;
      }

      datesSet.add(row.gztime);
      if (sourceData[row.source]) {
        sourceData[row.source].set(row.gztime, val);
      }
    });

    actualData.forEach((row) => {
      if (!row.date || row.equityReturn === undefined || row.equityReturn === null) return;

      const val = Number(row.equityReturn);
      if (!Number.isFinite(val)) return;

      sourceData.actual.set(row.date, val);
    });

    const labels = Array.from(datesSet).sort();

    const actualLineColor = change >= 0 ? chartColors.danger : chartColors.success;
    const otherColors = chartColors.grandLine;

    const datasets = Object.keys(SOURCES)
      .filter((sourceKey) => {
        return labels.some((date) => {
          const val = sourceData[sourceKey].get(date);
          return val !== undefined && val !== null;
        });
      })
      .map((sourceKey) => {
        const isHidden = hiddenSources.has(sourceKey);

        let color;
        if (sourceKey === 'actual') {
          color = actualLineColor;
        } else {
          // Map other sources to remaining colors, keeping color consistent
          const otherIndex = Object.keys(SOURCES)
            .filter((k) => k !== 'actual')
            .indexOf(sourceKey);
          color = otherColors[otherIndex % otherColors.length];
        }

        const dataPoints = labels.map((date) => {
          if (isHidden) return null;
          const val = sourceData[sourceKey].get(date);
          return val !== undefined ? val : null;
        });

        // Special handling for 'actual' data which might be missing on the latest date (trading day)
        // We don't want the line to drop to 0. It should just not have a point (handled by returning null above).

        return {
          sourceKey,
          label: SOURCES[sourceKey],
          data: dataPoints,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
          tension: 0.2,
          zIndex: sourceKey === 'actual' ? 10 : 0 // Ensure 'actual' is drawn on top
        };
      });

    return { labels, datasets };
  }, [rawData, actualData, hiddenSources, chartColors, change]);

  const options = useMemo(() => {
    const colors = getChartThemeColors(theme);
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: false,
          mode: 'index',
          intersect: false,
          external: (context) => {
            const { chart, tooltip } = context;
            if (tooltip.opacity === 0) {
              setTooltipInfo(null);
              return;
            }

            const dataPoints = tooltip.dataPoints;
            if (!dataPoints || dataPoints.length === 0) return;

            const actualPt = dataPoints.find((p) => p.dataset.sourceKey === 'actual');
            if (!actualPt || actualPt.raw === null || actualPt.raw === undefined) {
              setTooltipInfo(null);
              return;
            }

            const actualVal = actualPt.raw;
            let closestSource = null;
            let minAbsDiff = Infinity;
            let closestVal = null;
            let signedDiff = 0;

            dataPoints.forEach((p) => {
              if (p.dataset.sourceKey !== 'actual' && p.raw !== null && p.raw !== undefined) {
                const absDiff = Math.abs(p.raw - actualVal);
                if (absDiff < minAbsDiff) {
                  minAbsDiff = absDiff;
                  signedDiff = p.raw - actualVal;
                  closestSource = p.dataset;
                  closestVal = p.raw;
                }
              }
            });

            if (closestSource) {
              const x = actualPt.element.x;
              const y = actualPt.element.y;
              const dateStr = chart.data.labels?.[actualPt.dataIndex];
              const yLabel = `${isNumber(actualVal) ? actualVal.toFixed(2) : actualVal}%`;
              const position = getChartTooltipPosition({
                anchorX: x,
                anchorY: y,
                tooltipWidth: TOOLTIP_SIZE.width,
                tooltipHeight: TOOLTIP_SIZE.height,
                chartWidth: chart.width,
                chartHeight: chart.height,
                chartArea: chart.chartArea,
                avoidRects: getChartAxisAvoidRects({
                  chart,
                  anchorX: x,
                  anchorY: y,
                  xLabel: dateStr,
                  yLabel
                })
              });

              if (!position) {
                setTooltipInfo(null);
                return;
              }

              setTooltipInfo({
                x: position.left,
                y: position.top,
                actualValue: actualVal,
                actualColor: actualPt.dataset.borderColor,
                closestLabel: closestSource.label,
                closestColor: closestSource.borderColor,
                closestValue: closestVal,
                diff: signedDiff
              });
            } else {
              setTooltipInfo(null);
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false,
            drawBorder: false
          },
          ticks: {
            color: colors.muted,
            font: { size: 10 },
            maxTicksLimit: 4,
            maxRotation: 0
          },
          border: { display: false }
        },
        y: {
          display: true,
          position: 'left',
          grid: {
            color: colors.border,
            drawBorder: false,
            tickLength: 0
          },
          ticks: {
            color: colors.muted,
            font: { size: 10 },
            count: 5,
            callback: (value) => `${value.toFixed(2)}%`
          },
          border: { display: false }
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
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

        if (isArray(chartElement) && chartElement.length > 0) {
          const idx = chartElement[0].index;
          setActiveIndex(isNumber(idx) ? idx : null);
        } else {
          setActiveIndex(null);
        }
      },
      onClick: (_event, elements) => {
        if (isArray(elements) && elements.length > 0) {
          const idx = elements[0].index;
          setActiveIndex(isNumber(idx) ? idx : null);
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
        afterEvent: (chart, args) => {
          const { event, replay } = args || {};
          if (!event || replay) return;

          const type = event.type;
          if (type === 'mousemove' || type === 'click') {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }

            hoverTimeoutRef.current = setTimeout(() => {
              if (!chart || !chartRef.current || chart !== chartRef.current) return;
              chart.setActiveElements([]);
              if (chart.tooltip) {
                chart.tooltip.setActiveElements([], { x: 0, y: 0 });
              }
              chart.update();
              clearActiveIndexRef.current?.();
            }, 2000);
          }
        },
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          const datasets = chart.data.datasets;
          const primaryColor = colors.primary;

          let activeElements = [];
          if (chart.tooltip?._active?.length) {
            activeElements = chart.tooltip._active;
          } else {
            activeElements = chart.getActiveElements();
          }

          if (activeElements && activeElements.length) {
            const activePoint = activeElements[0];
            const x = activePoint.element.x;
            const y = activePoint.element.y;
            const topY = chart.scales.y.top;
            const bottomY = chart.scales.y.bottom;
            const leftX = chart.scales.x.left;
            const rightX = chart.scales.x.right;

            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([3, 3]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = colors.muted;

            ctx.moveTo(x, topY);
            ctx.lineTo(x, bottomY);

            ctx.moveTo(leftX, y);
            ctx.lineTo(rightX, y);

            ctx.stroke();

            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const baseIndex = activePoint.index;
            const labels = chart.data.labels;

            // Find first visible dataset to use its value for the Y-axis label
            const firstVisibleDs = datasets.find(
              (ds) => ds.data[baseIndex] !== null && ds.data[baseIndex] !== undefined
            );

            if (labels && firstVisibleDs) {
              const dateStr = labels[baseIndex];
              const value = firstVisibleDs.data[baseIndex];

              if (dateStr !== undefined && value !== undefined) {
                const textWidth = ctx.measureText(dateStr).width + 8;
                const chartLeft = chart.scales.x.left;
                const chartRight = chart.scales.x.right;
                let labelLeft = x - textWidth / 2;
                if (labelLeft < chartLeft) labelLeft = chartLeft;
                if (labelLeft + textWidth > chartRight) labelLeft = chartRight - textWidth;
                const labelCenterX = labelLeft + textWidth / 2;
                ctx.fillStyle = primaryColor;
                ctx.fillRect(labelLeft, bottomY, textWidth, 16);
                ctx.fillStyle = colors.crosshairText;
                ctx.fillText(dateStr, labelCenterX, bottomY + 8);

                const valueStr = (isNumber(value) ? value.toFixed(2) : value) + '%';
                const valWidth = ctx.measureText(valueStr).width + 8;
                ctx.fillStyle = primaryColor;
                ctx.fillRect(leftX, y - 8, valWidth, 16);
                ctx.fillStyle = colors.crosshairText;
                ctx.textAlign = 'center';
                ctx.fillText(valueStr, leftX + valWidth / 2, y);
              }
            }

            ctx.restore();
          }
        }
      }
    ];
  }, [theme]);

  const lastIndex = processedData.labels.length > 0 ? processedData.labels.length - 1 : null;
  const currentIndex = activeIndex != null && activeIndex < processedData.labels.length ? activeIndex : lastIndex;

  if (!isSupabaseConfigured || !userId) {
    return null;
  }

  const renderTrendTooltip = (className) =>
    tooltipInfo ? (
      <div
        className={`glass trend-tooltip ${className}`}
        style={{
          position: 'absolute',
          left: tooltipInfo.x,
          top: tooltipInfo.y,
          pointerEvents: 'none',
          padding: '12px',
          borderRadius: '8px',
          zIndex: 50,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          background: theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          width: TOOLTIP_SIZE.width,
          transition: 'left 0.1s ease, top 0.1s ease, opacity 0.2s',
          color: 'var(--text-primary)',
          opacity: 1
        }}
      >
        {/* Top section: Closest source label */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <span style={{ color: 'var(--muted, #888)' }}>最准数据源</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 10, height: 2, borderRadius: 999, backgroundColor: tooltipInfo.closestColor }} />
            <span className="muted" style={{ fontSize: '11px' }}>
              {tooltipInfo.closestLabel}
            </span>
          </span>
        </div>

        {/* Dashed Divider */}
        <div
          className="tooltip-divider"
          style={{
            borderTop: '1px dashed var(--glass-border, rgba(128,128,128,0.15))',
            width: '100%',
            margin: '0'
          }}
        />

        {/* Bottom section: Diff */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <span style={{ color: 'var(--muted, #888)' }}>差值</span>
          <span
            style={{
              fontFamily: 'Menlo, Monaco, monospace',
              fontWeight: '500',
              color: tooltipInfo.diff > 0 ? 'var(--danger)' : tooltipInfo.diff < 0 ? 'var(--success)' : 'inherit'
            }}
          >
            {tooltipInfo.diff > 0 ? '+' : ''}
            {tooltipInfo.diff.toFixed(2)}%
          </span>
        </div>
      </div>
    ) : null;

  const chartBlock = (
    <div className="trend-chart-panel" style={{ position: 'relative' }}>
      {renderTrendTooltip('trend-tooltip-mobile')}

      <div className="row" style={{ marginBottom: 8, gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        {processedData.datasets.map((series, displayIdx) => {
          const color = series.borderColor;
          const isHidden = hiddenSources.has(series.sourceKey);
          let valueText = '--';

          if (!isHidden && currentIndex != null && series.data[currentIndex] != null) {
            valueText = `${Number(series.data[currentIndex]).toFixed(2)}%`;
          }

          return (
            <div
              key={series.sourceKey}
              style={{ display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                setHiddenSources((prev) => {
                  const next = new Set(prev);
                  if (next.has(series.sourceKey)) {
                    next.delete(series.sourceKey);
                  } else {
                    next.add(series.sourceKey);
                  }
                  return next;
                });
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 2,
                    borderRadius: 999,
                    backgroundColor: isHidden ? '#4b5563' : color
                  }}
                />
                <span className="muted" style={{ opacity: isHidden ? 0.5 : 1 }}>
                  {series.label}
                </span>
                <button
                  className="muted"
                  type="button"
                  style={{
                    border: 'none',
                    padding: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    style={{ opacity: isHidden ? 0.4 : 0.9 }}
                  >
                    <path
                      d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    {isHidden && <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="1.6" />}
                  </svg>
                </button>
              </div>
              <span
                className="muted"
                style={{
                  fontSize: 10,
                  fontVariantNumeric: 'tabular-nums',
                  paddingLeft: 16,
                  minHeight: 14,
                  visibility: isHidden || valueText === '--' ? 'hidden' : 'visible'
                }}
              >
                {valueText}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'relative', height: 180, width: '100%', touchAction: 'pan-y' }}>
        {loading && (
          <div className="chart-overlay" style={{ backdropFilter: 'blur(2px)' }}>
            <span className="muted" style={{ fontSize: '12px' }}>
              加载中...
            </span>
          </div>
        )}

        {!loading && (isError || processedData.labels.length === 0) && (
          <div className="chart-overlay">
            <span className="muted" style={{ fontSize: '12px' }}>
              {isError ? '加载失败' : '暂无数据'}
            </span>
          </div>
        )}

        {processedData.labels.length > 0 && (
          <Line ref={chartRef} data={processedData} options={options} plugins={plugins} />
        )}

        {renderTrendTooltip('trend-tooltip-desktop')}
      </div>

      <div className="trend-range-bar">
        {ranges.map((r) => (
          <button
            key={r.value}
            type="button"
            className={`trend-range-btn ${range === r.value ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setRange(r.value);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: hideHeader ? 0 : 16 }} onClick={(e) => e.stopPropagation()}>
      {!hideHeader && (
        <div
          style={{ marginBottom: 8, cursor: 'pointer', userSelect: 'none' }}
          className="title"
          onClick={onToggleExpand}
        >
          <div className="row" style={{ width: '100%', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>估值走势</span>
              <ChevronIcon
                width="16"
                height="16"
                className="muted"
                style={{
                  transform: !isExpanded ? 'rotate(-90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {hideHeader ? (
        chartBlock
      ) : (
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
              animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
              exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {chartBlock}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
