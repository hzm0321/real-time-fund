// Supabase Edge Function — 板块资金流向定时同步
//
// 功能:
//   每 5 分钟从东方财富拉取所有板块的资金流向 + 涨跌幅
//   写入 fund_topic 表（只保留当天数据）
//   使用 service_role 密钥绕过 RLS
//   仅在 A 股交易时间段运行（周一至周五 9:30-11:30、13:00-15:00）
//   仅同步 fund_secid 表中已关联基金（related_sector 非空）的板块
//
// 部署方式 (Supabase CLI):
//   supabase functions deploy sector-fund-flow-sync --no-verify-jwt
//
// 定时调度 (SQL Editor 执行，分早盘和午盘两个任务):
//   -- 早盘 9:00-11:55 每 5 分钟（9:00-9:25 由函数内部精确判断跳过）
//   select cron.schedule(
//     'sector-fund-flow-sync-morning',
//     '*/5 9-11 * * 1-5',
//     'https://<PROJECT_REF>.supabase.co/functions/v1/sector-fund-flow-sync'
//   );
//   -- 午盘 13:00-14:55 每 5 分钟
//   select cron.schedule(
//     'sector-fund-flow-sync-afternoon',
//     '*/5 13-14 * * 1-5',
//     'https://<PROJECT_REF>.supabase.co/functions/v1/sector-fund-flow-sync'
//   );
//
// 手动调用测试:
//   curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/sector-fund-flow-sync \
//     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

console.info('sector-fund-flow-sync function started');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CONCURRENCY = 5; // 并发请求数
const DEFAULT_TZ = 'Asia/Shanghai';

// ============================================================================
// 工具函数
// ============================================================================

/** 判断当前是否为 A 股交易时间（周一至周五 9:30-11:30、13:00-15:00） */
function isTradingTime(): boolean {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: DEFAULT_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const weekday = getPart('weekday'); // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);

  // 非交易日
  if (['Sat', 'Sun'].includes(weekday)) return false;

  const totalMinutes = hour * 60 + minute;

  // 早盘 9:30 - 11:30
  const morningStart = 9 * 60 + 30;
  const morningEnd = 11 * 60 + 30;

  // 午盘 13:00 - 15:00
  const afternoonStart = 13 * 60;
  const afternoonEnd = 15 * 60;

  return (
    (totalMinutes >= morningStart && totalMinutes < morningEnd) ||
    (totalMinutes >= afternoonStart && totalMinutes < afternoonEnd)
  );
}

/** 解析 JSONP 响应文本 */
function parseJsonp(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/^\s*(?:[\w$.]+)?\s*\(\s*({[\s\S]*})\s*\)\s*;?\s*$/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (_) {}
    }
  }
  return null;
}

/** 根据 secid 判断板块类型 */
function guessSectorType(secid: string): 'concept' | 'industry' {
  if (secid.includes('.BK')) return 'concept';
  return 'industry';
}

// ============================================================================
// API 请求
// ============================================================================

/** 获取单只板块的资金流向（取最后一条 kline 的主力净流入） */
async function fetchSectorFundFlow(secid: string): Promise<{ net_inflow: number; time: string } | null> {
  const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=0&klt=1&secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56&ut=fa5fd1943c7b386f172d6893dbfba10b&_=${Date.now()}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    const json = parseJsonp(text);
    if (!json || json.rc !== 0 || !json.data?.klines?.length) return null;

    const klines = json.data.klines;
    const last = klines[klines.length - 1] as string;
    const parts = last.split(',');
    if (parts.length < 6) return null;

    return {
      net_inflow: parseFloat(parts[1]) || 0, // f52: 主力净流入（元）
      time: parts[0] // f51: 时间
    };
  } catch (e) {
    console.warn(`请求资金流向失败 ${secid}:`, (e as Error)?.message);
    return null;
  }
}

/** 获取单只板块的实时涨跌幅 */
async function fetchSectorQuote(secid: string): Promise<number | null> {
  const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?fields=f12,f13,f14,f3&secids=${secid}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const item = json?.data?.diff?.[0];
    if (!item) return null;

    const f3 = item.f3;
    return f3 != null && Number.isFinite(Number(f3)) ? Number(f3) / 100 : null;
  } catch (e) {
    return null;
  }
}

/** 并发控制：同时最多处理 n 个 */
async function asyncPool<T, R>(concurrency: number, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(await p); // 顺序存入保持对应关系
    // 用 Set 跟踪执行中的请求，但我们需要 await 来控制并发

    const e = p.then(
      () => executing.delete(e),
      () => executing.delete(e)
    );
    executing.add(e);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return results;
}

// ============================================================================
// 主函数
// ============================================================================

