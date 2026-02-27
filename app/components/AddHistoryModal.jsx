'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CloseIcon } from './Icons';
import { fetchSmartFundNetValue } from '../api/fund';
import { DatePicker } from './Common';

export default function AddHistoryModal({ fund, onClose, onConfirm }) {
  const [type, setType] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [share, setShare] = useState('');
  const [netValue, setNetValue] = useState(null);
  const [netValueDate, setNetValueDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fund || !date) return;

    const getNetValue = async () => {
      setLoading(true);
      setError(null);
      setNetValue(null);
      setNetValueDate(null);
      
      try {
        const result = await fetchSmartFundNetValue(fund.code, date);
        if (result && result.value) {
          setNetValue(result.value);
          setNetValueDate(result.date);
        } else {
          setError('未找到该日期的净值数据');
        }
      } catch (err) {
        console.error(err);
        setError('获取净值失败');
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(getNetValue, 500);
    return () => clearTimeout(timer);
  }, [fund, date]);

  // Recalculate share when netValue变化或金额变化
  useEffect(() => {
    if (netValue && amount) {
      setShare((parseFloat(amount) / netValue).toFixed(2));
    }
  }, [netValue, amount]);

  const handleAmountChange = (e) => {
    const val = e.target.value;
    setAmount(val);
    if (netValue && val) {
      setShare((parseFloat(val) / netValue).toFixed(2));
    } else if (!val) {
      setShare('');
    }
  };

  const handleSubmit = () => {
    if (!type || !date || !netValue || !amount || !share) return;
    
    onConfirm({
      fundCode: fund.code,
      type,
      date: netValueDate, // Use the date from net value to be precise
      amount: parseFloat(amount),
      share: parseFloat(share),
      price: netValue,
      timestamp: new Date(netValueDate).getTime()
    });
    onClose();
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="添加历史记录"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ zIndex: 1200 }}
    >
      <motion.div
        className="glass card modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        style={{ maxWidth: '420px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <span>添加历史记录</span>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon />
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{fund?.name}</div>
          <div className="muted" style={{ fontSize: '12px' }}>{fund?.code}</div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="label">
            交易类型 <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 8,
                border: type === 'buy' ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: type === 'buy' ? 'rgba(34,211,238,0.08)' : 'transparent',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              <input
                type="radio"
                name="history-type"
                value="buy"
                checked={type === 'buy'}
                onChange={(e) => setType(e.target.value)}
                style={{ accentColor: 'var(--primary)' }}
              />
              <span>买入</span>
            </label>
            <label
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 8,
                border: type === 'sell' ? '1px solid var(--danger)' : '1px solid var(--border)',
                background: type === 'sell' ? 'rgba(248,113,113,0.08)' : 'transparent',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              <input
                type="radio"
                name="history-type"
                value="sell"
                checked={type === 'sell'}
                onChange={(e) => setType(e.target.value)}
                style={{ accentColor: 'var(--danger)' }}
              />
              <span>卖出</span>
            </label>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="label">
            交易日期 <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <DatePicker value={date} onChange={setDate} />
          {loading && <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>正在获取净值...</div>}
          {error && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: 4 }}>{error}</div>}
          {netValue && !loading && (
            <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: 4 }}>
              参考净值: {netValue} ({netValueDate})
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="label">
            金额 (¥) <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="input"
            value={amount}
            onChange={handleAmountChange}
            placeholder="0.00"
            step="0.01"
            disabled={!netValue}
          />
        </div>

        <div className="muted" style={{ fontSize: '11px', lineHeight: 1.5, marginBottom: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          *此处补录的买入/卖出仅作记录展示，不会改变当前持仓金额与份额；实际持仓请在持仓设置中维护。
        </div>

        <button
          className="button primary full-width"
          onClick={handleSubmit}
        disabled={!type || !date || !netValue || !amount || !share || loading}
        >
          确认添加
        </button>
      </motion.div>
    </motion.div>
  );
}
