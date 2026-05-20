'use client';

import { motion } from 'framer-motion';

export default function SuccessModal({ message, onClose, overlayStyle, cardStyle }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="成功提示"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: 'none' }}
      style={{ pointerEvents: 'auto', ...overlayStyle }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto', ...cardStyle }}
      >
        <div className="success-message" style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: 16 }}>🎉</div>
          <h3 style={{ marginBottom: 8 }}>{message}</h3>
          <p className="muted">操作已完成，您可以继续使用。</p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.01 }}
            type="button"
            className="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{ 
              marginTop: 24, 
              width: '100%', 
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'none'
            }}
          >
            关闭
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
