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
import { DragIcon, ExitIcon, ResetIcon, SettingsIcon, StarIcon, TrashIcon } from './Icons';

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
 *     navOrEstimate: string|number; // 净值/估值
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
 * @param {(row: any) => void} [props.onHoldingProfitClick] - 点击持有收益
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
  onHoldingProfitClick,
  refreshing = false,
  sortBy = 'default',
  onReorder,
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
  const getStoredColumnSizing = () => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('customSettings');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const sizing = parsed?.pcTableColumns;
      if (!sizing || typeof sizing !== 'object') return {};
      return Object.fromEntries(
        Object.entries(sizing).filter(([, value]) => Number.isFinite(value)),
      );
    } catch {
      return {};
    }
  };

  const persistColumnSizing = (nextSizing) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const nextSettings =
        parsed && typeof parsed === 'object'
          ? { ...parsed, pcTableColumns: nextSizing }
          : { pcTableColumns: nextSizing };
      window.localStorage.setItem('customSettings', JSON.stringify(nextSettings));
    } catch { }
  };

  const [columnSizing, setColumnSizing] = useState(() => {
    const stored = getStoredColumnSizing();
    if (stored.actions) {
      const { actions, ...rest } = stored;
      return rest;
    }
    return stored;
  });
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const handleResetSizing = () => {
    setColumnSizing({});
    persistColumnSizing({});
    setResetConfirmOpen(false);
  };
  const onRemoveFundRef = useRef(onRemoveFund);
  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onRemoveFromGroupRef = useRef(onRemoveFromGroup);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);
  const onHoldingProfitClickRef = useRef(onHoldingProfitClick);

  useEffect(() => {
    onRemoveFundRef.current = onRemoveFund;
    onToggleFavoriteRef.current = onToggleFavorite;
    onRemoveFromGroupRef.current = onRemoveFromGroup;
    onHoldingAmountClickRef.current = onHoldingAmountClick;
    onHoldingProfitClickRef.current = onHoldingProfitClick;
  }, [
    onRemoveFund,
    onToggleFavorite,
    onRemoveFromGroup,
    onHoldingAmountClick,
    onHoldingProfitClick,
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
        accessorKey: 'navOrEstimate',
        header: '净值/估值',
        size: 100,
        minSize: 80,
        cell: (info) => (
          <span style={{ fontWeight: 700 }}>{info.getValue() ?? '—'}</span>
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
              <span className={cls} style={{ fontWeight: 700 }}>
                {info.getValue() ?? '—'}
              </span>
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
              <span className={cls} style={{ fontWeight: 700 }}>
                {info.getValue() ?? '—'}
              </span>
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
              style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation?.();
                onHoldingAmountClickRef.current?.(original, { hasHolding: true });
              }}
            >
              <span style={{ fontWeight: 700, marginRight: 6 }}>{info.getValue() ?? '—'}</span>
              <button
                className="icon-button no-hover"
                onClick={(e) => {
                  e.stopPropagation?.();
                  onHoldingAmountClickRef.current?.(original, { hasHolding: true });
                }}
                title="编辑持仓"
                style={{ border: 'none', width: '28px', height: '28px', marginLeft: -6 }}
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
          return (
            <span className={cls} style={{ fontWeight: 700 }}>
              {hasProfit ? (info.getValue() ?? '') : ''}
            </span>
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
          return (
            <div
              title="点击切换金额/百分比"
              style={{ cursor: hasTotal ? 'pointer' : 'default' }}
              onClick={(e) => {
                if (!hasTotal) return;
                e.stopPropagation?.();
                onHoldingProfitClickRef.current?.(original);
              }}
            >
              <span className={cls} style={{ fontWeight: 700 }}>
                {hasTotal ? (info.getValue() ?? '') : ''}
              </span>
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
                setResetConfirmOpen(true);
              }}
              title="重置列宽"
              style={{ border: 'none', width: '24px', height: '24px', backgroundColor: 'transparent', color: 'var(--text)' }}
            >
              <ResetIcon width="14" height="14" />
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
            <div style={{ display: 'flex', justifyContent: 'center' }}>
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
        persistColumnSizing(rest || {});
        return rest || {};
      });
    },
    state: {
      columnSizing,
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
      backgroundColor: isHeader ? '#2a394b' : 'var(--row-bg)',
      boxShadow: 'none',
      textAlign: isNameColumn ? 'left' : 'center',
      justifyContent: isNameColumn ? 'flex-start' : 'center',
    };
  };

  return (
    <>
      <style>{`
        .table-row-scroll {
          --row-bg: var(--bg);
          background-color: var(--row-bg);
        }
        .table-row-scroll:hover {
          --row-bg: #2a394b;
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
    </>
  );
}
