'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import FitText from './FitText';
import MobileSettingModal from './MobileSettingModal';
import { ExitIcon, SettingsIcon, StarIcon } from './Icons';

const MOBILE_NON_FROZEN_COLUMN_IDS = [
  'yesterdayChangePercent',
  'estimateChangePercent',
  'todayProfit',
  'holdingProfit',
];
const MOBILE_COLUMN_HEADERS = {
  yesterdayChangePercent: '昨日涨跌幅',
  estimateChangePercent: '估值涨跌幅',
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
 * @param {(row: any) => void} [props.onHoldingProfitClick] - 点击持有收益
 * @param {boolean} [props.refreshing] - 是否刷新中
 * @param {string} [props.sortBy] - 排序方式，'default' 时长按行触发拖拽排序
 * @param {(oldIndex: number, newIndex: number) => void} [props.onReorder] - 拖拽排序回调
 */
export default function MobileFundTable({
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
  onCustomSettingsChange,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 400, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const [activeId, setActiveId] = useState(null);

  const onToggleFavoriteRef = useRef(onToggleFavorite);
  const onRemoveFromGroupRef = useRef(onRemoveFromGroup);
  const onHoldingAmountClickRef = useRef(onHoldingAmountClick);
  const onHoldingProfitClickRef = useRef(onHoldingProfitClick);

  useEffect(() => {
    onToggleFavoriteRef.current = onToggleFavorite;
    onRemoveFromGroupRef.current = onRemoveFromGroup;
    onHoldingAmountClickRef.current = onHoldingAmountClick;
    onHoldingProfitClickRef.current = onHoldingProfitClick;
  }, [
    onToggleFavorite,
    onRemoveFromGroup,
    onHoldingAmountClick,
    onHoldingProfitClick,
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

  const getStoredMobileColumnOrder = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('customSettings');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const order = parsed?.mobileTableColumnOrder;
      if (!Array.isArray(order) || order.length === 0) return null;
      const valid = order.filter((id) => MOBILE_NON_FROZEN_COLUMN_IDS.includes(id));
      const missing = MOBILE_NON_FROZEN_COLUMN_IDS.filter((id) => !valid.includes(id));
      return [...valid, ...missing];
    } catch {
      return null;
    }
  };
  const persistMobileColumnOrder = (nextOrder) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const nextSettings =
        parsed && typeof parsed === 'object'
          ? { ...parsed, mobileTableColumnOrder: nextOrder }
          : { mobileTableColumnOrder: nextOrder };
      window.localStorage.setItem('customSettings', JSON.stringify(nextSettings));
      onCustomSettingsChange?.();
    } catch {}
  };
  const getStoredMobileColumnVisibility = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('customSettings');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const visibility = parsed?.mobileTableColumnVisibility;
      if (!visibility || typeof visibility !== 'object') return null;
      const normalized = {};
      MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
        const value = visibility[id];
        if (typeof value === 'boolean') normalized[id] = value;
      });
      return Object.keys(normalized).length ? normalized : null;
    } catch {
      return null;
    }
  };
  const persistMobileColumnVisibility = (nextVisibility) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('customSettings');
      const parsed = raw ? JSON.parse(raw) : {};
      const nextSettings =
        parsed && typeof parsed === 'object'
          ? { ...parsed, mobileTableColumnVisibility: nextVisibility }
          : { mobileTableColumnVisibility: nextVisibility };
      window.localStorage.setItem('customSettings', JSON.stringify(nextSettings));
      onCustomSettingsChange?.();
    } catch {}
  };

  const [mobileColumnOrder, setMobileColumnOrder] = useState(
    () => getStoredMobileColumnOrder() ?? [...MOBILE_NON_FROZEN_COLUMN_IDS]
  );
  const [mobileColumnVisibility, setMobileColumnVisibility] = useState(() => {
    const stored = getStoredMobileColumnVisibility();
    if (stored) return stored;
    const allVisible = {};
    MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
      allVisible[id] = true;
    });
    return allVisible;
  });
  const [settingModalOpen, setSettingModalOpen] = useState(false);

  const handleResetMobileColumnOrder = () => {
    const defaultOrder = [...MOBILE_NON_FROZEN_COLUMN_IDS];
    setMobileColumnOrder(defaultOrder);
    persistMobileColumnOrder(defaultOrder);
  };
  const handleResetMobileColumnVisibility = () => {
    const allVisible = {};
    MOBILE_NON_FROZEN_COLUMN_IDS.forEach((id) => {
      allVisible[id] = true;
    });
    setMobileColumnVisibility(allVisible);
    persistMobileColumnVisibility(allVisible);
  };
  const handleToggleMobileColumnVisibility = (columnId, visible) => {
    setMobileColumnVisibility((prev = {}) => {
      const next = { ...prev, [columnId]: visible };
      persistMobileColumnVisibility(next);
      return next;
    });
  };

  // 移动端名称列：无拖拽把手，长按整行触发排序
  const MobileFundNameCell = ({ info }) => {
    const original = info.row.original || {};
    const code = original.code;
    const isUpdated = original.isUpdated;
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
          <span className="name-text" title={isUpdated ? '今日净值已更新' : ''}>
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
        cell: (info) => <MobileFundNameCell info={info} />,
        meta: { align: 'left', cellClassName: 'name-cell', width: 140 },
      },
      {
        accessorKey: 'yesterdayChangePercent',
        header: '昨日涨跌幅',
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
        meta: { align: 'right', cellClassName: 'change-cell', width: 72 },
      },
      {
        accessorKey: 'estimateChangePercent',
        header: '估值涨跌幅',
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
              <span className="muted" style={{ fontSize: '10px' }}>{time}</span>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'est-change-cell', width: 80 },
      },
      {
        accessorKey: 'todayProfit',
        header: '当日收益',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.todayProfitValue;
          const hasProfit = value != null;
          const cls = hasProfit ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          return (
            <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 700 }}>
              <FitText maxFontSize={14} minFontSize={10}>
                {hasProfit ? (info.getValue() ?? '') : ''}
              </FitText>
            </span>
          );
        },
        meta: { align: 'right', cellClassName: 'profit-cell', width: 80 },
      },
      {
        accessorKey: 'holdingProfit',
        header: '持有收益',
        cell: (info) => {
          const original = info.row.original || {};
          const value = original.holdingProfitValue;
          const hasTotal = value != null;
          const cls = hasTotal ? (value > 0 ? 'up' : value < 0 ? 'down' : '') : 'muted';
          return (
            <div
              title="点击切换金额/百分比"
              style={{ cursor: hasTotal ? 'pointer' : 'default', width: '100%' }}
              onClick={(e) => {
                if (!hasTotal) return;
                e.stopPropagation?.();
                onHoldingProfitClickRef.current?.(original);
              }}
            >
              <span className={cls} style={{ display: 'block', width: '100%', fontWeight: 700 }}>
                <FitText maxFontSize={14} minFontSize={10}>
                  {hasTotal ? (info.getValue() ?? '') : ''}
                </FitText>
              </span>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'holding-cell', width: 80 },
      },
    ],
    [currentTab, favorites, refreshing]
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
        persistMobileColumnOrder(newNonFrozen);
      }
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ fundName: true, ...mobileColumnVisibility }) : updater;
      const rest = { ...next };
      delete rest.fundName;
      setMobileColumnVisibility(rest);
      persistMobileColumnVisibility(rest);
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

  const LAST_COLUMN_EXTRA = 12;
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
    if (columnId === 'fundName') return isHeader ? 'table-header-cell-pin-left' : 'table-cell-pin-left';
    return '';
  };

  const getAlignClass = (columnId) => {
    if (columnId === 'fundName') return '';
    if (['yesterdayChangePercent', 'estimateChangePercent', 'todayProfit', 'holdingProfit'].includes(columnId)) return 'text-right';
    return 'text-right';
  };

  return (
    <div className="mobile-fund-table">
      <div
        className="mobile-fund-table-scroll"
        style={mobileGridLayout.minWidth != null ? { minWidth: mobileGridLayout.minWidth } : undefined}
      >
        {headerGroup && (
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
        )}

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
      </div>

      {table.getRowModel().rows.length === 0 && (
        <div className="table-row empty-row">
          <div className="table-cell" style={{ textAlign: 'center' }}>
            <span className="muted">暂无数据</span>
          </div>
        </div>
      )}

      <MobileSettingModal
        open={settingModalOpen}
        onClose={() => setSettingModalOpen(false)}
        columns={mobileColumnOrder.map((id) => ({ id, header: MOBILE_COLUMN_HEADERS[id] ?? id }))}
        columnVisibility={mobileColumnVisibility}
        onColumnReorder={(newOrder) => {
          setMobileColumnOrder(newOrder);
          persistMobileColumnOrder(newOrder);
        }}
        onToggleColumnVisibility={handleToggleMobileColumnVisibility}
        onResetColumnOrder={handleResetMobileColumnOrder}
        onResetColumnVisibility={handleResetMobileColumnVisibility}
      />
    </div>
  );
}
