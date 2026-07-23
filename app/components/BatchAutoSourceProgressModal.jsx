'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function BatchAutoSourceProgressModal({ progress, onCancel }) {
  const { current = 0, total = 0, success = 0, failed = 0 } = progress || {};
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="自动切源进度"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ zIndex: 1100 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{
          width: 360,
          maxWidth: '90vw',
          textAlign: 'center',
          padding: '28px 24px 24px'
        }}
      >
        {/* Animated Top Icon Badge */}
        <div style={{ marginBottom: 20, position: 'relative', display: 'inline-block' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              position: 'relative'
            }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
              style={{
                position: 'absolute',
                inset: -2,
                borderRadius: '50%',
                border: '2px solid transparent',
                borderTopColor: 'var(--primary)',
                borderRightColor: 'color-mix(in srgb, var(--primary) 40%, transparent)'
              }}
            />
            <Sparkles size={24} style={{ color: 'var(--primary)' }} />
          </div>
        </div>

        <div
          className="title"
          style={{
            justifyContent: 'center',
            marginBottom: 6,
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--foreground)'
          }}
        >
          正在设置自动数据源
        </div>

        <div style={{ marginBottom: 16, fontSize: '13px', color: 'var(--muted-foreground)' }}>
          已处理 <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{current}</span> / {total}（{percent}%）
        </div>

        {/* Progress Bar Container */}
        <div
          style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'color-mix(in srgb, var(--muted) 25%, transparent)',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '18px',
            border: '1px solid color-mix(in srgb, var(--border) 50%, transparent)'
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--primary), var(--accent))',
              borderRadius: '4px',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 10px color-mix(in srgb, var(--primary) 50%, transparent)'
            }}
          />
        </div>

        {/* Stats Pill Badges */}
        <div
          style={{
            display: 'flex',
            justify: 'center',
            gap: '12px',
            marginBottom: 22,
            fontSize: '13px'
          }}
        >
          <div
            style={{
              padding: '4px 12px',
              borderRadius: '12px',
              backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
              color: 'var(--success)',
              fontWeight: 500
            }}
          >
            成功 {success}
          </div>
          <div
            style={{
              padding: '4px 12px',
              borderRadius: '12px',
              backgroundColor:
                failed > 0
                  ? 'color-mix(in srgb, var(--danger) 12%, transparent)'
                  : 'color-mix(in srgb, var(--muted) 15%, transparent)',
              border:
                failed > 0 ? '1px solid color-mix(in srgb, var(--danger) 25%, transparent)' : '1px solid var(--border)',
              color: failed > 0 ? 'var(--danger)' : 'var(--muted-foreground)',
              fontWeight: 500
            }}
          >
            失败 {failed}
          </div>
        </div>

        <button
          className="button danger"
          onClick={onCancel}
          style={{ width: '100%', height: '42px', borderRadius: '8px' }}
        >
          终止设置
        </button>
      </motion.div>
    </motion.div>
  );
}
