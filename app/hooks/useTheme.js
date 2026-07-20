import { useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { storageStore } from '../stores';

/**
 * 管理应用主题（dark/light）
 * - useLayoutEffect 在首帧前恢复，避免 SSR hydration 闪烁
 * - useEffect 同步到 document.documentElement 并持久化到 localStorage
 * @returns {{ theme: string, showThemeTransition: boolean, handleThemeToggle: () => void }}
 */
export function useTheme() {
  // 初始固定为 dark，避免 SSR 与客户端首屏不一致导致 hydration 报错
  const [theme, setTheme] = useState('dark');
  const [showThemeTransition, setShowThemeTransition] = useState(false);

  const handleThemeToggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    setShowThemeTransition(true);
  }, []);

  // 首帧前同步主题（与 layout 中脚本设置的 data-theme 一致），减少图标闪烁
  useLayoutEffect(() => {
    try {
      const fromDom = document.documentElement.getAttribute('data-theme');
      if (fromDom === 'light' || fromDom === 'dark') {
        setTheme(fromDom);
        return;
      }
      const fromStorage = storageStore.getItem('theme');
      if (fromStorage === 'light' || fromStorage === 'dark') {
        setTheme(fromStorage);
        document.documentElement.setAttribute('data-theme', fromStorage);
      }
    } catch {}
  }, []);

  // 主题变化时同步到 document 并持久化
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      storageStore.setItem('theme', theme);
    } catch {}
  }, [theme]);

  return { theme, showThemeTransition, setShowThemeTransition, handleThemeToggle };
}
