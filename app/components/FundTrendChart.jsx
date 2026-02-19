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
import {cachedRequest} from "../lib/cacheRequest";

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

export default function FundTrendChart({ code, isExpanded, onToggleExpand, holdingCost, holdingDate }) {
  const [range, setRange] = useState('1m');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

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
  }, [code, range, isExpanded]);

  const ranges = [
    { label: '近1月', value: '1m' },
    { label: '近3月', value: '3m' },
    { label: '近6月', value: '6m' },
    { label: '近1年', value: '1y' },
  ];

  const change = useMemo(() => {
     if (!data.length) return 0;
     const first = data[0].value;
     const last = data[data.length - 1].value;
     return ((last - first) / first) * 100;
  }, [data]);

  // Red for up, Green for down (CN market style)
  // Hardcoded hex values from globals.css for Chart.js
  const upColor = '#f87171'; // --danger
  const downColor = '#34d399'; // --success
  const lineColor = change >= 0 ? upColor : downColor;
  
  const costMarker = useMemo(() => {
    if (
      typeof holdingCost !== 'number' || Number.isNaN(holdingCost) ||
      !holdingDate ||
      data.length < 2
    ) {
      return null;
    }

    const targetDate = new Date(`${holdingDate}T00:00:00`);
    if (Number.isNaN(targetDate.getTime())) return null;

    const datedPoints = data
      .map((d, index) => {
        const pointDate = new Date(`${d.date}T00:00:00`);
        return Number.isNaN(pointDate.getTime()) ? null : { index, pointDate, date: d.date };
      })
      .filter(Boolean);

    if (!datedPoints.length) return null;

    const startDate = datedPoints[0].pointDate;
    const endDate = datedPoints[datedPoints.length - 1].pointDate;
    if (targetDate < startDate || targetDate > endDate) return null;

    let nearest = datedPoints[0];
    let minDiff = Math.abs(datedPoints[0].pointDate.getTime() - targetDate.getTime());

    for (let i = 1; i < datedPoints.length; i += 1) {
      const diff = Math.abs(datedPoints[i].pointDate.getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        nearest = datedPoints[i];
      }
    }

    return {
      index: nearest.index,
      date: nearest.date,
      holdingDate,
    };
  }, [data, holdingCost, holdingDate]);

  const chartData = useMemo(() => {
    // Calculate percentage change based on the first data point
    const firstValue = data.length > 0 ? data[0].value : 1;
    const percentageData = data.map(d => ((d.value - firstValue) / firstValue) * 100);
    const unitValues = data.map(d => d.value);
    const costPercent = (typeof holdingCost === 'number' && !Number.isNaN(holdingCost))
      ? ((holdingCost - firstValue) / firstValue) * 100
      : null;

    const datasets = [
      {
        label: '涨跌幅',
        data: percentageData,
        rawValues: unitValues,
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
        tension: 0.2
      }
    ];

    if (costMarker) {
      datasets.push({
        label: '持仓成本价点位',
        data: data.map((_, idx) => (idx === costMarker.index ? costPercent : null)),
        rawValues: data.map((_, idx) => (idx === costMarker.index ? holdingCost : null)),
        borderWidth: 0,
        pointRadius: (ctx) => (ctx.dataIndex === costMarker.index ? 6 : 0),
        pointHoverRadius: (ctx) => (ctx.dataIndex === costMarker.index ? 7 : 0),
        pointBackgroundColor: '#fbbf24',
        pointBorderColor: '#111827',
        pointBorderWidth: 2,
        showLine: false,
        fill: false,
        order: -1
      });
    }

    return {
      labels: data.map(d => d.date),
      datasets
    };
  }, [data, lineColor, costMarker, holdingCost]);

  const options = useMemo(() => {
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
            color: '#9ca3af',
            font: { size: 10 },
            maxTicksLimit: 4,
            maxRotation: 0
          },
          border: { display: false }
        },
        y: {
          display: true,
          position: 'right',
          grid: {
            color: '#1f2937',
            drawBorder: false,
            tickLength: 0
          },
          ticks: {
            color: '#9ca3af',
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
      onHover: (event, chartElement) => {
        event.native.target.style.cursor = chartElement[0] ? 'crosshair' : 'default';
      }
    };
  }, []);

  const plugins = useMemo(() => [{
    id: 'crosshair',
    afterDraw: (chart) => {
      // 检查是否有激活的点
      let activePoint = null;
      if (chart.tooltip?._active?.length) {
        activePoint = chart.tooltip._active[0];
      } else {
        // 如果 tooltip._active 为空（可能因为 enabled: false 导致内部状态更新机制差异），
        // 尝试从 getActiveElements 获取，这在 Chart.js 3+ 中是推荐方式
        const activeElements = chart.getActiveElements();
        if (activeElements && activeElements.length) {
          activePoint = activeElements[0];
        }
      }

      if (activePoint) {
        const ctx = chart.ctx;
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
        ctx.strokeStyle = '#9ca3af';

        // Draw vertical line
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        
        // Draw horizontal line
        ctx.moveTo(leftX, y);
        ctx.lineTo(rightX, y);
        
        ctx.stroke();

        // 获取 --primary 颜色
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#22d3ee';

        // Draw labels
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 获取数据点
        // 优先使用 chart.data 中的数据，避免闭包过时问题
        // activePoint.index 是当前数据集中的索引
        const index = activePoint.index;
        const displayDatasetIndex = 0;
        
        const labels = chart.data.labels;
        const datasets = chart.data.datasets;

        if (labels && datasets && datasets[displayDatasetIndex] && datasets[displayDatasetIndex].data) {
           const dateStr = labels[index];
           const value = datasets[displayDatasetIndex].data[index];

           if (dateStr !== undefined && value !== undefined) {
               // X axis label (date)
               const textWidth = ctx.measureText(dateStr).width + 8;
               ctx.fillStyle = primaryColor;
               ctx.fillRect(x - textWidth / 2, bottomY, textWidth, 16);
               ctx.fillStyle = '#0f172a'; // --background
               ctx.fillText(dateStr, x, bottomY + 8);

               // Y axis label (value)
               const valueStr = (typeof value === 'number' ? value.toFixed(2) : value) + '%';
               const valWidth = ctx.measureText(valueStr).width + 8;
               ctx.fillStyle = primaryColor;
               ctx.fillRect(rightX - valWidth, y - 8, valWidth, 16);
               ctx.fillStyle = '#0f172a'; // --background
               ctx.textAlign = 'center';
               ctx.fillText(valueStr, rightX - valWidth / 2, y);

               // Unit NAV label for the same point
               const rawValue = datasets[displayDatasetIndex].rawValues?.[index];
               if (typeof rawValue === 'number') {
                 const navStr = `净值 ${rawValue.toFixed(4)}`;
                 const navWidth = ctx.measureText(navStr).width + 10;
                 const navX = Math.max(leftX + navWidth / 2, Math.min(rightX - navWidth / 2, x));
                 const navY = Math.max(topY + 10, y - 18);
                 ctx.fillStyle = '#22d3ee';
                 ctx.fillRect(navX - navWidth / 2, navY - 8, navWidth, 16);
                 ctx.fillStyle = '#0f172a';
                 ctx.fillText(navStr, navX, navY);
               }

               if (costMarker && index === costMarker.index) {
                 const costStr = `成本 ${holdingCost.toFixed(4)} (建仓日 ${costMarker.holdingDate})`;
                 const costWidth = ctx.measureText(costStr).width + 10;
                 const costX = Math.max(leftX + costWidth / 2, Math.min(rightX - costWidth / 2, x));
                 const costY = Math.min(bottomY - 10, y + 18);
                 ctx.fillStyle = '#fbbf24';
                 ctx.fillRect(costX - costWidth / 2, costY - 8, costWidth, 16);
                 ctx.fillStyle = '#111827';
                 ctx.fillText(costStr, costX, costY);
               }
           }
        }

        ctx.restore();
      }
    }
  }], [costMarker, holdingCost]);
  
  return (
    <div style={{ marginTop: 16 }} onClick={(e) => e.stopPropagation()}>
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
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ position: 'relative', height: 180, width: '100%' }}>
              {costMarker && (
                <div style={{ position: 'absolute', left: 0, top: -2, zIndex: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24', border: '2px solid #111827', display: 'inline-block' }} />
                  <span className="muted" style={{ fontSize: '10px' }}>持仓成本价点位</span>
                </div>
              )}
              {loading && (
                <div style={{ 
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.02)', zIndex: 10, backdropFilter: 'blur(2px)'
                }}>
                  <span className="muted" style={{ fontSize: '12px' }}>加载中...</span>
                </div>
              )}
              
              {!loading && data.length === 0 && (
                 <div style={{ 
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.02)', zIndex: 10
                }}>
                  <span className="muted" style={{ fontSize: '12px' }}>暂无数据</span>
                </div>
              )}

              {data.length > 0 && (
                <Line ref={chartRef} data={chartData} options={options} plugins={plugins} />
              )}
            </div>

            <div style={{ display: 'flex', gap: 4, marginTop: 12, justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 8 }}>
              {ranges.map(r => (
                <button
                  key={r.value}
                  onClick={(e) => { e.stopPropagation(); setRange(r.value); }}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: '11px',
                    borderRadius: '6px',
                    border: 'none',
                    background: range === r.value ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: range === r.value ? 'var(--primary)' : 'var(--muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontWeight: range === r.value ? 600 : 400
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
