// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

console.info('server started');

const AINX_API_KEY = Deno.env.get('AINX_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// 每日 OCR 识别上限
const MAX_DAILY_OCR = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// ✅ 清洗模型输出（增强版）
function cleanModelOutput(text: string) {
  if (!text) return '';

  return (
    text
      .replace(/<think>[\s\S]*?<\/think>/gi, '') // 移除思考过程
      .replace(/```json/gi, '') // 移除 markdown 标记
      .replace(/```/g, '')
      // 替换特殊空白字符(如 \u00A0)为普通空格，防止 JSON.parse 报错
      .replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
      .trim()
  );
}

// ✅ 提取 JSON
function extractJSON(text: string) {
  if (!text) return null;

  // 优先匹配数组结构 [...]
  let match = text.match(/\[[\s\S]*\]/);

  // 如果没找到数组，尝试匹配对象 {...}
  if (!match) {
    match = text.match(/\{[\s\S]*\}/);
  }

  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch (err) {
    console.error('JSON 解析失败:', err, '提取的文本:', match[0]);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // 处理跨域 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ✅ 1. 获取 Authorization header
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ✅ 2. 创建 Supabase client（带用户 JWT）
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    // ✅ 3. 校验用户登录状态
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.info('当前用户:', user.id);

    // ✅ 3.5 每日 OCR 用量限流检查（原子操作）
    const { data: usageResult, error: usageError } = await supabase.rpc('check_and_increment_ocr_usage', {
      p_max_limit: MAX_DAILY_OCR
    });

    if (usageError) {
      console.error('OCR 用量检查失败:', usageError);
      // 限流检查失败不阻断请求，记录日志后继续
    } else if (usageResult && !usageResult.allowed) {
      const currentCount = usageResult.current_count || MAX_DAILY_OCR;
      return new Response(
        JSON.stringify({
          success: false,
          error: 'DAILY_LIMIT_EXCEEDED',
          message: `每日 OCR 识别次数已达上限（${MAX_DAILY_OCR} 次），请明天再试`,
          remaining: 0,
          current_count: currentCount,
          max_limit: MAX_DAILY_OCR
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawText = body?.text || '';

    // 清洗输入文本
    const text = rawText
      .replace(/\s+/g, ' ')
      .replace(/[^\S\r\n]+/g, ' ')
      .trim();

    if (!text) {
      return new Response(JSON.stringify({ success: false, error: '未提供有效文本' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ✅ 4. 调用 AINX 大模型接口
    const resp = await fetch('https://api.ainx.cc/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AINX_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5.5', // 指定模型
        temperature: 0, // 设置为 0 保证 JSON 输出更稳定
        stream: false,
        messages: [
          {
            role: 'system',
            content: `你是一个专业的基金持仓OCR解析助手。

任务目标：
从提供的OCR识别文本中提取所有基金信息，并尽可能补全基金代码。

字段定义：

1. fundName（必填）
   - 基金名称。
   - 保留完整名称，包括括号、英文、A/C类后缀等。
   - 不允许截断或简写。

2. fundCode（必填）
   - 优先从OCR文本中提取6位基金代码。
   - 如果OCR文本中未出现基金代码，则根据fundName查询对应的基金代码并补全。
   - 若存在多个可能匹配结果，选择与基金名称最完全一致的基金。
   - 若仍无法确定，则返回空字符串 ""。

3. holdAmounts（可选）
   - 持有金额。
   - 保留原始数字格式。
   - 不存在时返回空字符串 ""。

4. holdGains（可选）
   - 持有收益。
   - 保留正负号及小数。
   - 不存在时返回空字符串 ""。

解析规则：

- 识别所有基金，不遗漏任何基金记录。
- 基金名称附近出现的金额、收益优先归属于该基金。
- 忽略账户信息、广告、提示语、时间、页脚页眉等无关内容。
- 同一基金只输出一次。
- 基金代码必须为6位数字字符串。
- 当fundCode缺失时，必须优先尝试根据fundName检索并补全fundCode，而不是直接返回空字符串。
- 若检索结果存在歧义且无法确定唯一基金代码，则返回空字符串。

输出要求：

仅返回JSON数组，不要输出任何解释、备注、Markdown代码块或其他文本。

输出格式示例：

[
  {
    "fundName": "易方达蓝筹精选混合",
    "fundCode": "005827",
    "holdAmounts": "12345.67",
    "holdGains": "345.21"
  },
  {
    "fundName": "华夏成长混合",
    "fundCode": "000001",
    "holdAmounts": "",
    "holdGains": ""
  }
]`
          },
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    // 检查 AI 接口是否请求成功
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`AI 接口请求失败 (${resp.status}): ${errorText}`);
    }

    const result = await resp.json();

    // 提取模型返回的内容
    const rawContent = result?.choices?.[0]?.message?.content || '';

    // ✅ 5. 解析并清洗 AI 返回的数据
    const cleaned = cleanModelOutput(rawContent);
    const parsed = extractJSON(cleaned);

    if (!parsed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '模型未返回合法 JSON',
          raw: rawContent
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(parsed)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '返回结果不是数组',
          data: parsed
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 格式化确保每个字段的数据类型绝对安全
    const safeData = parsed.map((item: any) => ({
      fundName: String(item?.fundName || ''),
      fundCode: String(item?.fundCode || ''),
      holdAmounts: String(item?.holdAmounts || ''),
      holdGains: String(item?.holdGains || '')
    }));

    // ✅ 6. 成功响应（附带剩余用量信息）
    const remaining = usageResult ? Math.max(0, MAX_DAILY_OCR - (usageResult.current_count || 0)) : null;
    return new Response(
      JSON.stringify({
        success: true,
        data: safeData,
        userId: user.id,
        remaining
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err: any) {
    console.error('服务端错误:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
