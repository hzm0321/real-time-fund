'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { throttle } from 'lodash';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import FitText from './FitText';
import FundCard from './FundCard';
import MobileSettingModal from './MobileSettingModal';
import { CloseIcon, ExitIcon, SettingsIcon, StarIcon } from './Icons';

const MOBILE_NON_FROZEN_COLUMN_IDS = [
  'yesterdayChangePercent',
  'estimateChangePercent',
  'totalChangePercent',
  'todayProfit',
  'holdingProfit',
  'latestNav',
  'estimateNav',
];
const MOBILE_COLUMN_HEADERS = {
  latestNav: '最新净值',
  estimateNav: '估算净值',
  yesterdayChangePercent: '昨日涨幅',
  estimateChangePercent: '估值涨幅',
  totalChangePercent: '估算收益',
  todayProfit: '当日收益',
  holdingProfit: '持有收益',
};

function SortableRow({ row, children, isTableDragging, disabled }) {
  const {
    attributes,
    listeners,
    transform,
    transition,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({ id: row.original.code, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, opacity: 0.8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : {}),
  };

  return (
    <motion.div
      ref={setNodeRef}
      className="table-row-wrapper"
      layout={isTableDragging ? undefined : 'position'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ ...style, position: 'relative' }}
      {...attributes}
    >
      {typeof children === 'function' ? children(setActivatorNodeRef, listeners) : children}
    </motion.div>
  );
}

/**
 * 移动端基金列表表格组件（基于 @tanstack/react-table，与 PcFundTable 相同数据结构）
 *
 * @param {Object} props - 与 PcFundTable 一致
 * @param {Array<Object>} props.data - 表格数据（与 pcFundTableData 同结构）
 * @param {(row: any) => void} [props.onRemoveFund] - 删除基金
 * @param {string} [props.currentTab] - 当前分组
 * @param {Set<string>} [props.favorites] - 自选集合
 * @param {(row: any) => void} [props.onToggleFavorite] - 添加/取消自选
 * @param {(row: any) => void} [props.onRemoveFromGroup] - 从当前分组移除
 * @param {(row: any, meta: { hasHolding: boolean }) => void} [props.onHoldingAmountClick] - 点击持仓金额
 * @param {boolean} [props.refreshing] - 是否刷新中
 * @param {string} [props.sortBy] - 排序方式，'default' 时长按行触发拖拽排序
 * @param {(oldIndex: number, newIndex: number) => void} [props.onReorder] - 拖拽排序回调
 * @param {(row: any) => Object} [props.getFundCardProps] - 给定行返回 FundCard 的 props；传入后点击基金名称将用底部弹框展示卡片视图
 */
