'use client';

import { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CloseIcon } from './Icons';
import ConfirmModal from './ConfirmModal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatMoney } from '@/lib/utils';

export default function TransactionHistoryModal({
  fund,
  transactions = [],
  pendingTransactions = [],
  onClose,
  onDeleteTransaction,
  onDeletePending,
  onAddHistory,
  onMergeAllGroups,
  canMergeAllGroups = false
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'pending' | 'history', item }
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);

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

  const handleCloseClick = (event) => {
    // 只关闭交易记录弹框，避免事件冒泡影响到其他弹框（例如 HoldingActionModal）
    event.stopPropagation();
    onClose?.();
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
        className="glass card modal tx-history-modal"
        overlayClassName="modal-overlay"
        overlayStyle={{ zIndex: 998 }}
        style={{
          maxWidth: '480px',
          width: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 999 // 保持原有层级，确保在其他弹框之上
        }}
      >
        <DialogTitle className="sr-only">交易记录</DialogTitle>

        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>📜</span>
            <span>交易记录</span>
            {canMergeAllGroups && (
              <button
                type="button"
                onClick={() => setMergeConfirmOpen(true)}
                className="button secondary"
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--primary)'
                }}
              >
                从全部分组合并
              </button>
            )}
          </div>
          <button
            className="icon-button"
            onClick={handleCloseClick}
            style={{ border: 'none', background: 'transparent' }}
          >
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div
          style={{
            marginBottom: 16,
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>
              {fund?.name}
            </div>
            <div className="muted" style={{ fontSize: '12px' }}>
              #{fund?.code}
            </div>
          </div>
          <button
            className="button primary"
            onClick={onAddHistory}
            style={{ fontSize: '12px', padding: '4px 12px', height: 'auto', width: '80px' }}
          >
            添加记录
          </button>
        </div>

        <div className="scrollbar-y-styled" style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {/* Pending Transactions */}
          {pendingTransactions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="muted" style={{ fontSize: '12px', marginBottom: 8, paddingLeft: 4 }}>
                待处理队列
              </div>
              {pendingTransactions.map((item) => (
                <div key={item.id} className="tx-history-pending-item">
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '14px',
                          color: item.type === 'buy' ? 'var(--primary)' : 'var(--danger)'
                        }}
                      >
                        {item.type === 'buy' ? '买入' : '卖出'}
                      </span>
                      {item.type === 'buy' && item.isDca && <span className="tx-history-dca-badge">定投</span>}
                    </div>
                    <span className="muted" style={{ fontSize: '12px' }}>
                      {item.date} {item.isAfter3pm ? '(15:00后)' : ''}
                    </span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px' }}>
                    <span className="muted">份额/金额</span>
                    <span>{item.share ? `${Number(item.share).toFixed(2)} 份` : `${formatMoney(item.amount)}`}</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginTop: 8 }}>
                    <span className="tx-history-pending-status">等待净值更新...</span>
                    <Button
                      type="button"
                      size="xs"
                      variant="destructive"
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => handleDeleteClick(item, 'pending')}
                      style={{ paddingInline: 10 }}
                    >
                      撤销
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* History Transactions */}
          <div>
            <div className="muted" style={{ fontSize: '12px', marginBottom: 8, paddingLeft: 4 }}>
              历史记录
            </div>
            {sortedTransactions.length === 0 ? (
              <div className="muted" style={{ textAlign: 'center', padding: '20px 0', fontSize: '12px' }}>
                暂无历史交易记录
              </div>
            ) : (
              sortedTransactions.map((item) => (
                <div key={item.id} className="tx-history-record-item">
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '14px',
                          color: item.type === 'buy' ? 'var(--primary)' : 'var(--danger)'
                        }}
                      >
                        {item.type === 'buy' ? '买入' : '卖出'}
                      </span>
                      {item.type === 'buy' && item.isDca && <span className="tx-history-dca-badge">定投</span>}
                    </div>
                    <span className="muted" style={{ fontSize: '12px' }}>
                      {item.date}
                    </span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginBottom: 2 }}>
                    <span className="muted">成交份额</span>
                    <span>{Number(item.share).toFixed(2)} 份</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginBottom: 2 }}>
                    <span className="muted">成交金额</span>
                    <span>{formatMoney(item.amount)}</span>
                  </div>
                  {item.price && (
                    <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginBottom: 2 }}>
                      <span className="muted">成交净值</span>
                      <span>{Number(item.price).toFixed(4)}</span>
                    </div>
                  )}
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginTop: 8 }}>
                    <span className="muted"></span>
                    <Button
                      type="button"
                      size="xs"
                      variant="destructive"
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => handleDeleteClick(item, 'history')}
                      style={{ paddingInline: 10 }}
                    >
                      删除记录
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <AnimatePresence>
          {deleteConfirm && (
            <ConfirmModal
              key="delete-confirm"
              title={deleteConfirm.type === 'pending' ? '撤销交易' : '删除记录'}
              message={
                deleteConfirm.type === 'pending'
                  ? '确定要撤销这笔待处理交易吗？'
                  : '确定要删除这条交易记录吗？\n注意：删除记录不会恢复已变更的持仓数据。'
              }
              onConfirm={handleConfirmDelete}
              onCancel={() => setDeleteConfirm(null)}
              confirmText="确认删除"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {mergeConfirmOpen && (
            <ConfirmModal
              key="merge-all-groups-confirm"
              title="从全部分组合并"
              message={
                '是否确认从全部分组复制合并该基金交易记录至当前分组？\n将同时复制「待处理队列」与「历史记录」，原分组数据不受影响。'
              }
              onConfirm={() => {
                onMergeAllGroups?.();
                setMergeConfirmOpen(false);
              }}
              onCancel={() => setMergeConfirmOpen(false)}
              confirmText="确定"
            />
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
