'use client';
import { isArray } from 'lodash';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { fetchFundHistory } from '../api/fund';
import * as qk from '../lib/query-keys';
import FundHistoryNetValueModal from './FundHistoryNetValueModal';

/**
 * 历史净值表格行：日期、单位净值、累计净值、日涨幅（按日期降序，涨红跌绿）
 */
function buildRows(history) {
  if (!isArray(history) || history.length === 0) return [];
  const reversed = [...history].reverse();
  return reversed.map((item, i) => {
    const prev = reversed[i + 1];
    const unitNetValue = item.unitNetValue ?? item.value;
    let dailyChange = item.equityReturn ?? null;
    if (
      dailyChange == null &&
      prev &&
      Number.isFinite(unitNetValue) &&
      Number.isFinite(prev.unitNetValue) &&
      prev.unitNetValue !== 0
    ) {
      dailyChange = ((unitNetValue - prev.unitNetValue) / prev.unitNetValue) * 100;
    }
    return {
      date: item.date,
      unitNetValue,
      accumulatedNetValue: item.accumulatedNetValue,
      dailyChange
    };
  });
}

const columns = [
  {
    accessorKey: 'date',
    header: '日期',
    cell: (info) => info.getValue(),
    meta: { align: 'left' }
  },
  {
    accessorKey: 'unitNetValue',
    header: '单位净值',
    cell: (info) => {
      const v = info.getValue();
      return v != null && Number.isFinite(v) ? Number(v).toFixed(4) : '—';
    },
    meta: { align: 'center' }
  },
  {
    accessorKey: 'accumulatedNetValue',
    header: '累计净值',
    cell: (info) => {
      const v = info.getValue();
      return v != null && Number.isFinite(v) ? Number(v).toFixed(4) : '—';
    },
    meta: { align: 'center' }
  },
  {
    accessorKey: 'dailyChange',
    header: '日涨幅',
    cell: (info) => {
      const v = info.getValue();
      if (v == null || !Number.isFinite(v)) return '—';
      const sign = v > 0 ? '+' : '';
      const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
      return (
        <span className={cls}>
          {sign}
          {v.toFixed(2)}%
        </span>
      );
    },
    meta: { align: 'right' }
  }
];

export default function FundHistoryNetValue({ code, range = '1m', theme }) {
  const [modalOpen, setModalOpen] = useState(false);

  const {
    data: historyRaw,
    isPending: loading,
    isError
  } = useQuery({
    queryKey: qk.fundHistory(code, range, 'accumulated'),
    queryFn: () => fetchFundHistory(code, range, { netValueType: 'accumulated' }),
    enabled: Boolean(code),
    staleTime: 10 * 60 * 1000
  });

  const data = useMemo(() => buildRows(historyRaw || []), [historyRaw]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const visibleRows = table.getRowModel().rows.slice(0, 5);

  if (!code) return null;
  if (loading) {
    return (
      <div className="fund-history-net-value" style={{ padding: '12px 0' }}>
        <span className="muted" style={{ fontSize: '13px' }}>
          加载历史净值...
        </span>
      </div>
    );
  }
  if (isError || data.length === 0) {
    return (
      <div className="fund-history-net-value" style={{ padding: '12px 0' }}>
        <span className="muted" style={{ fontSize: '13px' }}>
          {isError ? '加载失败' : '暂无历史净值'}
        </span>
      </div>
    );
  }

  return (
    <div className="fund-history-net-value">
      <div
        className="fund-history-table-wrapper"
        style={{
          marginTop: 8,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          background: 'var(--card)'
        }}
      >
        <table
          className="fund-history-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
            color: 'var(--text)'
          }}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--table-row-alt-bg)'
                }}
              >
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    style={{
                      padding: '8px 12px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      textAlign: h.column.columnDef.meta?.align || 'left'
                    }}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: '1px solid var(--border)'
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{
                      padding: '8px 12px',
                      color: 'var(--text)',
                      textAlign: cell.column.columnDef.meta?.align || 'left'
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

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          className="muted"
          style={{
            fontSize: 12,
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer'
          }}
          onClick={() => setModalOpen(true)}
        >
          加载更多历史净值
        </button>
      </div>

      {modalOpen && <FundHistoryNetValueModal open={modalOpen} onOpenChange={setModalOpen} code={code} theme={theme} />}
    </div>
  );
}
