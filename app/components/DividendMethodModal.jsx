'use client';

import { useState } from 'react';
import { CloseIcon } from './Icons';
import { useStorageStore } from '../stores/storageStore';
import { useModalStore } from '../stores';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const OPTIONS = [
  { value: 'reinvest', label: '红利再投资', desc: '分红自动转为基金份额' },
  { value: 'cash', label: '现金分红', desc: '分红以现金形式发放' }
];

export default function DividendMethodModal({ fund, groupId, onClose, showToast }) {
  const holdings = useStorageStore((s) => s.holdings);
  const groupHoldings = useStorageStore((s) => s.groupHoldings);
  const setHoldings = useStorageStore((s) => s.setHoldings);
  const setGroupHoldings = useStorageStore((s) => s.setGroupHoldings);

  // 读取当前分红方式
  const currentHolding = groupId ? groupHoldings?.[groupId]?.[fund?.code] : holdings?.[fund?.code];
  const [selected, setSelected] = useState(currentHolding?.dividendMethod || 'reinvest');
  const [syncAll, setSyncAll] = useState(false);

  const handleOpenChange = (open) => {
    if (!open) onClose?.();
  };

  const handleConfirm = () => {
    const code = fund?.code;
    if (!code) return;

    if (!groupId) {
      setHoldings((prev) => {
        const next = { ...prev };
        if (syncAll) {
          // 同步到所有持仓基金
          for (const k of Object.keys(next)) {
            if (next[k] && Number(next[k].share) > 0) {
              next[k] = { ...next[k], dividendMethod: selected };
            }
          }
        } else {
          const current = next[code] || { share: 0, cost: 0 };
          next[code] = { ...current, dividendMethod: selected };
        }
        return next;
      });
    } else {
      setGroupHoldings((prev) => {
        const next = { ...prev };
        const bucket = { ...(next[groupId] || {}) };
        if (syncAll) {
          // 同步到该分组所有持仓基金
          for (const k of Object.keys(bucket)) {
            if (bucket[k] && Number(bucket[k].share) > 0) {
              bucket[k] = { ...bucket[k], dividendMethod: selected };
            }
          }
        } else {
          const current = bucket[code] || { share: 0, cost: 0 };
          bucket[code] = { ...current, dividendMethod: selected };
        }
        next[groupId] = bucket;
        return next;
      });
    }

    useModalStore.setState({ dividendMethodModal: { open: false, fund: null, groupId: undefined } });
    showToast?.(syncAll ? '已同步所有持仓基金分红方式' : '分红方式已更新', 'success');
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        overlayClassName="modal-overlay"
        style={{ maxWidth: '380px', width: '90vw', zIndex: 99 }}
      >
        <DialogTitle className="sr-only">分红方式</DialogTitle>

        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>💰</span>
            <span>分红方式</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        {/* 基金信息 */}
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div
            className="fund-name"
            style={{
              fontWeight: 600,
              fontSize: '16px',
              marginBottom: 4
            }}
          >
            {fund?.name}
          </div>
          <div className="muted" style={{ fontSize: '12px' }}>
            #{fund?.code}
          </div>
        </div>

        {/* 分红方式单选 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 12,
                border: selected === opt.value ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                background: selected === opt.value ? 'rgba(34, 211, 238, 0.08)' : 'rgba(255,255,255,0.03)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left'
              }}
            >
              {/* 单选圆圈 */}
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: selected === opt.value ? '2px solid var(--primary)' : '2px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.2s ease'
                }}
              >
                {selected === opt.value && (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: 'var(--primary)'
                    }}
                  />
                )}
              </span>
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '14px',
                    color: selected === opt.value ? 'var(--primary)' : 'var(--text)',
                    marginBottom: 2
                  }}
                >
                  {opt.label}
                </div>
                <div className="muted" style={{ fontSize: '12px' }}>
                  {opt.desc}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* 同步到所有基金 */}
        <label
          onClick={() => setSyncAll((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 20,
            cursor: 'pointer',
            userSelect: 'none',
            padding: '0 2px'
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: syncAll ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
              background: syncAll ? 'var(--primary)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            {syncAll && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6L5 8.5L9.5 3.5"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <span className="muted" style={{ fontSize: '13px' }}>
            同步到该分组所有持仓基金
          </span>
        </label>

        {/* 按钮 */}
        <div className="row" style={{ gap: 12 }}>
          <button type="button" className="button secondary" onClick={onClose} style={{ flex: 1 }}>
            取消
          </button>
          <button type="button" className="button" onClick={handleConfirm} style={{ flex: 1 }}>
            确认
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
