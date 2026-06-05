'use client';

import { CloseIcon } from './Icons';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function PendingTradesModal({ open, trades = [], onClose, onRevoke }) {
  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal trade-modal"
        overlayClassName="modal-overlay"
        overlayStyle={{ zIndex: 998 }}
        style={{ maxWidth: '420px', zIndex: 999, width: '90vw' }}
      >
        <DialogTitle className="sr-only">待交易队列</DialogTitle>

        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>📥</span>
            <span>待交易队列</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div className="pending-list scrollbar-y-styled" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <div className="pending-list-items" style={{ paddingTop: 0 }}>
            {trades.map((trade, idx) => (
              <div key={trade.id || idx} className="trade-pending-item">
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: trade.type === 'buy' ? 'var(--danger)' : 'var(--success)'
                    }}
                  >
                    {trade.type === 'buy' ? '买入' : '卖出'}
                  </span>
                  <span className="muted" style={{ fontSize: '12px' }}>
                    {trade.date} {trade.isAfter3pm ? '(15:00后)' : ''}
                  </span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px' }}>
                  <span className="muted">份额/金额</span>
                  <span>{trade.share ? `${trade.share} 份` : `${trade.amount}`}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginTop: 4 }}>
                  <span className="muted">状态</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="trade-pending-status">等待净值更新...</span>
                    <Button
                      type="button"
                      size="xs"
                      variant="destructive"
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => onRevoke?.(trade)}
                      style={{ paddingInline: 10 }}
                    >
                      撤销
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
