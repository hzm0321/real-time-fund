'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { fetchFundHistory } from '../api/fund';
import { cachedRequest } from '../lib/cacheRequest';
import { CloseIcon } from './Icons';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

function buildRows(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const reversed = [...history].reverse();
  return reversed.map((item, i) => {
    const prev = reversed[i + 1];
    let dailyChange = null;
    if (prev && Number.isFinite(item.value) && Number.isFinite(prev.value) && prev.value !== 0) {
      dailyChange = ((item.value - prev.value) / prev.value) * 100;
    }
    return {
      date: item.date,
      netValue: item.value,
      dailyChange,
    };
  });
}

const columns = [
  {
    accessorKey: 'date',
    header: '日期',
    cell: (info) => info.getValue(),
    meta: { align: 'left' },
  },
  {
    accessorKey: 'netValue',
    header: '净值',
    cell: (info) => {
      const v = info.getValue();
      return v != null && Number.isFinite(v) ? Number(v).toFixed(4) : '—';
    },
    meta: { align: 'center' },
  },
  {
    accessorKey: 'dailyChange',
    header: '日涨幅',
    cell: (info) => {
      const v = info.getValue();
      if (v == null || !Number.isFinite(v)) return '—';
      const sign = v > 0 ? '+' : '';
      const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
      return <span className={cls}>{sign}{v.toFixed(2)}%</span>;
    },
    meta: { align: 'right' },
  },
];

export default function FundHistoryNetValueModal({ open, onOpenChange, code, theme }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(30);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!open || !code) return;
    let active = true;
    setLoading(true);
    setError(null);
    setVisibleCount(30);

    const cacheKey = `fund_history_${code}_all_modal`;
    cachedRequest(() => fetchFundHistory(code, 'all'), cacheKey, { cacheTime: 10 * 60 * 1000 })
      .then((res) => {
        if (!active) return;
        setData(buildRows(res || []));
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err);
        setData([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, code]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows.slice(0, visibleCount);
  const hasMore = table.getRowModel().rows.length > visibleCount;

  const handleOpenChange = (next) => {
    if (!next) {
      onOpenChange?.(false);
    }
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
        <span>历史净值</span>
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
      {loading && (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>加载历史净值...</span>
        </div>
      )}
      {!loading && (error || data.length === 0) && (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {error ? '加载失败' : '暂无历史净值'}
          </span>
        </div>
      )}
      {!loading && data.length > 0 && (
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
      {!loading && hasMore && (
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
              <span>历史净值</span>
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
        <DialogTitle className="sr-only">历史净值</DialogTitle>
        {header}
        {body}
      </DialogContent>
    </Dialog>
  );
}

