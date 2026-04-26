'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import FitText from './FitText';
import MobileFundCardDrawer from './MobileFundCardDrawer';
import MobileSettingModal from './MobileSettingModal';
import MoveGroupModal from './MoveGroupModal';
import { ArrowUpToLineIcon, CloseIcon, DragIcon, FolderPlusIcon, LinkIcon, PencilIcon, SettingsIcon, StarIcon, TrashIcon } from './Icons';
import { fetchFundPeriodReturns, fetchRelatedSectors, fetchRelatedSectorLiveQuote } from '@/app/api/fund';
import { storageStore } from '../stores';
import { asyncPool } from '@/app/lib/asyncHelper';
import { Badge } from '@/components/ui/badge';
import { getTagThemeBadgeProps } from '@/app/components/AddTagDialog';
import { cn } from '@/lib/utils';

const EDIT_MOVE_TO_FRONT_COL = 'editMoveToFront';
const EDIT_DRAG_COL = 'editDrag';

const MOBILE_TAGS_COLUMN_ID = 'tags';

const MOBILE_NON_FROZEN_COLUMN_IDS = [
  'tags',
  'relatedSector',
  'yesterdayChangePercent',
  'estimateChangePercent',
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
  'holdingCost',
  'costNav',
  'estimateNav',
];

const MOBILE_COLUMNS_DEFAULT_HIDDEN_IF_PERSONALIZED = new Set(['tags', 'holdingCost', 'costNav']);

const MOBILE_COLUMN_HEADERS = {
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
  totalChangePercent: '估算收益',
  holdingCost: '持仓成本',
  costNav: '成本净值',
  holdingDays: '持有天数',
  todayProfit: '当日收益',
  yesterdayProfit: '昨日收益',
  holdingProfit: '持有收益',
  tags: '基金标签',
};

const RowSortableContext = createContext(null);

function EditDragHandleCell({ disabled }) {
  const rowSortable = useContext(RowSortableContext);
  const setActivatorRef = useCallback(
    (node) => {
      rowSortable?.setActivatorNodeRef?.(node);
    },
    [rowSortable],
  );
  if (!rowSortable) return null;
  return (
    <span
      ref={setActivatorRef}
      className="icon-button fav-button"
      title="拖动排序"
      style={{
        backgroundColor: 'transparent',
        touchAction: 'none',
        cursor: disabled ? 'not-allowed' : 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
      onClick={(e) => e.stopPropagation()}
      {...(disabled ? {} : rowSortable.listeners)}
    >
      <DragIcon width="18" height="18" />
    </span>
  );
}

/** 编辑模式表头：与 PcFundTable BatchRemoveHeader 一致（全选 / 已选 / 清空 + 移动分组 + 批量删除 + 完成） */
function MobileEditBatchHeader({
  totalCount,
  selectedCount,
  checked,
  indeterminate,
  onToggleAll,
  onMove,
  onRemove,
  onClose,
  hasMoveFunds,
}) {
  const checkboxRef = useRef(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  const actionsDisabled = selectedCount === 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: 8,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          flex: '1 1 auto',
          overflow: 'hidden',
          marginLeft: '5px'
        }}
      >
        <label
          title={checked ? '取消全选' : '全选'}
          onClick={(e) => e.stopPropagation?.()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}
        >
          <input
            ref={checkboxRef}
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
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {hasMoveFunds ? (
          <button
            type="button"
            className="icon-button"
            onClick={(e) => {
              e.stopPropagation?.();
              onMove?.();
            }}
            title="移动分组"
            disabled={!!actionsDisabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 6px',
              height: 28,
              minHeight: 28,
              width: 'auto',
              opacity: actionsDisabled ? 0.6 : 1,
              cursor: actionsDisabled ? 'not-allowed' : 'pointer',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--primary)',
            }}
          >
            <FolderPlusIcon width="17" height="17" />
          </button>
        ) : null}
        <button
          type="button"
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation?.();
            onRemove?.();
          }}
          title="批量删除"
          disabled={!!actionsDisabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '0 6px',
            height: 28,
            minHeight: 28,
            width: 'auto',
            opacity: actionsDisabled ? 0.6 : 1,
            cursor: actionsDisabled ? 'not-allowed' : 'pointer',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--danger)',
          }}
        >
          <TrashIcon width="17" height="17" />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation?.();
            onClose?.();
          }}
          title="完成"
          aria-label="退出编辑"
          style={{
            border: 'none',
            height: 28,
            minHeight: 28,
            width: 28,
            minWidth: 28,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            color: 'var(--text)',
          }}
        >
          <CloseIcon width="18" height="18" />
        </button>
      </div>
    </div>
  );
}

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
      <RowSortableContext.Provider value={{ setActivatorNodeRef, listeners }}>
        {typeof children === 'function' ? children(setActivatorNodeRef, listeners) : children}
      </RowSortableContext.Provider>
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
 * @param {(row: any, meta: { hasHolding: boolean }) => void} [props.onHoldingAmountClick] - 点击持仓金额
 * @param {string} [props.sortBy] - 排序方式，'default' 时可长按行进入编辑模式并在编辑态拖动排序
 * @param {(oldIndex: number, newIndex: number) => void} [props.onReorder] - 编辑模式下「拖动」列排序回调
 * @param {(row: any) => Object} [props.getFundCardProps] - 给定行返回 FundCard 的 props；传入后点击基金名称将用底部弹框展示卡片视图
 * @param {boolean} [props.masked] - 是否隐藏持仓相关金额
 * @param {string} [props.relatedSectorSessionKey] - 登录用户 id（未登录传空），用于关联板块查询缓存与登录后重新拉取
 * @param {(codes: string[]) => boolean|void} [props.onRemoveFunds] - 批量删除（与 PcFundTable 一致）；返回 false 表示父级已弹出二次确认，勿退出编辑态
 * @param {React.MutableRefObject<(() => void) | null>} [props.batchSelectionClearRef] - 父级批量删除二次确认成功后调用，用于退出移动端编辑态
 * @param {Array<{ id: string; name?: string; codes?: string[] }>} [props.groups] - 自定义分组列表（移动分组弹框用）
 * @param {(payload: { codes: string[]; fromTab: string; targetId: string; dryRun?: boolean; overwrite?: boolean }) => Promise<{ conflicts?: string[] }|void>} [props.onMoveFunds] - 批量迁移分组（与 PC 一致）
 * @param {(open: boolean) => void} [props.onFundCardDrawerOpenChange] - 基金详情底部 Drawer 打开/关闭时通知父级（用于隐藏底栏等）
 * @param {(open: boolean) => void} [props.onMobileSettingModalOpenChange] - 移动端表格「个性化设置」弹框打开/关闭时通知父级（用于隐藏底栏等）
 * @param {(row: any) => void} [props.onFundTagsClick] - 点击标签列时打开编辑标签
 */
