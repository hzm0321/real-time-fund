'use client';

import { useEffect } from 'react';

/**
 * 在客户端注册 Service Worker，满足 Android Chrome PWA 安装条件（需 HTTPS + manifest + SW）。
 * 仅在生产环境且浏览器支持时注册。
 */
export default function PwaRegister() {
  useEffect(() => {
    // 检测核心能力
    const isPwaSupported = 'serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window;
    console.log('PWA 支持:', isPwaSupported);
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') {
      return;
    }
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 可选：提示用户刷新以获取新版本
            }
          });
        });
      })
      .catch(() => {});
  }, []);

  return null;
}
