// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

console.log('[Sentry Debug] SENTRY_DSN:', SENTRY_DSN);
console.log('[Sentry Debug] Sentry module:', typeof Sentry);

if (SENTRY_DSN) {
  console.log('[Sentry Debug] Initializing Sentry with DSN...');
  Sentry.init({
    dsn: SENTRY_DSN,
    debug: true, // 启用调试日志
    // Add optional integrations for additional features
    integrations: [Sentry.replayIntegration(), Sentry.browserTracingIntegration({ instrumentNavigation: false })],

    ignoreErrors: [
      // Generic error thrown by browsers when a network request is blocked (e.g. by an ad blocker)
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'TypeError: Failed to fetch',
      'TypeError: NetworkError when attempting to fetch resource.'
    ],

    denyUrls: [
      // Google Analytics
      /google-analytics\.com/i,
      /www\.google-analytics\.com/i,
      /googletagmanager\.com/i
    ],

    beforeSend(event, hint) {
      const error = hint.originalException;
      const errorMessage = error?.message || '';
      const isFetchError = errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError');

      if (isFetchError) {
        // 检查是否与 Google Analytics 相关
        const isGA =
          event.request?.url?.includes('google-analytics.com') || event.request?.url?.includes('googletagmanager.com');

        // 检查面包屑中是否有 GA 相关的失败 fetch
        const hasGAInBreadcrumbs = event.breadcrumbs?.some(
          (b) =>
            b.category === 'fetch' &&
            (b.data?.url?.includes('google-analytics.com') || b.data?.url?.includes('googletagmanager.com')) &&
            b.data?.status_code === 0 // 0 通常表示网络错误或被拦截
        );

        if (isGA || hasGAInBreadcrumbs) {
          return null;
        }
      }
      // 不上报火狐阅读模式相关的错误
      if (error && error.message && error.message.includes('window.__firefox__.reader')) {
        return null; // 丢弃这个报错，不上报
      }
      return event;
    },

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    // Enable sending user PII (Personally Identifiable Information)
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: true
  });
  console.log('[Sentry Debug] Sentry initialized successfully');
} else {
  console.log('[Sentry Debug] No SENTRY_DSN provided, Sentry not initialized');
}

export const onRouterTransitionStart = SENTRY_DSN ? Sentry.captureRouterTransitionStart : () => {};
