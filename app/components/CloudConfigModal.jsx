'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import ConfirmModal from './ConfirmModal';
import { CloseIcon, CloudIcon } from './Icons';

export default function CloudConfigModal({ onConfirm, onCancel, type = 'empty' }) {
  const [pendingAction, setPendingAction] = useState(null); // 'local' | 'cloud' | null
  const isConflict = type === 'conflict';

  const handlePrimaryClick = () => {
    if (isConflict) {
      setPendingAction('local');
    } else {
      onConfirm?.();
    }
  };

  const handleSecondaryClick = () => {
    if (isConflict) {
      setPendingAction('cloud');
    } else {
      onCancel?.();
    }
  };

  const handleConfirmModalCancel = () => {
    setPendingAction(null);
  };

  const handleConfirmModalConfirm = () => {
    if (pendingAction === 'local') {
      onConfirm?.();
    } else if (pendingAction === 'cloud') {
      onCancel?.();
    }
    setPendingAction(null);
  };

  const confirmTitle =
    pendingAction === 'local'
      ? '确认使用本地配置覆盖云端？'
      : '确认使用云端配置覆盖本地？';

  const confirmMessage =
    pendingAction === 'local'
      ? '此操作会将当前本地配置同步到云端，覆盖云端原有配置，且可能无法恢复，请谨慎操作。'
      : '此操作会使用云端配置覆盖当前本地配置，导致本地修改丢失，且可能无法恢复，请谨慎操作。';

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isConflict ? "配置冲突提示" : "云端同步提示"}
      onClick={isConflict ? undefined : onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ maxWidth: '420px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CloudIcon width="20" height="20" />
            <span>{isConflict ? '发现配置冲突' : '云端暂无配置'}</span>
          </div>
          {!isConflict && (
            <button className="icon-button" onClick={onCancel} style={{ border: 'none', background: 'transparent' }}>
              <CloseIcon width="20" height="20" />
            </button>
          )}
        </div>
        <p className="muted" style={{ marginBottom: 20, fontSize: '14px', lineHeight: '1.6' }}>
          {isConflict
            ? '检测到本地配置与云端不一致，请选择操作：'
            : '是否将本地配置同步到云端？'}
        </p>
        <div className="row" style={{ flexDirection: 'column', gap: 12 }}>
          <button className="button secondary" onClick={handlePrimaryClick}>
            {isConflict ? '保留本地 (覆盖云端)' : '同步本地到云端'}
          </button>
          <button className="button" onClick={handleSecondaryClick}>
            {isConflict ? '使用云端 (覆盖本地)' : '暂不同步'}
          </button>
        </div>
      </motion.div>
      {pendingAction && (
        <ConfirmModal
          title={confirmTitle}
          message={confirmMessage}
          onConfirm={handleConfirmModalConfirm}
          onCancel={handleConfirmModalCancel}
          confirmText="确认覆盖"
          icon={<CloudIcon width="20" height="20" />}
          confirmVariant="danger"
        />
      )}
    </motion.div>
  );
}
