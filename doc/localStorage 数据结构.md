# localStorage 数据结构说明

本文档详细说明了 real-time-fund 项目中使用的 localStorage 数据结构。

## 概述

项目使用 localStorage 来持久化用户的基金数据、配置和状态。所有数据都以 JSON 字符串格式存储（除简单字符串外）。

---

## 数据键列表

### 1. funds

**类型**: `Array<Object>`
**默认值**: `[]`
**说明**: 存储用户添加的所有基金信息
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
[
  {
    code: string,      // 基金代码（唯一标识）
    name: string,      // 基金名称
    type: string,      // 基金类型
    dwjz: number,      // 单位净值
    gsz: number,       // 估算净值
    gszzl: number,     // 估算涨跌幅
    jzrq: string,      // 净值日期
    gztime: string,    // 估值时间
    dataSource?: number, // 估值数据源标识（1=天天基金，2=新浪基金预估等，缺省为1）
    // ... 其他基金字段
  }
]
```

**使用场景**:
- 页面加载时恢复基金列表
- 添加/删除基金时更新
- 导入/导出配置时包含
- 云端同步时同步

---

### 2. favorites

**类型**: `Array<string>`
**默认值**: `[]`
**说明**: 存储用户标记为自选的基金代码列表
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
[
  "000001",  // 基金代码
  "110022",
  // ...
]
```

**使用场景**:
- 显示自选基金标签页
- 添加/移除自选时更新
- 导入/导出配置时包含

---

### 3. groups

**类型**: `Array<Object>`
**默认值**: `[]`
**说明**: 存储用户创建的基金分组信息
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
[
  {
    id: string,           // 分组唯一标识
    name: string,         // 分组名称
    codes: Array<string>  // 分组内的基金代码列表
  }
]
```

**使用场景**:
- 显示分组标签页
- 分组管理（添加、编辑、删除）
- 导入/导出配置时包含

---

### 4. collapsedCodes

**类型**: `Array<string>`
**默认值**: `[]`
**说明**: 存储用户收起的基金代码列表（用于折叠基金详情）
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
[
  "000001",  // 收起的基金代码
  "110022",
  // ...
]
```

**使用场景**:
- 记录用户折叠的基金卡片
- 页面刷新后保持折叠状态

---

### 5. collapsedTrends

**类型**: `Array<string>`
**默认值**: `[]`
**说明**: 存储用户收起的业绩走势图表的基金代码列表
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
[
  "000001",  // 收起走势图的基金代码
  "110022",
  // ...
]
```

**使用场景**:
- 记录用户折叠的业绩走势图表
- 页面刷新后保持折叠状态

---

### 6. collapsedEarnings

**类型**: `Array<string>`
**默认值**: `[]`
**说明**: 存储用户收起的收益图表的基金代码列表
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
[
  "000001",  // 收起收益图的基金代码
  "110022",
  // ...
]
```

**使用场景**:
- 记录用户折叠的收益图表
- 页面刷新后保持折叠状态

---

### 7. viewMode

**类型**: `string`
**默认值**: `'card'`
**可选值**: `'card'` | `'list'`
**说明**: 存储用户选择的视图模式
**云端同步**: 否（仅通过 customSettings 同步）
**导入/导出**: 是（直接作为顶层字段导出/导入）

**数据结构**:
```javascript
'card'  // 卡片视图
'list'  // 列表视图
```

**使用场景**:
- 切换卡片/列表视图
- 页面刷新后保持视图模式

---

### 8. refreshMs

**类型**: `number` (字符串存储)
**默认值**: `30000` (30秒)
**最小值**: `30000` (30秒)
**说明**: 存储数据刷新间隔时间（毫秒）
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
'30000'  // 30秒刷新一次
'60000'  // 60秒刷新一次
```

**使用场景**:
- 控制基金数据自动刷新频率
- 用户设置刷新间隔时更新

---

### 9. holdings

**类型**: `Object`
**默认值**: `{}`
**说明**: 存储用户的持仓信息
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
{
  "000001": {
    share: number,  // 持有份额
    cost: number    // 持仓成本价
  },
  "110022": {
    share: number,
    cost: number
  }
}
```

