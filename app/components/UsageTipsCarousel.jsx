'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isArray, shuffle } from 'lodash';
import { SCAN_LOADING_TIPS_MOBILE, SCAN_LOADING_TIPS_PC } from '@/app/constants';
import { useIsMobile } from '@/app/hooks/useIsMobile';

export default function UsageTipsCarousel({ interval = 10000, style = {} }) {
  const isMobile = useIsMobile();
  const tips = isMobile ? SCAN_LOADING_TIPS_MOBILE : SCAN_LOADING_TIPS_PC;
  const [shuffledTips, setShuffledTips] = useState([]);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (isArray(tips) && tips.length > 0) {
      setShuffledTips(shuffle(tips));
      setTipIndex(0);
    }
  }, [tips]);

  useEffect(() => {
    if (!isArray(shuffledTips) || shuffledTips.length === 0) return;
    const timer = setInterval(() => {
      setTipIndex((prev) => {
        const nextIndex = prev + 1;
        if (nextIndex >= shuffledTips.length) {
          setShuffledTips(shuffle(tips));
          return 0;
        }
        return nextIndex;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [shuffledTips, tips, interval]);

  if (!isArray(shuffledTips) || shuffledTips.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: 20,
        padding: '12px 14px',
        borderRadius: '10px',
        backgroundColor: 'rgba(128, 128, 128, 0.08)',
        border: '1px solid var(--border)',
        minHeight: '68px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        ...style
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={shuffledTips[tipIndex] || tipIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="muted"
          style={{
            fontSize: '13px',
            lineHeight: '1.5',
            textAlign: 'left',
            width: '100%',
            overflowWrap: 'break-word'
          }}
        >
          {shuffledTips[tipIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
