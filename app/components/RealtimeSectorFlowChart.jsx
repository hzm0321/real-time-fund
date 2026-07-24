'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, X, ChevronDown, ChevronUp, RotateCcw, Search, BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { isArray, isNumber, isNil, isString } from 'lodash';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { toast as sonnerToast } from 'sonner';
import { Line } from 'react-chartjs-2';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useUserStore, storageStore } from '../stores';
import { getChartTooltipPosition } from '../lib/chartTooltipPosition';
import { useMembership } from '../hooks/useMembership';
import { supabase } from '../lib/supabase';

dayjs.extend(utc);
dayjs.extend(timezone);

const SECTOR_FLOW_LS_KEY = 'sectorFlowSelectedSectors';

const TOOLTIP_SIZE = {
  width: 170,
  height: 104
};

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

// 暗色主题下：高亮感、高辨识度、低互扰 20 色图表配色
const SECTOR_PALETTE_DARK = [
  '#FF4D4D', // 1. 鲜艳暖红 Bright Red
  '#00C8F8', // 2. 明亮青蓝 Bright Cyan
  '#2DD4BF', // 3. 霓虹青碧 Emerald Teal
  '#FBAA44', // 4. 明亮金珀 Amber Gold
  '#A78BFA', // 5. 亮电紫罗兰 Electric Lavender
  '#FF7F66', // 6. 明陶红暖橘 Bright Coral
  '#60A5FA', // 7. 天青海蓝 Sky Blue
  '#A3E635', // 8. 荧光青柠 Neon Lime
  '#F472B6', // 9. 霓虹粉紫 Bright Rose Pink
  '#38BDF8', // 10. 清透湖蓝 Clear Aqua
  '#FDE047', // 11. 阳光亮黄 Vivid Yellow
  '#C084FC', // 12. 亮紫葡萄 Violet Purple
  '#34D399', // 13. 薄荷玉绿 Bright Mint
  '#FB7185', // 14. 樱桃玫红 Rose Pink
  '#818CF8', // 15. 极光紫蓝 Electric Indigo
  '#FB923C', // 16. 万寿菊亮橘 Bright Orange
  '#E879F9', // 17. 霓虹丁香 Fuchsia
  '#22D3EE', // 18. 极光绿松石 Turquoise Cyan
  '#FF6B00', // 19. 火焰艳橙 Flame Orange
  '#94A3B8' // 20. 亮金灰蓝 Metallic Slate
];

// 亮色主题下：深沉高对比、高清晰度、沉稳理性的 20 色图表配色
const SECTOR_PALETTE_LIGHT = [
  '#D92632', // 1. 沉稳绯红 Rich Crimson
  '#0077B6', // 2. 经典海蓝 Royal Blue
  '#0F766E', // 3. 深邃翠绿 Deep Teal
  '#D97706', // 4. 浓郁金琥珀 Rich Amber
  '#6D28D9', // 5. 质感紫罗兰 Deep Purple
  '#C2410C', // 6. 陶土深橙 Rust Orange
  '#1D4ED8', // 7. 理性宝蓝 Strong Blue
  '#65A30D', // 8. 青柠叶绿 Leaf Green
  '#DB2777', // 9. 艳粉蔷薇 Magenta Pink
  '#0284C7', // 10. 深空湖蓝 Deep Cyan
  '#B45309', // 11. 古铜焦金 Burnt Gold
  '#581C87', // 12. 极深皇室紫 Imperial Purple
  '#047857', // 13. 翡翠墨绿 Emerald Green
  '#E11D48', // 14. 宝石绛玫 Ruby Rose
  '#4338CA', // 15. 靛蓝紫电 Deep Indigo
  '#EA580C', // 16. 热情橘红 Tangerine Orange
  '#9333EA', // 17. 亮泽紫罗兰 Vibrant Violet
  '#0E7490', // 18. 深碧海天蓝 Ocean Turquoise
  '#C84B31', // 19. 砖红砖赤 Brick Red
  '#475569' // 20. 商务岩石灰 Slate Grey
];

const SECTOR_PALETTE = SECTOR_PALETTE_DARK;