**使用场景**:
- 计算持仓收益
- 买入/卖出操作时更新
- 导入/导出配置时包含

**说明（与分组关系）**: 「全部」「自选」Tab 仅使用本键；自定义分组 Tab 使用 `groupHoldings` 中对应分组的持仓子账本。

---

### 9.1 groupHoldings

**类型**: `Object`
**默认值**: `{}`
**说明**: 按自定义分组 ID 存储独立持仓（份额、成本等），与全局 `holdings` 分离
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
{
  "group_1730000000000": {
    "110022": {
      share: number,
      cost: number,
      firstPurchaseDate?: string  // 与全局持仓字段一致的可选扩展
    }
  }
}
```

**历史兼容**: 升级后首次加载时，若某分组内某基金代码在全局 `holdings` 中有有效持仓且该分组槽位为空，会**深拷贝**一份到该分组；同一基金在多个分组中会出现多份独立数据。

**使用场景**:
- 自定义分组 Tab 下的持仓金额、收益、排序
- 分组内编辑持仓、买卖、定投、待定成交、交易记录（带 `groupId`）
- 导入/导出与云端同步

---

### 10. pendingTrades

**类型**: `Array<Object>`
**默认值**: `[]`
**说明**: 存储待处理的交易记录（当净值未更新时）
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
[
  {
    id: string,          // 交易唯一标识
    fundCode: string,    // 基金代码
    fundName: string,    // 基金名称
    type: string,        // 交易类型 'buy' | 'sell'
    share: number,       // 交易份额
    amount: number,      // 交易金额
    feeRate: number,     // 手续费率
    feeMode: string,     // 手续费模式
    feeValue: number,    // 手续费金额
    date: string,        // 交易日期
    isAfter3pm: boolean, // 是否下午3点后
    isDca: boolean,      // 是否为定投交易
    timestamp: number,   // 时间戳
    groupId?: string     // 可选；存在时表示作用于该分组的 groupHoldings；缺省表示全局 holdings
  }
]
```

**使用场景**:
- 净值未更新时暂存交易
- 净值更新后自动处理待处理交易
- 导入/导出配置时包含

---

### 11. localUpdatedAt

**类型**: `string` (ISO 8601 格式)
**默认值**: `null`
**说明**: 存储本地数据最后更新时间戳，用于云端同步冲突检测
**云端同步**: 否（本地专用）
**导入/导出**: 否

**数据结构**:
```javascript
'2024-01-15T10:30:00.000Z'
```

**使用场景**:
- 云端同步时比较数据版本
- 检测本地和云端数据冲突

---

### 12. hasClosedAnnouncement_v20

**类型**: `string`
**默认值**: `null`
**可选值**: `'true'`
**说明**: 标记用户是否已关闭公告弹窗（版本号后缀用于控制不同版本的公告）
**云端同步**: 否
**导入/导出**: 否

**数据结构**:
```javascript
'true'  // 用户已关闭公告
```

**使用场景**:
- 控制公告弹窗显示
- 版本号后缀（v20）用于控制公告版本
- 组件会自动清理旧版本的公告关闭标记（如 v19）

---

### 13. customSettings

**类型**: `Object`
**默认值**: `{}`
**说明**: 存储用户的高级设置和偏好
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
{
  localSortRules: [  // 排序规则配置
    {
      id: string,        // 规则唯一标识
      label: string,     // 显示标签
      alias: string,     // 别名（可选）
      enabled: boolean   // 是否启用
    }
  ],
  localSortDisplayMode: string,       // 排序显示模式 'buttons' | 'dropdown'
  pcContainerWidth: number,           // PC端容器宽度（桌面版）
  showMarketIndexPc: boolean,         // PC端是否显示大盘指数
  showMarketIndexMobile: boolean,     // 移动端是否显示大盘指数
  showGroupFundSearchPc: boolean,     // PC端是否显示分组内基金搜索
  showGroupFundSearchMobile: boolean, // 移动端是否显示分组内基金搜索
  marketIndexSelected: Array<string>, // 选中的市场指数代码
  // ... 其他自定义设置
}
```

**使用场景**:
- 排序规则持久化
- PC端布局宽度设置
- 市场指数选择与显示控制
- 分组内基金搜索显示控制
- 云端同步所有自定义设置

---

### 14. localSortBy / localSortOrder

**类型**: `string`
**默认值**: `'default'` / `'asc'`
**说明**: 存储当前排序字段和排序方向
**云端同步**: 否（通过 customSettings 同步）
**导入/导出**: 否（通过 customSettings 导入/导出）

**数据结构**:
```javascript
// localSortBy
'gszzl'  // 按估算涨跌幅排序
'default'  // 默认排序

