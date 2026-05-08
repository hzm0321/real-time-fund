'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { isNumber } from 'lodash';
import FundDailyEarningsDetailModal from './FundDailyEarningsDetailModal';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
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

export default function FundDailyEarnings({ series = [], theme = 'dark', masked = false }) {
  const [range, setRange] = useState('3m');
  const [detailOpen, setDetailOpen] = useState(false);
  const chartRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const chartColors = useMemo(() => getChartThemeColors(theme), [theme]);

  const ranges = useMemo(() => ([
    { label: '近1月', value: '1m', days: 31 },
    { label: '近3月', value: '3m', days: 93 },
    { label: '近6月', value: '6m', days: 186 },
    { label: '近1年', value: '1y', days: 366 },
    { label: '全部', value: 'all' },
  ]), []);

  const filteredSeries = useMemo(() => {
    if (!Array.isArray(series) || series.length === 0) return [];
    if (range === 'all') return series;

    const cfg = ranges.find(r => r.value === range);
    const days = cfg?.days;
    if (!days) return series;

    const lastDateStr = series[series.length - 1]?.date;
    if (!lastDateStr) return series;

    const lastDate = new Date(`${lastDateStr}T00:00:00`);
    if (!Number.isFinite(lastDate.getTime())) return series;

    const cutoff = new Date(lastDate);
    cutoff.setDate(cutoff.getDate() - days + 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return series.filter(d => d?.date && d.date >= cutoffStr);
  }, [series, range, ranges]);

  const rangeLabel = useMemo(() => {
    return ranges.find(r => r.value === range)?.label || '全部';
  }, [ranges, range]);

  const totalEarnings = useMemo(() => {
    if (!filteredSeries.length) return 0;
    return filteredSeries.reduce((sum, d) => {
      const v = d?.earnings;
      return (typeof v === 'number' && Number.isFinite(v)) ? sum + v : sum;
    }, 0);
  }, [filteredSeries]);

  const visibleRows = useMemo(() => {
    if (!filteredSeries.length) return [];
    return [...filteredSeries].reverse().slice(0, 5);
  }, [filteredSeries]);

  const chartData = useMemo(() => {
    if (!filteredSeries.length) return { labels: [], datasets: [] };

    const labels = filteredSeries.map(d => d.date.slice(5));
    const values = filteredSeries.map(d => d.earnings);
    const lastValue = values[values.length - 1];
    const lineColor = lastValue >= 0 ? chartColors.danger : chartColors.success;

    return {
      labels,
      datasets: [
        {
          type: 'line',
          label: '每日收益',
          data: values,
          borderColor: lineColor,
          backgroundColor: (ctx) => {
            if (!ctx.chart.ctx) return lineColor + '33';
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 120);
            gradient.addColorStop(0, lineColor + '33');
            gradient.addColorStop(1, lineColor + '00');
            return gradient;
          },
          borderWidth: 2,
          pointRadius: filteredSeries.length <= 2 ? 3 : 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.2
        }
      ]
    };
  }, [filteredSeries, chartColors.danger, chartColors.success]);

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
            callback: (v) => {
              if (!isNumber(v)) return v;
              if (masked) return '***';
              const prefix = v >= 0 ? '+' : '';
              return `${prefix}${v.toFixed(0)}`;
            }
          }
        }
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

        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }

        if (hasActive) {
          hoverTimeoutRef.current = setTimeout(() => {
            const c = chartRef.current || currentChart;
            if (!c) return;
            c.setActiveElements([]);
            if (c.tooltip) {
              c.tooltip.setActiveElements([], { x: 0, y: 0 });
            }
            c.update();
            if (target) {
              target.style.cursor = 'default';
            }
          }, 2000);
        }
      }
    };
  }, [theme, masked]);

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
      afterDraw: (chart) => {
        const ctx = chart.ctx;
        const activeElements = chart.tooltip?._active?.length
          ? chart.tooltip._active
          : chart.getActiveElements();
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
          const dateStr = String(labels[index]);
          const tw = ctx.measureText(dateStr).width + 8;
          const chartLeft = chart.scales.x.left;
          const chartRight = chart.scales.x.right;
          let labelLeft = x - tw / 2;
          if (labelLeft < chartLeft) labelLeft = chartLeft;
          if (labelLeft + tw > chartRight) labelLeft = chartRight - tw;
          const labelCenterX = labelLeft + tw / 2;
          ctx.fillStyle = prim;
          ctx.fillRect(labelLeft, bottomY, tw, 16);
          ctx.fillStyle = textCol;
          ctx.fillText(dateStr, labelCenterX, bottomY + 8);
        }
        if (data && index in data) {
          const val = data[index];
          const valueStr = masked
            ? '***'
            : isNumber(val)
              ? `${val >= 0 ? '+' : '-'}${Math.abs(val).toFixed(2)}`
              : String(val);
          const vw = ctx.measureText(valueStr).width + 8;
          ctx.fillStyle = prim;
          ctx.fillRect(leftX, y - 8, vw, 16);
          ctx.fillStyle = textCol;
          ctx.fillText(valueStr, leftX + vw / 2, y);
        }
        ctx.restore();
      }
    }];
  }, [theme, masked]);

  if (!series.length) return null;

  return (
    <div style={{ marginTop: 12, marginBottom: 4 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span>
          {rangeLabel}累计收益{' '}
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontSize: 13,
              fontWeight: 600,
              color: masked
                ? 'inherit'
                : totalEarnings >= 0
                  ? chartColors.danger
                  : chartColors.success,
            }}
          >
            {masked ? '***' : `${totalEarnings >= 0 ? '+' : '-'}${Math.abs(totalEarnings).toFixed(2)}`}
          </span>
        </span>
      </div>
      <div style={{ position: 'relative', height: 100, width: '100%', touchAction: 'pan-y' }}>
        <Line ref={chartRef} data={chartData} options={options} plugins={plugins} />
      </div>
      <div className="trend-range-bar" style={{ marginTop: 6 }}>
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

      <div
        style={{
          marginTop: 8,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          background: 'var(--card)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
            color: 'var(--text)',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--table-row-alt-bg)' }}>
              <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--muted)', textAlign: 'left' }}>日期</th>
              <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>收益</th>
              <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>收益率</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, idx) => {
              const v = row?.earnings;
              const isValid = typeof v === 'number' && Number.isFinite(v);
              const sign = isValid && v > 0 ? '+' : isValid && v < 0 ? '-' : '';
              const cls = !isValid || masked ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '';
              const text = masked ? '***' : isValid ? `${sign}${Math.abs(v).toFixed(2)}` : '—';
              const rv = row?.rate;
              const snapshotCost = Number(row?.baseCostAmount);
              const derivedRate = isValid && Number.isFinite(snapshotCost) && snapshotCost > 0
                ? (v / snapshotCost) * 100
                : null;
              const rateValue =
                typeof rv === 'number' && Number.isFinite(rv)
                  ? rv
                  : derivedRate;
              const rateValid = typeof rateValue === 'number' && Number.isFinite(rateValue);
              const rateSign = rateValid && rateValue > 0 ? '+' : '';
              const rateCls = masked || !rateValid ? '' : rateValue > 0 ? 'up' : rateValue < 0 ? 'down' : '';
              const rateText = masked
                ? '***'
                : rateValid
                  ? `${rateSign}${rateValue.toFixed(2)}%`
                  : '—';
              return (
                <tr key={`${row?.date || 'row'}_${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text)' }}>
                    {row?.date || '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    <span className={cls}>{text}</span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    <span className={rateCls}>{rateText}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          className="muted"
          style={{
            fontSize: 12,
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
          }}
          onClick={() => setDetailOpen(true)}
        >
          加载更多收益明细
        </button>
      </div>

      {detailOpen && (
        <FundDailyEarningsDetailModal
          open={detailOpen}
          onOpenChange={setDetailOpen}
          series={filteredSeries}
          masked={masked}
          title={`${rangeLabel}收益明细`}
        />
      )}
    </div>
  );
}
