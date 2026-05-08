'use client';
import { useIsMobile } from '@/app/hooks/useIsMobile';

import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import ConfirmModal from './ConfirmModal';
import { CalendarIcon, LoginIcon, LogoutIcon, SettingsIcon, UserIcon } from './Icons';

export default function UserMenu({user,
  userAvatar,
  navbarHeight,
  lastSyncTime,
  isSyncing,
  onSync,
  onOpenSettings,
  onOpenPortfolioEarnings,
  onOpenLogin,
  onLogout,
  onLogoutConfirmOpenChange}) {
  const isMobile = useIsMobile();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    onLogoutConfirmOpenChange?.(logoutConfirmOpen);
  }, [logoutConfirmOpen, onLogoutConfirmOpenChange]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [user?.id]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  return (
    <>
      <div className="user-menu-container" ref={userMenuRef}>
        <button
          className={`icon-button user-menu-trigger ${user ? 'logged-in' : ''}`}
          aria-label={user ? '用户菜单' : '登录'}
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          title={user ? (user.email || '用户') : '用户菜单'}
        >
          {user ? (
            <div className="user-avatar-small">
              {userAvatar ? (
                <Image
                  src={userAvatar}
                  alt="用户头像"
                  width={20}
                  height={20}
                  unoptimized
                  style={{ borderRadius: '50%' }}
                />
              ) : (
                (user.email?.charAt(0).toUpperCase() || 'U')
              )}
            </div>
          ) : (
            <UserIcon width="18" height="18" />
          )}
        </button>

        <AnimatePresence>
          {userMenuOpen && (
            <motion.div
              className="user-menu-dropdown glass"
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              style={{ transformOrigin: 'top right', top: navbarHeight + (isMobile ? -20 : 10) }}
            >
              {user ? (
                <>
                  <div className="user-menu-header">
                    <div className="user-avatar-large">
                      {userAvatar ? (
                        <Image
                          src={userAvatar}
                          alt="用户头像"
                          width={40}
                          height={40}
                          unoptimized
                          style={{ borderRadius: '50%' }}
                        />
                      ) : (
                        (user.email?.charAt(0).toUpperCase() || 'U')
                      )}
                    </div>
                    <div className="user-info">
                      <span className="user-email">{user.email}</span>
                      <span className="user-status">已登录</span>
                      {lastSyncTime && (
                        <span className="muted" style={{ fontSize: '10px', marginTop: 2 }}>
                          同步于 {dayjs(lastSyncTime).format('MM-DD HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="user-menu-divider" />
                  {!isMobile && (
                    <button
                      className="user-menu-item"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onOpenPortfolioEarnings?.();
                      }}
                    >
                      <CalendarIcon width="16" height="16" />
                      <span>我的收益</span>
                    </button>
                  )}
                  <button
                    className="user-menu-item"
                    disabled={isSyncing}
                    onClick={async () => {
                      setUserMenuOpen(false);
                      await onSync?.();
                    }}
                    title="手动同步配置到云端"
                  >
                    {isSyncing ? (
                      <span className="loading-spinner" style={{ width: 16, height: 16, border: '2px solid var(--muted)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" stroke="var(--primary)" />
                        <path d="M12 12v9" stroke="var(--accent)" />
                        <path d="m16 16-4-4-4 4" stroke="var(--accent)" />
                      </svg>
                    )}
                    <span>{isSyncing ? '同步中...' : '同步'}</span>
                  </button>
                  <button
                    className="user-menu-item"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onOpenSettings?.();
                    }}
                  >
                    <SettingsIcon width="16" height="16" />
                    <span>设置</span>
                  </button>
                  <button
                    className="user-menu-item danger"
                    onClick={() => {
                      setUserMenuOpen(false);
                      setLogoutConfirmOpen(true);
                    }}
                  >
                    <LogoutIcon width="16" height="16" />
                    <span>登出</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="user-menu-item"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onOpenLogin?.();
                    }}
                  >
                    <LoginIcon width="16" height="16" />
                    <span>登录</span>
                  </button>
                  {!isMobile && (
                    <button
                      className="user-menu-item"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onOpenPortfolioEarnings?.();
                      }}
                    >
                      <CalendarIcon width="16" height="16" />
                      <span>我的收益</span>
                    </button>
                  )}
                  <button
                    className="user-menu-item"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onOpenSettings?.();
                    }}
                  >
                    <SettingsIcon width="16" height="16" />
                    <span>设置</span>
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {logoutConfirmOpen && (
          <ConfirmModal
            title="确认登出"
            message="确定要退出当前账号吗？"
            icon={<LogoutIcon width="20" height="20" className="shrink-0 text-[var(--danger)]" />}
            confirmText="确认登出"
            onConfirm={() => {
              setLogoutConfirmOpen(false);
              onLogout?.();
            }}
            onCancel={() => setLogoutConfirmOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

