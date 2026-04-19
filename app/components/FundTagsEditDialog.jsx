'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Tag, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import ConfirmModal from './ConfirmModal';
import { CloseIcon } from './Icons';
import { cn } from '@/lib/utils';
import AddTagDialog, { TAG_THEME_OPTIONS } from './AddTagDialog';

const DEFAULT_TAG_THEME = 'default';
const ALLOWED_THEMES = new Set(TAG_THEME_OPTIONS.map((x) => x.key));

function normalizeTagDraft(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const usedIds = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name ?? '').trim();
    if (!name || name.length > 24) continue;
    let id = String(item.id ?? '').trim();
    if (!id || usedIds.has(id)) id = uuidv4();
    usedIds.add(id);
    const theme = String(item.theme ?? DEFAULT_TAG_THEME).trim();
    const normalizedTheme = ALLOWED_THEMES.has(theme) ? theme : DEFAULT_TAG_THEME;
    out.push({ id, name, theme: normalizedTheme });
    if (out.length >= 30) break;
  }
  return out;
}

/**
 * 编辑基金标签：PC 使用 Dialog，移动端使用底部 Drawer。
 * @param {Object} props
 * @param {{ name: string, theme: string }[]} [props.recommendedTagItems]
 * @param {(payload: { theme: string, name?: string, names?: string[] }) => void} [props.onAddPoolTag]
 * @param {(name: string) => void} [props.onDeleteGlobalTag]
 * @param {(name: string) => string[]} [props.getTagUsageLabels]
 */
