import { create } from 'zustand';
import { isEqual } from 'lodash';
import { getFundCodesFromTagRecord } from '@/app/lib/fundHelpers';

/**
 * 签名函数：用于检测 funds 列表是否发生实质性变更（jzrq, dwjz 等核心字段）
 */
export const getFundCodesSignature = (value, extraFields = []) => {
  try {
    const list = Array.isArray(value) ? value : JSON.parse(value || '[]');
    if (!Array.isArray(list)) return '';
    const fields = Array.from(new Set([
      'jzrq',
      'dwjz',
      ...(Array.isArray(extraFields) ? extraFields : [])
    ]));
    const items = list.map((item) => {
      if (!item?.code) return null;
      const extras = fields.map((field) => item?.[field] ?? '').join(':');
      return `${item.code}:${extras}`;
    }).filter(Boolean);
    return Array.from(new Set(items)).join('|');
  } catch (e) {
    return '';
  }
};

/**
 * 签名函数：用于检测 tags 存储是否发生实质性变更
 */
export const getTagsStoreSignature = (value) => {
  try {
    const list = Array.isArray(value) ? value : JSON.parse(value || '[]');
    if (!Array.isArray(list)) return '';
    return list
      .map((r) => {
        const codes = getFundCodesFromTagRecord(r).sort().join(',');
        return `${codes}\u001e${String(r?.id ?? '').trim()}\u001e${String(r?.name ?? '').trim()}\u001e${String(r?.theme ?? '').trim()}`;
      })
      .sort()
      .join('|');
  } catch (e) {
    return '';
  }
};

/**
 * 仅以下 key 参与云端同步
 */
const SYNC_KEYS = new Set([
  'funds', 'tags', 'favorites', 'groups', 
  'collapsedCodes', 'collapsedTrends', 'collapsedEarnings', 
  'refreshMs', 'holdings', 'groupHoldings', 'pendingTrades', 
  'transactions', 'dcaPlans', 'customSettings', 'fundDailyEarnings'
]);

/** 排序展示模式的合法值集合 */
export const SORT_DISPLAY_MODES = new Set(['buttons', 'dropdown']);

/** 排序规则的默认配置 */
export const DEFAULT_SORT_RULES = [
  { id: 'default', label: '默认', enabled: true },
  { id: 'yield', label: '估算涨幅', alias: '涨跌幅', enabled: true },
  { id: 'yesterdayIncrease', label: '最新涨幅', enabled: false },
  { id: 'holdingAmount', label: '持仓金额', enabled: false },
  { id: 'todayProfit', label: '当日收益', enabled: false },
  { id: 'yesterdayProfit', label: '昨日收益', enabled: false },
  { id: 'holdingDays', label: '持有天数', enabled: false },
  { id: 'holding', label: '持有收益', enabled: true },
  { id: 'estimateProfit', label: '估算收益', enabled: false },
  { id: 'holdingCost', label: '持仓成本', enabled: false },
  { id: 'last1Week', label: '近1周', enabled: false },
  { id: 'last1Month', label: '近1月', enabled: false },
  { id: 'last3Months', label: '近3月', enabled: false },
  { id: 'last6Months', label: '近6月', enabled: false },
  { id: 'last1Year', label: '近1年', enabled: false },
  { id: 'tags', label: '基金标签', enabled: false },
  { id: 'name', label: '基金名称', alias: '名称', enabled: true },
];

/**
 * 管理 localStorage 数据的 Zustand Store
 */
