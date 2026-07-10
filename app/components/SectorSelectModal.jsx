'use client';

import { useCallback, useEffect, useState } from 'react';
import { isArray } from 'lodash';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { fetchFundSectorOptions, fetchSectorQuotesForLabelsBatch } from '@/app/api/fund';

export default function SectorSelectModal({ open, fundCode, fundName, currentSector, onClose, onSelect, showToast }) {
  const [options, setOptions] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedSector, setSelectedSector] = useState(currentSector || '');

  useEffect(() => {
    if (open) {
      setSelectedSector(currentSector || '');
    }
  }, [open, currentSector]);

  useEffect(() => {
    if (!open || !fundCode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchFundSectorOptions(fundCode);
        if (cancelled) return;
        const validList = isArray(list) ? list.filter(Boolean) : [];
        setOptions(validList);

        if (validList.length > 0 && !currentSector) {
          setSelectedSector(validList[0] || '');
        }

        if (validList.length > 0) {
          const quoteMap = await fetchSectorQuotesForLabelsBatch(validList);
          if (!cancelled) {
            setQuotes(quoteMap || {});
          }
        }
      } catch (e) {
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fundCode, currentSector]);

  const handleConfirm = useCallback(() => {
    if (selectedSector) {
      const quote = quotes[selectedSector] || null;
      onSelect?.(fundCode, selectedSector, quote);
      onClose?.();
      showToast?.('已切换关联板块主题', 'success');
    }
  }, [fundCode, selectedSector, quotes, onSelect, onClose, showToast]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent
        className="glass card modal flex flex-col"
        style={{ maxWidth: '400px', zIndex: 999, width: '90vw', padding: '24px', maxHeight: '88vh' }}
      >
        <style>{`
          .sector-select-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .sector-select-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .sector-select-scroll::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 4px;
          }
          .sector-select-scroll::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted);
          }
        `}</style>
        <DialogHeader className="space-y-1.5 text-left shrink-0">
          <div className="flex items-center gap-2 text-primary">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">关联板块主题切换</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            {fundName ? `${fundName} (${fundCode})` : `基金代码: ${fundCode}`} · 选择您关注的对应关联板块
          </p>
        </DialogHeader>

        <div
          className="my-3 max-h-[320px] md:max-h-[380px] overflow-y-auto space-y-2.5 pr-1.5 scrollbar-y-styled sector-select-scroll"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={`skeleton-${i}`}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-card animate-pulse"
                >
                  <div className="flex flex-col gap-2 min-w-0 pr-3">
                    <div className="h-4 w-28 bg-muted/80 rounded"></div>
                    <div className="h-3 w-16 bg-muted/50 rounded"></div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="h-6 w-14 bg-muted/60 rounded-full"></div>
                    <div className="h-6 w-6 rounded-full border border-border/60 bg-muted/30"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : options.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无备选多主题板块数据</div>
          ) : (
            <RadioGroup
              value={selectedSector}
              onValueChange={setSelectedSector}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {options.map((tp, idx) => {
                const quote = quotes[tp];
                const name = quote?.name || tp;
                const pct = quote?.pct;
                const isSelected = selectedSector ? selectedSector === tp : idx === 0;

                const pctText =
                  pct != null && Number.isFinite(Number(pct)) ? `${pct > 0 ? '+' : ''}${Number(pct).toFixed(2)}%` : '—';
                const isUp = pct > 0;
                const isDown = pct < 0;

                return (
                  <div
                    key={tp}
                    onClick={() => setSelectedSector(tp)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      borderRadius: '12px',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected
                        ? 'color-mix(in srgb, var(--primary) 8%, var(--card))'
                        : 'var(--secondary)',
                      cursor: 'pointer',
                      width: '100%',
                      transition: 'all 0.2s ease',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minWidth: 0 }}>
                      <RadioGroupItem value={tp} id={`sector-${tp}`} style={{ flexShrink: 0, marginTop: '2px' }} />

                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              color: 'var(--foreground)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {name}
                          </span>
                          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>
                            {tp}
                          </span>
                        </div>

                        <span
                          className={cn(
                            'text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0',
                            isUp
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                              : isDown
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-secondary text-muted-foreground border-transparent'
                          )}
                        >
                          {pctText}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        </div>

        <div className="row shrink-0" style={{ gap: 12, marginTop: 16 }}>
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
          >
            取消
          </button>
          <button
            type="button"
            className="button"
            onClick={handleConfirm}
            disabled={!selectedSector}
            style={{ flex: 1, opacity: selectedSector ? 1 : 0.6 }}
          >
            确定
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
