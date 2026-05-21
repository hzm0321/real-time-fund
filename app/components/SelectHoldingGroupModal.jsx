'use client';

import { useMemo, useState } from 'react';
import { CloseIcon } from './Icons';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

export default function SelectHoldingGroupModal({
  fund,
  groups = [],
  groupHoldings = {},
  onClose,
  onNext,
}) {
  const availableGroups = useMemo(() => {
    const code = fund?.code;
    if (!code) return [];
    return (groups || []).filter((g) => {
      if (!g?.id) return false;
      const holding = groupHoldings?.[g.id]?.[code];
      const share = Number(holding?.share);
      return Number.isFinite(share) && share > 0;
    });
  }, [fund?.code, groups, groupHoldings]);

  const [selectedGroupId, setSelectedGroupId] = useState(() => availableGroups[0]?.id || '');

  const canNext = !!selectedGroupId;

  const handleOpenChange = (open) => {
    if (!open) onClose?.();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        overlayClassName="modal-overlay"
        style={{ maxWidth: '420px', width: '90vw', zIndex: 99 }}
      >
        <DialogTitle className="sr-only">选择持仓分组</DialogTitle>
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>选择持仓分组</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>{fund?.name}</div>
          <div className="muted" style={{ fontSize: '12px' }}>#{fund?.code}</div>
        </div>

        <div
          className="group-manage-list-container scrollbar-y-styled"
          style={{
            maxHeight: '46vh',
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
          {availableGroups.length === 0 ? (
            <div className="empty-state muted" style={{ textAlign: 'center', padding: '32px 0' }}>
              <p>暂无可操作的持仓分组</p>
            </div>
          ) : (
            <div className="group-manage-list">
              {availableGroups.map((group) => {
                const active = selectedGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    className={`group-manage-item glass ${active ? 'selected' : ''}`}
                    onClick={() => setSelectedGroupId(group.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="checkbox" style={{ marginRight: 12 }}>
                      {active && <div className="checked-mark" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{group.name || '未命名分组'}</div>
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
            disabled={!canNext}
            onClick={() => {
              if (!selectedGroupId) return;
              onNext?.(selectedGroupId);
            }}
            style={{ flex: 1, opacity: canNext ? 1 : 0.6 }}
          >
            下一步
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
