'use client';

import ReactDOM from 'react-dom';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { throttle } from 'lodash';
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
import ConfirmModal from './ConfirmModal';
import FitText from './FitText';
import PcTableSettingModal from './PcTableSettingModal';
import FundCard from './FundCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DragIcon, ExitIcon, SettingsIcon, StarIcon, TrashIcon, ResetIcon } from './Icons';
import { fetchRelatedSectors } from '@/app/api/fund';

const NON_FROZEN_COLUMN_IDS = [
  'relatedSector',
  'yesterdayChangePercent',
  'estimateChangePercent',
  'totalChangePercent',
  'holdingAmount',
  'holdingDays',
  'todayProfit',
  'holdingProfit',
  'latestNav',
  'estimateNav',
];

const COLUMN_HEADERS = {
  relatedSector: '关联板块',
  latestNav: '最新净值',
  estimateNav: '估算净值',
  yesterdayChangePercent: '昨日涨幅',
  estimateChangePercent: '估值涨幅',
  totalChangePercent: '估算收益',
  holdingAmount: '持仓金额',
  holdingDays: '持有天数',
  todayProfit: '当日收益',
  holdingProfit: '持有收益',
};

const SortableRowContext = createContext({
  setActivatorNodeRef: null,
  listeners: null,
});

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

  const contextValue = useMemo(
    () => ({ setActivatorNodeRef, listeners }),
    [setActivatorNodeRef, listeners]
  );

  return (
    <SortableRowContext.Provider value={contextValue}>
      <motion.div
        ref={setNodeRef}
        className="table-row-wrapper"
        layout={isTableDragging ? undefined : "position"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ ...style, position: 'relative' }}
        {...attributes}
      >
        {children}
      </motion.div>
    </SortableRowContext.Provider>
  );
}

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
 *     yesterdayChangePercent: string|number; // 昨日涨幅
 *     estimateChangePercent: string|number;  // 估值涨幅
 *     holdingAmount: string|number;         // 持仓金额
 *     todayProfit: string|number;           // 当日收益
 *     holdingProfit: string|number;         // 持有收益
 *   }
 * @param {(row: any) => void} [props.onRemoveFund] - 删除基金的回调
 * @param {string} [props.currentTab] - 当前分组
 * @param {Set<string>} [props.favorites] - 自选集合
 * @param {(row: any) => void} [props.onToggleFavorite] - 添加/取消自选
 * @param {(row: any) => void} [props.onRemoveFromGroup] - 从当前分组移除
 * @param {(row: any, meta: { hasHolding: boolean }) => void} [props.onHoldingAmountClick] - 点击持仓金额
 * @param {boolean} [props.refreshing] - 是否处于刷新状态（控制删除按钮禁用态）
 * @param {(row: any) => Object} [props.getFundCardProps] - 给定行返回 FundCard 的 props；传入后点击基金名称将用弹框展示卡片详情
 * @param {React.MutableRefObject<(() => void) | null>} [props.closeDialogRef] - 注入关闭弹框的方法，用于确认删除时关闭
 * @param {boolean} [props.blockDialogClose] - 为 true 时阻止点击遮罩关闭弹框（如删除确认弹框打开时）
 * @param {number} [props.stickyTop] - 表头固定时的 top 偏移（与 MobileFundTable 一致，用于适配导航栏、筛选栏等）
 * @param {boolean} [props.masked] - 是否隐藏持仓相关金额
 */
