'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { isArray, isNumber, isObject, isString } from 'lodash';
import { PlusCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn, formatMoney } from '@/lib/utils';
import { useStorageStore } from '@/app/stores';
import { fetchFundHoldings, fetchFundData } from '@/app/api/fund';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import { Stat, ConsecutiveTrendBadge } from '../Common';
import FundTrendChart from '../FundTrendChart';
import FundIntradayChart from '../FundIntradayChart';
import FundDailyEarnings from '../FundDailyEarnings';
import { ChevronIcon, SettingsIcon, StarIcon, SwitchIcon, TrashIcon, LinkIcon } from '../Icons';
import { getTagThemeBadgeProps } from '../AddTagDialog';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

import { DEFAULT_TZ } from '@/app/constants';
import { isNavUpdated } from '@/app/lib/fundHelpers';
const getBrowserTimeZone = () => {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || DEFAULT_TZ;
  }
  return DEFAULT_TZ;
};
const TZ = getBrowserTimeZone();
const toTz = (input) => (input ? dayjs.tz(input, TZ) : dayjs().tz(TZ));

const formatDisplayDate = (value) => {
  if (!value) return '-';

  const d = toTz(value);
  if (!d.isValid()) return value;

  // 如果是数字（时间戳）或者字符串中包含显式的时间模式，则展示时分
  const isTimestamp = isNumber(value) || (isString(value) && /^\d{10,13}$/.test(value));
  const hasTimePattern = /[T\s]\d{1,2}:\d{2}/.test(String(value));
  const showTime = isTimestamp || hasTimePattern;

  return showTime ? d.format('MM-DD HH:mm') : d.format('MM-DD');
};

/** 格式化阶段涨跌幅 */
const fmtPeriodReturn = (val) => {
  if (val == null || !Number.isFinite(val)) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
};

