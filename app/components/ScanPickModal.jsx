'use client';

import { motion } from 'framer-motion';

export default function ScanPickModal({ onClose, onPick, isScanning }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="选择持仓截图"
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
        style={{ width: 420, maxWidth: '90vw' }}
      >
        <div className="title" style={{ marginBottom: 12 }}>
          <span>选择持仓截图</span>
        </div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
          从相册选择一张或多张持仓截图，系统将自动识别其中的基金代码（6位数字），并支持批量导入。
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="button secondary" onClick={onClose}>取消</button>
          <button className="button" onClick={onPick} disabled={isScanning}>
            {isScanning ? '处理中…' : '选择图片'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