async function syncSectors(): Promise<{ count: number; total: number; errors: string[] }> {
  const errors: string[] = [];

  // 1. 创建 Supabase 客户端（service_role → 绕过 RLS）
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 2. 检查 fund_topic 表是否有数据
  const { count: existingCount, error: countErr } = await supabase
    .from('fund_topic')
    .select('*', { count: 'exact', head: true });

  const hasExistingData = !countErr && (existingCount ?? 0) > 0;

  // 3. 如果有数据，则判断交易时间；无数据则强制同步
  if (hasExistingData && !isTradingTime()) {
    console.log('当前非 A 股交易时间，且表中已有数据，跳过同步');
    return { count: 0, total: 0, errors: [] };
  }

  if (!hasExistingData) {
    console.log('fund_topic 表无数据，强制执行同步');
  }

  // 4. 读取 fund_secid 表
  const { data: sectors, error } = await supabase.from('fund_secid').select('related_sector, secid');

  if (error) throw new Error(`读取 fund_secid 失败: ${error.message}`);
  if (!sectors || sectors.length === 0) {
    return { count: 0, total: 0, errors: [] };
  }

  // 只处理板块 secid（90. 前缀）且 related_sector 非空
  const sectorList = sectors.filter(
    (s: any) =>
      s.secid &&
      String(s.secid).trim().startsWith('90.') &&
      s.related_sector &&
      String(s.related_sector).trim().length > 0
  );
  if (sectorList.length === 0) {
    return { count: 0, total: 0, errors: [] };
  }

  console.log(`开始同步 ${sectorList.length} 个板块...`);

  // 5. 并发请求
  const results: Array<{
    sector_name: string;
    sector_type: string;
    change_pct: number | null;
    net_inflow: number;
  } | null> = [];

  // 分批并发
  for (let i = 0; i < sectorList.length; i += CONCURRENCY) {
    const chunk = sectorList.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (sector: any) => {
        const secid = String(sector.secid).trim();
        const sectorName = sector.related_sector?.trim() || '';

        const [flowData, changePct] = await Promise.all([fetchSectorFundFlow(secid), fetchSectorQuote(secid)]);

        if (!flowData) {
          errors.push(`${sectorName}(${secid}): 资金流向数据为空`);
          return null;
        }

        return {
          sector_name: sectorName,
          sector_type: guessSectorType(secid),
          change_pct: changePct,
          net_inflow: flowData.net_inflow
        };
      })
    );
    results.push(...chunkResults);
  }

  const validResults = results.filter(Boolean) as Array<{
    sector_name: string;
    sector_type: string;
    change_pct: number | null;
    net_inflow: number;
  }>;

  if (validResults.length === 0) {
    return { count: 0, total: sectorList.length, errors };
  }

  // 6. 清理旧数据
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayStart = `${todayStr}T00:00:00+08:00`;

  // 6a. 当天首次运行 → 清空全表（只保留当天数据）
  const { count: todayCount, error: todayCountErr } = await supabase
    .from('fund_topic')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart);

  const isFirstRun = !todayCountErr && (todayCount ?? 0) === 0;

  if (isFirstRun) {
    console.log('当天首次运行，清空全表...');
    const { error: cleanErr } = await supabase.from('fund_topic').delete().neq('id', 0);

    if (cleanErr) {
      errors.push(`清空全表失败: ${cleanErr.message}`);
    } else {
      console.log('已清空全表');
    }
  }

  // 6b. 删除当天旧数据，准备重新插入
  const { error: deleteErr } = await supabase.from('fund_topic').delete().gte('created_at', todayStart);

  if (deleteErr) {
    // 回退：清空全表
    console.warn(`按时间删除失败，尝试全量删除: ${deleteErr.message}`);
    const { error: deleteAllErr } = await supabase.from('fund_topic').delete().neq('id', 0);

    if (deleteAllErr) {
      errors.push(`全量删除失败: ${deleteAllErr.message}`);
    }
  }

  // 7. 插入新数据
  const { error: insertErr } = await supabase.from('fund_topic').insert(validResults);

  if (insertErr) {
    throw new Error(`插入数据失败: ${insertErr.message}`);
  }

  console.log(`同步完成: ${validResults.length}/${sectorList.length} 个板块`);
  return { count: validResults.length, total: sectorList.length, errors };
}

// ============================================================================
// HTTP Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  try {
    const result = await syncSectors();
    const elapsed = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        message: `同步完成: ${result.count}/${result.total} 个板块`,
        data: result,
        elapsed_ms: elapsed
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err: any) {
    console.error('同步异常:', err);

    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || 'Unknown error',
        elapsed_ms: Date.now() - startTime
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});
