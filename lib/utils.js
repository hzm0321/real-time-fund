import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * 统一金额格式化（千分位展示）
 * @param {number|string} value 金额数值
 * @param {number} decimals 小数位数，默认保留两位
 * @returns {string} 格式化后的金额字符串
 */
export function formatMoney(value, decimals = 2) {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) return '—';
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
