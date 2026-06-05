/**
 * 板块资金流向数据同步模块
 * 从东方财富 API 拉取板块资金流向数据，写入 Supabase fund_topic 表
 * 每 5 分钟同步一次，只保留当天数据
 */
import { supabase, isSupabaseConfigured } from './supabase';
import { asyncPool } from './asyncHelper';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isString } from 'lodash';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_TZ = 'Asia/Shanghai';
const CONCURRENCY = 5; // 并发请求数
const DEFAULT_INTERVAL = 5 * 60 * 1000; // 5 分钟

// ============================================================================
// JSONP 解析
// ============================================================================

/**
 * 解析 JSONP 响应文本，提取 JSON 对象
 * 支持格式: callbackName({...}) 或直接 JSON
 */
function parseJsonp(text) {
  if (!text) return null;
  const trimmed = text.trim();
  // 尝试直接 JSON 解析
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // 尝试去掉 JSONP 回调包装: jQueryxxxxxxxx({...}) 或 ({...})
    const match = trimmed.match(/^\s*(?:[\w$.]+)?\s*\(\s*({[\s\S]*})\s*\)\s*;?\s*$/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (_) {}
    }
  }
  return null;
}

// ============================================================================
// API 请求
// ============================================================================

/**
 * 带超时的 fetch 封装
 * @param {string} url
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 带重试的 fetch 封装
 * @param {string} url
 * @param {number} [retries=1]
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, retries = 1, timeoutMs = 10000) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchWithTimeout(url, timeoutMs);
    } catch (e) {
      lastError = e;
      if (i < retries) {
        // 退避 1 秒后重试
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw lastError;
}

/**
 * 获取单只板块的分钟级资金流向数据
 * @param {string} secid - 板块 secid，如 "90.BK1128"
 * @returns {Promise<{ net_inflow: number, time: string }|null>}
 */
async function fetchSectorFundFlow(secid) {
  const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=0&klt=1&secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56&ut=fa5fd1943c7b386f172d6893dbfba10b&_=${Date.now()}`;
  try {
    const res = await fetchWithRetry(url, 1, 10000);
    const text = await res.text();
    const json = parseJsonp(text);
    if (!json || json.rc !== 0 || !json.data?.klines?.length) return null;

    // 取最后一条（最新分钟），累计到当前的最新资金流数据
    const klines = json.data.klines;
    const last = klines[klines.length - 1];
    const parts = last.split(',');
    if (parts.length < 6) return null;

    return {
      net_inflow: parseFloat(parts[1]) || 0, // f52: 主力净流入（元）
      time: parts[0] // f51: 时间
    };
  } catch (e) {
    console.warn(`[SectorSync] 请求资金流向失败 ${secid}:`, e?.message);
    return null;
  }
}

/**
 * 批量获取板块实时行情（涨跌幅）
 * 东方财富 API 支持逗号分隔多个 secid，一次最多建议 50 个
 * @param {string[]} secids - 板块 secid 数组
 * @returns {Promise<Map<string, number|null>>} secid → 涨跌幅（小数）的 Map
 */
async function fetchSectorQuotesBatch(secids) {
  if (!secids || secids.length === 0) return new Map();
  const uniqueIds = [...new Set(secids)];
  const result = new Map();

  // 每批最多 50 个 secid
  const BATCH_SIZE = 50;
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const chunk = uniqueIds.slice(i, i + BATCH_SIZE);
    const url = `https://push2delay.eastmoney.com/api/qt/ulist.np/get?fields=f12,f13,f14,f3&secids=${chunk.join(',')}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const json = await res.json();
      const diff = json?.data?.diff;
      if (Array.isArray(diff)) {
        for (const item of diff) {
          // f12 = 板块代码（如 "BK1128"）, f13 = 市场代码（如 90）, f3 = 涨跌幅（基点）
          const code = item?.f12;
          const market = item?.f13;
          const f3 = item?.f3;
          if (code && market != null) {
            const secid = `${market}.${code}`;
            const pct = f3 != null && Number.isFinite(Number(f3)) ? Number(f3) / 100 : null;
            if (secid && pct != null) {
              console.log(`[SectorSync] ${secid} change_pct=${pct}% (f3=${f3})`);
            }
            result.set(secid, pct);
          }
        }
      }
    } catch (e) {
      console.warn(`[SectorSync] 批量查询涨跌幅失败（${chunk.length} 个）:`, e?.message);
      // 失败时对这批 secid 都设为 null
      for (const id of chunk) {
        result.set(id, null);
      }
    }
  }
  return result;
}

/**
 * 根据 secid 判断板块类型
 * 东方财富 BK 前缀 = 概念板块，其余归为行业板块
 * @param {string} secid
 * @returns {'concept'|'industry'}
 */
function guessSectorType(secid) {
  if (!isString(secid)) return 'industry';
  // 90.BKxxxx 为概念板块
  if (secid.includes('.BK')) return 'concept';
  return 'industry';
}

// ============================================================================
// SectorFundFlowSync 类
// ============================================================================

