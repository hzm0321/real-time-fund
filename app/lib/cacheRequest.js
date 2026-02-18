
const _cacheResultMap = new Map();
const _cachePendingPromiseMap = new Map();

/**
 * 对函数式写法的请求进行缓存
 * @param request
 * @param cacheKey
 * @param options
 */
export async function cachedRequest(
  request,
  cacheKey,
  options
) {
  const {
    cacheResultMap = _cacheResultMap,
    cachePendingPromiseMap = _cachePendingPromiseMap,
    cacheTime = 1000 * 10,
  } = options ?? {};
  let result;
  // 如果有缓存直接返回
  if (cacheResultMap.has(cacheKey)) {
    result = cacheResultMap.get(cacheKey);
  } else if (cachePendingPromiseMap.has(cacheKey)) {
    // 如果没有缓存,需要判断是否存在相同正在发起的请求
    result = await cachePendingPromiseMap.get(cacheKey);
  } else {
    // 发起真实请求
    cachePendingPromiseMap.set(cacheKey, request());
    result = await cachePendingPromiseMap.get(cacheKey);
    cacheResultMap.set(cacheKey, result);
    // 设置清除缓存时间
    if (cacheTime > 0) {
      setTimeout(() => {
        cacheResultMap.delete(cacheKey);
      }, cacheTime);
    }
    // 得到请求结果后 清理请求
    cachePendingPromiseMap.delete(cacheKey);
  }
  return result;
}

/**
 * 清除缓存的请求结果
 * @param key
 */
export function clearCachedRequest(key) {
  _cacheResultMap.delete(key);
  _cachePendingPromiseMap.delete(key);
}
