'use client';

import ReactDOM from 'react-dom';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo
} from 'react';
import { isArray, isFunction, isObject, isString, throttle, debounce } from 'lodash';
import { AnimatePresence, motion } from 'framer-motion';
import { useModalStore } from '../stores';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Sparkles } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import PcTableSettingModal from './PcTableSettingModal';
import FundCard from './FundCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import {
  DragIcon,
  SettingsIcon,
  StarIcon,
  TrashIcon,
  ResetIcon,
  FolderPlusIcon,
  LinkIcon,
  PencilIcon,
  CloseIcon
} from './Icons';
import { ConsecutiveTrendBadge } from './Common';
import {
  fetchFundPeriodReturns,
  fetchRelatedSectorsBatch,
  fetchFundSecidsBatch,
  fetchEastmoneySectorQuotesBatch
} from '@/app/api/fund';
import { storageStore } from '../stores';
import { asyncPool } from '@/app/lib/asyncHelper';
import MoveGroupModal from './MoveGroupModal';
import { Badge } from '@/components/ui/badge';
import { getTagThemeBadgeProps } from '@/app/components/AddTagDialog';
import { cn } from '@/lib/utils';
import DataSourceAccuracyBadge from './DataSourceAccuracyBadge';
import { useDataSourceAccuracyLabels } from '@/app/hooks/useDataSourceAccuracyLabels';

const EditModeContext = createContext({ isEditMode: false, selectedCodes: null, toggleSelected: null });

const NON_FROZEN_COLUMN_IDS = [
  'dataSource',
  'relatedSector',
  'yesterdayChangePercent',
  'estimateChangePercent',
  'sinceAddedChangePercent',
  'todayProfit',
  'totalChangePercent',
  'yesterdayProfit',
  'holdingProfit',
  'latestNav',
  'holdingDays',
  'period1w',
  'period1m',
  'period3m',
  'period6m',
  'period1y',
  'holdingAmount',
  'holdingRatio',
  'holdingCost',
  'costNav',
  'estimateNav'
];

/** 已保存列显示偏好时，新增列默认隐藏；未保存时随「全展示」 */
const PC_COLUMNS_DEFAULT_HIDDEN_IF_PERSONALIZED = new Set([
  'dataSource',
  'holdingCost',
  'costNav',
  'sinceAddedChangePercent',
  'holdingRatio'
]);

const COLUMN_HEADERS = {
  dataSource: '数据源',
  relatedSector: '关联板块',
  period1w: '近1周',
  period1m: '近1月',
  period3m: '近3月',
  period6m: '近6月',
  period1y: '近1年',
  latestNav: '最新净值',
  estimateNav: '估算净值',
  yesterdayChangePercent: '最新涨幅',
  estimateChangePercent: '估算涨幅',
  sinceAddedChangePercent: '自添加来',
  totalChangePercent: '估算收益',
  holdingAmount: '持仓金额',
  holdingRatio: '持仓占比',
  holdingCost: '持仓成本',
  costNav: '成本净值',
  holdingDays: '持有天数',
  todayProfit: '当日收益',
  yesterdayProfit: '昨日收益',
  holdingProfit: '持有收益'
};

const SortableRowContext = createContext({
  setActivatorNodeRef: null,
  listeners: null,
  activatorProps: null
});

/** dnd-kit sortable 会给节点 tabIndex=0，拖拽聚焦时浏览器会把页面滚到该元素 */
function sortableRowA11yProps(attributes) {
  if (!attributes) return {};
  const { tabIndex: _ignored, ...rest } = attributes;
  return { ...rest, tabIndex: -1 };
}

function SortableRow({ row, children, disabled, enableAnimation = true }) {
  const { attributes, listeners, transform, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({
    id: row.original.code,
    disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    ...(isDragging
      ? { position: 'relative', zIndex: 9999, opacity: 0.8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }
      : {})
  };

  const contextValue = useMemo(
    () => ({
      setActivatorNodeRef,
      listeners,
      activatorProps: sortableRowA11yProps(attributes)
    }),
    [setActivatorNodeRef, listeners, attributes]
  );

  return (
    <SortableRowContext.Provider value={contextValue}>
      {enableAnimation ? (
        <motion.div
          ref={setNodeRef}
          className="table-row-wrapper"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{ ...style, position: 'relative' }}
        >
          {children}
        </motion.div>
      ) : (
        <div ref={setNodeRef} className="table-row-wrapper" style={{ ...style, position: 'relative' }}>
          {children}
        </div>
      )}
    </SortableRowContext.Provider>
  );
}

const MemoizedTableRow = memo(
  ({
    row,
    index,
    sortBy,
    enableAnimation,
    getCommonPinningStyles,
    isFavorites,
    isSelected,
    masked,
    periodReturns,
    relatedSector,
    sectorQuote,
    fundExtraData,
    columnOrder,
    columnVisibility,
    columnSizing
  }) => {
    return (
      <SortableRow row={row} disabled={sortBy !== 'default'} enableAnimation={enableAnimation}>
        <div className={`table-row table-row-scroll ${index % 2 === 1 ? 'row-even' : ''}`} data-masked={masked}>
          {row.getVisibleCells().map((cell) => {
            const columnId = cell.column.id || cell.column.columnDef?.accessorKey;
            const isNameColumn = columnId === 'fundName';
            const align = isNameColumn ? '' : NON_FROZEN_COLUMN_IDS.includes(columnId) ? 'text-right' : 'text-center';
            const cellClassName = (cell.column.columnDef.meta && cell.column.columnDef.meta.cellClassName) || '';
            const style = getCommonPinningStyles(cell.column, false);
            const isPinned = cell.column.getIsPinned();
            return (
              <div
                key={cell.id}
                data-masked={masked}
                className={`table-cell ${align} ${cellClassName} ${isPinned ? 'pinned-cell' : ''}`}
                style={style}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            );
          })}
        </div>
      </SortableRow>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.index === nextProps.index &&
      prevProps.sortBy === nextProps.sortBy &&
      prevProps.enableAnimation === nextProps.enableAnimation &&
      prevProps.isFavorites === nextProps.isFavorites &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.masked === nextProps.masked &&
      prevProps.periodReturns === nextProps.periodReturns &&
      prevProps.relatedSector === nextProps.relatedSector &&
      prevProps.sectorQuote === nextProps.sectorQuote &&
      prevProps.fundExtraData === nextProps.fundExtraData &&
      prevProps.columnOrder === nextProps.columnOrder &&
      prevProps.columnVisibility === nextProps.columnVisibility &&
      prevProps.columnSizing === nextProps.columnSizing &&
      prevProps.row.original === nextProps.row.original
    );
  }
);

MemoizedTableRow.displayName = 'MemoizedTableRow';

const FundNameCell = memo(
  ({
    info,
    showFullFundName,
    onOpenCardDialog,
    favorites,
    isGroupTab,
    currentTab,
    batchRemoveEnabled,
    sortBy,
    onToggleFavoriteRef,
    onFundTagsClickRef,
    canEditFundTags,
    fundExtraDataByCode
  }) => {
    const { isEditMode, selectedCodes, toggleSelected } = useContext(EditModeContext);
    const original = info.row.original || {};
    const code = original.code;
    const isUpdated = original.isUpdated;
    const hasDca = original.hasDca;
    const hasPending = original.hasPending;
    const fundTags = isArray(original.fundTags) ? original.fundTags : [];
    const isFavorites = favorites?.has?.(code);
    const rowContext = useContext(SortableRowContext);
    const showFavoriteButton = !isGroupTab && (currentTab === 'all' || currentTab === 'fav' || !currentTab);
    const holdingLocked = (currentTab === 'all' || currentTab === 'fav') && !!original.isHoldingLinked;

    return (
      <div
        className="name-cell-content"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8 }}
      >
        {batchRemoveEnabled && isEditMode && (
          <label
            onClick={(e) => e.stopPropagation?.()}
            title={holdingLocked ? '关联持仓不可批量选择' : '选择用于移动分组/批量删除'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              flexShrink: 0,
              cursor: holdingLocked ? 'not-allowed' : 'pointer',
              opacity: holdingLocked ? 0.45 : 1
            }}
          >
            <input
              type="checkbox"
              disabled={holdingLocked}
              checked={!holdingLocked && (selectedCodes?.has?.(code) || false)}
              onChange={(e) => toggleSelected(code, e.target.checked)}
              onClick={(e) => e.stopPropagation?.()}
              style={{
                width: 14,
                height: 14,
                accentColor: 'var(--primary)',
                cursor: holdingLocked ? 'not-allowed' : 'pointer'
              }}
              aria-label="选择基金"
            />
          </label>
        )}
        {isEditMode &&
          (sortBy === 'default' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="icon-button drag-handle"
                  ref={rowContext?.setActivatorNodeRef}
                  {...rowContext?.activatorProps}
                  {...rowContext?.listeners}
                  style={{
                    cursor: 'grab',
                    width: 20,
                    height: 20,
                    padding: 2,
                    margin: '0',
                    flexShrink: 0,
                    color: 'var(--muted)',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'none'
                  }}
                  onClick={(e) => e.stopPropagation?.()}
                >
                  <DragIcon width="16" height="16" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>拖拽排序</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="icon-button drag-handle"
                  style={{
                    cursor: 'not-allowed',
                    opacity: 0.45,
                    width: 20,
                    height: 20,
                    padding: 2,
                    margin: '0',
                    flexShrink: 0,
                    color: 'var(--muted)',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    touchAction: 'none'
                  }}
                  onClick={(e) => e.stopPropagation?.()}
                >
                  <DragIcon width="16" height="16" />
                </button>
              </TooltipTrigger>
              <TooltipContent>拖拽基金顺序需要在默认排序下操作</TooltipContent>
            </Tooltip>
          ))}
        {showFavoriteButton ? (
          <button
            className={`icon-button fav-button ${isFavorites ? 'active' : ''}`}
            title={isFavorites ? '取消自选' : '添加自选'}
            onClick={(e) => {
              e.stopPropagation?.();
              onToggleFavoriteRef.current?.(original);
            }}
          >
            <StarIcon width="18" height="18" filled={isFavorites} />
          </button>
        ) : null}
        <div
          className="title-text"
          role={onOpenCardDialog ? 'button' : undefined}
          tabIndex={onOpenCardDialog ? 0 : undefined}
          title={onOpenCardDialog ? '查看基金详情' : original.isUpdated ? '今日净值已更新' : undefined}
          onClick={
            onOpenCardDialog
              ? (e) => {
                  e.stopPropagation?.();
                  onOpenCardDialog(original);
                }
              : undefined
          }
          onKeyDown={
            onOpenCardDialog
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenCardDialog(original);
                  }
                }
              : undefined
          }
          style={onOpenCardDialog ? { cursor: 'pointer' } : undefined}
        >
          <span className={`name-text ${showFullFundName ? 'show-full' : ''}`}>
            {holdingLocked ? (
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
                      bottom: 2,
                      cursor: 'default'
                    }}
                  >
                    <LinkIcon width="14" height="14" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>持仓来自自定义分组汇总</TooltipContent>
              </Tooltip>
            ) : null}
            <ConsecutiveTrendBadge trend={fundExtraDataByCode?.[code]?.consecutiveTrend} />
            {info.getValue() ?? '—'}
          </span>
          {code ? (
            <span className="muted code-text">
              #{code}
              {hasPending && (
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <span className="pending-indicator">待</span>
                  </TooltipTrigger>
                  <TooltipContent>有进行中的交易</TooltipContent>
                </Tooltip>
              )}
              {hasDca && (
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <span className="dca-indicator">定</span>
                  </TooltipTrigger>
                  <TooltipContent>定投中</TooltipContent>
                </Tooltip>
              )}
              {isUpdated && (
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <span className="updated-indicator">✓</span>
                  </TooltipTrigger>
                  <TooltipContent>今日净值已更新</TooltipContent>
                </Tooltip>
              )}
              {fundTags.length > 0 ? (
                <span className="pc-name-inline-tags">
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
                        title={canEditFundTags ? '编辑标签' : undefined}
                        style={{ cursor: canEditFundTags ? 'pointer' : 'default' }}
                        onClick={(e) => {
                          if (onFundTagsClickRef.current) {
                            e.stopPropagation?.();
                            onFundTagsClickRef.current(original);
                          }
                        }}
                      >
                        {item.name}
                      </Badge>
                    );
                  })}
                </span>
              ) : canEditFundTags ? (
                <button
                  type="button"
                  className="pc-name-add-tag-button"
                  title="添加标签"
                  onClick={(e) => {
                    e.stopPropagation?.();
                    onFundTagsClickRef.current?.(original);
                  }}
                >
                  <Badge variant="outline" className="font-normal text-[11px]">
                    <Plus className="h-3 w-3" />
                    添加标签
                  </Badge>
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
);
FundNameCell.displayName = 'FundNameCell';

