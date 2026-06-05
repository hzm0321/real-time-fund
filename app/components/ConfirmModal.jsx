'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TrashIcon } from './Icons';

export default function ConfirmModal({
  title,
  message,
  messageContent,
  onConfirm,
  onCancel,
  confirmText = '确定删除',
  icon,
  confirmVariant = 'danger'
}) {
  const handleOpenChange = (open) => {
    if (!open) onCancel();
  };

  const confirmButtonToneClass =
    confirmVariant === 'primary' ? 'button' : confirmVariant === 'secondary' ? 'button secondary' : 'button danger';

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="!z-[12000]"
        showCloseButton={false}
        className="!z-[12010] max-w-[400px] flex flex-col gap-5 p-6"
      >
        <DialogHeader className="flex flex-row items-center gap-3 text-left">
          {icon || <TrashIcon width="20" height="20" className="shrink-0 text-[var(--danger)]" />}
          <DialogTitle className="flex-1 text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>
        {/* asChild + div：避免 Description 默认 <p> 与 messageContent 内块级元素嵌套导致 hydration 报错 */}
        <DialogDescription asChild>
          <div className="text-left text-sm leading-relaxed text-[var(--muted-foreground)]">
            {messageContent || message}
          </div>
        </DialogDescription>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="button secondary min-w-0 flex-1 cursor-pointer h-auto min-h-[48px] py-3 sm:h-11 sm:min-h-0 sm:py-0"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            取消
          </button>
          <button
            type="button"
            className={`${confirmButtonToneClass} min-w-0 flex-1 cursor-pointer h-auto min-h-[48px] py-3 sm:h-11 sm:min-h-0 sm:py-0`}
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
          >
            {confirmText}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