export default function FundTagsEditDialog({
  open,
  onOpenChange,
  isMobile = false,
  fundCode,
  fundName = '',
  tags = [],
  onSave,
  recommendedTagItems = [],
  onAddPoolTag,
  onDeleteGlobalTag,
  getTagUsageLabels,
}) {
  const [draft, setDraft] = useState(() => normalizeTagDraft(tags));
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  /** 'fund'：加到当前基金已选；'pool'：仅写入全局可选池 */
  const [addDialogPurpose, setAddDialogPurpose] = useState('fund');
  const [optionalEditMode, setOptionalEditMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const themeClassByKey = useMemo(() => {
    const map = new Map();
    for (const opt of TAG_THEME_OPTIONS) {
      map.set(opt.key, opt.badgeClassName || '');
    }
    return map;
  }, []);

  /** 禁止在 setState updater 内同步调用 onSave（会触发父组件 setState，违反 React 规则） */
  const persistDraft = useCallback(
    (next) => {
      if (!fundCode) return;
      const code = fundCode;
      const save = onSave;
      queueMicrotask(() => {
        save?.(code, next);
      });
    },
    [fundCode, onSave],
  );

  const addTagsToFund = useCallback(
    (rawNames, theme = DEFAULT_TAG_THEME) => {
      const normalizedTheme = ALLOWED_THEMES.has(theme) ? theme : DEFAULT_TAG_THEME;
      setDraft((prev) => {
        let next = [...prev];
        for (const raw of rawNames) {
          const name = String(raw ?? '').trim();
          if (!name || name.length > 24) continue;
          if (next.length >= 30) break;
          next.push({ id: uuidv4(), name, theme: normalizedTheme });
        }
        if (next.length === prev.length) return prev;
        persistDraft(next);
        return next;
      });
    },
    [persistDraft],
  );

  const addTagToFund = useCallback(
    (rawName, theme = DEFAULT_TAG_THEME) => {
      addTagsToFund([rawName], theme);
    },
    [addTagsToFund],
  );

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeTagDraft(tags));
    setOptionalEditMode(false);
    setDeleteConfirm(null);
    setAddDialogPurpose('fund');
  // 仅在打开或切换基金时从 props 同步；不把 tags 列入依赖，避免父级刷新覆盖未提交的编辑
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fundCode]);

  const removeTagFromFund = useCallback(
    (instanceId) => {
      const id = String(instanceId ?? '').trim();
      if (!id) return;
      setDraft((prev) => {
        const next = prev.filter((x) => x.id !== id);
        persistDraft(next);
        return next;
      });
    },
    [persistDraft],
  );

  const addBadgeClassName = useMemo(() => {
    return cn(
      'cursor-pointer font-normal text-[13px]',
      'border-dashed text-muted-foreground hover:text-foreground',
    );
  }, []);

  const openAddFundDialog = () => {
    setAddDialogPurpose('fund');
    setAddDialogOpen(true);
  };

  const openAddPoolDialog = () => {
    setAddDialogPurpose('pool');
    setAddDialogOpen(true);
  };

  const handleAddDialogAdd = useCallback(
    (payload) => {
      const theme = payload?.theme ?? DEFAULT_TAG_THEME;
      const names =
        Array.isArray(payload?.names) && payload.names.length
          ? payload.names
          : payload?.name != null
            ? [String(payload.name).trim()].filter(Boolean)
            : [];
      if (!names.length) return;
      if (addDialogPurpose === 'pool') {
        onAddPoolTag?.({ names, theme });
        return;
      }
      addTagsToFund(names, theme);
    },
    [addDialogPurpose, onAddPoolTag, addTagsToFund],
  );

  const removeTagFromFundIfHas = useCallback(
    (tagName) => {
      const nm = String(tagName ?? '').trim();
      setDraft((prev) => {
        if (!prev.some((x) => x.name === nm)) return prev;
        const next = prev.filter((x) => x.name !== nm);
        persistDraft(next);
        return next;
      });
    },
    [persistDraft],
  );

  const requestDeleteOptionalTag = useCallback(
    (name) => {
      const labels = getTagUsageLabels?.(name) ?? [];
      if (labels.length === 0) {
        onDeleteGlobalTag?.(name);
        removeTagFromFundIfHas(name);
        return;
      }
      setDeleteConfirm({ name, labels });
    },
    [getTagUsageLabels, onDeleteGlobalTag, removeTagFromFundIfHas],
  );

  const confirmDeleteOptionalTag = useCallback(() => {
    if (!deleteConfirm?.name) return;
    onDeleteGlobalTag?.(deleteConfirm.name);
    removeTagFromFundIfHas(deleteConfirm.name);
    setDeleteConfirm(null);
  }, [deleteConfirm, onDeleteGlobalTag, removeTagFromFundIfHas]);

  const body = (
    <div className="flex min-w-0 flex-col gap-4">
      {fundName ? (
        <div>
          <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>
            {fundName}
          </div>
          {fundCode ? (
            <div className="muted" style={{ fontSize: '12px' }}>
              #{fundCode}
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="flex flex-wrap gap-2">
          {draft.length === 0 ? (
            <span className="text-muted-foreground text-sm">暂无标签，可在下方添加</span>
          ) : (
            draft.map(({ id, name, theme }) => {
              const themeClass = themeClassByKey.get(theme) || '';
              const isDefault = theme === DEFAULT_TAG_THEME;
              return (
                <button
                  key={id}
                  type="button"
                  className="inline-flex"
                  disabled={optionalEditMode}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeTagFromFund(id);
                  }}
                >
                  <Badge
                    className={cn('cursor-pointer font-normal text-[13px]', themeClass)}
                    variant={isDefault ? 'outline' : 'default'}
                  >
                    {name}
                    {!optionalEditMode && (
                      <X
                        data-icon="inline-end"
                        className="h-3 w-3 shrink-0"
                      />  
                    )}
                  </Badge>
                </button>
              );
            })
          )}

          {!optionalEditMode && (
            <button
              type="button"
              className="inline-flex"
              disabled={draft.length >= 30}
              onClick={openAddFundDialog}
            >
              <Badge
                variant="outline"
                className={cn(addBadgeClassName, draft.length >= 30 && 'pointer-events-none opacity-45')}
              >
                <Plus className="h-3 w-3" />
                添加标签
              </Badge>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="pc-table-setting-subtitle !mb-0">可选标签</h3>
          <button
            type="button"
            className="text-primary hover:text-primary/90 shrink-0 cursor-pointer text-sm font-medium underline-offset-4 hover:underline"
            onClick={() => setOptionalEditMode((v) => !v)}
          >
            {optionalEditMode ? '完成' : '编辑'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(recommendedTagItems || []).map((item) => {
            const label = String(item?.name ?? '').trim();
            if (!label) return null;
            const itemTheme = ALLOWED_THEMES.has(String(item.theme ?? '').trim())
              ? String(item.theme).trim()
              : DEFAULT_TAG_THEME;
            const themeClass = themeClassByKey.get(itemTheme) || '';
            const isDefault = itemTheme === DEFAULT_TAG_THEME;
            const disabledPick = draft.length >= 30;

            if (optionalEditMode) {
              return (
                <button
                  key={label}
                  type="button"
                  className="inline-flex"
                  title="删除标签"
                  aria-label={`删除标签 ${label}`}
                  onClick={() => requestDeleteOptionalTag(label)}
                >
                  <Badge
                    className={cn('cursor-pointer font-normal text-[13px]', themeClass)}
                    variant={isDefault ? 'outline' : 'default'}
                  >
                    {label}
                    <X
                      data-icon="inline-end"
                      className="h-3 w-3 shrink-0"
                    />
                  </Badge>
                </button>
              );
            }

            return (
              <button
                key={label}
                type="button"
                className="inline-flex"
                disabled={disabledPick}
                onClick={() => addTagToFund(label, itemTheme)}
              >
                <Badge
                  className={cn(
                    'cursor-pointer font-normal text-[13px]',
                    themeClass,
                    disabledPick && 'pointer-events-none opacity-45',
                  )}
                  variant={isDefault ? 'outline' : 'default'}
                >
                  {label}
                </Badge>
              </button>
            );
          })}

          {optionalEditMode && (
            <button type="button" className="inline-flex" onClick={openAddPoolDialog}>
              <Badge variant="outline" className={cn('font-normal text-[13px]', addBadgeClassName)}>
                <Plus className="h-3 w-3" />
                添加标签
              </Badge>
            </button>
          )}
        </div>
      </div>

      <AddTagDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddDialogAdd}
      />
    </div>
  );

  const deleteConfirmModal = deleteConfirm ? (
    <ConfirmModal
      title="删除标签"
      confirmText="确定删除"
      confirmVariant="danger"
      onCancel={() => setDeleteConfirm(null)}
      onConfirm={confirmDeleteOptionalTag}
      messageContent={
        <div className="flex flex-col gap-3">
          <p>
            标签「<span className="font-medium text-foreground">{deleteConfirm.name}</span>
            」已用于以下基金，删除后这些基金将不再显示该标签。确定删除？
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {deleteConfirm.labels.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      }
    />
  ) : null;

  if (isMobile) {
    return (
      <>
        <Drawer
          open={open}
          onOpenChange={onOpenChange}
          direction="bottom"
        >
          <DrawerContent
            className="glass max-h-[90vh]"
            defaultHeight="77vh"
            minHeight="36vh"
            maxHeight="90vh"
          >
            <DrawerHeader className="flex flex-row items-center justify-between gap-2 border-b border-[var(--border)] py-4 text-left">
              <DrawerTitle className="text-base font-semibold">编辑标签</DrawerTitle>
              <DrawerClose className="icon-button border-none bg-transparent p-1" title="关闭">
                <CloseIcon width="20" height="20" />
              </DrawerClose>
            </DrawerHeader>
            <div className="scrollbar-y-styled flex-1 overflow-y-auto px-4 pb-6 pt-2">
              {body}
            </div>
          </DrawerContent>
        </Drawer>
        {deleteConfirmModal}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="glass card modal trade-modal flex max-h-[min(85vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[420px]"
          overlayClassName="modal-overlay"
          style={{ maxWidth: '420px', width: '90vw', zIndex: 99 }}
        >
          <DialogTitle className="sr-only">编辑标签</DialogTitle>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="title shrink-0 border-b border-[var(--border)] px-4 py-3" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Tag width={20} height={20} aria-hidden className="shrink-0 text-[var(--foreground)]" />
                <span className="text-[var(--foreground)]">编辑标签</span>
              </div>
              <button
                type="button"
                className="icon-button shrink-0"
                title="关闭"
                aria-label="关闭"
                onClick={() => onOpenChange(false)}
                style={{ border: 'none', background: 'transparent' }}
              >
                <CloseIcon width={20} height={20} />
              </button>
            </div>
            <div className="scrollbar-y-styled min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
          </div>
        </DialogContent>
      </Dialog>
      {deleteConfirmModal}
    </>
  );
}
