/**
 * 前端直接调用 ocr.space 进行高精度云端 OCR 识别
 * PRO 会员专属：避免将大图片上传至服务端云函数触发超时，由前端直接识别文本后调 AI 分析
 */

const OCR_SPACE_API_KEY = 'K89995261788957';
const DEFAULT_TIMEOUT = 25000; // 默认 25 秒超时

/**
 * 调用 ocr.space 识别图片文字
 * @param {string} base64Image - data URL 格式图片 (data:image/jpeg;base64,...)
 * @param {number} [timeoutMs=25000] - 超时毫秒数
 * @returns {Promise<string>} - 识别出来的文字，按行分割
 */
export async function recognizeWithOcrSpace(base64Image, timeoutMs = DEFAULT_TIMEOUT) {
  if (!base64Image) {
    throw new Error('未提供有效的图片数据');
  }

  const formData = new FormData();
  formData.append('Base64Image', base64Image);
  formData.append('language', 'chs');
  formData.append('OCREngine', '2');
  formData.append('scale', 'true');
  formData.append('detectOrientation', 'true');
  formData.append('isOverlayRequired', 'false');

  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('云端 OCR 识别响应超时（超过25秒），请稍后重试或尝试裁剪图片'));
    }, timeoutMs);
  });

  try {
    const fetchPromise = fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: OCR_SPACE_API_KEY
      },
      body: formData
    });

    const resp = await Promise.race([fetchPromise, timeoutPromise]);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`云端 OCR 接口异常 (${resp.status}): ${errText}`);
    }

    const result = await resp.json();
    if (result?.IsErroredOnProcessing || result?.OCRExitCode !== 1) {
      const errDetails = result?.ErrorMessage?.[0] || result?.ErrorDetails || 'OCR 识别处理异常';
      throw new Error(`云端 OCR 识别失败: ${errDetails}`);
    }

    const parsedResults = result?.ParsedResults;
    if (!Array.isArray(parsedResults) || parsedResults.length === 0) {
      throw new Error('云端 OCR 未能从该截图中提取到文字内容');
    }

    const extractedText = parsedResults
      .map((r) => r?.ParsedText || '')
      .join('\n')
      .trim();

    if (!extractedText) {
      throw new Error('云端 OCR 识别到的文字为空，请换用清晰完整的基金持仓截图重试');
    }

    return extractedText;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