/**
 * PC 端基金列表表格组件（基于 @tanstack/react-table）
 *
 * @param {Object} props
 * @param {Array<Object>} props.data - 表格数据
 *   每一行推荐结构（字段命名与 page.jsx 中的数据一致）：
 *   {
 *     fundName: string;             // 基金名称
 *     code?: string;                // 基金代码（可选，只用于展示在名称下方）
 *     latestNav: string|number;     // 最新净值
 *     estimateNav: string|number;   // 估算净值
 *     yesterdayChangePercent: string|number; // 最新涨幅
 *     estimateChangePercent: string|number;  // 估算涨幅
 *     holdingAmount: string|number;         // 持仓金额
 *     todayProfit: string|number;           // 当日收益
 *     holdingProfit: string|number;         // 持有收益
 *   }
 * @param {(row: any) => void} [props.onRemoveFund] - 删除基金的回调
 * @param {string} [props.currentTab] - 当前分组
 * @param {Set<string>} [props.favorites] - 自选集合
 * @param {(row: any) => void} [props.onToggleFavorite] - 添加/取消自选
 * @param {(row: any, meta: { hasHolding: boolean }) => void} [props.onHoldingAmountClick] - 点击持仓金额
 * @param {(row: any) => Object} [props.getFundCardProps] - 给定行返回 FundCard 的 props；传入后点击基金名称将用弹框展示卡片详情
 * @param {React.MutableRefObject<(() => void) | null>} [props.closeDialogRef] - 注入关闭弹框的方法，用于确认删除时关闭
 * @param {React.MutableRefObject<(() => void) | null>} [props.batchSelectionClearRef] - 注入清空批量选中状态的方法，用于父级批量删除二次确认成功后调用
 * @param {(codes: string[]) => boolean|void} [props.onRemoveFunds] - 批量删除；返回 false 表示已弹出二次确认，勿清空选中
 * @param {boolean} [props.blockDialogClose] - 为 true 时阻止点击遮罩关闭弹框（如删除确认弹框打开时）
 * @param {number} [props.stickyTop] - 表头固定时的 top 偏移（与 MobileFundTable 一致，用于适配导航栏、筛选栏等）
 * @param {boolean} [props.masked] - 是否隐藏持仓相关金额
 * @param {string} [props.relatedSectorSessionKey] - 登录用户 id（未登录传空），用于关联板块查询缓存与登录后重新拉取
 * @param {(row: any) => void} [props.onFundTagsClick] - 点击标签列时打开编辑标签
 */
