'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import ConfirmModal from './ConfirmModal';
import { DragIcon, PlusIcon, SettingsIcon, TrashIcon } from './Icons';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const MAX_GROUP_NAME_LENGTH = 8;
const truncateGroupName = (value) => [...(value || '')].slice(0, MAX_GROUP_NAME_LENGTH).join('');

function GroupManageReorderItem({ item, onRename, onDeleteClick }) {
  const dragControls = useDragControls();
  const isComposingRef = useRef(false);
  const isPreset = Boolean(item.isPreset || item.id === 'fav');

  return (
    <Reorder.Item
      key={item.id}
      value={item}
      className={cn(
        'group-manage-item glass transition-colors duration-200',
        isPreset &&
          'border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent dark:from-primary/15 dark:via-primary/5 dark:to-transparent shadow-[0_2px_12px_rgba(34,211,238,0.06)] dark:shadow-[0_0_15px_rgba(34,211,238,0.08)]'
      )}
      layout
      style={{ touchAction: 'pan-y' }}
      dragListener={false}
      dragControls={dragControls}
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
          touchAction: 'none'
        }}
        onPointerDown={(e) => {
          dragControls.start(e);
        }}
        role="button"
        tabIndex={0}
        aria-label="拖拽排序"
      >
        <DragIcon width="18" height="18" className="muted" />
      </div>
      {isPreset ? (
        <div className="flex flex-1 items-center gap-2.5 px-[14px] h-[36px] select-none">
          <span className="text-[14PX] font-medium text-foreground tracking-wide">{item.name || '自选'}</span>
          <Badge
            variant="outline"
            className="font-medium text-[11PX] px-2 py-0.5 min-h-0 h-5 leading-none shrink-0 shadow-xs pointer-events-none border border-primary/30 bg-primary/15 text-primary backdrop-blur-md transition-colors"
          >
            预置
          </Badge>
        </div>
      ) : (
        <input
          className={`input group-rename-input ${!item.name.trim() ? 'error' : ''}`}
          value={item.name}
          onChange={(e) => onRename(item.id, e.target.value, e.nativeEvent.isComposing || isComposingRef.current)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            onRename(item.id, e.currentTarget.value);
          }}
          onBlur={(e) => {
            if (!isComposingRef.current) onRename(item.id, e.currentTarget.value);
          }}
          placeholder="请输入分组名称..."
          style={{
            flex: 1,
            height: '36px',
            background: 'rgba(0,0,0,0.2)',
            border: !item.name.trim() ? '1px solid var(--danger)' : 'none'
          }}
        />
      )}
      {isPreset ? (
        <div style={{ width: '36px', height: '36px', flexShrink: 0 }} />
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="icon-button danger"
              onClick={() => onDeleteClick(item.id, item.name)}
              style={{ width: '36px', height: '36px', flexShrink: 0 }}
            >
              <TrashIcon width="16" height="16" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>删除分组</p>
          </TooltipContent>
        </Tooltip>
      )}
    </Reorder.Item>
  );
}

export default function GroupManageModal({ groups, onClose, onSave }) {
  const [items, setItems] = useState(groups);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleReorder = (newOrder) => {
    setItems(newOrder);
  };

  const handleRename = (id, newName, isComposing = false) => {
    const nextName = isComposing ? newName || '' : truncateGroupName(newName);
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, name: nextName } : item)));
  };

  const handleDeleteClick = (id, name) => {
    const itemToDelete = items.find((it) => it.id === id);
    if (itemToDelete?.isPreset || id === 'fav') return;
    const isNew = !groups.find((g) => g.id === id);
    const isEmpty = itemToDelete && (!itemToDelete.codes || itemToDelete.codes.length === 0);

    if (isNew || isEmpty) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      setDeleteConfirm({ id, name });
    }
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      setItems((prev) => prev.filter((item) => item.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    }
  };

  const handleAddRow = () => {
    const newGroup = {
      id: `group_${Date.now()}`,
      name: '',
      codes: []
    };
    setItems((prev) => [...prev, newGroup]);
  };

  const handleConfirm = () => {
    const hasEmpty = items.some((it) => !(it.isPreset || it.id === 'fav') && !it.name.trim());
    if (hasEmpty) return;
    onSave(
      items.map((item) =>
        item.isPreset || item.id === 'fav'
          ? { ...item, name: '自选', isPreset: true }
          : { ...item, name: truncateGroupName(item.name).trim() }
      )
    );
    onClose();
  };

  const isAllValid = items.every((it) => it.isPreset || it.id === 'fav' || it.name.trim() !== '');

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          className="glass card modal"
          overlayClassName="modal-overlay"
          style={{ maxWidth: '500px', width: '90vw', zIndex: 99 }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            // 二次确认弹框是单独的 Dialog（portal 到 body）。
            // 当它打开时，在确认弹框内的点击会被外层 Dialog 视作“点到外部”，从而触发外层关闭。
            if (deleteConfirm) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (deleteConfirm) event.preventDefault();
          }}
        >
          <DialogTitle asChild>
            <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SettingsIcon width="20" height="20" />
                <span>管理分组</span>
              </div>
            </div>
          </DialogTitle>

          <div
            className="group-manage-list-container scrollbar-y-styled"
            style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}
          >
            {items.length === 0 ? (
              <div className="empty-state muted" style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: 12, opacity: 0.5 }}>📂</div>
                <p>暂无自定义分组</p>
              </div>
            ) : (
              <Reorder.Group
                axis="y"
                values={items}
                onReorder={handleReorder}
                className="group-manage-list"
                layoutScroll
                style={{ touchAction: 'pan-y' }}
              >
                <AnimatePresence mode="popLayout">
                  {items.map((item) => (
                    <GroupManageReorderItem
                      key={item.id}
                      item={item}
                      onRename={handleRename}
                      onDeleteClick={handleDeleteClick}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>
            )}
            <button
              className="add-group-row-btn"
              onClick={handleAddRow}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '10px',
                borderRadius: '12px',
                border: '1px dashed var(--border)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--muted)',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <PlusIcon width="16" height="16" />
              <span>新增分组</span>
            </button>
          </div>

          <div style={{ marginTop: 24 }}>
            {!isAllValid && (
              <div className="error-text" style={{ marginBottom: 12, textAlign: 'center' }}>
                所有分组名称均不能为空
              </div>
            )}
            <button
              className="button"
              onClick={handleConfirm}
              disabled={!isAllValid}
              style={{ width: '100%', opacity: isAllValid ? 1 : 0.6 }}
            >
              完成
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {deleteConfirm && (
          <div onPointerDown={(e) => e.stopPropagation()}>
            <ConfirmModal
              title="删除确认"
              message={`确定要删除分组 "${deleteConfirm.name}" 吗？分组内的基金数据会被删除。`}
              onConfirm={handleConfirmDelete}
              onCancel={() => setDeleteConfirm(null)}
            />
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
