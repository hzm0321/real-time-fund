'use client';

import { motion } from 'framer-motion';
import { CloseIcon, CloudIcon } from './Icons';

export default function CloudConfigModal({ onConfirm, onCancel, type = 'empty' }) {
  const isConflict = type === 'conflict';
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
          <button className="button" onClick={onConfirm}>
            {isConflict ? '保留本地 (覆盖云端)' : '同步本地到云端'}
          </button>
          <button className="button secondary" onClick={onCancel}>
            {isConflict ? '使用云端 (覆盖本地)' : '暂不同步'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
