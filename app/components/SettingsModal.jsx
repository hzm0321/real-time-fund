"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import ConfirmModal from './ConfirmModal';
import { ResetIcon, SettingsIcon } from './Icons';

export default function SettingsModal({
  onClose,
  tempSeconds,
  setTempSeconds,
  saveSettings,
  exportLocalData,
  importFileRef,
  handleImportFileChange,
  importMsg,
  isMobile,
  containerWidth = 1200,
  setContainerWidth,
  onResetContainerWidth,
  showMarketIndexPc = true,
  showMarketIndexMobile = true,
}) {
  const [sliderDragging, setSliderDragging] = useState(false);
  const [resetWidthConfirmOpen, setResetWidthConfirmOpen] = useState(false);
  const [localSeconds, setLocalSeconds] = useState(tempSeconds);
  const [localShowMarketIndexPc, setLocalShowMarketIndexPc] = useState(showMarketIndexPc);
  const [localShowMarketIndexMobile, setLocalShowMarketIndexMobile] = useState(showMarketIndexMobile);
  const pageWidthTrackRef = useRef(null);

  const clampedWidth = Math.min(2000, Math.max(600, Number(containerWidth) || 1200));
  const pageWidthPercent = ((clampedWidth - 600) / (2000 - 600)) * 100;

  const updateWidthByClientX = (clientX) => {
    if (!pageWidthTrackRef.current || !setContainerWidth) return;
    const rect = pageWidthTrackRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = (clientX - rect.left) / rect.width;
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const rawWidth = 600 + clampedRatio * (2000 - 600);
    const snapped = Math.round(rawWidth / 10) * 10;
    setContainerWidth(snapped);
  };

  useEffect(() => {
    if (!sliderDragging) return;
    const onPointerUp = () => setSliderDragging(false);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  }, [sliderDragging]);

  // 外部的 tempSeconds 变更时，同步到本地显示，但不立即生效
  useEffect(() => {
    setLocalSeconds(tempSeconds);
  }, [tempSeconds]);

  useEffect(() => {
    setLocalShowMarketIndexPc(showMarketIndexPc);
  }, [showMarketIndexPc]);

  useEffect(() => {
    setLocalShowMarketIndexMobile(showMarketIndexMobile);
  }, [showMarketIndexMobile]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent
        overlayClassName={`modal-overlay ${sliderDragging ? 'modal-overlay-translucent' : ''} z-[9999]`}
        className="!p-0 z-[10000]"
        showCloseButton={false}
      >
        <div className="glass card modal">
          <div className="title" style={{ marginBottom: 12 }}>
            <SettingsIcon width="20" height="20" />
            <DialogTitle asChild>
              <span>设置</span>
            </DialogTitle>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>刷新频率</div>
            <div className="chips" style={{ marginBottom: 12 }}>
              {[30, 60, 120, 300].map((s) => (
                <button
                  key={s}
                  type="button"
                className={`chip ${localSeconds === s ? 'active' : ''}`}
                onClick={() => setLocalSeconds(s)}
                aria-pressed={localSeconds === s}
                >
                  {s} 秒
                </button>
              ))}
            </div>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min="30"
              step="5"
            value={localSeconds}
            onChange={(e) => setLocalSeconds(Number(e.target.value))}
              placeholder="自定义秒数"
            />
          {localSeconds < 30 && (
              <div className="error-text" style={{ marginTop: 8 }}>
                最小 30 秒
              </div>
            )}
          </div>

          {!isMobile && setContainerWidth && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div className="muted" style={{ fontSize: '0.8rem' }}>页面宽度</div>
                {onResetContainerWidth && (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setResetWidthConfirmOpen(true)}
                    title="重置页面宽度"
                    style={{
                      border: 'none',
                      width: '24px',
                      height: '24px',
                      padding: 0,
                      backgroundColor: 'transparent',
                      color: 'var(--muted)',
                    }}
                  >
                    <ResetIcon width="14" height="14" />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  ref={pageWidthTrackRef}
                  className="group relative"
                  style={{ flex: 1, height: 14, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  onPointerDown={(e) => {
                    setSliderDragging(true);
                    updateWidthByClientX(e.clientX);
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!sliderDragging) return;
                    updateWidthByClientX(e.clientX);
                  }}
                >
                  <Progress value={pageWidthPercent} />
                  <div
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2"
                    style={{ left: `${pageWidthPercent}%`, transform: 'translate(-50%, -50%)' }}
                  >
                    <div
                      className="h-3 w-3 rounded-full bg-primary shadow-md shadow-primary/40"
                    />
                  </div>
                </div>
                <span className="muted" style={{ fontSize: '0.8rem', minWidth: 48 }}>
                  {clampedWidth}px
                </span>
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>显示大盘指数</div>
            <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
              <Switch
                checked={isMobile ? localShowMarketIndexMobile : localShowMarketIndexPc}
                className="ml-2 scale-125"
                onCheckedChange={(checked) => {
                  const nextValue = Boolean(checked);
                  if (isMobile) setLocalShowMarketIndexMobile(nextValue);
                  else setLocalShowMarketIndexPc(nextValue);
                }}
                aria-label="显示大盘指数"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>数据导出</div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="button" onClick={exportLocalData}>导出配置</button>
            </div>
            <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem', marginTop: 26 }}>数据导入</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button type="button" className="button" onClick={() => importFileRef.current?.click?.()}>导入配置</button>
            </div>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleImportFileChange}
            />
            {importMsg && (
              <div className="muted" style={{ marginTop: 8 }}>
                {importMsg}
              </div>
            )}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
            <button
              className="button"
              onClick={(e) => saveSettings(
                e,
                localSeconds,
                isMobile ? localShowMarketIndexMobile : localShowMarketIndexPc,
                isMobile
              )}
              disabled={localSeconds < 30}
            >
              保存并关闭
            </button>
          </div>
        </div>
      </DialogContent>
      {resetWidthConfirmOpen && onResetContainerWidth && (
        <ConfirmModal
          title="重置页面宽度"
          message="是否重置页面宽度为默认值 1200px？"
          icon={<ResetIcon width="20" height="20" className="shrink-0 text-[var(--primary)]" />}
          confirmVariant="primary"
          onConfirm={() => {
            onResetContainerWidth();
            setResetWidthConfirmOpen(false);
          }}
          onCancel={() => setResetWidthConfirmOpen(false)}
          confirmText="重置"
        />
      )}
    </Dialog>
  );
}
