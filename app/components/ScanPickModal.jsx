'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { fetchOcrDailyRemaining } from '../api/fund';
import { ocrDailyRemaining } from '../lib/query-keys';
import { useUserStore } from '../stores';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function getDroppedImageFiles(dataTransfer) {
  if (!dataTransfer?.files?.length) return [];
  return Array.from(dataTransfer.files).filter((f) => IMAGE_TYPES.includes(f.type));
}

export default function ScanPickModal({ onClose, onPick, onFilesDrop, isScanning }) {
  const [isDragging, setIsDragging] = useState(false);
  const user = useUserStore((s) => s.user);

  const { data: ocrUsage } = useQuery({
    queryKey: ocrDailyRemaining(user?.id),
    queryFn: () => fetchOcrDailyRemaining(user?.id),
    enabled: !!user?.id,
    staleTime: 30_000
  });

  const remaining = ocrUsage?.remaining ?? null;
  const max = ocrUsage?.max ?? 10;
  const isExhausted = remaining !== null && remaining <= 0;
  const isWarning = remaining !== null && remaining > 0 && remaining <= 3;

  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isScanning) setIsDragging(true);
    },
    [isScanning]
  );

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (isScanning || !onFilesDrop) return;
      const files = getDroppedImageFiles(e.dataTransfer);
      if (files.length) onFilesDrop(files);
    },
    [isScanning, onFilesDrop]
  );

  const dropZoneStyle = {
    marginBottom: 12,
    padding: '20px 16px',
    borderRadius: 12,
    transition: 'border-color 0.2s ease, background 0.2s ease',
    cursor: isScanning ? 'not-allowed' : 'pointer',
    pointerEvents: isScanning ? 'none' : 'auto'
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="选择持仓截图"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal scan-pick-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: '90vw' }}
      >
        <div className="title" style={{ marginBottom: 12 }}>
          <span>选择持仓截图</span>
          {remaining !== null && (
            <span className={`ocr-quota-badge${isExhausted ? ' exhausted' : isWarning ? ' warning' : ''}`}>
              今日剩余识别次数 {remaining}/{max}
            </span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
          从相册选择一张或多张持仓截图，系统将自动识别其中的
          <span style={{ color: 'var(--primary)' }}>基金代码（6位数字）</span>，并支持批量导入。
        </div>
        <div
          className={`scan-pick-dropzone muted ${isDragging ? 'dragging' : ''}`}
          style={dropZoneStyle}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={!isScanning ? onPick : undefined}
          role="button"
          tabIndex={0}
          aria-label="拖拽图片到此处或点击选择"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!isScanning) onPick?.();
            }
          }}
        >
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: isDragging ? 'var(--primary)' : 'var(--muted)',
              textAlign: 'center'
            }}
          >
            {isDragging ? '松开即可导入' : '拖拽图片到此处，或点击选择'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button" onClick={onPick} disabled={isScanning}>
            {isScanning ? '处理中…' : '选择图片'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
