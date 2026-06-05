'use client';

import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import { createPortal } from 'react-dom';
import ConfirmModal from './ConfirmModal';
import SuccessModal from './SuccessModal';
import SyncPersonalSettingsModal from './SyncPersonalSettingsModal';
import { CloseIcon, DragIcon, RefreshIcon, ResetIcon, SettingsIcon, PinIcon } from './Icons';

/**
 * PC 表格个性化设置侧弹框
 * @param {Object} props
 * @param {boolean} props.open - 是否打开
 * @param {() => void} props.onClose - 关闭回调
 * @param {Array<{id: string, header: string}>} props.columns - 非冻结列（id + 表头名称）
 * @param {Record<string, boolean>} [props.columnVisibility] - 列显示状态映射（id => 是否显示）
 * @param {Array<string>} [props.pinnedColumns] - 已固定的列 ID 数组
 * @param {(newOrder: string[]) => void} props.onColumnReorder - 列顺序变更回调，参数为新的列 id 顺序
 * @param {(id: string, visible: boolean) => void} props.onToggleColumnVisibility - 列显示/隐藏切换回调
 * @param {(id: string) => void} props.onTogglePinColumn - 切换列固定状态回调
 * @param {() => void} props.onResetColumnOrder - 重置列顺序回调，需二次确认
 * @param {() => void} props.onResetColumnVisibility - 重置列显示/隐藏回调
 * @param {() => void} props.onResetSizing - 点击重置列宽时的回调（通常用于打开确认弹框）
 * @param {boolean} [props.showFullFundName] - 是否展示完整基金名称
 * @param {(show: boolean) => void} [props.onToggleShowFullFundName] - 切换是否展示完整基金名称回调
 * @param {Array<{id: string, name: string, description?: string}>} [props.syncOptions] - 可同步目标分组
 * @param {string} [props.currentGroupName] - 当前分组名称
 * @param {(targetIds: string[]) => void} [props.onSyncSettings] - 同步当前设置至目标分组
 */
