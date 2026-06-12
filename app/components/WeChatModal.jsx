'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { CloseIcon } from './Icons';
import weChatGroupImg from '../assets/weChatGroup.jpg';

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
        <div className="trade-pending-alert">
          <span>⚠️ 入群须知：禁止讨论和基金买卖以及投资的有关内容，可反馈软件相关需求和问题。</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Image
            src={weChatGroupImg}
            alt="WeChat Group"
            sizes="(max-width: 360px) 100vw, 360px"
            style={{ width: '100%', height: 'auto', borderRadius: '8px' }}
          />
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: '14px' }}>
          扫码加入群聊，获取最新更新与交流
        </p>
      </motion.div>
    </motion.div>
  );
}
