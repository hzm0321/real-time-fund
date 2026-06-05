// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

console.info('fund-valuation-ranking server started');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * 天天基金估值排行代理 Edge Function
 *
 * 请求方式: POST
 * Body: { sort?: number, order?: string, page?: number, pageSize?: number }
 *   - sort:     排序字段，默认 3（3=估值涨幅, 4=成交热度, 5=实际涨幅）
 *   - order:    排序方向，默认 'desc'（'desc' | 'asc'）
 *   - page:     页码，默认 1
 *   - pageSize: 每页条数，默认 20
 *
 * 响应:
 *   成功: { success: true, data: { list: [...], allRecords: number, ... } }
 *   失败: { success: false, error: string }
 */
Deno.serve(async (req: Request) => {
  // 处理跨域 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ✅ 1. 获取 Authorization header
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Authorization header'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
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

    // ✅ 4. 解析请求参数
    const body = await req.json().catch(() => ({}));
    const sort = body?.sort ?? 3;
    const order = body?.order ?? 'desc';
    const page = body?.page ?? 1;
    const pageSize = body?.pageSize ?? 20;

    // ✅ 5. 服务端请求天天基金估值排行 API（无 CORS 限制）
    const apiUrl = `https://api.fund.eastmoney.com/FundGuZhi/GetFundGZList?type=1&sort=${sort}&orderType=${order}&canbuy=0&pageIndex=${page}&pageSize=${pageSize}`;

    const apiRes = await fetch(apiUrl, {
      headers: {
        // 模拟浏览器请求头，避免被 API 拒绝
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://fund.eastmoney.com/'
      }
    });

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      throw new Error(`天天基金 API 请求失败 (${apiRes.status}): ${errorText}`);
    }

    const apiData = await apiRes.json();

    // ✅ 6. 返回数据（保持与原 JSONP 回调结构一致）
    return new Response(
      JSON.stringify({
        success: true,
        data: apiData?.Data || null
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
    console.error('fund-valuation-ranking 服务端错误:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