export default function MobileFundTable({
  data = [],
  onRemoveFund,
  currentTab,
  groups = [],
  onMoveFunds,
  favorites = new Set(),
  onToggleFavorite,
  onHoldingAmountClick,
  onHoldingProfitClick, // 保留以兼容调用方，表格内已不再使用点击切换
  sortBy = 'default',
  onReorder,
  onCustomSettingsChange,
  stickyTop = 0,
  getFundCardProps,
  blockDrawerClose = false,
  closeDrawerRef,
  masked = false,
  relatedSectorSessionKey = '',
  onRemoveFunds,
  batchSelectionClearRef,
  onFundCardDrawerOpenChange,
  onMobileSettingModalOpenChange,
  onFundTagsClick,
}) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editSelectedCodes, setEditSelectedCodes] = useState(() => new Set());
  const [moveGroupOpen, setMoveGroupOpen] = useState(false);

  const editLongPressRef = useRef({ timer: null, startX: 0, startY: 0 });

  const selectableCodes = useMemo(
    () => (Array.isArray(data) ? data.map((d) => d?.code).filter(Boolean) : []),
    [data],
  );

  /** 全部/自选下「关联汇总持仓」行不参与编辑模式批量选择 */
  const batchSelectableCodes = useMemo(
    () => (Array.isArray(data) ? data.filter((d) => !d?.isHoldingLinked).map((d) => d?.code).filter(Boolean) : []),
    [data],
  );
  const batchSelectableCount = batchSelectableCodes.length;

  const editSelectedCodesList = useMemo(() => Array.from(editSelectedCodes || []), [editSelectedCodes]);

  const clearEditLongPressTimer = useCallback(() => {
    if (editLongPressRef.current.timer) {
      clearTimeout(editLongPressRef.current.timer);
      editLongPressRef.current.timer = null;
    }
  }, []);

  const exitEditMode = useCallback(() => {
    clearEditLongPressTimer();
    setIsEditMode(false);
    setEditSelectedCodes(new Set());
    setMoveGroupOpen(false);
  }, [clearEditLongPressTimer]);

  useEffect(() => {
    if (!batchSelectionClearRef) return undefined;
    batchSelectionClearRef.current = () => exitEditMode();
    return () => {
      batchSelectionClearRef.current = null;
    };
  }, [batchSelectionClearRef, exitEditMode]);

  useEffect(() => {
    setEditSelectedCodes(new Set());
  }, [currentTab]);

  useEffect(() => {
    setEditSelectedCodes((prev) => {
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
      (Array.isArray(data) ? data : [])
        .filter((d) => d && d.isHoldingLinked && d.code)
        .map((d) => d.code),
    );
    if (!linkedCodes.size) return;
    setEditSelectedCodes((prev) => {
      if (!prev?.size) return prev;
      let changed = false;
      const next = new Set(prev);
      for (const c of linkedCodes) {
        if (next.delete(c)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [data]);

  const setAllEditSelected = useCallback((nextChecked) => {
    setEditSelectedCodes(() => {
      if (!nextChecked) return new Set();
      return new Set(batchSelectableCodes);
    });
  }, [batchSelectableCodes]);

  useEffect(() => () => clearEditLongPressTimer(), [clearEditLongPressTimer]);

  // 编辑模式下「拖动」列无需长按即可拖动；非编辑模式长按整行进入编辑
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: isEditMode ? { delay: 0, tolerance: 5 } : { delay: 400, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = useState(null);
  const ignoreNextDrawerCloseRef = useRef(false);

  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onRemoveFundRef = useRef(onRemoveFund);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);
  const onFundTagsClickRef = useRef(onFundTagsClick);

  useEffect(() => {
    if (closeDrawerRef) {
      closeDrawerRef.current = () => setCardSheetRow(null);
      return () => { closeDrawerRef.current = null; };
    }
  }, [closeDrawerRef]);

  useEffect(() => {
    onToggleFavoriteRef.current = onToggleFavorite;
    onRemoveFundRef.current = onRemoveFund;
    onHoldingAmountClickRef.current = onHoldingAmountClick;
    onFundTagsClickRef.current = onFundTagsClick;
  }, [
    onToggleFavorite,
    onRemoveFund,
    onHoldingAmountClick,
    onFundTagsClick,
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
      const parsed = storageStore.getItem('customSettings') || {};
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
        storageStore.setItem('customSettings', JSON.stringify(parsed));
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
    if (vis && typeof vis === 'object' && Object.keys(vis).length > 0) {
      const next = { ...vis };
      MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
        if (next[id] === undefined) {
          next[id] = MOBILE_COLUMNS_DEFAULT_HIDDEN_IF_PERSONALIZED.has(id) ? false : true;
        }
      });
      return next;
    }
    return defaultVisibility;
  })();

  const persistMobileGroupConfig = (updates) => {
    if (typeof window === 'undefined') return;
    try {
      const parsed = storageStore.getItem('customSettings') || {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      if (updates.mobileTableColumnOrder !== undefined) group.mobileTableColumnOrder = updates.mobileTableColumnOrder;
      if (updates.mobileTableColumnVisibility !== undefined) group.mobileTableColumnVisibility = updates.mobileTableColumnVisibility;
      parsed[groupKey] = group;
      storageStore.setItem('customSettings', JSON.stringify(parsed));
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
      const parsed = storageStore.getItem('customSettings') || {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      group.mobileShowFullFundName = show;
      parsed[groupKey] = group;
      storageStore.setItem('customSettings', JSON.stringify(parsed));
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

  useEffect(() => {
    onMobileSettingModalOpenChange?.(settingModalOpen);
  }, [settingModalOpen, onMobileSettingModalOpenChange]);

  useEffect(() => {
    if (sortBy !== 'default') exitEditMode();
  }, [sortBy, exitEditMode]);

  const [cardSheetRow, setCardSheetRow] = useState(null);

  const fundCardDrawerOpen = !!(cardSheetRow && getFundCardProps);
  useEffect(() => {
    onFundCardDrawerOpenChange?.(fundCardDrawerOpen);
  }, [fundCardDrawerOpen, onFundCardDrawerOpenChange]);

  useEffect(() => {
    return () => {
      onFundCardDrawerOpenChange?.(false);
      onMobileSettingModalOpenChange?.(false);
    };
  }, [onFundCardDrawerOpenChange, onMobileSettingModalOpenChange]);

  const tableContainerRef = useRef(null);
  const portalHeaderRef = useRef(null);
  const [tableContainerWidth, setTableContainerWidth] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showPortalHeader, setShowPortalHeader] = useState(false);
  const [effectiveStickyTop, setEffectiveStickyTop] = useState(stickyTop);

  /* 捕获阶段拦截 selectstart，双保险（部分 Android WebView / iOS 上仅靠 CSS 仍会划选） */
  useLayoutEffect(() => {
    const root = tableContainerRef.current;
    if (!root) return;
    const onSelectStart = (e) => {
      e.preventDefault();
    };
    root.addEventListener('selectstart', onSelectStart, { capture: true });
    return () => root.removeEventListener('selectstart', onSelectStart, { capture: true });
  }, []);

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
      // 用“实际 DOM 的 top”判断 sticky 是否已生效，避免 mobile 下 stickyTop 入参与 GroupSummary 不一致导致的偏移。
      const computedTopStr = window.getComputedStyle(stickySummaryWrapper).top;
      const computedTop = Number.parseFloat(computedTopStr);
      const baseTop = Number.isFinite(computedTop) ? computedTop : stickyTop;
      const isSummaryStuck = wrapperRect.top <= baseTop + 1;

      // header 使用固定定位(top)，所以也用视口坐标系下的 wrapperRect.top + 高度，确保不重叠
      return isSummaryStuck ? wrapperRect.top + stickySummaryWrapper.offsetHeight : stickyTop;
    };

    const updateVerticalState = () => {
      const nextStickyTop = getEffectiveStickyTop();
      setEffectiveStickyTop((prev) => (prev === nextStickyTop ? prev : nextStickyTop));

      const tableEl = tableContainerRef.current;
      const tableRect = tableEl?.getBoundingClientRect();
      if (!tableRect) {
        setShowPortalHeader(window.scrollY >= nextStickyTop);
        return;
      }

      const headerEl = tableEl?.querySelector('.table-header-row');
      const headerHeight = headerEl?.getBoundingClientRect?.().height ?? 0;
      const hasPassedHeader = (tableRect.top + headerHeight) <= nextStickyTop;
      const hasTableInView = tableRect.bottom > nextStickyTop;

      setShowPortalHeader(hasPassedHeader && hasTableInView);
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
    [EDIT_MOVE_TO_FRONT_COL]: 72,
    [EDIT_DRAG_COL]: 72,
    tags: 120,
    relatedSector: 120,
    period1w: 72,
    period1m: 72,
    period3m: 72,
    period6m: 72,
    period1y: 72,
    latestNav: 64,
    estimateNav: 64,
    yesterdayChangePercent: 72,
    estimateChangePercent: 80,
    totalChangePercent: 80,
    holdingDays: 64,
    todayProfit: 80,
    yesterdayProfit: 80,
    holdingProfit: 80,
    holdingCost: 80,
    costNav: 64,
  };

  const relatedSectorEnabled = mobileColumnVisibility?.relatedSector !== false;
  const relatedSectorCacheRef = useRef(new Map());
  const [relatedSectorByCode, setRelatedSectorByCode] = useState({});
  const [sectorQuoteByLabel, setSectorQuoteByLabel] = useState({});

  const sectorAuthSegment = relatedSectorSessionKey || 'anon';

  const fetchRelatedSector = useCallback(
    (code) => fetchRelatedSectors(code, { authSegment: sectorAuthSegment }),
    [sectorAuthSegment],
  );

  useEffect(() => {
    relatedSectorCacheRef.current.clear();
    setRelatedSectorByCode({});
    setSectorQuoteByLabel({});
  }, [sectorAuthSegment]);

  useEffect(() => {
    if (!relatedSectorEnabled) return;
    if (!Array.isArray(data) || data.length === 0) return;

    const codes = Array.from(new Set(data.map((d) => d?.code).filter(Boolean)));
    const missing = codes.filter((code) => !relatedSectorCacheRef.current.has(code));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      await asyncPool(4, missing, async (code) => {
        const value = await fetchRelatedSector(code);
        relatedSectorCacheRef.current.set(code, value);
        if (cancelled) return;
        setRelatedSectorByCode((prev) => {
          if (prev[code] === value) return prev;
          return { ...prev, [code]: value };
        });
      });
    })();

    return () => { cancelled = true; };
  }, [relatedSectorEnabled, data, sectorAuthSegment, fetchRelatedSector]);

  useEffect(() => {
    if (!relatedSectorEnabled) return;
    if (!Array.isArray(data) || data.length === 0) return;

    const labels = new Set();
    for (const row of data) {
      const code = row?.code;
      const lbl = code && relatedSectorByCode[code];
      const t = lbl != null ? String(lbl).trim() : '';
      if (t) labels.add(t);
    }
    if (labels.size === 0) return;

    let cancelled = false;
    (async () => {
      await asyncPool(4, [...labels], async (label) => {
        const quote = await fetchRelatedSectorLiveQuote(label);
        if (cancelled) return;
        setSectorQuoteByLabel((prev) => {
          const prevQ = prev[label];
          if (prevQ === quote) return prev;
          if (
            prevQ &&
            quote &&
            prevQ.pct === quote.pct &&
            prevQ.name === quote.name &&
            prevQ.code === quote.code
          ) {
            return prev;
          }
          return { ...prev, [label]: quote };
        });
      });
    })();

    return () => { cancelled = true; };
  }, [relatedSectorEnabled, data, relatedSectorByCode]);

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
          relatedSectorQuotePct: hasQuotePct ? quotePct : null,
        },
      };
    },
    [relatedSectorByCode, sectorQuoteByLabel],
  );

  const getFundCardPropsWithRelatedSector = useCallback(
    (row) => {
      if (!getFundCardProps) return {};
      return getFundCardProps(withRelatedSectorFund(row));
    },
    [getFundCardProps, withRelatedSectorFund],
  );

  const periodReturnsEnabled =
    mobileColumnVisibility?.period1w !== false
    || mobileColumnVisibility?.period1m !== false
    || mobileColumnVisibility?.period3m !== false
    || mobileColumnVisibility?.period6m !== false
    || mobileColumnVisibility?.period1y !== false;
  const periodReturnsCacheRef = useRef(new Map());
  const [periodReturnsByCode, setPeriodReturnsByCode] = useState({});

  useEffect(() => {
    if (!periodReturnsEnabled) return;
    if (!Array.isArray(data) || data.length === 0) return;

    const codes = Array.from(new Set(data.map((d) => d?.code).filter(Boolean)));
    const missing = codes.filter((code) => !periodReturnsCacheRef.current.has(code));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      await asyncPool(4, missing, async (code) => {
        const value = await fetchFundPeriodReturns(code);
        periodReturnsCacheRef.current.set(code, value);
        if (cancelled) return;
        setPeriodReturnsByCode((prev) => {
          const prevVal = prev[code];
          if (
            prevVal
            && prevVal.week === value.week
            && prevVal.month === value.month
            && prevVal.month3 === value.month3
            && prevVal.month6 === value.month6
            && prevVal.year1 === value.year1
          ) {
            return prev;
          }
          return { ...prev, [code]: value };
        });
      });
    })();

    return () => { cancelled = true; };
  }, [periodReturnsEnabled, data]);

  const columnWidthMap = useMemo(() => {
    const visibleNonNameIds = mobileColumnOrder.filter((id) => mobileColumnVisibility[id] !== false);
    const nonNameCount = visibleNonNameIds.length;

    const mapWithEditAndData = (fundNameWidth, w) => {
      const map = {
        fundName: fundNameWidth,
        [EDIT_MOVE_TO_FRONT_COL]: w,
        [EDIT_DRAG_COL]: w,
      };
      MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
        map[id] = w;
      });
      return map;
    };

    if (isEditMode && tableContainerWidth > 0) {
      let fundNameWidth = NAME_CELL_WIDTH;
      if (nonNameCount >= 3) {
        const remainingThree = tableContainerWidth - NAME_CELL_WIDTH - 3 * GAP - LAST_COLUMN_EXTRA;
        const widthOfOneInThreeLayout = Math.max(48, Math.floor(remainingThree / 3));
        fundNameWidth = NAME_CELL_WIDTH + widthOfOneInThreeLayout;
      }
      const gapTotal = 2 * GAP;
      const remaining = tableContainerWidth - fundNameWidth - gapTotal - LAST_COLUMN_EXTRA;
      const w = Math.max(48, Math.floor(remaining / 2));
      return mapWithEditAndData(fundNameWidth, w);
    }

    if (tableContainerWidth > 0 && nonNameCount > 0) {
      const gapTotal = nonNameCount >= 3 ? 3 * GAP : nonNameCount * GAP;
      const remaining = tableContainerWidth - NAME_CELL_WIDTH - gapTotal - LAST_COLUMN_EXTRA;
      const divisor = nonNameCount >= 3 ? 3 : nonNameCount;
      const otherColumnWidth = Math.max(48, Math.floor(remaining / divisor));
      return mapWithEditAndData(NAME_CELL_WIDTH, otherColumnWidth);
    }

    if (isEditMode && nonNameCount >= 3) {
      const w = FALLBACK_WIDTHS.relatedSector;
      return { ...FALLBACK_WIDTHS, fundName: NAME_CELL_WIDTH + w };
    }
    return { ...FALLBACK_WIDTHS };
  }, [tableContainerWidth, mobileColumnOrder, mobileColumnVisibility, isEditMode]);

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

  const isCustomGroupTab = Boolean(currentTab && currentTab !== 'all' && currentTab !== 'fav');

  // 移动端名称列：默认排序下长按整行进入编辑模式
  const MobileFundNameCell = ({ info, showFullFundName, onOpenCardSheet }) => {
    const original = info.row.original || {};
    const code = original.code;
    const isUpdated = original.isUpdated;
    const hasDca = original.hasDca;
    const hasHoldingAmount = original.holdingAmountValue != null;
    const holdingAmountDisplay = hasHoldingAmount ? (original.holdingAmount ?? '—') : null;
    const isFavorites = favorites?.has?.(code);
    const isGroupTab = isCustomGroupTab;
    // 需求：移动端「表格模式」下，自定义分组的正常模式隐藏删除按钮（删除入口统一收敛到编辑模式的批量删除）
    const showGroupDeleteButton = false;
    const editSelected = code ? editSelectedCodes.has(code) : false;
    const holdingLocked =
      (currentTab === 'all' || currentTab === 'fav') &&
      !!original.isHoldingLinked;
    const holdingLockedTitle = '持仓来自自定义分组汇总，无法在「全部/自选」设置持仓金额';

    if (isEditMode) {
      return (
        <div className="name-cell-content" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            title={holdingLocked ? '关联持仓不可批量选择' : '选择用于批量操作'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: 26,
              height: 26,
              marginRight: 4,
              cursor: holdingLocked ? 'not-allowed' : 'pointer',
              opacity: holdingLocked ? 0.45 : 1,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              disabled={holdingLocked}
              checked={!holdingLocked && editSelected}
              onChange={() => {
                if (!code || holdingLocked) return;
                setEditSelectedCodes((prev) => {
                  const next = new Set(prev);
                  if (next.has(code)) next.delete(code);
                  else next.add(code);
                  return next;
                });
              }}
              style={{
                width: 18,
                height: 18,
                accentColor: 'var(--primary)',
                cursor: holdingLocked ? 'not-allowed' : 'pointer',
              }}
            />
          </label>
          <div className="title-text">
            <span
              className={`name-text ${showFullFundName ? 'show-full' : ''}`}
              title={isUpdated ? '今日净值已更新' : undefined}
            >
              {holdingLocked ? (
                <span
                  title="持仓来自自定义分组汇总"
                  aria-label="已关联持仓"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginRight: 6,
                    color: 'var(--primary)',
                    verticalAlign: 'middle',
                    marginBottom: 2,
                    position: 'relative',
                  }}
                >
                  <LinkIcon width="14" height="14" />
                </span>
              ) : null}
              {info.getValue() ?? '—'}
            </span>
            {holdingAmountDisplay ? (
              <span className="muted code-text">
                {masked ? <span className="mask-text">******</span> : holdingAmountDisplay}
                {hasDca && <span className="dca-indicator">定</span>}
                {isUpdated && <span className="updated-indicator">✓</span>}
              </span>
            ) : code ? (
              <span className="muted code-text">
                #{code}
                {hasDca && <span className="dca-indicator">定</span>}
                {isUpdated && <span className="updated-indicator">✓</span>}
              </span>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div className="name-cell-content" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: isCustomGroupTab? 0 : -4 }}>
        {isGroupTab ? (
          showGroupDeleteButton ? (
            <button
              type="button"
              className="icon-button"
              onClick={(e) => {
                e.stopPropagation?.();
                onRemoveFundRef.current?.(original);
              }}
              title="删除"
              style={{
                backgroundColor: 'transparent',
                flexShrink: 0,
                opacity: 1,
                cursor: 'pointer',
                border: 'none',
                height: 26,
                width: 26,
                marginRight: 4
              }}
            >
              <TrashIcon width="18" height="18" />
            </button>
          ) : null
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
            {holdingLocked ? (
              <span
                title="持仓来自自定义分组汇总"
                aria-label="已关联持仓"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginRight: 6,
                  color: 'var(--primary)',
                  verticalAlign: 'middle',
                  bottom: 2,
                  position: 'relative',
                }}
              >
                <LinkIcon width="14" height="14" />
              </span>
            ) : null}
            {info.getValue() ?? '—'}
          </span>
          {holdingAmountDisplay ? (
            <span
              className="muted code-text"
              role={holdingLocked ? undefined : 'button'}
              tabIndex={holdingLocked ? -1 : 0}
              title={holdingLocked ? holdingLockedTitle : '点击设置持仓'}
              style={{ cursor: holdingLocked ? 'not-allowed' : 'pointer' }}
              onClick={(e) => {
                e.stopPropagation?.();
                if (holdingLocked) return;
                onHoldingAmountClickRef.current?.(original, { hasHolding: true });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (holdingLocked) return;
                  onHoldingAmountClickRef.current?.(original, { hasHolding: true });
                }
              }}
            >
              {masked ? <span className="mask-text">******</span> : holdingAmountDisplay}
              {hasDca && <span className="dca-indicator">定</span>}
              {isUpdated && <span className="updated-indicator">✓</span>}
            </span>
          ) : code ? (
            <span
              className="muted code-text"
              role={holdingLocked ? undefined : 'button'}
              tabIndex={holdingLocked ? -1 : 0}
              title={holdingLocked ? holdingLockedTitle : '设置持仓'}
              style={{ cursor: holdingLocked ? 'not-allowed' : 'pointer' }}
              onClick={(e) => {
                e.stopPropagation?.();
                if (holdingLocked) return;
                onHoldingAmountClickRef.current?.(original, { hasHolding: false });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (holdingLocked) return;
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
        header: () => {
          if (isEditMode) {
            const allCount = batchSelectableCount;
            const selectedCount = editSelectedCodes.size;
            const checked = allCount > 0 && selectedCount === allCount;
            const indeterminate = selectedCount > 0 && selectedCount < allCount;
            return (
              <MobileEditBatchHeader
                totalCount={allCount}
                selectedCount={selectedCount}
                checked={checked}
                indeterminate={indeterminate}
                onToggleAll={setAllEditSelected}
                onMove={() => {
                  if (!onMoveFunds || selectedCount === 0) return;
                  setMoveGroupOpen(true);
                }}
                onRemove={() => {
                  if (!onRemoveFunds || selectedCount === 0) return;
                  const codes = Array.from(editSelectedCodes);
                  const shouldClear = onRemoveFunds(codes);
                  if (shouldClear !== false) exitEditMode();
                }}
                onClose={exitEditMode}
                hasMoveFunds={!!onMoveFunds}
              />
            );
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6 }}>
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
              {sortBy === 'default' && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation?.();
                    clearEditLongPressTimer();
                    setIsEditMode(true);
                    setEditSelectedCodes(new Set());
                  }}
                  title="编辑"
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
                    opacity: 1,
                    cursor: 'pointer',
                  }}
                >
                  <PencilIcon width="18" height="18" />
                </button>
              )}
            </div>
          );
        },
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
        id: EDIT_MOVE_TO_FRONT_COL,
        header: '移到最前',
        cell: (info) => {
          const code = info.row.original?.code;
          const idx = code ? data.findIndex((d) => d.code === code) : -1;
          const canMove = sortBy === 'default' && idx > 0 && onReorder;
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
              <button
                type="button"
                className="link-button"
                disabled={!canMove}
                title={idx <= 0 ? '已在最前' : '移到最前'}
                aria-label={idx <= 0 ? '已在最前' : '移到最前'}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 6px',
                  border: 'none',
                  background: 'transparent',
                  color: canMove ? 'var(--primary)' : 'var(--muted)',
                  cursor: !canMove ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canMove) return;
                  onReorder(idx, 0);
                }}
              >
                <ArrowUpToLineIcon width={18} height={18} aria-hidden />
              </button>
            </div>
          );
        },
        meta: { align: 'center', cellClassName: 'mobile-edit-action-cell', width: columnWidthMap[EDIT_MOVE_TO_FRONT_COL] },
      },
      {
        id: EDIT_DRAG_COL,
        header: '拖动',
        cell: () => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <EditDragHandleCell disabled={sortBy !== 'default'} />
          </div>
        ),
        meta: { align: 'center', cellClassName: 'mobile-edit-action-cell', width: columnWidthMap[EDIT_DRAG_COL] },
      },
      {
        id: 'tags',
        header: '基金标签',
        cell: (info) => {
          const original = info.row.original || {};
          const list = Array.isArray(original.fundTags) ? original.fundTags : [];
          const hasTags = list.length > 0;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation?.();
                onFundTagsClickRef.current?.(original);
              }}
              style={{
                width: '100%',
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                padding: '2px 0',
                cursor: onFundTagsClick ? 'pointer' : 'default',
                textAlign: 'left',
              }}
              disabled={!onFundTagsClick}
              title={onFundTagsClick ? '编辑标签' : undefined}
            >
              {hasTags ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 4,
                    justifyContent: 'flex-end',
                  }}
                >
                  {list.map((raw, idx) => {
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
                        className={cn('text-[11px] font-normal', themeCls)}
                      >
                        {item.name}
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                 <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>—</div>
        )}
            </button>
          );
        },
        meta: { align: 'right', cellClassName: 'tags-cell', width: columnWidthMap.tags ?? 120 },
      },
      {
        id: 'relatedSector',
        header: '关联板块',
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
                gap: 2,
              }}
            >
              <span
                title={firstLine !== '—' ? firstLine : undefined}
                style={{
                  display: 'block',
                  width: '100%',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'right',
                  fontSize: '12px',
                }}
              >
                {firstLine}
              </span>
              {pctText != null ? (
                <span
                  className={pctCls}
                  style={{ fontSize: '10px', fontWeight: 600, textAlign: 'right' }}
                >
                  {pctText}
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'related-sector-cell', width: columnWidthMap.relatedSector ?? 120 },
      },
      {
        id: 'period1w',
        header: '近1周',
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.week : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
              <FitText className={cls} style={{ fontWeight: 700, textAlign: 'right' }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell', width: columnWidthMap.period1w ?? 72 },
      },
      {
        id: 'period1m',
        header: '近1月',
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.month : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
              <FitText className={cls} style={{ fontWeight: 700, textAlign: 'right' }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell', width: columnWidthMap.period1m ?? 72 },
      },
      {
        id: 'period3m',
        header: '近3月',
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.month3 : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
              <FitText className={cls} style={{ fontWeight: 700, textAlign: 'right' }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell', width: columnWidthMap.period3m ?? 72 },
      },
      {
        id: 'period6m',
        header: '近6月',
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.month6 : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
              <FitText className={cls} style={{ fontWeight: 700, textAlign: 'right' }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell', width: columnWidthMap.period6m ?? 72 },
      },
      {
        id: 'period1y',
        header: '近1年',
        cell: (info) => {
          const original = info.row.original || {};
          const code = original.code;
          const value = code ? periodReturnsByCode[code]?.year1 : null;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
              <FitText className={cls} style={{ fontWeight: 700, textAlign: 'right' }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell', width: columnWidthMap.period1y ?? 72 },
      },
      {
        accessorKey: 'holdingCost',
        header: '持仓成本',
        cell: (info) => {
          const original = info.row.original || {};
          if (original.holdingCostValue == null) {
            return <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>—</div>;
          }
          return (
              <FitText style={{ fontWeight: 700, textAlign: 'right' }} maxFontSize={14} minFontSize={10}>
                {masked ? <span className="mask-text">******</span> : (info.getValue() ?? '—')}
              </FitText>
          );
        },
        meta: { align: 'right', cellClassName: 'holding-cost-cell', width: columnWidthMap.holdingCost ?? 80 },
      },
      {
        accessorKey: 'costNav',
        header: '成本净值',
        cell: (info) => {
          const original = info.row.original || {};
          if (original.costNavValue == null) {
            return <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>—</div>;
          }
          return (
              <FitText style={{ fontWeight: 700, textAlign: 'right' }} maxFontSize={14} minFontSize={10}>
                {masked ? <span className="mask-text">******</span> : (info.getValue() ?? '—')}
              </FitText>
          );
        },
        meta: { align: 'right', cellClassName: 'cost-nav-cell', width: columnWidthMap.costNav ?? 64 },
      },
      {
        accessorKey: 'latestNav',
        header: '最新净值',
        cell: (info) => {
          const original = info.row.original || {};
          const date = original.latestNavDate ?? '-';
          const displayDate = typeof date === 'string' && date.length > 5 ? date.slice(5) : date;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span style={{ display: 'block', width: '100%', fontWeight: 700 }}>
                <FitText maxFontSize={14} minFontSize={10}>
                  {info.getValue() ?? '—'}
                </FitText>
              </span>
              <span className="muted" style={{ fontSize: '10px' }}>{displayDate}</span>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'value-cell', width: columnWidthMap.latestNav },
      },
      {
        accessorKey: 'estimateNav',
        header: '估算净值',
        cell: (info) => {
          const original = info.row.original || {};
          const date = original.estimateNavDate ?? '-';
          const displayDate = typeof date === 'string' && date.length > 5 ? date.slice(5) : date;
          const estimateNav = info.getValue();
          const hasEstimateNav = estimateNav != null && estimateNav !== '—';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span style={{ display: 'block', width: '100%', fontWeight: 700 }}>
                <FitText maxFontSize={14} minFontSize={10}>
                  {estimateNav ?? '—'}
                </FitText>
              </span>
              {hasEstimateNav && displayDate && displayDate !== '-' ? (
                <span className="muted" style={{ fontSize: '10px' }}>{displayDate}</span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'value-cell', width: columnWidthMap.estimateNav },
      },
      {
        accessorKey: 'yesterdayChangePercent',
        header: '最新涨幅',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.yesterdayChangeValue;
          const date = original.yesterdayDate ?? '-';
          const displayDate = typeof date === 'string' && date.length > 5 ? date.slice(5) : date;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span className={cls} style={{ fontWeight: 700 }}>
                {info.getValue() ?? '—'}
              </span>
              <span className="muted" style={{ fontSize: '10px' }}>{displayDate}</span>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'change-cell', width: columnWidthMap.yesterdayChangePercent },
      },
      {
        accessorKey: 'estimateChangePercent',
        header: '估算涨幅',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateChangeValue;
          const isMuted = original.estimateChangeMuted;
          const time = original.estimateTime ?? '-';
          const displayTime = typeof time === 'string' && time.length > 5 ? time.slice(5) : time;
          const cls = isMuted ? 'muted' : value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = info.getValue();
          const hasText = text != null && text !== '—';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <span className={cls} style={{ fontWeight: 700 }}>
                {text ?? '—'}
              </span>
              {hasText && displayTime && displayTime !== '-' ? (
                <span className="muted" style={{ fontSize: '10px' }}>{displayTime}</span>
              ) : null}
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
                  {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
                </FitText>
              </span>
              {hasProfit && percentStr && !masked ? (
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
        accessorKey: 'holdingDays',
        header: '持有天数',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.holdingDaysValue;
          if (value == null) {
            return <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>—</div>;
          }
          return (
            <div style={{ fontWeight: 700, textAlign: 'right' }}>
              {value}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'holding-days-cell', width: columnWidthMap.holdingDays ?? 64 },
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
                  {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
                </FitText>
              </span>
              {percentStr && !masked ? (
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
        accessorKey: 'yesterdayProfit',
        header: '昨日收益',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.yesterdayProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          const amountStr = hasProfit ? (info.getValue() ?? '') : '—';
          const percentStr = original.yesterdayProfitPercent ?? '';
          const pctVal = original.yesterdaySecondLinePctValue;
          const pctCls = pctVal != null && Number.isFinite(pctVal)
            ? (pctVal > 0 ? 'up' : pctVal < 0 ? 'down' : '')
            : 'muted';
          return (
            <div style={{ width: '100%' }}>
              <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 700 }}>
                <FitText maxFontSize={14} minFontSize={10}>
                  {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
                </FitText>
              </span>
              {percentStr && !masked ? (
                <span className={`${pctCls} yesterday-profit-percent`} style={{ display: 'block', width: '100%', fontSize: '0.75em', opacity: 0.9, fontWeight: 500 }}>
                  <FitText maxFontSize={11} minFontSize={9}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'yesterday-profit-cell', width: columnWidthMap.yesterdayProfit ?? 80 },
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
                  {masked && hasTotal ? <span className="mask-text">******</span> : amountStr}
                </FitText>
              </span>
              {percentStr && !masked ? (
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
    [
      currentTab,
      favorites,
      columnWidthMap,
      showFullFundName,
      getFundCardProps,
      sortBy,
      relatedSectorByCode,
      sectorQuoteByLabel,
      periodReturnsByCode,
      isEditMode,
      editSelectedCodes,
      exitEditMode,
      onMoveFunds,
      onRemoveFunds,
      clearEditLongPressTimer,
      masked,
      onReorder,
      data,
      selectableCodes,
      batchSelectableCount,
      setAllEditSelected,
      onFundTagsClick,
    ]
  );

  const tableColumnOrder = useMemo(
    () => (isEditMode ? ['fundName', EDIT_MOVE_TO_FRONT_COL, EDIT_DRAG_COL] : ['fundName', ...mobileColumnOrder]),
    [isEditMode, mobileColumnOrder],
  );

  const tableColumnVisibility = useMemo(() => {
    const dataVis = {};
    MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
      dataVis[id] = isEditMode ? false : mobileColumnVisibility[id] !== false;
    });
    return {
      fundName: true,
      [EDIT_MOVE_TO_FRONT_COL]: isEditMode,
      [EDIT_DRAG_COL]: isEditMode,
      ...dataVis,
    };
  }, [isEditMode, mobileColumnVisibility]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnOrder: tableColumnOrder,
      columnVisibility: tableColumnVisibility,
    },
    onColumnOrderChange: (updater) => {
      if (isEditMode) return;
      const next = typeof updater === 'function' ? updater(['fundName', ...mobileColumnOrder]) : updater;
      const newNonFrozen = next.filter(
        (id) => id !== 'fundName' && id !== EDIT_MOVE_TO_FRONT_COL && id !== EDIT_DRAG_COL,
      );
      if (newNonFrozen.length) {
        setMobileColumnOrder(newNonFrozen);
      }
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ fundName: true, ...mobileColumnVisibility }) : updater;
      const rest = { ...next };
      delete rest.fundName;
      delete rest[EDIT_MOVE_TO_FRONT_COL];
      delete rest[EDIT_DRAG_COL];
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
  }, [headerGroup?.headers?.length, columnWidthMap, mobileColumnOrder, isEditMode]);

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
    if (columnId === EDIT_MOVE_TO_FRONT_COL || columnId === EDIT_DRAG_COL) return 'text-center';
    if (['latestNav', 'estimateNav', 'yesterdayChangePercent', 'estimateChangePercent', 'totalChangePercent', 'holdingDays', 'todayProfit', 'yesterdayProfit', 'holdingProfit', 'holdingCost', 'costNav', 'period1w', 'period1m', 'period3m', 'period6m', 'period1y', 'tags'].includes(columnId)) return 'text-right';
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
                  {table.getRowModel().rows.map((row, index) => (
                    <SortableRow
                      key={row.original.code || row.id}
                      row={row}
                      isTableDragging={!!activeId}
                      disabled={sortBy !== 'default' || !isEditMode}
                    >
                      {() => (
                        <div
                          className="table-row"
                          style={{
                            background: index % 2 === 0 ? 'var(--bg)' : 'var(--table-row-alt-bg)',
                            position: 'relative',
                            zIndex: 1,
                            WebkitUserSelect: 'none',
                            userSelect: 'none',
                            WebkitTouchCallout: 'none',
                            touchAction: isEditMode ? 'auto' : 'pan-x pan-y',
                            ...(mobileGridLayout.gridTemplateColumns ? { gridTemplateColumns: mobileGridLayout.gridTemplateColumns } : {}),
                          }}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                          onPointerDown={(e) => {
                            if (sortBy !== 'default' || isEditMode) return;
                            if (e.button !== 0 && e.pointerType === 'mouse') return;
                            const c = row.original?.code;
                            if (!c) return;
                            editLongPressRef.current.startX = e.clientX;
                            editLongPressRef.current.startY = e.clientY;
                            clearEditLongPressTimer();
                            editLongPressRef.current.timer = setTimeout(() => {
                              editLongPressRef.current.timer = null;
                              try {
                                const sel = typeof window !== 'undefined' && window.getSelection?.();
                                if (sel?.removeAllRanges) sel.removeAllRanges();
                              } catch { /* empty */ }
                              setIsEditMode(true);
                              const linked = !!row.original?.isHoldingLinked;
                              setEditSelectedCodes(linked ? new Set() : new Set([c]));
                            }, 550);
                          }}
                          onPointerMove={(e) => {
                            if (!editLongPressRef.current.timer) return;
                            const dx = Math.abs(e.clientX - editLongPressRef.current.startX);
                            const dy = Math.abs(e.clientY - editLongPressRef.current.startY);
                            if (dx > 12 || dy > 12) clearEditLongPressTimer();
                          }}
                          onPointerUp={clearEditLongPressTimer}
                          onPointerCancel={clearEditLongPressTimer}
                        >
                          {row.getVisibleCells().map((cell, cellIndex) => {
                            const columnId = cell.column.id;
                            const pinClass = getPinClass(columnId, false);
                            const alignClass = getAlignClass(columnId);
                            const cellClassName = cell.column.columnDef.meta?.cellClassName || '';
                            const isLastColumn = cellIndex === row.getVisibleCells().length - 1;
                            const style = isLastColumn ? {paddingRight: LAST_COLUMN_EXTRA} : {};
                            if (cellIndex  === 0) {
                              if (index % 2 !== 0) {
                                style.background = 'var(--table-row-alt-bg)';
                              }else {
                                style.background = 'var(--bg)';
                              }
                            }
                            return (
                              <div
                                key={cell.id}
                                className={`table-cell ${alignClass} ${cellClassName} ${pinClass}`}
                                style={style}
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

        <MobileFundCardDrawer
          open={!!(cardSheetRow && getFundCardProps)}
          onOpenChange={(open) => { if (!open) setCardSheetRow(null); }}
          blockDrawerClose={blockDrawerClose || moveGroupOpen}
          ignoreNextDrawerCloseRef={ignoreNextDrawerCloseRef}
          cardSheetRow={cardSheetRow}
          getFundCardProps={getFundCardPropsWithRelatedSector}
        />

        {!onlyShowHeader && showPortalHeader && ReactDOM.createPortal(renderContent(true), document.body)}

        {!onlyShowHeader && moveGroupOpen && (
          <MoveGroupModal
            open={moveGroupOpen}
            onClose={() => setMoveGroupOpen(false)}
            fromTab={currentTab}
            groups={groups}
            selectedCodes={editSelectedCodesList}
            disabled={editSelectedCodes.size === 0}
            onMoveFunds={async (payload) => {
              const res = await onMoveFunds?.(payload);
              if (payload?.dryRun) return res;
              setEditSelectedCodes(new Set());
              return res;
            }}
          />
        )}
      </div>
    );
  };

  return (
    <>
      {renderContent()}
    </>
  );
}
