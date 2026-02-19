'use client';

import { motion } from 'framer-motion';
import { CloseIcon } from './Icons';
import weixinImg from '../assets/weixin.jpg';

export default function WeChatModal({ onClose }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="微信用户交流群"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ zIndex: 10002 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '360px', padding: '24px' }}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>💬 微信用户交流群</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img src={weixinImg.src} alt="WeChat Group" style={{ maxWidth: '100%', borderRadius: '8px' }} />
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: '14px' }}>
          扫码加入群聊，获取最新更新与交流
        </p>
      </motion.div>
    </motion.div>
  );
}
