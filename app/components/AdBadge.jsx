'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { storageStore, storageReady, useModalStore } from '../stores';
import { CloseIcon } from './Icons';

/**
 * 广告/社群导流集中配置项
 */
const AD_CONFIG = {
  id: 'wechat_support_2026_07', // 改变 ID 自动重新提示并清理历史存储
  text: '加入微信用户支持群',
  actionType: 'modal', // 'modal' | 'url'
  actionTarget: 'weChatOpen', // 'weChatOpen' | 'donateOpen' 等
  url: ''
};

const STORAGE_PREFIX = 'hasClosedAdBadge_';

export default function AdBadge({ isMobile }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    (async () => {
      // 等待 localForage 数据加载到内存缓存，确保读取到最新数据
      await storageReady();
      if (cancelled) return;

      const currentKey = `${STORAGE_PREFIX}${AD_CONFIG.id}`;
      const hasClosed = storageStore.getItem(currentKey);

      if (!hasClosed) {
        setIsVisible(true);
      }

      // 自动扫描并清理历史版本的已废弃 storage 键
      const keysToRemove = [];
      for (let i = 0; i < storageStore.length; i++) {
        const key = storageStore.key(i);
        if (key && key.startsWith(STORAGE_PREFIX) && key !== currentKey) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => storageStore.removeItem(k));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isMobile || !isVisible) {
    return null;
  }

  const handleAction = () => {
    if (AD_CONFIG.actionType === 'modal') {
      if (AD_CONFIG.actionTarget === 'weChatOpen' || AD_CONFIG.actionTarget === 'weChatModal') {
        useModalStore.setState({ weChatOpen: true });
      } else if (AD_CONFIG.actionTarget === 'donateOpen' || AD_CONFIG.actionTarget === 'donateModal') {
        useModalStore.setState({ donateOpen: true });
      } else {
        useModalStore.setState({ [AD_CONFIG.actionTarget]: true });
      }
    } else if (AD_CONFIG.actionType === 'url' && AD_CONFIG.url && typeof window !== 'undefined') {
      window.open(AD_CONFIG.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleClose = (e) => {
    e.stopPropagation();
    const currentKey = `${STORAGE_PREFIX}${AD_CONFIG.id}`;
    storageStore.setItem(currentKey, 'true');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, x: 10 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.95, x: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="ad-pill-badge hidden sm:inline-flex"
          role="region"
          aria-label="推广标签"
          onClick={handleAction}
        >
          <span className="ad-badge-icon">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
          <span className="ad-badge-text">{AD_CONFIG.text}</span>
          <button
            type="button"
            className="ad-badge-close"
            onClick={handleClose}
            aria-label="关闭推广"
            title="关闭后不再提示"
          >
            <CloseIcon width="12" height="12" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
