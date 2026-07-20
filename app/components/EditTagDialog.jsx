'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TAG_THEME_OPTIONS } from '@/app/constants';

const TAG_THEME_KEY_SET = new Set(TAG_THEME_OPTIONS.map((o) => o.key));

const MAX_TAG_NAME_LEN = 10;
const MAX_BATCH_TAGS = 30;

/** 按英文分号 ; 或中文分号 ； 拆分，去空，允许同名多段，单段超长截断至 MAX_TAG_NAME_LEN */
export function parseTagNamesInput(raw) {
  const s = String(raw ?? '');
  const parts = s.split(/[;；]+/);
  const out = [];
  for (const part of parts) {
    const name = part.trim().slice(0, MAX_TAG_NAME_LEN);
    if (!name) continue;
    out.push(name);
    if (out.length >= MAX_BATCH_TAGS) break;
  }
  return out;
}

/**
 * @param {string} [rawTheme]
 * @returns {{ variant: 'default' | 'outline', className: string }}
 */
export function getTagThemeBadgeProps(rawTheme) {
  const keyRaw = String(rawTheme ?? '').trim();
  const key = TAG_THEME_KEY_SET.has(keyRaw) ? keyRaw : 'default';
  const opt = TAG_THEME_OPTIONS.find((o) => o.key === key) ?? TAG_THEME_OPTIONS[0];
  const isDefault = key === 'default';
  return {
    variant: isDefault ? 'outline' : 'default',
    className: opt.badgeClassName || ''
  };
}

export default function EditTagDialog({ open, onOpenChange, onEdit, initialName = '', initialTheme = 'default' }) {
  const nameId = useId();
  const themeId = useId();
  const [name, setName] = useState(initialName);
  const [themeKey, setThemeKey] = useState(initialTheme);
  /** 防止连点导致 onEdit 执行两次 */
  const submitGuardRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setThemeKey(initialTheme);
    submitGuardRef.current = false;
  }, [open, initialName, initialTheme]);

  const selectedTheme = useMemo(() => {
    return TAG_THEME_OPTIONS.find((x) => x.key === themeKey) ?? TAG_THEME_OPTIONS[0];
  }, [themeKey]);

  const parsedName = name.trim().slice(0, MAX_TAG_NAME_LEN);
  const canSubmit = parsedName.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal trade-modal"
        overlayClassName="modal-overlay"
        style={{ maxWidth: '420px', zIndex: 999, width: '90vw' }}
      >
        <DialogTitle className="sr-only">编辑标签</DialogTitle>

        <div className="title" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag width="20" height="20" />
            <span>编辑标签</span>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium text-[var(--muted-foreground)]">预览</div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="flex flex-wrap gap-2">
                {!parsedName ? (
                  <Badge
                    variant={selectedTheme.badgeVariant}
                    className={cn('font-normal text-[13px]', selectedTheme.badgeClassName)}
                  >
                    示例
                  </Badge>
                ) : (
                  <Badge
                    variant={selectedTheme.badgeVariant}
                    className={cn('font-normal text-[13px]', selectedTheme.badgeClassName)}
                  >
                    {parsedName}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-sm font-medium text-[var(--muted-foreground)]">
              标签名称
            </label>
            <textarea
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入标签名称"
              rows={1}
              maxLength={MAX_TAG_NAME_LEN}
              autoComplete="off"
              className={cn(
                'w-full min-w-0 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
                'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
              )}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              名称最多 {MAX_TAG_NAME_LEN} 个字，超出部分会自动截断。
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div id={themeId} className="text-sm font-medium text-[var(--muted-foreground)]">
              标签主题
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={themeId}>
              {TAG_THEME_OPTIONS.map((opt) => {
                const active = opt.key === themeKey;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className="inline-flex"
                    onClick={() => setThemeKey(opt.key)}
                    aria-checked={active}
                    role="radio"
                  >
                    <Badge
                      variant={opt.badgeVariant}
                      className={cn(
                        'cursor-pointer font-normal text-[13px] transition-[opacity,box-shadow] duration-200',
                        opt.badgeClassName,
                        active
                          ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                          : 'opacity-85 hover:opacity-100'
                      )}
                    >
                      {opt.label}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 12, marginTop: 34 }}>
          <button
            type="button"
            className="button secondary trade-cancel-btn"
            onClick={() => onOpenChange(false)}
            style={{ flex: 1 }}
          >
            取消
          </button>
          <button
            type="button"
            className="button inline-flex items-center justify-center gap-1.5"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit || submitGuardRef.current) return;
              submitGuardRef.current = true;
              onEdit?.({
                name: parsedName,
                theme: themeKey
              });
              onOpenChange(false);
            }}
            style={{ flex: 1, opacity: !canSubmit ? 0.6 : 1 }}
          >
            保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