export const useStorageStore = create((set, get) => ({
  // 云端同步回调，由 Page 组件注入
  onSync: null,
  
  /** 注入同步回调 */
  setOnSync: (callback) => set({ onSync: callback }),

  funds: [],
  groups: [],
  favorites: new Set(),
  collapsedCodes: new Set(),
  collapsedTrends: new Set(),
  collapsedEarnings: new Set(),
  refreshMs: 30000,
  holdings: {},
  groupHoldings: {},
  pendingTrades: [],
  transactions: {},
  dcaPlans: {},
  customSettings: {},
  fundDailyEarnings: {},

  // 排序相关状态
  sortBy: 'default',
  sortOrder: 'desc',
  pcSortDisplayMode: 'buttons',
  mobileSortDisplayMode: 'buttons',
  sortRules: DEFAULT_SORT_RULES,

  initFunds: () => {
    if (typeof window !== 'undefined') {
      set({ funds: get().getItem('funds', []) });
    }
  },

  initGroups: () => {
    if (typeof window !== 'undefined') {
      set({ groups: get().getItem('groups', []) });
    }
  },

  initFavorites: () => {
    if (typeof window !== 'undefined') {
      const saved = get().getItem('favorites', []);
      set({ favorites: new Set(Array.isArray(saved) ? saved : []) });
    }
  },

  initRefreshMs: () => {
    if (typeof window !== 'undefined') {
      const savedMs = parseInt(get().getItem('refreshMs', 30000), 10);
      set({ refreshMs: Number.isFinite(savedMs) && savedMs >= 5000 ? savedMs : 30000 });
    }
  },

  initHoldings: () => {
    if (typeof window !== 'undefined') {
      set({ holdings: get().getItem('holdings', {}) });
    }
  },

  initGroupHoldings: () => {
    if (typeof window !== 'undefined') {
      set({ groupHoldings: get().getItem('groupHoldings', {}) });
    }
  },

  initPendingTrades: () => {
    if (typeof window !== 'undefined') {
      set({ pendingTrades: get().getItem('pendingTrades', []) });
    }
  },

  initTransactions: () => {
    if (typeof window !== 'undefined') {
      set({ transactions: get().getItem('transactions', {}) });
    }
  },

  initDcaPlans: () => {
    if (typeof window !== 'undefined') {
      set({ dcaPlans: get().getItem('dcaPlans', {}) });
    }
  },

  initCustomSettings: () => {
    if (typeof window !== 'undefined') {
      set({ customSettings: get().getItem('customSettings', {}) });
    }
  },

  initFundDailyEarnings: () => {
    if (typeof window !== 'undefined') {
      const parsed = get().getItem('fundDailyEarnings', {});
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const values = Object.values(parsed);
        const hasScoped = values.some((v) => v && typeof v === 'object' && !Array.isArray(v));
        if (!hasScoped && Object.keys(parsed).length > 0) {
          // 迁移旧版扁平格式为 { "all": 原对象 }
          set({ fundDailyEarnings: { all: parsed } });
          return;
        }
      }
      set({ fundDailyEarnings: parsed });
    }
  },

  initCollapsed: () => {
    if (typeof window !== 'undefined') {
      const cc = get().getItem('collapsedCodes', []);
      const ct = get().getItem('collapsedTrends', []);
      const ce = get().getItem('collapsedEarnings', []);
      set({
        collapsedCodes: new Set(Array.isArray(cc) ? cc : []),
        collapsedTrends: new Set(Array.isArray(ct) ? ct : []),
        collapsedEarnings: new Set(Array.isArray(ce) ? ce : []),
      });
    }
  },

  /**
   * 初始化排序相关状态，从 localStorage 恢复持久化的排序偏好
   */
  initSort: () => {
    if (typeof window === 'undefined') return;

    const savedSortBy = get().getItem('localSortBy');
    const savedSortOrder = get().getItem('localSortOrder');

    const nextState = {};
    if (savedSortBy) nextState.sortBy = savedSortBy;
    if (savedSortOrder) nextState.sortOrder = savedSortOrder;

    // 从 customSettings 读取排序规则和展示模式
    try {
      const settings = get().getItem('customSettings', {});
      if (settings && typeof settings === 'object') {
        // 展示模式：优先读取按端口分别存储的字段，向后兼容旧版单一字段
        if (typeof settings.localSortDisplayMode === 'string' && SORT_DISPLAY_MODES.has(settings.localSortDisplayMode)) {
          nextState.pcSortDisplayMode = settings.localSortDisplayMode;
          nextState.mobileSortDisplayMode = settings.localSortDisplayMode;
        } else {
          if (typeof settings.pcLocalSortDisplayMode === 'string' && SORT_DISPLAY_MODES.has(settings.pcLocalSortDisplayMode)) {
            nextState.pcSortDisplayMode = settings.pcLocalSortDisplayMode;
          }
          if (typeof settings.mobileLocalSortDisplayMode === 'string' && SORT_DISPLAY_MODES.has(settings.mobileLocalSortDisplayMode)) {
            nextState.mobileSortDisplayMode = settings.mobileLocalSortDisplayMode;
          }
        }

        // 排序规则：优先从 customSettings.localSortRules 读取，兼容旧版独立 localSortRules 字段
        let rulesFromSettings = null;
        if (Array.isArray(settings.localSortRules)) {
          rulesFromSettings = settings.localSortRules;
        }
        if (!rulesFromSettings) {
          const legacyRules = get().getItem('localSortRules');
          if (Array.isArray(legacyRules)) rulesFromSettings = legacyRules;
        }

        if (rulesFromSettings && rulesFromSettings.length) {
          const defaultMap = new Map(DEFAULT_SORT_RULES.map((r) => [r.id, r]));
          const merged = [];
          for (const stored of rulesFromSettings) {
            const base = defaultMap.get(stored.id);
            if (!base) continue;
            merged.push({
              ...base,
              enabled: typeof stored.enabled === 'boolean' ? stored.enabled : base.enabled,
              alias: typeof stored.alias === 'string' && stored.alias.trim() ? stored.alias.trim() : base.alias,
            });
          }
          // 追加新版本新增但本地未记录的规则
          DEFAULT_SORT_RULES.forEach((rule) => {
            if (!merged.some((r) => r.id === rule.id)) merged.push(rule);
          });
          nextState.sortRules = merged;
        }
      }
    } catch {
      // ignore
    }

    if (Object.keys(nextState).length) set(nextState);
  },

  setFunds: (nextFunds) => {
    const next = typeof nextFunds === 'function' ? nextFunds(get().funds) : nextFunds;
    set({ funds: next });
    get().setItem('funds', JSON.stringify(next));
  },

  setGroups: (nextGroups) => {
    const next = typeof nextGroups === 'function' ? nextGroups(get().groups) : nextGroups;
    set({ groups: next });
    get().setItem('groups', JSON.stringify(next));
  },

  setFavorites: (nextFavs) => {
    const next = typeof nextFavs === 'function' ? nextFavs(get().favorites) : nextFavs;
    set({ favorites: next });
    get().setItem('favorites', JSON.stringify(Array.from(next)));
  },

  setCollapsedCodes: (nextVal) => {
    const next = typeof nextVal === 'function' ? nextVal(get().collapsedCodes) : nextVal;
    set({ collapsedCodes: next });
    get().setItem('collapsedCodes', JSON.stringify(Array.from(next)));
  },

  setCollapsedTrends: (nextVal) => {
    const next = typeof nextVal === 'function' ? nextVal(get().collapsedTrends) : nextVal;
    set({ collapsedTrends: next });
    get().setItem('collapsedTrends', JSON.stringify(Array.from(next)));
  },

  setCollapsedEarnings: (nextVal) => {
    const next = typeof nextVal === 'function' ? nextVal(get().collapsedEarnings) : nextVal;
    set({ collapsedEarnings: next });
    get().setItem('collapsedEarnings', JSON.stringify(Array.from(next)));
  },

  setRefreshMs: (ms) => {
    set({ refreshMs: ms });
    get().setItem('refreshMs', String(ms));
  },

  setHoldings: (nextHoldings) => {
    const next = typeof nextHoldings === 'function' ? nextHoldings(get().holdings) : nextHoldings;
    set({ holdings: next });
    get().setItem('holdings', JSON.stringify(next));
  },

  setGroupHoldings: (nextGroupHoldings) => {
    const next = typeof nextGroupHoldings === 'function' ? nextGroupHoldings(get().groupHoldings) : nextGroupHoldings;
    set({ groupHoldings: next });
    get().setItem('groupHoldings', JSON.stringify(next));
  },

  setPendingTrades: (nextPendingTrades) => {
    const next = typeof nextPendingTrades === 'function' ? nextPendingTrades(get().pendingTrades) : nextPendingTrades;
    set({ pendingTrades: next });
    get().setItem('pendingTrades', JSON.stringify(next));
  },

  setTransactions: (nextTransactions) => {
    const next = typeof nextTransactions === 'function' ? nextTransactions(get().transactions) : nextTransactions;
    set({ transactions: next });
    get().setItem('transactions', JSON.stringify(next));
  },

  setDcaPlans: (nextDcaPlans) => {
    const next = typeof nextDcaPlans === 'function' ? nextDcaPlans(get().dcaPlans) : nextDcaPlans;
    set({ dcaPlans: next });
    get().setItem('dcaPlans', JSON.stringify(next));
  },

  setCustomSettings: (nextCustomSettings) => {
    const next = typeof nextCustomSettings === 'function' ? nextCustomSettings(get().customSettings) : nextCustomSettings;
    set({ customSettings: next });
    get().setItem('customSettings', JSON.stringify(next));
  },

  setSortBy: (nextSortBy) => {
    const val = typeof nextSortBy === 'function' ? nextSortBy(get().sortBy) : nextSortBy;
    set({ sortBy: val });
    get().setItem('localSortBy', val);
  },

  setSortOrder: (nextSortOrder) => {
    const val = typeof nextSortOrder === 'function' ? nextSortOrder(get().sortOrder) : nextSortOrder;
    set({ sortOrder: val });
    get().setItem('localSortOrder', val);
  },

  setPcSortDisplayMode: (nextMode) => {
    const val = typeof nextMode === 'function' ? nextMode(get().pcSortDisplayMode) : nextMode;
    set({ pcSortDisplayMode: val });
    get()._persistSortSettings({ pcSortDisplayMode: val });
  },

  setMobileSortDisplayMode: (nextMode) => {
    const val = typeof nextMode === 'function' ? nextMode(get().mobileSortDisplayMode) : nextMode;
    set({ mobileSortDisplayMode: val });
    get()._persistSortSettings({ mobileSortDisplayMode: val });
  },

  setSortRules: (nextRules) => {
    const val = typeof nextRules === 'function' ? nextRules(get().sortRules) : nextRules;
    set({ sortRules: val });
    get()._persistSortSettings({ sortRules: val });
  },

  /**
   * 将排序展示模式和规则合并写入 customSettings 持久化
   * @param {object} patch - 可包含 pcSortDisplayMode / mobileSortDisplayMode / sortRules
   */
  _persistSortSettings: (patch = {}) => {
    try {
      const current = get().customSettings || {};
      const next = {
        ...current,
        localSortRules: patch.sortRules !== undefined ? patch.sortRules : get().sortRules,
        pcLocalSortDisplayMode: patch.pcSortDisplayMode !== undefined ? patch.pcSortDisplayMode : get().pcSortDisplayMode,
        mobileLocalSortDisplayMode: patch.mobileSortDisplayMode !== undefined ? patch.mobileSortDisplayMode : get().mobileSortDisplayMode,
      };
      // 删除旧字段兼容历史数据
      delete next.localSortDisplayMode;
      set({ customSettings: next });
      get().setItem('customSettings', JSON.stringify(next));
    } catch {
      // ignore
    }
  },

  setFundDailyEarnings: (nextFundDailyEarnings) => {
    const next = typeof nextFundDailyEarnings === 'function' ? nextFundDailyEarnings(get().fundDailyEarnings) : nextFundDailyEarnings;
    set({ fundDailyEarnings: next });
    get().setItem('fundDailyEarnings', JSON.stringify(next));
  },

  /**
   * 核心写入方法：同步更新 localStorage 和 Store 状态，并触发同步
   * @param {string} key 
   * @param {string} value JSON 字符串或普通字符串
   */
  setItem: (key, value) => {
    const prevValue = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    
    // 检查内容是否真的发生了变化 (使用 lodash isEqual 进行深对比)
    if (prevValue !== null) {
      try {
        const parsedNew = JSON.parse(value);
        const parsedOld = JSON.parse(prevValue);
        if (isEqual(parsedNew, parsedOld)) return;
      } catch (e) {
        // 非 JSON 或解析失败时使用字符串直接对比
        if (prevValue === value) return;
      }
    }

    // 更新本地存储
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }

    // 同步更新 Store 状态，确保 UI 响应
    try {
      const parsed = JSON.parse(value);
      if (key === 'funds') set({ funds: parsed });
      else if (key === 'groups') set({ groups: parsed });
      else if (key === 'favorites') set({ favorites: new Set(parsed) });
      else if (key === 'collapsedCodes') set({ collapsedCodes: new Set(parsed) });
      else if (key === 'collapsedTrends') set({ collapsedTrends: new Set(parsed) });
      else if (key === 'collapsedEarnings') set({ collapsedEarnings: new Set(parsed) });
      else if (key === 'refreshMs') set({ refreshMs: Number(parsed) });
      else if (key === 'holdings') set({ holdings: parsed });
      else if (key === 'groupHoldings') set({ groupHoldings: parsed });
      else if (key === 'pendingTrades') set({ pendingTrades: parsed });
      else if (key === 'transactions') set({ transactions: parsed });
      else if (key === 'dcaPlans') set({ dcaPlans: parsed });
      else if (key === 'customSettings') set({ customSettings: parsed });
      else if (key === 'fundDailyEarnings') set({ fundDailyEarnings: parsed });
      else if (key === 'localSortBy') set({ sortBy: parsed });
      else if (key === 'localSortOrder') set({ sortOrder: parsed });
    } catch (e) {
      // 如果不是 JSON，或者是 refreshMs 这种数字字符串
      if (key === 'refreshMs') set({ refreshMs: Number(value) });
      else if (key === 'localSortBy') set({ sortBy: value });
      else if (key === 'localSortOrder') set({ sortOrder: value });
    }

    // 触发同步逻辑
    const { onSync } = get();
    if (onSync && SYNC_KEYS.has(key)) {
      // 特殊逻辑：如果是 funds 或 tags，通过签名判断是否真的需要同步
      // 注意：isEqual 已经过滤了完全一致的情况，这里依然保留签名判断
      // 是为了过滤“实质性”无变化的更新（如 jzrq, dwjz 没变，但其他非核心字段变了）
      if (key === 'funds') {
        if (getFundCodesSignature(prevValue) === getFundCodesSignature(value)) {
          return;
        }
      }
      if (key === 'tags') {
        if (getTagsStoreSignature(prevValue) === getTagsStoreSignature(value)) {
          return;
        }
      }
      
      onSync(key, prevValue, value);
    }
  },

  /**
   * 删除 key
   */
  removeItem: (key) => {
    const prevValue = (key === 'funds' || key === 'tags') ? window.localStorage.getItem(key) : null;
    window.localStorage.removeItem(key);
    
    const { onSync } = get();
    if (onSync && SYNC_KEYS.has(key)) {
      onSync(key, prevValue, null);
    }
  },

  /**
   * 清空所有存储
   */
  clear: () => {
    window.localStorage.clear();
    const { onSync } = get();
    if (onSync) {
      onSync('__clear__', null, null);
    }
  },

  /**
   * 获取数据（封装 JSON 解析）
   */
  getItem: (key, defaultValue = null) => {
    const val = window.localStorage.getItem(key);
    if (val === null) return defaultValue;
    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  }
}));

/** 非 React 代码中使用的快捷方式 */
export const storageStore = {
  setItem: (key, val) => useStorageStore.getState().setItem(key, val),
  getItem: (key, def) => useStorageStore.getState().getItem(key, def),
  removeItem: (key) => useStorageStore.getState().removeItem(key),
  clear: () => useStorageStore.getState().clear(),
};