function formatTimeLabel(ts) {
  if (!isString(ts)) return '';
  try {
    const formatted = dayjs(ts).tz('Asia/Shanghai').format('HH:mm');
    if (formatted && formatted !== 'Invalid Date') return formatted;
  } catch (e) {
    // fallback
  }
  const match = ts.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

function formatValue(val, sortMode) {
  if (isNil(val) || !isNumber(Number(val))) return '--';
  const num = Number(val);
  if (sortMode === 'change_pct') {
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  } else {
    // net_inflow (单位: 元) -> 亿
    const yi = num / 100000000;
    if (Math.abs(yi) >= 1) {
      return `${yi > 0 ? '+' : ''}${yi.toFixed(2)}亿`;
    }
    const wan = num / 10000;
    return `${wan > 0 ? '+' : ''}${wan.toFixed(0)}万`;
  }
}

function formatBarValue(val, sortMode, isOutflow = false) {
  if (isNil(val) || !isNumber(Number(val))) return '--';
  const num = Number(val);
  if (sortMode === 'change_pct') {
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  } else {
    const absNum = isOutflow ? Math.abs(num) : num;
    const yi = absNum / 100000000;
    if (Math.abs(yi) >= 1) {
      return `${yi > 0 && !isOutflow ? '+' : ''}${yi.toFixed(1)}E`;
    }
    const wan = absNum / 10000;
    return `${wan > 0 && !isOutflow ? '+' : ''}${wan.toFixed(0)}万`;
  }
}

function getValueColorClass(val) {
  if (isNil(val) || !isNumber(Number(val)) || Number(val) === 0) {
    return 'text-[var(--foreground)]';
  }
  return Number(val) > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]';
}