export class SectorFundFlowSync {
  /**
   * @param {object} options
   * @param {number} [options.intervalMs=300000] - 同步间隔（毫秒）
   * @param {(msg: string) => void} [options.onLog] - 日志回调
   */
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || DEFAULT_INTERVAL;
    this.onLog = options.onLog || (() => {});
    this._timer = null;
    this._syncing = false;
  }

  /**
   * 执行一次完整同步
   * 1. 从 fund_secid 表读取所有板块 secid
   * 2. 并发请求资金流向 + 行情涨跌幅
   * 3. 删除 fund_topic 表当天旧数据
   * 4. 写入新数据
   */
  async sync() {
    if (this._syncing) {
      this.onLog('[SectorSync] 上一轮同步尚未完成，跳过');
      return;
    }
    if (!isSupabaseConfigured) {
      this.onLog('[SectorSync] Supabase 未配置，跳过同步');
      return;
    }

    this._syncing = true;
    try {
      // 1. 读取所有板块 secid
      const { data: sectors, error } = await supabase.from('fund_secid').select('related_sector, secid');

      if (error) throw error;
      if (!sectors || sectors.length === 0) {
        this.onLog('[SectorSync] fund_secid 表无数据，跳过同步');
        return;
      }

      // 只处理板块类 secid（90. 前缀 = 东方财富板块标识）
      const rawList = sectors.filter((s) => s.secid && String(s.secid).trim().startsWith('90.'));
      if (rawList.length === 0) {
        this.onLog('[SectorSync] 无板块 secid（90.*），跳过同步');
        return;
      }

      // 2. secid 去重（P2）：同一 secid 可能关联多个 sector_name，合并 name 列表
      const secidToNames = new Map();
      for (const s of rawList) {
        const secid = String(s.secid).trim();
        const name = s.related_sector?.trim() || '';
        if (!secid) continue;
        if (!secidToNames.has(secid)) {
          secidToNames.set(secid, []);
        }
        if (name) {
          const names = secidToNames.get(secid);
          if (!names.includes(name)) names.push(name);
        }
      }
      const uniqueSectorList = Array.from(secidToNames.entries()).map(([secid, names]) => ({
        secid,
        names: names.length > 0 ? names : [secid]
      }));

      this.onLog(`[SectorSync] 开始同步 ${uniqueSectorList.length} 个板块（去重前 ${rawList.length}）...`);

      // 3. 先批量查询所有涨跌幅（P1）
      const allSecids = uniqueSectorList.map((s) => s.secid);
      const quoteMap = await fetchSectorQuotesBatch(allSecids);

      // 4. 并发请求资金流向（asyncPool 控制并发数）
      const results = await asyncPool(CONCURRENCY, uniqueSectorList, async (sector) => {
        const { secid, names } = sector;
        const flowData = await fetchSectorFundFlow(secid);
        if (!flowData) return null;

        const changePct = quoteMap.get(secid) ?? null;
        const sectorType = guessSectorType(secid);

        // 一个 secid 对应多个 sector_name → 生成多条记录
        return names.map((name) => ({
          sector_id: secid,
          sector_name: name,
          sector_type: sectorType,
          change_pct: changePct,
          net_inflow: flowData.net_inflow
        }));
      });

      // 展平结果
      const validResults = results.filter(Boolean).flat();
      if (validResults.length === 0) {
        this.onLog('[SectorSync] 未获取到有效板块数据');
        return;
      }

      // 5. 删除当天旧数据
      const todayStart = dayjs().tz(DEFAULT_TZ).format('YYYY-MM-DD') + 'T00:00:00+08:00';
      const { error: deleteErr } = await supabase.from('fund_topic').delete().gte('created_at', todayStart);

      if (deleteErr) {
        this.onLog(`[SectorSync] 按时间删除失败，尝试全量删除: ${deleteErr.message}`);
        const { error: deleteAllErr } = await supabase.from('fund_topic').delete().neq('id', 0);
        if (deleteAllErr) {
          this.onLog(`[SectorSync] 全量删除失败（RLS 限制?）: ${deleteAllErr.message}`);
        }
      }

      // 6. 插入新数据
      const { error: insertErr } = await supabase.from('fund_topic').insert(validResults);

      if (insertErr) {
        this.onLog(`[SectorSync] 插入数据失败: ${insertErr.message}`);
        throw insertErr;
      }

      this.onLog(`[SectorSync] 同步完成: ${validResults.length} 条（${uniqueSectorList.length} 个板块）`);
    } catch (e) {
      this.onLog(`[SectorSync] 同步异常: ${e?.message || e}`);
    } finally {
      this._syncing = false;
    }
  }

  /** 启动定时同步 */
  start() {
    if (this._timer) return;
    this.onLog(`[SectorSync] 启动定时同步（间隔 ${this.intervalMs / 1000} 秒）`);
    // 首次立即执行
    this.sync();
    // 定时执行
    this._timer = setInterval(() => this.sync(), this.intervalMs);
  }

  /** 停止定时同步 */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      this.onLog('[SectorSync] 定时同步已停止');
    }
  }
}

// ============================================================================
// 便捷函数：启动一次同步（不依赖 React）
// ============================================================================

/**
 * 执行一次板块资金流向同步
 * 可手动调用，适合非 React 环境
 */
export async function syncOnce() {
  const syncer = new SectorFundFlowSync({ onLog: console.log });
  await syncer.sync();
}
