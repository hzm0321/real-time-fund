'use client';

import { useCallback, useEffect, useState } from 'react';
import { isArray } from 'lodash';
import { Check, Layers } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
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
      <DialogContent className="max-w-md p-6 mobile-dialog-glass border border-border shadow-2xl rounded-2xl bg-card text-card-foreground max-h-[88vh] flex flex-col">
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <Layers className="h-4 w-4 text-primary" />
            </div>
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
          {loading && options.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>正在加载可切换的板块主题...</span>
            </div>
          ) : options.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无备选多主题板块数据</div>
          ) : (
            options.map((tp, idx) => {
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
                  className={cn(
                    'group relative flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none',
                    isSelected
                      ? 'border-primary bg-primary/10 dark:bg-primary/20 shadow-sm text-foreground'
                      : 'border-border/60 bg-card hover:border-primary/60 hover:bg-primary/5 dark:hover:bg-primary/15 text-foreground'
                  )}
                >
                  <div className="flex flex-col gap-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{name}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground tracking-wider">{tp}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={cn(
                        'text-xs font-semibold px-2.5 py-1 rounded-full border',
                        isUp
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                          : isDown
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-secondary text-muted-foreground border-transparent'
                      )}
                    >
                      {pctText}
                    </span>

                    <div
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200',
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                          : 'border border-border/80 text-transparent group-hover:border-primary group-hover:text-primary/40 group-hover:scale-105'
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              );
            })
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