// localSortOrder
'asc'   // 升序
'desc'  // 降序
```

**使用场景**:
- 快速访问当前排序状态
- 与 customSettings.localSortRules 保持同步

---

### 15. localSortRules (旧版)

**类型**: `Array<Object>`
**默认值**: `[]`
**说明**: 旧版排序规则存储，已迁移到 customSettings.localSortRules
**云端同步**: 否
**导入/导出**: 否

**注意**: 该键已弃用，数据已迁移到 customSettings.localSortRules。代码中仍保留兼容性处理。

---

### 16. currentTab

**类型**: `string`
**默认值**: `'all'`
**说明**: 存储用户当前选中的标签页
**云端同步**: 否
**导入/导出**: 否

**数据结构**:
```javascript
'all'     // 全部资产
'fav'     // 自选
groupId   // 分组ID，如 'group_xxx'
```

**使用场景**:
- 恢复用户上次查看的标签页
- 页面刷新后保持标签页状态

---

### 17. theme

**类型**: `string`
**默认值**: `'dark'`
**可选值**: `'light'` | `'dark'`
**说明**: 存储用户选择的主题模式
**云端同步**: 否
**导入/导出**: 否

**数据结构**:
```javascript
'dark'  // 暗色主题
'light'  // 亮色主题
```

**使用场景**:
- 控制应用整体配色
- 页面加载时立即应用（通过 layout.jsx 内联脚本）

---

### 18. fundValuationTimeseries

**类型**: `Object`
**默认值**: `{}`
**说明**: 存储基金估值分时数据，用于走势图展示
**云端同步**: 否（测试中功能，暂不同步）
**导入/导出**: 否（数据量较大且属于临时性数据）

**数据结构**:
```javascript
{
  "000001": [  // 按基金代码索引
    {
      time: string,   // 时间点 "HH:mm"
      value: number,  // 估算净值
      date: string    // 日期 "YYYY-MM-DD"
    }
  ],
  "110022": [
    // ...
  ]
}
```

**数据清理规则**:
- 当新数据日期大于已存储的最大日期时，清空该基金所有旧日期数据，只保留当日分时
- 同一日期内按时间顺序追加数据

**使用场景**:
- 基金详情页分时图展示
- 实时估值数据记录

---

### 19. transactions

**类型**: `Object`
**默认值**: `{}`
**说明**: 存储用户的交易历史记录
**云端同步**: 是
**导入/导出**: 是

**数据结构**:
```javascript
{
  "000001": [  // 按基金代码索引的交易列表
    {
      id: string,            // 交易唯一标识
      type: 'buy' | 'sell',  // 交易类型
      amount: number,        // 交易金额
      share: number,         // 交易份额
      price: number,         // 成交价格
      date: string,          // 交易日期
      isAfter3pm: boolean,   // 是否下午3点后
      isDca: boolean,        // 是否为定投交易
      isHistoryOnly: boolean, // 是否仅历史记录（不参与持仓计算）
      timestamp: number,      // 时间戳
      groupId?: string        // 可选；存在时表示该笔记录属于某分组子账本；缺省表示全局
    }
  ],
  "110022": [
    // ...
  ]
}
```

**使用场景**:
- 交易历史查询
- 收益计算
- 买入/卖出操作记录

---

### 20. dcaPlans (定投计划)

**类型**: `Object`
**默认值**: `{ "__global__": {} }`（迁移后）
**说明**: 存储用户的定投计划配置；分「全局」与「各自定义分组」两套计划
**云端同步**: 是
**导入/导出**: 是

**数据结构（当前版本）**:
```javascript
{
  "__global__": {
    "000001": {
      amount: number,
      feeRate: number,
      cycle: string,
      firstDate: string,
      enabled: boolean,
      weeklyDay: number,
      monthlyDay: number,
      lastDate: string
    }
  },
  "group_1730000000000": {
    "110022": { /* 同结构，仅作用于该分组 */ }
  }
}
```

**旧版兼容**: 若本地仍为「基金代码 → 计划」的扁平对象（无 `__global__` 键），加载时会自动迁移为 `{ "__global__": 原对象 }`。导入时同样会调用 `migrateDcaPlansToScoped` 进行迁移。

**使用场景**:
- 自动定投执行（按 scope 生成带 `groupId` 的 pending）
- 定投计划管理（在「全部/自选」下编辑全局计划，在分组 Tab 下编辑该分组计划）

---

### 21. marketIndexSelected

**类型**: `Array<string>`
**默认值**: `[]`
**说明**: 存储用户选中的市场指数代码
**云端同步**: 否（通过 customSettings 同步）
**导入/导出**: 否（通过 customSettings 导入/导出）

**数据结构**:
```javascript
[
  "sh000001",  // 上证指数
  "sz399001",  // 深证成指
  // ...
]
```

**使用场景**:
- 市场指数面板显示
- 指数选择管理

---

### 22. fundDailyEarnings

**类型**: `Object`
**默认值**: `{}`
**说明**: 存储基金的每日收益数据，按作用域分桶，用于收益折线图展示
**云端同步**: 是
**导入/导出**: 是

**数据结构（当前版本 — 按作用域分桶）**:
```javascript
{
  "all": {                    // 作用域：'all' 为全局，自定义分组 id 为分组维度
    "000001": [               // 按基金代码索引
      {
        date: string,         // 日期 "YYYY-MM-DD"
        earnings: number,     // 当日收益（元）
        rate: number | null   // 当日收益率（百分比数值，如 1.23 表示 +1.23%），基于用户成本价计算
      }
    ],
    "110022": [
      // ...
    ]
  },
  "group_1730000000000": {    // 自定义分组维度的收益
    "110022": [
      // ...
    ]
  }
}
```

**旧版兼容**: 若存储的数据为扁平结构 `{ [code]: [...] }`（无作用域分桶），加载时会自动迁移为 `{ "all": 原对象 }`。`normalizeFundDailyEarningsScoped` 函数负责此兼容处理。

**数据清理规则**:
- 云端同步全量收集时，会过滤无效日期格式（必须 `YYYY-MM-DD`）、无效 earnings 数值
- 仅保留有效基金代码对应的收益数据
- 仅保留有效作用域（`'all'` 或已存在的分组 ID）对应的数据

**使用场景**:
- 基金详情页收益折线图展示
- 每日收益历史记录
- 组合收益汇总（`aggregatePortfolioDailyEarnings`）
- 云端同步

---

## 数据同步机制

### 云端同步

项目支持通过 Supabase 进行云端数据同步。以下键参与云端同步：

**参与云端同步的键**:
- funds
- favorites
- groups
- collapsedCodes
- collapsedTrends
- collapsedEarnings
- refreshMs
- holdings
- groupHoldings
- pendingTrades
- transactions
- dcaPlans
- customSettings
- fundDailyEarnings

**不参与云端同步的键**:
- localUpdatedAt（本地专用）
- hasClosedAnnouncement_v20（本地专用）
- localSortBy / localSortOrder（通过 customSettings 同步）
- localSortRules（旧版兼容，通过 customSettings 同步）
- currentTab（本地会话状态）
- theme（本地主题偏好）
- fundValuationTimeseries（测试中功能）
- marketIndexSelected（通过 customSettings 同步）
- viewMode（通过 customSettings 同步）

**同步流程**:
1. 用户登录后，本地数据会自动上传到云端
2. 用户在其他设备登录时，会从云端下载数据
3. 当本地和云端数据不一致时，会提示用户选择使用哪份数据

### 导入/导出

用户可以导出配置到 JSON 文件，或从 JSON 文件导入配置：

**导出格式**:
```javascript
{
  funds: [],
  favorites: [],
  groups: [],
  collapsedCodes: [],
  collapsedTrends: [],
  collapsedEarnings: [],
  refreshMs: 30000,
  viewMode: 'card',
  holdings: {},
  groupHoldings: {},
  pendingTrades: [],
  transactions: {},
  dcaPlans: { __global__: {} },
  customSettings: {},
  fundDailyEarnings: {},
  exportedAt: '2024-01-15T10:30:00.000Z'
}
```

**导入合并策略**:

| 字段 | 合并策略 |
|------|----------|
| funds | 追加去重：仅添加本地不存在的基金（按 code 去重） |
| favorites | 合并去重：合并本地与导入的自选代码，过滤不存在的基金 |
| groups | 按分组 ID 合并：ID 相同则合并 codes，否则添加新分组 |
| collapsedCodes | 合并去重 |
| collapsedTrends | 合并去重 |
| collapsedEarnings | 合并去重 |
| refreshMs | 覆盖（仅当导入值 ≥ 5000 时生效） |
| viewMode | 覆盖（仅当值为 `'card'` 或 `'list'` 时生效） |
| holdings | 浅合并（导入覆盖同 key） |
| groupHoldings | 按分组 ID 浅合并（导入覆盖同分组同基金 key） |
| pendingTrades | 按唯一键合并去重（优先使用 id，否则按组合键） |
| transactions | 按基金代码合并：同 id 交易不重复，新交易按 timestamp 排序追加 |
| dcaPlans | 按 scope 浅合并（自动迁移旧版扁平格式） |
| customSettings | 浅合并（导入覆盖同 key 设置） |
| fundDailyEarnings | 按作用域 + 基金代码合并：同日期覆盖，新日期追加（自动迁移旧版扁平格式） |

**导入后自动操作**:
- 仅刷新新追加的基金数据
- 自动关闭设置弹框
- 显示「导入成功」提示

---

## 数据验证和清理

### 数据去重

基金列表使用 `dedupeByCode` 函数进行去重，确保每个基金代码只出现一次。

```javascript
const dedupeByCode = (list) => {
  const seen = new Set();
  return list.filter(f => {
    if (!f?.code) return false;
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });
};
```

### 数据清理

在收集数据上传云端时（`collectLocalPayload` 全量模式），会进行数据验证和清理：

1. 清理无效的持仓数据（基金不存在的持仓、share 和 cost 均无效的条目）
2. 清理 `groupHoldings` 中已删除分组、无效基金代码的条目
3. 清理无效的自选、分组、收起状态
4. 清理无效的交易记录和定投计划（含分桶 `dcaPlans`，过滤无效 scope 和基金代码）
5. 清理 `fundDailyEarnings` 中无效作用域、无效基金代码、无效日期/数值的条目
6. 确保数据类型正确（如 holdings 的 share/cost 转为数字）
7. `dcaPlans` 自动迁移旧版扁平格式并确保 `__global__` 键存在

---

## 存储辅助工具

项目使用 `storageHelper` 对象来封装 localStorage 操作，提供统一的错误处理和云端同步触发。

```javascript
const storageHelper = {
  setItem: (key, value) => {
    // 1. 写入 localStorage
    // 2. 触发云端同步（如果是同步键）
    // 3. 更新 localUpdatedAt 时间戳
  },
  getItem: (key) => {
    // 从 localStorage 读取
  },
  removeItem: (key) => {
    // 从 localStorage 删除
    // 触发云端同步
  },
  clear: () => {
    // 清空所有 localStorage
  }
};
```

**同步键集合**:
```javascript
const SYNC_KEYS = new Set([
  'funds', 'favorites', 'groups', 'collapsedCodes', 'collapsedTrends',
  'collapsedEarnings', 'refreshMs', 'holdings', 'groupHoldings',
  'pendingTrades', 'transactions', 'dcaPlans', 'customSettings',
  'fundDailyEarnings'
]);
```

**特性**:
- 自动触发云端同步（对于参与同步的键）
- 自动更新 localUpdatedAt 时间戳
- funds 变更时比较签名（`getFundCodesSignature`），避免无意义同步
- `customSettings` 变更时通过 `triggerCustomSettingsSync` 标记脏数据并触发同步
- 支持 `skipSyncRef` 跳过同步（如云端数据回写时）

---

## 注意事项

1. **数据大小限制**: localStorage 有约 5-10MB 的存储限制，大量基金数据可能超出限制
2. **数据同步**: 修改数据后需要同时更新 localStorage 和 React state
3. **错误处理**: 所有 localStorage 操作都应包含 try-catch 错误处理
4. **数据格式**: 复杂数据必须使用 JSON.stringify/JSON.parse 进行序列化/反序列化
5. **版本控制**: 公告等配置使用版本号后缀，便于控制不同版本的显示
6. **fundValuationTimeseries**: 该数据参与云端同步，但为避免频繁同步带来压力，采取“非主动触发”的懒同步策略，仅在其他数据变更时一并提交。
7. **公告版本清理**: Announcement 组件会自动清理旧版本的公告关闭标记
8. **fundDailyEarnings 作用域**: 当前版本使用按作用域分桶结构（`{ [scope]: { [code]: [...] } }`），旧版扁平格式会自动迁移
9. **导入合并而非覆盖**: 导入操作始终采用合并策略，不会删除本地已有数据

---

## 相关文件

- `app/page.jsx` - 主要页面组件，包含所有 localStorage 操作、导入/导出逻辑、storageHelper 定义
- `app/components/SettingsModal.jsx` - 设置弹框组件，提供导入/导出 UI 入口
- `app/components/Announcement.jsx` - 公告组件
- `app/components/PcFundTable.jsx` - PC端基金表格组件
- `app/components/MobileFundTable.jsx` - 移动端基金表格组件
- `app/components/MarketIndexAccordion.jsx` - 市场指数组件
- `app/lib/supabase.js` - Supabase 客户端配置
- `app/lib/valuationTimeseries.js` - 估值分时数据管理
- `app/lib/dailyEarnings.js` - 每日收益数据管理（按作用域分桶）

---

## 更新日志

- **2026-04-13**: 完善 `fundDailyEarnings` 文档（更新为按作用域分桶结构，补充旧版兼容说明）；补充 `customSettings` 中 `showGroupFundSearchPc`、`showGroupFundSearchMobile` 字段；完善导入/导出格式说明（新增 `customSettings`、`fundDailyEarnings`、`collapsedEarnings` 导出支持）；新增导入合并策略详细表格；补充 storageHelper 同步键集合；为每个键标注导入/导出和云端同步状态
- **2026-04-05（分组独立持仓）**: 新增 `groupHoldings`；`pendingTrades` / `transactions` 支持可选 `groupId`；`dcaPlans` 改为分桶结构（`__global__` + 分组 ID）；同步键与导入导出格式已更新；说明分组持仓从历史全局 `holdings` 的幂等深拷贝迁移规则
- **2026-04-05**: 全面更新文档，新增 `collapsedEarnings`、`fundDailyEarnings` 键；更新 `customSettings`（新增 `localSortDisplayMode`、`showMarketIndexPc`、`showMarketIndexMobile`）；更新 `dcaPlans`（新增 `weeklyDay`、`monthlyDay`、`lastDate`）；更新 `transactions`（新增 `isDca`、`isHistoryOnly`）；更新 `pendingTrades`（新增 `isDca`）；更新公告版本号至 v20；更新云端同步键列表
- **2026-03-18**: 全面更新文档，补充 transactions、dcaPlans、fundValuationTimeseries、customSettings 等键的详细说明，修正云端同步键列表
- **2026-02-19**: 初始文档创建
