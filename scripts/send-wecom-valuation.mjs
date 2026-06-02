import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import lodash from 'lodash';

const { isArray } = lodash;

const WATCHLIST_PATH = path.join(process.cwd(), 'public', 'webhook-watchlist.json');
const SNAPSHOT_PATH = path.join(process.cwd(), 'public', 'valuation-latest.json');
const REQUEST_TIMEOUT_MS = 12000;

const formatBeijingTime = (date = new Date()) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
    .format(date)
    .replaceAll('/', '-');

const normalizeCode = (code) => (code == null ? '' : String(code).trim());
const normalizeName = (item, fallback = '') => (item?.name == null ? fallback : String(item.name).trim()) || fallback;
const isFiniteNumber = (value) => Number.isFinite(Number(value));
const toNumberOrNull = (value) => (isFiniteNumber(value) ? Number(value) : null);
const signedPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
};
const signedNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}`;
};
const plainValue = (value, digits = 4) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return num.toFixed(digits);
};

const fetchText = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 real-time-fund valuation notifier'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
};

const parseFundJsonp = (text) => {
  const match = text.match(/jsonpgz\((.*)\);?\s*$/s);
  if (!match) throw new Error('基金估值响应格式异常');
  return JSON.parse(match[1]);
};

const fetchFundValuation = async (item) => {
  const code = normalizeCode(item?.code);
  if (!/^\d{6}$/.test(code)) {
    return { code, name: normalizeName(item), error: '基金代码需为 6 位数字' };
  }

  try {
    const text = await fetchText(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`);
    const data = parseFundJsonp(text);
    return {
      code,
      name: normalizeName(item, data.name || code),
      jzrq: data.jzrq || null,
      dwjz: data.dwjz || null,
      gsz: data.gsz || null,
      gszzl: toNumberOrNull(data.gszzl),
      gztime: data.gztime || null,
      source: 'fundgz.1234567.com.cn'
    };
  } catch (error) {
    return {
      code,
      name: normalizeName(item, code),
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const parseTencentVariables = (text) => {
  const map = new Map();
  const reg = /v_([a-zA-Z0-9]+)="([^"]*)"/g;
  let match = reg.exec(text);
  while (match) {
    map.set(match[1], match[2]);
    match = reg.exec(text);
  }
  return map;
};

const parseTencentStock = (raw, item) => {
  const parts = raw.split('~');
  const code = normalizeCode(item?.code);
  const isGlobalIndex = code.startsWith('gz');
  const name = normalizeName(item, parts[1] || code);
  const price = toNumberOrNull(parts[3]);

  if (price == null) throw new Error('股票行情缺少现价');

  if (isGlobalIndex) {
    return {
      code,
      name,
      price,
      change: toNumberOrNull(parts[4]),
      changePercent: toNumberOrNull(parts[5]),
      time: parts[30] || null,
      source: 'qt.gtimg.cn'
    };
  }

  return {
    code,
    name,
    price,
    change: toNumberOrNull(parts[31]),
    changePercent: toNumberOrNull(parts[32]),
    time: parts[30] || null,
    source: 'qt.gtimg.cn'
  };
};

const fetchStockValuations = async (items) => {
  const normalizedItems = items
    .map((item) => ({ ...item, code: normalizeCode(item?.code) }))
    .filter((item) => item.code);

  if (normalizedItems.length === 0) return [];

  const results = new Map(
    normalizedItems.map((item) => [
      item.code,
      {
        code: item.code,
        name: normalizeName(item, item.code),
        error: '未返回行情数据'
      }
    ])
  );

  try {
    const text = await fetchText(
      `https://qt.gtimg.cn/q=${normalizedItems.map((item) => item.code).join(',')}&_t=${Date.now()}`
    );
    const variables = parseTencentVariables(text);
    normalizedItems.forEach((item) => {
      const raw = variables.get(item.code);
      if (!raw) return;
      try {
        results.set(item.code, parseTencentStock(raw, item));
      } catch (error) {
        results.set(item.code, {
          code: item.code,
          name: normalizeName(item, item.code),
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  } catch (error) {
    normalizedItems.forEach((item) => {
      results.set(item.code, {
        code: item.code,
        name: normalizeName(item, item.code),
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  return normalizedItems.map((item) => results.get(item.code));
};

const readWatchlist = async () => {
  const raw = await readFile(WATCHLIST_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    funds: isArray(parsed.funds) ? parsed.funds : [],
    stocks: isArray(parsed.stocks) ? parsed.stocks : []
  };
};

const buildMarkdown = (snapshot) => {
  const lines = ['## 14:30 自选估值', '', `时间：${snapshot.generatedAtBeijing}`, '', '### 基金'];

  if (snapshot.funds.length === 0) {
    lines.push('- 未配置基金');
  } else {
    snapshot.funds.forEach((fund) => {
      if (fund.error) {
        lines.push(`- <font color="warning">${fund.name || fund.code} ${fund.code}：获取失败（${fund.error}）</font>`);
        return;
      }
      const color = Number(fund.gszzl) >= 0 ? 'info' : 'comment';
      lines.push(
        `- <font color="${color}">${fund.name} ${fund.code}：${plainValue(fund.gsz)}，${signedPercent(fund.gszzl)}，${fund.gztime || '--'}</font>`
      );
    });
  }

  lines.push('', '### 股票/指数');
  if (snapshot.stocks.length === 0) {
    lines.push('- 未配置股票/指数');
  } else {
    snapshot.stocks.forEach((stock) => {
      if (stock.error) {
        lines.push(
          `- <font color="warning">${stock.name || stock.code} ${stock.code}：获取失败（${stock.error}）</font>`
        );
        return;
      }
      const color = Number(stock.changePercent) >= 0 ? 'info' : 'comment';
      lines.push(
        `- <font color="${color}">${stock.name} ${stock.code}：${plainValue(stock.price, 2)}，${signedNumber(stock.change)}，${signedPercent(stock.changePercent)}</font>`
      );
    });
  }

  if (process.env.VALUATION_PAGE_URL) {
    lines.push('', `[查看网页快照](${process.env.VALUATION_PAGE_URL})`);
  }

  return lines.join('\n');
};

const sendWecomMessage = async (content) => {
  const webhookUrl = process.env.WECOM_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('未配置 WECOM_WEBHOOK_URL，跳过企业微信推送。');
    return { skipped: true, reason: 'missing WECOM_WEBHOOK_URL' };
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { content }
    })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`企业微信推送失败：HTTP ${response.status} ${body}`);
  const parsed = JSON.parse(body);
  if (parsed.errcode !== 0) throw new Error(`企业微信推送失败：${body}`);
  return parsed;
};

const main = async () => {
  const watchlist = await readWatchlist();
  const [funds, stocks] = await Promise.all([
    Promise.all(watchlist.funds.map((item) => fetchFundValuation(item))),
    fetchStockValuations(watchlist.stocks)
  ]);

  const now = new Date();
  const snapshot = {
    generatedAt: now.toISOString(),
    generatedAtBeijing: formatBeijingTime(now),
    funds,
    stocks
  };
  const content = buildMarkdown(snapshot);
  const wecom = await sendWecomMessage(content);
  const output = {
    ...snapshot,
    wecom: {
      skipped: Boolean(wecom?.skipped),
      sentAt: wecom?.skipped ? null : now.toISOString(),
      reason: wecom?.reason || null
    }
  };

  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`估值快照已写入 ${SNAPSHOT_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
