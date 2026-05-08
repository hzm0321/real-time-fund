'use client';
import { useIsMobile } from '@/app/hooks/useIsMobile';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { CloseIcon } from './Icons';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

function buildTableRows(series) {
  if (!Array.isArray(series) || series.length === 0) return [];
  return [...series].reverse();
}

export default function FundDailyEarningsDetailModal({
  open,
  onOpenChange,
  series = [],
  title = '收益明细',
  masked = false,
}) {
  const isMobile = useIsMobile();
  const [visibleCount, setVisibleCount] = useState(30);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (open) setVisibleCount(30);
  }, [open, series]);

  const data = useMemo(() => buildTableRows(series), [series]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'date',
        header: '日期',
        cell: (info) => info.getValue() || '—',
        meta: { align: 'left' },
      },
      {
        accessorKey: 'earnings',
        header: '收益',
        cell: (info) => {
          const v = info.getValue();
          const isValid = typeof v === 'number' && Number.isFinite(v);
          if (masked) return '***';
          if (!isValid) return '—';
          const sign = v > 0 ? '+' : v < 0 ? '-' : '';
          const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
          return (
            <span className={cls}>
              {sign}
              {Math.abs(v).toFixed(2)}
            </span>
          );
        },
        meta: { align: 'right' },
      },
      {
        accessorKey: 'rate',
        header: '收益率',
        cell: (info) => {
          const v = info.getValue();
          const row = info.row?.original;
          const earnings = Number(row?.earnings);
          const baseCostAmount = Number(row?.baseCostAmount);
          const derivedRate =
            Number.isFinite(earnings) && Number.isFinite(baseCostAmount) && baseCostAmount > 0
              ? (earnings / baseCostAmount) * 100
              : null;
          const rateValue = (v != null && Number.isFinite(v)) ? v : derivedRate;
          if (masked) return '***';
          if (rateValue == null || !Number.isFinite(rateValue)) return '—';
          const sign = rateValue > 0 ? '+' : '';
          const cls = rateValue > 0 ? 'up' : rateValue < 0 ? 'down' : '';
          return (
            <span className={cls}>
              {sign}
              {rateValue.toFixed(2)}%
            </span>
          );
        },
        meta: { align: 'right' },
      },
    ],
    [masked],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows.slice(0, visibleCount);
  const hasMore = table.getRowModel().rows.length > visibleCount;

  const handleOpenChange = (next) => {
    if (!next) onOpenChange?.(false);
  };

  const handleScroll = (e) => {
    const target = e.currentTarget;
    if (!target || !hasMore) return;
    const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distance < 40) {
      setVisibleCount((prev) => {
        const next = prev + 30;
        const total = table.getRowModel().rows.length;
        return next > total ? total : next;
      });
    }
  };

  const header = (
    <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{title}</span>
      </div>
      <button
        type="button"
        className="icon-button"
        onClick={() => onOpenChange?.(false)}
        style={{ border: 'none', background: 'transparent' }}
      >
        <CloseIcon width="20" height="20" />
      </button>
    </div>
  );

  const body = (
    <div
      ref={scrollRef}
      style={{
        maxHeight: '60vh',
        overflowY: 'auto',
        paddingRight: 4,
      }}
      onScroll={handleScroll}
    >
      {data.length === 0 && (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>暂无数据</span>
        </div>
      )}
      {data.length > 0 && (
        <div
          className="fund-history-table-wrapper"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            background: 'var(--card)',
          }}
        >
          <table
            className="fund-history-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              color: 'var(--text)',
            }}
          >
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr
                  key={hg.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--table-row-alt-bg)',
                    boxShadow: '0 1px 0 0 var(--border)',
                  }}
                >
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      style={{
                        padding: '8px 12px',
                        fontWeight: 600,
                        color: 'var(--muted)',
                        textAlign: h.column.columnDef.meta?.align || 'left',
                        background: 'var(--table-row-alt-bg)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{
                        padding: '8px 12px',
                        color: 'var(--text)',
                        textAlign: cell.column.columnDef.meta?.align || 'left',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.length > 0 && hasMore && (
        <div style={{ padding: '12px 0', textAlign: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>向下滚动以加载更多...</span>
        </div>
      )}
    </div>
  );

  if (!open) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
        <DrawerContent
          className="glass"
          defaultHeight="70vh"
          minHeight="40vh"
          maxHeight="90vh"
        >
          <DrawerHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <DrawerTitle className="flex items-center gap-2.5 text-left">
              <span>{title}</span>
            </DrawerTitle>
            <DrawerClose
              className="icon-button border-none bg-transparent p-1"
              title="关闭"
              style={{
                borderColor: 'transparent',
                backgroundColor: 'transparent',
              }}
            >
              <CloseIcon width="20" height="20" />
            </DrawerClose>
          </DrawerHeader>
          <div className="flex-1 px-4 pb-4">
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        overlayClassName="modal-overlay"
        overlayStyle={{ zIndex: 9998 }}
        style={{
          maxWidth: '520px',
          width: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {header}
        {body}
      </DialogContent>
    </Dialog>
  );
}
