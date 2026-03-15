'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, Reorder } from 'framer-motion';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import ConfirmModal from './ConfirmModal';
import { CloseIcon, DragIcon, ResetIcon, SettingsIcon } from './Icons';

/**
 * 移动端表格个性化设置弹框（底部抽屉，基于 Drawer 组件）
 * @param {Object} props
 * @param {boolean} props.open - 是否打开
 * @param {() => void} props.onClose - 关闭回调
 * @param {Array<{id: string, header: string}>} props.columns - 非冻结列（id + 表头名称）
 * @param {Record<string, boolean>} [props.columnVisibility] - 列显示状态映射（id => 是否显示）
 * @param {(newOrder: string[]) => void} props.onColumnReorder - 列顺序变更回调
 * @param {(id: string, visible: boolean) => void} props.onToggleColumnVisibility - 列显示/隐藏切换回调
 * @param {() => void} props.onResetColumnOrder - 重置列顺序回调
 * @param {() => void} props.onResetColumnVisibility - 重置列显示/隐藏回调
 * @param {boolean} [props.showFullFundName] - 是否展示完整基金名称
 * @param {(show: boolean) => void} [props.onToggleShowFullFundName] - 切换是否展示完整基金名称回调
 */
export default function MobileSettingModal({
  open,
  onClose,
  columns = [],
  columnVisibility,
  onColumnReorder,
  onToggleColumnVisibility,
  onResetColumnOrder,
  onResetColumnVisibility,
  showFullFundName,
  onToggleShowFullFundName,
}) {
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  useEffect(() => {
    if (!open) setResetConfirmOpen(false);
  }, [open]);

  const handleReorder = (newItems) => {
    const newOrder = newItems.map((item) => item.id);
    onColumnReorder?.(newOrder);
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        direction="bottom"
        handleOnly={isReordering}
      >
        <DrawerContent
          className="glass"
          defaultHeight="77vh"
          minHeight="40vh"
          maxHeight="90vh"
        >
          <DrawerHeader className="mobile-setting-header flex-row items-center justify-between gap-2 py-5 pt-5 text-base font-semibold">
            <DrawerTitle className="flex items-center gap-2.5 text-left">
              <SettingsIcon width="20" height="20" />
              <span>个性化设置</span>
            </DrawerTitle>
            <DrawerClose
              className="icon-button border-none bg-transparent p-1"
              title="关闭"
              style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
            >
              <CloseIcon width="20" height="20" />
            </DrawerClose>
          </DrawerHeader>

          <div className="mobile-setting-body flex flex-1 flex-col overflow-y-auto">
            {onToggleShowFullFundName && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: '14px' }}>展示完整基金名称</span>
                <Switch
                  checked={!!showFullFundName}
                  onCheckedChange={(checked) => {
                    onToggleShowFullFundName?.(!!checked);
                  }}
                  title={showFullFundName ? '关闭' : '开启'}
                />
              </div>
            )}
            <h3 className="mobile-setting-subtitle">表头设置</h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                gap: 8,
              }}
            >
              <p className="muted" style={{ fontSize: '13px', margin: 0 }}>
                拖拽调整列顺序
              </p>
              {(onResetColumnOrder || onResetColumnVisibility) && (
                <button
                  className="icon-button"
                  onClick={() => setResetConfirmOpen(true)}
                  title="重置表头设置"
                  style={{
                    border: 'none',
                    width: '28px',
                    height: '28px',
                    backgroundColor: 'transparent',
                    color: 'var(--muted)',
                    flexShrink: 0,
                  }}
                >
                  <ResetIcon width="16" height="16" />
                </button>
              )}
            </div>
            {columns.length === 0 ? (
              <div className="muted" style={{ textAlign: 'center', padding: '24px 0', fontSize: '14px' }}>
                暂无可配置列
              </div>
            ) : (
              <Reorder.Group
                axis="y"
                values={columns}
                onReorder={handleReorder}
                className="mobile-setting-list"
                layoutScroll
                style={{ touchAction: 'none' }}
              >
                <AnimatePresence mode="popLayout">
                  {columns.map((item, index) => (
                    <Reorder.Item
                      key={item.id || `col-${index}`}
                      value={item}
                      className="mobile-setting-item glass"
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      onDragStart={() => setIsReordering(true)}
                      onDragEnd={() => setIsReordering(false)}
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 35,
                        mass: 1,
                        layout: { duration: 0.2 },
                      }}
                      style={{ touchAction: 'none' }}
                    >
                      <div
                        className="drag-handle"
                        style={{
                          cursor: 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          color: 'var(--muted)',
                        }}
                      >
                        <DragIcon width="18" height="18" />
                      </div>
                      <div style={{ flex: 1, fontSize: '14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>{item.header}</span>
                        {item.id === 'totalChangePercent' && (
                          <span className="muted" style={{ fontSize: '12px' }}>
                            估值涨幅与持有收益的汇总
                          </span>
                        )}
                      </div>
                      {onToggleColumnVisibility && (
                        <Switch
                          checked={columnVisibility?.[item.id] !== false}
                          onCheckedChange={(checked) => {
                            onToggleColumnVisibility(item.id, !!checked);
                          }}
                          title={columnVisibility?.[item.id] === false ? '显示' : '隐藏'}
                        />
                      )}
                    </Reorder.Item>
                  ))}
                </AnimatePresence>
              </Reorder.Group>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <AnimatePresence>
        {resetConfirmOpen && (
          <ConfirmModal
            key="mobile-reset-confirm"
            title="重置表头设置"
            message="是否重置表头顺序和显示/隐藏为默认值？"
            icon={<ResetIcon width="20" height="20" className="shrink-0 text-[var(--primary)]" />}
            confirmVariant="primary"
            onConfirm={() => {
              onResetColumnOrder?.();
              onResetColumnVisibility?.();
              setResetConfirmOpen(false);
            }}
            onCancel={() => setResetConfirmOpen(false)}
            confirmText="重置"
          />
        )}
      </AnimatePresence>
    </>
  );
}
