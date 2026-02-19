'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CloseIcon, PlusIcon } from './Icons';

export default function AddFundToGroupModal({ allFunds, currentGroupCodes, onClose, onAdd }) {
  const [selected, setSelected] = useState(new Set());

  const availableFunds = (allFunds || []).filter(f => !(currentGroupCodes || []).includes(f.code));

  const toggleSelect = (code) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ maxWidth: '500px', width: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlusIcon width="20" height="20" />
            <span>添加基金到分组</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div className="group-manage-list-container" style={{ maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px' }}>
          {availableFunds.length === 0 ? (
            <div className="empty-state muted" style={{ textAlign: 'center', padding: '40px 0' }}>
              <p>所有基金已在该分组中</p>
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
                  <div className="fund-info" style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{fund.name}</div>
                    <div className="muted" style={{ fontSize: '12px' }}>#{fund.code}</div>
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
      </motion.div>
    </motion.div>
  );
}
