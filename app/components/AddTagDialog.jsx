'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export const TAG_THEME_OPTIONS = [
  {
    key: 'default',
    label: '默认',
    badgeVariant: 'outline',
    badgeClassName: '',
  },
  {
    key: 'blue',
    label: '蓝色',
    badgeVariant: 'default',
    badgeClassName:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  {
    key: 'green',
    label: '绿色',
    badgeVariant: 'default',
    badgeClassName:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
  },
  {
    key: 'sky',
    label: '天空蓝',
    badgeVariant: 'default',
    badgeClassName:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  {
    key: 'purple',
    label: '紫色',
    badgeVariant: 'default',
    badgeClassName:
      'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300',
  },
  {
    key: 'red',
    label: '红色',
    badgeVariant: 'default',
    badgeClassName:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  },
  {
    key: 'orange',
    label: '橙色',
    badgeVariant: 'default',
    badgeClassName:
      'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
  },
  {
    key: 'amber',
    label: '琥珀色',
    badgeVariant: 'default',
    badgeClassName:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  {
    key: 'lime',
    label: '柠檬绿',
    badgeVariant: 'default',
    badgeClassName:
      'border-lime-200 bg-lime-50 text-lime-800 dark:border-lime-800 dark:bg-lime-950 dark:text-lime-300',
  },
  {
    key: 'teal',
    label: '水鸭色',
    badgeVariant: 'default',
    badgeClassName:
      'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300',
  },
  {
    key: 'cyan',
    label: '青色',
    badgeVariant: 'default',
    badgeClassName:
      'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  },
  {
    key: 'indigo',
    label: '靛蓝色',
    badgeVariant: 'default',
    badgeClassName:
      'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  },
  {
    key: 'violet',
    label: '罗兰紫',
    badgeVariant: 'default',
    badgeClassName:
      'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
  {
    key: 'pink',
    label: '粉红色',
    badgeVariant: 'default',
    badgeClassName:
      'border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300',
  },
  {
    key: 'rose',
    label: '玫瑰色',
    badgeVariant: 'default',
    badgeClassName:
      'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
];

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
 * 与 FundTagsEditDialog 一致的 Badge variant 与主题色 class（表格标签列等复用）
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
    className: opt.badgeClassName || '',
  };
}

export default function AddTagDialog({ open, onOpenChange, onAdd }) {
  const nameId = useId();
  const themeId = useId();
  const [name, setName] = useState('');
  const [themeKey, setThemeKey] = useState('default');
  /** 防止连点「添加」导致 onAdd 执行两次、产生重复标签 */
  const submitGuardRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setThemeKey('default');
    submitGuardRef.current = false;
  }, [open]);

  const selectedTheme = useMemo(() => {
    return TAG_THEME_OPTIONS.find((x) => x.key === themeKey) ?? TAG_THEME_OPTIONS[0];
  }, [themeKey]);

  const parsedNames = useMemo(() => parseTagNamesInput(name), [name]);
  const canSubmit = parsedNames.length > 0;

  const previewNames = useMemo(() => {
    if (parsedNames.length <= 12) return { items: parsedNames, rest: 0 };
    return { items: parsedNames.slice(0, 12), rest: parsedNames.length - 12 };
  }, [parsedNames]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal trade-modal"
        overlayClassName="modal-overlay"
        style={{ maxWidth: '420px', zIndex: 999, width: '90vw' }}
      >
        <DialogTitle className="sr-only">添加标签</DialogTitle>

        <div className="title" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag width="20" height="20" />
            <span>添加标签</span>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium text-[var(--muted-foreground)]">预览</div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="flex flex-wrap gap-2">
                {parsedNames.length === 0 ? (
                  <Badge
                    variant={selectedTheme.badgeVariant}
                    className={cn('font-normal text-[13px]', selectedTheme.badgeClassName)}
                  >
                    示例
                  </Badge>
                ) : (
                  <>
                    {previewNames.items.map((n) => (
                      <Badge
                        key={n}
                        variant={selectedTheme.badgeVariant}
                        className={cn('font-normal text-[13px]', selectedTheme.badgeClassName)}
                      >
                        {n}
                      </Badge>
                    ))}
                    {previewNames.rest > 0 ? (
                      <span className="text-muted-foreground self-center text-xs">+{previewNames.rest} 个</span>
                    ) : null}
                  </>
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
              placeholder="可输入一个或多个，用 ; 或 ； 分隔"
              rows={3}
              maxLength={2000}
              autoComplete="off"
              className={cn(
                'min-h-[72px] w-full min-w-0 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
                'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              )}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              支持批量：多个标签请用英文分号 <span className="font-mono text-foreground">;</span> 或中文分号{' '}
              <span className="font-mono text-foreground">；</span> 分隔，将按当前所选主题统一添加。每个名称最多{' '}
              {MAX_TAG_NAME_LEN} 个字，超出部分会自动截断；单次最多添加 {MAX_BATCH_TAGS} 个。
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
                          : 'opacity-85 hover:opacity-100',
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
          <button type="button" className="button secondary trade-cancel-btn" onClick={() => onOpenChange(false)} style={{ flex: 1 }}>
            取消
          </button>
          <button
            type="button"
            className="button inline-flex items-center justify-center gap-1.5"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit || submitGuardRef.current) return;
              submitGuardRef.current = true;
              onAdd?.({
                names: parsedNames,
                theme: themeKey,
              });
              onOpenChange(false);
            }}
            style={{ flex: 1, opacity: !canSubmit ? 0.6 : 1 }}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            添加{parsedNames.length > 1 ? `（${parsedNames.length}）` : ''}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
