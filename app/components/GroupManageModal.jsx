'use client';

import { useState } from 'react';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import ConfirmModal from './ConfirmModal';
import { CloseIcon, DragIcon, PlusIcon, SettingsIcon, TrashIcon } from './Icons';

export default function GroupManageModal({ groups, onClose, onSave }) {
  const [items, setItems] = useState(groups);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }

  const handleReorder = (newOrder) => {
    setItems(newOrder);
  };

  const handleRename = (id, newName) => {
    const truncatedName = (newName || '').slice(0, 8);
    setItems(prev => prev.map(item => item.id === id ? { ...item, name: truncatedName } : item));
  };

  const handleDeleteClick = (id, name) => {
    const itemToDelete = items.find(it => it.id === id);
    const isNew = !groups.find(g => g.id === id);
    const isEmpty = itemToDelete && (!itemToDelete.codes || itemToDelete.codes.length === 0);

    if (isNew || isEmpty) {
      setItems(prev => prev.filter(item => item.id !== id));
    } else {
      setDeleteConfirm({ id, name });
    }
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      setItems(prev => prev.filter(item => item.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    }
  };

  const handleAddRow = () => {
    const newGroup = {
      id: `group_${Date.now()}`,
      name: '',
      codes: []
    };
    setItems(prev => [...prev, newGroup]);
  };

  const handleConfirm = () => {
    const hasEmpty = items.some(it => !it.name.trim());
    if (hasEmpty) return;
    onSave(items);
    onClose();
  };

  const isAllValid = items.every(it => it.name.trim() !== '');

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="管理分组"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ maxWidth: '500px', width: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>管理分组</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div className="group-manage-list-container" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
          {items.length === 0 ? (
            <div className="empty-state muted" style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: '32px', marginBottom: 12, opacity: 0.5 }}>📂</div>
              <p>暂无自定义分组</p>
            </div>
          ) : (
            <Reorder.Group axis="y" values={items} onReorder={handleReorder} className="group-manage-list">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <Reorder.Item
                    key={item.id}
                    value={item}
                    className="group-manage-item glass"
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
                    <div className="drag-handle" style={{ cursor: 'grab', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                      <DragIcon width="18" height="18" className="muted" />
                    </div>
                    <input
                      className={`input group-rename-input ${!item.name.trim() ? 'error' : ''}`}
                      value={item.name}
                      onChange={(e) => handleRename(item.id, e.target.value)}
                      placeholder="请输入分组名称..."
                      style={{
                        flex: 1,
                        height: '36px',
                        background: 'rgba(0,0,0,0.2)',
                        border: !item.name.trim() ? '1px solid var(--danger)' : 'none'
                      }}
                    />
                    <button
                      className="icon-button danger"
                      onClick={() => handleDeleteClick(item.id, item.name)}
                      title="删除分组"
                      style={{ width: '36px', height: '36px', flexShrink: 0 }}
                    >
                      <TrashIcon width="16" height="16" />
                    </button>
                  </Reorder.Item>
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
      </motion.div>

      <AnimatePresence>
        {deleteConfirm && (
          <ConfirmModal
            title="删除确认"
            message={`确定要删除分组 "${deleteConfirm.name}" 吗？分组内的基金不会被删除。`}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
