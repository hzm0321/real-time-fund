'use client';

import ReactDOM from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { throttle } from 'lodash';
import { AnimatePresence, motion } from 'framer-motion';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
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
import { DragIcon, SettingsIcon, StarIcon, TrashIcon, ResetIcon, FolderPlusIcon, LinkIcon } from './Icons';
import { fetchFundPeriodReturns, fetchRelatedSectors, fetchRelatedSectorLiveQuote } from '@/app/api/fund';
import { storageStore } from '../stores';
import { asyncPool } from '@/app/lib/asyncHelper';
import MoveGroupModal from './MoveGroupModal';
import { Badge } from '@/components/ui/badge';
import { getTagThemeBadgeProps } from '@/app/components/AddTagDialog';
import { cn } from '@/lib/utils';

const TAGS_COLUMN_ID = 'tags';

const NON_FROZEN_COLUMN_IDS = [
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
  'holdingAmount',
  'holdingCost',
  'costNav',
  'estimateNav',
];

/** 已保存列显示偏好时，新增列默认隐藏；未保存时随「全展示」 */
const PC_COLUMNS_DEFAULT_HIDDEN_IF_PERSONALIZED = new Set(['tags', 'holdingCost', 'costNav']);

/** 非冻结列中右对齐的（标签列左对齐） */
const isPcDataColumnRightAligned = (id) =>
  id !== TAGS_COLUMN_ID && NON_FROZEN_COLUMN_IDS.includes(id);

const COLUMN_HEADERS = {
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
  holdingAmount: '持仓金额',
  holdingCost: '持仓成本',
  costNav: '成本净值',
  holdingDays: '持有天数',
  todayProfit: '当日收益',
  yesterdayProfit: '昨日收益',
  holdingProfit: '持有收益',
  tags: '基金标签',
};

const SortableRowContext = createContext({
  setActivatorNodeRef: null,
  listeners: null,
});

