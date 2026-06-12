'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CloseIcon } from './Icons';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function SelectFundSingleModal({
  title = '选择基金',
  allFunds = [],
  excludeCodes = [],
  initialSelectedCode = '',
  onClose,
  onConfirm
}) {
  const [selectedCode, setSelectedCode] = useState(initialSelectedCode || '');
  const [searchQuery, setSearchQuery] = useState('');

  const availableFunds = useMemo(() => {
    const excluded = new Set((excludeCodes || []).filter(Boolean));
    const base = (allFunds || []).filter((f) => f?.code && !excluded.has(f.code));
    const query = String(searchQuery ?? '')
      .trim()
      .toLowerCase();
    if (!query) return base;
    return base.filter((f) => (f.name && f.name.toLowerCase().includes(query)) || (f.code && f.code.includes(query)));
  }, [allFunds, excludeCodes, searchQuery]);

  const handleOpenChange = (open) => {
    if (!open) onClose?.();
  };

  const canConfirm = !!selectedCode;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        overlayClassName="modal-overlay"
        overlayStyle={{ zIndex: 999 }}
        style={{ maxWidth: '500px', width: '90vw', zIndex: 999 }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🧾</span>
            <span>{title}</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div style={{ marginBottom: 16, position: 'relative' }}>
          <Search
            width="16"
            height="16"
            className="muted"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none'
            }}
          />
          <input
            type="text"
            className="input no-zoom"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索基金名称或编号"
            style={{
              width: '100%',
              paddingLeft: 36
            }}
          />
        </div>

        <div
          className="group-manage-list-container scrollbar-y-styled"
          style={{
            maxHeight: '50vh',
            overflowY: 'auto',
            paddingRight: '4px'
          }}
        >
          {availableFunds.length === 0 ? (
            <div className="empty-state muted" style={{ textAlign: 'center', padding: '40px 0' }}>
              <p>{searchQuery.trim() ? '未找到匹配的基金' : '暂无可选基金'}</p>
            </div>
          ) : (
            <div className="group-manage-list">
              {availableFunds.map((fund) => {
                const active = selectedCode === fund.code;
                return (
                  <div
                    key={fund.code}
                    className={`group-manage-item glass ${active ? 'selected' : ''}`}
                    onClick={() => setSelectedCode(fund.code)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="checkbox" style={{ marginRight: 12 }}>
                      {active && <div className="checked-mark" />}
                    </div>
                    <div className="fund-info" style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{fund.name}</div>
                      <div
                        style={{ fontSize: '12px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}
                      >
                        <span className="muted">#{fund.code}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 24, gap: 12 }}>
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
            disabled={!canConfirm}
            onClick={() => {
              const picked = (allFunds || []).find((f) => f?.code === selectedCode) || null;
              if (!picked) return;
              onConfirm?.(picked);
            }}
            style={{ flex: 1, opacity: canConfirm ? 1 : 0.6 }}
          >
            确定
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
