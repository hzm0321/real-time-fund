import { isArray } from 'lodash';
/**
 * 通用数据规范化工具函数
 * 从 page.jsx / useSyncManager.js 中提取，消除重复定义。
 */

/**
 * 将任意值规范化为 trimmed 字符串。
 * @param {*} value
 * @returns {string}
 */
export function normalizeCode(value) {
  return String(value ?? '').trim();
}

/**
 * 将输入数组中的 code 进行去重 + 可选白名单过滤。
 * @param {Array} input
 * @param {Set|null} allowedSet - 可选白名单 Set
 * @returns {string[]}
 */
export function cleanCodeArray(input, allowedSet = null) {
  const arr = isArray(input) ? input : [];
  const next = [];
  const seen = new Set();
  for (const v of arr) {
    const code = normalizeCode(v);
    if (!code) continue;
    if (allowedSet && !allowedSet.has(code)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    next.push(code);
  }
  return next;
}

/**
 * 将值规范化为有限数字或 null。
 * @param {*} value
 * @returns {number|null}
 */
export const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/**
 * 按 code 去重基金列表（保留第一个出现的）。
 * @param {Array} list
 * @returns {Array}
 */
export const dedupeByCode = (list) => {
  const seen = new Set();
  return list.filter((f) => {
    const c = f?.code;
    if (!c || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
};
