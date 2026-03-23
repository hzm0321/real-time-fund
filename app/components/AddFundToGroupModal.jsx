'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { CloseIcon, PlusIcon } from './Icons';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

export default function AddFundToGroupModal({ allFunds, currentGroupCodes, holdings = {}, onClose, onAdd }) {
  const [selected, setSelected] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const availableFunds = useMemo(() => {
    const base = (allFunds || []).filter(f => !(currentGroupCodes || []).includes(f.code));
    if (!searchQuery.trim()) return base;
    const query = searchQuery.trim().toLowerCase();
    return base.filter(f =>
      (f.name && f.name.toLowerCase().includes(query)) ||
      (f.code && f.code.includes(query))
    );
  }, [allFunds, currentGroupCodes, searchQuery]);

  const getHoldingAmount = (fund) => {
    const holding = holdings[fund?.code];
    if (!holding || !holding.share || holding.share <= 0) return null;
    const nav = Number(fund?.dwjz) || Number(fund?.gsz) || Number(fund?.estGsz) || 0;
    if (!nav) return null;
    return holding.share * nav;
  };

  const toggleSelect = (code) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

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
        style={{ maxWidth: '500px', width: '90vw', zIndex: 99 }}
      >
        <style>{`
          .group-manage-list-container::-webkit-scrollbar {
            width: 6px;
          }
          .group-manage-list-container::-webkit-scrollbar-track {
            background: transparent;
          }
          .group-manage-list-container::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 3px;
            box-shadow: none;
          }
          .group-manage-list-container::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted);
          }
        `}</style>
        <DialogTitle className="sr-only">添加基金到分组</DialogTitle>
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlusIcon width="20" height="20" />
            <span>添加基金到分组</span>
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
              pointerEvents: 'none',
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
              paddingLeft: 36,
            }}
          />
        </div>

        <div
          className="group-manage-list-container"
          style={{
            maxHeight: '50vh',
            overflowY: 'auto',
            paddingRight: '4px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
          }}
        >
          {availableFunds.length === 0 ? (
            <div className="empty-state muted" style={{ textAlign: 'center', padding: '40px 0' }}>
              <p>{searchQuery.trim() ? '未找到匹配的基金' : '所有基金已在该分组中'}</p>
            </div>
          ) : (
            <div className="group-manage-list">
              {availableFunds.map((fund) => (
                <div
                  key={fund.code}
                  className={`group-manage-item glass ${selected.has(fund.code) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(fund.code)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="checkbox" style={{ marginRight: 12 }}>
                    {selected.has(fund.code) && <div className="checked-mark" />}
                  </div>
                  <div className="fund-info" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{fund.name}</div>
                    <div className="muted" style={{ fontSize: '12px' }}>#{fund.code}</div>
                    {getHoldingAmount(fund) != null && (
                      <div className="muted" style={{ fontSize: '12px', marginTop: 2 }}>
                        持仓金额：<span style={{ color: 'var(--foreground)', fontWeight: 500 }}>¥{getHoldingAmount(fund).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 24, gap: 12 }}>
          <button className="button secondary" onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>取消</button>
          <button
            className="button"
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
            style={{ flex: 1 }}
          >
            确定 ({selected.size})
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
