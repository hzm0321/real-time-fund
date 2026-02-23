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

export default function FundTrendChart({ code, isExpanded, onToggleExpand, transactions = [] }) {
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
  }, [code, range, isExpanded, data.length]);

  const ranges = [
    { label: '近1月', value: '1m' },
    { label: '近3月', value: '3m' },
    { label: '近6月', value: '6m' },
    { label: '近1年', value: '1y' },
    { label: '近3年', value: '3y'}
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
  
  const chartData = useMemo(() => {
    // Calculate percentage change based on the first data point
    const firstValue = data.length > 0 ? data[0].value : 1;
    const percentageData = data.map(d => ((d.value - firstValue) / firstValue) * 100);

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

    return {
      labels: data.map(d => d.date),
      datasets: [
        {
          type: 'line',
          label: '涨跌幅',
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
        {
          type: 'line', // Use line type with showLine: false to simulate scatter on Category scale
          label: '买入',
          data: buyPoints,
          borderColor: '#ffffff',
          borderWidth: 1,
          backgroundColor: '#ef4444',
          pointStyle: 'circle',
          pointRadius: 2.5,
          pointHoverRadius: 4,
          showLine: false,
          order: 1
        },
        {
          type: 'line',
          label: '卖出',
          data: sellPoints,
          borderColor: '#ffffff',
          borderWidth: 1,
          backgroundColor: '#22c55e',
          pointStyle: 'circle',
          pointRadius: 2.5,
          pointHoverRadius: 4,
          showLine: false,
          order: 1
        }
      ]
    };
  }, [data, lineColor, transactions]);

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
      const ctx = chart.ctx;
      const datasets = chart.data.datasets;
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#22d3ee';
      
      // Helper function to draw point label
      const drawPointLabel = (datasetIndex, index, text, bgColor, textColor = '#ffffff', yOffset = 0) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (!meta.data[index]) return;
          const element = meta.data[index];
          // Check if element is visible/not skipped
          if (element.skip) return;
          
          const x = element.x;
          const y = element.y + yOffset;
          
          ctx.save();
          ctx.font = 'bold 11px sans-serif';
          const labelWidth = ctx.measureText(text).width + 12;
          
          // Draw label above the point
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = bgColor;
          ctx.fillRect(x - labelWidth/2, y - 24, labelWidth, 18);
          
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = textColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x, y - 15);
          ctx.restore();
      };

      // 1. Draw default labels for first buy and sell points
      // Index 1 is Buy, Index 2 is Sell
      if (datasets[1] && datasets[1].data) {
          const firstBuyIndex = datasets[1].data.findIndex(v => v !== null && v !== undefined);
          if (firstBuyIndex !== -1) {
              // Check collision with Sell
              let sellIndex = -1;
              if (datasets[2] && datasets[2].data) {
                  sellIndex = datasets[2].data.findIndex(v => v !== null && v !== undefined);
              }
              const isCollision = (firstBuyIndex === sellIndex);
              drawPointLabel(1, firstBuyIndex, '买入', '#ef4444', '#ffffff', isCollision ? -20 : 0);
          }
      }
      if (datasets[2] && datasets[2].data) {
          const firstSellIndex = datasets[2].data.findIndex(v => v !== null && v !== undefined);
          if (firstSellIndex !== -1) {
              drawPointLabel(2, firstSellIndex, '卖出', '#22c55e');
          }
      }

      // 2. Handle active elements (hover crosshair)
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
        ctx.strokeStyle = '#9ca3af';

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

        // Draw Axis Labels based on the first point (main line)
        const datasetIndex = activePoint.datasetIndex;
        const index = activePoint.index;
        
        const labels = chart.data.labels;

        if (labels && datasets && datasets[datasetIndex] && datasets[datasetIndex].data) {
           const dateStr = labels[index];
           const value = datasets[datasetIndex].data[index];

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
           }
        }

        // Check for collision between Buy (1) and Sell (2) in active elements
        const activeBuy = activeElements.find(e => e.datasetIndex === 1);
        const activeSell = activeElements.find(e => e.datasetIndex === 2);
        const isCollision = activeBuy && activeSell && activeBuy.index === activeSell.index;

        // Iterate through all active points to find transaction points and draw their labels
        activeElements.forEach(element => {
            const dsIndex = element.datasetIndex;
            // Only for transaction datasets (index > 0)
            if (dsIndex > 0 && datasets[dsIndex]) {
                const label = datasets[dsIndex].label;
                // Determine background color based on dataset index
                // 1 = Buy (Red), 2 = Sell (Green)
                const bgColor = dsIndex === 1 ? '#ef4444' : '#22c55e';
                
                // If collision, offset Buy label upwards
                let yOffset = 0;
                if (isCollision && dsIndex === 1) {
                    yOffset = -20;
                }
                
                drawPointLabel(dsIndex, element.index, label, bgColor, '#ffffff', yOffset);
            }
        });

        ctx.restore();
      }
    }
  }], []); // 移除 data 依赖，因为我们直接从 chart 实例读取数据
  
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
