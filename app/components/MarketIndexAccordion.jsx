'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { fetchMarketIndices } from '@/app/api/fund';
import { ChevronRightIcon } from 'lucide-react';
import { SettingsIcon } from './Icons';
import { cn } from '@/lib/utils';
import MarketSettingModal from './MarketSettingModal';

/** 简单伪随机，用于稳定迷你图形状 */
function seeded(seed) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

/** 迷你走势：优先展示当日分时数据，失败时退回占位折线 */
function MiniTrendLine({ changePercent, code, className }) {
  const isDown = changePercent <= 0;
  const width = 80;
  const height = 28;
  const pad = 3;
  const innerH = height - 2 * pad;
  const innerW = width - 2 * pad;

  // 占位伪走势（无真实历史数据）
  const fallbackPath = useMemo(() => {
    const points = 12;
    const rnd = seeded(Math.abs(Math.floor(changePercent * 100)) + 1);
    const arr = Array.from({ length: points }, (_, i) => {
      const t = i / (points - 1);
      const x = pad + t * innerW;
      const y = isDown
        ? pad + innerH * (1 - t * 0.6) - (rnd() * 4 - 2)
        : pad + innerH * (0.4 + t * 0.6) + (rnd() * 4 - 2);
      return [x, Math.max(pad, Math.min(height - pad, y))];
    });
    return arr.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  }, [changePercent, isDown, innerH, innerW, pad, height]);

  // 当日分时真实走势 path
  const [realPath, setRealPath] = useState(null);

  useEffect(() => {
    if (!code || typeof window === 'undefined' || typeof document === 'undefined') {
      setRealPath(null);
      return;
    }

    let cancelled = false;
    const varName = `min_data_${code}`;
    const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=${varName}&code=${code}&_=${Date.now()}`;

    const script = document.createElement('script');
    script.src = url;
    script.async = true;

    const cleanup = () => {
      if (document.body && document.body.contains(script)) {
        document.body.removeChild(script);
      }
      try {
        if (window[varName]) {
          delete window[varName];
        }
      } catch (e) {
        // ignore
      }
    };

    script.onload = () => {
      if (cancelled) {
        cleanup();
        return;
      }
      try {
        const raw = window[varName];
        const series =
          raw &&
          raw.data &&
          raw.data[code] &&
          raw.data[code].data &&
          Array.isArray(raw.data[code].data.data)
            ? raw.data[code].data.data
            : null;
        if (!series || !series.length) {
          setRealPath(null);
          return;
        }

        // 解析 "HHMM price volume amount" 行，只关心 price
        const points = series
          .map((row) => {
            const parts = String(row).split(' ');
            const price = parseFloat(parts[1]);
            if (!Number.isFinite(price)) return null;
            return { price };
          })
          .filter(Boolean);

        if (!points.length) {
          setRealPath(null);
          return;
        }

        const minP = points.reduce((m, p) => (p.price < m ? p.price : m), points[0].price);
        const maxP = points.reduce((m, p) => (p.price > m ? p.price : m), points[0].price);
        const span = maxP - minP || 1;

        const n = points.length;
        const pathPoints = points.map((p, idx) => {
          const t = n > 1 ? idx / (n - 1) : 0;
          const x = pad + t * innerW;
          const norm = (p.price - minP) / span;
          const y = pad + (1 - norm) * innerH;
          return [x, Math.max(pad, Math.min(height - pad, y))];
        });

        const d = pathPoints
          .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`)
          .join(' ');
        setRealPath(d);
      } finally {
        cleanup();
      }
    };

    script.onerror = () => {
      if (!cancelled) {
        setRealPath(null);
      }
      cleanup();
    };

    document.body.appendChild(script);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [code, height, innerH, innerW, pad]);

  const d = realPath || fallbackPath;
  return (
    <svg
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isDown ? 'text-[var(--success)]' : 'text-[var(--danger)]'}
      />
    </svg>
  );
}

