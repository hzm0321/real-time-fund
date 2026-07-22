'use client';

import React from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import PullToRefresh from 'react-simple-pull-to-refresh';

import PcSideNav from './PcSideNav';
import MobileBottomNav from './MobileBottomNav';

export default function NavLayout({
  children,
  mainTab,
  setMainTab,
  isMobile,
  containerRef,
  containerClassName,
  containerWidth,
  showThemeTransition,
  setShowThemeTransition,
  mobileBottomNavHidden,
  onRefresh,
  isPullable
}) {
  const containerDiv = (
    <div ref={containerRef} className={containerClassName} style={{ width: isMobile ? '100%' : containerWidth }}>
      <AnimatePresence>
        {showThemeTransition && (
          <motion.div
            className="theme-transition-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="theme-transition-circle"
              initial={{ scale: 0, opacity: 0.5 }}
              animate={{ scale: 2.5, opacity: 0 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => setShowThemeTransition(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {children}

      {isMobile && (
        <MobileBottomNav value={mainTab} onChange={setMainTab} hidden={mobileBottomNavHidden && mainTab === 'home'} />
      )}
    </div>
  );

  return (
    <>
      <PcSideNav value={mainTab} onChange={setMainTab} />
      {isMobile ? (
        <PullToRefresh
          onRefresh={onRefresh}
          isPullable={isPullable}
          pullDownThreshold={60}
          maxPullDownDistance={90}
          resistance={2}
          className="ptr-wrapper"
          pullingContent={<div />}
          refreshingContent={
            <div className="lds-ellipsis">
              <div />
              <div />
              <div />
              <div />
            </div>
          }
        >
          {containerDiv}
        </PullToRefresh>
      ) : (
        containerDiv
      )}
    </>
  );
}
