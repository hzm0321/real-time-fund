'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloseIcon } from './Icons';
import ConfirmModal from './ConfirmModal';

export default function TransactionHistoryModal({ 
  fund, 
  transactions = [], 
  pendingTransactions = [], 
  onClose, 
  onDeleteTransaction,
  onDeletePending,
  onAddHistory
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'pending' | 'history', item }

  // Combine and sort logic if needed, but requirements say "sorted by transaction time".
  // Pending transactions are usually "future" or "processing", so they go on top.
  // Completed transactions are sorted by date desc.

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions]);

  const handleDeleteClick = (item, type) => {
    setDeleteConfirm({ type, item });
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    const { type, item } = deleteConfirm;
    if (type === 'pending') {
      onDeletePending(item.id);
    } else {
      onDeleteTransaction(item.id);
    }
    setDeleteConfirm(null);
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
      style={{ zIndex: 1100 }} // Higher than TradeModal if stacked, but usually TradeModal closes or this opens on top
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal tx-history-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>📜</span>
            <span>交易记录</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div style={{ marginBottom: 16, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>{fund?.name}</div>
            <div className="muted" style={{ fontSize: '12px' }}>#{fund?.code}</div>
          </div>
          <button 
            className="button primary" 
            onClick={onAddHistory}
            style={{ fontSize: '12px', padding: '4px 12px', height: 'auto' }}
          >
            添加记录
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {/* Pending Transactions */}
          {pendingTransactions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: 8, paddingLeft: 4 }}>待处理队列</div>
              {pendingTransactions.map((item) => (
                <div key={item.id} className="tx-history-pending-item">
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: item.type === 'buy' ? 'var(--primary)' : 'var(--danger)' }}>
                        {item.type === 'buy' ? '买入' : '卖出'}
                      </span>
                      {item.type === 'buy' && item.isDca && (
                        <span className="tx-history-dca-badge">
                          定投
                        </span>
                      )}
                    </div>
                    <span className="muted" style={{ fontSize: '12px' }}>{item.date} {item.isAfter3pm ? '(15:00后)' : ''}</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px' }}>
                    <span className="muted">份额/金额</span>
                    <span>{item.share ? `${Number(item.share).toFixed(2)} 份` : `¥${Number(item.amount).toFixed(2)}`}</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginTop: 8 }}>
                    <span className="tx-history-pending-status">等待净值更新...</span>
                    <button
                      className="button secondary tx-history-action-btn"
                      onClick={() => handleDeleteClick(item, 'pending')}
                      style={{ padding: '2px 8px', fontSize: '10px', height: 'auto' }}
                    >
                      撤销
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* History Transactions */}
          <div>
            <div className="muted" style={{ fontSize: '12px', marginBottom: 8, paddingLeft: 4 }}>历史记录</div>
            {sortedTransactions.length === 0 ? (
              <div className="muted" style={{ textAlign: 'center', padding: '20px 0', fontSize: '12px' }}>暂无历史交易记录</div>
            ) : (
              sortedTransactions.map((item) => (
                <div key={item.id} className="tx-history-record-item">
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: item.type === 'buy' ? 'var(--primary)' : 'var(--danger)' }}>
                        {item.type === 'buy' ? '买入' : '卖出'}
                      </span>
                      {item.type === 'buy' && item.isDca && (
                        <span className="tx-history-dca-badge">
                          定投
                        </span>
                      )}
                    </div>
                    <span className="muted" style={{ fontSize: '12px' }}>{item.date}</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginBottom: 2 }}>
                    <span className="muted">成交份额</span>
                    <span>{Number(item.share).toFixed(2)} 份</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginBottom: 2 }}>
                    <span className="muted">成交金额</span>
                    <span>¥{Number(item.amount).toFixed(2)}</span>
                  </div>
                  {item.price && (
                    <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginBottom: 2 }}>
                      <span className="muted">成交净值</span>
                      <span>{Number(item.price).toFixed(4)}</span>
                    </div>
                  )}
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginTop: 8 }}>
                    <span className="muted"></span>
                    <button
                      className="button secondary tx-history-action-btn"
                      onClick={() => handleDeleteClick(item, 'history')}
                      style={{ padding: '2px 8px', fontSize: '10px', height: 'auto' }}
                    >
                      删除记录
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </motion.div>

      <AnimatePresence>
        {deleteConfirm && (
          <ConfirmModal
            key="delete-confirm"
            title={deleteConfirm.type === 'pending' ? "撤销交易" : "删除记录"}
            message={deleteConfirm.type === 'pending' 
              ? "确定要撤销这笔待处理交易吗？" 
              : "确定要删除这条交易记录吗？\n注意：删除记录不会恢复已变更的持仓数据。"}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeleteConfirm(null)}
            confirmText="确认删除"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