function MoreSection({
  holding,
  profit,
  hasHoldingAmount,
  fundExtraData,
  masked,
  groupTotalHoldingAmount,
  isAdded = true
}) {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();

  // 是否有阶段涨跌数据
  const hasPeriodData =
    fundExtraData &&
    (fundExtraData.week != null ||
      fundExtraData.month != null ||
      fundExtraData.month3 != null ||
      fundExtraData.month6 != null ||
      fundExtraData.year1 != null);

  // 只要有阶段涨跌或持仓数据，就展示"更多"按钮
  if (!hasPeriodData && !hasHoldingAmount) return null;

  const costNavValue = holding && isNumber(holding.cost) ? holding.cost : null;
  const costNav = costNavValue == null ? '—' : Number(costNavValue).toFixed(4);

  const holdingCostValue =
    holding && isNumber(holding.cost) && isNumber(holding.share) ? holding.cost * holding.share : null;
  const holdingCost = holdingCostValue == null ? '—' : `¥${formatMoney(holdingCostValue)}`;

  const holdingAmount = profit?.amount;
  const holdingRatioValue =
    holdingAmount != null && Number.isFinite(holdingAmount) && holdingAmount > 0 && groupTotalHoldingAmount > 0
      ? holdingAmount / groupTotalHoldingAmount
      : null;
  const holdingRatio = holdingRatioValue != null ? `${(holdingRatioValue * 100).toFixed(2)}%` : '—';

  const content = (
    <>
      {hasHoldingAmount && (
        <div className="row" style={{ marginBottom: 10 }}>
          <Stat label="成本净值" value={masked ? '******' : costNav} />
          <Stat label="持仓成本" value={masked ? '******' : holdingCost} />
          <Stat label="持仓占比" value={masked ? '******' : holdingRatio} />
        </div>
      )}
      {hasPeriodData && (
        <div className="row" style={{ marginBottom: 10 }}>
          <Stat label="近1周" value={fmtPeriodReturn(fundExtraData.week)} delta={fundExtraData.week} />
          <Stat label="近1月" value={fmtPeriodReturn(fundExtraData.month)} delta={fundExtraData.month} />
          <Stat label="近3月" value={fmtPeriodReturn(fundExtraData.month3)} delta={fundExtraData.month3} />
          <Stat label="近6月" value={fmtPeriodReturn(fundExtraData.month6)} delta={fundExtraData.month6} />
          {!isMobile && <Stat label="近1年" value={fmtPeriodReturn(fundExtraData.year1)} delta={fundExtraData.year1} />}
        </div>
      )}
    </>
  );

  if (!isAdded) {
    return <div style={{ marginTop: 12 }}>{content}</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0 12px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border, rgba(255,255,255,0.08))' }} />
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '0 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            fontSize: '12px',
            transition: 'color 0.2s ease'
          }}
        >
          <span>{expanded ? '收起' : '更多'}</span>
          <ChevronIcon
            width="14"
            height="14"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s ease'
            }}
          />
        </button>
        <div style={{ flex: 1, height: '1px', background: 'var(--border, rgba(255,255,255,0.08))' }} />
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function Index({
  fundCode,
  isHoldingLinked = false,
  todayStr,
  currentTab,
  favorites,
  dcaPlans,
  holdings,
  fundDailyEarnings,
  percentModes,
  todayPercentModes,
  valuationSeries,
  collapsedCodes,
  collapsedTrends,
  collapsedEarnings,
  transactions,
  theme,
  isTradingDay,
  getHoldingProfit,
  onToggleFavorite,
  onRemoveFund,
  onHoldingClick,
  onActionClick,
  onPercentModeToggle,
  onTodayPercentModeToggle,
  onToggleCollapse,
  onToggleTrendCollapse,
  onToggleEarningsCollapse,
  layoutMode = 'card', // 'card' | 'drawer'，drawer 时前10重仓与业绩走势以 Tabs 展示
  masked = false,
  fundTags = [],
  onFundTagsClick,
  fundExtraData,
  onDataSourceClick,
  groupTotalHoldingAmount = 0,
  fallbackFund,
  hasPending = false,
  onAddFund
}) {
  const { funds, refreshMs } = useStorageStore();

  const [fetchedValuation, setFetchedValuation] = useState(null);

  const f = useMemo(() => {
    const found = funds?.find((item) => item.code === fundCode);
    if (found) return found;

    let ds = fallbackFund?.dataSource || 1;
    if (typeof window !== 'undefined') {
      try {
        const saved = JSON.parse(localStorage.getItem('rtf_unadded_ds') || '{}');
        if (saved[fundCode]) {
          ds = saved[fundCode];
        }
      } catch (e) {}
    }

    if (fetchedValuation) return { ...fallbackFund, dataSource: ds, ...fetchedValuation };
    return { ...fallbackFund, dataSource: ds };
  }, [funds, fundCode, fallbackFund, fetchedValuation]);

  const isAdded = useMemo(() => funds?.some((item) => item.code === f?.code), [funds, f?.code]);

  const [topHoldings, setTopHoldings] = useState({
    holdings: [],
    holdingsReportDate: null,
    holdingsIsLastQuarter: false
  });

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.fundCode === fundCode) {
        const sourceId = e.detail.sourceId;
        setFetchedValuation((prev) => ({
          ...(prev || {}),
          dataSource: sourceId,
          gsz: null,
          gszzl: null,
          gztime: null,
          valuationSource: null,
          noValuation: false
        }));

        // Fetch immediately using the new data source
        fetchFundData(fundCode, sourceId)
          .then((res) => {
            if (res) {
              setFetchedValuation((prev) => ({ ...prev, ...res, dataSource: sourceId }));
            }
          })
          .catch((err) => {
            console.error('fetchFundData error on ds change', err);
          });
      }
    };
    window.addEventListener('rtf_unadded_datasource_change', handler);
    return () => window.removeEventListener('rtf_unadded_datasource_change', handler);
  }, [fundCode]);

  useEffect(() => {
    if (!isAdded) {
      let cancelled = false;
      const fetchValuation = async () => {
        try {
          const res = await fetchFundData(fundCode, f?.dataSource);
          if (!cancelled && res) {
            setFetchedValuation((prev) => ({ ...prev, ...res, dataSource: f?.dataSource || 1 }));
          }
        } catch (e) {
          console.error('fetchFundData error', e);
        }
      };
      fetchValuation();
      return () => {
        cancelled = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdded, fundCode]);

  useEffect(() => {
    let timer;
    let cancelled = false;
    const fetchHoldings = async () => {
      try {
        const res = await fetchFundHoldings(fundCode);
        if (!cancelled) {
          setTopHoldings(res);
        }
      } catch (e) {
        console.error('fetchFundHoldings error', e);
      }
    };
    fetchHoldings();
    const tick = () => {
      timer = setTimeout(() => {
        if (!cancelled) {
          fetchHoldings().finally(tick);
        }
      }, refreshMs || 30000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fundCode, refreshMs]);

  const top10WeightSum = useMemo(() => {
    if (!isArray(topHoldings.holdings)) return 0;
    let sum = 0;
    topHoldings.holdings.forEach((h) => {
      if (h.weight) {
        const val = parseFloat(h.weight);
        if (!isNaN(val)) sum += val;
      }
    });
    return sum;
  }, [topHoldings.holdings]);

  const holding = holdings?.[f?.code];
  const profit = getHoldingProfit?.(f, holding) ?? null;
  const hasHoldings =
    topHoldings.holdingsIsLastQuarter && isArray(topHoldings.holdings) && topHoldings.holdings.length > 0;
  // “我的收益”(每日收益)只依赖份额；成本价缺失也应可展示
  const hasHoldingShare = holding && isNumber(holding.share) && holding.share > 0;

  // 兼容旧逻辑：部分 UI 仍需要“持仓金额/成本”完整信息
  const hasHoldingAmount =
    !!profit && holding && isNumber(holding.share) && holding.share > 0 && isNumber(holding.cost) && holding.cost > 0;

  const dailyEarningsSeries = useMemo(() => {
    if (!hasHoldingShare) return [];
    const list = fundDailyEarnings?.[f?.code];
    return isArray(list) ? list : [];
  }, [fundDailyEarnings, f?.code, hasHoldingShare]);

  const displayDailyEarningsSeries = useMemo(() => {
    if (!hasHoldingShare) return [];
    return dailyEarningsSeries;
  }, [dailyEarningsSeries, hasHoldingShare]);

  if (!f) return null;

  const showFavoriteButton = currentTab === 'all' || currentTab === 'fav';
  const relatedSectorRaw = f?.relatedSector != null ? String(f.relatedSector).trim() : '';
  const relatedSectorQuoteName = f?.relatedSectorQuoteName != null ? String(f.relatedSectorQuoteName).trim() : '';
  const relatedSectorDisplay = relatedSectorQuoteName || relatedSectorRaw;
  const relatedSectorPctValue = f?.relatedSectorQuotePct == null ? null : Number(f.relatedSectorQuotePct);
  const hasRelatedSectorPct = relatedSectorPctValue != null && Number.isFinite(relatedSectorPctValue);
  const relatedSectorPctText = hasRelatedSectorPct
    ? `${relatedSectorPctValue > 0 ? '+' : ''}${relatedSectorPctValue.toFixed(2)}%`
    : '';

  const holdingLocked = (currentTab === 'all' || currentTab === 'fav') && isHoldingLinked;
  const holdingLinkedTitle = '持仓来自自定义分组汇总，点击选择分组后操作';

  const style =
    layoutMode === 'drawer'
      ? {
          border: 'none',
          boxShadow: 'none',
          paddingLeft: 0,
          paddingRight: 0,
          background: theme === 'light' ? 'rgb(250,250,250)' : 'none'
        }
      : {};

  return (
    <motion.div
      className="glass card"
      style={{
        position: 'relative',
        zIndex: 1,
        ...style
      }}
    >
      <div
        className="row"
        style={{ marginBottom: 10, alignItems: 'center', flexWrap: 'nowrap', alignContent: 'center' }}
      >
        <div className="title" style={{ flex: '1 1 auto', minWidth: 0 }}>
          {!isAdded ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="icon-button fav-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddFund?.({ code: f.code, name: f.name });
                  }}
                  style={{ color: 'var(--muted-foreground)', opacity: 0.5, transition: 'all 0.2s' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.color = 'var(--primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.5';
                    e.currentTarget.style.color = 'var(--muted-foreground)';
                  }}
                >
                  <PlusCircle size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>添加到主页</p>
              </TooltipContent>
            </Tooltip>
          ) : showFavoriteButton ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`icon-button fav-button ${favorites?.has(f.code) ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite?.(f.code);
                  }}
                >
                  <StarIcon width="18" height="18" filled={favorites?.has(f.code)} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{favorites?.has(f.code) ? '取消自选' : '添加自选'}</p>
              </TooltipContent>
            </Tooltip>
          ) : null}
          <div className="title-text" style={{ minWidth: 0 }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="name-text">
                  {isHoldingLinked ? (
                    <Tooltip delayDuration={150}>
                      <TooltipTrigger asChild>
                        <span
                          aria-label="已关联持仓"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            marginRight: 6,
                            color: 'var(--primary)',
                            verticalAlign: 'middle',
                            position: 'relative',
                            bottom: 2
                          }}
                        >
                          <LinkIcon width="14" height="14" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>持仓来自自定义分组汇总</TooltipContent>
                    </Tooltip>
                  ) : null}
                  <ConsecutiveTrendBadge trend={fundExtraData?.consecutiveTrend} />
                  {f.name}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isNavUpdated(f.jzrq, todayStr, f.confirmDays) ? '今日净值已更新' : ''}</p>
              </TooltipContent>
            </Tooltip>
            <span className="muted">
              #{f.code}
              {hasPending && <span className="pending-indicator">待</span>}
              {dcaPlans?.[f.code]?.enabled === true && <span className="dca-indicator">定</span>}
              {isNavUpdated(f.jzrq, todayStr, f.confirmDays) && <span className="updated-indicator">✓</span>}
              {fundTags.length > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    flexWrap: 'wrap',
                    gap: 2,
                    marginLeft: 4,
                    verticalAlign: 'middle'
                  }}
                >
                  {fundTags.map((raw, idx) => {
                    const item =
                      raw && isObject(raw) && raw.name != null
                        ? {
                            name: String(raw.name).trim(),
                            theme: String(raw.theme ?? 'default').trim() || 'default'
                          }
                        : { name: String(raw).trim(), theme: 'default' };
                    if (!item.name) return null;
                    const { variant, className: themeCls } = getTagThemeBadgeProps(item.theme);
                    return (
                      <Badge
                        key={`${item.name}-${idx}`}
                        variant={variant}
                        className={cn('font-normal text-[11px]', themeCls)}
                        style={{ cursor: onFundTagsClick ? 'pointer' : 'default' }}
                        onClick={(e) => {
                          if (onFundTagsClick) {
                            e.stopPropagation?.();
                            onFundTagsClick(f, fundTags);
                          }
                        }}
                      >
                        {item.name}
                      </Badge>
                    );
                  })}
                </span>
              )}
            </span>
          </div>
        </div>

        <div
          className="actions"
          style={{ flex: '0 0 auto', flexWrap: 'nowrap', alignSelf: 'center', marginLeft: 'auto' }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="badge-v"
                style={{
                  cursor: 'pointer',
                  background: 'var(--primary-light, rgba(34, 211, 238, 0.1))',
                  color: 'var(--primary)'
                }}
                onClick={() => onDataSourceClick?.(f)}
              >
                <span>数据源</span>
                <strong>{f.dataSource || 1}</strong>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>点击切换估值数据源</p>
            </TooltipContent>
          </Tooltip>
          <div className="badge-v">
            <span>{f.noValuation ? '净值日期' : '估值时间'}</span>
            <strong>{f.noValuation ? formatDisplayDate(f.jzrq) : formatDisplayDate(f.gztime || f.time)}</strong>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="icon-button danger"
                  onClick={() => onRemoveFund?.(f)}
                  style={{
                    width: '28px',
                    height: '28px',
                    opacity: 1,
                    cursor: 'pointer'
                  }}
                >
                  <TrashIcon width="14" height="14" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>删除</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <Stat
          label="最新净值"
          value={f.dwjz != null && !isNaN(Number(f.dwjz)) ? Number(f.dwjz).toFixed(4) : (f.dwjz ?? '—')}
        />
        {f.noValuation ? (
          <Stat
            label="涨跌幅"
            value={f.zzl !== undefined && f.zzl !== null ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : '—'}
            delta={f.zzl}
          />
        ) : (
          <>
            {(() => {
              const hasTodayData = isNavUpdated(f.jzrq, todayStr, f.confirmDays);
              let isYesterdayChange = false;
              let isPreviousTradingDay = false;
              if (!hasTodayData && isString(f.jzrq)) {
                const today = toTz(todayStr).startOf('day');
                const jzDate = toTz(f.jzrq).startOf('day');
                const yesterday = today.clone().subtract(1, 'day');
                if (jzDate.isSame(yesterday, 'day')) {
                  isYesterdayChange = true;
                } else if (jzDate.isBefore(yesterday, 'day')) {
                  isPreviousTradingDay = true;
                }
              }
              const shouldHideChange = isTradingDay && !hasTodayData && !isYesterdayChange && !isPreviousTradingDay;

              if (shouldHideChange) return null;

              const changeLabel = hasTodayData ? '涨跌幅' : '最新涨幅';
              return (
                <Stat
                  label={changeLabel}
                  value={f.zzl !== undefined ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : ''}
                  delta={f.zzl}
                />
              );
            })()}
            <Stat
              label="估算净值"
              value={f.gsz != null && !isNaN(Number(f.gsz)) ? Number(f.gsz).toFixed(4) : (f.gsz ?? '—')}
            />
            <Stat
              label="估算涨幅"
              value={isNumber(f.gszzl) ? `${f.gszzl > 0 ? '+' : ''}${f.gszzl.toFixed(2)}%` : (f.gszzl ?? '—')}
              delta={Number(f.gszzl) || 0}
            />
          </>
        )}
      </div>

      {(relatedSectorDisplay || hasRelatedSectorPct) && (
        <div className="row" style={{ marginBottom: 12 }}>
          {relatedSectorDisplay ? (
            <div className="stat" style={{ flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span className="label">关联板块</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="value"
                    style={{
                      fontSize: '15px',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%'
                    }}
                  >
                    {relatedSectorDisplay}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{relatedSectorDisplay}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          {hasRelatedSectorPct ? (
            <Stat label="关联涨幅" value={relatedSectorPctText} delta={relatedSectorPctValue} />
          ) : null}
        </div>
      )}

      {isAdded && (
        <div className="row" style={{ marginBottom: 12 }}>
          {!profit ? (
            <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
              <span className="label">持仓金额</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="value muted"
                    style={{
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      onHoldingClick?.(f);
                    }}
                  >
                    未设置 <SettingsIcon width="12" height="12" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{holdingLocked ? holdingLinkedTitle : '编辑持仓'}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="stat"
                    style={{
                      cursor: 'pointer',
                      flexDirection: 'column',
                      gap: 4
                    }}
                    onClick={() => {
                      onActionClick?.(f);
                    }}
                  >
                    <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      持仓金额 <SettingsIcon width="12" height="12" style={{ opacity: 0.7 }} />
                    </span>
                    <span className="value">{masked ? '******' : `${formatMoney(profit.amount)}`}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{holdingLocked ? holdingLinkedTitle : '编辑持仓'}</p>
                </TooltipContent>
              </Tooltip>
              {holding?.firstPurchaseDate &&
                !masked &&
                (() => {
                  const today = dayjs.tz(todayStr, TZ);
                  const purchaseDate = dayjs.tz(holding.firstPurchaseDate, TZ);
                  if (!purchaseDate.isValid()) return null;
                  const days = today.diff(purchaseDate, 'day');
                  return (
                    <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                      <span className="label">持有天数</span>
                      <span className="value">{days}天</span>
                    </div>
                  );
                })()}
              <div
                className="stat"
                onClick={(e) => {
                  e.stopPropagation();
                  if (profit.profitToday != null) {
                    onTodayPercentModeToggle?.(f.code);
                  }
                }}
                style={{
                  cursor: profit.profitToday != null ? 'pointer' : 'default',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  当日收益{todayPercentModes?.[f.code] ? '(%)' : ''}
                  {profit.profitToday != null && <SwitchIcon />}
                </span>
                {profit.profitToday != null ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`value ${
                          masked ? '' : profit.profitToday > 0 ? 'up' : profit.profitToday < 0 ? 'down' : ''
                        }`}
                        style={{ display: 'inline-block' }}
                      >
                        {masked ? (
                          '******'
                        ) : (
                          <>
                            {profit.profitToday > 0 ? '+' : profit.profitToday < 0 ? '-' : ''}
                            {todayPercentModes?.[f.code]
                              ? `${Math.abs(
                                  holding?.cost * holding?.share
                                    ? (profit.profitToday / (holding.cost * holding.share)) * 100
                                    : 0
                                ).toFixed(2)}%`
                              : `${formatMoney(Math.abs(profit.profitToday))}`}
                          </>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>点击切换金额/百分比</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="value muted" style={{ display: 'inline-block' }}>
                    --
                  </span>
                )}
              </div>
              {profit.profitTotal !== null && (
                <div
                  className="stat"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPercentModeToggle?.(f.code);
                  }}
                  style={{ cursor: 'pointer', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}
                >
                  <span
                    className="label"
                    style={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}
                  >
                    持有收益{percentModes?.[f.code] ? '(%)' : ''}
                    <SwitchIcon />
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`value ${
                          masked ? '' : profit.profitTotal > 0 ? 'up' : profit.profitTotal < 0 ? 'down' : ''
                        }`}
                        style={{ display: 'inline-block' }}
                      >
                        {masked ? (
                          '******'
                        ) : (
                          <>
                            {profit.profitTotal > 0 ? '+' : profit.profitTotal < 0 ? '-' : ''}
                            {percentModes?.[f.code]
                              ? `${Math.abs(
                                  holding?.cost * holding?.share
                                    ? (profit.profitTotal / (holding.cost * holding.share)) * 100
                                    : 0
                                ).toFixed(2)}%`
                              : `${formatMoney(Math.abs(profit.profitTotal))}`}
                          </>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>点击切换金额/百分比</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 更多信息展开区 ── */}
      <MoreSection
        holding={holding}
        profit={profit}
        hasHoldingAmount={hasHoldingAmount}
        fundExtraData={fundExtraData}
        masked={masked}
        groupTotalHoldingAmount={groupTotalHoldingAmount}
        isAdded={isAdded}
      />

      {(() => {
        const currentSeries = f.fundValuationTimeseries?.[f.code] || valuationSeries?.[f.code];
        const showIntraday = !f.noValuation && isArray(currentSeries) && currentSeries.length >= 1;
        if (!showIntraday) return null;

        if (f.gztime && toTz(todayStr).startOf('day').isAfter(toTz(f.gztime).startOf('day'))) {
          return null;
        }

        if (f.jzrq && f.gztime && toTz(f.jzrq).startOf('day').isSameOrAfter(toTz(f.gztime).startOf('day'))) {
          return null;
        }

        // 以最新收盘净值为基准，与估算涨幅 gszzl 保持一致
        const dwjz = f.dwjz != null ? Number(f.dwjz) : null;
        return (
          <FundIntradayChart
            key={`${f.code}-intraday-${theme}`}
            series={currentSeries}
            referenceNav={dwjz != null && Number.isFinite(dwjz) ? dwjz : undefined}
            theme={theme}
            fundCode={f.code}
            valuationSource={f.valuationSource}
            gztime={f.gztime}
            todayStr={todayStr}
          />
        );
      })()}

      {layoutMode === 'drawer' ? (
        <Tabs defaultValue={hasHoldings ? 'holdings' : 'trend'} className="w-full">
          <TabsList className="w-full flex">
            {hasHoldings && <TabsTrigger value="holdings">前10重仓股票</TabsTrigger>}
            <TabsTrigger value="trend">业绩走势</TabsTrigger>
            {hasHoldingAmount && <TabsTrigger value="earnings">我的收益</TabsTrigger>}
          </TabsList>
          {hasHoldings && (
            <TabsContent value="holdings" className="mt-3 outline-none">
              {topHoldings.assetAllocation && topHoldings.assetAllocation.length > 0 && (
                <div className="row" style={{ marginBottom: 12 }}>
                  {topHoldings.assetAllocation.map((item, idx) => (
                    <Stat
                      key={idx}
                      label={item.name}
                      value={`${item.value.toFixed(2)}%`}
                      delta={item.name === '股票' ? 1 : undefined}
                    />
                  ))}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="muted">重仓股票：</span>
                  <span style={{ color: 'var(--foreground)' }}>{top10WeightSum.toFixed(2)}%</span>
                </div>
                <span className="muted">涨跌幅 / 占比</span>
              </div>
              <div className="list">
                {topHoldings.holdings.map((h, idx) => (
                  <div className="item" key={idx}>
                    <span className="name">{h.name}</span>
                    <div className="values">
                      {isNumber(h.change) && (
                        <span
                          className={`badge ${h.change > 0 ? 'up' : h.change < 0 ? 'down' : ''}`}
                          style={{ marginRight: 8 }}
                        >
                          {h.change > 0 ? '+' : ''}
                          {h.change.toFixed(2)}%
                        </span>
                      )}
                      <span className="weight">{h.weight}</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
          {hasHoldingAmount && (
            <TabsContent value="earnings" className="mt-3 outline-none">
              {displayDailyEarningsSeries.length > 0 ? (
                <FundDailyEarnings series={displayDailyEarningsSeries} theme={theme} masked={masked} />
              ) : (
                <Empty className="py-8 border-none bg-transparent">
                  <EmptyHeader>
                    <EmptyTitle>暂无收益数据</EmptyTitle>
                    <EmptyDescription>该基金暂无历史收益记录</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>
          )}
          <TabsContent value="trend" className="mt-3 outline-none">
            <FundTrendChart
              key={`${f.code}-${theme}`}
              code={f.code}
              isExpanded
              onToggleExpand={() => onToggleTrendCollapse?.(f.code)}
              // 未设置持仓金额时，不展示买入/卖出标记与标签
              transactions={profit ? transactions?.[f.code] || [] : []}
              theme={theme}
              hideHeader
            />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          {hasHoldings && (
            <>
              <div
                style={{ marginBottom: 8, cursor: 'pointer', userSelect: 'none' }}
                className="title"
                onClick={() => onToggleCollapse?.(f.code)}
              >
                <div className="row" style={{ width: '100%', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>前10重仓股票</span>
                    <ChevronIcon
                      width="16"
                      height="16"
                      className="muted"
                      style={{
                        transform: collapsedCodes?.has(f.code) ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}
                    />
                  </div>
                </div>
              </div>
              <AnimatePresence>
                {!collapsedCodes?.has(f.code) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    {topHoldings.assetAllocation && topHoldings.assetAllocation.length > 0 && (
                      <div className="row" style={{ marginBottom: 12, marginTop: 4 }}>
                        {topHoldings.assetAllocation.map((item, idx) => (
                          <Stat
                            key={idx}
                            label={item.name}
                            value={`${item.value.toFixed(2)}%`}
                            delta={item.name === '股票' ? 1 : undefined}
                          />
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="muted">重仓股票：</span>
                        <span style={{ color: 'var(--foreground)' }}>{top10WeightSum.toFixed(2)}%</span>
                      </div>
                      <span className="muted">涨跌幅 / 占比</span>
                    </div>
                    <div className="list">
                      {topHoldings.holdings.map((h, idx) => (
                        <div className="item" key={idx}>
                          <span className="name">{h.name}</span>
                          <div className="values">
                            {isNumber(h.change) && (
                              <span
                                className={`badge ${h.change > 0 ? 'up' : h.change < 0 ? 'down' : ''}`}
                                style={{ marginRight: 8 }}
                              >
                                {h.change > 0 ? '+' : ''}
                                {h.change.toFixed(2)}%
                              </span>
                            )}
                            <span className="weight">{h.weight}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
          <FundTrendChart
            key={`${f.code}-${theme}`}
            code={f.code}
            isExpanded={!collapsedTrends?.has(f.code)}
            onToggleExpand={() => onToggleTrendCollapse?.(f.code)}
            // 未设置持仓金额时，不展示买入/卖出标记与标签
            transactions={profit ? transactions?.[f.code] || [] : []}
            theme={theme}
          />
          {hasHoldingAmount && (
            <>
              <div
                style={{ marginTop: 10, marginBottom: 8, cursor: 'pointer', userSelect: 'none' }}
                className="title"
                onClick={() => onToggleEarningsCollapse?.(f.code)}
              >
                <div className="row" style={{ width: '100%', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>我的收益</span>
                    <ChevronIcon
                      width="16"
                      height="16"
                      className="muted"
                      style={{
                        transform: !collapsedEarnings?.has(f.code) ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.2s ease'
                      }}
                    />
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {dailyEarningsSeries.length > 0 ? `共 ${dailyEarningsSeries.length} 天` : '未记录'}
                  </span>
                </div>
              </div>
              <AnimatePresence>
                {!collapsedEarnings?.has(f.code) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    {displayDailyEarningsSeries.length > 0 ? (
                      <FundDailyEarnings series={displayDailyEarningsSeries} theme={theme} masked={masked} />
                    ) : (
                      <Empty className="py-6 border-none bg-transparent">
                        <EmptyHeader>
                          <EmptyTitle className="text-sm">暂无收益数据</EmptyTitle>
                          <EmptyDescription className="text-xs">该基金暂无历史收益记录</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
