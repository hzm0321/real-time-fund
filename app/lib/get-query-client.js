import { QueryClient } from '@tanstack/react-query';

const defaultOptions = {
  queries: {
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false
  }
};

function createQueryClient() {
  return new QueryClient({ defaultOptions });
}

let browserQueryClient;

/**
 * 与 {@link QueryClientProviderWrapper} 共用同一浏览器端实例，便于在 fund API 等模块里使用 fetchQuery 做去重与缓存。
 */
export function getQueryClient() {
  if (typeof window === 'undefined') {
    return createQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = createQueryClient();
    /** 供 Chrome 扩展等内容脚本读取，与 React 树共用同一缓存 */
    try {
      window.__TANSTACK_QUERY_CLIENT__ = browserQueryClient;
    } catch {
      // 忽略极端环境（如不可写 window）
    }
  }
  return browserQueryClient;
}
