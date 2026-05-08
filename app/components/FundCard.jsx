'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { isNumber, isString } from 'lodash';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Stat, ConsecutiveTrendBadge } from './Common';
import FundTrendChart from './FundTrendChart';
import FundIntradayChart from './FundIntradayChart';
import FundDailyEarnings from './FundDailyEarnings';
import {
  ChevronIcon,
  SettingsIcon,
  StarIcon,
  SwitchIcon,
  TrashIcon,
  LinkIcon,
} from './Icons';
import { Badge } from '@/components/ui/badge';
import { getTagThemeBadgeProps } from './AddTagDialog';
import { cn } from '@/lib/utils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

const DEFAULT_TZ = 'Asia/Shanghai';
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

  const hasTime = /[T\s]\d{2}:\d{2}/.test(String(value));

  return hasTime ? d.format('MM-DD HH:mm') : d.format('MM-DD');
};

export default function FundCard({
  fund: f,
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
}) {
  const holding = holdings[f?.code];
  const profit = getHoldingProfit?.(f, holding) ?? null;
  const hasHoldings = f.holdingsIsLastQuarter && Array.isArray(f.holdings) && f.holdings.length > 0;
  // “我的收益”(每日收益)只依赖份额；成本价缺失也应可展示
  const hasHoldingShare =
    holding &&
    isNumber(holding.share) &&
    holding.share > 0;

  // 兼容旧逻辑：部分 UI 仍需要“持仓金额/成本”完整信息
  const hasHoldingAmount =
    !!profit &&
    holding &&
    isNumber(holding.share) &&
    holding.share > 0 &&
    isNumber(holding.cost) &&
    holding.cost > 0;

  const dailyEarningsSeries = useMemo(() => {
    if (!hasHoldingShare) return [];
    const list = fundDailyEarnings?.[f?.code];
    return Array.isArray(list) ? list : [];
  }, [fundDailyEarnings, f?.code, hasHoldingShare]);

  const displayDailyEarningsSeries = useMemo(() => {
    if (!hasHoldingShare) return [];
    return dailyEarningsSeries;
  }, [dailyEarningsSeries, hasHoldingShare]);

  const showFavoriteButton = currentTab === 'all' || currentTab === 'fav';
  const relatedSectorRaw = f?.relatedSector != null ? String(f.relatedSector).trim() : '';
  const relatedSectorQuoteName = f?.relatedSectorQuoteName != null
    ? String(f.relatedSectorQuoteName).trim()
    : '';
  const relatedSectorDisplay = relatedSectorQuoteName || relatedSectorRaw;
  const relatedSectorPctValue = f?.relatedSectorQuotePct == null ? null : Number(f.relatedSectorQuotePct);
  const hasRelatedSectorPct = relatedSectorPctValue != null && Number.isFinite(relatedSectorPctValue);
  const relatedSectorPctText = hasRelatedSectorPct
    ? `${relatedSectorPctValue > 0 ? '+' : ''}${relatedSectorPctValue.toFixed(2)}%`
    : '';

  const holdingLocked = (currentTab === 'all' || currentTab === 'fav') && isHoldingLinked;
  const holdingLinkedTitle = '持仓来自自定义分组汇总，点击选择分组后操作';

  const style = layoutMode === 'drawer' ? {
    border: 'none',
    boxShadow: 'none',
    paddingLeft: 0,
    paddingRight: 0,
    background: theme === 'light'  ? 'rgb(250,250,250)' : 'none',
  } : {};

  return (
    <motion.div
      className="glass card"
      style={{
        position: 'relative',
        zIndex: 1,
        ...style,
      }}
    >
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="title">
          {showFavoriteButton ? (
            <button
              className={`icon-button fav-button ${favorites?.has(f.code) ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(f.code);
              }}
              title={favorites?.has(f.code) ? '取消自选' : '添加自选'}
            >
              <StarIcon width="18" height="18" filled={favorites?.has(f.code)} />
            </button>
          ) : null}
          <div className="title-text">
            <span
              className="name-text"
              title={f.jzrq === todayStr ? '今日净值已更新' : ''}
            >
              {isHoldingLinked ? (
                <span
                  title="持仓来自自定义分组汇总"
                  aria-label="已关联持仓"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginRight: 6,
                    color: 'var(--primary)',
                    verticalAlign: 'middle',
                    position: 'relative',
                    bottom: 2,
                  }}
                >
                  <LinkIcon width="14" height="14" />
                </span>
              ) : null}
              <ConsecutiveTrendBadge trend={fundExtraData?.consecutiveTrend} />
              {f.name}
            </span>
            <span className="muted">
              #{f.code}
              {dcaPlans?.[f.code]?.enabled === true && <span className="dca-indicator">定</span>}
              {f.jzrq === todayStr && <span className="updated-indicator">✓</span>}
              {fundTags.length > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    flexWrap: 'wrap',
                    gap: 2,
                    marginLeft: 4,
                    verticalAlign: 'middle',
                  }}
                >
                  {fundTags.map((raw, idx) => {
                    const item =
                      raw && typeof raw === 'object' && raw.name != null
                        ? {
                            name: String(raw.name).trim(),
                            theme: String(raw.theme ?? 'default').trim() || 'default',
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

        <div className="actions">
          <div className="badge-v">
            <span>{f.noValuation ? '净值日期' : '估值时间'}</span>
            <strong>
              {f.noValuation
                ? formatDisplayDate(f.jzrq)
                : formatDisplayDate(f.gztime || f.time)}
            </strong>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button
              className="icon-button danger"
              onClick={() => onRemoveFund?.(f)}
              title="删除"
              style={{
                width: '28px',
                height: '28px',
                opacity: 1,
                cursor: 'pointer',
              }}
            >
              <TrashIcon width="14" height="14" />
            </button>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <Stat label="单位净值" value={f.dwjz ?? '—'} />
        {f.noValuation ? (
          <Stat
            label="涨跌幅"
            value={
              f.zzl !== undefined && f.zzl !== null
                ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%`
                : '—'
            }
            delta={f.zzl}
          />
        ) : (
          <>
            {(() => {
              const hasTodayData = f.jzrq === todayStr;
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
              const shouldHideChange =
                isTradingDay && !hasTodayData && !isYesterdayChange && !isPreviousTradingDay;

              if (shouldHideChange) return null;

              const changeLabel = hasTodayData ? '涨跌幅' : '最新涨幅';
              return (
                <Stat
                  label={changeLabel}
                  value={
                    f.zzl !== undefined
                      ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%`
                      : ''
                  }
                  delta={f.zzl}
                />
              );
            })()}
            <Stat
              label="估值净值"
              value={
                f.estPricedCoverage > 0.05 ? f.estGsz.toFixed(4) : (f.gsz ?? '—')
              }
            />
            <Stat
              label="估算涨幅"
              value={
                f.estPricedCoverage > 0.05
                  ? `${f.estGszzl > 0 ? '+' : ''}${f.estGszzl.toFixed(2)}%`
                  : isNumber(f.gszzl)
                    ? `${f.gszzl > 0 ? '+' : ''}${f.gszzl.toFixed(2)}%`
                    : f.gszzl ?? '—'
              }
              delta={f.estPricedCoverage > 0.05 ? f.estGszzl : Number(f.gszzl) || 0}
            />
          </>
        )}
      </div>

      {(relatedSectorDisplay || hasRelatedSectorPct) && (
        <div className="row" style={{ marginBottom: 12 }}>
          {relatedSectorDisplay ? (
            <div className="stat" style={{ flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span className="label">关联板块</span>
              <span
                className="value"
                title={relatedSectorDisplay}
                style={{
                  fontSize: '15px',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {relatedSectorDisplay}
              </span>
            </div>
          ) : null}
          {hasRelatedSectorPct ? (
            <Stat
              label="关联涨幅"
              value={relatedSectorPctText}
              delta={relatedSectorPctValue}
            />
          ) : null}
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        {!profit ? (
          <div
            className="stat"
            style={{ flexDirection: 'column', gap: 4 }}
          >
            <span className="label">持仓金额</span>
            <div
              className="value muted"
              style={{
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
              title={holdingLocked ? holdingLinkedTitle : '设置持仓'}
              onClick={() => {
                onHoldingClick?.(f);
              }}
            >
              未设置 <SettingsIcon width="12" height="12" />
            </div>
          </div>
        ) : (
          <>
            <div
              className="stat"
              style={{
                cursor: 'pointer',
                flexDirection: 'column',
                gap: 4,
              }}
              title={holdingLocked ? holdingLinkedTitle : '点击设置持仓'}
              onClick={() => {
                onActionClick?.(f);
              }}
            >
              <span
                className="label"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                持仓金额 <SettingsIcon width="12" height="12" style={{ opacity: 0.7 }} />
              </span>
              <span className="value">
                {masked ? '******' : `${Number(profit.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
            {holding?.firstPurchaseDate && !masked && (() => {
              const today = dayjs.tz(todayStr, TZ);
              const purchaseDate = dayjs.tz(holding.firstPurchaseDate, TZ);
              if (!purchaseDate.isValid()) return null;
              const days = today.diff(purchaseDate, 'day');
              return (
                <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                  <span className="label">持有天数</span>
                  <span className="value">
                    {days}天
                  </span>
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
                gap: 4,
              }}
              title={profit.profitToday != null ? '点击切换金额/百分比' : ''}
            >
              <span
                className="label"
                style={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                当日收益{todayPercentModes?.[f.code] ? '(%)' : ''}
                {profit.profitToday != null && <SwitchIcon />}
              </span>
              <span
                className={`value ${
                  profit.profitToday != null
                    ? profit.profitToday > 0
                      ? 'up'
                      : profit.profitToday < 0
                        ? 'down'
                        : ''
                    : 'muted'
                }`}
              >
                {profit.profitToday != null
                  ? masked
                    ? '******'
                    : <>
                        {profit.profitToday > 0 ? '+' : profit.profitToday < 0 ? '-' : ''}
                        {todayPercentModes?.[f.code]
                          ? `${Math.abs(
                              holding?.cost * holding?.share
                                ? (profit.profitToday / (holding.cost * holding.share)) * 100
                                : 0,
                            ).toFixed(2)}%`
                          : `${Math.abs(profit.profitToday).toFixed(2)}`}
                      </>
                  : '--'}
              </span>
            </div>
            {profit.profitTotal !== null && (
              <div
                className="stat"
                onClick={(e) => {
                  e.stopPropagation();
                  onPercentModeToggle?.(f.code);
                }}
                style={{ cursor: 'pointer', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}
                title="点击切换金额/百分比"
              >
                <span
                  className="label"
                  style={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}
                >
                  持有收益{percentModes?.[f.code] ? '(%)' : ''}
                  <SwitchIcon />
                </span>
                <span
                  className={`value ${
                    profit.profitTotal > 0 ? 'up' : profit.profitTotal < 0 ? 'down' : ''
                  }`}
                >
                  {masked
                    ? '******'
                    : <>
                        {profit.profitTotal > 0 ? '+' : profit.profitTotal < 0 ? '-' : ''}
                        {percentModes?.[f.code]
                          ? `${Math.abs(
                              holding?.cost * holding?.share
                                ? (profit.profitTotal / (holding.cost * holding.share)) * 100
                                : 0,
                            ).toFixed(2)}%`
                          : `${Math.abs(profit.profitTotal).toFixed(2)}`}
                      </>}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {f.estPricedCoverage > 0.05 && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--muted)',
            marginTop: -8,
            marginBottom: 10,
            textAlign: 'right',
          }}
        >
          基于 {Math.round(f.estPricedCoverage * 100)}% 持仓估算
        </div>
      )}

      {(() => {
        const showIntraday =
          Array.isArray(valuationSeries?.[f.code]) && valuationSeries[f.code].length >= 2;
        if (!showIntraday) return null;

        if (
          f.gztime &&
          toTz(todayStr).startOf('day').isAfter(toTz(f.gztime).startOf('day'))
        ) {
          return null;
        }

        if (
          f.jzrq &&
          f.gztime &&
          toTz(f.jzrq).startOf('day').isSameOrAfter(toTz(f.gztime).startOf('day'))
        ) {
          return null;
        }

        return (
          <FundIntradayChart
            key={`${f.code}-intraday-${theme}`}
            series={valuationSeries[f.code]}
            referenceNav={f.dwjz != null ? Number(f.dwjz) : undefined}
            theme={theme}
          />
        );
      })()}

      {layoutMode === 'drawer' ? (
        <Tabs
          defaultValue={hasHoldings ? 'holdings' : 'trend'}
          className="w-full"
        >
          <TabsList
            className={`w-full ${
              hasHoldings && hasHoldingAmount
                ? 'grid grid-cols-3'
                : hasHoldings || hasHoldingAmount
                  ? 'grid grid-cols-2'
                  : ''
            }`}
          >
            {hasHoldings && (
              <TabsTrigger value="holdings">前10重仓股票</TabsTrigger>
            )}
            <TabsTrigger value="trend">业绩走势</TabsTrigger>
            {hasHoldingAmount && (
              <TabsTrigger value="earnings">我的收益</TabsTrigger>
            )}
          </TabsList>
          {hasHoldings && (
            <TabsContent value="holdings" className="mt-3 outline-none">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: 4,
                }}
              >
                <span className="muted">涨跌幅 / 占比</span>
              </div>
              <div className="list">
                {f.holdings.map((h, idx) => (
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
              transactions={profit ? (transactions?.[f.code] || []) : []}
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
                        transform: collapsedCodes?.has(f.code)
                          ? 'rotate(-90deg)'
                          : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </div>
                  <span className="muted">涨跌幅 / 占比</span>
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
                    <div className="list">
                      {f.holdings.map((h, idx) => (
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
            transactions={profit ? (transactions?.[f.code] || []) : []}
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
                        transition: 'transform 0.2s ease',
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