export default function MobileFundTable({
  data = [],
  onRemoveFund,
  currentTab,
  favorites = new Set(),
  onToggleFavorite,
  onRemoveFromGroup,
  onHoldingAmountClick,
  onHoldingProfitClick, // 保留以兼容调用方，表格内已不再使用点击切换
  refreshing = false,
  sortBy = 'default',
  onReorder,
  onCustomSettingsChange,
  stickyTop = 0,
  getFundCardProps,
  blockDrawerClose = false,
  closeDrawerRef,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 400, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = useState(null);
  const ignoreNextDrawerCloseRef = useRef(false);

  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onRemoveFromGroupRef = useRef(onRemoveFromGroup);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);

  useEffect(() => {
    if (closeDrawerRef) {
      closeDrawerRef.current = () => setCardSheetRow(null);
      return () => { closeDrawerRef.current = null; };
    }
  }, [closeDrawerRef]);

  useEffect(() => {
    onToggleFavoriteRef.current = onToggleFavorite;
    onRemoveFromGroupRef.current = onRemoveFromGroup;
    onHoldingAmountClickRef.current = onHoldingAmountClick;
  }, [
    onToggleFavorite,
    onRemoveFromGroup,
    onHoldingAmountClick,
  ]);

  const handleDragStart = (e) => setActiveId(e.active.id);
  const handleDragCancel = () => setActiveId(null);
  const handleDragEnd = (e) => {
    const { active, over } = e;
    if (active && over && active.id !== over.id && onReorder) {
      const oldIndex = data.findIndex((item) => item.code === active.id);
      const newIndex = data.findIndex((item) => item.code === over.id);
      if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex);
    }
    setActiveId(null);
  };

  const groupKey = currentTab ?? 'all';

  const getCustomSettingsWithMigration = () => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object') return {};
      if (parsed.pcTableColumnOrder != null || parsed.pcTableColumnVisibility != null || parsed.pcTableColumns != null || parsed.mobileTableColumnOrder != null || parsed.mobileTableColumnVisibility != null) {
        const all = {
          ...(parsed.all && typeof parsed.all === 'object' ? parsed.all : {}),
          pcTableColumnOrder: parsed.pcTableColumnOrder,
          pcTableColumnVisibility: parsed.pcTableColumnVisibility,
          pcTableColumns: parsed.pcTableColumns,
          mobileTableColumnOrder: parsed.mobileTableColumnOrder,
          mobileTableColumnVisibility: parsed.mobileTableColumnVisibility,
        };
        delete parsed.pcTableColumnOrder;
        delete parsed.pcTableColumnVisibility;
        delete parsed.pcTableColumns;
        delete parsed.mobileTableColumnOrder;
        delete parsed.mobileTableColumnVisibility;
        parsed.all = all;
        window.localStorage.setItem('customSettings', JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return {};
    }
  };

  const getInitialMobileConfigByGroup = () => {
    const parsed = getCustomSettingsWithMigration();
    const byGroup = {};
    Object.keys(parsed).forEach((k) => {
      if (k === 'pcContainerWidth') return;
      const group = parsed[k];
      if (!group || typeof group !== 'object') return;
      const order = Array.isArray(group.mobileTableColumnOrder) && group.mobileTableColumnOrder.length > 0
        ? group.mobileTableColumnOrder
        : null;
      const visibility = group.mobileTableColumnVisibility && typeof group.mobileTableColumnVisibility === 'object'
        ? group.mobileTableColumnVisibility
        : null;
      byGroup[k] = {
        mobileTableColumnOrder: order ? (() => {
          const valid = order.filter((id) => MOBILE_NON_FROZEN_COLUMN_IDS.includes(id));
          const missing = MOBILE_NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
          return [...valid, ...missing];
        })() : null,
        mobileTableColumnVisibility: visibility,
        mobileShowFullFundName: group.mobileShowFullFundName === true,
      };
    });
    return byGroup;
  };

  const [configByGroup, setConfigByGroup] = useState(getInitialMobileConfigByGroup);

  const currentGroupMobile = configByGroup[groupKey];
  const showFullFundName = currentGroupMobile?.mobileShowFullFundName ?? false;
  const defaultOrder = [...MOBILE_NON_FROZEN_COLUMN_IDS];
  const defaultVisibility = (() => {
    const o = {};
    MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => { o[id] = true; });
    return o;
  })();

  const mobileColumnOrder = (() => {
    const order = currentGroupMobile?.mobileTableColumnOrder ?? defaultOrder;
    if (!Array.isArray(order) || order.length === 0) return [...MOBILE_NON_FROZEN_COLUMN_IDS];
    const valid = order.filter((id) => MOBILE_NON_FROZEN_COLUMN_IDS.includes(id));
    const missing = MOBILE_NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  })();
  const mobileColumnVisibility = (() => {
    const vis = currentGroupMobile?.mobileTableColumnVisibility ?? null;
    if (vis && typeof vis === 'object' && Object.keys(vis).length > 0) return vis;
    return defaultVisibility;
  })();

  const persistMobileGroupConfig = (updates) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      if (updates.mobileTableColumnOrder !== undefined) group.mobileTableColumnOrder = updates.mobileTableColumnOrder;
      if (updates.mobileTableColumnVisibility !== undefined) group.mobileTableColumnVisibility = updates.mobileTableColumnVisibility;
      parsed[groupKey] = group;
      window.localStorage.setItem('customSettings', JSON.stringify(parsed));
      setConfigByGroup((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], ...updates } }));
      onCustomSettingsChange?.();
    } catch {}
  };

  const setMobileColumnOrder = (nextOrderOrUpdater) => {
    const next = typeof nextOrderOrUpdater === 'function'
      ? nextOrderOrUpdater(mobileColumnOrder)
      : nextOrderOrUpdater;
    persistMobileGroupConfig({ mobileTableColumnOrder: next });
  };
  const setMobileColumnVisibility = (nextOrUpdater) => {
    const next = typeof nextOrUpdater === 'function'
      ? nextOrUpdater(mobileColumnVisibility)
      : nextOrUpdater;
    persistMobileGroupConfig({ mobileTableColumnVisibility: next });
  };

  const persistShowFullFundName = (show) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      group.mobileShowFullFundName = show;
      parsed[groupKey] = group;
      window.localStorage.setItem('customSettings', JSON.stringify(parsed));
      setConfigByGroup((prev) => ({
        ...prev,
        [groupKey]: { ...prev[groupKey], mobileShowFullFundName: show }
      }));
      onCustomSettingsChange?.();
    } catch {}
  };

  const handleToggleShowFullFundName = (show) => {
    persistShowFullFundName(show);
  };

  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [cardSheetRow, setCardSheetRow] = useState(null);
  const tableContainerRef = useRef(null);
  const portalHeaderRef = useRef(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showPortalHeader, setShowPortalHeader] = useState(false);
  const [effectiveStickyTop, setEffectiveStickyTop] = useState(stickyTop);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const updateWidth = () => setTableContainerWidth(el.clientWidth || 0);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const getEffectiveStickyTop = () => {
      const stickySummaryCard = document.querySelector('.group-summary-sticky .group-summary-card');
      if (!stickySummaryCard) return stickyTop;

      const stickySummaryWrapper = stickySummaryCard.closest('.group-summary-sticky');
      if (!stickySummaryWrapper) return stickyTop;

      const wrapperRect = stickySummaryWrapper.getBoundingClientRect();
      const isSummaryStuck = wrapperRect.top <= stickyTop + 1;

      return isSummaryStuck ? stickyTop + stickySummaryWrapper.offsetHeight : stickyTop;
    };

    const updateVerticalState = () => {
      const nextStickyTop = getEffectiveStickyTop();
      setEffectiveStickyTop((prev) => (prev === nextStickyTop ? prev : nextStickyTop));

      const tableRect = tableContainerRef.current?.getBoundingClientRect();
      if (!tableRect) {
        setShowPortalHeader(window.scrollY >= nextStickyTop);
        return;
      }

      setShowPortalHeader(tableRect.top <= nextStickyTop);
    };

    const throttledVerticalUpdate = throttle(updateVerticalState, 1000/60, { leading: true, trailing: true });

    updateVerticalState();
    window.addEventListener('scroll', throttledVerticalUpdate, { passive: true });
    window.addEventListener('resize', throttledVerticalUpdate, { passive: true });
    return () => {
      window.removeEventListener('scroll', throttledVerticalUpdate);
      window.removeEventListener('resize', throttledVerticalUpdate);
      throttledVerticalUpdate.cancel();
    };
  }, [stickyTop]);

  useEffect(() => {
    const tableEl = tableContainerRef.current;
    if (!tableEl) return;

    const handleScroll = () => {
      setIsScrolled(tableEl.scrollLeft > 0);
    };

    handleScroll();
    tableEl.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      tableEl.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const tableEl = tableContainerRef.current;
    const portalEl = portalHeaderRef.current;
    if (!tableEl || !portalEl) return;

    const syncScrollToPortal = () => {
      portalEl.scrollLeft = tableEl.scrollLeft;
    };

    const syncScrollToTable = () => {
      tableEl.scrollLeft = portalEl.scrollLeft;
    };

    syncScrollToPortal();

    const handleTableScroll = () => syncScrollToPortal();
    const handlePortalScroll = () => syncScrollToTable();

    tableEl.addEventListener('scroll', handleTableScroll, { passive: true });

    return () => {
      tableEl.removeEventListener('scroll', handleTableScroll);
    };
  }, [showPortalHeader]);

  const NAME_CELL_WIDTH = 140;
  const GAP = 12;
  const LAST_COLUMN_EXTRA = 12;
  const FALLBACK_WIDTHS = {
    fundName: 140,
    latestNav: 64,
    estimateNav: 64,
    yesterdayChangePercent: 72,
    estimateChangePercent: 80,
    totalChangePercent: 80,
    todayProfit: 80,
    holdingProfit: 80,
  };

  const columnWidthMap = useMemo(() => {
    const visibleNonNameIds = mobileColumnOrder.filter((id) => mobileColumnVisibility[id] !== false);
    const nonNameCount = visibleNonNameIds.length;
    if (tableContainerWidth > 0 && nonNameCount > 0) {
      const gapTotal = nonNameCount >= 3 ? 3 * GAP : (nonNameCount) * GAP;
      const remaining = tableContainerWidth - NAME_CELL_WIDTH - gapTotal - LAST_COLUMN_EXTRA;
      const divisor = nonNameCount >= 3 ? 3 : nonNameCount;
      const otherColumnWidth = Math.max(48, Math.floor(remaining / divisor));
      const map = { fundName: NAME_CELL_WIDTH };
      MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
        map[id] = otherColumnWidth;
      });
      return map;
    }
    return { ...FALLBACK_WIDTHS };
  }, [tableContainerWidth, mobileColumnOrder, mobileColumnVisibility]);

  const handleResetMobileColumnOrder = () => {
    setMobileColumnOrder([...MOBILE_NON_FROZEN_COLUMN_IDS]);
  };
  const handleResetMobileColumnVisibility = () => {
    const allVisible = {};
    MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
      allVisible[id] = true;
    });
    setMobileColumnVisibility(allVisible);
  };
  const handleToggleMobileColumnVisibility = (columnId, visible) => {
    setMobileColumnVisibility((prev = {}) => ({ ...prev, [columnId]: visible }));
  };

  // 移动端名称列：无拖拽把手，长按整行触发排序；点击名称可打开底部卡片弹框（需传入 getFundCardProps）
  const MobileFundNameCell = ({ info, showFullFundName, onOpenCardSheet }) => {
    const original = info.row.original || {};
    const code = original.code;
    const isUpdated = original.isUpdated;
    const hasDca = original.hasDca;
    const hasHoldingAmount = original.holdingAmountValue != null;
    const holdingAmountDisplay = hasHoldingAmount ? (original.holdingAmount ?? '—') : null;
    const isFavorites = favorites?.has?.(code);
    const isGroupTab = currentTab && currentTab !== 'all' && currentTab !== 'fav';

    return (
      <div className="name-cell-content" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isGroupTab ? (
          <button
            className="icon-button fav-button"
            onClick={(e) => {
              e.stopPropagation?.();
              onRemoveFromGroupRef.current?.(original);
            }}
            title="从当前分组移除"
            style={{ backgroundColor: 'transparent'}}
          >
            <ExitIcon width="18" height="18" style={{ transform: 'rotate(180deg)' }} />
          </button>
        ) : (
          <button
            className={`icon-button fav-button ${isFavorites ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation?.();
              onToggleFavoriteRef.current?.(original);
            }}
            title={isFavorites ? '取消自选' : '添加自选'}
            style={{ backgroundColor: 'transparent'}}
          >
            <StarIcon width="18" height="18" filled={isFavorites} />
          </button>
        )}
        <div className="title-text">
          <span
            className={`name-text ${showFullFundName ? 'show-full' : ''}`}
            title={isUpdated ? '今日净值已更新' : onOpenCardSheet ? '点击查看卡片' : ''}
            role={onOpenCardSheet ? 'button' : undefined}
            tabIndex={onOpenCardSheet ? 0 : undefined}
            style={onOpenCardSheet ? { cursor: 'pointer' } : undefined}
            onClick={(e) => {
              if (onOpenCardSheet) {
                e.stopPropagation?.();
                onOpenCardSheet(original);
              }
            }}
            onKeyDown={(e) => {
              if (onOpenCardSheet && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onOpenCardSheet(original);
              }
            }}
          >
            {info.getValue() ?? '—'}
          </span>
          {holdingAmountDisplay ? (
            <span
              className="muted code-text"
              role="button"
              tabIndex={0}
              title="点击设置持仓"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation?.();
                onHoldingAmountClickRef.current?.(original, { hasHolding: true });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onHoldingAmountClickRef.current?.(original, { hasHolding: true });
                }
              }}
            >
              {holdingAmountDisplay}
              {hasDca && <span className="dca-indicator">定</span>}
              {isUpdated && <span className="updated-indicator">✓</span>}
            </span>
          ) : code ? (
            <span
              className="muted code-text"
              role="button"
              tabIndex={0}
              title="设置持仓"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation?.();
                onHoldingAmountClickRef.current?.(original, { hasHolding: false });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onHoldingAmountClickRef.current?.(original, { hasHolding: false });
                }
              }}
            >
              #{code}
              {hasDca && <span className="dca-indicator">定</span>}
              {isUpdated && <span className="updated-indicator">✓</span>}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'fundName',
        header: () => (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <span>基金名称</span>
            <button
              type="button"
              className="icon-button"
              onClick={(e) => {
                e.stopPropagation?.();
                setSettingModalOpen(true);
              }}
              title="个性化设置"
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
              }}
            >
              <SettingsIcon width="18" height="18" />
            </button>
          </div>
        ),
        cell: (info) => (
          <MobileFundNameCell
            info={info}
            showFullFundName={showFullFundName}
            onOpenCardSheet={getFundCardProps ? (row) => setCardSheetRow(row) : undefined}
          />
        ),
        meta: { align: 'left', cellClassName: 'name-cell', width: columnWidthMap.fundName },
      },
      {
        accessorKey: 'latestNav',
        header: '最新净值',
        cell: (info) => (
          <span style={{ display: 'block', width: '100%', fontWeight: 700 }}>
            <FitText maxFontSize={14} minFontSize={10}>
              {info.getValue() ?? '—'}
            </FitText>
          </span>
        ),
        meta: { align: 'right', cellClassName: 'value-cell', width: columnWidthMap.latestNav },
      },
      {
        accessorKey: 'estimateNav',
        header: '估算净值',
        cell: (info) => (
          <span style={{ display: 'block', width: '100%', fontWeight: 700 }}>
            <FitText maxFontSize={14} minFontSize={10}>
              {info.getValue() ?? '—'}
            </FitText>
          </span>
        ),
        meta: { align: 'right', cellClassName: 'value-cell', width: columnWidthMap.estimateNav },
      },
      {
        accessorKey: 'yesterdayChangePercent',
        header: '昨日涨幅',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.yesterdayChangeValue;
          const date = original.yesterdayDate ?? '-';
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span className={cls} style={{ fontWeight: 700 }}>
                {info.getValue() ?? '—'}
              </span>
              <span className="muted" style={{ fontSize: '10px' }}>{date}</span>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'change-cell', width: columnWidthMap.yesterdayChangePercent },
      },
      {
        accessorKey: 'estimateChangePercent',
        header: '估值涨幅',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateChangeValue;
          const isMuted = original.estimateChangeMuted;
          const time = original.estimateTime ?? '-';
          const displayTime = typeof time === 'string' && time.length > 5 ? time.slice(5) : time;
          const cls = isMuted ? 'muted' : value > 0 ? 'up' : value < 0 ? 'down' : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span className={cls} style={{ fontWeight: 700 }}>
                {info.getValue() ?? '—'}
              </span>
              <span className="muted" style={{ fontSize: '10px' }}>{displayTime}</span>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'est-change-cell', width: columnWidthMap.estimateChangePercent },
      },
      {
        accessorKey: 'totalChangePercent',
        header: '估算收益',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasProfit ? (original.estimateProfit ?? '') : '—';
          const percentStr = original.estimateProfitPercent ?? '';

          return (
            <div style={{ width: '100%' }}>
              <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 700 }}>
                <FitText maxFontSize={14} minFontSize={10}>
                  {amountStr}
                </FitText>
              </span>
              {percentStr ? (
                <span className={`${cls} estimate-profit-percent`} style={{ display: 'block', width: '100%', fontSize: '0.75em', opacity: 0.9, fontWeight: 500 }}>
                  <FitText maxFontSize={11} minFontSize={9}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'total-change-cell', width: columnWidthMap.totalChangePercent },
      },
      {
        accessorKey: 'todayProfit',
        header: '当日收益',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.todayProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasProfit ? (info.getValue() ?? '') : '—';
          const percentStr = original.todayProfitPercent ?? '';
          return (
            <div style={{ width: '100%' }}>
              <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 700 }}>
                <FitText maxFontSize={14} minFontSize={10}>
                  {amountStr}
                </FitText>
              </span>
              {percentStr ? (
                <span className={`${cls} today-profit-percent`} style={{ display: 'block', width: '100%', fontSize: '0.75em', opacity: 0.9, fontWeight: 500 }}>
                  <FitText maxFontSize={11} minFontSize={9}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'profit-cell', width: columnWidthMap.todayProfit },
      },
      {
        accessorKey: 'holdingProfit',
        header: '持有收益',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.holdingProfitValue;
          const hasTotal = value != null;
          const cls = hasTotal ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasTotal ? (info.getValue() ?? '') : '—';
          const percentStr = original.holdingProfitPercent ?? '';
          return (
            <div style={{ width: '100%' }}>
              <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 700 }}>
                <FitText maxFontSize={14} minFontSize={10}>
                  {amountStr}
                </FitText>
              </span>
              {percentStr ? (
                <span className={`${cls} holding-profit-percent`} style={{ display: 'block', width: '100%', fontSize: '0.75em', opacity: 0.9, fontWeight: 500 }}>
                  <FitText maxFontSize={11} minFontSize={9}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'holding-cell', width: columnWidthMap.holdingProfit },
      },
    ],
    [currentTab, favorites, refreshing, columnWidthMap, showFullFundName, getFundCardProps]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnOrder: ['fundName', ...mobileColumnOrder],
      columnVisibility: { fundName: true, ...mobileColumnVisibility },
    },
    onColumnOrderChange: (updater) => {
      const next = typeof updater === 'function' ? updater(['fundName', ...mobileColumnOrder]) : updater;
      const newNonFrozen = next.filter((id) => id !== 'fundName');
      if (newNonFrozen.length) {
        setMobileColumnOrder(newNonFrozen);
      }
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ fundName: true, ...mobileColumnVisibility }) : updater;
      const rest = { ...next };
      delete rest.fundName;
      setMobileColumnVisibility(rest);
    },
    initialState: {
      columnPinning: {
        left: ['fundName'],
      },
    },
    defaultColumn: {
      cell: (info) => info.getValue() ?? '—',
    },
  });

  const headerGroup = table.getHeaderGroups()[0];

  const snapPositionsRef = useRef([]);
  const scrollEndTimerRef = useRef(null);

  useEffect(() => {
    if (!headerGroup?.headers?.length) {
      snapPositionsRef.current = [];
      return;
    }
    const gap = 12;
    const widths = headerGroup.headers.map((h) => h.column.columnDef.meta?.width ?? 80);
    if (widths.length > 0) widths[widths.length - 1] += LAST_COLUMN_EXTRA;
    const positions = [0];
    let acc = 0;
    // 从第二列开始累加，因为第一列是固定的，滚动是为了让后续列贴合到第一列右侧
    // 累加的是"被滚出去"的非固定列的宽度
    for (let i = 1; i < widths.length - 1; i++) {
      acc += widths[i] + gap;
      positions.push(acc);
    }
    snapPositionsRef.current = positions;
  }, [headerGroup?.headers?.length, columnWidthMap, mobileColumnOrder]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el || snapPositionsRef.current.length === 0) return;

    const snapToNearest = () => {
      const positions = snapPositionsRef.current;
      if (positions.length === 0) return;
      const scrollLeft = el.scrollLeft;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;
      const nearest = positions.reduce((prev, curr) =>
        Math.abs(curr - scrollLeft) < Math.abs(prev - scrollLeft) ? curr : prev
      );
      const clamped = Math.max(0, Math.min(maxScroll, nearest));
      if (Math.abs(clamped - scrollLeft) > 2) {
        el.scrollTo({ left: clamped, behavior: 'smooth' });
      }
    };

    const handleScroll = () => {
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(snapToNearest, 120);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    };
  }, []);

  const mobileGridLayout = (() => {
    if (!headerGroup?.headers?.length) return { gridTemplateColumns: '', minWidth: undefined };
    const gap = 12;
    const widths = headerGroup.headers.map((h) => h.column.columnDef.meta?.width ?? 80);
    if (widths.length > 0) widths[widths.length - 1] += LAST_COLUMN_EXTRA;
    return {
      gridTemplateColumns: widths.map((w) => `${w}px`).join(' '),
      minWidth: widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * gap,
    };
  })();

  const getPinClass = (columnId, isHeader) => {
    if (columnId === 'fundName') {
      const baseClass = isHeader ? 'table-header-cell-pin-left' : 'table-cell-pin-left';
      const scrolledClass = isScrolled ? 'is-scrolled' : '';
      return `${baseClass} ${scrolledClass}`.trim();
    }
    return '';
  };

  const getAlignClass = (columnId) => {
    if (columnId === 'fundName') return '';
    if (['latestNav', 'estimateNav', 'yesterdayChangePercent', 'estimateChangePercent', 'totalChangePercent', 'todayProfit', 'holdingProfit'].includes(columnId)) return 'text-right';
    return 'text-right';
  };

  const renderTableHeader = ()=>{
    if(!headerGroup) return null;
    return (
      <div
        className="table-header-row mobile-fund-table-header"
        style={mobileGridLayout.gridTemplateColumns ? { gridTemplateColumns: mobileGridLayout.gridTemplateColumns } : undefined}
      >
        {headerGroup.headers.map((header, headerIndex) => {
          const columnId = header.column.id;
          const pinClass = getPinClass(columnId, true);
          const alignClass = getAlignClass(columnId);
          const isLastColumn = headerIndex === headerGroup.headers.length - 1;
          return (
            <div
              key={header.id}
              className={`table-header-cell ${alignClass} ${pinClass}`}
              style={isLastColumn ? { paddingRight: LAST_COLUMN_EXTRA } : undefined}
            >
              {header.isPlaceholder
                ? null
                : flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          );
        })}
      </div>
    )
  }

  const renderContent = (onlyShowHeader) => {
    if (onlyShowHeader) {
      return (
        <div style={{position: 'fixed', top: effectiveStickyTop}} className="mobile-fund-table mobile-fund-table-portal-header" ref={portalHeaderRef}>
          <div
            className="mobile-fund-table-scroll"
            style={mobileGridLayout.minWidth != null ? { minWidth: mobileGridLayout.minWidth } : undefined}
          >
            {renderTableHeader()}
          </div>
        </div>
      );
    }

    return (
      <div className="mobile-fund-table" ref={tableContainerRef}>
        <div
          className="mobile-fund-table-scroll"
          style={mobileGridLayout.minWidth != null ? { minWidth: mobileGridLayout.minWidth } : undefined}
        >
          {renderTableHeader()}

          {!onlyShowHeader && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext
                items={data.map((item) => item.code)}
                strategy={verticalListSortingStrategy}
              >
                <AnimatePresence mode="popLayout">
                  {table.getRowModel().rows.map((row) => (
                    <SortableRow
                      key={row.original.code || row.id}
                      row={row}
                      isTableDragging={!!activeId}
                      disabled={sortBy !== 'default'}
                    >
                      {(setActivatorNodeRef, listeners) => (
                        <div
                          ref={sortBy === 'default' ? setActivatorNodeRef : undefined}
                          className="table-row"
                          style={{
                            background: 'var(--bg)',
                            position: 'relative',
                            zIndex: 1,
                            ...(mobileGridLayout.gridTemplateColumns ? { gridTemplateColumns: mobileGridLayout.gridTemplateColumns } : {}),
                          }}
                          {...(sortBy === 'default' ? listeners : {})}
                        >
                          {row.getVisibleCells().map((cell, cellIndex) => {
                            const columnId = cell.column.id;
                            const pinClass = getPinClass(columnId, false);
                            const alignClass = getAlignClass(columnId);
                            const cellClassName = cell.column.columnDef.meta?.cellClassName || '';
                            const isLastColumn = cellIndex === row.getVisibleCells().length - 1;
                            return (
                              <div
                                key={cell.id}
                                className={`table-cell ${alignClass} ${cellClassName} ${pinClass}`}
                                style={isLastColumn ? { paddingRight: LAST_COLUMN_EXTRA } : undefined}
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </SortableRow>
                  ))}
                </AnimatePresence>
              </SortableContext>
            </DndContext>

          )}
        </div>

        {table.getRowModel().rows.length === 0 && !onlyShowHeader && (
          <div className="table-row empty-row">
            <div className="table-cell" style={{ textAlign: 'center' }}>
              <span className="muted">暂无数据</span>
            </div>
          </div>
        )}

        {!onlyShowHeader && (
          <MobileSettingModal
            open={settingModalOpen}
            onClose={() => setSettingModalOpen(false)}
            columns={mobileColumnOrder.map((id) => ({ id, header: MOBILE_COLUMN_HEADERS[id] ?? id }))}
            columnVisibility={mobileColumnVisibility}
            onColumnReorder={(newOrder) => {
              setMobileColumnOrder(newOrder);
            }}
            onToggleColumnVisibility={handleToggleMobileColumnVisibility}
            onResetColumnOrder={handleResetMobileColumnOrder}
            onResetColumnVisibility={handleResetMobileColumnVisibility}
            showFullFundName={showFullFundName}
            onToggleShowFullFundName={handleToggleShowFullFundName}
          />
        )}

        <Drawer
          open={!!(cardSheetRow && getFundCardProps)}
          onOpenChange={(open) => {
            if (!open) {
              if (ignoreNextDrawerCloseRef.current) {
                ignoreNextDrawerCloseRef.current = false;
                return;
              }
              if (!blockDrawerClose) setCardSheetRow(null);
            }
          }}
        >
          <DrawerContent
            className="h-[77vh] max-h-[88vh] mt-0 flex flex-col"
            onPointerDownOutside={(e) => {
              if (blockDrawerClose) return;
              if (e?.target?.closest?.('[data-slot="dialog-content"], [role="dialog"]')) {
                ignoreNextDrawerCloseRef.current = true;
                return;
              }
              setCardSheetRow(null);
            }}
          >
            <DrawerHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-5 pb-4 pt-2 text-left">
              <DrawerTitle className="text-base font-semibold text-[var(--text)]">
                基金详情
              </DrawerTitle>
              <DrawerClose asChild>
                <button
                  type="button"
                  className="icon-button rounded-lg"
                  aria-label="关闭"
                  style={{ padding: 4, borderColor: 'transparent' }}
                >
                  <CloseIcon width="24" height="24" />
                </button>
              </DrawerClose>
            </DrawerHeader>
            <div
              className="flex-1 min-h-0 overflow-y-auto px-5 pb-8 pt-0"
              style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
            >
              {cardSheetRow && getFundCardProps ? (
                <FundCard {...getFundCardProps(cardSheetRow)} />
              ) : null}
            </div>
          </DrawerContent>
        </Drawer>

        {!onlyShowHeader && showPortalHeader && ReactDOM.createPortal(renderContent(true), document.body)}
      </div>
    );
  };

  return (
    <>
      {renderContent()}
    </>
  );
}
