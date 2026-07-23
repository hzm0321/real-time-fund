'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function BatchAutoSourceResultModal({ result, onClose }) {
  const { total = 0, successCount = 0, failedCount = 0, failedList = [], isAborted = false } = result || {};

  const isSuccess = failedCount === 0 && !isAborted;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal"
        style={{
          maxWidth: '420px',
          zIndex: 1100,
          width: '90vw',
          padding: '28px 24px 24px'
        }}
      >
        <DialogTitle className="sr-only">一键自动源设置结果</DialogTitle>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'backOut' }}
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: isSuccess
                ? 'color-mix(in srgb, var(--success) 14%, transparent)'
                : 'color-mix(in srgb, #f59e0b 14%, transparent)',
              border: isSuccess
                ? '1px solid color-mix(in srgb, var(--success) 30%, transparent)'
                : '1px solid color-mix(in srgb, #f59e0b 30%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px'
            }}
          >
            {isSuccess ? (
              <CheckCircle2 size={28} style={{ color: 'var(--success)' }} />
            ) : (
              <AlertTriangle size={28} style={{ color: '#f59e0b' }} />
            )}
          </motion.div>

          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--foreground)' }}>
            {isAborted ? '已终止自动数据源设置' : isSuccess ? '自动数据源设置完成' : '部分基金设置失败'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
            共处理 {total} 只基金
          </div>
        </div>

        {/* Stats breakdown */}
        <div
          style={{
            display: 'flex',
            justify: 'space-around',
            alignItems: 'center',
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: 'color-mix(in srgb, var(--card) 85%, var(--primary) 5%)',
            border: '1px solid var(--border)',
            marginBottom: '20px'
          }}
        >
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>成功应用</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>{successCount}</div>
          </div>
          <div style={{ width: '1px', height: '28px', backgroundColor: 'var(--border)' }} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>设置失败</div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: failedCount > 0 ? 'var(--danger)' : 'var(--muted-foreground)'
              }}
            >
              {failedCount}
            </div>
          </div>
        </div>

        {/* Failed items detailed list */}
        {failedList.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--foreground)',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <XCircle size={15} style={{ color: 'var(--danger)' }} />
              <span>设置失败基金明细（{failedList.length}只）：</span>
            </div>

            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                borderRadius: '8px',
                border: '1px solid color-mix(in srgb, var(--danger) 20%, var(--border))',
                padding: '8px 12px',
                backgroundColor: 'color-mix(in srgb, var(--danger) 5%, transparent)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              {failedList.map((item, idx) => (
                <div
                  key={item.code || idx}
                  style={{
                    fontSize: '12px',
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    borderBottom: idx < failedList.length - 1 ? '1px dashed var(--border)' : 'none',
                    paddingBottom: idx < failedList.length - 1 ? '6px' : '0'
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    <span style={{ fontWeight: 600, color: 'var(--foreground)', marginRight: '6px' }}>{item.code}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>{item.name || '未知基金'}</span>
                  </div>
                  <span style={{ color: 'var(--danger)', flexShrink: 0, fontSize: '11px', fontWeight: 500 }}>
                    {item.reason || '切源失败'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          className="button primary"
          onClick={onClose}
          style={{ width: '100%', height: '42px', borderRadius: '8px', fontWeight: 500 }}
        >
          我知道了
        </button>
      </DialogContent>
    </Dialog>
  );
}