export default function RealtimeSectorFlowChart({ sectorFilter = 'industry', sectorSort = 'change_pct' }) {
  const chartRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  const user = useUserStore((s) => s.user);
  const { isVip, loading: vipLoading } = useMembership();
  const [selectedSectorIds, setSelectedSectorIds] = useState([]);
  const [chartMode, setChartMode] = useState('line'); // 'line' | 'bar'
  const [expandAllSectors, setExpandAllSectors] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState('dark');
  const [tooltipInfo, setTooltipInfo] = useState(null);

  // 监听当前页面主题
  useEffect(() => {
    const updateTheme = () => {
      if (typeof document !== 'undefined') {
        const t = document.documentElement.getAttribute('data-theme') || storageStore.getItem('theme') || 'dark';
        setTheme(t);
      }
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    if (typeof document !== 'undefined') {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    return () => observer.disconnect();
  }, []);

  // 仅对 PRO 会员执行 React Query 获取分时数据
  const { data: timeseriesData = [], isLoading } = useQuery({
    queryKey: ['fundTopicTimeseries', sectorFilter],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.rpc('get_fund_topic_timeseries', {
        p_sector_type: sectorFilter
      });
      if (error) throw error;
      const list = isString(data) ? JSON.parse(data) : data;
      return isArray(list) ? list : [];
    },
    enabled: Boolean(user && isVip),
    staleTime: 60000,
    refetchInterval: 60000
  });

  // 从 timeseriesData 中提取数据的具体日期（YYYY-MM-DD）
  const displayDateStr = useMemo(() => {
    if (isArray(timeseriesData) && timeseriesData.length > 0) {
      for (let i = timeseriesData.length - 1; i >= 0; i--) {
        const row = timeseriesData[i];
        if (row?.update_at) {
          try {
            const formatted = dayjs(row.update_at).tz('Asia/Shanghai').format('YYYY-MM-DD');
            if (formatted && formatted !== 'Invalid Date') return formatted;
          } catch (e) {}
        }
      }
    }
    return dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD');
  }, [timeseriesData]);

  // 解析并聚合每个板块的分时序列
  const { allSectors, timelineLabels } = useMemo(() => {
    if (!isArray(timeseriesData) || timeseriesData.length === 0) {
      return { allSectors: [], timelineLabels: [] };
    }

    const labelsSet = new Set();
    const sectorMap = new Map();

    timeseriesData.forEach((row) => {
      if (!row || !row.sector_id) return;
      const timeStr = formatTimeLabel(row.update_at);
      if (timeStr) labelsSet.add(timeStr);

      if (!sectorMap.has(row.sector_id)) {
        sectorMap.set(row.sector_id, {
          id: row.sector_id,
          name: row.sector_name || row.sector_id,
          latestChangePct: 0,
          latestNetInflow: 0,
          pointsMap: new Map()
        });
      }
      const sectorObj = sectorMap.get(row.sector_id);
      const valChangePct = isNumber(Number(row.change_pct)) ? Number(row.change_pct) : 0;
      const valNetInflow = isNumber(Number(row.net_inflow)) ? Number(row.net_inflow) : 0;

      sectorObj.pointsMap.set(timeStr, {
        change_pct: valChangePct,
        net_inflow: valNetInflow
      });
      sectorObj.latestChangePct = valChangePct;
      sectorObj.latestNetInflow = valNetInflow;
    });

    // 排序所有板块
    const sortedSectors = Array.from(sectorMap.values()).sort((a, b) => {
      const valA = sectorSort === 'change_pct' ? a.latestChangePct : a.latestNetInflow;
      const valB = sectorSort === 'change_pct' ? b.latestChangePct : b.latestNetInflow;
      return valB - valA;
    });

    const sortedLabels = Array.from(labelsSet).sort();
    return { allSectors: sortedSectors, timelineLabels: sortedLabels };
  }, [timeseriesData, sectorSort]);

  // 获取默认选中的板块 ID 列表（涨幅或流入前5 + 跌幅或流出前5）
  const getDefaultSectorIds = useCallback((sectors) => {
    if (!sectors || sectors.length === 0) return [];
    if (sectors.length <= 10) return sectors.map((s) => s.id);
    const top5 = sectors.slice(0, 5);
    const bottom5 = sectors.slice(-5);
    const combined = [...top5, ...bottom5];
    return Array.from(new Set(combined.map((s) => s.id)));
  }, []);

  // 恢复本地保存的手选板块，或在本地无记录/完全失效时恢复默认算法推荐（前5+倒数5名），并自动清洗失效板块编码
  useEffect(() => {
    if (!allSectors || allSectors.length === 0) return;

    const validIdSet = new Set(allSectors.map((s) => s.id));
    const savedStore = storageStore.getItem(SECTOR_FLOW_LS_KEY, {}) || {};
    const savedIdsForCategory = isArray(savedStore?.[sectorFilter]) ? savedStore[sectorFilter] : null;

    if (savedIdsForCategory && savedIdsForCategory.length > 0) {
      // 过滤出依然存在于当前接口数据中的有效编码
      const prunedIds = savedIdsForCategory.filter((id) => validIdSet.has(id));

      if (prunedIds.length > 0) {
        setSelectedSectorIds(prunedIds);
        // 如果有失效编码被剔除，更新本地存储记录
        if (prunedIds.length !== savedIdsForCategory.length) {
          const nextStore = { ...savedStore, [sectorFilter]: prunedIds };
          storageStore.setItem(SECTOR_FLOW_LS_KEY, JSON.stringify(nextStore));
        }
      } else {
        // 若剔除后变成空列表，则清除该分类在 localStorage 中的记录，并恢复默认推荐（前5+倒数5名）
        const nextStore = { ...savedStore };
        delete nextStore[sectorFilter];
        storageStore.setItem(SECTOR_FLOW_LS_KEY, JSON.stringify(nextStore));
        setSelectedSectorIds(getDefaultSectorIds(allSectors));
      }
    } else {
      // 本地无记录，使用默认推荐（前5+倒数5名）
      setSelectedSectorIds(getDefaultSectorIds(allSectors));
    }
  }, [allSectors, sectorFilter, getDefaultSectorIds]);

  const handleToggleSector = (sectorId) => {
    setSelectedSectorIds((prev) => {
      let next;
      if (prev.includes(sectorId)) {
        if (prev.length <= 1) {
          return prev; // 至少保留一个对比板块，最后一个不能被删除
        }
        next = prev.filter((id) => id !== sectorId);
      } else {
        if (prev.length >= 20) {
          return prev; // 最多选择 20 条折线
        }
        next = [...prev, sectorId];
      }

      // 用户主动勾选/取消勾选，写入 localStorage
      const savedStore = storageStore.getItem(SECTOR_FLOW_LS_KEY, {}) || {};
      const nextStore = { ...savedStore, [sectorFilter]: next };
      storageStore.setItem(SECTOR_FLOW_LS_KEY, JSON.stringify(nextStore));

      return next;
    });
  };

  const handleResetTop5 = () => {
    setSelectedSectorIds(getDefaultSectorIds(allSectors));
    // 点击一键复位，清除当前分类的本地记录，恢复自动算法推荐模式
    const savedStore = storageStore.getItem(SECTOR_FLOW_LS_KEY, {}) || {};
    if (savedStore?.[sectorFilter]) {
      const nextStore = { ...savedStore };
      delete nextStore[sectorFilter];
      storageStore.setItem(SECTOR_FLOW_LS_KEY, JSON.stringify(nextStore));
    }
    sonnerToast.info('已重置板块对比选择', { id: 'reset-sector-flow-toast' });
  };

  // 为选中板块映射颜色（随当前亮暗主题自动匹配专用高对比配色盘）
  const sectorColorMap = useMemo(() => {
    const activePalette = theme === 'light' ? SECTOR_PALETTE_LIGHT : SECTOR_PALETTE_DARK;
    const map = new Map();
    selectedSectorIds.forEach((id, idx) => {
      map.set(id, activePalette[idx % activePalette.length]);
    });
    return map;
  }, [selectedSectorIds, theme]);

  // 构建 Chart.js 数据
  const chartData = useMemo(() => {
    const datasets = selectedSectorIds
      .map((id) => {
        const sectorObj = allSectors.find((s) => s.id === id);
        if (!sectorObj) return null;

        const color = sectorColorMap.get(id) || '#38bdf8';
        const dataPoints = timelineLabels.map((timeStr) => {
          const pt = sectorObj.pointsMap.get(timeStr);
          if (!pt) return null;
          if (sectorSort === 'change_pct') {
            return pt.change_pct;
          } else {
            // net_inflow 转换成亿为单位供折线图绘制
            return Number((pt.net_inflow / 100000000).toFixed(4));
          }
        });

        return {
          label: sectorObj.name,
          data: dataPoints,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
          spanGaps: true
        };
      })
      .filter(Boolean);

    return {
      labels: timelineLabels,
      datasets
    };
  }, [selectedSectorIds, allSectors, timelineLabels, sectorSort, sectorColorMap]);

  // 按照用户勾选的对比板块，聚合正向流向（流入/领涨）和负向流向（流出/领跌）供排名柱状图展示
  const barChartData = useMemo(() => {
    const selectedObjs = selectedSectorIds.map((id) => allSectors.find((s) => s.id === id)).filter(Boolean);

    const positiveList = [];
    const negativeList = [];

    selectedObjs.forEach((s) => {
      const val = sectorSort === 'change_pct' ? s.latestChangePct : s.latestNetInflow;
      if (val > 0) {
        positiveList.push({ ...s, val });
      } else if (val < 0) {
        negativeList.push({ ...s, val });
      }
    });

    positiveList.sort((a, b) => b.val - a.val);
    negativeList.sort((a, b) => a.val - b.val); // 负值越小流出越多，排于前列

    const maxPosVal = positiveList.length > 0 ? Math.max(...positiveList.map((s) => s.val), 0.0001) : 1;
    const maxNegVal = negativeList.length > 0 ? Math.max(...negativeList.map((s) => Math.abs(s.val)), 0.0001) : 1;
    const latestTimeStr = timelineLabels[timelineLabels.length - 1] || '09:30';

    return {
      positiveList,
      negativeList,
      maxPosVal,
      maxNegVal,
      latestTimeStr
    };
  }, [selectedSectorIds, allSectors, sectorSort, timelineLabels]);

  // 十字线定位插件（完全参考业绩走势 FundTrendChart）
  const crosshairPlugin = useMemo(() => {
    const isLight = theme === 'light';
    const lineColor = isLight ? '#475569' : '#9ca3af';
    return {
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
            if (!chart || !chartRef.current || chart !== chartRef.current) return;
            chart.setActiveElements([]);
            if (chart.tooltip) {
              chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            }
            chart.update();
            setTooltipInfo(null);
          }, 2000);
        }
      },
      afterDraw: (chart) => {
        const ctx = chart.ctx;
        let activeElements = [];
        if (chart.tooltip?._active?.length) {
          activeElements = chart.tooltip._active;
        } else if (chart.getActiveElements) {
          activeElements = chart.getActiveElements();
        }
        if (activeElements && activeElements.length) {
          const activePoint = activeElements[0];
          const x = activePoint.element.x;
          const topY = chart.scales.y.top;
          const bottomY = chart.scales.y.bottom;
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = lineColor;
          ctx.moveTo(x, topY);
          ctx.lineTo(x, bottomY);
          ctx.stroke();
          ctx.restore();
        }
      }
    };
  }, [theme]);

  // Chart.js 选项
  const chartOptions = useMemo(() => {
    const isLight = theme === 'light';
    const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    const textColor = isLight ? '#475569' : '#9ca3af';

    return {
      responsive: true,
      maintainAspectRatio: false,
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
      },
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
            if (!dataPoints || dataPoints.length === 0) {
              setTooltipInfo(null);
              return;
            }
            const firstPt = dataPoints[0];
            const dateStr = chart.data.labels?.[firstPt.dataIndex];
            const items = dataPoints
              .map((pt) => {
                const val = pt.raw;
                const ds = chart.data.datasets?.[pt.datasetIndex];
                let valText = '--';
                if (!isNil(val)) {
                  valText =
                    sectorSort === 'change_pct'
                      ? `${val > 0 ? '+' : ''}${Number(val).toFixed(2)}%`
                      : `${val > 0 ? '+' : ''}${Number(val).toFixed(2)}亿`;
                }
                return {
                  label: ds?.label || '',
                  color: ds?.borderColor || '#38bdf8',
                  valNumber: Number(val) || 0,
                  valText
                };
              })
              .sort((a, b) => b.valNumber - a.valNumber);

            // Collect all visible point positions so the tooltip can avoid covering any of them
            const additionalAvoidPoints = dataPoints.map((pt) => ({
              x: pt?.element?.x,
              y: pt?.element?.y
            }));

            const x = firstPt.element.x;
            const y = firstPt.element.y;
            const position = getChartTooltipPosition({
              anchorX: x,
              anchorY: y,
              tooltipWidth: TOOLTIP_SIZE.width,
              tooltipHeight: Math.max(80, items.length * 24 + 36),
              chartWidth: chart.width,
              chartHeight: chart.height,
              chartArea: chart.chartArea,
              additionalAvoidPoints
            });
            if (!position) {
              setTooltipInfo(null);
              return;
            }
            setTooltipInfo({
              x: position.left,
              y: position.top,
              date: dateStr,
              items
            });
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: gridColor,
            drawBorder: false
          },
          ticks: {
            color: textColor,
            maxTicksLimit: 6,
            font: { size: 11 }
          }
        },
        y: {
          grid: {
            color: gridColor,
            drawBorder: false
          },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: (val) => {
              if (sectorSort === 'change_pct') {
                return `${val > 0 ? '+' : ''}${Number(val).toFixed(1)}%`;
              } else {
                return `${val > 0 ? '+' : ''}${Number(val).toFixed(1)}亿`;
              }
            }
          }
        }
      }
    };
  }, [theme, sectorSort]);

  // 搜索过滤后的所有板块
  const filteredPoolSectors = useMemo(() => {
    if (!searchQuery.trim()) return allSectors;
    const q = searchQuery.trim().toLowerCase();
    return allSectors.filter((s) => s.name.toLowerCase().includes(q));
  }, [allSectors, searchQuery]);

  const dynamicChartHeight = useMemo(() => {
    const count = selectedSectorIds.length;
    if (count <= 6) return 300;
    return Math.max(300, count * 18 + 70);
  }, [selectedSectorIds.length]);

  const renderTrendTooltip = () =>
    tooltipInfo ? (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="glass trend-tooltip"
        style={{
          position: 'absolute',
          left: tooltipInfo.x,
          top: tooltipInfo.y,
          pointerEvents: 'none',
          padding: tooltipInfo.items?.length > 10 ? '8px 10px' : '10px 12px',
          borderRadius: '8px',
          zIndex: 50,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          background:
            theme === 'dark'
              ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.75))'
              : 'linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.4))',
          backdropFilter: theme === 'dark' ? 'blur(8px)' : 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          gap: tooltipInfo.items?.length > 10 ? '3px' : tooltipInfo.items?.length > 6 ? '5px' : '8px',
          width: TOOLTIP_SIZE.width,
          color: 'var(--text-primary)'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '4px'
          }}
        >
          <span style={{ fontWeight: '600' }}>时间</span>
          <span style={{ fontFamily: 'Menlo, Monaco, monospace', fontWeight: '500' }}>{tooltipInfo.date}</span>
        </div>
        {tooltipInfo.items?.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: tooltipInfo.items?.length > 15 ? '11px' : '12px',
              lineHeight: '1.25'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 10, height: 2, borderRadius: 999, backgroundColor: item.color }} />
              <span style={{ color: 'var(--muted, #888)' }}>{item.label}</span>
            </div>
            <span
              style={{
                fontFamily: 'Menlo, Monaco, monospace',
                fontWeight: '500',
                color: item.valNumber > 0 ? 'var(--danger)' : item.valNumber < 0 ? 'var(--success)' : 'inherit'
              }}
            >
              {item.valText}
            </span>
          </div>
        ))}
      </motion.div>
    ) : null;

  return (
    <div className="market-section glass rounded-2xl p-4 sm:p-5 my-4 border border-border/50 shadow-sm transition-all">
      {/* 头部标题区 */}
      <div className="flex items-center gap-2 flex-wrap border-b border-border/40">
        <h3 className="font-semibold text-base sm:text-lg text-[var(--foreground)]">实时板块资金流向追踪</h3>
        <span className="pro-pill-badge">👑 PRO 专享</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground">
          {sectorFilter === 'industry' ? '按行业' : '按概念'} ·{' '}
          {sectorSort === 'change_pct' ? '涨幅走势' : '净流入走势'}
        </span>
      </div>

      {/* 非 PRO 会员锁屏卡片（完全对齐估值趋势图样式） */}
      {!isVip && !vipLoading ? (
        <div
          className="glass card"
          style={{
            padding: '40px 20px',
            margin: '12px 0',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, transparent 100%)',
            borderRadius: '16px'
          }}
        >
          <div style={{ fontSize: '28px', lineHeight: 1 }}>👑</div>
          <div style={{ fontWeight: 600, fontSize: '16PX', color: '#f59e0b' }}>PRO 会员专享功能</div>
          <div className="muted" style={{ fontSize: '13px', lineHeight: 1.6, maxWidth: '320px' }}>
            开通 PRO 会员即可解锁当日实时板块资金流向追踪，全时段洞悉行业及概念主力多空趋势。
          </div>
        </div>
      ) : isLoading || vipLoading ? (
        <div className="flex flex-col items-center justify-center h-72 gap-3 text-muted-foreground">
          <Spinner className="size-6" />
          <span className="text-sm">正在加载实时板块分时流向...</span>
        </div>
      ) : allSectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-sm">
          暂无当日分时走势记录
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-3">
          {/* 顶层图例：当前已选主题标签区 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                当前对比板块 ({selectedSectorIds.length}/20)：
              </span>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <UITooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleResetTop5}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
                      >
                        <RotateCcw className="size-3" /> 一键复位
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>恢复默认选择前5名与倒数前5名</p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
              <AnimatePresence mode="popLayout">
                {selectedSectorIds.map((id) => {
                  const sectorObj = allSectors.find((s) => s.id === id);
                  if (!sectorObj) return null;
                  const color = sectorColorMap.get(id);
                  const valDisplay = formatValue(
                    sectorSort === 'change_pct' ? sectorObj.latestChangePct : sectorObj.latestNetInflow,
                    sectorSort
                  );

                  return (
                    <motion.div
                      key={id}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all shadow-2xs"
                      style={{
                        backgroundColor: theme === 'light' ? `${color}14` : `${color}1F`,
                        borderColor: theme === 'light' ? `${color}66` : color
                      }}
                    >
                      <span
                        className="shrink-0"
                        style={{ width: 10, height: 2, borderRadius: 999, backgroundColor: color }}
                      />
                      <span className="text-foreground">{sectorObj.name}</span>
                      <span
                        className={cn(
                          'text-[11px]',
                          getValueColorClass(
                            sectorSort === 'change_pct' ? sectorObj.latestChangePct : sectorObj.latestNetInflow
                          )
                        )}
                      >
                        {valDisplay}
                      </span>
                      {selectedSectorIds.length > 1 && (
                        <button
                          onClick={() => handleToggleSector(id)}
                          className="ml-0.5 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                          title="移除"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* 下层：展开所有主题选择区 */}
          <div className="border border-border/40 rounded-xl overflow-hidden bg-foreground/[0.02]">
            <button
              onClick={() => setExpandAllSectors((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-foreground/[0.03] transition-colors cursor-pointer"
            >
              <span>选择更多板块 (全部共 {allSectors.length} 个)</span>
              <span className="inline-flex items-center gap-1 text-primary">
                {expandAllSectors ? (
                  <>
                    收起所有板块 <ChevronUp className="size-3.5" />
                  </>
                ) : (
                  <>
                    点击平铺挑选 <ChevronDown className="size-3.5" />
                  </>
                )}
              </span>
            </button>

            <AnimatePresence>
              {expandAllSectors && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border/40 p-3 flex flex-col gap-2.5 overflow-x-hidden w-full"
                >
                  {/* 搜索过滤框 */}
                  <div className="relative max-w-xs">
                    <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="搜索板块名称..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 text-[16PX] sm:text-xs rounded-lg bg-background border border-border/60 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>

                  {/* 标签平铺池 */}
                  <div className="flex flex-wrap items-center gap-1.5 max-h-52 overflow-y-auto overflow-x-hidden pr-1 scrollbar-y-styled w-full">
                    {filteredPoolSectors.map((sectorObj) => {
                      const isSelected = selectedSectorIds.includes(sectorObj.id);
                      const isDisabled = !isSelected && selectedSectorIds.length >= 20;
                      const color = isSelected ? sectorColorMap.get(sectorObj.id) : undefined;
                      const valDisplay = formatValue(
                        sectorSort === 'change_pct' ? sectorObj.latestChangePct : sectorObj.latestNetInflow,
                        sectorSort
                      );

                      return (
                        <button
                          key={sectorObj.id}
                          onClick={() => !isDisabled && handleToggleSector(sectorObj.id)}
                          disabled={isDisabled}
                          title={isDisabled ? '已达20个对比板块上限，请先取消部分已选板块' : undefined}
                          className={cn(
                            'inline-flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md text-xs border transition-all text-left max-w-full overflow-hidden',
                            isDisabled
                              ? 'cursor-not-allowed opacity-40 bg-muted/30 border-border/20 text-muted-foreground select-none'
                              : isSelected
                                ? 'font-medium shadow-2xs cursor-pointer'
                                : 'bg-background/50 border-border/40 hover:bg-foreground/5 opacity-85 hover:opacity-100 cursor-pointer'
                          )}
                          style={{
                            backgroundColor: isSelected ? (theme === 'light' ? `${color}14` : `${color}1F`) : undefined,
                            borderColor: isSelected ? (theme === 'light' ? `${color}66` : color) : undefined
                          }}
                        >
                          <span
                            className={cn('truncate pr-1', isDisabled ? 'text-muted-foreground' : 'text-foreground')}
                          >
                            {sectorObj.name}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] shrink-0 font-mono',
                              isDisabled
                                ? 'text-muted-foreground/60'
                                : getValueColorClass(
                                    sectorSort === 'change_pct' ? sectorObj.latestChangePct : sectorObj.latestNetInflow
                                  )
                            )}
                          >
                            {valDisplay}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 切换控制条：左侧分时走势/排名对比，右侧展示日期 */}
          <div className="flex items-center justify-between">
            <ToggleGroup
              type="single"
              value={chartMode}
              onValueChange={(v) => v && setChartMode(v)}
              className="bg-black/5 dark:bg-white/10 p-0.5 rounded-md border border-black/5 dark:border-white/5 gap-0 shadow-inner"
            >
              <ToggleGroupItem
                value="line"
                className="h-6 px-2 text-[10px] flex items-center gap-1 rounded-sm border-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all cursor-pointer"
              >
                <Activity className="size-3" /> 分时折线
              </ToggleGroupItem>
              <ToggleGroupItem
                value="bar"
                className="h-6 px-2 text-[10px] flex items-center gap-1 rounded-sm border-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all cursor-pointer"
              >
                <BarChart3 className="size-3" /> 排名对比
              </ToggleGroupItem>
            </ToggleGroup>
            <span className="text-xs font-mono font-medium text-muted-foreground">{displayDateStr}</span>
          </div>

          {/* 视图渲染区域 */}
          {chartMode === 'line' ? (
            <div className="relative w-full pt-2 transition-all duration-300" style={{ height: dynamicChartHeight }}>
              {selectedSectorIds.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground border border-dashed border-border/50 rounded-xl">
                  请在上方勾选至少一个板块以展示对比分时图
                </div>
              ) : (
                <>
                  <Line ref={chartRef} data={chartData} options={chartOptions} plugins={[crosshairPlugin]} />
                  <AnimatePresence>{renderTrendTooltip()}</AnimatePresence>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5 pt-2 pb-2">
              {selectedSectorIds.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground border border-dashed border-border/50 rounded-xl">
                  请在上方勾选至少一个板块以展示排名对比
                </div>
              ) : barChartData.positiveList.length === 0 && barChartData.negativeList.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground border border-dashed border-border/50 rounded-xl">
                  当前勾选板块暂无领涨或领跌数据
                </div>
              ) : (
                <>
                  {/* 正向榜（流入 / 领涨）：仅在有数据时展示 */}
                  {barChartData.positiveList.length > 0 && (
                    <div className="glass rounded-xl p-4 border border-border/40 shadow-xs">
                      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-border/30">
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-3.5 rounded-full bg-[var(--danger)]" />
                          <span className="text-sm font-semibold text-foreground">
                            {sectorSort === 'change_pct' ? '领涨' : '流入'}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                          截至 {barChartData.latestTimeStr}
                        </span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {barChartData.positiveList.map((item, index) => {
                          const widthPct = Math.max(6, Math.min((item.val / barChartData.maxPosVal) * 100, 100));
                          return (
                            <div key={item.id} className="flex items-center gap-2.5 text-xs">
                              <span className="w-5 text-center font-mono font-medium text-muted-foreground shrink-0">
                                {index + 1}
                              </span>
                              <span className="font-medium text-foreground shrink-0 whitespace-nowrap min-w-[76px]">
                                {item.name}
                              </span>
                              <div className="flex-1 h-5 rounded-md bg-muted/15 dark:bg-muted/20 overflow-hidden relative min-w-[36px]">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${widthPct}%` }}
                                  transition={{ duration: 0.4, ease: 'easeOut' }}
                                  className="h-full rounded-r-md transition-all"
                                  style={{
                                    backgroundColor: theme === 'light' ? '#dc2626' : '#f87171'
                                  }}
                                />
                              </div>
                              <span className="font-mono font-medium text-foreground shrink-0 text-right min-w-[56px]">
                                {formatBarValue(item.val, sectorSort, false)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 负向榜（流出 / 领跌）：仅在有数据时展示 */}
                  {barChartData.negativeList.length > 0 && (
                    <div className="glass rounded-xl p-4 border border-border/40 shadow-xs">
                      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-border/30">
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-3.5 rounded-full bg-[var(--success)]" />
                          <span className="text-sm font-semibold text-foreground">
                            {sectorSort === 'change_pct' ? '领跌' : '流出'}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                          截至 {barChartData.latestTimeStr}
                        </span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {barChartData.negativeList.map((item, index) => {
                          const widthPct = Math.max(
                            6,
                            Math.min((Math.abs(item.val) / barChartData.maxNegVal) * 100, 100)
                          );
                          return (
                            <div key={item.id} className="flex items-center gap-2.5 text-xs">
                              <span className="w-5 text-center font-mono font-medium text-muted-foreground shrink-0">
                                {index + 1}
                              </span>
                              <span className="font-medium text-foreground shrink-0 whitespace-nowrap min-w-[76px]">
                                {item.name}
                              </span>
                              <div className="flex-1 h-5 rounded-md bg-muted/15 dark:bg-muted/20 overflow-hidden relative min-w-[36px]">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${widthPct}%` }}
                                  transition={{ duration: 0.4, ease: 'easeOut' }}
                                  className="h-full rounded-r-md transition-all"
                                  style={{
                                    backgroundColor: theme === 'light' ? '#059669' : '#34d399'
                                  }}
                                />
                              </div>
                              <span className="font-mono font-medium text-foreground shrink-0 text-right min-w-[56px]">
                                {formatBarValue(item.val, sectorSort, true)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
