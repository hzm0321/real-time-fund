'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { CloseIcon, RefreshIcon } from './Icons';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export default function SyncPersonalSettingsModal({ open, onClose, options = [], sourceName = '当前', onConfirm }) {
  const [selected, setSelected] = useState(() => new Set());

  const selectedNames = useMemo(
    () => options.filter((item) => selected.has(item.id)).map((item) => item.name),
    [options, selected]
  );
  const targetText = selectedNames.length > 0 ? selectedNames.join('、') : '请选择';

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) onClose?.();
  };

  const handleConfirm = () => {
    const targetIds = Array.from(selected);
    if (targetIds.length === 0) return;
    const result = onConfirm?.(targetIds);
    if (result !== false) {
      setSelected(new Set());
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        overlayClassName="modal-overlay"
        overlayStyle={{ zIndex: 10002 }}
        style={{ maxWidth: '460px', width: '90vw', zIndex: 10003 }}
      >
        <DialogTitle className="sr-only">同步个性化设置</DialogTitle>

        <div className="title" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RefreshIcon width="20" height="20" />
            <span>同步个性化设置</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
                <CloseIcon width="20" height="20" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>关闭</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
          将「{sourceName}」分组当前个性化设置同步至（{targetText}）分组。
        </p>

        <div
          className="group-manage-list-container scrollbar-y-styled"
          style={{
            maxHeight: '46vh',
            overflowY: 'auto',
            paddingRight: '4px'
          }}
        >
          {options.length === 0 ? (
            <div className="empty-state muted" style={{ textAlign: 'center', padding: '32px 0', fontSize: 14 }}>
              暂无其它可同步分组
            </div>
          ) : (
            <div className="group-manage-list">
              {options.map((item) => (
                <div
                  key={item.id}
                  className={`group-manage-item glass ${selected.has(item.id) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(item.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="checkbox" style={{ marginRight: 12 }}>
                    {selected.has(item.id) && <div className="checked-mark" />}
                  </div>
                  <div className="fund-info" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    {item.description && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 22, gap: 12 }}>
          <button
            className="button secondary"
            onClick={onClose}
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
          >
            取消
          </button>
          <button className="button" onClick={handleConfirm} disabled={selected.size === 0} style={{ flex: 1 }}>
            同步 ({selected.size})
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
