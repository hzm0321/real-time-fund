'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchFundHistory } from '../api/fund';
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
import { cachedRequest } from '../lib/cacheRequest';
import FundHistoryNetValue from './FundHistoryNetValue';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_COLORS = {
  dark: {
    danger: '#f87171',
    success: '#34d399',
    primary: '#22d3ee',
    muted: '#9ca3af',
    border: '#1f2937',
    text: '#e5e7eb',
    crosshairText: '#0f172a',
  },
  light: {
    danger: '#dc2626',
    success: '#059669',
    primary: '#0891b2',
    muted: '#475569',
    border: '#e2e8f0',
    text: '#0f172a',
    crosshairText: '#ffffff',
  }
};

function getChartThemeColors(theme) {
  return CHART_COLORS[theme] || CHART_COLORS.dark;
}

export default function FundTrendChart({ code, isExpanded, onToggleExpand, transactions = [], theme = 'dark', hideHeader = false }) {
  const [range, setRange] = useState('3m');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const clearActiveIndexRef = useRef(null);
  const [hiddenGrandSeries, setHiddenGrandSeries] = useState(() => new Set());
  const [activeIndex, setActiveIndex] = useState(null);

  useEffect(() => {
    clearActiveIndexRef.current = () => setActiveIndex(null);
  });

  const chartColors = useMemo(() => getChartThemeColors(theme), [theme]);

  useEffect(() => {
    // If collapsed, don't fetch data unless we have no data yet
    if (!isExpanded && data.length > 0) return;

    let active = true;
    setLoading(true);
    setError(null);
    const cacheKey = `fund_history_${code}_${range}`;

    if (isExpanded) {
      cachedRequest(
        () => fetchFundHistory(code, range),
        cacheKey,
        { cacheTime: 10 * 60 * 1000 }
      )
        .then(res => {
          if (active) {
            setData(res || []);
            setLoading(false);
          }
        })
        .catch(err => {
          if (active) {
            setError(err);
            setLoading(false);
          }
        });

    }
    return () => { active = false; };
  }, [code, range, isExpanded, data.length]);

  const ranges = [
    { label: '近1月', value: '1m' },
    { label: '近3月', value: '3m' },
    { label: '近6月', value: '6m' },
    { label: '近1年', value: '1y' },
    { label: '近3年', value: '3y' },
    { label: '成立来', value: 'all' }
  ];

  const change = useMemo(() => {
     if (!data.length) return 0;
     const first = data[0].value;
     const last = data[data.length - 1].value;
     return ((last - first) / first) * 100;
  }, [data]);

  // Red for up, Green for down (CN market style)，随主题使用 CSS 变量
  const upColor = chartColors.danger;
  const downColor = chartColors.success;
  const lineColor = change >= 0 ? upColor : downColor;
  const primaryColor = chartColors.primary;

  const percentageData = useMemo(() => {
    if (!data.length) return [];
    const firstValue = data[0].value ?? 1;
    return data.map(d => ((d.value - firstValue) / firstValue) * 100);
  }, [data]);

  const chartData = useMemo(() => {
    // Data_grandTotal：在 fetchFundHistory 中解析为 data.grandTotalSeries 数组
    const grandTotalSeries = Array.isArray(data.grandTotalSeries) ? data.grandTotalSeries : [];

    // Map transaction dates to chart indices
    const dateToIndex = new Map(data.map((d, i) => [d.date, i]));
    const buyPoints = new Array(data.length).fill(null);
    const sellPoints = new Array(data.length).fill(null);

    transactions.forEach(t => {
        // Simple date matching (assuming formats match)
        // If formats differ, dayjs might be needed
        const idx = dateToIndex.get(t.date);
        if (idx !== undefined) {
            const val = percentageData[idx];
            if (t.type === 'buy') {
                buyPoints[idx] = val;
            } else {
                sellPoints[idx] = val;
            }
        }
    });

    // 将 Data_grandTotal 的多条曲线按日期对齐到主 labels 上
    const labels = data.map(d => d.date);
    // 对比线颜色：避免与主线红/绿（upColor/downColor）重复
    // 第三条对比线需要在亮/暗主题下都足够清晰，因此使用高对比的橙色强调
    const grandAccent3 = theme === 'light' ? '#f97316' : '#fb923c';
    const grandColors = [
      primaryColor,
      chartColors.muted,
      grandAccent3,
      chartColors.text,
    ];
    // 隐藏第一条对比线（数据与图示）；第二条用原第一条颜色，第三条用原第二条，顺延
    const visibleGrandSeries = grandTotalSeries.filter((_, idx) => idx > 0);
    const grandDatasets = visibleGrandSeries.map((series, displayIdx) => {
      const color = grandColors[displayIdx % grandColors.length];
      const idx = displayIdx + 1; // 原始索引，用于 hiddenGrandSeries 的 key
      const key = `${series.name || 'series'}_${idx}`;
      const isHidden = hiddenGrandSeries.has(key);
      const pointsByDate = new Map(series.points.map(p => [p.date, p.value]));

      // 方案 2：将对比线同样归一到当前区间首日，展示为“相对本区间首日的累计收益率（百分点变化）”
      let baseValue = null;
      for (const date of labels) {
        const v = pointsByDate.get(date);
        if (typeof v === 'number' && Number.isFinite(v)) {
          baseValue = v;
          break;
        }
      }

      const seriesData = labels.map(date => {
        if (isHidden || baseValue == null) return null;
        const v = pointsByDate.get(date);
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        // Data_grandTotal 中的 value 已是百分比，这里按区间首日做“差值”，保持同一坐标含义（相对区间首日的收益率变化）
        return v - baseValue;
      });

      return {
        type: 'line',
        label: series.name || '累计收益率',
        data: seriesData,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        fill: false,
        tension: 0.2,
        order: 2,
      };
    });

    return {
      labels: data.map(d => d.date),
      datasets: [
        {
          type: 'line',
          label: '本基金',
          data: percentageData,
          borderColor: lineColor,
          backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
            gradient.addColorStop(0, `${lineColor}33`); // 20% opacity
            gradient.addColorStop(1, `${lineColor}00`); // 0% opacity
            return gradient;
          },
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.2,
          order: 2
        },
        ...(['1y', '3y', 'all'].includes(range) ? [] : grandDatasets),
        {
          type: 'line', // Use line type with showLine: false to simulate scatter on Category scale
          label: '买入',
          isTradePoint: true,
          data: buyPoints,
          borderColor: '#ffffff',
          borderWidth: 1,
          backgroundColor: primaryColor,
          pointStyle: 'circle',
          pointRadius: 2.5,
          pointHoverRadius: 4,
          showLine: false,
          order: 1
        },
        {
          type: 'line',
          label: '卖出',
          isTradePoint: true,
          data: sellPoints,
          borderColor: '#ffffff',
          borderWidth: 1,
          backgroundColor: upColor,
          pointStyle: 'circle',
          pointRadius: 2.5,
          pointHoverRadius: 4,
          showLine: false,
          order: 1
        }
      ]
    };
  }, [data, transactions, lineColor, primaryColor, upColor, chartColors, theme, hiddenGrandSeries, percentageData, range]);

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
          enabled: false, // 禁用默认 Tooltip，使用自定义绘制
          mode: 'index',
          intersect: false,
          external: () => {} // 禁用外部 HTML tooltip
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
        intersect: false,
      },
      onHover: (event, chartElement, chart) => {
        const target = event?.native?.target;
        const currentChart = chart || chartRef.current;
        if (!currentChart) return;

        const tooltipActive = currentChart.tooltip?._active ?? [];
        const activeElements = currentChart.getActiveElements
          ? currentChart.getActiveElements()
          : [];
        const hasActive =
          (chartElement && chartElement.length > 0) ||
          (tooltipActive && tooltipActive.length > 0) ||
          (activeElements && activeElements.length > 0);

        if (target) {
          target.style.cursor = hasActive ? 'crosshair' : 'default';
        }

        // 记录当前激活的横轴索引，用于图示下方展示对应百分比
        if (Array.isArray(chartElement) && chartElement.length > 0) {
          const idx = chartElement[0].index;
          setActiveIndex(typeof idx === 'number' ? idx : null);
        } else {
          setActiveIndex(null);
        }

        // 仅用于桌面端 hover 改变光标，不在这里做 2 秒清除，避免移动端 hover 事件不稳定
      },
      onClick: (_event, elements) => {
        if (Array.isArray(elements) && elements.length > 0) {
          const idx = elements[0].index;
          setActiveIndex(typeof idx === 'number' ? idx : null);
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
    return [{
    id: 'crosshair',
    afterEvent: (chart, args) => {
      const { event, replay } = args || {};
      if (!event || replay) return; // 忽略动画重放

      const type = event.type;
      if (type === 'mousemove' || type === 'click') {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }

        hoverTimeoutRef.current = setTimeout(() => {
          if (!chart) return;
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

      // 绘制圆角矩形（兼容无 roundRect 的环境）
      const drawRoundRect = (left, top, w, h, r) => {
        const rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(left + rad, top);
        ctx.lineTo(left + w - rad, top);
        ctx.quadraticCurveTo(left + w, top, left + w, top + rad);
        ctx.lineTo(left + w, top + h - rad);
        ctx.quadraticCurveTo(left + w, top + h, left + w - rad, top + h);
        ctx.lineTo(left + rad, top + h);
        ctx.quadraticCurveTo(left, top + h, left, top + h - rad);
        ctx.lineTo(left, top + rad);
        ctx.quadraticCurveTo(left, top, left + rad, top);
        ctx.closePath();
      };

      const drawPointLabel = (datasetIndex, index, text, bgColor, textColor = '#ffffff', yOffset = 0) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (!meta.data[index]) return;
          const element = meta.data[index];
          if (element.skip) return;

          const x = element.x;
          const y = element.y + yOffset;
          const paddingH = 10;
          const paddingV = 6;
          const radius = 8;

          ctx.save();
          ctx.font = 'bold 11px sans-serif';
          const textW = ctx.measureText(text).width;
          const w = textW + paddingH * 2;
          const h = 18;

          // 计算原始 left，并对左右边界做收缩，避免在最右/最左侧被裁剪
          const chartLeft = chart.scales.x.left;
          const chartRight = chart.scales.x.right;
          let left = x - w / 2;
          if (left < chartLeft) left = chartLeft;
          if (left + w > chartRight) left = chartRight - w;
          const centerX = left + w / 2;

          const top = y - 24;

          drawRoundRect(left, top, w, h, radius);
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = bgColor;
          ctx.fill();

          ctx.globalAlpha = 0.7;
          ctx.fillStyle = textColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, centerX, top + h / 2);
          ctx.restore();
      };

      // Resolve active elements (hover/focus) first — used to decide whether to show default labels
      let activeElements = [];
      if (chart.tooltip?._active?.length) {
        activeElements = chart.tooltip._active;
      } else {
        activeElements = chart.getActiveElements();
      }

      const isBuyOrSellDataset = (ds) =>
        !!ds && (ds.isTradePoint === true || ds.label === '买入' || ds.label === '卖出');

      // 1. Draw default labels for first buy and sell points only when NOT focused/hovering
      // datasets 顺序是动态的：主线(0) + 对比线(若干) + 买入 + 卖出
      const buyDatasetIndex = datasets.findIndex(ds => ds?.label === '买入' || (ds?.isTradePoint === true && ds?.label === '买入'));
      const sellDatasetIndex = datasets.findIndex(ds => ds?.label === '卖出' || (ds?.isTradePoint === true && ds?.label === '卖出'));

      if (!activeElements?.length && buyDatasetIndex !== -1 && datasets[buyDatasetIndex]?.data) {
        const firstBuyIndex = datasets[buyDatasetIndex].data.findIndex(v => v !== null && v !== undefined);
        if (firstBuyIndex !== -1) {
          let sellIndex = -1;
          if (sellDatasetIndex !== -1 && datasets[sellDatasetIndex]?.data) {
            sellIndex = datasets[sellDatasetIndex].data.findIndex(v => v !== null && v !== undefined);
          }
          const isCollision = (firstBuyIndex === sellIndex);
          drawPointLabel(buyDatasetIndex, firstBuyIndex, '买入', primaryColor, '#ffffff', isCollision ? -20 : 0);
        }
      }

      if (!activeElements?.length && sellDatasetIndex !== -1 && datasets[sellDatasetIndex]?.data) {
        const firstSellIndex = datasets[sellDatasetIndex].data.findIndex(v => v !== null && v !== undefined);
        if (firstSellIndex !== -1) {
          drawPointLabel(sellDatasetIndex, firstSellIndex, '卖出', '#f87171');
        }
      }

      // 2. Handle active elements (hover crosshair)
      // 始终保留十字线与 X/Y 坐标轴对应标签（坐标参照）
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

        // Draw vertical line
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);

        // Draw horizontal line (based on first point - usually the main line)
        ctx.moveTo(leftX, y);
        ctx.lineTo(rightX, y);

        ctx.stroke();

        // Draw labels
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw Axis Labels：始终使用主线（净值涨跌幅，索引 0）作为数值来源，
        // 避免对比线在悬停时显示自己的数值标签
        const baseIndex = activePoint.index;
        const labels = chart.data.labels;
        const mainDataset = datasets[0];

        if (labels && mainDataset && Array.isArray(mainDataset.data)) {
          const dateStr = labels[baseIndex];
          const value = mainDataset.data[baseIndex];

          if (dateStr !== undefined && value !== undefined) {
            // X axis label (date) with boundary clamping
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

            // Y axis label (value) — 始终基于主线百分比
            const valueStr = (typeof value === 'number' ? value.toFixed(2) : value) + '%';
            const valWidth = ctx.measureText(valueStr).width + 8;
            ctx.fillStyle = primaryColor;
            ctx.fillRect(leftX, y - 8, valWidth, 16);
            ctx.fillStyle = colors.crosshairText;
            ctx.textAlign = 'center';
            ctx.fillText(valueStr, leftX + valWidth / 2, y);
          }
        }

        // Check for collision between Buy and Sell in active elements
        const activeBuy = activeElements.find(e => datasets?.[e.datasetIndex]?.label === '买入');
        const activeSell = activeElements.find(e => datasets?.[e.datasetIndex]?.label === '卖出');
        const isCollision = activeBuy && activeSell && activeBuy.index === activeSell.index;

        // Iterate through active points，仅为买入/卖出绘制标签
        activeElements.forEach(element => {
          const dsIndex = element.datasetIndex;
          const ds = datasets?.[dsIndex];
          if (!isBuyOrSellDataset(ds)) return;

          const label = ds.label;
          const bgColor = label === '买入' ? primaryColor : colors.danger;

          // 如果买入/卖出在同一天，买入标签上移避免遮挡
          let yOffset = 0;
          if (isCollision && label === '买入') {
            yOffset = -20;
          }

          drawPointLabel(dsIndex, element.index, label, bgColor, '#ffffff', yOffset);
        });

        ctx.restore();
      }
    }
  }];
  }, [theme]); // theme 变化时重算以应用亮色/暗色坐标轴与 crosshair

  const lastIndex = data.length > 0 ? data.length - 1 : null;
  const currentIndex = activeIndex != null && activeIndex < data.length ? activeIndex : lastIndex;

  const chartBlock = (
    <>
      {/* 顶部图示：说明不同颜色/标记代表的含义 */}
      <div
        className="row"
        style={{ marginBottom: 8, gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 10,
                height: 2,
                borderRadius: 999,
                backgroundColor: lineColor
              }}
            />
            <span className="muted">本基金</span>
          </div>
          {currentIndex != null && percentageData[currentIndex] !== undefined && (
            <span
              className="muted"
              style={{
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                paddingLeft: 14,
              }}
            >
              {percentageData[currentIndex].toFixed(2)}%
            </span>
          )}
        </div>
        {Array.isArray(data.grandTotalSeries) &&
          !['1y', '3y', 'all'].includes(range) &&
          data.grandTotalSeries
            .filter((_, idx) => idx > 0)
            .map((series, displayIdx) => {
              const idx = displayIdx + 1;
              const legendAccent3 = theme === 'light' ? '#f97316' : '#fb923c';
              const legendColors = [
                primaryColor,
                chartColors.muted,
                legendAccent3,
                chartColors.text,
              ];
              const color = legendColors[displayIdx % legendColors.length];
              const key = `${series.name || 'series'}_${idx}`;
            const isHidden = hiddenGrandSeries.has(key);
            let valueText = '--';
            if (!isHidden && currentIndex != null && data[currentIndex]) {
              const targetDate = data[currentIndex].date;

              // 与折线一致：对比线显示“相对当前区间首日”的累计收益率变化
              const pointsArray = Array.isArray(series.points) ? series.points : [];
              const pointsByDate = new Map(pointsArray.map(p => [p.date, p.value]));

              let baseValue = null;
              for (const d of data) {
                const v = pointsByDate.get(d.date);
                if (typeof v === 'number' && Number.isFinite(v)) {
                  baseValue = v;
                  break;
                }
              }

              // 注意：Data_grandTotal 某些对比线可能不包含区间最后一天的点。
              // 旧逻辑是对 `targetDate` 做严格匹配，缺点就会得到 `--`。
              // 新逻辑：找不到精确日期时，回退到该对比线在区间内最近的可用日期。
              let rawPoint = pointsByDate.get(targetDate);
              if ((rawPoint === undefined || rawPoint === null) && baseValue != null) {
                for (let i = currentIndex; i >= 0; i--) {
                  const d = data[i];
                  if (!d) continue;
                  const v = pointsByDate.get(d.date);
                  if (typeof v === 'number' && Number.isFinite(v)) {
                    rawPoint = v;
                    break;
                  }
                }
              }

              if (baseValue != null && typeof rawPoint === 'number' && Number.isFinite(rawPoint)) {
                const normalized = rawPoint - baseValue;
                valueText = `${normalized.toFixed(2)}%`;
              }
            }
            return (
              <div
                key={series.name || idx}
                style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setHiddenGrandSeries(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) {
                      next.delete(key);
                    } else {
                      next.add(key);
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
                      backgroundColor: isHidden ? '#4b5563' : color,
                    }}
                  />
                  <span
                    className="muted"
                    style={{ opacity: isHidden ? 0.5 : 1 }}
                  >
                    {series.name}
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
                      alignItems: 'center',
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
                      {isHidden && (
                        <line
                          x1="4"
                          y1="20"
                          x2="20"
                          y2="4"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                      )}
                    </svg>
                  </button>
                </div>
                <span
                  className="muted"
                  style={{
                    fontSize: 10,
                    fontVariantNumeric: 'tabular-nums',
                    paddingLeft: 14,
                    minHeight: 14,
                    visibility: isHidden || valueText === '--' ? 'hidden' : 'visible',
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
            <span className="muted" style={{ fontSize: '12px' }}>加载中...</span>
          </div>
        )}

        {!loading && data.length === 0 && (
          <div className="chart-overlay">
            <span className="muted" style={{ fontSize: '12px' }}>暂无数据</span>
          </div>
        )}

        {data.length > 0 && (
          <Line ref={chartRef} data={chartData} options={options} plugins={plugins} />
        )}
      </div>

      <div className="trend-range-bar">
        {ranges.map(r => (
          <button
            key={r.value}
            type="button"
            className={`trend-range-btn ${range === r.value ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setRange(r.value); }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <FundHistoryNetValue code={code} range={range} theme={theme} />
    </>
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
              <span>业绩走势</span>
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
            {data.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="muted">{ranges.find(r => r.value === range)?.label}涨跌幅</span>
                <span style={{ color: lineColor, fontWeight: 600 }}>
                  {change > 0 ? '+' : ''}{change.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {hideHeader && data.length > 0 && (
        <div className="row" style={{ marginBottom: 8, justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="muted">{ranges.find(r => r.value === range)?.label}涨跌幅</span>
            <span style={{ color: lineColor, fontWeight: 600 }}>
              {change > 0 ? '+' : ''}{change.toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {hideHeader ? (
        chartBlock
      ) : (
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              {chartBlock}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
