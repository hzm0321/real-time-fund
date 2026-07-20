'use client';

import * as React from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangleIcon, RotateCcwIcon } from 'lucide-react';
import { isError, isFunction, isString } from 'lodash';
import { toast as sonnerToast } from 'sonner';

import { useModalStore } from '../stores';

function getErrorMessage(error) {
  let msg = '未知运行错误';
  if (isError(error) && error.message) msg = error.message;
  else if (isString(error) && error.trim()) msg = error;
  else if (isString(error?.message) && error.message.trim()) msg = error.message;
  else if (isString(error?.reason) && error.reason.trim()) msg = error.reason;
  else if (isString(error?.type) && error.type.trim()) msg = error.type;

  if (
    msg.includes('Failed to load chunk') ||
    msg.includes('Loading chunk') ||
    (error && (error.name === 'ChunkLoadError' || error.type === 'ChunkLoadError'))
  ) {
    return `${msg}\n\n提示：检测到静态资源加载失败，可能是系统发布了新版本，请刷新浏览器页面以解决该问题。`;
  }
  return msg;
}

export function shouldSilenceClientError(error) {
  return getErrorMessage(error).includes('Error attempting to read image');
}

export function notifyClientError(error, options = {}) {
  const title = options.title || '页面出现异常';
  const message = getErrorMessage(error);
  const silent = options.silent || shouldSilenceClientError(error);

  try {
    Sentry.captureException(error);
  } catch {}

  if (silent) return;

  try {
    if (options.closeModals) {
      useModalStore.getState().closeAllModals?.();
    }
  } catch {}

  const desc = message.includes('\n') ? (
    <span style={{ whiteSpace: 'pre-line', display: 'block', marginTop: '4px' }}>{message}</span>
  ) : (
    message
  );

  sonnerToast.error(title, {
    id: options.toastId || 'client-runtime-error',
    description: desc,
    duration: 8000
  });
}

class ClientErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    notifyClientError(error, {
      title: this.props.toastTitle,
      toastId: this.props.toastId,
      closeModals: this.props.closeModals
    });

    if (isFunction(this.props.onError)) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ error: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    if (isFunction(this.props.onReset)) this.props.onReset();
  };

  renderFallback() {
    const { fallback } = this.props;

    if (fallback === null) return null;

    if (isFunction(fallback)) {
      return fallback({ error: this.state.error, reset: this.handleReset });
    }

    if (fallback) return fallback;

    return (
      <div className="min-h-screen bg-[var(--bg)] px-4 py-10 text-[var(--foreground)]">
        <div className="glass mx-auto flex max-w-md flex-col gap-4 rounded-[16px] border border-[var(--border)] p-6 text-left">
          <div className="flex items-center gap-3">
            <AlertTriangleIcon className="h-5 w-5 text-destructive" />
            <h1 className="m-0 text-lg font-semibold">页面遇到异常</h1>
          </div>
          <p className="m-0 text-sm leading-relaxed text-[var(--muted-foreground)]" style={{ whiteSpace: 'pre-line' }}>
            {getErrorMessage(this.state.error)}
          </p>
          <button
            type="button"
            className="button primary flex h-11 items-center gap-2 rounded-xl px-4"
            onClick={this.handleReset}
          >
            <RotateCcwIcon className="h-4 w-4" />
            <span>重新尝试</span>
          </button>
        </div>
      </div>
    );
  }

  render() {
    if (this.state.error) return this.renderFallback();
    return this.props.children;
  }
}

export default function ClientErrorBoundary(props) {
  return <ClientErrorBoundaryInner {...props} />;
}
