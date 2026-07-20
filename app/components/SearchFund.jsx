'use client';

import { useMemo, useRef } from 'react';
import { X, Search } from 'lucide-react';

import { Field, FieldContent } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export default function SearchFund({
  value,
  onSearch,
  placeholder = '筛选当前分组基金名称、代码或标签...',
  disabled = false
}) {
  const inputRef = useRef(null);

  const showClear = useMemo(() => {
    if (disabled) return false;
    return String(value ?? '').length > 0;
  }, [value, disabled]);

  return (
    <div className="mt-3 mb-3 w-full sm:max-w-[400px]">
      <Field orientation="horizontal" className="items-stretch gap-2">
        <FieldContent className="relative min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={value ?? ''}
            onChange={(e) => onSearch?.(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`pl-9 ${showClear ? 'pr-9' : ''}`}
            ref={inputRef}
            onBlur={() => {
              // 移动端键盘收起时页面可能回弹，失焦后把输入框滚回可见区域
              const el = inputRef.current;
              if (!el) return;
              // blur 之后通常还会发生一次 viewport resize/scroll 回弹，延迟滚动更可靠
              setTimeout(() => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    try {
                      el.scrollIntoView({
                        block: 'center',
                        inline: 'nearest',
                        behavior: 'smooth'
                      });
                    } catch {}

                    // iOS/部分 WebView 可能忽略 scrollIntoView 的 smooth，这里做一次兜底
                    try {
                      const rect = el.getBoundingClientRect();
                      const targetTop = window.scrollY + rect.top - (window.innerHeight / 2 - rect.height / 2);
                      window.scrollTo({
                        top: Math.max(0, targetTop),
                        behavior: 'smooth'
                      });
                    } catch {}
                  });
                });
              }, 220);
            }}
          />
          {showClear && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label="清空搜索"
                  onMouseDown={(e) => {
                    // 避免点击导致 input 失焦
                    e.preventDefault();
                  }}
                  onClick={() => {
                    onSearch?.('');
                    inputRef.current?.focus();
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>清空</p>
              </TooltipContent>
            </Tooltip>
          )}
        </FieldContent>
      </Field>
    </div>
  );
}
