'use client';

import { useEffect } from 'react';

import { notifyClientError } from './ClientErrorBoundary';

export default function GlobalClientErrorHandler() {
  useEffect(() => {
    const handleError = (event) => {
      const errorMsg = event.error?.message || event.message || '';
      if (
        typeof errorMsg === 'string' &&
        (errorMsg.includes('ResizeObserver loop completed with undelivered notifications') ||
          errorMsg.includes('ResizeObserver loop limit exceeded') ||
          errorMsg === 'Script error.' ||
          errorMsg === 'Script error')
      ) {
        // 忽略良性的 ResizeObserver 警告，以及因跨域限制隐藏详细信息的 Script error
        return;
      }

      notifyClientError(event.error || event.message || event, {
        title: '页面运行异常',
        toastId: 'window-runtime-error',
        closeModals: true
      });
    };

    const handleUnhandledRejection = (event) => {
      notifyClientError(event.reason || event, {
        title: '异步任务异常',
        toastId: 'window-promise-error',
        closeModals: true
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