function IndexCard({ item }) {
  const isUp = item.change >= 0;
  const colorClass = isUp ? 'text-[var(--danger)]' : 'text-[var(--success)]';
  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 flex flex-col gap-0.5 w-full"
    >
      <div className="text-xs font-medium text-[var(--foreground)] truncate">{item.name}</div>
      <div className={cn('text-sm font-semibold tabular-nums', colorClass)}>
        {item.price.toFixed(2)}
      </div>
      <div className={cn('text-xs tabular-nums', colorClass)}>
        {(item.change >= 0 ? '+' : '') + item.change.toFixed(2)}{' '}
        {(item.changePercent >= 0 ? '+' : '') + item.changePercent.toFixed(2)}%
      </div>
      <div className="mt-0.5 flex items-center justify-center opacity-80">
        <MiniTrendLine changePercent={item.changePercent} code={item.code} />
      </div>
    </div>
  );
}

// 默认展示：上证指数、深证成指、创业板指
const DEFAULT_SELECTED_CODES = ['sh000001', 'sz399001', 'sz399006'];

export default function MarketIndexAccordion({
  navbarHeight = 0,
  onHeightChange,
  isMobile,
  onCustomSettingsChange,
  refreshing = false,
}) {
  const [indices, setIndices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openValue, setOpenValue] = useState('');
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [settingOpen, setSettingOpen] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const rootRef = useRef(null);
  const hasInitializedSelectedCodes = useRef(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof onHeightChange !== 'function') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) onHeightChange(entry.contentRect.height);
    });
    ro.observe(el);
    onHeightChange(el.getBoundingClientRect().height);
    return () => {
      ro.disconnect();
      onHeightChange(0);
    };
  }, [onHeightChange, loading, indices.length]);

  const loadIndices = () => {
    let cancelled = false;
    setLoading(true);
    fetchMarketIndices()
      .then((data) => {
        if (!cancelled) setIndices(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setIndices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    // 初次挂载时加载一次指数
    const cleanup = loadIndices();
    return cleanup;
  }, []);

  useEffect(() => {
    // 跟随基金刷新节奏：每次开始刷新时重新拉取指数
    if (!refreshing) return;
    const cleanup = loadIndices();
    return cleanup;
  }, [refreshing]);

  // 初始化选中指数（本地偏好 > 默认集合）
  useEffect(() => {
    if (!indices.length || typeof window === 'undefined') return;
    if (hasInitializedSelectedCodes.current) return;
    try {
      const stored = window.localStorage.getItem('marketIndexSelected');
      const availableCodes = new Set(indices.map((it) => it.code));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((c) => availableCodes.has(c));
          if (filtered.length) {
            setSelectedCodes(filtered);
            hasInitializedSelectedCodes.current = true;
            return;
          }
        }
      }
      const defaults = DEFAULT_SELECTED_CODES.filter((c) => availableCodes.has(c));
      setSelectedCodes(defaults.length ? defaults : indices.map((it) => it.code).slice(0, 3));
    } catch {
      setSelectedCodes(indices.map((it) => it.code).slice(0, 3));
    }
  }, [indices]);

  // 持久化用户选择
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!selectedCodes.length) return;
    try {
      // 本地首选 key：独立存储，便于快速读取
      window.localStorage.setItem('marketIndexSelected', JSON.stringify(selectedCodes));

      // 同步到 customSettings，便于云端同步
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const next = parsed && typeof parsed === 'object' ? { ...parsed, marketIndexSelected: selectedCodes } : { marketIndexSelected: selectedCodes };
      window.localStorage.setItem('customSettings', JSON.stringify(next));
      onCustomSettingsChange?.();
    } catch {
      // ignore
    }
  }, [selectedCodes]);
  // 用户已选择的指数列表（按 selectedCodes 顺序）
  const visibleIndices = selectedCodes.length
    ? selectedCodes
        .map((code) => indices.find((it) => it.code === code))
        .filter(Boolean)
    : indices;

  // 重置 tickerIndex 确保索引合法
  useEffect(() => {
    if (tickerIndex >= visibleIndices.length) {
      setTickerIndex(0);
    }
  }, [visibleIndices.length, tickerIndex]);

  // 收起状态下轮播展示指数
  useEffect(() => {
    if (!visibleIndices.length) return;
    if (openValue === 'indices') return;
    if (visibleIndices.length <= 1) return;
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % visibleIndices.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [visibleIndices.length, openValue]);

  const current =
    visibleIndices.length === 0
      ? null
      : visibleIndices[openValue === 'indices' ? 0 : tickerIndex];

  const isUp = current ? current.change >= 0 : false;
  const colorClass = isUp ? 'text-[var(--danger)]' : 'text-[var(--success)]';

  const topMargin = Number(navbarHeight) || 0;
  const stickyStyle = {
    marginTop: topMargin,
    position: 'sticky',
    top: topMargin,
    zIndex: 10,
    width: isMobile ? 'calc(100% + 24px)' : '100%',
    marginLeft: isMobile ? -12 : 0,
  };

  if (loading && indices.length === 0) {
    return (
      <div
        ref={rootRef}
        className="market-index-accordion-root mt-2 mb-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 flex items-center justify-between"
        style={stickyStyle}
      >
        <span className="text-sm text-[var(--muted-foreground)]">加载大盘指数…</span>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="market-index-accordion-root mt-2 mb-2 rounded-lg border border-[var(--border)] bg-[var(--card)] market-index-accordion"
      style={stickyStyle}
    >
      <style jsx>{`
        .market-index-accordion :global([data-slot="accordion-trigger"] > svg:last-of-type) {
          display: none;
        }
        :global([data-theme='dark'] .market-index-accordion-root) {
          background-color: rgba(15, 23, 42);
        }
        .market-index-ticker {
          overflow: hidden;
        }
        .market-index-ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          animation: market-index-ticker-slide 0.35s ease-out;
        }
        @keyframes market-index-ticker-slide {
          0% {
            transform: translateY(100%);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
      <Accordion
        type="single"
        collapsible
        value={openValue}
        onValueChange={setOpenValue}
      >
        <AccordionItem value="indices" className="border-b-0">
          <AccordionTrigger
            className="py-3 px-4 hover:no-underline hover:bg-[var(--card)] [&[data-state=open]>svg]:rotate-90"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div className="flex flex-1 items-center gap-3 min-w-0">
              {current ? (
                <div className="market-index-ticker">
                  <div
                    key={current.code || current.name}
                    className="market-index-ticker-item"
                  >
                    <span className="text-sm font-medium text-[var(--foreground)] shrink-0">
                      {current.name}
                    </span>
                    <span className={cn('tabular-nums font-medium', colorClass)}>
                      {current.price.toFixed(2)}
                    </span>
                    <span className={cn('tabular-nums text-sm', colorClass)}>
                      {(current.change >= 0 ? '+' : '') + current.change.toFixed(2)}
                    </span>
                    <span className={cn('tabular-nums text-sm', colorClass)}>
                      {(current.changePercent >= 0 ? '+' : '') + current.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-[var(--muted-foreground)]">暂无指数数据</span>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0 pl-3">
              <div
                role="button"
                tabIndex={openValue === 'indices' ? 0 : -1}
                className="icon-button"
                style={{
                  border: 'none',
                  width: '28px',
                  height: '28px',
                  minWidth: '28px',
                  backgroundColor: 'transparent',
                  color: 'var(--text)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: openValue === 'indices' ? 1 : 0,
                  pointerEvents: openValue === 'indices' ? 'auto' : 'none',
                  transition: 'opacity 0.2s ease',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSettingOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    setSettingOpen(true);
                  }
                }}
                aria-label="指数个性化设置"
              >
                <SettingsIcon width="18" height="18" />
              </div>
              <ChevronRightIcon
                className={cn(
                  'w-4 h-4 text-[var(--muted-foreground)] transition-transform',
                  openValue === 'indices' ? 'rotate-90' : ''
                )}
                aria-hidden="true"
              />
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4 pt-0">
            <div
              className="flex flex-wrap w-full min-w-0"
              style={{ gap: 12 }}
            >
              {visibleIndices.map((item, i) => (
                <div
                  key={item.code || i}
                  style={{
                    flex: isMobile
                      ? '0 0 calc((100% - 24px) / 3)'
                      : '0 0 calc((100% - 48px) / 5)',
                  }}
                >
                  <IndexCard item={item} />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <MarketSettingModal
        open={settingOpen}
        onClose={() => setSettingOpen(false)}
        isMobile={isMobile}
        indices={indices}
        selectedCodes={selectedCodes}
        onChangeSelected={setSelectedCodes}
        onResetDefault={() => {
          const availableCodes = new Set(indices.map((it) => it.code));
          const defaults = DEFAULT_SELECTED_CODES.filter((c) => availableCodes.has(c));
          setSelectedCodes(defaults.length ? defaults : indices.map((it) => it.code).slice(0, 3));
        }}
      />
    </div>
  );
}
