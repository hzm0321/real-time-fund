'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldContent } from '@/components/ui/field';
import { PlusIcon, CloseIcon } from './Icons';
import { cn } from '@/lib/utils';

export default function GroupModal({ onClose, onConfirm }) {
  const [name, setName] = useState('');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent
        overlayClassName="modal-overlay z-[9999]"
        className={cn('!p-0 z-[10000] max-w-[280px] sm:max-w-[280px]')}
      >
        <div className="glass card modal !max-w-[280px] !w-full">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <PlusIcon className="w-5 h-5 shrink-0 text-[var(--foreground)]" aria-hidden />
              <DialogTitle asChild>
                <span className="text-base font-semibold text-[var(--foreground)]">新增分组</span>
              </DialogTitle>
            </div>
          </div>

          <Field className="mb-5">
            <FieldLabel htmlFor="group-modal-name" className="text-sm text-[var(--muted-foreground)] mb-2 block">
              分组名称（最多 8 个字）
            </FieldLabel>
            <FieldContent>
              <input
                id="group-modal-name"
                className={cn(
                  'flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3.5 py-2 text-base text-[var(--foreground)] outline-none',
                  'placeholder:text-[var(--muted-foreground)]',
                  'transition-colors duration-200 focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 focus:ring-offset-2 focus:ring-offset-[var(--card)]',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
                autoFocus
                placeholder="请输入分组名称..."
                value={name}
                onChange={(e) => {
                  const v = e.target.value || '';
                  setName(v.slice(0, 8));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) onConfirm(name.trim());
                }}
              />
            </FieldContent>
          </Field>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1 h-11 rounded-xl cursor-pointer bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--secondary)]/80 border border-[var(--border)]"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl cursor-pointer"
              onClick={() => name.trim() && onConfirm(name.trim())}
              disabled={!name.trim()}
            >
              确定
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
