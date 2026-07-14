export async function asyncPool(concurrency, iterable, iteratorFn) {
  const ret = [];
  const executing = new Set();
  for (const item of iterable) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

/**
 * 通用异步重试工具
 * @param {Function} fn - 返回 Promise 的异步函数
 * @param {number} [retries=3] - 重试次数
 * @param {number} [delay=1000] - 初始延迟（毫秒）
 * @returns {Promise<any>}
 */
export async function withRetry(fn, retries = 3, delay = 1000) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // 只有在还有重试机会时才等待
      if (i < retries) {
        const backoff = delay * 2 ** i;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
  throw lastError;
}

/**
 * 智能重试工具：对不可恢复的错误（4xx，除 429 外）不重试，减少 Edge Function 配额消耗。
 *
 * 用于 Edge Function 调用场景：
 * - 4xx 错误（如 401 Unauthorized、403 Forbidden、404 Not Found）不会因重试而成功，直接抛出
 * - 429 Too Many Requests 保留重试（可能是暂时限流）
 * - 5xx 错误和网络错误正常重试
 * - 默认重试次数降为 1 次（共 2 次调用），减少配额消耗
 *
 * @param {Function} fn - 返回 Promise 的异步函数
 * @param {number} [retries=1] - 重试次数（默认 1 次，含首次共 2 次调用）
 * @param {number} [delay=1000] - 初始延迟（毫秒）
 * @returns {Promise<any>}
 */
export async function withRetrySmart(fn, retries = 1, delay = 1000) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // 4xx 错误（除 429 外）不可恢复，直接抛出
      const status = err?.status ?? err?.context?.status;
      if (Number.isFinite(status) && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }
      // 只有在还有重试机会时才等待
      if (i < retries) {
        const backoff = delay * 2 ** i;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
  throw lastError;
}
