'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon, SettingsIcon } from './Icons';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

export default function HoldingEditModal({ fund, holding, onClose, onSave }) {
  const [mode, setMode] = useState('amount'); // 'amount' | 'share'

  const dwjz = fund?.dwjz || fund?.gsz || 0;
  const dwjzRef = useRef(dwjz);
  useEffect(() => {
    dwjzRef.current = dwjz;
  }, [dwjz]);

  const [share, setShare] = useState('');
  const [cost, setCost] = useState('');
  const [amount, setAmount] = useState('');
  const [profit, setProfit] = useState('');

  const holdingSig = useMemo(() => {
    if (!holding) return '';
    return `${holding.id ?? ''}|${holding.share ?? ''}|${holding.cost ?? ''}`;
  }, [holding]);

  useEffect(() => {
    if (holding) {
      const s = holding.share || 0;
      const c = holding.cost || 0;
      setShare(String(s));
      setCost(String(c));

      const price = dwjzRef.current;
      if (price > 0) {
        const a = s * price;
        const p = (price - c) * s;
        setAmount(a.toFixed(2));
        setProfit(p.toFixed(2));
      }
    }
    // 只在“切换持仓/初次打开”时初始化，避免净值刷新覆盖用户输入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingSig]);

  const handleModeChange = (newMode) => {
    if (newMode === mode) return;
    setMode(newMode);

    if (newMode === 'share') {
      if (amount && dwjz > 0) {
        const a = parseFloat(amount);
        const p = parseFloat(profit || 0);
        const s = a / dwjz;
        const principal = a - p;
        const c = s > 0 ? principal / s : 0;

        setShare(s.toFixed(2));
        setCost(c.toFixed(4));
      }
    } else {
      if (share && dwjz > 0) {
        const s = parseFloat(share);
        const c = parseFloat(cost || 0);
        const a = s * dwjz;
        const p = (dwjz - c) * s;

        setAmount(a.toFixed(2));
        setProfit(p.toFixed(2));
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    let finalShare = 0;
    let finalCost = 0;

    if (mode === 'share') {
      if (!share || !cost) return;
      finalShare = Number(Number(share).toFixed(2));
      finalCost = Number(cost);
    } else {
      if (!amount || !dwjz) return;
      const a = Number(amount);
      const p = Number(profit || 0);
      const rawShare = a / dwjz;
      finalShare = Number(rawShare.toFixed(2));
      const principal = a - p;
      finalCost = finalShare > 0 ? principal / finalShare : 0;
    }

    onSave({
      share: finalShare,
      cost: finalCost
    });
    onClose();
  };

  const isValid = mode === 'share'
    ? (share && cost && !isNaN(share) && !isNaN(cost))
    : (amount && !isNaN(amount) && (!profit || !isNaN(profit)) && dwjz > 0);

  const handleOpenChange = (open) => {
    if (!open) {
      onClose?.();
    }
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        overlayClassName="modal-overlay"
        style={{ maxWidth: '400px', zIndex: 999, width: '90vw' }}
      >
        <DialogTitle className="sr-only">编辑持仓</DialogTitle>
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>设置持仓</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>{fund?.name}</div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="muted" style={{ fontSize: '12px' }}>#{fund?.code}</div>
            <div className="badge" style={{ fontSize: '12px' }}>
              最新净值：<span style={{ fontWeight: 600, color: 'var(--primary)' }}>{dwjz}</span>
            </div>
          </div>
        </div>

        <div className="tabs-container" style={{ marginBottom: 20, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 12 }}>
          <div className="row" style={{ gap: 0 }}>
            <button
              type="button"
              className={`tab ${mode === 'amount' ? 'active' : ''}`}
              onClick={() => handleModeChange('amount')}
              style={{ flex: 1, justifyContent: 'center', height: 32, borderRadius: 8 }}
            >
              按金额
            </button>
            <button
              type="button"
              className={`tab ${mode === 'share' ? 'active' : ''}`}
              onClick={() => handleModeChange('share')}
              style={{ flex: 1, justifyContent: 'center', height: 32, borderRadius: 8 }}
            >
              按份额
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'amount' ? (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  持有金额 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  className={`input ${!amount ? 'error' : ''}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="请输入持有总金额"
                  style={{
                    width: '100%',
                    border: !amount ? '1px solid var(--danger)' : undefined
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  持有收益
                </label>
                <input
                  type="number"
                  step="any"
                  className="input"
                  value={profit}
                  onChange={(e) => setProfit(e.target.value)}
                  placeholder="请输入持有总收益 (可为负)"
                  style={{ width: '100%' }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  持有份额 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  className={`input ${!share ? 'error' : ''}`}
                  value={share}
                  onChange={(e) => setShare(e.target.value)}
                  placeholder="请输入持有份额"
                  style={{
                    width: '100%',
                    border: !share ? '1px solid var(--danger)' : undefined
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  持仓成本价 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  className={`input ${!cost ? 'error' : ''}`}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="请输入持仓成本价"
                  style={{
                    width: '100%',
                    border: !cost ? '1px solid var(--danger)' : undefined
                  }}
                />
              </div>
            </>
          )}

          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="button secondary" onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>取消</button>
            <button
              type="submit"
              className="button"
              disabled={!isValid}
              style={{ flex: 1, opacity: isValid ? 1 : 0.6 }}
            >
              保存
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
