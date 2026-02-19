'use client';

import { motion } from 'framer-motion';

export default function ScanImportProgressModal({ scanImportProgress }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="导入进度"
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
          正在导入基金…
        </div>
        {scanImportProgress.total > 0 && (
          <div className="muted" style={{ marginBottom: 12 }}>
            进度 {scanImportProgress.current} / {scanImportProgress.total}
          </div>
        )}
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          成功 {scanImportProgress.success}，失败 {scanImportProgress.failed}
        </div>
      </motion.div>
    </motion.div>
  );
}
