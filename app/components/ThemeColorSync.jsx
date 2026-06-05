'use client';

import { useEffect } from 'react';

const THEME_COLORS = {
  dark: '#0f172a',
  light: '#ffffff'
};

function getThemeColor() {
  if (typeof document === 'undefined') return THEME_COLORS.dark;
  const theme = document.documentElement.getAttribute('data-theme');
  return THEME_COLORS[theme] ?? THEME_COLORS.dark;
}

function applyThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getThemeColor());
}

/**
 * 根据当前亮/暗主题同步 PWA theme-color meta，使 Android 状态栏与页面主题一致。
 * 监听 document.documentElement 的 data-theme 变化并更新 meta。
 */
export default function ThemeColorSync() {
  useEffect(() => {
    applyThemeColor();
    const observer = new MutationObserver(() => applyThemeColor());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