const PcFundTable = memo(function PcFundTable({
  data = [],
  onRemoveFund,
  onRemoveFunds,
  onMoveFunds,
  currentTab,
  groups = [],
  favorites = new Set(),
  onToggleFavorite,
  onHoldingAmountClick,
  onHoldingProfitClick, // 保留以兼容调用方，表格内已不再使用点击切换
  sortBy = 'default',
  sortOrder = 'desc',
  sortRules = [],
  onSortChange,
  onReorder,
  onCustomSettingsChange,
  getFundCardProps,
  closeDialogRef,
  batchSelectionClearRef,
  stickyTop = 0,
  masked = false,
  relatedSectorSessionKey,
  onFundTagsClick,
  fundExtraDataByCode = {}
}) {
  // 从 Zustand 读取删除确认弹框状态，避免 page.jsx 订阅导致全量重渲染
  const fundDeleteConfirm = useModalStore((s) => s.fundDeleteConfirm);
  const fundDeleteBulkConfirm = useModalStore((s) => s.fundDeleteBulkConfirm);
  const blockDialogClose = !!fundDeleteConfirm || !!fundDeleteBulkConfirm;

  const [pagination, setPagination] = useState(() => {
    let size = 20;
    try {
      if (typeof window !== 'undefined') {
        const stored = storageStore.getItem('fundTablePageSize');
        if (stored && typeof stored === 'number' && stored > 0) size = stored;
      }
    } catch (e) {}
    return {
      pageIndex: 0,
      pageSize: size
    };
  });

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [currentTab, sortBy, sortOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [cardDialogRow, setCardDialogRow] = useState(null);
  const handleOpenCardDialog = useCallback((row) => {
    setCardDialogRow(row);
  }, []);
  const isTableDraggingRef = useRef(false);
  const tableContainerRef = useRef(null);
  /** 窗口虚拟列表锚点：用于 scrollMargin（.table-scroll-area 仅横向滚动，纵向为整页滚动） */
  const virtualScrollAnchorRef = useRef(null);
  const [virtualScrollMargin, setVirtualScrollMargin] = useState(0);
  const portalHeaderRef = useRef(null);
  const [showPortalHeader, setShowPortalHeader] = useState(false);
  const [effectiveStickyTop, setEffectiveStickyTop] = useState(stickyTop);
  const [portalHorizontal, setPortalHorizontal] = useState({ left: 0, right: 0 });
  const topScrollbarRef = useRef(null);
  const portalTopScrollbarRef = useRef(null);
  const [showTopScrollbar, setShowTopScrollbar] = useState(false);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const enableRowAnimation = data.length <= 40;

  const autoScrollRafRef = useRef(null);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback((direction) => {
    if (autoScrollRafRef.current) return;
    const tick = () => {
      window.scrollBy(0, direction * 12);
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleDragMove = useCallback(
    (event) => {
      const { active } = event;
      const rect = active?.rect?.current?.translated;
      if (!rect) return;

      // effectiveStickyTop is the sticky offset. Header height is ~45px.
      const headerBottom = effectiveStickyTop + 45;
      const triggerTop = headerBottom + 40; // 40px trigger zone below the header
      const triggerBottom = window.innerHeight - 40; // 40px trigger zone above the bottom

      if (rect.top < triggerTop) {
        startAutoScroll(-1);
      } else if (rect.bottom > triggerBottom) {
        startAutoScroll(1);
      } else {
        stopAutoScroll();
      }
    },
    [effectiveStickyTop, startAutoScroll, stopAutoScroll]
  );

  const handleDragStart = (event) => {
    isTableDraggingRef.current = true;
    setActiveId(event.active.id);
  };

  const handleDragCancel = () => {
    isTableDraggingRef.current = false;
    stopAutoScroll();
    setActiveId(null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = data.findIndex((item) => item.code === active.id);
      const newIndex = data.findIndex((item) => item.code === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && onReorder) {
        onReorder(oldIndex, newIndex);
      }
    }
    isTableDraggingRef.current = false;
    stopAutoScroll();
    setActiveId(null);
  };

  useEffect(() => {
    return () => stopAutoScroll();
  }, [stopAutoScroll]);

  const groupKey = currentTab ?? 'all';
  const currentGroupName = useMemo(() => {
    if (groupKey === 'all') return '全部';
    if (groupKey === 'fav') return '自选';
    return groups.find((g) => g?.id === groupKey)?.name || '当前';
  }, [groupKey, groups]);
  const settingSyncOptions = useMemo(() => {
    const baseOptions = [
      { id: 'all', name: '全部', description: '全部分组' },
      { id: 'fav', name: '自选', description: '自选分组' },
      ...(isArray(groups) ? groups : []).map((group) => ({
        id: group?.id,
        name: group?.name || '未命名',
        description: '自定义分组'
      }))
    ];
    const seen = new Set();
    return baseOptions.filter((item) => {
      const id = String(item?.id ?? '').trim();
      if (!id || id === groupKey || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [groupKey, groups]);

  const isGroupTab = currentTab && currentTab !== 'all' && currentTab !== 'fav';
  // 批量删除：之前仅自定义分组支持，这里扩展到「全部 / 自选 / 自定义分组」
  const batchRemoveEnabled = currentTab === 'all' || currentTab === 'fav' || isGroupTab;
  const selectableCodes = useMemo(() => (isArray(data) ? data.map((d) => d?.code).filter(Boolean) : []), [data]);
  /** 全部/自选下「关联汇总持仓」行不参与批量选择 */
  const batchSelectableCodes = useMemo(
    () =>
      isArray(data)
        ? data
            .filter((d) => !d?.isHoldingLinked)
            .map((d) => d?.code)
            .filter(Boolean)
        : [],
    [data]
  );
  const batchSelectableCount = batchSelectableCodes.length;
  const [selectedCodes, setSelectedCodes] = useState(() => new Set());
  const [moveGroupOpen, setMoveGroupOpen] = useState(false);

  useEffect(() => {
    setSelectedCodes(new Set());
    setIsEditMode(false);
  }, [currentTab]);

  useEffect(() => {
    if (!batchRemoveEnabled) setSelectedCodes(new Set());
  }, [batchRemoveEnabled]);

  useEffect(() => {
    setSelectedCodes((prev) => {
      if (!prev?.size) return prev;
      const allowed = new Set(selectableCodes);
      let changed = false;
      const next = new Set();
      for (const c of prev) {
        if (allowed.has(c)) next.add(c);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectableCodes]);

  useEffect(() => {
    const linkedCodes = new Set(
      (isArray(data) ? data : []).filter((d) => d && d.isHoldingLinked && d.code).map((d) => d.code)
    );
    if (!linkedCodes.size) return;
    setSelectedCodes((prev) => {
      if (!prev?.size) return prev;
      let changed = false;
      const next = new Set(prev);
      for (const c of linkedCodes) {
        if (next.delete(c)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [data]);

  useEffect(() => {
    if (!batchSelectionClearRef) return undefined;
    batchSelectionClearRef.current = () => {
      setSelectedCodes(new Set());
      setIsEditMode(false);
    };
    return () => {
      batchSelectionClearRef.current = null;
    };
  }, [batchSelectionClearRef]);

  const toggleSelected = useCallback(
    (code, checked) => {
      if (!code) return;
      const row = isArray(data) ? data.find((d) => d?.code === code) : null;
      if (row?.isHoldingLinked) return;
      setSelectedCodes((prev) => {
        const next = new Set(prev || []);
        if (checked) next.add(code);
        else next.delete(code);
        return next;
      });
    },
    [data]
  );

  const setAllSelected = useCallback(
    (checked) => {
      setSelectedCodes(() => {
        if (!checked) return new Set();
        return new Set(batchSelectableCodes);
      });
    },
    [batchSelectableCodes]
  );

  const selectedCount = selectedCodes?.size || 0;
  const selectedCodesList = useMemo(() => Array.from(selectedCodes || []), [selectedCodes]);

  const getCustomSettingsWithMigration = () => {
    if (typeof window === 'undefined') return {};
    try {
      const parsed = storageStore.getItem('customSettings') || {};
      if (!parsed || !isObject(parsed)) return {};
      if (
        parsed.pcTableColumnOrder != null ||
        parsed.pcTableColumnVisibility != null ||
        parsed.pcTableColumns != null ||
        parsed.mobileTableColumnOrder != null ||
        parsed.mobileTableColumnVisibility != null
      ) {
        const all = {
          ...(parsed.all && isObject(parsed.all) ? parsed.all : {}),
          pcTableColumnOrder: parsed.pcTableColumnOrder,
          pcTableColumnVisibility: parsed.pcTableColumnVisibility,
          pcTableColumns: parsed.pcTableColumns,
          mobileTableColumnOrder: parsed.mobileTableColumnOrder,
          mobileTableColumnVisibility: parsed.mobileTableColumnVisibility
        };
        delete parsed.pcTableColumnOrder;
        delete parsed.pcTableColumnVisibility;
        delete parsed.pcTableColumns;
        delete parsed.mobileTableColumnOrder;
        delete parsed.mobileTableColumnVisibility;
        parsed.all = all;
        storageStore.setItem('customSettings', JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return {};
    }
  };

  const buildPcConfigFromGroup = (group) => {
    if (!group || !isObject(group)) return null;
    const sizing = group.pcTableColumns;
    const sizingObj =
      sizing && isObject(sizing)
        ? Object.fromEntries(Object.entries(sizing).filter(([, v]) => Number.isFinite(v)))
        : {};
    if (sizingObj.actions) {
      const { actions, ...rest } = sizingObj;
      Object.assign(sizingObj, rest);
      delete sizingObj.actions;
    }
    const order =
      isArray(group.pcTableColumnOrder) && group.pcTableColumnOrder.length > 0 ? group.pcTableColumnOrder : null;
    const visibility =
      group.pcTableColumnVisibility && isObject(group.pcTableColumnVisibility) ? group.pcTableColumnVisibility : null;
    const pinned = isArray(group.pcTableColumnPinned) ? group.pcTableColumnPinned : [];
    return { sizing: sizingObj, order, visibility, pinned };
  };

  const getDefaultPcGroupConfig = () => ({
    order: [...NON_FROZEN_COLUMN_IDS],
    visibility: null,
    sizing: {},
    pinned: []
  });

  const getInitialConfigByGroup = () => {
    const parsed = getCustomSettingsWithMigration();
    const byGroup = {};
    Object.keys(parsed).forEach((k) => {
      if (k === 'pcContainerWidth') return;
      const group = parsed[k];
      const pc = buildPcConfigFromGroup(group);
      if (pc) {
        byGroup[k] = {
          pcTableColumnOrder: pc.order
            ? (() => {
                const valid = pc.order.filter((id) => NON_FROZEN_COLUMN_IDS.includes(id));
                const missing = NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
                return [...valid, ...missing];
              })()
            : null,
          pcTableColumnVisibility: pc.visibility,
          pcTableColumns: Object.keys(pc.sizing).length ? pc.sizing : null,
          pcShowFullFundName: group.pcShowFullFundName === true,
          pcTableColumnPinned: pc.pinned
        };
      }
    });
    return byGroup;
  };

  const [configByGroup, setConfigByGroup] = useState(getInitialConfigByGroup);

  const currentGroupPc = configByGroup[groupKey];
  const showFullFundName = currentGroupPc?.pcShowFullFundName ?? false;
  const defaultPc = getDefaultPcGroupConfig();
  const columnOrder = (() => {
    const order = currentGroupPc?.pcTableColumnOrder ?? defaultPc.order;
    if (!isArray(order) || order.length === 0) return [...NON_FROZEN_COLUMN_IDS];
    const valid = order.filter((id) => NON_FROZEN_COLUMN_IDS.includes(id));
    const missing = NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  })();
  const columnVisibility = (() => {
    const vis = currentGroupPc?.pcTableColumnVisibility ?? null;
    if (vis && isObject(vis) && Object.keys(vis).length > 0) {
      const next = { ...vis };
      NON_FROZEN_COLUMN_IDS.forEach((id) => {
        if (next[id] === undefined) {
          next[id] = PC_COLUMNS_DEFAULT_HIDDEN_IF_PERSONALIZED.has(id) ? false : true;
        }
      });
      return next;
    }
    const allVisible = {};
    NON_FROZEN_COLUMN_IDS.forEach((id) => {
      allVisible[id] = PC_COLUMNS_DEFAULT_HIDDEN_IF_PERSONALIZED.has(id) ? false : true;
    });
    return allVisible;
  })();
  const columnSizing = useMemo(() => {
    const s = currentGroupPc?.pcTableColumns;
    if (s && isObject(s)) {
      const out = Object.fromEntries(Object.entries(s).filter(([, v]) => Number.isFinite(v)));
      if (out.actions) {
        const { actions, ...rest } = out;
        return rest;
      }
      return out;
    }
    return {};
  }, [currentGroupPc?.pcTableColumns]);

  const persistPcGroupConfig = (updates) => {
    if (typeof window === 'undefined') return;
    try {
      const parsed = storageStore.getItem('customSettings') || {};
      const group = parsed[groupKey] && isObject(parsed[groupKey]) ? { ...parsed[groupKey] } : {};
      if (updates.pcTableColumnOrder !== undefined) group.pcTableColumnOrder = updates.pcTableColumnOrder;
      if (updates.pcTableColumnVisibility !== undefined)
        group.pcTableColumnVisibility = updates.pcTableColumnVisibility;
      if (updates.pcTableColumns !== undefined) group.pcTableColumns = updates.pcTableColumns;
      if (updates.pcTableColumnPinned !== undefined) group.pcTableColumnPinned = updates.pcTableColumnPinned;
      if (updates.pcShowFullFundName !== undefined) group.pcShowFullFundName = updates.pcShowFullFundName;
      parsed[groupKey] = group;
      storageStore.setItem('customSettings', JSON.stringify(parsed));
      setConfigByGroup((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], ...updates } }));
      onCustomSettingsChange?.();
    } catch {}
  };

  const handleToggleShowFullFundName = (show) => {
    persistPcGroupConfig({ pcShowFullFundName: show });
  };

  const handleSyncPcSettings = (targetIds = []) => {
    if (!targetIds.length || typeof window === 'undefined') return false;
    try {
      const parsed = storageStore.getItem('customSettings') || {};
      const payload = {
        pcTableColumnOrder: [...columnOrder],
        pcTableColumnVisibility: { ...columnVisibility },
        pcTableColumns: { ...columnSizing },
        pcTableColumnPinned: [...(currentGroupPc?.pcTableColumnPinned || [])],
        pcShowFullFundName: !!showFullFundName
      };
      const targetUpdates = {};
      targetIds.forEach((targetId) => {
        if (!targetId || targetId === groupKey) return;
        const group = parsed[targetId] && isObject(parsed[targetId]) ? { ...parsed[targetId] } : {};
        parsed[targetId] = { ...group, ...payload };
        targetUpdates[targetId] = payload;
      });
      const syncedCount = Object.keys(targetUpdates).length;
      if (syncedCount === 0) return false;
      storageStore.setItem('customSettings', JSON.stringify(parsed));
      setConfigByGroup((prev) => {
        const next = { ...prev };
        Object.entries(targetUpdates).forEach(([targetId, updates]) => {
          next[targetId] = { ...next[targetId], ...updates };
        });
        return next;
      });
      onCustomSettingsChange?.();
      return syncedCount;
    } catch {
      return false;
    }
  };

  const setColumnOrder = (nextOrderOrUpdater) => {
    const next = isFunction(nextOrderOrUpdater) ? nextOrderOrUpdater(columnOrder) : nextOrderOrUpdater;
    persistPcGroupConfig({ pcTableColumnOrder: next });
  };
  const setColumnVisibility = (nextOrUpdater) => {
    const next = isFunction(nextOrUpdater) ? nextOrUpdater(columnVisibility) : nextOrUpdater;
    persistPcGroupConfig({ pcTableColumnVisibility: next });
  };

  const [localColumnSizing, setLocalColumnSizing] = useState(columnSizing);

  useEffect(() => {
    setLocalColumnSizing(columnSizing);
  }, [columnSizing]);

  const persistPcGroupConfigRef = useRef(persistPcGroupConfig);
  persistPcGroupConfigRef.current = persistPcGroupConfig;

  const debouncedPersistColumnSizing = useMemo(
    () => debounce((sizes) => persistPcGroupConfigRef.current({ pcTableColumns: sizes }), 300),
    []
  );

  useEffect(() => {
    return () => debouncedPersistColumnSizing.cancel();
  }, [debouncedPersistColumnSizing]);

  const setColumnSizing = (nextOrUpdater) => {
    setLocalColumnSizing((prev) => {
      const next = isFunction(nextOrUpdater) ? nextOrUpdater(prev) : nextOrUpdater;
      const { actions, ...rest } = next || {};
      const newSizes = rest || {};
      debouncedPersistColumnSizing(newSizes);
      return newSizes;
    });
  };

  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const handleResetSizing = () => {
    setColumnSizing({});
    setResetConfirmOpen(false);
  };

  const handleResetColumnOrder = () => {
    setColumnOrder([...NON_FROZEN_COLUMN_IDS]);
  };

  const handleResetColumnVisibility = () => {
    const allVisible = {};
    NON_FROZEN_COLUMN_IDS.forEach((id) => {
      allVisible[id] = PC_COLUMNS_DEFAULT_HIDDEN_IF_PERSONALIZED.has(id) ? false : true;
    });
    setColumnVisibility(allVisible);
  };
  const handleToggleColumnVisibility = (columnId, visible) => {
    setColumnVisibility((prev = {}) => ({ ...prev, [columnId]: visible }));
  };

  const handleTogglePinColumn = (id) => {
    const currentPinned = currentGroupPc?.pcTableColumnPinned || [];
    let nextPinned;
    let nextOrder;

    if (currentPinned.includes(id)) {
      nextPinned = currentPinned.filter((c) => c !== id);
      const pinnedPart = columnOrder.filter((c) => nextPinned.includes(c));
      const unpinnedPart = columnOrder.filter((c) => !nextPinned.includes(c));
      nextOrder = [...pinnedPart, ...unpinnedPart];
    } else {
      nextPinned = [...currentPinned, id];
      const existingPinned = columnOrder.filter((c) => currentPinned.includes(c));
      const existingUnpinnedWithoutId = columnOrder.filter((c) => !currentPinned.includes(c) && c !== id);
      nextOrder = [...existingPinned, id, ...existingUnpinnedWithoutId];
    }

    persistPcGroupConfig({
      pcTableColumnPinned: nextPinned,
      pcTableColumnOrder: nextOrder
    });
  };

  const onRemoveFundRef = useRef(onRemoveFund);
  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);
  const onFundTagsClickRef = useRef(onFundTagsClick);

  useEffect(() => {
    if (closeDialogRef) {
      closeDialogRef.current = () => setCardDialogRow(null);
      return () => {
        closeDialogRef.current = null;
      };
    }
  }, [closeDialogRef]);

  useEffect(() => {
    onRemoveFundRef.current = onRemoveFund;
    onToggleFavoriteRef.current = onToggleFavorite;
    onHoldingAmountClickRef.current = onHoldingAmountClick;
    onFundTagsClickRef.current = onFundTagsClick;
  }, [onRemoveFund, onToggleFavorite, onHoldingAmountClick, onFundTagsClick]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const getEffectiveStickyTop = () => {
      const stickySummaryCard = document.querySelector('.group-summary-sticky .group-summary-card');
      const marketIndexEl = document.querySelector('.market-index-accordion-root');
      const currentMarketIndexHeight = marketIndexEl ? marketIndexEl.offsetHeight : 0;
      const baseStickyTop = stickyTop + currentMarketIndexHeight;

      if (!stickySummaryCard) return baseStickyTop;

      const stickySummaryWrapper = stickySummaryCard.closest('.group-summary-sticky');
      if (!stickySummaryWrapper) return baseStickyTop;

      const wrapperRect = stickySummaryWrapper.getBoundingClientRect();
      const isSummaryStuck = wrapperRect.top <= baseStickyTop + 1;

      return isSummaryStuck ? baseStickyTop + stickySummaryWrapper.offsetHeight : baseStickyTop;
    };

    const updateVerticalState = () => {
      const nextStickyTop = getEffectiveStickyTop() - 2;
      setEffectiveStickyTop((prev) => (prev === nextStickyTop ? prev : nextStickyTop));

      const tableEl = tableContainerRef.current;
      const scrollEl = tableEl?.closest('.table-scroll-area');
      const targetEl = scrollEl || tableEl;
      const rect = targetEl?.getBoundingClientRect();

      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setShowPortalHeader((prev) => (prev === false ? prev : false));
        setShowTopScrollbar((prev) => (prev === false ? prev : false));
        return;
      }

      const headerEl = tableEl?.querySelector('.table-header-row');
      const headerHeight = headerEl?.getBoundingClientRect?.().height ?? 0;
      const hasPassedHeader = rect.top + headerHeight <= nextStickyTop;
      const hasTableInView = rect.bottom > nextStickyTop;

      const nextPortalVisible = hasPassedHeader && hasTableInView;
      setShowPortalHeader((prev) => (prev === nextPortalVisible ? prev : nextPortalVisible));

      setPortalHorizontal((prev) => {
        const next = {
          left: rect.left,
          right: typeof window !== 'undefined' ? Math.max(0, window.innerWidth - rect.right) : 0
        };
        if (prev.left === next.left && prev.right === next.right) return prev;
        return next;
      });

      const scrollWidth = scrollEl?.scrollWidth || 0;
      const clientWidth = scrollEl?.clientWidth || 0;
      const hasOverflow = scrollWidth > clientWidth + 1;
      const isBottomOut = rect.bottom > window.innerHeight && rect.top < window.innerHeight;
      const nextTopScrollbarVisible = hasOverflow && isBottomOut;

      setShowTopScrollbar((prev) => (prev === nextTopScrollbarVisible ? prev : nextTopScrollbarVisible));
      if (hasOverflow && scrollWidth > 0) {
        setTableScrollWidth((prev) => (prev === scrollWidth ? prev : scrollWidth));
      }
    };

    const throttledVerticalUpdate = throttle(updateVerticalState, 1000 / 60, { leading: true, trailing: true });

    updateVerticalState();
    window.addEventListener('scroll', throttledVerticalUpdate, { passive: true });
    window.addEventListener('resize', throttledVerticalUpdate, { passive: true });

    let ro = null;
    if (tableContainerRef.current) {
      ro = new ResizeObserver(() => throttledVerticalUpdate());
      ro.observe(tableContainerRef.current);
      const scrollEl = tableContainerRef.current.closest('.table-scroll-area');
      if (scrollEl) ro.observe(scrollEl);
    }

    return () => {
      window.removeEventListener('scroll', throttledVerticalUpdate);
      window.removeEventListener('resize', throttledVerticalUpdate);
      if (ro) ro.disconnect();
      throttledVerticalUpdate.cancel();
    };
  }, [stickyTop]);

  const relatedSectorEnabled = columnVisibility?.relatedSector !== false;
  const dataSourceEnabled = columnVisibility?.dataSource !== false;
  const dataSourceAccuracyLabels = useDataSourceAccuracyLabels(data, dataSourceEnabled);
  const relatedSectorCacheRef = useRef(new Map());
  const [relatedSectorByCode, setRelatedSectorByCode] = useState({});
  const [sectorQuoteByLabel, setSectorQuoteByLabel] = useState({});

  const sectorAuthSegment = relatedSectorSessionKey || 'anon';
  const dataCodes = useMemo(() => Array.from(new Set((data || []).map((d) => d?.code).filter(Boolean))), [data]);
  const dataCodesKey = useMemo(() => dataCodes.join('|'), [dataCodes]);

  useEffect(() => {
    relatedSectorCacheRef.current.clear();
    setRelatedSectorByCode({});
    setSectorQuoteByLabel({});
  }, [sectorAuthSegment]);

  useEffect(() => {
    if (!relatedSectorEnabled) return;
    if (dataCodes.length === 0) return;

    const missing = dataCodes.filter((code) => !relatedSectorCacheRef.current.has(code));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const batchResults = await fetchRelatedSectorsBatch(missing, { authSegment: sectorAuthSegment });
        if (cancelled) return;

        Object.entries(batchResults).forEach(([code, value]) => {
          relatedSectorCacheRef.current.set(code, value);
        });

        setRelatedSectorByCode((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [code, value] of Object.entries(batchResults)) {
            if (next[code] === value) continue;
            next[code] = value;
            changed = true;
          }
          return changed ? next : prev;
        });
      } catch (e) {
        console.error('Fetch related sectors batch error:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [relatedSectorEnabled, dataCodesKey, sectorAuthSegment, dataCodes]);

  useEffect(() => {
    if (!relatedSectorEnabled) return;
    if (dataCodes.length === 0) return;

    const labels = new Set();
    for (const code of dataCodes) {
      const lbl = relatedSectorByCode?.[code] ?? relatedSectorCacheRef.current.get(code);
      const t = lbl != null ? String(lbl).trim() : '';
      if (t) labels.add(t);
    }
    const labelList = Array.from(labels);
    if (labelList.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        // 1. 批量获取 secid
        const secidResults = await fetchFundSecidsBatch(labelList);
        if (cancelled) return;

        // 2. 批量获取行情
        const secids = labelList.map((label) => secidResults[label]).filter(Boolean);
        const quotes = await fetchEastmoneySectorQuotesBatch(secids);
        const batch = {};
        for (const label of labelList) {
          const secid = secidResults[label];
          if (!secid) continue;
          const quote = quotes[secid];
          if (quote) batch[label] = quote;
        }

        if (cancelled) return;
        setSectorQuoteByLabel((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [label, quote] of Object.entries(batch)) {
            const prevQ = next[label];
            if (prevQ === quote) continue;
            if (prevQ && quote && prevQ.pct === quote.pct && prevQ.name === quote.name && prevQ.code === quote.code) {
              continue;
            }
            next[label] = quote;
            changed = true;
          }
          return changed ? next : prev;
        });
      } catch (e) {
        console.error('Fetch sector quotes batch error:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [relatedSectorEnabled, dataCodesKey, relatedSectorByCode, dataCodes]);

  const withRelatedSectorFund = useCallback(
    (row) => {
      if (!row || !row.code) return row;
      const rawValue = relatedSectorByCode?.[row.code] ?? relatedSectorCacheRef.current.get(row.code) ?? '';
      const relatedSector = rawValue != null ? String(rawValue).trim() : '';
      const quote = relatedSector ? sectorQuoteByLabel?.[relatedSector] : null;
      const quoteName = quote?.name != null ? String(quote.name).trim() : '';
      const quotePct = quote?.pct == null ? null : Number(quote.pct);
      const hasQuotePct = quotePct != null && Number.isFinite(quotePct);

      return {
        ...row,
        rawFund: {
          ...(row.rawFund || { code: row.code, name: row.fundName }),
          relatedSector,
          relatedSectorQuoteName: quoteName,
          relatedSectorQuotePct: hasQuotePct ? quotePct : null
        }
      };
    },
    [relatedSectorByCode, sectorQuoteByLabel]
  );

  const getFundCardPropsWithRelatedSector = useCallback(
    (row) => {
      if (!getFundCardProps) return {};
      return getFundCardProps(withRelatedSectorFund(row));
    },
    [getFundCardProps, withRelatedSectorFund]
  );

  const periodReturnsEnabled =
    columnVisibility?.period1w !== false ||
    columnVisibility?.period1m !== false ||
    columnVisibility?.period3m !== false ||
    columnVisibility?.period6m !== false ||
    columnVisibility?.period1y !== false;
  const periodReturnsCacheRef = useRef(new Map());
  const [periodReturnsByCode, setPeriodReturnsByCode] = useState({});

  useEffect(() => {
    if (!periodReturnsEnabled) return;
    if (dataCodes.length === 0) return;

    const cachedBatch = {};
    for (const code of dataCodes) {
      if (!periodReturnsCacheRef.current.has(code)) continue;
      cachedBatch[code] = periodReturnsCacheRef.current.get(code);
    }
    if (Object.keys(cachedBatch).length > 0) {
      setPeriodReturnsByCode((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [code, value] of Object.entries(cachedBatch)) {
          const prevVal = next[code];
          if (
            prevVal &&
            prevVal.week === value.week &&
            prevVal.month === value.month &&
            prevVal.month3 === value.month3 &&
            prevVal.month6 === value.month6 &&
            prevVal.year1 === value.year1
          ) {
            continue;
          }
          next[code] = value;
          changed = true;
        }
        return changed ? next : prev;
      });
    }

    const missing = dataCodes.filter((code) => !periodReturnsCacheRef.current.has(code));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const batchResults = {};
      let updateTimeout = null;

      const triggerBatchUpdate = () => {
        if (cancelled || Object.keys(batchResults).length === 0) return;
        setPeriodReturnsByCode((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [c, val] of Object.entries(batchResults)) {
            const prevVal = next[c];
            if (
              prevVal &&
              prevVal.week === val.week &&
              prevVal.month === val.month &&
              prevVal.month3 === val.month3 &&
              prevVal.month6 === val.month6 &&
              prevVal.year1 === val.year1
            ) {
              continue;
            }
            next[c] = val;
            changed = true;
          }
          return changed ? next : prev;
        });
        for (const key of Object.keys(batchResults)) {
          delete batchResults[key];
        }
      };

      await asyncPool(4, missing, async (code) => {
        const value = await fetchFundPeriodReturns(code);
        periodReturnsCacheRef.current.set(code, value);
        if (cancelled) return;

        batchResults[code] = value;

        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(triggerBatchUpdate, 100);
      });

      triggerBatchUpdate();
    })();

    return () => {
      cancelled = true;
    };
  }, [periodReturnsEnabled, dataCodesKey, dataCodes]);

  useEffect(() => {
    const tableEl = tableContainerRef.current;
    const scrollEl = tableEl?.closest('.table-scroll-area');
    if (!scrollEl) return;

    const elements = [scrollEl, portalHeaderRef.current, topScrollbarRef.current, portalTopScrollbarRef.current].filter(
      Boolean
    );

    if (elements.length <= 1) return;

    const currentScrollLeft = scrollEl.scrollLeft;
    elements.forEach((el) => {
      if (el !== scrollEl && Math.abs(el.scrollLeft - currentScrollLeft) > 1) {
        el.scrollLeft = currentScrollLeft;
      }
    });

    let isSyncing = false;
    const createScrollHandler = (sourceEl) => () => {
      if (isSyncing) return;
      isSyncing = true;
      const val = sourceEl.scrollLeft;
      elements.forEach((targetEl) => {
        if (targetEl !== sourceEl && Math.abs(targetEl.scrollLeft - val) > 1) {
          targetEl.scrollLeft = val;
        }
      });
      isSyncing = false;
    };

    const handlers = elements.map((el) => ({
      el,
      handler: createScrollHandler(el)
    }));

    handlers.forEach(({ el, handler }) => {
      el.addEventListener('scroll', handler, { passive: true });
    });

    return () => {
      handlers.forEach(({ el, handler }) => {
        el.removeEventListener('scroll', handler);
      });
    };
  }, [showPortalHeader, showTopScrollbar, tableScrollWidth]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'fundName',
        header: () => {
          if (!batchRemoveEnabled) return '基金名称';
          if (isEditMode) {
            const allCount = batchSelectableCount;
            const checked = allCount > 0 && selectedCount === allCount;
            const indeterminate = selectedCount > 0 && selectedCount < allCount;
            return (
              <BatchRemoveHeader
                checked={checked}
                indeterminate={indeterminate}
                selectedCount={selectedCount}
                totalCount={allCount}
                onToggleAll={(nextChecked) => setAllSelected(nextChecked)}
                onClear={() => setSelectedCodes(new Set())}
                onRemove={() => {
                  if (!onRemoveFunds || selectedCount === 0) return;
                  const codes = Array.from(selectedCodes);
                  const shouldClear = onRemoveFunds(codes);
                  if (shouldClear !== false) {
                    setSelectedCodes(new Set());
                    setIsEditMode(false);
                  }
                }}
                onMove={() => {
                  if (!onMoveFunds || selectedCount === 0) return;
                  setMoveGroupOpen(true);
                }}
                onClose={() => {
                  setIsEditMode(false);
                  setSelectedCodes(new Set());
                }}
                disabled={selectedCount === 0}
              />
            );
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>基金名称</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={(e) => {
                      e.stopPropagation?.();
                      setIsEditMode(true);
                    }}
                    aria-label="编辑"
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
                      cursor: 'pointer',
                      opacity: 0.6,
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
                  >
                    <PencilIcon width="14" height="14" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>编辑模式</TooltipContent>
              </Tooltip>
            </div>
          );
        },
        size: 300,
        minSize: 280,
        enablePinning: true,
        cell: (info) => (
          <FundNameCell
            info={info}
            showFullFundName={showFullFundName}
            onOpenCardDialog={getFundCardProps ? handleOpenCardDialog : undefined}
            favorites={favorites}
            isGroupTab={isGroupTab}
            currentTab={currentTab}
            batchRemoveEnabled={batchRemoveEnabled}
            sortBy={sortBy}
            onToggleFavoriteRef={onToggleFavoriteRef}
            onFundTagsClickRef={onFundTagsClickRef}
            canEditFundTags={!!onFundTagsClick}
            fundExtraDataByCode={fundExtraDataByCode}
          />
        ),
        meta: {
          align: 'left',
          cellClassName: 'name-cell'
        }
      },
      {
        id: 'dataSource',
        header: '数据源',
        size: 90,
        minSize: 80,
        cell: (info) => {
          const original = info.row.original || {};
          const autoSource = !!original.rawFund?.autoSource;
          const dataSource = original.rawFund?.dataSource || 1;
          const text = autoSource ? `自动源${dataSource}` : `数据源${dataSource}`;
          const accuracyLabel = dataSourceAccuracyLabels?.[original.rawFund?.code || original.code];
          return (
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Badge
                variant="outline"
                className={cn(
                  'font-normal text-[11px] cursor-pointer hover:border-primary/50 transition-colors',
                  autoSource ? 'border-primary/30 text-primary bg-primary/5' : 'text-muted-foreground border-border'
                )}
                style={autoSource ? { gap: '2px' } : {}}
                onClick={(e) => {
                  e.stopPropagation();
                  useModalStore.setState({ dataSourceModal: { open: true, fund: original.rawFund } });
                }}
              >
                {autoSource && <Sparkles size={10} style={{ opacity: 0.8 }} />}
                {text}
              </Badge>
              <DataSourceAccuracyBadge label={accuracyLabel} />
            </div>
          );
        },
        meta: {
          align: 'center'
        }
      },
      {
        id: 'relatedSector',
        header: '关联板块',
        size: 180,
        minSize: 120,
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = (code && (relatedSectorByCode?.[code] ?? relatedSectorCacheRef.current.get(code))) || '';
          const display = value || '—';
          const labelKey = value ? String(value).trim() : '';
          const quote = labelKey ? sectorQuoteByLabel?.[labelKey] : null;
          const nameFromQuote = quote?.name != null ? String(quote.name).trim() : '';
          const firstLine = nameFromQuote || display;
          const pct = quote?.pct;
          const pctText = pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : null;
          const pctCls = pct != null ? (pct > 0 ? 'up' : pct < 0 ? 'down' : '') : '';
          return (
            <div
              style={{
                width: '100%',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 2
              }}
            >
              {pctText != null ? (
                <span
                  className={pctCls}
                  style={{
                    fontWeight: 700,
                    textAlign: 'right',
                    fontSize: 'clamp(10px, 1.2vw, 14px)',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {pctText}
                </span>
              ) : null}
              <span
                style={{
                  display: 'block',
                  width: '100%',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'right',
                  fontSize: pctText != null ? '11px' : '14px'
                }}
              >
                {firstLine}
              </span>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'related-sector-cell'
        }
      },
      {
        id: 'period1w',
        header: '近1周',
        size: 88,
        minSize: 72,
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.week : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                className={cls}
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {text}
              </div>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' }
      },
      {
        id: 'period1m',
        header: '近1月',
        size: 88,
        minSize: 72,
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.month : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                className={cls}
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {text}
              </div>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' }
      },
      {
        id: 'period3m',
        header: '近3月',
        size: 88,
        minSize: 72,
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.month3 : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                className={cls}
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {text}
              </div>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' }
      },
      {
        id: 'period6m',
        header: '近6月',
        size: 88,
        minSize: 72,
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.month6 : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                className={cls}
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {text}
              </div>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' }
      },
      {
        id: 'period1y',
        header: '近1年',
        size: 88,
        minSize: 72,
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.year1 : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <div
                className={cls}
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {text}
              </div>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' }
      },
      {
        accessorKey: 'latestNav',
        header: '最新净值',
        size: 100,
        minSize: 80,
        cell: (info) => {
          const original = info.row.original || {};
          const rawDate = original.latestNavDate ?? '-';
          const date = isString(rawDate) && rawDate.length > 5 ? rawDate.slice(5) : rawDate;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {info.getValue() ?? '—'}
              </div>
              <span className="muted" style={{ fontSize: '11px' }}>
                {date}
              </span>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'value-cell'
        }
      },
      {
        accessorKey: 'estimateNav',
        header: '估算净值',
        size: 100,
        minSize: 80,
        cell: (info) => {
          const original = info.row.original || {};
          const rawDate = original.estimateNavDate ?? '-';
          const date = isString(rawDate) && rawDate.length > 5 ? rawDate.slice(5) : rawDate;
          const estimateNav = info.getValue();
          const hasEstimateNav = estimateNav != null && estimateNav !== '—';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {estimateNav ?? '—'}
              </div>
              {hasEstimateNav && date && date !== '-' ? (
                <span className="muted" style={{ fontSize: '11px' }}>
                  {date}
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'value-cell'
        }
      },
      {
        accessorKey: 'yesterdayChangePercent',
        header: '最新涨幅',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.yesterdayChangeValue;
          const rawDate = original.yesterdayDate ?? '-';
          const date = isString(rawDate) && rawDate.length > 5 ? rawDate.slice(5) : rawDate;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <div
                className={cls}
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {info.getValue() ?? '—'}
              </div>
              <span className="muted" style={{ fontSize: '11px' }}>
                {date}
              </span>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'change-cell'
        }
      },
      {
        accessorKey: 'estimateChangePercent',
        header: '估算涨幅',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateChangeValue;
          const isMuted = original.estimateChangeMuted;
          const rawTime = original.estimateTime ?? '-';
          const time = isString(rawTime) && rawTime.length > 5 ? rawTime.slice(5) : rawTime;
          const cls = isMuted ? 'muted' : value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = info.getValue();
          const hasText = text != null && text !== '—';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <div
                className={cls}
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {text ?? '—'}
              </div>
              {hasText && time && time !== '-' ? (
                <span className="muted" style={{ fontSize: '11px' }}>
                  {time}
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'est-change-cell'
        }
      },
      {
        accessorKey: 'sinceAddedChangePercent',
        header: '自添加来',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.sinceAddedChangeValue;
          const cls = value == null ? 'muted' : value > 0 ? 'up' : value < 0 ? 'down' : '';
          const rawDate = original.sinceAddedDateRaw ?? '';
          const displayDate = original.sinceAddedDate ?? '';
          const text = info.getValue();
          const hasText = text != null && text !== '—';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <div
                className={cls}
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {text ?? '—'}
              </div>
              {hasText && displayDate ? (
                <span
                  className="muted"
                  style={{ fontSize: '11px' }}
                  title={rawDate && rawDate !== displayDate ? rawDate : undefined}
                >
                  {displayDate}
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'since-added-cell'
        }
      },
      {
        accessorKey: 'totalChangePercent',
        header: '估算收益',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasProfit ? (original.estimateProfit ?? '') : '—';
          const percentStr = original.estimateProfitPercent ?? '';

          return (
            <div style={{ width: '100%' }}>
              <span
                className={cls}
                style={{
                  fontWeight: 700,
                  display: 'block',
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
              </span>
              {hasProfit && percentStr && !masked ? (
                <span
                  className={`${cls} estimate-profit-percent`}
                  style={{
                    display: 'block',
                    fontSize: 'clamp(9px, 0.9vw, 11px)',
                    opacity: 0.9,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {percentStr}
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'total-change-cell'
        }
      },
      {
        accessorKey: 'holdingAmount',
        header: '持仓金额',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const holdingLocked = (currentTab === 'all' || currentTab === 'fav') && !!original.isHoldingLinked;
          const holdingLinkedTitle = '持仓来自自定义分组汇总，点击选择分组后操作';
          if (original.holdingAmountValue == null) {
            return (
              <div
                role="button"
                tabIndex={0}
                className="muted"
                title={holdingLocked ? holdingLinkedTitle : '编辑持仓'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
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
                未设置 <SettingsIcon width="12" height="12" />
              </div>
            );
          }
          return (
            <div
              title={holdingLocked ? holdingLinkedTitle : '编辑持仓'}
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                width: '100%',
                minWidth: 0
              }}
              onClick={(e) => {
                e.stopPropagation?.();
                onHoldingAmountClickRef.current?.(original, { hasHolding: true });
              }}
            >
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 'clamp(10px, 1.2vw, 14px)',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {masked ? <span className="mask-text">******</span> : (info.getValue() ?? '—')}
                </span>
              </div>
              <button
                className="icon-button no-hover"
                onClick={(e) => {
                  e.stopPropagation?.();
                  onHoldingAmountClickRef.current?.(original, { hasHolding: true });
                }}
                style={{
                  border: 'none',
                  width: '28px',
                  height: '28px',
                  marginLeft: 4,
                  flexShrink: 0,
                  backgroundColor: 'transparent',
                  color: holdingLocked ? 'var(--muted)' : undefined,
                  cursor: 'pointer'
                }}
              >
                <SettingsIcon width="14" height="14" />
              </button>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-amount-cell'
        }
      },
      {
        accessorKey: 'holdingRatio',
        header: '持仓占比',
        size: 100,
        minSize: 80,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.holdingRatioValue;
          if (value == null) {
            return (
              <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>
                —
              </div>
            );
          }
          const text = `${(value * 100).toFixed(2)}%`;
          return (
            <span
              style={{
                fontWeight: 700,
                display: 'block',
                textAlign: 'right',
                fontSize: 'clamp(10px, 1.2vw, 14px)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {masked ? <span className="mask-text">******</span> : text}
            </span>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-ratio-cell'
        }
      },
      {
        accessorKey: 'holdingCost',
        header: '持仓成本',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          if (original.holdingCostValue == null) {
            return (
              <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>
                —
              </div>
            );
          }
          return (
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', minWidth: 0 }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {masked ? <span className="mask-text">******</span> : (info.getValue() ?? '—')}
              </span>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-cost-cell'
        }
      },
      {
        accessorKey: 'costNav',
        header: '成本净值',
        size: 100,
        minSize: 80,
        cell: (info) => {
          const original = info.row.original || {};
          if (original.costNavValue == null) {
            return (
              <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>
                —
              </div>
            );
          }
          return (
            <span
              style={{
                fontWeight: 700,
                display: 'block',
                textAlign: 'right',
                fontSize: 'clamp(10px, 1.2vw, 14px)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {masked ? <span className="mask-text">******</span> : (info.getValue() ?? '—')}
            </span>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'cost-nav-cell'
        }
      },
      {
        accessorKey: 'holdingDays',
        header: '持有天数',
        size: 100,
        minSize: 80,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.holdingDaysValue;
          if (value == null) {
            return (
              <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>
                —
              </div>
            );
          }
          return <div style={{ fontWeight: 700, textAlign: 'right' }}>{value}</div>;
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-days-cell'
        }
      },
      {
        accessorKey: 'todayProfit',
        header: '当日收益',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.todayProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasProfit ? (info.getValue() ?? '') : '—';
          const percentStr = original.todayProfitPercent ?? '';
          const isUpdated = original.isUpdated;
          return (
            <div style={{ width: '100%' }}>
              <span
                className={cls}
                style={{
                  fontWeight: 700,
                  display: 'block',
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
              </span>
              {percentStr && !masked ? (
                <span
                  className={`${cls} today-profit-percent`}
                  style={{
                    display: 'block',
                    fontSize: 'clamp(9px, 0.9vw, 11px)',
                    opacity: 0.9,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {percentStr}
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'profit-cell'
        }
      },
      {
        accessorKey: 'yesterdayProfit',
        header: '昨日收益',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.yesterdayProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasProfit ? (info.getValue() ?? '') : '—';
          const percentStr = original.yesterdayProfitPercent ?? '';
          const pctVal = original.yesterdaySecondLinePctValue;
          const pctCls =
            pctVal != null && Number.isFinite(pctVal) ? (pctVal > 0 ? 'up' : pctVal < 0 ? 'down' : '') : 'muted';
          return (
            <div style={{ width: '100%' }}>
              <span
                className={cls}
                style={{
                  fontWeight: 700,
                  display: 'block',
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
              </span>
              {percentStr && !masked ? (
                <span
                  className={`${pctCls} yesterday-profit-percent`}
                  style={{
                    display: 'block',
                    fontSize: 'clamp(9px, 0.9vw, 11px)',
                    opacity: 0.9,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {percentStr}
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'yesterday-profit-cell'
        }
      },
      {
        accessorKey: 'holdingProfit',
        header: '持有收益',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.holdingProfitValue;
          const hasTotal = value != null;
          const cls = hasTotal ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasTotal ? (info.getValue() ?? '') : '—';
          const percentStr = original.holdingProfitPercent ?? '';
          return (
            <div style={{ width: '100%' }}>
              <span
                className={cls}
                style={{
                  fontWeight: 700,
                  display: 'block',
                  fontSize: 'clamp(10px, 1.2vw, 14px)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {masked && hasTotal ? <span className="mask-text">******</span> : amountStr}
              </span>
              {percentStr && !masked ? (
                <span
                  className={`${cls} holding-profit-percent`}
                  style={{
                    display: 'block',
                    fontSize: 'clamp(9px, 0.9vw, 11px)',
                    opacity: 0.9,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {percentStr}
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-cell'
        }
      },
      {
        id: 'actions',
        header: () => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>操作</span>
            <button
              className="icon-button"
              title="个性化设置"
              onClick={(e) => {
                e.stopPropagation?.();
                setSettingModalOpen(true);
              }}
              style={{
                border: 'none',
                width: '24px',
                height: '24px',
                backgroundColor: 'transparent',
                color: 'var(--text)'
              }}
            >
              <SettingsIcon width="14" height="14" />
            </button>
          </div>
        ),
        size: 80,
        minSize: 80,
        maxSize: 80,
        enableResizing: false,
        enablePinning: true,
        meta: {
          align: 'center',
          isAction: true,
          cellClassName: 'action-cell'
        },
        cell: (info) => {
          const original = info.row.original || {};

          const handleClick = (e) => {
            e.stopPropagation?.();
            onRemoveFundRef.current?.(original);
          };

          return (
            <div className="row" style={{ justifyContent: 'center', gap: 4, padding: '8px 0' }}>
              <button
                className="icon-button danger"
                title="删除"
                onClick={handleClick}
                style={{
                  width: '28px',
                  height: '28px',
                  opacity: 1,
                  cursor: 'pointer'
                }}
              >
                <TrashIcon width="14" height="14" />
              </button>
            </div>
          );
        }
      }
    ],
    [
      currentTab,
      showFullFundName,
      getFundCardProps,
      handleOpenCardDialog,
      masked,
      relatedSectorByCode,
      sectorQuoteByLabel,
      periodReturnsByCode,
      dataSourceAccuracyLabels,
      batchRemoveEnabled,
      batchSelectableCount,
      selectedCount,
      selectedCodes,
      onRemoveFunds,
      onMoveFunds,
      setAllSelected,
      onFundTagsClick,
      isEditMode,
      toggleSelected,
      favorites,
      sortBy,
      onToggleFavoriteRef,
      fundExtraDataByCode,
      isGroupTab
    ]
  );

  const table = useReactTable({
    data,
    columns,
    enableColumnPinning: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onColumnSizingChange: (updater) => {
      setColumnSizing((prev) => {
        const next = isFunction(updater) ? updater(prev) : updater;
        const { actions, ...rest } = next || {};
        return rest || {};
      });
    },
    state: {
      columnSizing: localColumnSizing,
      columnOrder,
      columnVisibility,
      columnPinning: {
        left: ['fundName', ...columnOrder.filter((id) => (currentGroupPc?.pcTableColumnPinned || []).includes(id))],
        right: ['actions']
      },
      pagination
    },
    onPaginationChange: setPagination,
    onColumnOrderChange: (updater) => {
      setColumnOrder(updater);
    },
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility(updater);
    },
    initialState: {
      columnPinning: {
        left: ['fundName'],
        right: ['actions']
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    defaultColumn: {
      cell: (info) => info.getValue() ?? '—'
    }
  });

  const headerGroup = table.getHeaderGroups()[0];
  const tableRows = table.getRowModel().rows;
  const enableVirtualization = data.length > 40;
  const rowVirtualizer = useWindowVirtualizer({
    count: tableRows.length,
    estimateSize: () => 72,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 8,
    scrollMargin: virtualScrollMargin,
    enabled: enableVirtualization
  });

  useLayoutEffect(() => {
    if (!enableVirtualization) return;
    const el = virtualScrollAnchorRef.current;
    if (!el) return;
    const update = () => {
      if (isTableDraggingRef.current) return;
      setVirtualScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const scrollArea = el.closest?.('.table-scroll-area');
    if (scrollArea) ro.observe(scrollArea);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [enableVirtualization, tableRows.length, stickyTop]);

  useEffect(() => {
    if (!enableVirtualization) return;
    rowVirtualizer.measure();
  }, [enableVirtualization, tableRows.length, rowVirtualizer]);

  const getCommonPinningStyles = useCallback((column, isHeader) => {
    const isPinned = column.getIsPinned();
    const isNameColumn = column.id === 'fundName' || column.columnDef?.accessorKey === 'fundName';
    const style = {
      width: `var(--col-${column.id}, ${column.getSize()}px)`
    };
    if (!isPinned) {
      return {
        ...style,
        zIndex: isHeader ? 1 : 0
      };
    }

    const isLeft = isPinned === 'left';
    const isRight = isPinned === 'right';

    return {
      ...style,
      position: 'sticky',
      left: isLeft ? `var(--col-${column.id}-start, ${column.getStart('left')}px)` : undefined,
      right: isRight ? `var(--col-${column.id}-after, ${column.getAfter('right')}px)` : undefined,
      zIndex: isHeader ? 11 : 10,
      backgroundColor: isHeader ? 'var(--table-pinned-header-bg)' : 'var(--row-bg, var(--bg))',
      boxShadow: 'none',
      textAlign: isNameColumn ? 'left' : 'center',
      justifyContent: isNameColumn ? 'flex-start' : 'center'
    };
  }, []);

  const getSortHeaderMeta = useCallback(
    (columnId) => {
      const sortMap = {
        fundName: 'name',
        tags: 'tags',
        yesterdayChangePercent: 'yesterdayIncrease',
        estimateChangePercent: 'yield',
        totalChangePercent: 'estimateProfit',
        holdingAmount: 'holdingAmount',
        holdingRatio: 'holdingRatio',
        todayProfit: 'todayProfit',
        yesterdayProfit: 'yesterdayProfit',
        holdingProfit: 'holding',
        holdingDays: 'holdingDays',
        holdingCost: 'holdingCost',
        sinceAddedChangePercent: 'sinceAddedChangePercent',
        period1w: 'last1Week',
        period1m: 'last1Month',
        period3m: 'last3Months',
        period6m: 'last6Months',
        period1y: 'last1Year'
      };
      const sortKey = sortMap[columnId];
      const isSorted = !!sortBy && sortKey === sortBy;
      let isSortEnabled = !!sortKey && (sortRules || []).some((rule) => rule?.id === sortKey && !!rule?.enabled);

      // 选择默认排序时，隐藏基金名称表头的排序和箭头
      if (sortBy === 'default' && sortKey === 'name') {
        isSortEnabled = false;
      }

      return { sortKey, isSorted, isSortEnabled };
    },
    [sortBy, sortRules]
  );

  const renderTableHeader = (forPortal = false) => {
    if (!headerGroup) return null;
    return (
      <div className="table-header-row table-header-row-scroll">
        {headerGroup.headers.map((header) => {
          const style = getCommonPinningStyles(header.column, true);
          const isNameColumn = header.column.id === 'fundName' || header.column.columnDef?.accessorKey === 'fundName';
          const isRightAligned = NON_FROZEN_COLUMN_IDS.includes(header.column.id);
          const align = isNameColumn ? '' : isRightAligned ? 'text-right' : 'text-center';

          const colId = header.column.id || header.column.columnDef?.accessorKey;
          const { sortKey, isSorted, isSortEnabled } = getSortHeaderMeta(colId);

          return (
            <div
              key={header.id}
              className={`table-header-cell ${align} ${isSortEnabled ? 'sortable' : ''}`}
              style={{
                ...style,
                cursor: isSortEnabled ? 'pointer' : 'default',
                userSelect: isSortEnabled ? 'none' : 'auto'
              }}
              onClick={() => {
                if (isSortEnabled && onSortChange) {
                  onSortChange(sortKey);
                }
              }}
            >
              <div
                style={{
                  paddingRight: isRightAligned ? '20px' : '0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                {isSortEnabled && (
                  <span
                    style={{
                      display: 'inline-flex',
                      flexDirection: 'column',
                      lineHeight: 1,
                      fontSize: '8px',
                      opacity: isSorted ? 1 : 0.3
                    }}
                  >
                    <span style={{ opacity: isSorted && sortOrder === 'asc' ? 1 : 0.3 }}>▲</span>
                    <span style={{ opacity: isSorted && sortOrder === 'desc' ? 1 : 0.3 }}>▼</span>
                  </span>
                )}
              </div>
              {!forPortal && (
                <div
                  onMouseDown={header.column.getCanResize() ? header.getResizeHandler() : undefined}
                  onTouchStart={header.column.getCanResize() ? header.getResizeHandler() : undefined}
                  className={`resizer ${
                    header.column.getIsResizing() ? 'isResizing' : ''
                  } ${header.column.getCanResize() ? '' : 'disabled'}`}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const totalHeaderWidth = headerGroup?.headers?.reduce((acc, h) => acc + h.column.getSize(), 0) ?? 0;

  const tableCssVariables = useMemo(() => {
    const vars = {};
    table.getAllLeafColumns().forEach((column) => {
      vars[`--col-${column.id}`] = `${column.getSize()}px`;
      vars[`--col-${column.id}-start`] = `${column.getStart('left')}px`;
      vars[`--col-${column.id}-after`] = `${column.getAfter('right')}px`;
    });
    return vars;
  }, [table.getState().columnSizing, table.getState().columnOrder, table.getState().columnPinning]);

  return (
    <EditModeContext.Provider value={{ isEditMode, selectedCodes, toggleSelected }}>
      <>
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          {showTopScrollbar && !showPortalHeader && (
            <div className="pc-fund-table-top-scrollbar" ref={topScrollbarRef}>
              <div className="pc-fund-table-top-scrollbar-inner" style={{ width: `${tableScrollWidth}px` }} />
            </div>
          )}
          <div className="table-pc-wrap">
            <div className="table-scroll-area">
              <div className="table-scroll-area-inner">
                <div className="pc-fund-table" ref={tableContainerRef} style={tableCssVariables}>
                  <style>{`
        .table-row-scroll {
          --row-bg: var(--bg);
          background-color: var(--row-bg) !important;
        }

        /* 斑马纹行背景（非 hover 状态） */
        .table-row-scroll:nth-child(even),
        .table-row-scroll.row-even {
          background-color: var(--table-row-alt-bg) !important;
        }

        /* Pinned cells 继承所在行的背景（非 hover 状态） */
        .table-row-scroll .pinned-cell {
          background-color: var(--row-bg) !important;
        }
        .table-row-scroll:nth-child(even) .pinned-cell,
        .table-row-scroll.row-even .pinned-cell,
        .row-even .pinned-cell {
          background-color: var(--table-row-alt-bg) !important;
        }

        /* Hover 状态优先级最高，覆盖斑马纹和 pinned 背景 */
        .table-row-scroll:hover,
        .table-row-scroll.row-even:hover {
          --row-bg: var(--table-row-hover-bg);
          background-color: var(--table-row-hover-bg) !important;
        }
        .table-row-scroll:hover .pinned-cell,
        .table-row-scroll.row-even:hover .pinned-cell {
          background-color: var(--table-row-hover-bg) !important;
        }

        /* 覆盖 grid 布局为 flex 以支持动态列宽 */
        .table-header-row-scroll,
        .table-row-scroll {
          display: flex !important;
          align-items: stretch !important; /* 让每个单元格撑满行高 */
          width: fit-content !important;
          min-width: 100%;
          gap: 0 !important; /* Reset gap because we control width explicitly */
        }

        .table-header-cell,
        .table-cell {
          display: flex !important;
          align-items: center; /* 保持单元格内容垂直居中 */
          flex-shrink: 0;
          box-sizing: border-box;
          padding-left: 8px;
          padding-right: 8px;
          position: relative; /* For resizer */
        }
        
        /* 拖拽把手样式 */
        .resizer {
          position: absolute;
          right: 0;
          top: 0;
          height: 100%;
          width: 8px;
          background: transparent;
          cursor: col-resize;
          user-select: none;
          touch-action: none;
          z-index: 20;
        }

        .resizer::after {
          content: '';
          position: absolute;
          right: 3px;
          top: 12%;
          bottom: 12%;
          width: 2px;
          background: var(--border);
          opacity: 0.35;
          transition: opacity 0.2s, background-color 0.2s, box-shadow 0.2s;
        }

        .resizer:hover::after,
        .resizer.isResizing::after {
          opacity: 1;
          background: var(--primary);
          box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.2);
        }
        
        .table-header-cell:hover .resizer::after {
          opacity: 0.75;
        }

        .resizer.disabled {
          cursor: default;
          background: transparent;
          pointer-events: none;
        }

        .resizer.disabled::after {
          opacity: 0;
        }

        /* 窗口级纵向虚拟滚动：表体自身不出现纵向滚动条，仅随页面滚动 */
        .pc-fund-table-body-virtual {
          overflow-x: visible;
          overflow-y: visible;
          width: 100%;
        }
      `}</style>
                  {/* 表头 */}
                  {renderTableHeader(false)}

                  {/* 表体 */}
                  {enableVirtualization ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragMove={handleDragMove}
                      onDragEnd={handleDragEnd}
                      onDragCancel={handleDragCancel}
                      modifiers={[restrictToVerticalAxis]}
                      dropAnimation={null}
                      autoScroll={false}
                    >
                      <SortableContext items={data.map((item) => item.code)} strategy={verticalListSortingStrategy}>
                        <div
                          ref={virtualScrollAnchorRef}
                          className="pc-fund-table-body-virtual"
                          style={{ position: 'relative', width: '100%' }}
                        >
                          <div
                            style={{
                              height: rowVirtualizer.getTotalSize(),
                              position: 'relative',
                              width: '100%'
                            }}
                          >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                              const row = tableRows[virtualRow.index];
                              if (!row) return null;
                              return (
                                <div
                                  key={row.original.code || row.id}
                                  data-index={virtualRow.index}
                                  ref={rowVirtualizer.measureElement}
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                                    zIndex: activeId === row.original.code ? 9999 : 1
                                  }}
                                >
                                  <MemoizedTableRow
                                    row={row}
                                    index={virtualRow.index}
                                    sortBy={sortBy}
                                    enableAnimation={false}
                                    getCommonPinningStyles={getCommonPinningStyles}
                                    isFavorites={favorites?.has?.(row.original.code)}
                                    isSelected={selectedCodes?.has?.(row.original.code)}
                                    masked={masked}
                                    periodReturns={periodReturnsByCode[row.original.code]}
                                    relatedSector={relatedSectorByCode[row.original.code]}
                                    sectorQuote={
                                      relatedSectorByCode[row.original.code]
                                        ? sectorQuoteByLabel[String(relatedSectorByCode[row.original.code]).trim()]
                                        : null
                                    }
                                    fundExtraData={fundExtraDataByCode[row.original.code]}
                                    columnOrder={columnOrder}
                                    columnVisibility={columnVisibility}
                                    columnSizing={columnSizing}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragMove={handleDragMove}
                      onDragEnd={handleDragEnd}
                      onDragCancel={handleDragCancel}
                      modifiers={[restrictToVerticalAxis]}
                      dropAnimation={null}
                      autoScroll={false}
                    >
                      <SortableContext items={data.map((item) => item.code)} strategy={verticalListSortingStrategy}>
                        {enableRowAnimation ? (
                          <AnimatePresence mode="popLayout">
                            {tableRows.map((row, index) => (
                              <MemoizedTableRow
                                key={row.original.code || row.id}
                                row={row}
                                index={index}
                                sortBy={sortBy}
                                enableAnimation
                                getCommonPinningStyles={getCommonPinningStyles}
                                isFavorites={favorites?.has?.(row.original.code)}
                                isSelected={selectedCodes?.has?.(row.original.code)}
                                masked={masked}
                                periodReturns={periodReturnsByCode[row.original.code]}
                                relatedSector={relatedSectorByCode[row.original.code]}
                                sectorQuote={
                                  relatedSectorByCode[row.original.code]
                                    ? sectorQuoteByLabel[String(relatedSectorByCode[row.original.code]).trim()]
                                    : null
                                }
                                fundExtraData={fundExtraDataByCode[row.original.code]}
                                columnOrder={columnOrder}
                                columnVisibility={columnVisibility}
                                columnSizing={columnSizing}
                              />
                            ))}
                          </AnimatePresence>
                        ) : (
                          <>
                            {tableRows.map((row, index) => (
                              <MemoizedTableRow
                                key={row.original.code || row.id}
                                row={row}
                                index={index}
                                sortBy={sortBy}
                                enableAnimation={false}
                                getCommonPinningStyles={getCommonPinningStyles}
                                isFavorites={favorites?.has?.(row.original.code)}
                                isSelected={selectedCodes?.has?.(row.original.code)}
                                masked={masked}
                                periodReturns={periodReturnsByCode[row.original.code]}
                                relatedSector={relatedSectorByCode[row.original.code]}
                                sectorQuote={
                                  relatedSectorByCode[row.original.code]
                                    ? sectorQuoteByLabel[String(relatedSectorByCode[row.original.code]).trim()]
                                    : null
                                }
                                fundExtraData={fundExtraDataByCode[row.original.code]}
                                columnOrder={columnOrder}
                                columnVisibility={columnVisibility}
                                columnSizing={columnSizing}
                              />
                            ))}
                          </>
                        )}
                      </SortableContext>
                    </DndContext>
                  )}

                  {table.getRowModel().rows.length === 0 && (
                    <div className="table-row empty-row">
                      <div className="table-cell" style={{ textAlign: 'center' }}>
                        <span className="muted">暂无数据</span>
                      </div>
                    </div>
                  )}
                  {resetConfirmOpen && (
                    <ConfirmModal
                      title="重置列宽"
                      message="是否重置表格列宽为默认值？"
                      icon={<ResetIcon width="20" height="20" className="shrink-0 text-[var(--primary)]" />}
                      confirmVariant="primary"
                      onConfirm={handleResetSizing}
                      onCancel={() => setResetConfirmOpen(false)}
                      confirmText="重置"
                    />
                  )}
                  {showPortalHeader &&
                    ReactDOM.createPortal(
                      <div
                        style={{
                          position: 'fixed',
                          top: effectiveStickyTop,
                          left: portalHorizontal.left,
                          right: portalHorizontal.right,
                          zIndex: 10
                        }}
                      >
                        {showTopScrollbar && (
                          <div className="pc-fund-table-top-scrollbar" ref={portalTopScrollbarRef}>
                            <div
                              className="pc-fund-table-top-scrollbar-inner"
                              style={{ width: `${tableScrollWidth}px` }}
                            />
                          </div>
                        )}
                        <div
                          className="pc-fund-table pc-fund-table-portal-header"
                          ref={portalHeaderRef}
                          style={{
                            ...tableCssVariables,
                            overflowX: 'auto',
                            scrollbarWidth: 'none'
                          }}
                        >
                          <div
                            className="table-header-row table-header-row-scroll"
                            style={{ minWidth: totalHeaderWidth, width: 'fit-content' }}
                          >
                            {headerGroup?.headers.map((header) => {
                              const style = getCommonPinningStyles(header.column, true);
                              const isNameColumn =
                                header.column.id === 'fundName' || header.column.columnDef?.accessorKey === 'fundName';
                              const isRightAligned = NON_FROZEN_COLUMN_IDS.includes(header.column.id);
                              const align = isNameColumn ? '' : isRightAligned ? 'text-right' : 'text-center';
                              const colId = header.column.id || header.column.columnDef?.accessorKey;
                              const { sortKey, isSorted, isSortEnabled } = getSortHeaderMeta(colId);
                              return (
                                <div
                                  key={header.id}
                                  className={`table-header-cell ${align} ${isSortEnabled ? 'sortable' : ''}`}
                                  style={{
                                    ...style,
                                    cursor: isSortEnabled ? 'pointer' : 'default',
                                    userSelect: isSortEnabled ? 'none' : 'auto'
                                  }}
                                  onClick={() => {
                                    if (isSortEnabled && onSortChange) {
                                      onSortChange(sortKey);
                                    }
                                  }}
                                >
                                  <div
                                    style={{
                                      paddingRight: isRightAligned ? '20px' : '0',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    {header.isPlaceholder
                                      ? null
                                      : flexRender(header.column.columnDef.header, header.getContext())}
                                    {isSortEnabled && (
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          flexDirection: 'column',
                                          lineHeight: 1,
                                          fontSize: '8px',
                                          opacity: isSorted ? 1 : 0.3
                                        }}
                                      >
                                        <span style={{ opacity: isSorted && sortOrder === 'asc' ? 1 : 0.3 }}>▲</span>
                                        <span style={{ opacity: isSorted && sortOrder === 'desc' ? 1 : 0.3 }}>▼</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                </div>
              </div>
            </div>
          </div>

          {true && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderTop: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span className="muted" style={{ fontSize: '13px' }}>
                  每页
                </span>
                <Input
                  key={table.getState().pagination.pageSize}
                  defaultValue={table.getState().pagination.pageSize}
                  type="number"
                  min={1}
                  className="w-[60px] h-8 text-[16PX] text-center px-2"
                  onBlur={(e) => {
                    let val = parseInt(e.target.value, 10);
                    if (isNaN(val) || val < 1) val = 20;
                    e.target.value = val;
                    if (val !== table.getState().pagination.pageSize) {
                      table.setPageSize(val);
                      if (typeof window !== 'undefined') {
                        storageStore.setItem('fundTablePageSize', val);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                />
                <span className="muted" style={{ fontSize: '13px' }}>
                  条
                </span>
              </div>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (table.getCanPreviousPage()) {
                            table.previousPage();
                            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        className={!table.getCanPreviousPage() ? 'opacity-50 pointer-events-none' : ''}
                      />
                    </PaginationItem>
                    {Array.from({ length: table.getPageCount() }, (_, i) => {
                      const pageIndex = table.getState().pagination.pageIndex;
                      if (i === 0 || i === table.getPageCount() - 1 || (i >= pageIndex - 1 && i <= pageIndex + 1)) {
                        return (
                          <PaginationItem key={i}>
                            <PaginationLink
                              href="#"
                              isActive={pageIndex === i}
                              onClick={(e) => {
                                e.preventDefault();
                                table.setPageIndex(i);
                                if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              {i + 1}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }
                      if (i === pageIndex - 2 || i === pageIndex + 2) {
                        return (
                          <PaginationItem key={i}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (table.getCanNextPage()) {
                            table.nextPage();
                            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        className={!table.getCanNextPage() ? 'opacity-50 pointer-events-none' : ''}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          )}
        </div>
        {!!(cardDialogRow && getFundCardProps) && (
          <FundDetailDialog
            blockDialogClose={blockDialogClose}
            cardDialogRow={cardDialogRow}
            getFundCardProps={getFundCardPropsWithRelatedSector}
            setCardDialogRow={setCardDialogRow}
          />
        )}
        <PcTableSettingModal
          open={settingModalOpen}
          onClose={() => setSettingModalOpen(false)}
          columns={columnOrder.map((id) => ({ id, header: COLUMN_HEADERS[id] ?? id }))}
          onColumnReorder={(newOrder) => {
            setColumnOrder(newOrder);
          }}
          columnVisibility={columnVisibility}
          pinnedColumns={currentGroupPc?.pcTableColumnPinned || []}
          onToggleColumnVisibility={handleToggleColumnVisibility}
          onTogglePinColumn={handleTogglePinColumn}
          onResetColumnOrder={handleResetColumnOrder}
          onResetColumnVisibility={handleResetColumnVisibility}
          onResetSizing={() => setResetConfirmOpen(true)}
          showFullFundName={showFullFundName}
          onToggleShowFullFundName={handleToggleShowFullFundName}
          syncOptions={settingSyncOptions}
          currentGroupName={currentGroupName}
          onSyncSettings={handleSyncPcSettings}
        />
        {moveGroupOpen && (
          <MoveGroupModal
            open={moveGroupOpen}
            onClose={() => setMoveGroupOpen(false)}
            fromTab={currentTab}
            groups={groups}
            selectedCodes={selectedCodesList}
            disabled={selectedCount === 0}
            onMoveFunds={async (payload) => {
              const res = await onMoveFunds?.(payload);
              if (payload?.dryRun) return res;
              // 迁移成功后清空批量选中
              setSelectedCodes(new Set());
              return res;
            }}
          />
        )}
      </>
    </EditModeContext.Provider>
  );
});

function FundDetailDialog({ blockDialogClose, cardDialogRow, getFundCardProps, setCardDialogRow }) {
  const isAnySubModalOpen = useModalStore(
    (s) =>
      s.dataSourceModal.open ||
      s.tradeModal.open ||
      s.holdingModal.open ||
      s.dcaModal.open ||
      s.dividendMethodModal.open ||
      s.convertModal.open ||
      s.fundTagsEdit.open ||
      s.historyModal.open ||
      s.actionModal.open ||
      s.selectHoldingGroupModal.open ||
      s.addHistoryModal.open
  );

  const finalBlockClose = blockDialogClose || isAnySubModalOpen;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && document.body.hasAttribute('data-photo-viewer-open')) return;
        if (!open && !finalBlockClose) setCardDialogRow(null);
      }}
    >
      <DialogContent
        className="sm:max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden"
        onPointerDownOutside={(e) => {
          if (document.body.hasAttribute('data-photo-viewer-open')) {
            e.preventDefault();
            return;
          }
          if (finalBlockClose) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (document.body.hasAttribute('data-photo-viewer-open')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-6 pb-4 pt-6 text-left border-b border-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">基金详情</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 scrollbar-y-styled">
          {cardDialogRow && getFundCardProps ? (
            <FundCard {...getFundCardProps(cardDialogRow)} layoutMode="drawer" />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BatchRemoveHeader({
  checked,
  indeterminate,
  selectedCount,
  totalCount,
  onToggleAll,
  onMove,
  onRemove,
  onClear,
  onClose,
  disabled
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'space-between' }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <label
          onClick={(e) => e.stopPropagation?.()}
          title={checked ? '取消全选' : '全选'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        >
          <input
            ref={ref}
            type="checkbox"
            checked={!!checked}
            onChange={(e) => onToggleAll?.(e.target.checked)}
            onClick={(e) => e.stopPropagation?.()}
            style={{ width: 14, height: 14, accentColor: 'var(--primary)', cursor: 'pointer' }}
            aria-label="全选"
          />
          <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            已选 {selectedCount}/{totalCount}
          </span>
        </label>
        {selectedCount > 0 && (
          <button
            className="link-button"
            onClick={(e) => {
              e.stopPropagation?.();
              onClear?.();
            }}
            style={{ fontSize: 12, opacity: 0.9 }}
            type="button"
          >
            清空
          </button>
        )}
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
        <button
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation?.();
            onMove?.();
          }}
          disabled={!!disabled}
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '0 6px',
            height: 28,
            width: 'auto',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--primary)'
          }}
        >
          <FolderPlusIcon width="14" height="14" />
          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>移动分组</span>
        </button>
        <button
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation?.();
            onRemove?.();
          }}
          disabled={!!disabled}
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '0 6px',
            height: 28,
            width: 'auto',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--danger)'
          }}
        >
          <TrashIcon width="14" height="14" />
          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>批量删除</span>
        </button>
        {onClose && (
          <button
            className="icon-button"
            onClick={(e) => {
              e.stopPropagation?.();
              onClose?.();
            }}
            type="button"
            aria-label="退出编辑"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              padding: 0,
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              marginLeft: 4
            }}
          >
            <CloseIcon width="16" height="16" />
          </button>
        )}
      </div>
    </div>
  );
}

export default PcFundTable;
