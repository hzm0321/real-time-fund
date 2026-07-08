/**
 * 客户端图片压缩工具
 * PRO 用户上传基金截图时，自动压缩到指定大小以内
 * 统一输出 JPEG 格式（兼容 ocr.space 云端识别接口）
 */

const DEFAULT_MAX_SIZE = 1 * 1024 * 1024; // 1MB
const MIN_QUALITY = 0.3;
const QUALITY_STEP = 0.1;
const MAX_DIMENSION = 2048; // 最大宽/高像素

/**
 * 将 File 加载为 HTMLImageElement
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * 将 canvas 导出为 Blob，统一输出 JPEG 格式（兼容 ocr.space）
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality 0~1
 * @returns {Promise<{blob: Blob, mimeType: string}>}
 */
function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve({ blob: blob || new Blob([], { type: 'image/jpeg' }), mimeType: 'image/jpeg' });
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * 将 Blob 转为 data URL (base64)
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 将 File 转为 data URL (base64)，不压缩
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 压缩图片并返回 base64 data URL
 * 如果图片 ≤ maxSizeBytes，直接返回原始 base64；
 * 如果 > maxSizeBytes，通过 Canvas 缩放 + 降低 quality 压缩到目标以内
 *
 * @param {File} file 图片文件
 * @param {number} [maxSizeBytes=1048576] 最大字节数，默认 1MB
 * @returns {Promise<string>} data:image/xxx;base64,... 格式的 data URL
 */
export async function compressImageToBase64(file, maxSizeBytes = DEFAULT_MAX_SIZE) {
  // 如果文件本身 ≤ 限制且不是 WebP 格式，直接转 base64 返回（兼容 ocr.space）
  if (file.size <= maxSizeBytes && file.type !== 'image/webp') {
    return fileToDataURL(file);
  }

  const img = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 等比缩放：如果原图超过 MAX_DIMENSION，按比例缩小
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  // 逐步降低 quality 直到 blob ≤ maxSizeBytes
  let quality = 0.9;
  let result = null;

  while (quality >= MIN_QUALITY) {
    const { blob, mimeType } = await canvasToBlob(canvas, quality);

    if (blob.size <= maxSizeBytes) {
      result = { blob, mimeType };
      break;
    }

    quality -= QUALITY_STEP;
  }

  // 如果降到最低 quality 仍超限，进一步缩小分辨率
  if (!result) {
    let scale = 0.8;
    while (scale >= 0.3) {
      const scaledWidth = Math.round(width * scale);
      const scaledHeight = Math.round(height * scale);
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

      const { blob, mimeType } = await canvasToBlob(canvas, MIN_QUALITY);
      if (blob.size <= maxSizeBytes) {
        result = { blob, mimeType };
        break;
      }
      scale -= 0.1;
    }
  }

  // 兜底：即使超限也返回最后一次压缩结果
  if (!result) {
    const { blob, mimeType } = await canvasToBlob(canvas, MIN_QUALITY);
    result = { blob, mimeType };
  }

  return blobToDataURL(result.blob);
}
