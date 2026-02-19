'use client';

import { motion } from 'framer-motion';
import { CloseIcon, SettingsIcon } from './Icons';

export default function AddResultModal({ failures, onClose }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="添加结果"
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
      >
        <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>部分基金添加失败</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        <div className="muted" style={{ marginBottom: 12, fontSize: '14px' }}>
          未获取到估值数据的基金如下：
        </div>
        <div className="list">
          {failures.map((it, idx) => (
            <div className="item" key={idx}>
              <span className="name">{it.name || '未知名称'}</span>
              <div className="values">
                <span className="badge">#{it.code}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="button" onClick={onClose}>知道了</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
