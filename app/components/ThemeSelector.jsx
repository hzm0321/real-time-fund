'use client';

import { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';

const themes = [
  { id: 'default', name: '默认深蓝', desc: '原始青蓝主题', color: '#22d3ee' },
  { id: 'tokyonight', name: 'Tokyo Night', desc: '赛博朋克紫蓝', color: '#7aa2f7' },
  { id: 'catppuccin', name: 'Catppuccin', desc: '柔和粉彩', color: '#89b4fa' },
  { id: 'onedark', name: 'One Dark', desc: 'Atom 经典', color: '#61afef' },
  { id: 'materialocean', name: 'Material Ocean', desc: '深海蓝灰', color: '#82aaff' },
  { id: 'rosepine', name: 'Rosé Pine', desc: '玫瑰松木', color: '#ebbcba' },
  { id: 'gruvbox', name: 'Gruvbox', desc: '复古暖棕', color: '#fabd2f' },
  { id: 'ayu', name: 'Ayu Dark', desc: '海洋珊瑚', color: '#e6b450' },
  { id: 'crystalglass', name: 'Crystal Glass', desc: '水晶透明玻璃', color: '#58a6ff' },
  { id: 'smokedglass', name: 'Smoked Glass', desc: '烟熏玻璃深灰', color: '#0a84ff' },
  { id: 'light', name: 'Light', desc: '明亮冷灰', color: '#d5d6db' },
];

export default function ThemeSelector({ currentTheme, onThemeChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (themeId) => {
    onThemeChange(themeId);
    setIsOpen(false);
  };

  const currentThemeInfo = themes.find(t => t.id === currentTheme) || themes[0];

  return (
    <div className="theme-selector-container" ref={containerRef}>
      <button
        className="icon-button theme-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="选择主题"
        title="切换主题"
      >
        <Palette width="18" height="18" />
      </button>

      {isOpen && (
        <div className="theme-selector-dropdown">
          <div className="theme-selector-header">选择主题</div>
          {themes.map((theme) => (
            <button
              key={theme.id}
              className={`theme-option ${currentTheme === theme.id ? 'active' : ''}`}
              onClick={() => handleSelect(theme.id)}
            >
              <span
                className="theme-color-dot"
                style={{ backgroundColor: theme.color }}
              />
              <span className="theme-info">
                <span className="theme-name">{theme.name}</span>
                <span className="theme-desc">{theme.desc}</span>
              </span>
              {currentTheme === theme.id && (
                <Check width="14" height="14" className="theme-check" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
