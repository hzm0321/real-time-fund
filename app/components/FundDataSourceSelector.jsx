'use client';
import { isNumber } from 'lodash';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchFundValuationBySource, fetchBestValuationSource } from '@/app/api/fund';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

function formatGszzlEstimate(gszzl) {
  const n = isNumber(gszzl) ? gszzl : Number(gszzl);
  if (!Number.isFinite(n)) return '--';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export default function FundDataSourceSelector({ fund, onClose, onSelect }) {
  const [sourceId, setSourceId] = useState('1');
  const [loading, setLoading] = useState(true);
  const [estimates, setEstimates] = useState({
    1: null,
    2: null,
    3: null
  });
  const [valuationSources, setValuationSources] = useState({
    1: null,
    2: null,
    3: null
  });
  const [bestSource, setBestSource] = useState(null);
  const [isYesterdayAccuracy, setIsYesterdayAccuracy] = useState(false);
  const [accuracyDiff, setAccuracyDiff] = useState(null);

  useEffect(() => {
    if (fund?.dataSource) {
      setSourceId(String(fund.dataSource));
    }

    if (!fund?.code) {
      setEstimates({ 1: '--', 2: '--', 3: '--' });
      setLoading(false);
      setBestSource(null);
      setIsYesterdayAccuracy(false);
      setAccuracyDiff(null);
      return undefined;
    }

    let isMounted = true;
    setLoading(true);
    setBestSource(null);
    setIsYesterdayAccuracy(false);
    setAccuracyDiff(null);

    // 只要有实际涨跌幅，就尝试进行比对
    const actualZzl = isNumber(fund.zzl) && Number.isFinite(fund.zzl) ? fund.zzl : null;

    // 并行获取实时估算值（用于展示）和历史最准数据源（用于标签判断）
    const estimatePromise = Promise.all([
      fetchFundValuationBySource(fund.code, 1).catch(() => null),
      fetchFundValuationBySource(fund.code, 2).catch(() => null),
      fetchFundValuationBySource(fund.code, 3).catch(() => null)
    ]);

    const bestSourcePromise =
      actualZzl != null && fund.jzrq
        ? fetchBestValuationSource(fund.code, fund.jzrq, actualZzl).catch(() => null)
        : Promise.resolve(null);

    Promise.all([estimatePromise, bestSourcePromise]).then(([[v1, v2, v3], bestResult]) => {
      if (!isMounted) return;
      const e1 = formatGszzlEstimate(v1?.gszzl);
      const e2 = formatGszzlEstimate(v2?.gszzl);
      const e3 = formatGszzlEstimate(v3?.gszzl);
      setEstimates({ 1: e1, 2: e2, 3: e3 });
      setValuationSources({
        1: v1?.valuationSource,
        2: v2?.valuationSource,
        3: v3?.valuationSource
      });

      if (bestResult) {
        setBestSource(bestResult.bestSource);
        setIsYesterdayAccuracy(bestResult.isYesterdayAccuracy);
        setAccuracyDiff(bestResult.diff);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleConfirm = () => {
    onSelect(parseInt(sourceId, 10));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        style={{ maxWidth: '400px', zIndex: 999, width: '90vw', padding: '24px' }}
      >
        <DialogTitle className="sr-only">切换数据源</DialogTitle>
        <div className="title" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '18px', fontWeight: 600 }}>切换数据源</span>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 0',
                color: 'var(--muted)'
              }}
            >
              <Loader2 className="animate-spin mb-4" size={24} />
              <span style={{ fontSize: '14px' }}>正在获取估算数据...</span>
            </div>
          ) : (
            <RadioGroup
              value={sourceId}
              onValueChange={setSourceId}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {[
                { id: '1', name: '数据源 1', est: estimates[1] },
                { id: '2', name: '数据源 2', est: estimates[2] },
                { id: '3', name: '数据源 3', est: estimates[3] }
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSourceId(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    borderRadius: '12px',
                    background: sourceId === item.id ? 'var(--primary-light)' : 'rgba(0, 0, 0, 0.02)',
                    cursor: 'pointer',
                    width: '100%',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <RadioGroupItem value={item.id} id={`source-${item.id}`} />
                    <Label htmlFor={`source-${item.id}`} style={{ fontSize: '16px', cursor: 'pointer' }}>
                      {item.name}
                    </Label>
                    {valuationSources[item.id] === 'supabase_qdii' && (
                      <Badge
                        variant="outline"
                        className="ml-1 text-[10px] px-1.5 py-0 h-4 min-h-0 leading-none border-orange-500 text-orange-500 bg-orange-500/10"
                      >
                        限免
                      </Badge>
                    )}
                    {bestSource === Number(item.id) && (
                      <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0 h-4 min-h-0 leading-none">
                        {isYesterdayAccuracy ? '昨日最准' : '今日最准'}
                        {accuracyDiff != null ? ` (误差 ${accuracyDiff.toFixed(2)}%)` : ''}
                      </Badge>
                    )}
                  </div>
                  <span
                    className={
                      item.est === '--'
                        ? 'muted'
                        : item.est.startsWith('+')
                          ? 'up'
                          : item.est.startsWith('-')
                            ? 'down'
                            : 'muted'
                    }
                    style={{
                      fontSize: '16px',
                      fontWeight: 500
                    }}
                  >
                    {item.est}
                  </span>
                </div>
              ))}
            </RadioGroup>
          )}
        </div>

        <div className="row" style={{ gap: 12 }}>
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
            disabled={loading}
            style={{ flex: 1, opacity: !loading ? 1 : 0.6 }}
          >
            确定
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
