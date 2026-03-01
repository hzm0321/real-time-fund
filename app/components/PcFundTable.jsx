'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { DragIcon, ExitIcon, SettingsIcon, StarIcon, TrashIcon } from './Icons';

const NON_FROZEN_COLUMN_IDS = [
  'yesterdayChangePercent',
  'estimateChangePercent',
  'holdingAmount',
  'todayProfit',
  'holdingProfit',
  'latestNav',
  'estimateNav',
];
const COLUMN_HEADERS = {
  latestNav: '最新净值',
  estimateNav: '估算净值',
  yesterdayChangePercent: '昨日涨跌幅',
  estimateChangePercent: '估值涨跌幅',
  holdingAmount: '持仓金额',
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
 *     yesterdayChangePercent: string|number; // 昨日涨跌幅
 *     estimateChangePercent: string|number;  // 估值涨跌幅
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
        };
      }
    });
    return byGroup;
  };

  const [configByGroup, setConfigByGroup] = useState(getInitialConfigByGroup);

  const currentGroupPc = configByGroup[groupKey];
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
    if (vis && typeof vis === 'object' && Object.keys(vis).length > 0) return vis;
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
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const group = parsed[groupKey] && typeof parsed[groupKey] === 'object' ? { ...parsed[groupKey] } : {};
      if (updates.pcTableColumnOrder !== undefined) group.pcTableColumnOrder = updates.pcTableColumnOrder;
      if (updates.pcTableColumnVisibility !== undefined) group.pcTableColumnVisibility = updates.pcTableColumnVisibility;
      if (updates.pcTableColumns !== undefined) group.pcTableColumns = updates.pcTableColumns;
      parsed[groupKey] = group;
      window.localStorage.setItem('customSettings', JSON.stringify(parsed));
      setConfigByGroup((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], ...updates } }));
      onCustomSettingsChange?.();
    } catch { }
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
  const onRemoveFromGroupRef = useRef(onRemoveFromGroup);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);

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

  const FundNameCell = ({ info }) => {
    const original = info.row.original || {};
    const code = original.code;
    const isUpdated = original.isUpdated;
    const isFavorites = favorites?.has?.(code);
    const isGroupTab = currentTab && currentTab !== 'all' && currentTab !== 'fav';
    const rowContext = useContext(SortableRowContext);

    return (
      <div className="name-cell-content" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {sortBy === 'default' && (
          <button
            className="icon-button drag-handle"
            ref={rowContext?.setActivatorNodeRef}
            {...rowContext?.listeners}
            style={{ cursor: 'grab', padding: 2, margin: '-2px -4px -2px 0', color: 'var(--muted)', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
        <div className="title-text">
          <span
            className={`name-text`}
            title={isUpdated ? '今日净值已更新' : ''}
          >
            {info.getValue() ?? '—'}
          </span>
          {code ? <span className="muted code-text">
            #{code}
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
        cell: (info) => <FundNameCell info={info} />,
        meta: {
          align: 'left',
          cellClassName: 'name-cell',
        },
      },
      {
        accessorKey: 'latestNav',
        header: '最新净值',
        size: 100,
        minSize: 80,
        cell: (info) => (
          <FitText style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10}>
            {info.getValue() ?? '—'}
          </FitText>
        ),
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
        cell: (info) => (
          <FitText style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10}>
            {info.getValue() ?? '—'}
          </FitText>
        ),
        meta: {
          align: 'right',
          cellClassName: 'value-cell',
        },
      },
      {
        accessorKey: 'yesterdayChangePercent',
        header: '昨日涨跌幅',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.yesterdayChangeValue;
          const date = original.yesterdayDate ?? '-';
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
        header: '估值涨跌幅',
        size: 135,
        minSize: 100,
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.estimateChangeValue;
          const isMuted = original.estimateChangeMuted;
          const time = original.estimateTime ?? '-';
          const cls = isMuted ? 'muted' : value > 0 ? 'up' : value < 0 ? 'down' : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
              <FitText className={cls} style={{ fontWeight: 700 }} maxFontSize={14} minFontSize={10} as="div">
                {info.getValue() ?? '—'}
              </FitText>
              <span className="muted" style={{ fontSize: '11px' }}>
                {time}
              </span>
            </div>
          );
        },
        meta: {
          align: 'right',
          cellClassName: 'est-change-cell',
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
                  {info.getValue() ?? '—'}
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
          return (
            <div style={{ width: '100%' }}>
              <FitText className={cls} style={{ fontWeight: 700, display: 'block' }} maxFontSize={14} minFontSize={10}>
                {amountStr}
              </FitText>
              {percentStr ? (
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
                {amountStr}
              </FitText>
              {percentStr ? (
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
            <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
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
    [currentTab, favorites, refreshing, sortBy],
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
      backgroundColor: isHeader ? 'var(--table-pinned-header-bg)' : 'var(--row-bg)',
      boxShadow: 'none',
      textAlign: isNameColumn ? 'left' : 'center',
      justifyContent: isNameColumn ? 'flex-start' : 'center',
    };
  };

  return (
    <div className="pc-fund-table">
      <style>{`
        .table-row-scroll {
          --row-bg: var(--bg);
          background-color: var(--row-bg);
        }
        .table-row-scroll:hover {
          --row-bg: var(--table-row-hover-bg);
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
      {headerGroup && (
        <div className="table-header-row table-header-row-scroll">
          {headerGroup.headers.map((header) => {
            const style = getCommonPinningStyles(header.column, true);
            const isNameColumn =
              header.column.id === 'fundName' ||
              header.column.columnDef?.accessorKey === 'fundName';
            const align = isNameColumn ? '' : 'text-center';
            return (
              <div
                key={header.id}
                className={`table-header-cell ${align}`}
                style={style}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                <div
                  onMouseDown={header.column.getCanResize() ? header.getResizeHandler() : undefined}
                  onTouchStart={header.column.getCanResize() ? header.getResizeHandler() : undefined}
                  className={`resizer ${header.column.getIsResizing() ? 'isResizing' : ''
                    } ${header.column.getCanResize() ? '' : 'disabled'}`}
                />
              </div>
            );
          })}
        </div>
      )}

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
            {table.getRowModel().rows.map((row) => (
              <SortableRow key={row.original.code || row.id} row={row} isTableDragging={!!activeId} disabled={sortBy !== 'default'}>
                <div
                  className="table-row table-row-scroll"
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnId = cell.column.id || cell.column.columnDef?.accessorKey;
                    const isNameColumn = columnId === 'fundName';
                    const rightAlignedColumns = new Set([
                      'latestNav',
                      'estimateNav',
                      'yesterdayChangePercent',
                      'estimateChangePercent',
                      'holdingAmount',
                      'todayProfit',
                      'holdingProfit',
                    ]);
                    const align = isNameColumn
                      ? ''
                      : rightAlignedColumns.has(columnId)
                        ? 'text-right'
                        : 'text-center';
                    const cellClassName =
                      (cell.column.columnDef.meta && cell.column.columnDef.meta.cellClassName) || '';
                    const style = getCommonPinningStyles(cell.column, false);
                    return (
                      <div
                        key={cell.id}
                        className={`table-cell ${align} ${cellClassName}`}
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
          onConfirm={handleResetSizing}
          onCancel={() => setResetConfirmOpen(false)}
          confirmText="重置"
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
      />
    </div>
  );
}