function SortableRow({ row, children, isTableDragging, disabled, enableAnimation = true }) {
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
      {enableAnimation ? (
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
      ) : (
        <div
          ref={setNodeRef}
          className="table-row-wrapper"
          style={{ ...style, position: 'relative' }}
          {...attributes}
        >
          {children}
        </div>
      )}
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
export default function PcFundTable({
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
  onReorder,
  onCustomSettingsChange,
  getFundCardProps,
  closeDialogRef,
  batchSelectionClearRef,
  blockDialogClose = false,
  stickyTop = 0,
  masked = false,
  relatedSectorSessionKey = '',
  onFundTagsClick,
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
  /** 窗口虚拟列表锚点：用于 scrollMargin（.table-scroll-area 仅横向滚动，纵向为整页滚动） */
  const virtualScrollAnchorRef = useRef(null);
  const [virtualScrollMargin, setVirtualScrollMargin] = useState(0);
  const portalHeaderRef = useRef(null);
  const [showPortalHeader, setShowPortalHeader] = useState(false);
  const [effectiveStickyTop, setEffectiveStickyTop] = useState(stickyTop);
  const [portalHorizontal, setPortalHorizontal] = useState({ left: 0, right: 0 });
  const enableRowAnimation = data.length <= 40;

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

  const isGroupTab = currentTab && currentTab !== 'all' && currentTab !== 'fav';
  // 批量删除：之前仅自定义分组支持，这里扩展到「全部 / 自选 / 自定义分组」
  const batchRemoveEnabled = sortBy === 'default' && (currentTab === 'all' || currentTab === 'fav' || isGroupTab);
  const selectableCodes = useMemo(
    () => (Array.isArray(data) ? data.map((d) => d?.code).filter(Boolean) : []),
    [data],
  );
  /** 全部/自选下「关联汇总持仓」行不参与批量选择 */
  const batchSelectableCodes = useMemo(
    () => (Array.isArray(data) ? data.filter((d) => !d?.isHoldingLinked).map((d) => d?.code).filter(Boolean) : []),
    [data],
  );
  const batchSelectableCount = batchSelectableCodes.length;
  const [selectedCodes, setSelectedCodes] = useState(() => new Set());
  const [moveGroupOpen, setMoveGroupOpen] = useState(false);

  useEffect(() => {
    setSelectedCodes(new Set());
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
      (Array.isArray(data) ? data : [])
        .filter((d) => d && d.isHoldingLinked && d.code)
        .map((d) => d.code),
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
    batchSelectionClearRef.current = () => setSelectedCodes(new Set());
    return () => {
      batchSelectionClearRef.current = null;
    };
  }, [batchSelectionClearRef]);

  const toggleSelected = useCallback((code, checked) => {
    if (!code) return;
    const row = Array.isArray(data) ? data.find((d) => d?.code === code) : null;
    if (row?.isHoldingLinked) return;
    setSelectedCodes((prev) => {
      const next = new Set(prev || []);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }, [data]);

  const setAllSelected = useCallback((checked) => {
    setSelectedCodes(() => {
      if (!checked) return new Set();
      return new Set(batchSelectableCodes);
    });
  }, [batchSelectableCodes]);

  const selectedCount = selectedCodes?.size || 0;
  const selectedCodesList = useMemo(() => Array.from(selectedCodes || []), [selectedCodes]);

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
      NON_FROZEN_COLUMN_IDS.forEach((id) => {
        if (next[id] === undefined) {
          next[id] = PC_COLUMNS_DEFAULT_HIDDEN_IF_PERSONALIZED.has(id) ? false : true;
        }
      });
      return next;
    }
    const allVisible = {};
    NON_FROZEN_COLUMN_IDS.forEach((id) => { allVisible[id] = true; });
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
      const parsed = storageStore.getItem('customSettings') || {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      if (updates.pcTableColumnOrder !== undefined) group.pcTableColumnOrder = updates.pcTableColumnOrder;
      if (updates.pcTableColumnVisibility !== undefined) group.pcTableColumnVisibility = updates.pcTableColumnVisibility;
      if (updates.pcTableColumns !== undefined) group.pcTableColumns = updates.pcTableColumns;
      if (updates.pcShowFullFundName !== undefined) group.pcShowFullFundName = updates.pcShowFullFundName;
      parsed[groupKey] = group;
      storageStore.setItem('customSettings', JSON.stringify(parsed));
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
    setColumnVisibility(allVisible);
  };
  const handleToggleColumnVisibility = (columnId, visible) => {
    setColumnVisibility((prev = {}) => ({ ...prev, [columnId]: visible }));
  };
  const onRemoveFundRef = useRef(onRemoveFund);
  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);
  const onFundTagsClickRef = useRef(onFundTagsClick);

  useEffect(() => {
    if (closeDialogRef) {
      closeDialogRef.current = () => setCardDialogRow(null);
      return () => { closeDialogRef.current = null; };
    }
  }, [closeDialogRef]);

  useEffect(() => {
    onRemoveFundRef.current = onRemoveFund;
    onToggleFavoriteRef.current = onToggleFavorite;
    onHoldingAmountClickRef.current = onHoldingAmountClick;
    onFundTagsClickRef.current = onFundTagsClick;
  }, [
    onRemoveFund,
    onToggleFavorite,
    onHoldingAmountClick,
    onFundTagsClick,
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
  const [sectorQuoteByLabel, setSectorQuoteByLabel] = useState({});

  const sectorAuthSegment = relatedSectorSessionKey || 'anon';
  const dataCodes = useMemo(
    () => Array.from(new Set((data || []).map((d) => d?.code).filter(Boolean))),
    [data],
  );
  const dataCodesKey = useMemo(() => dataCodes.join('|'), [dataCodes]);

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
    if (dataCodes.length === 0) return;

    const missing = dataCodes.filter((code) => !relatedSectorCacheRef.current.has(code));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const batch = {};
      await asyncPool(4, missing, async (code) => {
        const value = await fetchRelatedSector(code);
        relatedSectorCacheRef.current.set(code, value);
        batch[code] = value;
      });
      if (cancelled) return;
      setRelatedSectorByCode((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [code, value] of Object.entries(batch)) {
          if (next[code] === value) continue;
          next[code] = value;
          changed = true;
        }
        return changed ? next : prev;
      });
    })();

    return () => { cancelled = true; };
  }, [relatedSectorEnabled, dataCodesKey, sectorAuthSegment, fetchRelatedSector, dataCodes]);

  useEffect(() => {
    if (!relatedSectorEnabled) return;
    if (dataCodes.length === 0) return;

    const labels = new Set();
    for (const code of dataCodes) {
      const lbl = relatedSectorByCode?.[code] ?? relatedSectorCacheRef.current.get(code);
      const t = lbl != null ? String(lbl).trim() : '';
      if (t) labels.add(t);
    }
    if (labels.size === 0) return;

    let cancelled = false;
    (async () => {
      const batch = {};
      await asyncPool(4, [...labels], async (label) => {
        const quote = await fetchRelatedSectorLiveQuote(label);
        batch[label] = quote;
      });
      if (cancelled) return;
      setSectorQuoteByLabel((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [label, quote] of Object.entries(batch)) {
          const prevQ = next[label];
          if (prevQ === quote) continue;
          if (
            prevQ &&
            quote &&
            prevQ.pct === quote.pct &&
            prevQ.name === quote.name &&
            prevQ.code === quote.code
          ) {
            continue;
          }
          next[label] = quote;
          changed = true;
        }
        return changed ? next : prev;
      });
    })();

    return () => { cancelled = true; };
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
    columnVisibility?.period1w !== false
    || columnVisibility?.period1m !== false
    || columnVisibility?.period3m !== false
    || columnVisibility?.period6m !== false
    || columnVisibility?.period1y !== false;
  const periodReturnsCacheRef = useRef(new Map());
  const [periodReturnsByCode, setPeriodReturnsByCode] = useState({});

  useEffect(() => {
    if (!periodReturnsEnabled) return;
    if (dataCodes.length === 0) return;

    const missing = dataCodes.filter((code) => !periodReturnsCacheRef.current.has(code));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const batch = {};
      await asyncPool(4, missing, async (code) => {
        const value = await fetchFundPeriodReturns(code);
        periodReturnsCacheRef.current.set(code, value);
        batch[code] = value;
      });
      if (cancelled) return;
      setPeriodReturnsByCode((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [code, value] of Object.entries(batch)) {
          const prevVal = next[code];
          if (
            prevVal
            && prevVal.week === value.week
            && prevVal.month === value.month
            && prevVal.month3 === value.month3
            && prevVal.month6 === value.month6
            && prevVal.year1 === value.year1
          ) {
            continue;
          }
          next[code] = value;
          changed = true;
        }
        return changed ? next : prev;
      });
    })();

    return () => { cancelled = true; };
  }, [periodReturnsEnabled, dataCodesKey, dataCodes]);

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
    const rowContext = useContext(SortableRowContext);
    const showFavoriteButton = !isGroupTab && (currentTab === 'all' || currentTab === 'fav' || !currentTab);
    const holdingLocked =
      (currentTab === 'all' || currentTab === 'fav') &&
      !!original.isHoldingLinked;

    return (
      <div className="name-cell-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8 }}>
                {batchRemoveEnabled && (
          <label
            title={holdingLocked ? '关联持仓不可批量选择' : '选择用于批量删除'}
            onClick={(e) => e.stopPropagation?.()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              flexShrink: 0,
              cursor: holdingLocked ? 'not-allowed' : 'pointer',
              opacity: holdingLocked ? 0.45 : 1,
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
                cursor: holdingLocked ? 'not-allowed' : 'pointer',
              }}
              aria-label="选择基金"
            />
          </label>
        )}
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
        {showFavoriteButton ? (
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
        ) : null}
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
                  position: 'relative',
                  bottom: 2,
                }}
              >
                <LinkIcon width="14" height="14" />
              </span>
            ) : null}
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
        header: () => {
          if (!batchRemoveEnabled) return '基金名称';
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
                if (shouldClear !== false) setSelectedCodes(new Set());
              }}
              onMove={() => {
                if (!onMoveFunds || selectedCount === 0) return;
                setMoveGroupOpen(true);
              }}
              disabled={selectedCount === 0}
            />
          );
        },
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
        id: 'tags',
        header: '基金标签',
        size: 168,
        minSize: 96,
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
                padding: '4px 0',
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
                      <Badge key={`${item.name}-${idx}`} variant={variant} className={cn('font-normal', themeCls)}>
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
        meta: {
          align: 'right',
          cellClassName: 'tags-cell',
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
                  fontSize: '14px',
                }}
              >
                {firstLine}
              </span>
              {pctText != null ? (
                <span
                  className={pctCls}
                  style={{ fontSize: '11px', fontWeight: 600, textAlign: 'right' }}
                >
                  {pctText}
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'related-sector-cell',
        },
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
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <FitText className={cls} style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' },
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
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <FitText className={cls} style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' },
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
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <FitText className={cls} style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' },
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
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <FitText className={cls} style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' },
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
          const text = value != null && Number.isFinite(value)
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : '—';
          return (
            <div style={{ textAlign: 'right' }}>
              <FitText className={cls} style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {text}
              </FitText>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'period-return-cell' },
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
        header: '最新涨幅',
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
        header: '估算涨幅',
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
          const holdingLocked =
            (currentTab === 'all' || currentTab === 'fav') &&
            !!original.isHoldingLinked;
          const holdingLockedTitle = '持仓来自自定义分组汇总，无法在「全部/自选」设置持仓金额';
          if (original.holdingAmountValue == null) {
            return (
              <div
                role={holdingLocked ? undefined : 'button'}
                tabIndex={holdingLocked ? -1 : 0}
                className="muted"
                title={holdingLocked ? holdingLockedTitle : '设置持仓'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '12px',
                  cursor: holdingLocked ? 'not-allowed' : 'pointer',
                }}
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
                未设置 <SettingsIcon width="12" height="12" />
              </div>
            );
          }
          return (
            <div
              title={holdingLocked ? holdingLockedTitle : '点击设置持仓'}
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: holdingLocked ? 'not-allowed' : 'pointer',
                width: '100%',
                minWidth: 0,
              }}
              onClick={(e) => {
                e.stopPropagation?.();
                if (holdingLocked) return;
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
                  if (holdingLocked) return;
                  onHoldingAmountClickRef.current?.(original, { hasHolding: true });
                }}
                title={holdingLocked ? holdingLockedTitle : '编辑持仓'}
                disabled={holdingLocked}
                style={{
                  border: 'none',
                  width: '28px',
                  height: '28px',
                  marginLeft: 4,
                  flexShrink: 0,
                  backgroundColor: 'transparent',
                  color: holdingLocked ? 'var(--muted)' : undefined,
                  cursor: holdingLocked ? 'not-allowed' : 'pointer',
                }}
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
        accessorKey: 'holdingCost',
        header: '持仓成本',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          if (original.holdingCostValue == null) {
            return <div className="muted" style={{ textAlign: 'right', fontSize: '12px' }}>—</div>;
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', minWidth: 0 }}>
              <FitText style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10}>
                {masked ? <span className="mask-text">******</span> : (info.getValue() ?? '—')}
              </FitText>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'holding-cost-cell',
        },
      },
      {
        accessorKey: 'costNav',
        header: '成本净值',
        size: 100,
        minSize: 80,
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
        meta: {
          align: 'right',
          cellClassName: 'cost-nav-cell',
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
          const pctCls = pctVal != null && Number.isFinite(pctVal)
            ? (pctVal > 0 ? 'up' : pctVal < 0 ? 'down' : '')
            : 'muted';
          return (
            <div style={{ width: '100%' }}>
              <FitText className={cls} style={{ fontWeight: 700, display: 'block' }} maxFontSize={14} minFontSize={10}>
                {masked && hasProfit ? <span className="mask-text">******</span> : amountStr}
              </FitText>
              {percentStr && !masked ? (
                <span className={`${pctCls} yesterday-profit-percent`} style={{ display: 'block', fontSize: '0.75em', opacity: 0.9, fontWeight: 500 }}>
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
          cellClassName: 'yesterday-profit-cell',
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
            onRemoveFundRef.current?.(original);
          };

          return (
            <div className="row" style={{ justifyContent: 'center', gap: 4, padding: '8px 0' }}>
              <button
                className="icon-button danger"
                onClick={handleClick}
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
          );
        },
      },
    ],
    [
      currentTab,
      favorites,
      sortBy,
      showFullFundName,
      getFundCardProps,
      masked,
      relatedSectorByCode,
      sectorQuoteByLabel,
      periodReturnsByCode,
      batchRemoveEnabled,
      batchSelectableCount,
      selectedCount,
      selectedCodes,
      onRemoveFunds,
      onMoveFunds,
      setAllSelected,
      toggleSelected,
      onFundTagsClick,
    ],
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
  const tableRows = table.getRowModel().rows;
  const enableVirtualization = data.length > 40;
  const rowVirtualizer = useWindowVirtualizer({
    count: tableRows.length,
    estimateSize: () => 72,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 8,
    scrollMargin: virtualScrollMargin,
    enabled: enableVirtualization,
  });

  useLayoutEffect(() => {
    if (!enableVirtualization) return;
    const el = virtualScrollAnchorRef.current;
    if (!el) return;
    const update = () => {
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
          <div
            ref={virtualScrollAnchorRef}
            className="pc-fund-table-body-virtual"
            style={{ position: 'relative', width: '100%' }}
          >
            <div
              style={{
                height: rowVirtualizer.getTotalSize(),
                position: 'relative',
                width: '100%',
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
                  }}
                >
                  <div
                    className={`table-row table-row-scroll ${virtualRow.index % 2 === 1 ? 'row-even' : ''}`}
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
                </div>
              );
            })}
            </div>
          </div>
        ) : (
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
              {enableRowAnimation ? (
                <AnimatePresence mode="popLayout">
                  {tableRows.map((row, index) => (
                    <SortableRow
                      key={row.original.code || row.id}
                      row={row}
                      isTableDragging={!!activeId}
                      disabled={sortBy !== 'default'}
                      enableAnimation={!activeId}
                    >
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
              ) : (
                <>
                  {tableRows.map((row, index) => (
                    <SortableRow
                      key={row.original.code || row.id}
                      row={row}
                      isTableDragging={!!activeId}
                      disabled={sortBy !== 'default'}
                      enableAnimation={false}
                    >
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
        onToggleColumnVisibility={handleToggleColumnVisibility}
        onResetColumnOrder={handleResetColumnOrder}
        onResetColumnVisibility={handleResetColumnVisibility}
        onResetSizing={() => setResetConfirmOpen(true)}
        showFullFundName={showFullFundName}
        onToggleShowFullFundName={handleToggleShowFullFundName}
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

function BatchRemoveHeader({
  checked,
  indeterminate,
  selectedCount,
  totalCount,
  onToggleAll,
  onMove,
  onRemove,
  onClear,
  disabled,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'space-between' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <label
          title={checked ? '取消全选' : '全选'}
          onClick={(e) => e.stopPropagation?.()}
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
            onClick={(e) => { e.stopPropagation?.(); onClear?.(); }}
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
          onClick={(e) => { e.stopPropagation?.(); onMove?.(); }}
          title="移动分组"
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
          onClick={(e) => { e.stopPropagation?.(); onRemove?.(); }}
          title="批量删除"
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
      </div>
    </div>
  );
}
