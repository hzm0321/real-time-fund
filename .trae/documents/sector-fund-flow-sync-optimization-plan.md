# sector-fund-flow-sync Edge Function 优化方案

## 问题概述

`fund_secid` 表从 7 条增长到 982 条后，Edge Function 每次触发需发起约 **1,964 次 HTTP 请求**（982 板块 × 2 API），超出 Supabase Edge Function 超时限制，导致 TCP 连接被丢弃。

---

## 优化方案总览（按推荐优先级排序）

| 优先级 | 方案                               | 效果预估                        | 改动量 |
| ------ | ---------------------------------- | ------------------------------- | ------ |
| P0     | **让方案 B（浏览器端）跑起来**     | 彻底规避 Edge Function 超时限制 | 小     |
| P1     | **批量查询涨跌幅**                 | 请求量减半（~982次）            | 小     |
| P2     | **secid 去重**                     | 进一步减少请求量                | 极小   |
| P3     | **请求超时 + 重试**                | 避免单请求卡死整批              | 小     |
| P4     | **优化并发数 + 分批延迟**          | 提升吞吐量，避免限流            | 中     |
| P5     | **分片执行（Edge Function 方案）** | 突破单次超时限制                | 大     |

---

## 方案详述

### P0：让浏览器端同步正式跑起来（推荐首选）

**现状**：`app/lib/sectorFundFlowSync.js` 的 `SectorFundFlowSync` 类已完整实现，但**未在任何入口启动** `start()`。

**改动点**：

1. 在合适的页面入口（如 `page.jsx` 或 `layout.jsx`）中实例化 `SectorFundFlowSync` 并调用 `start()`
2. 浏览器端没有 60s 超时限制，用户打开页面后即可在后台持续同步
3. 用户关闭页面则同步自动停止，节约 Supabase 资源

**优点**：零成本、零超时风险、天然按需同步（只在用户打开页面时运行）  
**缺点**：依赖用户打开页面；但考虑到这是基金看板工具，用户使用时自然开启

**验证**：打开页面后，观察 Supabase `fund_topic` 表是否有数据写入

---

### P1：批量查询涨跌幅（Edge Function + 浏览器端同步都改）

**现状**：`fetchSectorQuote()` 每次只查 1 个 secid。

**东方财富 API** `push2delay.eastmoney.com/api/qt/ulist.np/get` 的 `secids` 参数支持逗号分隔传入多个 secid。将 982 个 secid 分批，每批 50-100 个，只需 10-20 次请求。

**改动点**：

1. 新增 `fetchSectorQuotesBatch(secids: string[])` 函数，一次查多只板块
2. 先在内存中建立 `secid → change_pct` 的 Map
3. `fetchSectorFundFlow` 不再同时查涨跌幅，改为从 Map 中取值

**效果**：涨跌幅请求从 982 次降到约 10-20 次，总请求量减半

---

### P2：secid 去重

**现状**：`fund_secid` 表中同一 secid 可能关联了多个 `related_sector`（如 `90.BK1128` 对应"CPO概念"、"光通信"等），但 API 请求是相同的，会重复请求。

**改动点**：

- 过滤 `sectorList` 时先按 `secid` 去重（保留第一个关联的 sector_name）
- 插入 `fund_topic` 时，一个 secid 对应多条 sector_name 记录

**效果**：假设 982 条中有 200 条重复 secid，可减少 ~200 次请求

---

### P3：请求超时 + 重试

**现状**：`fetch()` 没有超时控制，遇到慢请求可能一直挂起。

**改动点**：

- 给 `fetchSectorFundFlow` 和 `fetchSectorQuote` 添加 `AbortSignal.timeout(10000)`（10 秒超时）
- 对超时或网络错误实现简单重试（最多 1-2 次），退避 1 秒

**效果**：避免单请求卡死整批，提升整体可靠性

---

### P4：优化并发数 + 分批延迟

**现状**：Edge Function 当前每批 5 个并发，连续执行。一方面并发太低导致总时间长；另一方面无间隙可能触发东方财富限流。

**优化方向**：

1. **Edge Function**：将并发数从 5 提升到 10-20（需测试东方财富的限流阈值）
2. **浏览器端**：`asyncPool` 已经是 5 并发，可适当提高
3. **批间微延迟**：每批完成后等待 200-500ms，降低触发限流的概率
4. **如果限流**（返回非 200 或 `rc !== 0`），指数退避等待（1s → 2s → 4s）

---

### P5：分片执行（仅 Edge Function 方案）

如果坚持使用 Edge Function（如需要在用户不打开页面时也保持数据更新），则需要突破单次超时限制：

**方案**：

1. 在 `fund_topic` 表或另建一张 `sync_state` 表记录同步进度（如 `last_secid_index`）
2. 每次 Edge Function 触发只处理 50-100 个板块
3. 下 5 分钟 cron 触发时从上次位置继续
4. 全部完成后重置进度

**代价**：需要额外的状态管理，复杂度提升明显。不推荐首选。

---

## 推荐的实施路线

### Step 1（优先级最高）：停用 Edge Function 定时任务 + 启动浏览器端同步

- 确保 cron 定时任务已取消（`cron.unschedule`）
- 在前端入口启动 `SectorFundFlowSync`
- 这立即可用，彻底解决超时问题

### Step 2：优化浏览器端 `sectorFundFlowSync.js`

- P1：实现批量查询涨跌幅
- P2：secid 去重
- P3：添加请求超时

### Step 3（可选）：如果仍需 Edge Function

实施 P4 + P5，但要先确认 Supabase 项目的 Edge Function 超时配置上限。

---

## 关键决策点

| 决策       | 选项 A                 | 选项 B                 |
| ---------- | ---------------------- | ---------------------- |
| 同步主体   | **浏览器端**（推荐）   | Edge Function          |
| 数据新鲜度 | 用户打开页面时实时更新 | 即使无人打开也定时更新 |
| 超时风险   | 无                     | 需要分片+状态管理      |
| 资源消耗   | 客户端 CPU/网络        | Supabase 函数配额      |

---

## 验证方式

1. 打开浏览器 DevTools Network 标签，观察是否有东方财富 API 请求发出
2. 检查 Supabase `fund_topic` 表是否有新增数据
3. 观察 `MarketTab.jsx` 中的板块列表是否正常显示