export default function PcFundTable({
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
  getFundCardProps,
  closeDialogRef,
  blockDialogClose = false,
  stickyTop = 0,
  masked = false,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = useState(null);
  const [cardDialogRow, setCardDialogRow] = useState(null);
  const tableContainerRef = useRef(null);
  const portalHeaderRef = useRef(null);
  const [showPortalHeader, setShowPortalHeader] = useState(false);
  const [effectiveStickyTop, setEffectiveStickyTop] = useState(stickyTop);
  const [portalHorizontal, setPortalHorizontal] = useState({ left: 0, right: 0 });

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = data.findIndex(item => item.code === active.id);
      const newIndex = data.findIndex(item => item.code === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && onReorder) {
        onReorder(oldIndex, newIndex);
      }
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

  const buildPcConfigFromGroup = (group) => {
    if (!group || typeof group !== 'object') return null;
    const sizing = group.pcTableColumns;
    const sizingObj = sizing && typeof sizing === 'object'
      ? Object.fromEntries(Object.entries(sizing).filter(([, v]) => Number.isFinite(v)))
      : {};
    if (sizingObj.actions) {
      const { actions, ...rest } = sizingObj;
      Object.assign(sizingObj, rest);
      delete sizingObj.actions;
    }
    const order = Array.isArray(group.pcTableColumnOrder) && group.pcTableColumnOrder.length > 0
      ? group.pcTableColumnOrder
      : null;
    const visibility = group.pcTableColumnVisibility && typeof group.pcTableColumnVisibility === 'object'
      ? group.pcTableColumnVisibility
      : null;
    return { sizing: sizingObj, order, visibility };
  };

  const getDefaultPcGroupConfig = () => ({
    order: [...NON_FROZEN_COLUMN_IDS],
    visibility: null,
    sizing: {},
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
          pcTableColumnOrder: pc.order ? (() => {
            const valid = pc.order.filter((id) => NON_FROZEN_COLUMN_IDS.includes(id));
            const missing = NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
            return [...valid, ...missing];
          })() : null,
          pcTableColumnVisibility: pc.visibility,
          pcTableColumns: Object.keys(pc.sizing).length ? pc.sizing : null,
          pcShowFullFundName: group.pcShowFullFundName === true,
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
    if (!Array.isArray(order) || order.length === 0) return [...NON_FROZEN_COLUMN_IDS];
    const valid = order.filter((id) => NON_FROZEN_COLUMN_IDS.includes(id));
    const missing = NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  })();
  const columnVisibility = (() => {
    const vis = currentGroupPc?.pcTableColumnVisibility ?? null;
    if (vis && typeof vis === 'object' && Object.keys(vis).length > 0) {
      const next = { ...vis };
      if (next.relatedSector === undefined) next.relatedSector = false;
      if (next.holdingDays === undefined) next.holdingDays = false;
      return next;
    }
    const allVisible = {};
    NON_FROZEN_COLUMN_IDS.forEach((id) => { allVisible[id] = true; });
    // 新增列：默认隐藏（用户可在表格设置中开启）
      allVisible.relatedSector = false;
      allVisible.holdingDays = false;
      return allVisible;
  })();
  const columnSizing = (() => {
    const s = currentGroupPc?.pcTableColumns;
    if (s && typeof s === 'object') {
      const out = Object.fromEntries(Object.entries(s).filter(([, v]) => Number.isFinite(v)));
      if (out.actions) {
        const { actions, ...rest } = out;
        return rest;
      }
      return out;
    }
    return {};
  })();

  const persistPcGroupConfig = (updates) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      if (updates.pcTableColumnOrder !== undefined) group.pcTableColumnOrder = updates.pcTableColumnOrder;
      if (updates.pcTableColumnVisibility !== undefined) group.pcTableColumnVisibility = updates.pcTableColumnVisibility;
      if (updates.pcTableColumns !== undefined) group.pcTableColumns = updates.pcTableColumns;
      if (updates.pcShowFullFundName !== undefined) group.pcShowFullFundName = updates.pcShowFullFundName;
      parsed[groupKey] = group;
      window.localStorage.setItem('customSettings', JSON.stringify(parsed));
      setConfigByGroup((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], ...updates } }));
      onCustomSettingsChange?.();
    } catch { }
  };

  const handleToggleShowFullFundName = (show) => {
    persistPcGroupConfig({ pcShowFullFundName: show });
  };

  const setColumnOrder = (nextOrderOrUpdater) => {
    const next = typeof nextOrderOrUpdater === 'function'
      ? nextOrderOrUpdater(columnOrder)
      : nextOrderOrUpdater;
    persistPcGroupConfig({ pcTableColumnOrder: next });
  };
  const setColumnVisibility = (nextOrUpdater) => {
    const next = typeof nextOrUpdater === 'function'
      ? nextOrUpdater(columnVisibility)
      : nextOrUpdater;
    persistPcGroupConfig({ pcTableColumnVisibility: next });
  };
  const setColumnSizing = (nextOrUpdater) => {
    const next = typeof nextOrUpdater === 'function'
      ? nextOrUpdater(columnSizing)
      : nextOrUpdater;
    const { actions, ...rest } = next || {};
    persistPcGroupConfig({ pcTableColumns: rest || {} });
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
      allVisible[id] = true;
    });
    allVisible.relatedSector = false;
    allVisible.holdingDays = false;
    setColumnVisibility(allVisible);
  };
  const handleToggleColumnVisibility = (columnId, visible) => {
    setColumnVisibility((prev = {}) => ({ ...prev, [columnId]: visible }));
  };
  const onRemoveFundRef = useRef(onRemoveFund);
  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onRemoveFromGroupRef = useRef(onRemoveFromGroup);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);

  useEffect(() => {
    if (closeDialogRef) {
      closeDialogRef.current = () => setCardDialogRow(null);
      return () => { closeDialogRef.current = null; };
    }
  }, [closeDialogRef]);

  useEffect(() => {
    onRemoveFundRef.current = onRemoveFund;
    onToggleFavoriteRef.current = onToggleFavorite;
    onRemoveFromGroupRef.current = onRemoveFromGroup;
    onHoldingAmountClickRef.current = onHoldingAmountClick;
  }, [
    onRemoveFund,
    onToggleFavorite,
    onRemoveFromGroup,
    onHoldingAmountClick,
  ]);

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

      const tableEl = tableContainerRef.current;
      const scrollEl = tableEl?.closest('.table-scroll-area');
      const targetEl = scrollEl || tableEl;
      const rect = targetEl?.getBoundingClientRect();

      if (!rect) {
        setShowPortalHeader(window.scrollY >= nextStickyTop);
        return;
      }

      const headerEl = tableEl?.querySelector('.table-header-row');
      const headerHeight = headerEl?.getBoundingClientRect?.().height ?? 0;
      const hasPassedHeader = (rect.top + headerHeight) <= nextStickyTop;
      const hasTableInView = rect.bottom > nextStickyTop;

      setShowPortalHeader(hasPassedHeader && hasTableInView);

      setPortalHorizontal((prev) => {
        const next = {
          left: rect.left,
          right: typeof window !== 'undefined' ? Math.max(0, window.innerWidth - rect.right) : 0,
        };
        if (prev.left === next.left && prev.right === next.right) return prev;
        return next;
      });
    };

    const throttledVerticalUpdate = throttle(updateVerticalState, 1000 / 60, { leading: true, trailing: true });

    updateVerticalState();
    window.addEventListener('scroll', throttledVerticalUpdate, { passive: true });
    window.addEventListener('resize', throttledVerticalUpdate, { passive: true });
    return () => {
      window.removeEventListener('scroll', throttledVerticalUpdate);
      window.removeEventListener('resize', throttledVerticalUpdate);
      throttledVerticalUpdate.cancel();
    };
  }, [stickyTop]);

  const relatedSectorEnabled = columnVisibility?.relatedSector !== false;
  const relatedSectorCacheRef = useRef(new Map());
  const [relatedSectorByCode, setRelatedSectorByCode] = useState({});

  const fetchRelatedSector = async (code) => fetchRelatedSectors(code);

  const runWithConcurrency = async (items, limit, worker) => {
    const queue = [...items];
    const results = [];
    const runners = Array.from({ length: Math.max(1, limit) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item == null) continue;
         
        results.push(await worker(item));
      }
    });
    await Promise.all(runners);
    return results;
  };

  useEffect(() => {
    if (!relatedSectorEnabled) return;
    if (!Array.isArray(data) || data.length === 0) return;

    const codes = Array.from(new Set(data.map((d) => d?.code).filter(Boolean)));
    const missing = codes.filter((code) => !relatedSectorCacheRef.current.has(code));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      await runWithConcurrency(missing, 4, async (code) => {
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
  }, [relatedSectorEnabled, data]);

  useEffect(() => {
    const tableEl = tableContainerRef.current;
    const portalEl = portalHeaderRef.current;
    const scrollEl = tableEl?.closest('.table-scroll-area');
    if (!scrollEl || !portalEl) return;

    const syncScrollToPortal = () => {
      portalEl.scrollLeft = scrollEl.scrollLeft;
    };

    const syncScrollToTable = () => {
      scrollEl.scrollLeft = portalEl.scrollLeft;
    };

    syncScrollToPortal();

    const handleTableScroll = () => syncScrollToPortal();
    const handlePortalScroll = () => syncScrollToTable();

    scrollEl.addEventListener('scroll', handleTableScroll, { passive: true });
    portalEl.addEventListener('scroll', handlePortalScroll, { passive: true });

    return () => {
      scrollEl.removeEventListener('scroll', handleTableScroll);
      portalEl.removeEventListener('scroll', handlePortalScroll);
    };
  }, [showPortalHeader]);

  const FundNameCell = ({ info, showFullFundName, onOpenCardDialog }) => {
    const original = info.row.original || {};
    const code = original.code;
    const isUpdated = original.isUpdated;
    const hasDca = original.hasDca;
    const isFavorites = favorites?.has?.(code);
    const isGroupTab = currentTab && currentTab !== 'all' && currentTab !== 'fav';
    const rowContext = useContext(SortableRowContext);

    return (
      <div className="name-cell-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8 }}>
        {sortBy === 'default' && (
          <button
            className="icon-button drag-handle"
            ref={rowContext?.setActivatorNodeRef}
            {...rowContext?.listeners}
            style={{ cursor: 'grab', width: 20, height: 20, padding: 2, margin: '0', flexShrink: 0, color: 'var(--muted)', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="拖拽排序"
            onClick={(e) => e.stopPropagation?.()}
          >
            <DragIcon width="16" height="16" />
          </button>
        )}
        {isGroupTab ? (
          <button
            className="icon-button fav-button"
            onClick={(e) => {
              e.stopPropagation?.();
              onRemoveFromGroupRef.current?.(original);
            }}
            title="从小分组移除"
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
          >
            <StarIcon width="18" height="18" filled={isFavorites} />
          </button>
        )}
        <div
          className="title-text"
          role={onOpenCardDialog ? 'button' : undefined}
          tabIndex={onOpenCardDialog ? 0 : undefined}
          onClick={onOpenCardDialog ? (e) => { e.stopPropagation?.(); onOpenCardDialog(original); } : undefined}
          onKeyDown={onOpenCardDialog ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCardDialog(original); } } : undefined}
          style={onOpenCardDialog ? { cursor: 'pointer' } : undefined}
          title={onOpenCardDialog ? '查看基金详情' : (original.isUpdated ? '今日净值已更新' : undefined)}
        >
          <span
            className={`name-text ${showFullFundName ? 'show-full' : ''}`}
            title={isUpdated ? '今日净值已更新' : ''}
          >
            {info.getValue() ?? '—'}
          </span>
          {code ? <span className="muted code-text">
            #{code}
            {hasDca && <span className="dca-indicator">定</span>}
            {isUpdated && <span className="updated-indicator">✓</span>}
          </span> : null}
        </div>
      </div>
    );
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'fundName',
        header: '基金名称',
        size: 265,
        minSize: 140,
        enablePinning: true,
        cell: (info) => (
          <FundNameCell
            info={info}
            showFullFundName={showFullFundName}
            onOpenCardDialog={getFundCardProps ? (row) => setCardDialogRow(row) : undefined}
          />
        ),
        meta: {
          align: 'left',
          cellClassName: 'name-cell',
        },
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
          return (
            <div style={{ width: '100%', textAlign: value ? 'left' : 'right', fontSize: '14px' }}>
              {display}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'related-sector-cell',
        },
      },
      {
        accessorKey: 'latestNav',
        header: '最新净值',
        size: 100,
        minSize: 80,
        cell: (info) => {
          const original = info.row.original || {};
          const rawDate = original.latestNavDate ?? '-';
          const date = typeof rawDate === 'string' && rawDate.length > 5 ? rawDate.slice(5) : rawDate;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <FitText style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {info.getValue() ?? '—'}
              </FitText>
              <span className="muted" style={{ fontSize: '11px' }}>
                {date}
              </span>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'value-cell',
        },
      },
      {
        accessorKey: 'estimateNav',
        header: '估算净值',
        size: 100,
        minSize: 80,
        cell: (info) => {
          const original = info.row.original || {};
          const rawDate = original.estimateNavDate ?? '-';
          const date = typeof rawDate === 'string' && rawDate.length > 5 ? rawDate.slice(5) : rawDate;
          const estimateNav = info.getValue();
          const hasEstimateNav = estimateNav != null && estimateNav !== '—';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <FitText style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {estimateNav ?? '—'}
              </FitText>
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
          cellClassName: 'value-cell',
        },
      },
      {
        accessorKey: 'yesterdayChangePercent',
        header: '昨日涨幅',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.yesterdayChangeValue;
          const rawDate = original.yesterdayDate ?? '-';
          const date = typeof rawDate === 'string' && rawDate.length > 5 ? rawDate.slice(5) : rawDate;
          const cls = value > 0 ? 'up' : value < 0 ? 'down' : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <FitText className={cls} style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {info.getValue() ?? '—'}
              </FitText>
              <span className="muted" style={{ fontSize: '11px' }}>
                {date}
              </span>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'change-cell',
        },
      },
      {
        accessorKey: 'estimateChangePercent',
        header: '估值涨幅',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateChangeValue;
          const isMuted = original.estimateChangeMuted;
          const rawTime = original.estimateTime ?? '-';
          const time = typeof rawTime === 'string' && rawTime.length > 5 ? rawTime.slice(5) : rawTime;
          const cls = isMuted ? 'muted' : value > 0 ? 'up' : value < 0 ? 'down' : '';
          const text = info.getValue();
          const hasText = text != null && text !== '—';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <FitText className={cls} style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {text ?? '—'}
              </FitText>
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
          cellClassName: 'est-change-cell',
        },
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
              <FitText className={cls} style={{ fontWeight: 700, display: 'block' }} maxFontSize={14} minFontSize={10}>
                {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
              </FitText>
              {hasProfit && percentStr && !masked ? (
                <span className={`${cls} estimate-profit-percent`} style={{ display: 'block', fontSize: '0.75em', opacity: 0.9, fontWeight: 500 }}>
                  <FitText maxFontSize={11} minFontSize={9}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'total-change-cell',
        },
      },
      {
        accessorKey: 'holdingAmount',
        header: '持仓金额',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          if (original.holdingAmountValue == null) {
            return (
              <div
                role="button"
                tabIndex={0}
                className="muted"
                title="设置持仓"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '12px', cursor: 'pointer' }}
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
              title="点击设置持仓"
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', width: '100%', minWidth: 0 }}
              onClick={(e) => {
                e.stopPropagation?.();
                onHoldingAmountClickRef.current?.(original, { hasHolding: true });
              }}
            >
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <FitText style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10}>
                  {masked ? <span className="mask-text">******</span> : (info.getValue() ?? '—')}
                </FitText>
              </div>
              <button
                className="icon-button no-hover"
                onClick={(e) => {
                  e.stopPropagation?.();
                  onHoldingAmountClickRef.current?.(original, { hasHolding: true });
                }}
                title="编辑持仓"
                style={{ border: 'none', width: '28px', height: '28px', marginLeft: 4, flexShrink: 0, backgroundColor: 'transparent' }}
              >
                <SettingsIcon width="14" height="14" />
              </button>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-amount-cell',
        },
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
            return <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>—</div>;
          }
          return (
            <div style={{ fontWeight: 700, textAlign: 'right' }}>
              {value}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-days-cell',
        },
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
              <FitText className={cls} style={{ fontWeight: 700, display: 'block' }} maxFontSize={14} minFontSize={10}>
                {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
              </FitText>
              {percentStr && !masked ? (
                <span className={`${cls} today-profit-percent`} style={{ display: 'block', fontSize: '0.75em', opacity: 0.9, fontWeight: 500 }}>
                  <FitText maxFontSize={11} minFontSize={9}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'profit-cell',
        },
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
              <FitText className={cls} style={{ fontWeight: 700, display: 'block' }} maxFontSize={14} minFontSize={10}>
                {masked && hasTotal ? <span className="mask-text">******</span> : amountStr}
              </FitText>
              {percentStr && !masked ? (
                <span className={`${cls} holding-profit-percent`} style={{ display: 'block', fontSize: '0.75em', opacity: 0.9, fontWeight: 500 }}>
                  <FitText maxFontSize={11} minFontSize={9}>
                    {percentStr}
                  </FitText>
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-cell',
        },
      },
      {
        id: 'actions',
        header: () => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>操作</span>
            <button
              className="icon-button"
              onClick={(e) => {
                e.stopPropagation?.();
                setSettingModalOpen(true);
              }}
              title="个性化设置"
              style={{ border: 'none', width: '24px', height: '24px', backgroundColor: 'transparent', color: 'var(--text)' }}
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
          cellClassName: 'action-cell',
        },
        cell: (info) => {
          const original = info.row.original || {};

          const handleClick = (e) => {
            e.stopPropagation?.();
            if (refreshing) return;
            onRemoveFundRef.current?.(original);
          };

          return (
            <div className="row" style={{ justifyContent: 'center', gap: 4, padding: '8px 0' }}>
              <button
                className="icon-button danger"
                onClick={handleClick}
                title="删除"
                disabled={refreshing}
                style={{
                  width: '28px',
                  height: '28px',
                  opacity: refreshing ? 0.6 : 1,
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                }}
              >
                <TrashIcon width="14" height="14" />
              </button>
            </div>
          );
        },
      },
    ],
    [currentTab, favorites, refreshing, sortBy, showFullFundName, getFundCardProps, masked, relatedSectorByCode],
  );

  const table = useReactTable({
    data,
    columns,
    enableColumnPinning: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onColumnSizingChange: (updater) => {
      setColumnSizing((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const { actions, ...rest } = next || {};
        return rest || {};
      });
    },
    state: {
      columnSizing,
      columnOrder,
      columnVisibility,
    },
    onColumnOrderChange: (updater) => {
      setColumnOrder(updater);
    },
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility(updater);
    },
    initialState: {
      columnPinning: {
        left: ['fundName'],
        right: ['actions'],
      },
    },
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: {
      cell: (info) => info.getValue() ?? '—',
    },
  });

  const headerGroup = table.getHeaderGroups()[0];

  const getCommonPinningStyles = (column, isHeader) => {
    const isPinned = column.getIsPinned();
    const isNameColumn =
      column.id === 'fundName' || column.columnDef?.accessorKey === 'fundName';
    const style = {
      width: `${column.getSize()}px`,
    };
    if (!isPinned) return style;

    const isLeft = isPinned === 'left';
    const isRight = isPinned === 'right';

    return {
      ...style,
      position: 'sticky',
      left: isLeft ? `${column.getStart('left')}px` : undefined,
      right: isRight ? `${column.getAfter('right')}px` : undefined,
      zIndex: isHeader ? 11 : 10,
      backgroundColor: isHeader ? 'var(--table-pinned-header-bg)' : 'var(--row-bg, var(--bg))',
      boxShadow: 'none',
      textAlign: isNameColumn ? 'left' : 'center',
      justifyContent: isNameColumn ? 'flex-start' : 'center',
    };
  };

  const renderTableHeader = (forPortal = false) => {
    if (!headerGroup) return null;
    return (
      <div className="table-header-row table-header-row-scroll">
        {headerGroup.headers.map((header) => {
          const style = getCommonPinningStyles(header.column, true);
          const isNameColumn =
            header.column.id === 'fundName' ||
            header.column.columnDef?.accessorKey === 'fundName';
          const isRightAligned = NON_FROZEN_COLUMN_IDS.includes(header.column.id);
          const align = isNameColumn ? '' : isRightAligned ? 'text-right' : 'text-center';
          return (
            <div
              key={header.id}
              className={`table-header-cell ${align}`}
              style={style}
            >
              <div style={{ paddingRight: isRightAligned ? '20px' : '0' }}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
              </div>
              {!forPortal && (
                <div
                  onMouseDown={header.column.getCanResize() ? header.getResizeHandler() : undefined}
                  onTouchStart={header.column.getCanResize() ? header.getResizeHandler() : undefined}
                  className={`resizer ${header.column.getIsResizing() ? 'isResizing' : ''
                    } ${header.column.getCanResize() ? '' : 'disabled'}`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const totalHeaderWidth = headerGroup?.headers?.reduce((acc, h) => acc + h.column.getSize(), 0) ?? 0;

  return (
    <>
      <div className="pc-fund-table" ref={tableContainerRef}>
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
          width: fit-content !important;
          min-width: 100%;
          gap: 0 !important; /* Reset gap because we control width explicitly */
        }

        .table-header-cell,
        .table-cell {
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

        .resizer:hover::after {
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
      `}</style>
        {/* 表头 */}
        {renderTableHeader(false)}

        {/* 表体 */}
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
                <SortableRow key={row.original.code || row.id} row={row} isTableDragging={!!activeId} disabled={sortBy !== 'default'}>
                  <div
                    className={`table-row table-row-scroll ${index % 2 === 1 ? 'row-even' : ''}`}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const columnId = cell.column.id || cell.column.columnDef?.accessorKey;
                      const isNameColumn = columnId === 'fundName';
                      const align = isNameColumn
                        ? ''
                        : NON_FROZEN_COLUMN_IDS.includes(columnId)
                          ? 'text-right'
                          : 'text-center';
                      const cellClassName =
                        (cell.column.columnDef.meta && cell.column.columnDef.meta.cellClassName) || '';
                      const style = getCommonPinningStyles(cell.column, false);
                      const isPinned = cell.column.getIsPinned();
                      return (
                        <div
                          key={cell.id}
                          className={`table-cell ${align} ${cellClassName} ${isPinned ? 'pinned-cell' : ''}`}
                          style={style}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SortableRow>
              ))}
            </AnimatePresence>
          </SortableContext>
        </DndContext>

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
        {showPortalHeader && ReactDOM.createPortal(
          <div
            className="pc-fund-table pc-fund-table-portal-header"
            ref={portalHeaderRef}
            style={{
              position: 'fixed',
              top: effectiveStickyTop,
              left: portalHorizontal.left,
              right: portalHorizontal.right,
              zIndex: 10,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            <div
              className="table-header-row table-header-row-scroll"
              style={{ minWidth: totalHeaderWidth, width: 'fit-content' }}
            >
              {headerGroup?.headers.map((header) => {
                const style = getCommonPinningStyles(header.column, true);
                const isNameColumn =
                  header.column.id === 'fundName' ||
                  header.column.columnDef?.accessorKey === 'fundName';
                const isRightAligned = NON_FROZEN_COLUMN_IDS.includes(header.column.id);
                const align = isNameColumn ? '' : isRightAligned ? 'text-right' : 'text-center';
                return (
                  <div
                    key={header.id}
                    className={`table-header-cell ${align}`}
                    style={style}
                  >
                    <div style={{ paddingRight: isRightAligned ? '20px' : '0' }}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
      </div>
      {!!(cardDialogRow && getFundCardProps) && (
        <FundDetailDialog blockDialogClose={blockDialogClose} cardDialogRow={cardDialogRow} getFundCardProps={getFundCardProps} setCardDialogRow={setCardDialogRow} />
      )}
      <PcTableSettingModal
        open={settingModalOpen}
        onClose={() => setSettingModalOpen(false)}
        columns={columnOrder.map((id) => ({ id, header: COLUMN_HEADERS[id] ?? id }))}
        onColumnReorder={(newOrder) => {
          setColumnOrder(newOrder);
        }}
        columnVisibility={columnVisibility}
        onToggleColumnVisibility={handleToggleColumnVisibility}
        onResetColumnOrder={handleResetColumnOrder}
        onResetColumnVisibility={handleResetColumnVisibility}
        onResetSizing={() => setResetConfirmOpen(true)}
        showFullFundName={showFullFundName}
        onToggleShowFullFundName={handleToggleShowFullFundName}
      />
    </>

  );
}

function FundDetailDialog({ blockDialogClose, cardDialogRow, getFundCardProps, setCardDialogRow}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !blockDialogClose) setCardDialogRow(null);
      }}
    >
      <DialogContent
        className="sm:max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden"
        onPointerDownOutside={blockDialogClose ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-6 pb-4 pt-6 text-left border-b border-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">
            基金详情
          </DialogTitle>
        </DialogHeader>
        <div
          className="flex-1 min-h-0 overflow-y-auto px-6 py-4 scrollbar-y-styled"
        >
          {cardDialogRow && getFundCardProps ? (
            <FundCard {...getFundCardProps(cardDialogRow)} layoutMode="drawer" />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
