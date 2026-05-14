'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchFundValuationBySource } from '@/app/api/fund';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

function formatGszzlEstimate(gszzl) {
  const n = typeof gszzl === 'number' ? gszzl : Number(gszzl);
  if (!Number.isFinite(n)) return '--';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export default function FundDataSourceSelector({ fund, onClose, onSelect }) {
  const [sourceId, setSourceId] = useState('1');
  const [loading, setLoading] = useState(true);
  const [estimates, setEstimates] = useState({
    1: null,
    2: null,
    3: null,
  });
  const [bestSource, setBestSource] = useState(null);

  useEffect(() => {
    if (fund?.dataSource) {
      setSourceId(String(fund.dataSource));
    }

    if (!fund?.code) {
      setEstimates({ 1: '--', 2: '--', 3: '--' });
      setLoading(false);
      setBestSource(null);
      return undefined;
    }

    let isMounted = true;
    setLoading(true);
    setBestSource(null);

    const today = new Date().toISOString().slice(0, 10);
    const actualZzl = fund.jzrq === today && typeof fund.zzl === 'number' && Number.isFinite(fund.zzl)
      ? fund.zzl
      : null;

    Promise.all([
      fetchFundValuationBySource(fund.code, 1).catch(() => null),
      fetchFundValuationBySource(fund.code, 2).catch(() => null),
      fetchFundValuationBySource(fund.code, 3).catch(() => null),
    ]).then(([v1, v2, v3]) => {
      if (!isMounted) return;
      const e1 = formatGszzlEstimate(v1?.gszzl);
      const e2 = formatGszzlEstimate(v2?.gszzl);
      const e3 = formatGszzlEstimate(v3?.gszzl);
      setEstimates({ 1: e1, 2: e2, 3: e3 });

      if (actualZzl != null) {
        const diffs = [
          { id: 1, val: v1?.gszzl },
          { id: 2, val: v2?.gszzl },
          { id: 3, val: v3?.gszzl },
        ]
          .filter((s) => typeof s.val === 'number' && Number.isFinite(s.val))
          .map((s) => ({ id: s.id, diff: Math.abs(s.val - actualZzl) }));
        if (diffs.length > 0) {
          diffs.sort((a, b) => a.diff - b.diff);
          setBestSource(diffs[0].id);
        }
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'var(--muted)' }}>
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
                { id: '3', name: '数据源 3', est: estimates[3] },
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
                    {bestSource === Number(item.id) && (
                      <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>今日最准</span>
                    )}
                  </div>
                  <span 
                    className={item.est.startsWith('+') ? 'up' : item.est.startsWith('-') ? 'down' : 'muted'}
                    style={{ 
                      fontSize: '16px', 
                      fontWeight: 500,
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
