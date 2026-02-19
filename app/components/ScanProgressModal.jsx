'use client';

import { motion } from 'framer-motion';

export default function ScanProgressModal({ scanProgress, onCancel }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="识别进度"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ width: 320, maxWidth: '90vw', textAlign: 'center', padding: '24px' }}
      >
        <div style={{ marginBottom: 16 }}>
          <div className="loading-spinner" style={{
            width: 40,
            height: 40,
            border: '3px solid var(--muted)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            margin: '0 auto',
            animation: 'spin 1s linear infinite'
          }} />
        </div>
        <div className="title" style={{ justifyContent: 'center', marginBottom: 8 }}>
          {scanProgress.stage === 'verify' ? '正在验证基金…' : '正在识别中…'}
        </div>
        {scanProgress.total > 0 && (
          <div className="muted" style={{ marginBottom: 20 }}>
            {scanProgress.stage === 'verify'
              ? `已验证 ${scanProgress.current} / ${scanProgress.total} 只基金`
              : `已处理 ${scanProgress.current} / ${scanProgress.total} 张图片`}
          </div>
        )}
        <button
          className="button danger"
          onClick={onCancel}
          style={{ width: '100%' }}
        >
          终止识别
        </button>
      </motion.div>
    </motion.div>
  );
}
