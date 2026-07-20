'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { toast as sonnerToast } from 'sonner';
import { AlertTriangleIcon } from 'lucide-react';
import { isString } from 'lodash';

import { Toaster } from '@/components/ui/sonner';
import { shouldSilenceClientError } from './components/ClientErrorBoundary';

function getErrorMessage(error) {
  if (isString(error?.message) && error.message.trim()) return error.message;
  if (isString(error) && error.trim()) return error;
  return '未知运行错误';
}

export default function GlobalError({ error }) {
  useEffect(() => {
    Sentry.captureException(error);
    if (shouldSilenceClientError(error)) return;
    sonnerToast.error('页面出现异常', {
      description: getErrorMessage(error),
      duration: 8000
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="min-h-screen bg-[var(--bg,#0f172a)] px-4 py-10 text-[var(--foreground,#f8fafc)]">
          <div className="mx-auto flex max-w-md flex-col gap-4 rounded-[16px] border border-[var(--border,rgba(148,163,184,.25))] bg-[var(--card,rgba(15,23,42,.88))] p-6 text-left shadow-lg">
            <div className="flex items-center gap-3">
              <AlertTriangleIcon className="h-5 w-5 text-destructive" />
              <h1 className="m-0 text-lg font-semibold">页面遇到异常</h1>
            </div>
            <p className="m-0 text-sm leading-relaxed text-[var(--muted-foreground,#cbd5e1)]">
              {getErrorMessage(error)}
            </p>
            <button
              type="button"
              className="button primary h-11 rounded-xl px-4"
              onClick={() => window.location.reload()}
            >
              刷新页面
            </button>
          </div>
        </main>
        <Toaster />
      </body>
    </html>
  );
}