export default function PcTableSettingModal({
  open,
  onClose,
  columns = [],
  columnVisibility,
  pinnedColumns = [],
  onColumnReorder,
  onToggleColumnVisibility,
  onTogglePinColumn,
  onResetColumnOrder,
  onResetColumnVisibility,
  onResetSizing,
  showFullFundName,
  onToggleShowFullFundName,
  syncOptions = [],
  currentGroupName = '当前',
  onSyncSettings
}) {
  const [resetOrderConfirmOpen, setResetOrderConfirmOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncSuccessOpen, setSyncSuccessOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setResetOrderConfirmOpen(false);
      setSyncModalOpen(false);
      setSyncSuccessOpen(false);
    }
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

  const pinnedItems = columns.filter((c) => pinnedColumns.includes(c.id));
  const unpinnedItems = columns.filter((c) => !pinnedColumns.includes(c.id));

  const handlePinnedReorder = (newPinnedItems) => {
    const newOrder = [...newPinnedItems.map((item) => item.id), ...unpinnedItems.map((item) => item.id)];
    onColumnReorder?.(newOrder);
  };

  const handleUnpinnedReorder = (newUnpinnedItems) => {
    const newOrder = [...pinnedItems.map((item) => item.id), ...newUnpinnedItems.map((item) => item.id)];
    onColumnReorder?.(newOrder);
  };

  const renderItem = (item) => (
    <Reorder.Item
      key={item.id}
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
        layout: { duration: 0.2 }
      }}
    >
      <div
        className="drag-handle"
        style={{
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          color: 'var(--muted)'
        }}
      >
        <DragIcon width="18" height="18" />
      </div>
      {onTogglePinColumn && (
        <button
          type="button"
          className="icon-button"
          title={pinnedColumns.includes(item.id) ? '取消固定' : '固定在左侧'}
          onClick={(e) => {
            e.stopPropagation();
            const isCurrentlyPinned = pinnedColumns.includes(item.id);
            onTogglePinColumn(item.id);
            if (!isCurrentlyPinned && scrollRef.current) {
              scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          style={{
            border: 'none',
            background: 'transparent',
            padding: '0 8px 0 0',
            color: pinnedColumns.includes(item.id) ? 'var(--primary)' : 'var(--muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <PinIcon width="16" height="16" />
        </button>
      )}
      <div style={{ flex: 1, fontSize: '14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>{item.header}</span>
        {item.id === 'totalChangePercent' && (
          <span className="muted" style={{ fontSize: '12px' }}>
            估值涨幅与持有收益的汇总
          </span>
        )}
        {item.id === 'relatedSector' && (
          <span className="muted" style={{ fontSize: '12px' }}>
            需登录账号
          </span>
        )}
      </div>
      {onToggleColumnVisibility && (
        <button
          type="button"
          className="icon-button pc-table-column-switch"
          title={columnVisibility?.[item.id] === false ? '显示' : '隐藏'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleColumnVisibility(item.id, columnVisibility?.[item.id] === false);
          }}
          style={{
            border: 'none',
            padding: '0 4px',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <span className={`dca-toggle-track ${columnVisibility?.[item.id] !== false ? 'enabled' : ''}`}>
            <span className="dca-toggle-thumb" style={{ left: columnVisibility?.[item.id] !== false ? 16 : 2 }} />
          </span>
        </button>
      )}
    </Reorder.Item>
  );

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <SettingsIcon width="20" height="20" />
                <span>个性化设置</span>
                {onSyncSettings && (
                  <button
                    type="button"
                    onClick={() => setSyncModalOpen(true)}
                    className="button secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 28,
                      padding: '0 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--primary)',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <RefreshIcon width="14" height="14" />
                    同步
                  </button>
                )}
              </div>
              <button
                className="icon-button"
                title="关闭"
                onClick={onClose}
                style={{ border: 'none', background: 'transparent' }}
              >
                <CloseIcon width="20" height="20" />
              </button>
            </div>

            <div className="pc-table-setting-body" ref={scrollRef}>
              {onToggleShowFullFundName && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border)',
                    marginBottom: 16
                  }}
                >
                  <span style={{ fontSize: '14px' }}>展示完整基金名称</span>
                  <button
                    type="button"
                    className="icon-button pc-table-column-switch"
                    title={showFullFundName ? '关闭' : '开启'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleShowFullFundName(!showFullFundName);
                    }}
                    style={{
                      border: 'none',
                      padding: '0 4px',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <span className={`dca-toggle-track ${showFullFundName ? 'enabled' : ''}`}>
                      <span className="dca-toggle-thumb" style={{ left: showFullFundName ? 16 : 2 }} />
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
                  gap: 8
                }}
              >
                <p className="muted" style={{ fontSize: '13px', margin: 0 }}>
                  拖拽调整列顺序
                </p>
                {onResetColumnOrder && (
                  <button
                    className="icon-button"
                    title="重置列顺序"
                    onClick={() => setResetOrderConfirmOpen(true)}
                    style={{
                      border: 'none',
                      width: '28px',
                      height: '28px',
                      backgroundColor: 'transparent',
                      color: 'var(--muted)',
                      flexShrink: 0
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
                <>
                  {pinnedItems.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div className="muted" style={{ fontSize: '12px', marginBottom: 8, paddingLeft: 8 }}>
                        固定在左侧
                      </div>
                      <Reorder.Group
                        axis="y"
                        values={pinnedItems}
                        onReorder={handlePinnedReorder}
                        className="pc-table-setting-list"
                      >
                        <AnimatePresence mode="popLayout">{pinnedItems.map(renderItem)}</AnimatePresence>
                      </Reorder.Group>
                    </div>
                  )}
                  {unpinnedItems.length > 0 && (
                    <div>
                      <div className="muted" style={{ fontSize: '12px', marginBottom: 8, paddingLeft: 8 }}>
                        随表格滚动
                      </div>
                      <Reorder.Group
                        axis="y"
                        values={unpinnedItems}
                        onReorder={handleUnpinnedReorder}
                        className="pc-table-setting-list"
                      >
                        <AnimatePresence mode="popLayout">{unpinnedItems.map(renderItem)}</AnimatePresence>
                      </Reorder.Group>
                    </div>
                  )}
                </>
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
                    gap: 8
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
          title="重置列设置"
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
      {syncModalOpen && (
        <SyncPersonalSettingsModal
          open={syncModalOpen}
          onClose={() => setSyncModalOpen(false)}
          options={syncOptions}
          sourceName={currentGroupName}
          onConfirm={(targetIds) => {
            const result = onSyncSettings?.(targetIds);
            if (result !== false) {
              setSyncModalOpen(false);
              setSyncSuccessOpen(true);
            }
            return result;
          }}
        />
      )}
      {syncSuccessOpen && (
        <SuccessModal
          message="同步成功"
          onClose={() => setSyncSuccessOpen(false)}
          overlayStyle={{ zIndex: 10004 }}
          cardStyle={{ maxWidth: '420px', width: '90vw', zIndex: 10005 }}
        />
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
