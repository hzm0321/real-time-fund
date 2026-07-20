'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { cn } from '@/lib/utils';
import { useIsMobile } from '../hooks/useIsMobile';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { CloseIcon } from './Icons';
import { useModalStore } from '../stores';

export default function AllSectorsModal({ onClose }) {
  const isMobile = useIsMobile();
  const scrollRef = useRef(null);

  const initialFilter = useModalStore((s) => s.allSectorsFilter) || 'industry';
  const initialSort = useModalStore((s) => s.allSectorsSort) || 'change_pct';
  const initialSortOrder = useModalStore((s) => s.allSectorsSortOrder) || 'desc';

  const [sectorFilter, setSectorFilter] = useState(initialFilter); // industry, concept
  const [sectorSort, setSectorSort] = useState(initialSort); // change_pct, net_inflow
  const [sectorSortOrder, setSectorSortOrder] = useState(initialSortOrder); // desc, asc

  const handleSortChange = (key) => {
    if (!key || sectorSort === key) {
      setSectorSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSectorSort(key);
      setSectorSortOrder('desc');
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = (v) => {
    if (v) {
      setSectorFilter(v);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const { data: sectorEstimates } = useQuery({
    queryKey: ['hotSectors'],
    queryFn: async () => {
      try {
        if (!supabase) return [];
        const { data, error } = await supabase.from('fund_topic').select('*');
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.error('Fetch hot sectors error:', e);
        return [];
      }
    },
    staleTime: 120000
  });

  const filteredAndSortedSectors = useMemo(() => {
    if (!sectorEstimates) return [];

    let result = sectorEstimates;
    if (sectorFilter !== 'all') {
      result = result.filter((s) => s.sector_type === sectorFilter);
    }

    result = [...result].sort((a, b) => {
      const valA = a[sectorSort] || 0;
      const valB = b[sectorSort] || 0;
      return sectorSortOrder === 'desc' ? valB - valA : valA - valB;
    });

    return result;
  }, [sectorEstimates, sectorFilter, sectorSort, sectorSortOrder]);

  const formatPercent = (val) => {
    if (val === undefined || val === null || val === '---' || val === '') return '--';
    const num = parseFloat(val);
    if (!Number.isFinite(num)) return '0.00%';
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  };

  const getColorClass = (val) => {
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num === 0) return 'text-[var(--foreground)]';
    return num > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]';
  };

  const Content = (
    <div className="flex flex-col h-[60vh] sm:h-[70vh]">
      <div className="flex flex-col gap-3 p-4 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium shrink-0">板块类别</span>
          <ToggleGroup
            type="single"
            value={sectorFilter}
            onValueChange={handleFilterChange}
            className="bg-black/5 dark:bg-white/10 p-0.5 rounded-md border border-black/5 dark:border-white/5 gap-0 shadow-inner overflow-x-auto no-scrollbar"
          >
            <ToggleGroupItem
              value="industry"
              className="h-6 px-2 text-[10px] rounded-sm border-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              行业
            </ToggleGroupItem>
            <ToggleGroupItem
              value="concept"
              className="h-6 px-2 text-[10px] rounded-sm border-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              概念
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium shrink-0">排序类别</span>
          <ToggleGroup
            type="single"
            value={sectorSort}
            onValueChange={handleSortChange}
            className="bg-black/5 dark:bg-white/10 p-0.5 rounded-md border border-black/5 dark:border-white/5 gap-0 shadow-inner overflow-x-auto no-scrollbar"
          >
            <ToggleGroupItem
              value="change_pct"
              className="h-6 px-2 text-[10px] flex items-center gap-0.5 rounded-sm border-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              按涨幅
              <span
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  lineHeight: 1,
                  fontSize: '8px',
                  transform: 'scale(0.8)',
                  transformOrigin: 'center',
                  opacity: sectorSort === 'change_pct' ? 1 : 0.3
                }}
              >
                <span style={{ opacity: sectorSort === 'change_pct' && sectorSortOrder === 'asc' ? 1 : 0.3 }}>▲</span>
                <span style={{ opacity: sectorSort === 'change_pct' && sectorSortOrder === 'desc' ? 1 : 0.3 }}>▼</span>
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="net_inflow"
              className="h-6 px-2 text-[10px] flex items-center gap-0.5 rounded-sm border-0 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              按资金流入
              <span
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  lineHeight: 1,
                  fontSize: '8px',
                  transform: 'scale(0.8)',
                  transformOrigin: 'center',
                  opacity: sectorSort === 'net_inflow' ? 1 : 0.3
                }}
              >
                <span style={{ opacity: sectorSort === 'net_inflow' && sectorSortOrder === 'asc' ? 1 : 0.3 }}>▲</span>
                <span style={{ opacity: sectorSort === 'net_inflow' && sectorSortOrder === 'desc' ? 1 : 0.3 }}>▼</span>
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-0" ref={scrollRef}>
        {filteredAndSortedSectors.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">暂无数据</div>
        ) : (
          <div
            className="fund-history-table-wrapper"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--card)',
              marginTop: 16
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
                <tr
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--table-row-alt-bg)',
                    boxShadow: '0 1px 0 0 var(--border)'
                  }}
                >
                  <th
                    style={{
                      padding: '8px 12px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      textAlign: 'left',
                      background: 'var(--table-row-alt-bg)',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      borderTopLeftRadius: 'var(--radius)'
                    }}
                  >
                    板块名称
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSortChange('change_pct')}
                    style={{
                      padding: '8px 12px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      textAlign: 'right',
                      background: 'var(--table-row-alt-bg)',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      涨跌幅
                      <span
                        style={{
                          display: 'inline-flex',
                          flexDirection: 'column',
                          lineHeight: 1,
                          fontSize: '8px',
                          opacity: sectorSort === 'change_pct' ? 1 : 0.3
                        }}
                      >
                        <span style={{ opacity: sectorSort === 'change_pct' && sectorSortOrder === 'asc' ? 1 : 0.3 }}>
                          ▲
                        </span>
                        <span style={{ opacity: sectorSort === 'change_pct' && sectorSortOrder === 'desc' ? 1 : 0.3 }}>
                          ▼
                        </span>
                      </span>
                    </div>
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => handleSortChange('net_inflow')}
                    style={{
                      padding: '8px 12px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      textAlign: 'right',
                      background: 'var(--table-row-alt-bg)',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      borderTopRightRadius: 'var(--radius)'
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      资金流入
                      <span
                        style={{
                          display: 'inline-flex',
                          flexDirection: 'column',
                          lineHeight: 1,
                          fontSize: '8px',
                          opacity: sectorSort === 'net_inflow' ? 1 : 0.3
                        }}
                      >
                        <span style={{ opacity: sectorSort === 'net_inflow' && sectorSortOrder === 'asc' ? 1 : 0.3 }}>
                          ▲
                        </span>
                        <span style={{ opacity: sectorSort === 'net_inflow' && sectorSortOrder === 'desc' ? 1 : 0.3 }}>
                          ▼
                        </span>
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedSectors.map((sector) => {
                  const pctStr = sector.change_pct != null ? String(sector.change_pct) : '0.00';

                  return (
                    <tr
                      key={sector.id || sector.sector_id}
                      style={{
                        borderBottom: '1px solid var(--border)'
                      }}
                      className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <td
                        style={{
                          padding: '8px 12px',
                          color: 'var(--text)',
                          textAlign: 'left'
                        }}
                        className="font-medium truncate max-w-[150px] sm:max-w-none"
                      >
                        {sector.sector_name}
                      </td>
                      <td
                        style={{
                          padding: '8px 12px',
                          textAlign: 'right'
                        }}
                        className={cn('font-semibold', getColorClass(pctStr))}
                      >
                        {formatPercent(pctStr)}
                      </td>
                      <td
                        style={{
                          padding: '8px 12px',
                          textAlign: 'right'
                        }}
                        className={cn(getColorClass(sector.net_inflow))}
                      >
                        {sector.net_inflow ? (sector.net_inflow / 100000000).toFixed(2) + '亿' : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={true} onOpenChange={(v) => !v && onClose()}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-5 pb-4 pt-2 text-left">
            <DrawerTitle className="text-base font-semibold text-[var(--text)]">全部板块</DrawerTitle>
            <DrawerClose
              className="icon-button border-none bg-transparent p-1"
              style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
            >
              <CloseIcon width="20" height="20" />
            </DrawerClose>
          </DrawerHeader>
          {Content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-6 pb-4 pt-6 text-left border-b border-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">全部板块</DialogTitle>
        </DialogHeader>
        {Content}
      </DialogContent>
    </Dialog>
  );
}
