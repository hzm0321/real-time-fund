// tesseract.js 通过 CDN script 注入按需加载，不再依赖 npm 包。
// 这样构建时无需安装 tesseract.js，且 fetchPic6ImageAndCrop 等不依赖 OCR 的函数可独立加载。
// 与项目中 JSONP/script 注入获取外部数据的模式一致。

const TESSERACT_VERSION = '5.1.1';
const TESSERACT_CDN_BASES = ['https://cdn.jsdelivr.net/npm', 'https://fastly.jsdelivr.net/npm'];

let sharedWorker = null;
let workerPromise = null;
let tesseractApiPromise = null;

/**
 * 通过 CDN script 标签注入加载 tesseract.js UMD 构建，挂载到 window.Tesseract。
 * 加载成功后缓存 Promise，后续调用直接复用。
 * @returns {Promise<typeof window.Tesseract>}
 */
function loadTesseractApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('无浏览器环境'));
  }
  if (window.Tesseract && typeof window.Tesseract.createWorker === 'function') {
    return Promise.resolve(window.Tesseract);
  }
  if (tesseractApiPromise) return tesseractApiPromise;

  tesseractApiPromise = (async () => {
    let lastErr = null;
    for (const base of TESSERACT_CDN_BASES) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${base}/tesseract.js@v${TESSERACT_VERSION}/dist/tesseract.min.js`;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`tesseract.js CDN 加载失败: ${base}`));
          document.head.appendChild(script);
        });
        if (window.Tesseract && typeof window.Tesseract.createWorker === 'function') {
          return window.Tesseract;
        }
        throw new Error('tesseract.js 已加载但未找到 createWorker');
      } catch (e) {
        lastErr = e;
      }
    }
    tesseractApiPromise = null;
    throw lastErr || new Error('tesseract.js CDN 加载失败');
  })();

  return tesseractApiPromise;
}

export async function getOcrWorker(lang = 'chi_sim+eng') {
  if (sharedWorker) return sharedWorker;
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const Tesseract = await loadTesseractApi();
    const { createWorker } = Tesseract;
    const coreCandidates = ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'];
    let lastErr = null;
    for (const base of TESSERACT_CDN_BASES) {
      for (const coreFile of coreCandidates) {
        try {
          const worker = await createWorker(lang, 1, {
            workerPath: `${base}/tesseract.js@v${TESSERACT_VERSION}/dist/worker.min.js`,
            corePath: `${base}/tesseract.js-core@v${TESSERACT_VERSION}/${coreFile}`
          });
          try {
            await worker.setParameters({
              load_system_dawg: '0',
              load_freq_dawg: '0'
            });
          } catch (pErr) {}
          sharedWorker = worker;
          workerPromise = null;
          return worker;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!lastErr) break;
    }
    workerPromise = null;
    if (lastErr) throw lastErr;
    return sharedWorker;
  })();

  return workerPromise;
}

export async function terminateOcrWorker() {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      if (w) await w.terminate();
    } catch (e) {}
    workerPromise = null;
  }
  if (sharedWorker) {
    try {
      await sharedWorker.terminate();
    } catch (e) {}
    sharedWorker = null;
  }
}

/**
 * 提前预热 OCR 引擎（可在闲置时间异步触发）
 */
export async function warmupOcrWorker(lang = 'chi_sim+eng') {
  if (typeof window === 'undefined') return null;
  try {
    return await getOcrWorker(lang);
  } catch (e) {
    return null;
  }
}

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
 * 主线程网络获取 pic6 图片并发执行 Canvas 底部裁剪（从下至上截取 15% 核心区域）
 * @param {string} code - 基金编码
 * @param {object} [options] - 配置选项
 * @returns {Promise<Blob|string>} 裁剪后的 Blob 或 DataURL
 */
export async function fetchPic6ImageAndCrop(code, options = {}) {
  const { timeoutMs = 4000, maxRetries = 1, cropRatio = 0.15 } = options;
  const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(
    `j4.dfcfw.com/charts/pic7/${code}.png?v=${Date.now()}`
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
        const startY = Math.max(0, height - cropHeight);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = cropHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(blob);
          return;
        }
        ctx.drawImage(img, 0, startY, width, cropHeight, 0, 0, width, cropHeight);
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
