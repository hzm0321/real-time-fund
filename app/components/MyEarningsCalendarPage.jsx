'use client';
import { isArray, isBoolean, isNumber } from 'lodash';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { zhCN } from 'date-fns/locale/zh-CN';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn, formatMoney } from '@/lib/utils';
import { supabase, isSupabaseConfigured } from '@/app/lib/supabase';
import { calculateYtdReturnRate, mergeAllScopedDailyEarnings, mergeAllHoldings } from '@/app/lib/dailyEarnings';
import { storageStore, useUserStore, useStorageStore } from '@/app/stores';
import { searchFunds } from '@/app/api/fund';
import { CloseIcon } from './Icons';
import FitText from './FitText';

dayjs.locale('zh-cn');

const SWIPE_THRESHOLD = 72;

function formatEarnings(v, masked, isRate = false) {
  if (masked) return '***';
  if (!isNumber(v) || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  const formatted = formatMoney(Math.abs(v));
  return isRate ? `${sign}${formatted}%` : `${sign}${formatted}`;
}

function earningsClass(v) {
  if (!isNumber(v) || !Number.isFinite(v)) return '';
  if (v > 0) return 'up';
  if (v < 0) return 'down';
  return '';
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function EarningsRankIllustration() {
  return (
    <svg
      className="my-earnings-rank-illustration"
      viewBox="0 0 188 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="myEarningsBarFront" x1="94" y1="12" x2="94" y2="114" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--my-earnings-illu-bar-front-start)" stopOpacity="0.48" />
          <stop offset="1" stopColor="var(--my-earnings-illu-bar-front-end)" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="myEarningsBarSide" x1="135" y1="18" x2="156" y2="92" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--my-earnings-illu-bar-side-start)" stopOpacity="0.38" />
          <stop offset="1" stopColor="var(--my-earnings-illu-bar-side-end)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="myEarningsArrow" x1="25" y1="86" x2="166" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--my-earnings-illu-arrow-start)" stopOpacity="0" />
          <stop offset="0.42" stopColor="var(--my-earnings-illu-arrow-mid)" stopOpacity="0.54" />
          <stop offset="1" stopColor="var(--my-earnings-illu-arrow-end)" />
        </linearGradient>
        <radialGradient
          id="myEarningsGlow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(136 42) rotate(143.13) scale(88 46)"
        >
          <stop stopColor="var(--my-earnings-illu-glow-start)" stopOpacity="0.34" />
          <stop offset="1" stopColor="var(--my-earnings-illu-glow-end)" stopOpacity="0" />
        </radialGradient>
        <filter id="myEarningsSoftGlow" x="-20" y="-20" width="228" height="168" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="myEarningsArrowGlow" x="12" y="18" width="176" height="96" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <ellipse cx="118" cy="68" rx="76" ry="52" fill="url(#myEarningsGlow)" />
      <circle
        cx="115"
        cy="18"
        r="4"
        fill="var(--my-earnings-illu-particle)"
        opacity="0.24"
        filter="url(#myEarningsSoftGlow)"
      />
      <circle
        cx="43"
        cy="46"
        r="3"
        fill="var(--my-earnings-illu-particle)"
        opacity="0.16"
        filter="url(#myEarningsSoftGlow)"
      />

      <g opacity="0.78">
        <path
          d="M44 80C44 76.6863 46.6863 74 50 74H74C77.3137 74 80 76.6863 80 80V110H44V80Z"
          fill="url(#myEarningsBarFront)"
          opacity="0.28"
        />
        <ellipse cx="62" cy="80" rx="18" ry="6" fill="var(--my-earnings-illu-small-top)" fillOpacity="0.2" />
        <path
          d="M44 80C44 83.3137 52.0589 86 62 86C71.9411 86 80 83.3137 80 80"
          stroke="var(--my-earnings-illu-stroke-soft)"
          strokeOpacity="0.14"
          strokeWidth="1.2"
        />

        <path
          d="M79 49C79 45.6863 81.6863 43 85 43H113C116.314 43 119 45.6863 119 49V110H79V49Z"
          fill="url(#myEarningsBarFront)"
          opacity="0.44"
        />
        <path d="M119 49L132 44V104L119 110V49Z" fill="url(#myEarningsBarSide)" opacity="0.42" />
        <ellipse cx="99" cy="49" rx="20" ry="6.5" fill="var(--my-earnings-illu-mid-top)" fillOpacity="0.3" />
        <path
          d="M79 49C79 52.5899 87.9543 55.5 99 55.5C110.046 55.5 119 52.5899 119 49"
          stroke="var(--my-earnings-illu-stroke-soft)"
          strokeOpacity="0.2"
          strokeWidth="1.25"
        />
        <path d="M84 54V102" stroke="var(--my-earnings-illu-highlight)" strokeOpacity="0.08" strokeWidth="1.4" />

        <path
          d="M124 17C124 13.6863 126.686 11 130 11H164C167.314 11 170 13.6863 170 17V110H124V17Z"
          fill="url(#myEarningsBarFront)"
          opacity="0.62"
        />
        <path d="M170 17L181 22V102L170 110V17Z" fill="url(#myEarningsBarSide)" opacity="0.55" />
        <ellipse cx="147" cy="17" rx="23" ry="7" fill="var(--my-earnings-illu-large-top)" fillOpacity="0.42" />
        <path
          d="M124 17C124 20.866 134.297 24 147 24C159.703 24 170 20.866 170 17"
          stroke="var(--my-earnings-illu-stroke-strong)"
          strokeOpacity="0.24"
          strokeWidth="1.3"
        />
        <path d="M131 28V101" stroke="var(--my-earnings-illu-highlight)" strokeOpacity="0.1" strokeWidth="1.6" />
        <path d="M159 32V76" stroke="var(--my-earnings-illu-highlight)" strokeOpacity="0.07" strokeWidth="1.3" />
      </g>

      <path
        d="M24 88C63 92 122 75 164 36"
        stroke="var(--my-earnings-illu-arrow-end)"
        strokeOpacity="0.24"
        strokeWidth="9"
        strokeLinecap="round"
        filter="url(#myEarningsArrowGlow)"
      />
      <path d="M24 88C63 92 122 75 164 36" stroke="url(#myEarningsArrow)" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M155 29L177 21L171 45L164 36L155 29Z" fill="var(--my-earnings-illu-arrow-end)" />
      <path
        d="M155 29L177 21L171 45L164 36L155 29Z"
        fill="var(--my-earnings-illu-arrow-end)"
        opacity="0.42"
        filter="url(#myEarningsArrowGlow)"
      />
      <path
        d="M26 112H181"
        stroke="var(--my-earnings-illu-baseline)"
        strokeOpacity="0.1"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function MyEarningsCalendarPage({ open, onOpenChange, series = [], masked, onGoHome }) {
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const user = useUserStore((state) => state.user);
  const fundDailyEarnings = useStorageStore((state) => state.fundDailyEarnings);
  const funds = useStorageStore((state) => state.funds);

  const hasData = isArray(series) && series.length > 0;

  const [selectedDate, setSelectedDate] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resolvedNames, setResolvedNames] = useState({});

  const mergedEarningsMapForDrawer = useMemo(() => {
    return mergeAllScopedDailyEarnings(fundDailyEarnings);
  }, [fundDailyEarnings]);

  const selectedDateFunds = useMemo(() => {
    if (!selectedDate) return [];
    const list = [];
    for (const [code, dates] of Object.entries(mergedEarningsMapForDrawer)) {
      if (!isArray(dates)) continue;
      const dayData = dates.find((d) => d.date === selectedDate);
      if (dayData && isNumber(dayData.earnings) && Number.isFinite(dayData.earnings)) {
        const fundObj = (funds || []).find((f) => f.code === code);
        const name = fundObj?.name || resolvedNames[code] || code;
        let rate = dayData.rate;
        if (!isNumber(rate) || !Number.isFinite(rate)) {
          const cost = Number(dayData.baseCostAmount);
          if (Number.isFinite(cost) && cost > 0) {
            rate = (dayData.earnings / cost) * 100;
          } else {
            rate = null;
          }
        }
        list.push({
          code,
          name,
          earnings: dayData.earnings,
          rate
        });
      }
    }
    return list.sort((a, b) => b.earnings - a.earnings);
  }, [selectedDate, mergedEarningsMapForDrawer, funds, resolvedNames]);

  useEffect(() => {
    if (!drawerOpen || selectedDateFunds.length === 0) return;
    const fundCodes = (funds || []).map((f) => f.code);
    const codesToResolve = selectedDateFunds
      .filter((item) => !fundCodes.includes(item.code) && !resolvedNames[item.code])
      .map((item) => item.code);
    if (codesToResolve.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        codesToResolve.map(async (code) => {
          try {
            const results = await searchFunds(code);
            const found = results.find((item) => item.CODE === code);
            return [code, found ? found.NAME || found.SHORTNAME || code : code];
          } catch {
            return [code, code];
          }
        })
      );
      if (cancelled) return;
      setResolvedNames((prev) => {
        const next = { ...prev };
        for (const [code, name] of entries) {
          if (!prev[code]) next[code] = name;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, selectedDateFunds, funds]);

  const [viewTab, setViewTab] = useState('day');
  const [displayMode, setDisplayMode] = useState('amount');
  const activeDisplayMode = viewTab === 'day' ? displayMode : 'amount';

  const [cursorMonth, setCursorMonth] = useState(() => dayjs().startOf('month'));
  const [cursorYear, setCursorYear] = useState(() => dayjs().year());

  const [percentile, setPercentile] = useState(null);
  const [ytdRate, setYtdRate] = useState(null);

  useEffect(() => {
    if (!open) {
      setPercentile(null);
      setYtdRate(null);
      return undefined;
    }
    let cancelled = false;
    const computeAndFetchPercentile = async () => {
      try {
        const mergedEarningsMap = mergeAllScopedDailyEarnings(fundDailyEarnings);
        const globalHoldings = storageStore.getItem('holdings', {});
        const groupHoldings = storageStore.getItem('groupHoldings', {});
        const mergedHoldings = mergeAllHoldings(globalHoldings, groupHoldings);

        const rate = calculateYtdReturnRate(mergedEarningsMap, mergedHoldings);

        if (!isNumber(rate) || !Number.isFinite(rate)) {
          if (!cancelled) {
            setYtdRate(null);
            setPercentile(null);
          }
          return;
        }

        if (cancelled) return;
        setYtdRate(rate);
        setPercentile(null);

        if (!isSupabaseConfigured || !user) return;

        const { data, error } = await supabase.rpc('get_ytd_percentile', { p_ytd_rate: rate });
        const nextPercentile = Number(data);
        if (!cancelled && !error && Number.isFinite(nextPercentile) && nextPercentile >= 0) {
          setPercentile(nextPercentile);
        }
      } catch (e) {
        console.error('Failed to fetch YTD percentile', e);
        if (!cancelled) setPercentile(null);
      }
    };
    computeAndFetchPercentile();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const earningsByDate = useMemo(() => {
    const map = new Map();
    if (!isArray(series)) return map;
    for (const row of series) {
      if (row?.date && isNumber(row.earnings) && Number.isFinite(row.earnings)) {
        let rate = row.rate;
        if (!isNumber(rate) || !Number.isFinite(rate)) {
          const cost = Number(row.baseCostAmount);
          if (Number.isFinite(cost) && cost > 0) {
            rate = (row.earnings / cost) * 100;
          } else {
            rate = null;
          }
        }
        map.set(row.date, { amount: row.earnings, rate });
      }
    }
    return map;
  }, [series]);

  const monthTotalsForYear = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => 0);
    if (!isArray(series)) return arr;
    for (const row of series) {
      if (!row?.date || !isNumber(row.earnings) || !Number.isFinite(row.earnings)) continue;
      const y = parseInt(row.date.slice(0, 4), 10);
      const m = parseInt(row.date.slice(5, 7), 10) - 1;
      if (y === cursorYear && m >= 0 && m < 12) arr[m] += row.earnings;
    }
    return arr;
  }, [series, cursorYear]);

  const yearTotals = useMemo(() => {
    const map = new Map();
    if (!isArray(series)) return map;
    for (const row of series) {
      if (!row?.date || !isNumber(row.earnings) || !Number.isFinite(row.earnings)) continue;
      const y = parseInt(row.date.slice(0, 4), 10);
      if (!Number.isFinite(y)) continue;
      map.set(y, (map.get(y) ?? 0) + row.earnings);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [series]);

  /** 按日视图：当前展示月的收益合计 */
  const dayViewMonthTotalAmount = useMemo(() => {
    const prefix = cursorMonth.format('YYYY-MM');
    let sum = 0;
    for (const [d, obj] of earningsByDate.entries()) {
      if (d.startsWith(prefix) && isNumber(obj.amount) && Number.isFinite(obj.amount)) {
        sum += obj.amount;
      }
    }
    return sum;
  }, [earningsByDate, cursorMonth]);

  const dayViewMonthTotalRate = useMemo(() => {
    const prefix = cursorMonth.format('YYYY-MM');
    let compounded = 1;
    let hasValidData = false;
    const sortedDates = Array.from(earningsByDate.keys())
      .filter((d) => d.startsWith(prefix))
      .sort();
    for (const d of sortedDates) {
      const obj = earningsByDate.get(d);
      if (obj && isNumber(obj.rate) && Number.isFinite(obj.rate)) {
        compounded *= 1 + obj.rate / 100;
        hasValidData = true;
      }
    }
    return hasValidData ? (compounded - 1) * 100 : 0;
  }, [earningsByDate, cursorMonth]);

  const dayViewMonthTotal = activeDisplayMode === 'rate' ? dayViewMonthTotalRate : dayViewMonthTotalAmount;

  const goPrev = useCallback(() => {
    if (viewTab === 'day') setCursorMonth((m) => m.subtract(1, 'month'));
    else if (viewTab === 'month') setCursorYear((y) => y - 1);
  }, [viewTab]);

  const goNext = useCallback(() => {
    const now = dayjs();
    if (viewTab === 'day') {
      setCursorMonth((m) => {
        const next = m.add(1, 'month');
        if (next.isAfter(now, 'month')) return m;
        return next;
      });
    } else if (viewTab === 'month') {
      setCursorYear((y) => {
        if (y >= now.year()) return y;
        return y + 1;
      });
    }
  }, [viewTab]);

  const onDragEnd = useCallback(
    (_, info) => {
      if (info.offset.x > SWIPE_THRESHOLD) goPrev();
      else if (info.offset.x < -SWIPE_THRESHOLD) goNext();
    },
    [goPrev, goNext]
  );

  const enableSwipe = viewTab === 'day' || viewTab === 'month';

  const yearSum = monthTotalsForYear.reduce((a, b) => a + b, 0);

  const headerTitle =
    viewTab === 'day' ? cursorMonth.format('YYYY年M月') : viewTab === 'month' ? `${cursorYear}年` : '历年收益';

  const now = dayjs();
  const nextPeriodDisabled =
    viewTab === 'day'
      ? cursorMonth.add(1, 'month').isAfter(now, 'month')
      : viewTab === 'month'
        ? cursorYear >= now.year()
        : false;

  const resolvedIsMobile = isBoolean(isMobile)
    ? isMobile
    : typeof window !== 'undefined'
      ? window.matchMedia?.('(max-width: 640px)')?.matches
      : false;

  const pcCellDayFontSize = resolvedIsMobile ? 15 : 16;
  const pcEarningsMaxFontSize = resolvedIsMobile ? 10 : 12;
  const pcEarningsMinFontSize = resolvedIsMobile ? 6 : 8;

  const content = (
    <div className="my-earnings-drawer-inner flex min-h-0 flex-1 flex-col overflow-hidden px-5">
      {hasData && (
        <div className="my-earnings-context-header shrink-0 pb-3">
          <div
            className={cn(
              'my-earnings-title-row my-earnings-period-row',
              viewTab === 'year' && 'my-earnings-period-row-single'
            )}
          >
            {viewTab === 'year' ? (
              <span className="my-earnings-context-title">{headerTitle}</span>
            ) : (
              <>
                <button
                  type="button"
                  className="my-earnings-period-nav-btn"
                  aria-label={viewTab === 'day' ? '上一月' : '上一年'}
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                >
                  <ChevronLeft size={22} strokeWidth={2} aria-hidden />
                </button>
                <span className="my-earnings-context-title my-earnings-period-label" aria-live="polite">
                  {headerTitle}
                </span>
                <button
                  type="button"
                  className="my-earnings-period-nav-btn"
                  aria-label={viewTab === 'day' ? '下一月' : '下一年'}
                  disabled={nextPeriodDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                >
                  <ChevronRight size={22} strokeWidth={2} aria-hidden />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="my-earnings-drawer-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {!hasData ? (
          <div className="my-earnings-empty">
            <p className="my-earnings-empty-title">暂无每日收益记录</p>
            <p className="my-earnings-empty-desc">请先在首页添加基金并维护持仓，系统会在刷新估值后自动累计每日收益。</p>
            {onGoHome && (
              <button
                type="button"
                className="my-earnings-primary-btn"
                onClick={() => {
                  onGoHome();
                }}
              >
                返回首页
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="trend-range-bar mb-2 shrink-0 items-center relative">
              {[
                { id: 'day', label: '日' },
                { id: 'month', label: '月' },
                { id: 'year', label: '年' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`trend-range-btn ${viewTab === t.id ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewTab(t.id);
                    if (t.id === 'month') setCursorYear(cursorMonth.year());
                    if (t.id === 'day') setCursorMonth((m) => m.year(cursorYear));
                  }}
                >
                  {t.label}
                </button>
              ))}

              <div className="w-[1px] h-3.5 mx-0.5 shrink-0 bg-[var(--border)] opacity-60 rounded-full" />

              {[
                { id: 'amount', label: '金额' },
                { id: 'rate', label: '收益率' }
              ].map((t) => {
                const disabled = viewTab !== 'day';
                const isActive = activeDisplayMode === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`trend-range-btn ${isActive && !disabled ? 'active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!disabled) {
                        setDisplayMode(t.id);
                      }
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="my-earnings-detail my-earnings-detail-summary-top shrink-0">
              {viewTab === 'day' && (
                <>
                  <div className="my-earnings-detail-label">{cursorMonth.format('YYYY年M月')} 合计</div>
                  <FitText
                    as="div"
                    maxFontSize={24}
                    minFontSize={14}
                    className={cn('my-earnings-detail-value', earningsClass(dayViewMonthTotal))}
                  >
                    {formatEarnings(dayViewMonthTotal, masked, activeDisplayMode === 'rate')}
                  </FitText>
                </>
              )}
              {viewTab === 'month' && (
                <>
                  <div className="my-earnings-detail-label">{cursorYear}年 合计</div>
                  <FitText
                    as="div"
                    maxFontSize={24}
                    minFontSize={14}
                    className={cn('my-earnings-detail-value', earningsClass(yearSum))}
                  >
                    {formatEarnings(yearSum, masked)}
                  </FitText>
                </>
              )}
              {viewTab === 'year' && (
                <>
                  <div className="my-earnings-detail-label">全部年度</div>
                  <div className="my-earnings-detail-desc">上滑列表查看各年收益合计</div>
                </>
              )}
            </div>

            <motion.div
              className="my-earnings-swipe-wrap"
              drag={enableSwipe && !reduceMotion ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={reduceMotion ? 0 : 0.45}
              dragMomentum={false}
              onDragEnd={enableSwipe ? onDragEnd : undefined}
            >
              <div className="my-earnings-calendar-card">
                {viewTab === 'day' && (
                  <>
                    <Calendar
                      mode="single"
                      month={cursorMonth.toDate()}
                      onMonthChange={(d) => setCursorMonth(dayjs(d).startOf('month'))}
                      toMonth={new Date()}
                      showOutsideDays
                      hideNavigation
                      captionLayout="label"
                      locale={zhCN}
                      formatters={{
                        formatWeekdayName: (date) => WEEKDAY_LABELS[date.getDay()]
                      }}
                      style={{
                        // 让 7 列宽度跟随父容器伸缩，而不是固定 cell-size
                        '--cell-size': 'calc((100% - 12px) / 7)'
                      }}
                      className="w-full bg-transparent p-0"
                      classNames={{
                        root: 'w-full',
                        months: 'w-full',
                        month: 'w-full gap-2',
                        month_grid: 'w-full',
                        month_caption: 'hidden',
                        nav: 'hidden',
                        table: 'w-full border-collapse table-fixed',
                        tbody: 'w-full',
                        weekdays: 'flex gap-[4px]',
                        weekday: 'flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none',
                        week: 'mt-[4px] flex w-full gap-[4px]',
                        day: cn(
                          'group/day relative aspect-square w-full overflow-hidden p-0 align-top text-center select-none',
                          '[&:last-child[data-selected=true]_button]:rounded-r-md'
                        ),
                        today: 'bg-transparent text-inherit'
                      }}
                      components={{
                        DayButton: ({ children, modifiers, day, ...props }) => {
                          const key = dayjs(day.date).format('YYYY-MM-DD');
                          const isOutside = !!modifiers?.outside;
                          const isToday = !isOutside && dayjs(day.date).isSame(dayjs(), 'day');
                          const isFutureDay = dayjs(day.date).startOf('day').isAfter(dayjs().startOf('day'));

                          const dayData = !isOutside ? earningsByDate.get(key) : undefined;
                          const dayAmount = dayData?.amount;
                          const dayRate = dayData?.rate;

                          const hasAmount = isNumber(dayAmount) && Number.isFinite(dayAmount);
                          const hasRate = isNumber(dayRate) && Number.isFinite(dayRate);

                          const val = activeDisplayMode === 'rate' ? dayRate : dayAmount;
                          const hasVal = activeDisplayMode === 'rate' ? hasRate : hasAmount;

                          const earningsTone = hasVal && val > 0 ? 'up' : hasVal && val < 0 ? 'down' : 'zero';

                          const showEarningsRow = !isFutureDay;
                          const bgToneClass = showEarningsRow
                            ? hasVal
                              ? val > 0
                                ? '!bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] hover:!bg-[color-mix(in_srgb,var(--danger)_24%,transparent)]'
                                : val < 0
                                  ? '!bg-[color-mix(in_srgb,var(--success)_18%,transparent)] hover:!bg-[color-mix(in_srgb,var(--success)_24%,transparent)]'
                                  : '!bg-[color-mix(in_srgb,var(--muted-foreground)_8%,transparent)] hover:!bg-[color-mix(in_srgb,var(--muted-foreground)_12%,transparent)]'
                              : '!bg-[color-mix(in_srgb,var(--muted-foreground)_8%,transparent)] hover:!bg-[color-mix(in_srgb,var(--muted-foreground)_12%,transparent)]'
                            : '';

                          return (
                            <CalendarDayButton
                              day={day}
                              modifiers={modifiers}
                              {...props}
                              onClick={(e) => {
                                if (props.onClick) props.onClick(e);
                                if (showEarningsRow && hasVal) {
                                  setSelectedDate(key);
                                  setDrawerOpen(true);
                                }
                              }}
                              style={{
                                ...(props.style || {}),
                                borderRadius: 2,
                                padding: 0,
                                minHeight: 0,
                                overflow: 'hidden',
                                cursor: showEarningsRow && hasVal ? 'pointer' : 'default'
                              }}
                              className={cn(
                                'my-earnings-cell',
                                isOutside && 'my-earnings-cell-outside',
                                '!absolute !inset-0 !flex !h-full !w-full !max-h-full !max-w-full !min-h-0 !min-w-0 !box-border',
                                'overflow-hidden !p-0 !gap-1 !leading-none',
                                bgToneClass,
                                isToday && '!ring-1 !ring-primary !ring-inset',
                                showEarningsRow && hasVal && 'hover:brightness-95 transition-all'
                              )}
                            >
                              <span className="my-earnings-cell-num" style={{ fontSize: pcCellDayFontSize }}>
                                {isToday ? '今' : children}
                              </span>
                              {showEarningsRow && (
                                <FitText
                                  as="span"
                                  maxFontSize={pcEarningsMaxFontSize}
                                  minFontSize={pcEarningsMinFontSize}
                                  className={cn(
                                    'my-earnings-cell-earnings',
                                    earningsTone === 'up' && 'up',
                                    earningsTone === 'down' && 'down',
                                    earningsTone === 'zero' && 'my-earnings-cell-earnings-zero'
                                  )}
                                >
                                  {formatEarnings(hasVal ? val : 0, masked, activeDisplayMode === 'rate')}
                                </FitText>
                              )}
                            </CalendarDayButton>
                          );
                        }
                      }}
                    />
                  </>
                )}

                {viewTab === 'month' && (
                  <>
                    <div className="my-earnings-month-grid">
                      {monthTotalsForYear.map((total, idx) => {
                        const label = dayjs().month(idx).format('M月');
                        const monthStart = dayjs().year(cursorYear).month(idx).startOf('month');
                        const isFutureMonth = monthStart.isAfter(dayjs(), 'month');
                        return (
                          <div key={label} className="my-earnings-month-cell">
                            <div className="my-earnings-month-label">{label}</div>
                            {!isFutureMonth && (
                              <FitText
                                as="div"
                                maxFontSize={14}
                                minFontSize={10}
                                className={cn('my-earnings-month-value', earningsClass(total))}
                              >
                                {formatEarnings(total, masked)}
                              </FitText>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {viewTab === 'year' && (
                  <div className="my-earnings-year-list">
                    {yearTotals.length === 0 ? (
                      <p className="my-earnings-year-empty">暂无年度数据</p>
                    ) : (
                      yearTotals.map(([y, total]) => (
                        <div key={y} className="my-earnings-year-row">
                          <span className="my-earnings-year-label">{y}年</span>
                          <FitText
                            as="span"
                            maxFontSize={16}
                            minFontSize={11}
                            className={cn('my-earnings-year-amount', earningsClass(total))}
                          >
                            {formatEarnings(total, masked)}
                          </FitText>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}

        {isNumber(ytdRate) && (
          <div className="shrink-0 pt-2 pb-6">
            {isNumber(percentile) && percentile >= 0 ? (
              <div className="my-earnings-calendar-card my-earnings-rank-card relative overflow-hidden p-5 flex flex-col">
                <div className="my-earnings-rank-heading flex items-center gap-3.5 z-10">
                  <div className="w-11 h-11 rounded-full bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] flex items-center justify-center shrink-0">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-[var(--primary)]"
                    >
                      {/* Trophy cup body */}
                      <path
                        d="M8 4h8v6a4 4 0 0 1-8 0V4Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                      {/* Left handle */}
                      <path
                        d="M8 6H6a2 2 0 0 0 0 4h2"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Right handle */}
                      <path
                        d="M16 6h2a2 2 0 0 1 0 4h-2"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Stem */}
                      <path d="M12 14v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      {/* Base */}
                      <path d="M9 20h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <path
                        d="M12 17l-3 3h6l-3-3Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                        fill="none"
                      />
                      {/* Star on cup */}
                      <path
                        d="M12 6.5l.7 1.4 1.5.2-1.1 1.1.3 1.5L12 9.9l-1.4.8.3-1.5-1.1-1.1 1.5-.2L12 6.5Z"
                        fill="currentColor"
                        stroke="none"
                      />
                    </svg>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <div className="text-[13px] text-muted-foreground mb-0.5">
                      本年收益率
                      <span className={cn('mx-1 font-medium', earningsClass(ytdRate))}>
                        {formatEarnings(ytdRate, masked, true)}
                      </span>
                      超过了
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[26px] font-bold text-[var(--primary)] leading-none tracking-tight">
                        {percentile}%
                      </span>
                      <span className="text-[13px] text-muted-foreground ml-0.5">的基估宝用户</span>
                    </div>
                  </div>
                  <EarningsRankIllustration />
                </div>

                <div className="mt-5 relative z-10">
                  <div className="relative w-full h-[12px] rounded-full overflow-hidden bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] flex isolate">
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-[var(--primary)] transition-all duration-500"
                      style={{ width: `${percentile}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 right-0 bg-transparent transition-all duration-500"
                      style={{ width: `${100 - percentile}%` }}
                    />
                    {/* Slanted divider */}
                    {percentile > 0 && percentile < 100 && (
                      <div
                        className="absolute top-[-4px] bottom-[-4px] w-[6px] bg-background z-10 transition-all duration-500"
                        style={{
                          left: `calc(${percentile}% - 3px)`,
                          transform: 'skewX(-25deg)'
                        }}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-3 text-[13px]">
                    <span className="text-[var(--primary)] font-medium">低于你 {percentile}%</span>
                    <span className="text-muted-foreground font-medium">
                      高于你 {Number((100 - percentile).toFixed(2))}%
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[color-mix(in_srgb,var(--border)_50%,transparent)] text-[12px] text-muted-foreground/60 z-10 text-center">
                  统计区间: {dayjs().startOf('year').format('YYYY-MM-DD')} ~ {dayjs().format('YYYY-MM-DD')}
                </div>
              </div>
            ) : (
              <div className="my-earnings-calendar-card flex justify-center p-4 mt-2">
                <div className="text-center text-[14px] text-muted-foreground">
                  今年以来收益率{' '}
                  <span className={cn('font-medium', earningsClass(ytdRate))}>
                    {ytdRate > 0 ? '+' : ''}
                    {ytdRate}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const detailsContent = (
    <div className="flex-1 flex flex-col min-h-0 px-5 pb-5 pt-2">
      {selectedDateFunds.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground opacity-70">
          暂无收益明细
        </div>
      ) : (
        <div
          className="fund-history-table-wrapper flex-1 overflow-y-auto"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--card)'
          }}
        >
          <table
            className="fund-history-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              color: 'var(--text)'
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--table-row-alt-bg)',
                  boxShadow: '0 1px 0 0 var(--border)'
                }}
              >
                <th
                  style={{
                    padding: '8px 12px',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textAlign: 'left',
                    background: 'var(--table-row-alt-bg)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    borderTopLeftRadius: 'var(--radius)'
                  }}
                >
                  基金名称
                </th>
                <th
                  style={{
                    padding: '8px 12px',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textAlign: 'right',
                    background: 'var(--table-row-alt-bg)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }}
                >
                  收益金额
                </th>
                <th
                  style={{
                    padding: '8px 12px',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textAlign: 'right',
                    background: 'var(--table-row-alt-bg)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    borderTopRightRadius: 'var(--radius)'
                  }}
                >
                  收益率
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedDateFunds.map((item) => (
                <tr
                  key={item.code}
                  style={{ borderBottom: '1px solid var(--border)' }}
                  className="group hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <td style={{ padding: '8px 12px', textAlign: 'left', maxWidth: '140px' }}>
                    <div className="flex flex-col min-w-0">
                      <div className="text-[13px] font-medium text-[var(--text)] truncate">{item.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity duration-200">
                        {item.code}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <span
                      className={cn('text-[14px] font-semibold font-mono tracking-tight', earningsClass(item.earnings))}
                    >
                      {formatEarnings(item.earnings, masked)}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {isNumber(item.rate) ? (
                      <span className={cn('text-[13px] font-mono font-medium', earningsClass(item.rate))}>
                        {formatEarnings(item.rate, masked, true)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderDrawerTitle = () => {
    if (!selectedDate) return '收益明细';
    const dateStr = dayjs(selectedDate).format('YYYY-M-D');
    const total = earningsByDate.get(selectedDate);
    if (!total || !isNumber(total.amount)) return `${dateStr} 收益明细`;

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span>{dateStr} 收益明细</span>
        <span className={cn('text-[14px] font-mono font-medium', earningsClass(total.amount))}>
          {formatEarnings(total.amount, masked)}
          {isNumber(total.rate) ? `/${formatEarnings(total.rate, masked, true)}` : ''}
        </span>
      </div>
    );
  };

  const detailsDrawerMobile = (
    <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="bottom">
      <DrawerContent className="flex flex-col gap-0 p-0 bg-background/95 backdrop-blur-xl max-h-[88vh] rounded-t-[20px] pb-5">
        <DrawerHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 px-5 pb-3 pt-5 text-left border-b border-[var(--border)]">
          <DrawerTitle className="text-base font-semibold text-[var(--text)] flex-1 min-w-0">
            {renderDrawerTitle()}
          </DrawerTitle>
          <DrawerClose
            className="icon-button border-none bg-transparent p-1"
            style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
          >
            <CloseIcon width="20" height="20" />
          </DrawerClose>
        </DrawerHeader>
        {detailsContent}
      </DrawerContent>
    </Drawer>
  );

  const detailsDrawerPc =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {drawerOpen && (
              <motion.div
                key="my-earnings-details-drawer-overlay"
                className="pc-table-setting-overlay"
                role="dialog"
                aria-modal="true"
                aria-label="收益明细"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setDrawerOpen(false)}
                style={{ zIndex: 10001 }}
              >
                <motion.aside
                  className="pc-table-setting-drawer glass flex flex-col p-0"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 450, maxWidth: 'calc(100vw - 32px)' }}
                >
                  <div className="pc-table-setting-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span className="text-base font-semibold">{renderDrawerTitle()}</span>
                    </div>
                    <button
                      className="icon-button"
                      title="关闭"
                      onClick={() => setDrawerOpen(false)}
                      style={{ border: 'none', background: 'transparent' }}
                    >
                      <CloseIcon width="20" height="20" />
                    </button>
                  </div>
                  {detailsContent}
                </motion.aside>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null;

  const detailsDrawer = resolvedIsMobile ? detailsDrawerMobile : detailsDrawerPc;

  if (resolvedIsMobile) {
    return (
      <>
        <Drawer open={!!open} onOpenChange={onOpenChange}>
          <DrawerContent
            className={cn('my-earnings-drawer-content flex max-h-[96vh] flex-col gap-0 p-0')}
            defaultHeight="92vh"
            maxHeight="96vh"
            minHeight="44vh"
          >
            <DrawerHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-5 pb-3 pt-2 text-left">
              <DrawerTitle className="text-base font-semibold text-[var(--text)]">我的收益</DrawerTitle>
              <DrawerClose
                className="icon-button border-none bg-transparent p-1"
                style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
              >
                <CloseIcon width="20" height="20" />
              </DrawerClose>
            </DrawerHeader>
            {content}
          </DrawerContent>
        </Drawer>
        {detailsDrawer}
      </>
    );
  }

  return (
    <>
      <Dialog open={!!open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            'my-earnings-drawer-content flex max-h-[92vh] w-[min(650px,calc(100vw-24px))] flex-col gap-0 overflow-hidden p-0'
          )}
          onInteractOutside={(e) => {
            if (drawerOpen) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-5 pb-3 pt-4 text-left">
            <DialogTitle className="text-base font-semibold text-[var(--text)]">我的收益</DialogTitle>
            <DialogClose
              className="icon-button border-none bg-transparent p-1"
              style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
            >
              <CloseIcon width="20" height="20" />
            </DialogClose>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
      {detailsDrawer}
    </>
  );
}
