/**
 * OCR 相关工具：抓取并裁剪东方财富 pic6 净值估算图。
 *
 * 说明：本项目已统一改用云端 ocr.space 识别（见 lib/ocrSpace.js），
 * 不再使用 Tesseract.js 本地 OCR。
 */

/**
 * 内部重试拉取图片 Blob 工具
 */
async function fetchBlobWithRetry(url, timeoutMs = 4000, maxRetries = 1) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, {
        signal: controller ? controller.signal : undefined
      });
      if (timeoutId) clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      return blob;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      lastErr = e;
    }
  }
  throw lastErr || new Error('Fetch image failed');
}

/**
 * 主线程网络获取 pic6 图片并发执行 Canvas 底部裁剪（截取下方核心文本区域过滤上半部走势图网格）
 * @param {string} code - 基金编码
 * @param {object} [options] - 配置选项
 * @returns {Promise<Blob|string>} 裁剪后的 Blob 或 DataURL
 */
export async function fetchPic6ImageAndCrop(code, options = {}) {
  const { timeoutMs = 4000, maxRetries = 1, cropRatio = 0.25 } = options;
  const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(
    `j4.dfcfw.com/charts/pic6/${code}.png?v=${Date.now()}`
  )}`;
  const blob = await fetchBlobWithRetry(proxyUrl, timeoutMs, maxRetries);

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return blob;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        const width = img.width || 100;
        const height = img.height || 100;
        const cropHeight = Math.max(1, Math.floor(height * cropRatio));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = cropHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(blob);
          return;
        }
        // 从原图底部向上截取 cropHeight 高度的区域（保留下半部分文本信息）
        ctx.drawImage(img, 0, height - cropHeight, width, cropHeight, 0, 0, width, cropHeight);
        if (canvas.toBlob) {
          canvas.toBlob((croppedBlob) => {
            resolve(croppedBlob || blob);
          }, 'image/png');
        } else {
          resolve(canvas.toDataURL('image/png'));
        }
      } catch (err) {
        resolve(blob);
      }
    };
    img.onerror = () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (e) {}
      resolve(blob);
    };
    img.src = objectUrl;
  });
}
