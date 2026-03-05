'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CloseIcon } from './Icons';

export default function ScanImportConfirmModal({
  scannedFunds,
  selectedScannedCodes,
  onClose,
  onToggle,
  onConfirm,
  refreshing,
  groups = []
}) {
  const [selectedGroupId, setSelectedGroupId] = useState('all');

  const handleConfirm = () => {
    onConfirm(selectedGroupId);
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="确认导入基金"
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
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460, maxWidth: '90vw' }}
      >
        <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
          <span>确认导入基金</span>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        {scannedFunds.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            未识别到有效的基金代码，请尝试更清晰的截图或手动搜索。
          </div>
        ) : (
          <>
            <div className="search-results pending-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {scannedFunds.map((item) => {
                const isSelected = selectedScannedCodes.has(item.code);
                const isAlreadyAdded = item.status === 'added';
                const isInvalid = item.status === 'invalid';
                const isDisabled = isAlreadyAdded || isInvalid;
                const displayName = item.name || (isInvalid ? '未找到基金' : '未知基金');
                return (
                  <div
                    key={item.code}
                    className={`search-item ${isSelected ? 'selected' : ''} ${isAlreadyAdded ? 'added' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (isDisabled) return;
                      onToggle(item.code);
                    }}
                    style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    <div className="fund-info">
                      <span className="fund-name">{displayName}</span>
                      <span className="fund-code muted">#{item.code}</span>
                    </div>
                    {isAlreadyAdded ? (
                      <span className="added-label">已添加</span>
                    ) : isInvalid ? (
                      <span className="added-label">未找到</span>
                    ) : (
                      <div className="checkbox">
                        {isSelected && <div className="checked-mark" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>添加到分组：</span>
              <select
                className="select"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="all">全部</option>
                <option value="fav">自选</option>
                {groups.filter(g => g.id !== 'all' && g.id !== 'fav').map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="button secondary" onClick={onClose}>取消</button>
          <button className="button" onClick={handleConfirm} disabled={selectedScannedCodes.size === 0 || refreshing}>确认导入</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
