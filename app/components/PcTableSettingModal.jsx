'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import { createPortal } from 'react-dom';
import ConfirmModal from './ConfirmModal';
import { CloseIcon, DragIcon, ResetIcon, SettingsIcon } from './Icons';

/**
 * PC 表格个性化设置侧弹框
 * @param {Object} props
 * @param {boolean} props.open - 是否打开
 * @param {() => void} props.onClose - 关闭回调
 * @param {Array<{id: string, header: string}>} props.columns - 非冻结列（id + 表头名称）
 * @param {Record<string, boolean>} [props.columnVisibility] - 列显示状态映射（id => 是否显示）
 * @param {(newOrder: string[]) => void} props.onColumnReorder - 列顺序变更回调，参数为新的列 id 顺序
 * @param {(id: string, visible: boolean) => void} props.onToggleColumnVisibility - 列显示/隐藏切换回调
 * @param {() => void} props.onResetColumnOrder - 重置列顺序回调，需二次确认
 * @param {() => void} props.onResetColumnVisibility - 重置列显示/隐藏回调
 * @param {() => void} props.onResetSizing - 点击重置列宽时的回调（通常用于打开确认弹框）
 * @param {boolean} [props.showFullFundName] - 是否展示完整基金名称
 * @param {(show: boolean) => void} [props.onToggleShowFullFundName] - 切换是否展示完整基金名称回调
 */
export default function PcTableSettingModal({
  open,
  onClose,
  columns = [],
  columnVisibility,
  onColumnReorder,
  onToggleColumnVisibility,
  onResetColumnOrder,
  onResetColumnVisibility,
  onResetSizing,
  showFullFundName,
  onToggleShowFullFundName,
}) {
  const [resetOrderConfirmOpen, setResetOrderConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) setResetOrderConfirmOpen(false);
  }, [open]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const handleReorder = (newItems) => {
    const newOrder = newItems.map((item) => item.id);
    onColumnReorder?.(newOrder);
  };

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="drawer"
          className="pc-table-setting-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="个性化设置"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{ zIndex: 10001 }}
        >
          <motion.aside
            className="pc-table-setting-drawer glass"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pc-table-setting-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SettingsIcon width="20" height="20" />
                <span>个性化设置</span>
              </div>
              <button
                className="icon-button"
                onClick={onClose}
                title="关闭"
                style={{ border: 'none', background: 'transparent' }}
              >
                <CloseIcon width="20" height="20" />
              </button>
            </div>

            <div className="pc-table-setting-body">
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
                  <button
                    type="button"
                    className="icon-button pc-table-column-switch"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleShowFullFundName(!showFullFundName);
                    }}
                    title={showFullFundName ? '关闭' : '开启'}
                    style={{
                      border: 'none',
                      padding: '0 4px',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <span className={`dca-toggle-track ${showFullFundName ? 'enabled' : ''}`}>
                      <span
                        className="dca-toggle-thumb"
                        style={{ left: showFullFundName ? 16 : 2 }}
                      />
                    </span>
                  </button>
                </div>
              )}
              <h3 className="pc-table-setting-subtitle">表头设置</h3>
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
                {onResetColumnOrder && (
                  <button
                    className="icon-button"
                    onClick={() => setResetOrderConfirmOpen(true)}
                    title="重置列顺序"
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
                  className="pc-table-setting-list"
                >
                  <AnimatePresence mode="popLayout">
                    {columns.map((item, index) => (
                      <Reorder.Item
                        key={item.id || `col-${index}`}
                        value={item}
                        className="pc-table-setting-item glass"
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 35,
                          mass: 1,
                          layout: { duration: 0.2 },
                        }}
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
                          <button
                            type="button"
                            className="icon-button pc-table-column-switch"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleColumnVisibility(item.id, columnVisibility?.[item.id] === false);
                            }}
                            title={columnVisibility?.[item.id] === false ? '显示' : '隐藏'}
                            style={{
                              border: 'none',
                              padding: '0 4px',
                              backgroundColor: 'transparent',
                              cursor: 'pointer',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <span className={`dca-toggle-track ${columnVisibility?.[item.id] !== false ? 'enabled' : ''}`}>
                              <span
                                className="dca-toggle-thumb"
                                style={{ left: columnVisibility?.[item.id] !== false ? 16 : 2 }}
                              />
                            </span>
                          </button>
                        )}
                      </Reorder.Item>
                    ))}
                  </AnimatePresence>
                </Reorder.Group>
              )}
              {onResetSizing && (
                <button
                  className="button secondary"
                  onClick={() => {
                    onResetSizing();
                  }}
                  style={{
                    width: '100%',
                    marginTop: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <ResetIcon width="16" height="16" />
                  重置列宽
                </button>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
      {resetOrderConfirmOpen && (
        <ConfirmModal
          key="reset-order-confirm"
          title="重置表头设置"
          message="是否重置表头顺序和显示/隐藏为默认值？"
          icon={<ResetIcon width="20" height="20" className="shrink-0 text-[var(--primary)]" />}
          confirmVariant="primary"
          onConfirm={() => {
            onResetColumnOrder?.();
            onResetColumnVisibility?.();
            setResetOrderConfirmOpen(false);
          }}
          onCancel={() => setResetOrderConfirmOpen(false)}
          confirmText="重置"
        />
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
