'use client';

import { useEffect, useRef, useState, useMemo, useCallback, useTransition, useDeferredValue } from 'react';
import dynamic from 'next/dynamic';
import SearchBar from './components/SearchBar';
import SummaryTabContent from './components/SummaryTabContent';
import FundListView from './components/FundListView';
import NavLayout from './components/NavLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

import { createAvatar } from '@dicebear/core';
import { identicon } from '@dicebear/collection';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { isArray, isBoolean, isFunction, isNil, isNumber, isObject, isPlainObject, isString } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { toast as sonnerToast } from 'sonner';

import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Announcement from './components/Announcement';
import EmptyStateCard from './components/EmptyStateCard';
import FundCard from './components/FundCard';

import GroupSummary from './components/GroupSummary';
import GroupAccountSummaryCard from './components/GroupAccountSummaryCard';
import { CloseIcon, GridIcon, ListIcon, MoonIcon, PlusIcon, SettingsIcon, SortIcon, SunIcon } from './components/Icons';
import UserMenu from './components/UserMenu';
import RefreshButton from './components/RefreshButton';
const UpdateChecker = dynamic(() => import('./components/UpdateChecker'), { ssr: false });
import MarketIndexAccordion from './components/MarketIndexAccordion';
import githubImg from './assets/github.svg';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { getAllValuationSeries, clearFund } from './lib/valuationTimeseries';
import { aggregatePortfolioDailyEarnings } from './lib/dailyEarnings';
import { loadHolidaysForYears, isTradingDay as isDateTradingDay } from './lib/tradingCalendar';
import { asyncPool } from './lib/asyncHelper';
import {
  fetchSmartFundNetValue,
  fetchSmartFundNetValueBackward,
  fetchFundPeriodReturns,
  searchFunds
} from './api/fund';
import MobileBottomNav from './components/MobileBottomNav';
import MineTab from './components/MineTab';
import MarketTab from './components/MarketTab';
import PcSideNav from './components/PcSideNav';
import SearchFund from './components/SearchFund';
import { useTheme } from './hooks/useTheme';
import { useTradingDay } from './hooks/useTradingDay';
import { useHoldingProfit } from './hooks/useHoldingProfit';
import { useGroupActions } from './hooks/useGroupActions';
import { useSummaryCalculations } from './hooks/useSummaryCalculations';
import { useNavHeights } from './hooks/useNavHeights';
import { useScanImport } from './hooks/useScanImport';
import { useRefreshManager } from './hooks/useRefreshManager';
import { useSyncManager, normalizeFundDailyEarningsScoped } from './hooks/useSyncManager';
import { useIsMobile } from './hooks/useIsMobile';
import {
  useUserStore,
  clearAuthUser,
  setAuthUser,
  useStorageStore,
  storageStore,
  normalizePendingTrades,
  useModalStore,
  useSettingsStore
} from './stores';
import ModalsLayer from './components/ModalsLayer';

import {
  DEFAULT_SORT_RULES,
  SORT_DISPLAY_MODES,
  DCA_SCOPE_GLOBAL,
  SUMMARY_TAB_ID,
  SUMMARY_SOURCE_GLOBAL,
  DAILY_EARNINGS_SCOPE_ALL,
  DEFAULT_FUND_TAG_THEME
} from '@/app/constants';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

import {
  TZ,
  nowInTz,
  toTz,
  formatDate,
  normalizeFundTagTheme,
  normalizeFundTagInstanceListFromInput,
  stripLegacyTagsFromFundObject,
  getFundCodesFromTagRecord,
  sanitizeTagRowForStorage,
  serializeTagRecordsForCompare,
  cloneHoldingDeep,
  migrateDcaPlansToScoped,
  isNavUpdated
} from './lib/fundHelpers';

import { dedupeByCode, normalizeCode, cleanCodeArray } from './lib/normalize';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn, formatMoney } from '@/lib/utils';

export default function HomePage() {
  const {
    funds,
    setFunds,
    initFunds,
    groups,
    setGroups,
    initGroups,
    favorites,
    setFavorites,
    initFavorites,
    collapsedCodes,
    setCollapsedCodes,
    collapsedTrends,
    setCollapsedTrends,
    collapsedValuationTrends,
    setCollapsedValuationTrends,
    collapsedEarnings,
    setCollapsedEarnings,
    refreshMs,
    setRefreshMs,
    holdings,
    setHoldings,
    groupHoldings,
    setGroupHoldings,
    pendingTrades,
    setPendingTrades,
    transactions,
    setTransactions,
    dcaPlans,
    setDcaPlans,
    customSettings,
    setCustomSettings,
    fundDailyEarnings,
    setFundDailyEarnings,
    valuationSeries,
    setValuationSeries,
    initCollapsed,
    initRefreshMs,
    initHoldings,
    initGroupHoldings,
    initPendingTrades,
    initTransactions,
    initDcaPlans,
    initCustomSettings,
    initFundDailyEarnings,
    initFundDividends,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    pcSortDisplayMode,
    setPcSortDisplayMode,
    mobileSortDisplayMode,
    setMobileSortDisplayMode,
    sortRules,
    setSortRules,
    initSort
  } = useStorageStore();
  /** 基金标签（独立 localStorage 键 `tags`）：{ id, name, theme, fundCodes: string[] }[] */
  const [fundTagRecords, setFundTagRecords] = useState([]);
  /**
   * 每只基金已选标签实例：仅由 `tags` 推导生成（不再持久化 fundTagLists）。
   * 形状保持为 { [code]: {id,name,theme}[] }，便于复用现有组件接口。
   */
  const fundTagListsByCode = useMemo(() => {
    const out = {};
    const codeSet = new Set((isArray(funds) ? funds : []).map((f) => String(f?.code ?? '').trim()).filter(Boolean));
    for (const r of fundTagRecords || []) {
      if (!r || !isObject(r)) continue;
      const id = String(r.id ?? '').trim();
      const name = String(r.name ?? '').trim();
      if (!id || !name) continue;
      const theme = normalizeFundTagTheme(r.theme);
      for (const c of getFundCodesFromTagRecord(r)) {
        if (!codeSet.has(c)) continue;
        if (!out[c]) out[c] = [];
        out[c].push({ id, name, theme });
      }
    }
    Object.keys(out).forEach((c) => {
      out[c] = out[c].filter((x) => x?.name).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    });
    return out;
  }, [fundTagRecords, funds]);

  const [error, setError] = useState('');
  const isLoggingOutRef = useRef(false);
  const isExplicitLoginRef = useRef(false);

  // 刷新频率与布局配置状态
  const {
    tempSeconds,
    setTempSeconds,
    containerWidth,
    setContainerWidth,
    showMarketIndexPc,
    setShowMarketIndexPc,
    showMarketIndexMobile,
    setShowMarketIndexMobile,
    showGroupFundSearchPc,
    setShowGroupFundSearchPc,
    showGroupFundSearchMobile,
    setShowGroupFundSearchMobile,
    dynamicStylePc,
    setDynamicStylePc,
    dynamicStyleMobile,
    setDynamicStyleMobile,
    showGroupDropdownPc,
    setShowGroupDropdownPc,
    showGroupDropdownMobile,
    setShowGroupDropdownMobile,
    isGroupSummarySticky,
    setIsGroupSummarySticky,
    syncFromCustomSettings
  } = useSettingsStore();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    syncFromCustomSettings(customSettings);
  }, [customSettings, syncFromCustomSettings]);

  // 自选状态
  const [currentTab, setCurrentTab] = useState('all');
  const [, startTransition] = useTransition();
  const hasLocalTabInitRef = useRef(false);

  // 调用 store 的 initSort，在 mount 时恢复持久化的排序偏好
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initSort();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当用户关闭某个排序规则时，如果当前 sortBy 不再可用，则自动切换到第一个启用的规则
  useEffect(() => {
    const enabledRules = (sortRules || []).filter((r) => r.enabled);
    const enabledIds = enabledRules.map((r) => r.id);
    if (!enabledIds.length) {
      // 至少保证默认存在
      setSortRules(DEFAULT_SORT_RULES);
      setSortBy('default');
      return;
    }
    if (!enabledIds.includes(sortBy)) {
      setSortBy(enabledIds[0]);
    }
  }, [sortRules, sortBy]);

  // 视图模式
  const [viewMode, setViewMode] = useState('list'); // card, list
  // 全局隐藏金额状态（影响分组汇总、列表和卡片）
  const [maskAmounts, setMaskAmounts] = useState(false);

  // 用户认证状态（Supabase 会话仍由客户端持久化；用户信息由 zustand 全局管理）
  const user = useUserStore((s) => s.user);
  const userAvatar = useMemo(() => {
    if (!user?.id) return '';
    return createAvatar(identicon, {
      seed: user.id,
      size: 80
    }).toDataUri();
  }, [user?.id]);

  // 搜索相关状态
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedFunds, setSelectedFunds] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // 分组内基金列表搜索（点击按钮后才应用）
  const [groupFundSearchTerm, setGroupFundSearchTerm] = useState('');
  const deferredGroupFundSearchTerm = useDeferredValue(groupFundSearchTerm);

  // --- 主题管理（抽离到 useTheme）---
  const { theme, showThemeTransition, setShowThemeTransition, handleThemeToggle } = useTheme();

  // 动态计算 Navbar 和 FilterBar 高度（抽离到 useNavHeights）
  // 注意：isMobile 在此处尚未声明，shouldShowMarketIndex 由 page.jsx 内独立 useEffect 处理
  const containerRef = useRef(null);
  const { navbarRef, filterBarRef, navbarHeight, filterBarHeight } = useNavHeights({ groups, currentTab });

  const handleMobileSearchClick = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsSearchFocused(true);
    // 等待动画完成后聚焦，避免 iOS 键盘弹出问题
    setTimeout(() => {
      inputRef.current?.focus();
    }, 350);
  };

  const [percentModes, setPercentModes] = useState({}); // { [code]: boolean }
  const [todayPercentModes, setTodayPercentModes] = useState({}); // { [code]: boolean }

  const tabsRef = useRef(null);
  const scrollAreaRef = useRef(null);

  // ---- Modal store setter compatibility wrappers ----
  const _ms = useModalStore.setState;
  const _gs = useModalStore.getState;
  const setSettingsOpen = (v) => _ms({ settingsOpen: isFunction(v) ? v(_gs().settingsOpen) : v });
  const setGroupModalOpen = (v) => _ms({ groupModalOpen: isFunction(v) ? v(_gs().groupModalOpen) : v });
  const setGroupManageOpen = (v) => _ms({ groupManageOpen: isFunction(v) ? v(_gs().groupManageOpen) : v });
  const setAddFundToGroupOpen = (v) => _ms({ addFundToGroupOpen: isFunction(v) ? v(_gs().addFundToGroupOpen) : v });
  const setSortSettingOpen = (v) => _ms({ sortSettingOpen: isFunction(v) ? v(_gs().sortSettingOpen) : v });
  const setLoginModalOpen = (v) => _ms({ loginModalOpen: isFunction(v) ? v(_gs().loginModalOpen) : v });
  const setLoginInitialError = (v) => _ms({ loginInitialError: isFunction(v) ? v(_gs().loginInitialError) : v });
  const setFeedbackOpen = (v) => _ms({ feedbackOpen: isFunction(v) ? v(_gs().feedbackOpen) : v });
  const setFeedbackNonce = (v) => _ms({ feedbackNonce: isFunction(v) ? v(_gs().feedbackNonce) : v });
  const setDonateOpen = (v) => _ms({ donateOpen: isFunction(v) ? v(_gs().donateOpen) : v });
  const setIsLogoutConfirmOpen = (v) => _ms({ isLogoutConfirmOpen: isFunction(v) ? v(_gs().isLogoutConfirmOpen) : v });
  const setPortfolioEarningsOpen = (v) =>
    _ms({ portfolioEarningsOpen: isFunction(v) ? v(_gs().portfolioEarningsOpen) : v });
  const setMobileFundDrawerOpen = (v) =>
    _ms({ mobileFundDrawerOpen: isFunction(v) ? v(_gs().mobileFundDrawerOpen) : v });
  const setTutorialDrawerOpen = (v) => _ms({ tutorialDrawerOpen: isFunction(v) ? v(_gs().tutorialDrawerOpen) : v });
  const setUpdateLogOpen = (v) => _ms({ updateLogOpen: isFunction(v) ? v(_gs().updateLogOpen) : v });
  const setMobileTableSettingModalOpen = (v) =>
    _ms({ mobileTableSettingModalOpen: isFunction(v) ? v(_gs().mobileTableSettingModalOpen) : v });
  const setIsUpdateModalOpen = (v) => _ms({ isUpdateModalOpen: isFunction(v) ? v(_gs().isUpdateModalOpen) : v });
  const setHoldingModal = (v) => _ms({ holdingModal: isFunction(v) ? v(_gs().holdingModal) : v });
  const setActionModal = (v) => _ms({ actionModal: isFunction(v) ? v(_gs().actionModal) : v });
  const setTradeModal = (v) => _ms({ tradeModal: isFunction(v) ? v(_gs().tradeModal) : v });
  const setConvertModal = (v) => _ms({ convertModal: isFunction(v) ? v(_gs().convertModal) : v });
  const setDividendMethodModal = (v) => _ms({ dividendMethodModal: isFunction(v) ? v(_gs().dividendMethodModal) : v });
  const setSelectHoldingGroupModal = (v) =>
    _ms({ selectHoldingGroupModal: isFunction(v) ? v(_gs().selectHoldingGroupModal) : v });
  const setDataSourceModal = (v) => _ms({ dataSourceModal: isFunction(v) ? v(_gs().dataSourceModal) : v });
  const setDcaModal = (v) => _ms({ dcaModal: isFunction(v) ? v(_gs().dcaModal) : v });
  const setClearConfirm = (v) => _ms({ clearConfirm: isFunction(v) ? v(_gs().clearConfirm) : v });
  const setHoldingMigrateDialog = (v) =>
    _ms({ holdingMigrateDialog: isFunction(v) ? v(_gs().holdingMigrateDialog) : v });
  const setHistoryModal = (v) => _ms({ historyModal: isFunction(v) ? v(_gs().historyModal) : v });
  const setAddHistoryModal = (v) => _ms({ addHistoryModal: isFunction(v) ? v(_gs().addHistoryModal) : v });
  const setFundDeleteConfirm = (v) => _ms({ fundDeleteConfirm: isFunction(v) ? v(_gs().fundDeleteConfirm) : v });
  const setFundDeleteBulkConfirm = (v) =>
    _ms({ fundDeleteBulkConfirm: isFunction(v) ? v(_gs().fundDeleteBulkConfirm) : v });
  const setFundTagsEdit = (v) => _ms({ fundTagsEdit: isFunction(v) ? v(_gs().fundTagsEdit) : v });
  const setSuccessModal = (v) => _ms({ successModal: isFunction(v) ? v(_gs().successModal) : v });

  const fundDetailDrawerCloseRef = useRef(null); // 由 MobileFundTable 注入，用于确认删除时关闭基金详情 Drawer
  const fundDetailDialogCloseRef = useRef(null); // 由 PcFundTable 注入，用于确认删除时关闭基金详情 Dialog
  const pcBatchClearSelectionRef = useRef(null); // 由 PcFundTable 注入，批量删除二次确认成功后清空表格多选
  const mobileBatchClearSelectionRef = useRef(null); // 由 MobileFundTable 注入，批量删除二次确认成功后退出编辑态

  const isSchedulingDcaRef = useRef(false);
  const isProcessingPendingRef = useRef(false);

  const todayStr = formatDate();

  const isMobile = useIsMobile();
  const showGroupDropdown = isMobile ? showGroupDropdownMobile : showGroupDropdownPc;
  const isGroupDropdownTabActive = currentTab === 'fav' || groups.some((g) => g.id === currentTab);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const isDynamic = isMobile ? dynamicStyleMobile : dynamicStylePc;
      if (!isDynamic) {
        document.documentElement.classList.add('reduce-dynamic-style');
      } else {
        document.documentElement.classList.remove('reduce-dynamic-style');
      }
    }
  }, [isMobile, dynamicStyleMobile, dynamicStylePc]);

  const [mainTab, setMainTab] = useState('home');
  const [hasVisitedMarketTab, setHasVisitedMarketTab] = useState(false);

  useEffect(() => {
    if (mainTab === 'market' && !hasVisitedMarketTab) {
      setHasVisitedMarketTab(true);
    }
  }, [mainTab, hasVisitedMarketTab]);

  const [mobileBottomNavHidden, setMobileBottomNavHidden] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!isMobile) {
      setMobileFundDrawerOpen(false);
      setMobileTableSettingModalOpen(false);
    }
  }, [isMobile]);

  const handleFundCardDrawerOpenChange = useCallback((open) => {
    setMobileFundDrawerOpen(Boolean(open));
  }, []);

  const handleMobileSettingModalOpenChange = useCallback((open) => {
    setMobileTableSettingModalOpen(Boolean(open));
  }, []);

  const shouldShowMarketIndex = (isMobile ? showMarketIndexMobile : showMarketIndexPc) || mainTab === 'market';
  const shouldShowGroupFundSearch = isMobile ? showGroupFundSearchMobile : showGroupFundSearchPc;

  // 交易日检测（抽离到 useTradingDay）
  const { isTradingDay } = useTradingDay();

  const activeGroupId =
    currentTab !== 'all' &&
    currentTab !== 'fav' &&
    currentTab !== SUMMARY_TAB_ID &&
    groups.some((g) => g.id === currentTab)
      ? currentTab
      : null;

  // 计算持仓收益（抽离至自定义 Hook 管理）
  const { getHoldingProfit } = useHoldingProfit({ activeGroupId });

  const {
    groupsWithHoldings,
    summaryTabPortfolioTotals,
    hasGlobalPortfolioForSummary,
    showPortfolioSummaryTab,
    summaryMergedHoldings,
    summaryHoldingSourceGroupByCode,
    summaryCardItems
  } = useSummaryCalculations({ currentTab, setCurrentTab, getHoldingProfit });

  const getHoldingProfitForTab = useCallback(
    (fund, holding) => {
      if (currentTab === SUMMARY_TAB_ID) {
        const src = summaryHoldingSourceGroupByCode[fund?.code];
        if (src === undefined) return null;
        const scopeGid = src === SUMMARY_SOURCE_GLOBAL ? null : src;
        return getHoldingProfit(fund, holding, scopeGid);
      }
      return getHoldingProfit(fund, holding);
    },
    [currentTab, summaryHoldingSourceGroupByCode, getHoldingProfit]
  );

  /**
   * 全部/自选：当全局 holdings 无该基金持仓，但自定义分组存在持仓时，
   * 仅用于展示地将其它分组的持仓汇总到当前 tab（不写入 localStorage）。
   */
  const linkedHoldingsForAllFav = useMemo(() => {
    const enabled = (currentTab === 'all' || currentTab === 'fav') && !activeGroupId;
    if (!enabled) return { derived: {}, linked: new Set(), groupIdsByCode: {} };

    const derived = {};
    const linked = new Set();
    const groupIdsByCode = {};

    const hasGlobalHolding = (h) => !isNil(h) && isNumber(h.share) && Number(h.share) >= 0;

    for (const fund of funds || []) {
      const code = fund?.code;
      if (!code) continue;
      if (hasGlobalHolding(holdings?.[code])) continue;

      let totalShare = 0;
      let totalCostShare = 0;
      let hasAnyCost = false;
      const sourceGroupIds = [];

      for (const g of groups || []) {
        const gid = g?.id;
        if (!gid) continue;
        const h = groupHoldings?.[gid]?.[code];
        if (!h) continue;
        const s = Number(h.share);
        if (!Number.isFinite(s) || s < 0) continue;
        sourceGroupIds.push(gid);
        totalShare += s;

        const c = h.cost == null || h.cost === '' ? null : Number(h.cost);
        if (c != null && Number.isFinite(c) && c > 0) {
          totalCostShare += c * s;
          hasAnyCost = true;
        }
      }

      if (sourceGroupIds.length > 0) {
        derived[code] = {
          share: totalShare,
          cost: hasAnyCost && totalShare > 0 ? totalCostShare / totalShare : hasAnyCost ? 0 : null
        };
        linked.add(code);
        groupIdsByCode[code] = sourceGroupIds;
      }
    }

    return { derived, linked, groupIdsByCode };
  }, [currentTab, activeGroupId, funds, holdings, groupHoldings, groups]);

  useEffect(() => {
    const linkedCodes = linkedHoldingsForAllFav?.linked;
    if (!(linkedCodes instanceof Set) || linkedCodes.size === 0) return;
    setFundDailyEarnings((prev) => {
      if (!isPlainObject(prev)) return prev;
      const globalBucket = prev[DAILY_EARNINGS_SCOPE_ALL];
      if (!isPlainObject(globalBucket)) return prev;
      const nextGlobalBucket = { ...globalBucket };
      let changed = false;
      for (const code of linkedCodes) {
        if (code in nextGlobalBucket) {
          delete nextGlobalBucket[code];
          changed = true;
        }
      }
      if (!changed) return prev;
      return { ...prev, [DAILY_EARNINGS_SCOPE_ALL]: nextGlobalBucket };
    });
  }, [linkedHoldingsForAllFav, setFundDailyEarnings]);

  const currentFundDailyEarnings = useMemo(() => {
    if (!isPlainObject(fundDailyEarnings)) return {};

    const getScopeBucket = (scopeKey) => {
      const scoped = fundDailyEarnings[scopeKey];
      return isPlainObject(scoped) ? scoped : {};
    };

    if (activeGroupId) {
      return getScopeBucket(activeGroupId);
    }

    if (currentTab === SUMMARY_TAB_ID) {
      const out = {};
      Object.entries(summaryHoldingSourceGroupByCode || {}).forEach(([code, source]) => {
        const scopeKey = source === SUMMARY_SOURCE_GLOBAL ? DAILY_EARNINGS_SCOPE_ALL : source;
        const bucket = getScopeBucket(scopeKey);
        const list = bucket[code];
        if (isArray(list) && list.length > 0) out[code] = list;
      });
      return out;
    }

    const globalBucket = getScopeBucket(DAILY_EARNINGS_SCOPE_ALL);

    if (currentTab !== 'all' && currentTab !== 'fav') {
      return globalBucket;
    }

    const linkedCodes = linkedHoldingsForAllFav?.linked;
    if (!(linkedCodes instanceof Set) || linkedCodes.size === 0) {
      return globalBucket;
    }

    const out = { ...globalBucket };
    const groupIdsByCode = linkedHoldingsForAllFav?.groupIdsByCode || {};

    for (const code of linkedCodes) {
      const groupIds = isArray(groupIdsByCode[code]) ? groupIdsByCode[code] : [];
      if (groupIds.length === 0) continue;

      let fallbackPrincipalCurrent = 0;
      for (const gid of groupIds) {
        const h = groupHoldings?.[gid]?.[code];
        if (!h) continue;
        const share = Number(h.share);
        const cost = Number(h.cost);
        if (!Number.isFinite(share) || share <= 0) continue;
        if (!Number.isFinite(cost) || cost <= 0) continue;
        fallbackPrincipalCurrent += cost * share;
      }

      const byDate = new Map();
      for (const gid of groupIds) {
        const bucket = getScopeBucket(gid);
        const list = bucket[code];
        if (!isArray(list) || list.length === 0) continue;

        for (const item of list) {
          const date = item?.date ? String(item.date) : '';
          const earnings = Number(item?.earnings);
          const rate = Number(item?.rate);
          const baseCostAmount = Number(item?.baseCostAmount);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          if (!Number.isFinite(earnings)) continue;
          const prev = byDate.get(date) || {
            earnings: 0,
            rowCount: 0,
            singleRate: null,
            rateCount: 0,
            baseCostAmount: 0
          };
          prev.earnings += earnings;
          prev.rowCount += 1;
          if (Number.isFinite(rate)) {
            prev.rateCount += 1;
            if (prev.singleRate == null) prev.singleRate = rate;
          }
          if (Number.isFinite(baseCostAmount) && baseCostAmount > 0) {
            prev.baseCostAmount += baseCostAmount;
          }
          byDate.set(date, prev);
        }
      }

      if (byDate.size > 0) {
        out[code] = [...byDate.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, row]) => {
            const earnings = row.earnings;
            const baseCostAmount =
              Number.isFinite(row.baseCostAmount) && row.baseCostAmount > 0 ? row.baseCostAmount : null;
            let rate = null;
            if (baseCostAmount != null) {
              rate = (earnings / baseCostAmount) * 100;
            } else if (row.rowCount === 1 && row.rateCount === 1 && Number.isFinite(row.singleRate)) {
              rate = row.singleRate;
            } else if (Number.isFinite(fallbackPrincipalCurrent) && fallbackPrincipalCurrent > 0) {
              // 兼容旧数据：历史记录缺少快照且无 rate 时，用当前关联持仓成本兜底展示
              rate = (earnings / fallbackPrincipalCurrent) * 100;
            }
            return { date, earnings, rate, baseCostAmount };
          });
      }
    }

    return out;
  }, [fundDailyEarnings, activeGroupId, currentTab, summaryHoldingSourceGroupByCode, linkedHoldingsForAllFav]);
  const portfolioDailySeries = useMemo(() => {
    if (!isPlainObject(fundDailyEarnings)) return [];
    const byDate = new Map();
    Object.values(fundDailyEarnings).forEach((bucket) => {
      if (!isPlainObject(bucket)) return;
      Object.values(bucket).forEach((list) => {
        if (!isArray(list) || list.length === 0) return;
        list.forEach((item) => {
          const date = item?.date ? String(item.date) : '';
          const earnings = Number(item?.earnings);
          const baseCostAmount = Number(item?.baseCostAmount);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
          if (!Number.isFinite(earnings)) return;

          const prev = byDate.get(date) || { earnings: 0, baseCostAmount: 0 };
          prev.earnings += earnings;
          if (Number.isFinite(baseCostAmount) && baseCostAmount > 0) {
            prev.baseCostAmount += baseCostAmount;
          }
          byDate.set(date, prev);
        });
      });
    });
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        earnings: data.earnings,
        baseCostAmount: data.baseCostAmount > 0 ? data.baseCostAmount : null,
        rate: null
      }));
  }, [fundDailyEarnings]);

  const holdingsForTabWithLinked = useMemo(() => {
    if (currentTab === SUMMARY_TAB_ID) return summaryMergedHoldings;
    if (activeGroupId) return groupHoldings[activeGroupId] || {};
    if (currentTab !== 'all' && currentTab !== 'fav') return holdings;
    const derived = linkedHoldingsForAllFav.derived || {};
    const keys = Object.keys(derived);
    if (keys.length === 0) return holdings;
    return { ...(holdings || {}), ...derived };
  }, [currentTab, activeGroupId, summaryMergedHoldings, holdings, groupHoldings, linkedHoldingsForAllFav]);

  const dcaPlansForTab = useMemo(() => {
    const scoped = migrateDcaPlansToScoped(dcaPlans);
    const bucket = scoped[activeGroupId || DCA_SCOPE_GLOBAL];
    return isPlainObject(bucket) ? bucket : {};
  }, [dcaPlans, activeGroupId]);

  // 全局及所有分组中存在开启定投计划的基金代码集合（用于关联持仓跨分组展示「定」标签）
  const allEnabledDcaCodes = useMemo(() => {
    const set = new Set();
    const scoped = migrateDcaPlansToScoped(dcaPlans);
    if (isPlainObject(scoped)) {
      Object.values(scoped).forEach((bucket) => {
        if (isPlainObject(bucket)) {
          Object.entries(bucket).forEach(([code, plan]) => {
            if (plan?.enabled === true) set.add(code);
          });
        }
      });
    }
    return set;
  }, [dcaPlans]);

  const transactionsForTab = useMemo(() => {
    if (!activeGroupId) return transactions;
    const out = {};
    Object.entries(transactions || {}).forEach(([code, list]) => {
      if (!isArray(list)) return;
      const filtered = list.filter((t) => t.groupId === activeGroupId);
      if (filtered.length) out[code] = filtered;
    });
    return out;
  }, [transactions, activeGroupId]);

  const groupById = useMemo(() => {
    const map = new Map();
    for (const g of groups || []) {
      if (!g?.id) continue;
      map.set(g.id, g);
    }
    return map;
  }, [groups]);

  const getScopedGroupId = (groupIdOverride) =>
    groupIdOverride !== undefined ? groupIdOverride : activeGroupId || null;

  const getScopedHolding = (code, groupIdOverride) => {
    if (!code) return undefined;
    if (groupIdOverride !== undefined) {
      return groupIdOverride ? groupHoldings?.[groupIdOverride]?.[code] : holdings?.[code];
    }
    if (activeGroupId) return groupHoldings?.[activeGroupId]?.[code];
    return holdingsForTabWithLinked?.[code];
  };

  const getScopedDcaPlan = (code, groupIdOverride) => {
    if (!code) return undefined;
    const scope = getScopedGroupId(groupIdOverride) || DCA_SCOPE_GLOBAL;
    const scoped = migrateDcaPlansToScoped(dcaPlans);
    return scoped?.[scope]?.[code];
  };

  const activeGroupCodeSet = useMemo(() => {
    if (currentTab === SUMMARY_TAB_ID) {
      const fundByCode = new Map((isArray(funds) ? funds : []).map((f) => [f.code, f]));
      const set = new Set();
      Object.entries(holdings || {}).forEach(([code, h]) => {
        const fund = fundByCode.get(code);
        if (!fund || !h) return;
        const p = getHoldingProfit(fund, h, null);
        if (p && Number.isFinite(p.amount) && p.amount > 0) set.add(code);
      });
      for (const g of groupsWithHoldings) {
        for (const c of g.codes || []) set.add(c);
      }
      return set;
    }
    if (currentTab === 'all' || currentTab === 'fav') return null;
    const group = groupById.get(currentTab);
    if (!group || !isArray(group.codes)) return null;
    return new Set(group.codes);
  }, [currentTab, groupById, groupsWithHoldings, funds, holdings, getHoldingProfit]);

  // 当前 tab 作用域下的基金（不包含“列表搜索”过滤）
  const scopedFunds = useMemo(() => {
    return funds.filter((f) => {
      if (currentTab === 'all') return true;
      if (currentTab === 'fav') return favorites.has(f.code);
      if (!activeGroupCodeSet) return true;
      return activeGroupCodeSet.has(f.code);
    });
  }, [funds, currentTab, favorites, activeGroupCodeSet]);

  const [fundExtraDataByCode, setFundExtraDataByCode] = useState({});
  const fundExtraDataCacheRef = useRef(new Map());

  useEffect(() => {
    // 始终尝试为当前列表基金获取额外数据（阶段涨跌幅、连涨连跌），用于展示图标或排序
    const codes = scopedFunds.map((f) => f.code);
    if (codes.length === 0) return;

    let cancelled = false;
    const missing = [];
    const cachedBatch = {};

    for (const code of codes) {
      if (!fundExtraDataCacheRef.current.has(code)) {
        missing.push(code);
      } else {
        cachedBatch[code] = fundExtraDataCacheRef.current.get(code);
      }
    }

    if (Object.keys(cachedBatch).length > 0) {
      setFundExtraDataByCode((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [code, value] of Object.entries(cachedBatch)) {
          if (next[code] !== value) {
            next[code] = value;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    if (missing.length === 0) return;

    (async () => {
      // 这里的 fetchFundPeriodReturns 已包含阶段涨跌幅和连涨连跌数据
      await asyncPool(4, missing, async (code) => {
        const value = await fetchFundPeriodReturns(code);
        fundExtraDataCacheRef.current.set(code, value);
        if (cancelled) return;
        setFundExtraDataByCode((prev) => {
          if (prev[code] === value) return prev;
          return { ...prev, [code]: value };
        });
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [scopedFunds]);

  // 过滤和排序后的基金列表（包含“列表搜索”过滤）
  const displayFundsRaw = useMemo(() => {
    let filtered = [...scopedFunds];

    const q = String(shouldShowGroupFundSearch ? (deferredGroupFundSearchTerm ?? '') : '').trim();
    if (q) {
      const qLower = q.toLowerCase();
      filtered = filtered.filter((f) => {
        const name = String(f?.name ?? '').toLowerCase();
        const code = String(f?.code ?? '').toLowerCase();
        let hasTagMatch = false;
        if (f?.code && Array.isArray(fundTagListsByCode?.[f.code])) {
          hasTagMatch = fundTagListsByCode[f.code].some(
            (t) => t?.name && String(t.name).toLowerCase().includes(qLower)
          );
        }
        return name.includes(qLower) || code.includes(qLower) || hasTagMatch;
      });
    }

    if (currentTab !== 'all' && currentTab !== 'fav' && currentTab !== SUMMARY_TAB_ID && sortBy === 'default') {
      const group = groups.find((g) => g.id === currentTab);
      if (group && group.codes) {
        const codeMap = new Map(group.codes.map((code, index) => [code, index]));
        filtered.sort((a, b) => {
          const indexA = codeMap.get(a.code) ?? Number.MAX_SAFE_INTEGER;
          const indexB = codeMap.get(b.code) ?? Number.MAX_SAFE_INTEGER;
          return indexA - indexB;
        });
      }
    }

    const profitByCode =
      sortBy === 'holdingAmount' || sortBy === 'holdingRatio' || sortBy === 'todayProfit' || sortBy === 'holding'
        ? new Map(filtered.map((f) => [f.code, getHoldingProfitForTab(f, holdingsForTabWithLinked[f.code])]))
        : null;

    const estimateProfitByCode =
      sortBy === 'estimateProfit'
        ? new Map(
            filtered.map((f) => {
              const hasTodayData = isNavUpdated(f.jzrq, todayStr, f.confirmDays);
              const holding = holdingsForTabWithLinked[f.code];
              const profit = getHoldingProfitForTab(f, holding);
              const total = profit ? profit.profitTotal : null;
              if (hasTodayData) return [f.code, total];

              const principal =
                holding && isNumber(holding.cost) && isNumber(holding.share) ? holding.cost * holding.share : 0;
              const hasTodayEstimate = !f.noValuation && isString(f.gztime) && f.gztime.startsWith(todayStr);
              const estimateChangeValue = f.noValuation ? null : isNumber(f.gszzl) ? Number(f.gszzl) : null;
              const holdingProfitPercentValue = total != null && principal > 0 ? (total / principal) * 100 : null;
              const hasEstimatePercent = hasTodayEstimate && estimateChangeValue != null;
              const hasHoldingPercent = holdingProfitPercentValue != null;
              const fallbackEstimateProfitPercentValue =
                hasEstimatePercent || hasHoldingPercent
                  ? (hasEstimatePercent ? estimateChangeValue : 0) + (hasHoldingPercent ? holdingProfitPercentValue : 0)
                  : null;

              const val =
                fallbackEstimateProfitPercentValue != null && principal > 0
                  ? principal * (fallbackEstimateProfitPercentValue / 100)
                  : null;
              return [f.code, val];
            })
          )
        : null;

    return filtered.sort((a, b) => {
      if (sortBy === 'yield') {
        const getYieldValue = (fund) => {
          // 与 estimateChangePercent 展示逻辑对齐：
          // - noValuation 为 true 一律视为无“估算涨幅”
          // - 仅在 gszzl 为数字时使用 gszzl
          if (fund.noValuation) {
            return { value: 0, hasValue: false };
          }
          if (isNumber(fund.gszzl)) {
            return { value: Number(fund.gszzl), hasValue: true };
          }
          return { value: 0, hasValue: false };
        };

        const { value: valA, hasValue: hasA } = getYieldValue(a);
        const { value: valB, hasValue: hasB } = getYieldValue(b);

        // 无“估算涨幅”展示值（界面为 `—`）的基金统一排在最后
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;

        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'holdingAmount') {
        const pa = profitByCode?.get(a.code);
        const pb = profitByCode?.get(b.code);
        const amountA = pa?.amount ?? Number.NEGATIVE_INFINITY;
        const amountB = pb?.amount ?? Number.NEGATIVE_INFINITY;
        return sortOrder === 'asc' ? amountA - amountB : amountB - amountA;
      }
      if (sortBy === 'holdingRatio') {
        const pa = profitByCode?.get(a.code);
        const pb = profitByCode?.get(b.code);
        const amountA = pa?.amount;
        const amountB = pb?.amount;
        const hasA = amountA != null && Number.isFinite(amountA) && amountA > 0;
        const hasB = amountB != null && Number.isFinite(amountB) && amountB > 0;
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        // holdingRatio sort is equivalent to holdingAmount sort (same denominator within group)
        return sortOrder === 'asc' ? amountA - amountB : amountB - amountA;
      }
      if (sortBy === 'yesterdayIncrease') {
        const valA = Number(a.zzl);
        const valB = Number(b.zzl);
        const hasA = Number.isFinite(valA);
        const hasB = Number.isFinite(valB);

        // 无最新涨幅数据（界面展示为 `—`）的基金统一排在最后
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;

        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'todayProfit') {
        const pa = profitByCode?.get(a.code);
        const pb = profitByCode?.get(b.code);
        const valA = pa?.profitToday;
        const valB = pb?.profitToday;
        const hasA = valA != null && Number.isFinite(valA);
        const hasB = valB != null && Number.isFinite(valB);

        // 无当日收益数据的基金统一排在最后
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;

        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'holding') {
        const pa = profitByCode?.get(a.code);
        const pb = profitByCode?.get(b.code);
        const valA = pa?.profitTotal;
        const valB = pb?.profitTotal;
        const hasA = valA != null && Number.isFinite(valA);
        const hasB = valB != null && Number.isFinite(valB);
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'estimateProfit') {
        const valA = estimateProfitByCode ? estimateProfitByCode.get(a.code) : null;
        const valB = estimateProfitByCode ? estimateProfitByCode.get(b.code) : null;
        const hasA = valA != null && Number.isFinite(valA);
        const hasB = valB != null && Number.isFinite(valB);
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'yesterdayProfit') {
        const getYesterdayProfit = (code, jzrq) => {
          const list = currentFundDailyEarnings?.[code];
          if (!isArray(list) || list.length === 0) return null;
          let matchedDaily = null;
          if (isString(jzrq)) {
            if (jzrq === todayStr) {
              for (let i = list.length - 1; i >= 0; i--) {
                if (list[i]?.date && list[i].date < todayStr) {
                  matchedDaily = list[i];
                  break;
                }
              }
            } else {
              for (const item of list) {
                if (item?.date === jzrq) {
                  matchedDaily = item;
                  break;
                }
              }
            }
          }
          if (!matchedDaily && jzrq !== todayStr) matchedDaily = list[list.length - 1];
          return matchedDaily && Number.isFinite(Number(matchedDaily.earnings)) ? Number(matchedDaily.earnings) : null;
        };
        const valA = getYesterdayProfit(a.code, a.jzrq);
        const valB = getYesterdayProfit(b.code, b.jzrq);
        const hasA = valA != null && Number.isFinite(valA);
        const hasB = valB != null && Number.isFinite(valB);
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'holdingDays') {
        const ha = holdingsForTabWithLinked[a.code];
        const hb = holdingsForTabWithLinked[b.code];
        const valA = ha?.firstPurchaseDate ? dayjs(todayStr).diff(dayjs(ha.firstPurchaseDate), 'day') : null;
        const valB = hb?.firstPurchaseDate ? dayjs(todayStr).diff(dayjs(hb.firstPurchaseDate), 'day') : null;
        const hasA = valA != null && Number.isFinite(valA);
        const hasB = valB != null && Number.isFinite(valB);
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'holdingCost') {
        const getCost = (h) =>
          h?.cost != null && h?.share != null && Number.isFinite(Number(h.cost)) && Number.isFinite(Number(h.share))
            ? Number(h.cost) * Number(h.share)
            : null;
        const valA = getCost(holdingsForTabWithLinked[a.code]);
        const valB = getCost(holdingsForTabWithLinked[b.code]);
        const hasA = valA != null && Number.isFinite(valA);
        const hasB = valB != null && Number.isFinite(valB);
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'sinceAddedChangePercent') {
        const getSinceAddedChangeValue = (f) => {
          const addBaseNavRaw = f.addBaseNav != null && f.addBaseNav !== '' ? Number(f.addBaseNav) : null;
          const addBaseNav =
            addBaseNavRaw != null && Number.isFinite(addBaseNavRaw) && addBaseNavRaw > 0 ? addBaseNavRaw : null;
          const sinceAddedCurrentNav = (() => {
            if (f.noValuation) {
              const v = Number(f.dwjz);
              return Number.isFinite(v) && v > 0 ? v : null;
            }
            const v = Number(f.gsz);
            return Number.isFinite(v) && v > 0 ? v : null;
          })();
          return addBaseNav != null && sinceAddedCurrentNav != null
            ? (sinceAddedCurrentNav / addBaseNav - 1) * 100
            : null;
        };
        const valA = getSinceAddedChangeValue(a);
        const valB = getSinceAddedChangeValue(b);
        const hasA = valA != null && Number.isFinite(valA);
        const hasB = valB != null && Number.isFinite(valB);
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'consecutiveTrend') {
        const getTrendValue = (code) => {
          const trend = fundExtraDataByCode[code]?.consecutiveTrend;
          if (!trend || !Number.isFinite(trend.days)) return 0;
          return trend.type === 'up' ? trend.days : -trend.days;
        };
        const valA = getTrendValue(a.code);
        const valB = getTrendValue(b.code);
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (['last1Week', 'last1Month', 'last3Months', 'last6Months', 'last1Year'].includes(sortBy)) {
        const keyMap = {
          last1Week: 'week',
          last1Month: 'month',
          last3Months: 'month3',
          last6Months: 'month6',
          last1Year: 'year1'
        };
        const key = keyMap[sortBy];
        const valA = fundExtraDataByCode[a.code]?.[key];
        const valB = fundExtraDataByCode[b.code]?.[key];
        const hasA = valA != null && Number.isFinite(valA);
        const hasB = valB != null && Number.isFinite(valB);
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (sortBy === 'tags') {
        const getTagKey = (fund) => {
          const code = String(fund?.code ?? '').trim();
          const list = code ? fundTagListsByCode?.[code] : null;
          if (!isArray(list) || list.length === 0) return '';
          return list
            .map((t) => (t?.name != null ? String(t.name).trim() : ''))
            .filter(Boolean)
            .join('、');
        };
        const keyA = getTagKey(a);
        const keyB = getTagKey(b);
        const hasA = !!keyA;
        const hasB = !!keyB;
        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;
        return sortOrder === 'asc' ? keyA.localeCompare(keyB, 'zh-CN') : keyB.localeCompare(keyA, 'zh-CN');
      }
      if (sortBy === 'name') {
        const nameA = a.name ?? '';
        const nameB = b.name ?? '';
        return sortOrder === 'asc' ? nameA.localeCompare(nameB, 'zh-CN') : nameB.localeCompare(nameA, 'zh-CN');
      }
      return 0;
    });
  }, [
    scopedFunds,
    currentTab,
    groups,
    sortBy,
    sortOrder,
    holdingsForTabWithLinked,
    getHoldingProfitForTab,
    deferredGroupFundSearchTerm,
    shouldShowGroupFundSearch,
    currentFundDailyEarnings,
    fundExtraDataByCode,
    todayStr,
    fundTagListsByCode
  ]);

  const displayFunds = useDeferredValue(displayFundsRaw);

  const latestDailyByCode = useMemo(() => {
    const out = {};
    if (!isPlainObject(currentFundDailyEarnings)) return out;
    for (const f of displayFunds) {
      const code = f?.code;
      if (!code) continue;
      const list = currentFundDailyEarnings[code];
      if (!isArray(list) || list.length === 0) continue;
      const byDate = new Map();
      for (const item of list) {
        const date = item?.date ? String(item.date) : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        byDate.set(date, item);
      }
      out[code] = { byDate, last: list[list.length - 1] };
    }
    return out;
  }, [currentFundDailyEarnings, displayFunds]);

  // 分组内所有基金持仓金额之和，用于持仓占比（PC 端表格 + FundCard 更多区域共用）
  const groupTotalHoldingAmount = useMemo(() => {
    let total = 0;
    for (const ff of displayFunds) {
      const h = holdingsForTabWithLinked[ff.code];
      const p = getHoldingProfitForTab(ff, h);
      if (p && p.amount != null && Number.isFinite(p.amount) && p.amount > 0) total += p.amount;
    }
    return total;
  }, [displayFunds, holdingsForTabWithLinked, getHoldingProfitForTab]);

  // 当前 tab 作用域下有待处理交易的基金代码集合
  const pendingCodesForTab = useMemo(() => {
    const set = new Set();
    for (const t of pendingTrades) {
      if (!t || !t.fundCode) continue;
      if (activeGroupId) {
        if (t.groupId === activeGroupId) set.add(t.fundCode);
      } else {
        set.add(t.fundCode);
      }
    }
    return set;
  }, [pendingTrades, activeGroupId]);

  // PC 端表格数据（用于 PcFundTable）
  const pcFundTableData = useMemo(() => {
    return displayFunds.map((f) => {
      const hasTodayData = isNavUpdated(f.jzrq, todayStr, f.confirmDays);
      const latestNav =
        f.dwjz != null && f.dwjz !== '' ? (isNumber(f.dwjz) ? Number(f.dwjz).toFixed(4) : String(f.dwjz)) : '—';
      const estimateNav = f.noValuation
        ? '—'
        : f.gsz != null
          ? isNumber(f.gsz)
            ? Number(f.gsz).toFixed(4)
            : String(f.gsz)
          : '—';

      const yesterdayChangePercent =
        f.zzl != null && f.zzl !== '' ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : '—';
      const yesterdayChangeValue = f.zzl != null && f.zzl !== '' ? Number(f.zzl) : null;
      const yesterdayDate = f.jzrq || '-';

      const estimateChangePercent = f.noValuation
        ? '—'
        : isNumber(f.gszzl)
          ? `${f.gszzl > 0 ? '+' : ''}${Number(f.gszzl).toFixed(2)}%`
          : (f.gszzl ?? '—');
      const estimateChangeValue = f.noValuation ? null : isNumber(f.gszzl) ? Number(f.gszzl) : null;
      const estimateTime = f.noValuation ? f.jzrq || '-' : f.gztime || f.time || '-';
      const hasTodayEstimate = !f.noValuation && isString(f.gztime) && f.gztime.startsWith(todayStr);

      const holding = holdingsForTabWithLinked[f.code];
      const isHoldingLinked =
        (currentTab === 'all' || currentTab === 'fav') && linkedHoldingsForAllFav.linked?.has?.(f.code);
      const profit = getHoldingProfitForTab(f, holding);
      const amount = profit ? profit.amount : null;
      const holdingAmount = amount == null ? '未设置' : `¥${formatMoney(amount)}`;
      const holdingAmountValue = amount;
      const holdingRatioValue =
        amount != null && Number.isFinite(amount) && amount > 0 && groupTotalHoldingAmount > 0
          ? amount / groupTotalHoldingAmount
          : null;
      const holdingDaysValue = holding?.firstPurchaseDate
        ? dayjs.tz(todayStr, TZ).diff(dayjs.tz(holding.firstPurchaseDate, TZ), 'day')
        : null;

      const profitToday = profit ? profit.profitToday : null;
      const todayProfit =
        profitToday == null
          ? ''
          : `${profitToday > 0 ? '+' : profitToday < 0 ? '-' : ''}${formatMoney(Math.abs(profitToday))}`;
      const todayProfitValue = profitToday;

      const total = profit ? profit.profitTotal : null;
      const principal = holding && isNumber(holding.cost) && isNumber(holding.share) ? holding.cost * holding.share : 0;
      const holdingCostValue =
        holding && isNumber(holding.cost) && isNumber(holding.share) ? holding.cost * holding.share : null;
      const holdingCost = holdingCostValue == null ? '-' : formatMoney(holdingCostValue);
      const costNavValue = holding && isNumber(holding.cost) ? holding.cost : null;
      const costNav = costNavValue == null ? '—' : Number(costNavValue).toFixed(4);
      const todayProfitPercent =
        profitToday != null && profit?.principalToday > 0
          ? `${profitToday > 0 ? '+' : profitToday < 0 ? '-' : ''}${Math.abs((profitToday / profit.principalToday) * 100).toFixed(2)}%`
          : '';

      const latestNavDateStr = isString(f.jzrq) ? f.jzrq : '';
      const dailyMeta = latestDailyByCode?.[f.code];
      const dailyList = currentFundDailyEarnings?.[f.code];

      // 解析昨日收益对应的记录（避免当晚更新今日净值后，“昨日收益”显示成“今日收益”）
      let yesterdayMatchedDaily = null;
      if (isArray(dailyList) && dailyList.length > 0) {
        if (latestNavDateStr === todayStr) {
          // 如果最新净值日期已更新为今天，昨日收益取今天之前的最后一个记录
          for (let i = dailyList.length - 1; i >= 0; i--) {
            if (dailyList[i]?.date && dailyList[i].date < todayStr) {
              yesterdayMatchedDaily = dailyList[i];
              break;
            }
          }
        } else {
          // 否则取最新净值日期对应的记录或最后一个记录
          yesterdayMatchedDaily =
            (latestNavDateStr ? dailyMeta?.byDate?.get(latestNavDateStr) || null : null) || dailyMeta?.last || null;
        }
      }

      const yesterdayProfitVal =
        yesterdayMatchedDaily && Number.isFinite(Number(yesterdayMatchedDaily.earnings))
          ? Number(yesterdayMatchedDaily.earnings)
          : null;
      const yesterdayProfit =
        yesterdayProfitVal == null
          ? ''
          : `${yesterdayProfitVal > 0 ? '+' : yesterdayProfitVal < 0 ? '-' : ''}${formatMoney(Math.abs(yesterdayProfitVal))}`;
      const dailyBaseCostAmount =
        yesterdayMatchedDaily &&
        yesterdayMatchedDaily.baseCostAmount != null &&
        yesterdayMatchedDaily.baseCostAmount !== '' &&
        Number.isFinite(Number(yesterdayMatchedDaily.baseCostAmount))
          ? Number(yesterdayMatchedDaily.baseCostAmount)
          : null;
      const derivedRateFromSnapshot =
        yesterdayProfitVal != null && dailyBaseCostAmount != null && dailyBaseCostAmount > 0
          ? (yesterdayProfitVal / dailyBaseCostAmount) * 100
          : null;
      const dailyRate =
        yesterdayMatchedDaily &&
        yesterdayMatchedDaily.rate != null &&
        yesterdayMatchedDaily.rate !== '' &&
        Number.isFinite(Number(yesterdayMatchedDaily.rate))
          ? Number(yesterdayMatchedDaily.rate)
          : derivedRateFromSnapshot;
      const yesterdayProfitPercentLine =
        dailyRate != null
          ? `${dailyRate > 0 ? '+' : dailyRate < 0 ? '-' : ''}${Math.abs(dailyRate).toFixed(2)}%`
          : yesterdayProfitVal != null && principal > 0
            ? `${yesterdayProfitVal > 0 ? '+' : yesterdayProfitVal < 0 ? '-' : ''}${Math.abs((yesterdayProfitVal / principal) * 100).toFixed(2)}%`
            : '';
      const yesterdaySecondLinePctValue =
        dailyRate != null
          ? dailyRate
          : yesterdayProfitVal != null && principal > 0
            ? (yesterdayProfitVal / principal) * 100
            : null;

      const holdingProfit =
        total == null ? '' : `${total > 0 ? '+' : total < 0 ? '-' : ''}${formatMoney(Math.abs(total))}`;
      const holdingProfitPercent =
        total != null && principal > 0
          ? `${total > 0 ? '+' : total < 0 ? '-' : ''}${Math.abs((total / principal) * 100).toFixed(2)}%`
          : '';
      const holdingProfitValue = total;

      const holdingProfitPercentValue = total != null && principal > 0 ? (total / principal) * 100 : null;
      const hasEstimatePercent = hasTodayEstimate && estimateChangeValue != null;
      const hasHoldingPercent = holdingProfitPercentValue != null;
      const fallbackEstimateProfitPercentValue =
        hasEstimatePercent || hasHoldingPercent
          ? (hasEstimatePercent ? estimateChangeValue : 0) + (hasHoldingPercent ? holdingProfitPercentValue : 0)
          : null;
      const estimateProfitPercentValue = hasTodayData ? holdingProfitPercentValue : fallbackEstimateProfitPercentValue;
      const estimateProfitValue = hasTodayData
        ? total
        : estimateProfitPercentValue != null && principal > 0
          ? principal * (estimateProfitPercentValue / 100)
          : null;
      const estimateProfit =
        estimateProfitValue == null
          ? ''
          : `${estimateProfitValue > 0 ? '+' : estimateProfitValue < 0 ? '-' : ''}${formatMoney(Math.abs(estimateProfitValue))}`;
      const estimateProfitPercent =
        estimateProfitPercentValue == null
          ? ''
          : `${estimateProfitPercentValue > 0 ? '+' : ''}${estimateProfitPercentValue.toFixed(2)}%`;

      const addBaseNavRaw = f.addBaseNav != null && f.addBaseNav !== '' ? Number(f.addBaseNav) : null;
      const addBaseNav =
        addBaseNavRaw != null && Number.isFinite(addBaseNavRaw) && addBaseNavRaw > 0 ? addBaseNavRaw : null;
      const sinceAddedCurrentNav = (() => {
        if (f.noValuation) {
          const v = Number(f.dwjz);
          return Number.isFinite(v) && v > 0 ? v : null;
        }
        const v = Number(f.gsz);
        return Number.isFinite(v) && v > 0 ? v : null;
      })();
      const sinceAddedChangeValue =
        addBaseNav != null && sinceAddedCurrentNav != null ? (sinceAddedCurrentNav / addBaseNav - 1) * 100 : null;
      const sinceAddedChangePercent =
        sinceAddedChangeValue == null
          ? '—'
          : `${sinceAddedChangeValue > 0 ? '+' : ''}${sinceAddedChangeValue.toFixed(2)}%`;
      const sinceAddedDateRaw = (() => {
        const raw = f.addBaseDate;
        const rawStr = raw != null ? String(raw) : '';
        if (/^\d{4}-\d{2}-\d{2}/.test(rawStr)) return rawStr.slice(0, 10);
        const ts = Number(f.addedAt);
        if (Number.isFinite(ts) && ts > 0) return dayjs.tz(ts, TZ).format('YYYY-MM-DD');
        return '';
      })();
      const sinceAddedDate = (() => {
        const raw = sinceAddedDateRaw || '';
        if (!raw) return '';
        const currentYear = isString(todayStr) && todayStr.length >= 4 ? todayStr.slice(0, 4) : '';
        if (currentYear && raw.startsWith(`${currentYear}-`) && raw.length >= 10) return raw.slice(5);
        return raw;
      })();

      const fc = String(f.code ?? '').trim();
      const listFromDerived = fundTagListsByCode[fc];
      const fundTags = isArray(listFromDerived)
        ? listFromDerived.map(({ name, theme }) => ({
            name: String(name ?? '').trim(),
            theme: normalizeFundTagTheme(theme)
          }))
        : [];

      return {
        rawFund: f,
        code: f.code,
        fundName: f.name,
        fundTags,
        isHoldingLinked: !!isHoldingLinked,
        isUpdated: isNavUpdated(f.jzrq, todayStr, f.confirmDays),
        hasDca: isHoldingLinked ? allEnabledDcaCodes.has(f.code) : dcaPlansForTab[f.code]?.enabled === true,
        hasPending: pendingCodesForTab.has(f.code),
        latestNav,
        latestNavDate: yesterdayDate,
        estimateNav,
        estimateNavDate: estimateTime,
        yesterdayChangePercent,
        yesterdayChangeValue,
        yesterdayDate,
        estimateChangePercent,
        estimateChangeValue,
        estimateChangeMuted: f.noValuation,
        estimateTime,
        hasTodayEstimate,
        totalChangePercent: estimateProfitPercent,
        estimateProfit,
        estimateProfitValue,
        estimateProfitPercent,
        sinceAddedChangePercent,
        sinceAddedChangeValue,
        sinceAddedDate,
        sinceAddedDateRaw: sinceAddedDateRaw || undefined,
        holdingAmount,
        holdingAmountValue,
        holdingRatioValue,
        holdingCost,
        holdingCostValue,
        costNav,
        costNavValue,
        holdingDaysValue,
        todayProfit,
        todayProfitPercent,
        todayProfitValue,
        yesterdayProfit,
        yesterdayProfitValue: yesterdayProfitVal,
        yesterdayProfitPercent: yesterdayProfitPercentLine,
        yesterdaySecondLinePctValue,
        holdingProfit,
        holdingProfitPercent,
        holdingProfitValue,
        holdingTargetGroupId: currentTab === SUMMARY_TAB_ID ? summaryHoldingSourceGroupByCode[f.code] : undefined
      };
    });
  }, [
    displayFunds,
    holdingsForTabWithLinked,
    isTradingDay,
    todayStr,
    getHoldingProfitForTab,
    dcaPlansForTab,
    allEnabledDcaCodes,
    pendingCodesForTab,
    latestDailyByCode,
    currentTab,
    summaryHoldingSourceGroupByCode,
    linkedHoldingsForAllFav,
    fundTagListsByCode,
    groupTotalHoldingAmount
  ]);

  // 自动滚动选中 Tab 到可视区域
  useEffect(() => {
    if (!scrollAreaRef.current) return;
    if (currentTab === 'all' || currentTab === SUMMARY_TAB_ID) {
      scrollAreaRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const activeTab = tabsRef.current?.querySelector('.tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentTab]);

  // 鼠标拖拽滚动逻辑
  const dragStateRef = useRef({ isDragging: false, startX: 0, startY: 0, hasDragged: false });
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [hasTabOverflow, setHasTabOverflow] = useState(false);

  const handleSaveHolding = (code, data, groupIdOverride) => {
    const gid = getScopedGroupId(
      groupIdOverride !== undefined
        ? groupIdOverride
        : currentTab !== 'all' && currentTab !== 'fav' && groups.some((g) => g.id === currentTab)
          ? currentTab
          : null
    );
    if (!gid) {
      setHoldings((prev) => {
        const next = { ...prev };
        if (data.share === null && data.cost === null) {
          delete next[code];
        } else {
          next[code] = data;
        }
        return next;
      });
    } else {
      setGroupHoldings((prev) => {
        const next = { ...prev };
        const bucket = { ...(next[gid] || {}) };
        if (data.share === null && data.cost === null) {
          delete bucket[code];
        } else {
          bucket[code] = data;
        }
        next[gid] = bucket;
        return next;
      });
    }
    setHoldingModal({ open: false, fund: null });
  };

  const handleAction = (type, fund, groupIdOverride) => {
    const groupId = getScopedGroupId(groupIdOverride);
    if (type !== 'history') {
      setActionModal({ open: false, fund: null });
    }

    if (type === 'edit') {
      setHoldingModal({ open: true, fund, groupId });
    } else if (type === 'clear') {
      setClearConfirm({ fund, groupId });
    } else if (type === 'buy' || type === 'sell') {
      setTradeModal({ open: true, fund, type, groupId });
    } else if (type === 'history') {
      setHistoryModal({ open: true, fund, groupId });
    } else if (type === 'dca') {
      setDcaModal({ open: true, fund, groupId });
    } else if (type === 'convert') {
      setConvertModal({ open: true, fund, groupId });
    } else if (type === 'dividend') {
      setDividendMethodModal({ open: true, fund, groupId });
    }
  };

  const handleClearConfirm = () => {
    const clearConfirm = useModalStore.getState().clearConfirm;
    if (clearConfirm?.fund) {
      const code = clearConfirm.fund.code;
      const gid = getScopedGroupId(
        clearConfirm.groupId !== undefined
          ? clearConfirm.groupId
          : currentTab !== 'all' && currentTab !== 'fav' && groups.some((g) => g.id === currentTab)
            ? currentTab
            : null
      );
      if (!gid) {
        setHoldings((prev) => {
          const next = { ...prev };
          delete next[code];
          return next;
        });
      } else {
        setGroupHoldings((prev) => {
          const next = { ...prev };
          if (next[gid]) {
            const bucket = { ...next[gid] };
            delete bucket[code];
            next[gid] = bucket;
          }
          return next;
        });
      }

      setTransactions((prev) => {
        const next = { ...(prev || {}) };
        const list = next[code] || [];
        const filtered = list.filter((t) => {
          if (!gid) return t?.groupId;
          return t?.groupId !== gid;
        });
        if (filtered.length) next[code] = filtered;
        else delete next[code];
        return next;
      });

      setPendingTrades((prev) => {
        const next = prev.filter((trade) => {
          if (trade.fundCode !== code) return true;
          return gid ? trade.groupId !== gid : !trade.groupId;
        });
        return next;
      });

      const dcaScope = gid || DCA_SCOPE_GLOBAL;
      setDcaPlans((prev) => {
        const scoped = migrateDcaPlansToScoped(prev);
        if (!scoped[dcaScope]) return prev;
        const next = { ...scoped };
        const bucket = { ...next[dcaScope] };
        delete bucket[code];
        if (Object.keys(bucket).length === 0) {
          delete next[dcaScope];
        } else {
          next[dcaScope] = bucket;
        }
        return next;
      });

      try {
        const earningsScope = gid || DAILY_EARNINGS_SCOPE_ALL;
        setFundDailyEarnings((prev) => {
          if (!isPlainObject(prev) || !isPlainObject(prev[earningsScope]) || !(code in prev[earningsScope]))
            return prev;
          const next = { ...prev, [earningsScope]: { ...prev[earningsScope] } };
          delete next[earningsScope][code];
          return next;
        });
      } catch {}
    }
    setClearConfirm(null);
  };

  const processPendingQueue = async () => {
    if (isProcessingPendingRef.current) return;
    isProcessingPendingRef.current = true;
    try {
      const currentPending = normalizePendingTrades(useStorageStore.getState().pendingTrades);
      if (currentPending.length !== (useStorageStore.getState().pendingTrades || []).length) {
        storageStore.setItem('pendingTrades', JSON.stringify(currentPending));
      }
      if (currentPending.length === 0) return;

      let stateChanged = false;
      let tempHoldings = { ...useStorageStore.getState().holdings };
      let tempGroupHoldings;
      try {
        tempGroupHoldings = JSON.parse(JSON.stringify(useStorageStore.getState().groupHoldings || {}));
      } catch {
        tempGroupHoldings = { ...(useStorageStore.getState().groupHoldings || {}) };
      }
      const processedIds = new Set();
      const newTransactions = [];

      const handledIds = new Set();
      const readCurrent = (fundCode, tradeGid) => {
        if (!tradeGid) {
          return tempHoldings[fundCode] || { share: 0, cost: 0 };
        }
        if (!tempGroupHoldings[tradeGid]) tempGroupHoldings[tradeGid] = {};
        return tempGroupHoldings[tradeGid][fundCode] || { share: 0, cost: 0 };
      };

      const writeCurrent = (fundCode, tradeGid, share, cost, extra = {}) => {
        if (!tradeGid) {
          tempHoldings[fundCode] = { share, cost, ...extra };
        } else {
          if (!tempGroupHoldings[tradeGid]) tempGroupHoldings[tradeGid] = {};
          tempGroupHoldings[tradeGid][fundCode] = { share, cost, ...extra };
        }
      };

      for (const trade of currentPending) {
        if (trade?.id && handledIds.has(trade.id)) continue;
        if (trade?.id) handledIds.add(trade.id);

        const tradeGid = trade.groupId || null;
        let queryDate = trade.date;
        if (trade.isAfter3pm) {
          queryDate = toTz(trade.date).add(1, 'day').format('YYYY-MM-DD');
        }

        // 尝试获取智能净值
        const navOffsetDays = Number(trade.navOffsetDays);
        if (Number.isFinite(navOffsetDays) && navOffsetDays) {
          queryDate = toTz(queryDate).add(navOffsetDays, 'day').format('YYYY-MM-DD');
        }
        const result =
          trade.netValueSearch === 'backward'
            ? await fetchSmartFundNetValueBackward(trade.fundCode, queryDate)
            : await fetchSmartFundNetValue(trade.fundCode, queryDate);

        if (result && result.value > 0) {
          // 成功获取，执行交易
          const current = readCurrent(trade.fundCode, tradeGid);

          let newShare, newCost;
          let tradeShare = 0;
          let tradeAmount = 0;

          if (trade.type === 'buy') {
            const feeRate = trade.feeRate || 0;
            const netAmount = trade.amount / (1 + feeRate / 100);
            const share = netAmount / result.value;
            newShare = current.share + share;
            newCost = (current.cost * current.share + trade.amount) / newShare;

            tradeShare = share;
            tradeAmount = trade.amount;
          } else {
            const sellShare =
              trade.share != null && Number.isFinite(Number(trade.share)) && Number(trade.share) > 0
                ? Number(trade.share)
                : trade.amount != null && Number.isFinite(Number(trade.amount)) && Number(trade.amount) > 0
                  ? Number(trade.amount) / result.value
                  : 0;
            newShare = Math.max(0, current.share - sellShare);
            newCost = current.cost;
            if (newShare === 0) newCost = 0;

            tradeShare = sellShare;
            tradeAmount = sellShare * result.value;
          }

          writeCurrent(trade.fundCode, tradeGid, newShare, newCost, {
            ...(current.firstPurchaseDate ? { firstPurchaseDate: current.firstPurchaseDate } : {}),
            ...(trade.type === 'buy' && !current.firstPurchaseDate && result.date
              ? { firstPurchaseDate: result.date }
              : {})
          });
          stateChanged = true;
          processedIds.add(trade.id);

          // 记录交易历史
          newTransactions.push({
            id: trade.id,
            fundCode: trade.fundCode,
            type: trade.type,
            share: tradeShare,
            amount: tradeAmount,
            price: result.value,
            date: result.date, // 使用获取到净值的日期
            isAfter3pm: trade.isAfter3pm,
            isDca: !!trade.isDca,
            timestamp: Date.now(),
            ...(tradeGid ? { groupId: tradeGid } : {})
          });
        }
      }

      if (stateChanged) {
        // 构建最终的 transactions 状态
        const prevTransactions = useStorageStore.getState().transactions;
        const nextTransactions = { ...prevTransactions };
        newTransactions.forEach((tx) => {
          const current = nextTransactions[tx.fundCode] || [];
          // 避免重复添加 (虽然 id 应该唯一)
          if (!current.some((t) => t.id === tx.id)) {
            const row = {
              id: tx.id,
              type: tx.type,
              share: tx.share,
              amount: tx.amount,
              price: tx.price,
              date: tx.date,
              isAfter3pm: tx.isAfter3pm,
              isDca: tx.isDca,
              timestamp: tx.timestamp
            };
            if (tx.groupId) row.groupId = tx.groupId;
            nextTransactions[tx.fundCode] = [row, ...current].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          }
        });

        // 构建最终的 pendingTrades 状态
        const prevPending = normalizePendingTrades(useStorageStore.getState().pendingTrades);
        const nextPending = prevPending.filter((t) => !processedIds.has(t.id));

        // 通过 storageStore.setItem 更新（内部会同步更新 state + localStorage + 触发云端同步）
        // 由于在同一同步代码块中，React 18 会自动批量处理，只触发一次 re-render
        storageStore.setItem('holdings', JSON.stringify(tempHoldings));
        storageStore.setItem('groupHoldings', JSON.stringify(tempGroupHoldings));
        storageStore.setItem('pendingTrades', JSON.stringify(nextPending));
        storageStore.setItem('transactions', JSON.stringify(nextTransactions));

        showToast(`已处理 ${processedIds.size} 笔待定交易`, 'success');
      }
    } finally {
      isProcessingPendingRef.current = false;
    }
  };

  const handleDeleteTransaction = (fundCode, transactionId, groupIdOverride) => {
    setTransactions((prev) => {
      const current = prev[fundCode] || [];
      const gid = getScopedGroupId(groupIdOverride);
      const next = current.filter((t) => {
        if (t.id !== transactionId) return true;
        const inScope = !gid ? !t.groupId : t.groupId === gid;
        return !inScope;
      });
      const nextState = { ...prev, [fundCode]: next };
      return nextState;
    });
    showToast('交易记录已删除', 'success');
  };

  const handleMergeAllGroupTransactionsToCurrent = (fundCode, groupIdOverride) => {
    const targetGid = getScopedGroupId(groupIdOverride);
    if (!fundCode || !targetGid) return;

    // 复制“历史交易记录”到当前分组（不改变原记录）
    setTransactions((prev) => {
      const list = prev?.[fundCode] || [];
      if (!isArray(list) || list.length === 0) return prev;

      const existingCurrent = list.filter((t) => t && t.groupId === targetGid);
      const copiedKey = new Set(
        existingCurrent.filter((t) => t?.copiedFromId).map((t) => `${t.copiedFromId}|${t.copiedFromGroupId ?? ''}`)
      );

      const toCopy = list.filter((t) => {
        if (!t) return false;
        const fromGid = t.groupId ?? null;
        if (fromGid === targetGid) return false;
        const key = `${t.id}|${fromGid ?? ''}`;
        return !copiedKey.has(key);
      });

      if (toCopy.length === 0) return prev;

      const copied = toCopy.map((t) => ({
        ...t,
        id: uuidv4(),
        groupId: targetGid,
        copiedFromId: t.id,
        copiedFromGroupId: t.groupId ?? null
      }));

      const nextList = [...list, ...copied].sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
      const nextState = { ...prev, [fundCode]: nextList };
      return nextState;
    });

    // 复制“待处理队列”到当前分组（不改变原记录）
    setPendingTrades((prev) => {
      const list = isArray(prev) ? prev : [];
      const existingCurrent = list.filter((t) => t && t.fundCode === fundCode && t.groupId === targetGid);
      const copiedKey = new Set(
        existingCurrent.filter((t) => t?.copiedFromId).map((t) => `${t.copiedFromId}|${t.copiedFromGroupId ?? ''}`)
      );

      const toCopy = list.filter((t) => {
        if (!t || t.fundCode !== fundCode) return false;
        const fromGid = t.groupId ?? null;
        if (fromGid === targetGid) return false;
        const key = `${t.id}|${fromGid ?? ''}`;
        return !copiedKey.has(key);
      });

      if (toCopy.length === 0) return prev;

      const copied = toCopy.map((t) => ({
        ...t,
        id: uuidv4(),
        groupId: targetGid,
        copiedFromId: t.id,
        copiedFromGroupId: t.groupId ?? null
      }));

      const next = [...list, ...copied];
      return next;
    });

    showToast('已从全部分组复制该基金交易记录到当前分组', 'success');
  };

  const handleAddHistory = (data) => {
    const addHistoryModal = useModalStore.getState().addHistoryModal;
    const fundCode = data.fundCode;
    const historyGid = getScopedGroupId(addHistoryModal.groupId);
    // 添加历史记录仅作补录展示，不修改真实持仓金额与份额
    setTransactions((prev) => {
      const current = prev[fundCode] || [];
      const record = {
        id: uuidv4(),
        type: data.type,
        share: data.share,
        amount: data.amount,
        price: data.price,
        date: data.date,
        isAfter3pm: false, // 历史记录通常不需要此标记，或者默认为 false
        isDca: false,
        isHistoryOnly: true, // 仅记录，不参与持仓计算
        timestamp: data.timestamp || Date.now(),
        ...(historyGid ? { groupId: historyGid } : {})
      };
      // 按时间倒序排列
      const next = [record, ...current].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const nextState = { ...prev, [fundCode]: next };
      return nextState;
    });
    showToast('历史记录已添加', 'success');
    setAddHistoryModal({ open: false, fund: null });
  };

  const handleTrade = (fund, data) => {
    const tradeModal = useModalStore.getState().tradeModal;
    const tradeGid = getScopedGroupId(tradeModal.groupId);
    // 如果没有价格（API失败），加入待处理队列
    if (!data.price || data.price === 0) {
      const pending = {
        id: uuidv4(),
        fundCode: fund.code,
        fundName: fund.name,
        type: tradeModal.type,
        share: data.share,
        amount: data.totalCost,
        feeRate: tradeModal.type === 'buy' ? data.feeRate : 0, // Buy needs feeRate
        feeMode: data.feeMode,
        feeValue: data.feeValue,
        date: data.date,
        isAfter3pm: data.isAfter3pm,
        isDca: false,
        timestamp: Date.now(),
        ...(tradeGid ? { groupId: tradeGid } : {})
      };

      setPendingTrades((prev) => [...(prev || []), pending]);

      // 如果该基金没有持仓数据，初始化持仓金额为 0
      const tabH = tradeGid ? groupHoldings[tradeGid] || {} : holdings;
      if (!tabH[fund.code]) {
        handleSaveHolding(fund.code, { share: 0, cost: 0 }, tradeGid);
      }

      setTradeModal({ open: false, fund: null, type: 'buy' });
      showToast('净值暂未更新，已加入待处理队列', 'info');
      return;
    }

    const current = (tradeGid ? groupHoldings[tradeGid] || {} : holdings)[fund.code] || { share: 0, cost: 0 };
    const isBuy = tradeModal.type === 'buy';

    let newShare, newCost;

    if (isBuy) {
      newShare = current.share + data.share;

      // 如果传递了 totalCost（即买入总金额），则用它来计算新成本
      // 否则回退到用 share * price 计算（减仓或旧逻辑）
      const buyCost = data.totalCost !== undefined ? data.totalCost : data.price * data.share;

      // 加权平均成本 = (原持仓成本 * 原份额 + 本次买入总花费) / 新总份额
      // 注意：这里默认将手续费也计入成本（如果 totalCost 包含了手续费）
      newCost = (current.cost * current.share + buyCost) / newShare;
    } else {
      newShare = Math.max(0, current.share - data.share);
      // 减仓不改变单位成本，只减少份额
      newCost = current.cost;
      if (newShare === 0) newCost = 0;
    }

    handleSaveHolding(
      fund.code,
      {
        share: newShare,
        cost: newCost,
        ...(current.firstPurchaseDate ? { firstPurchaseDate: current.firstPurchaseDate } : {}),
        ...(isBuy && !current.firstPurchaseDate && data.date ? { firstPurchaseDate: data.date } : {})
      },
      tradeGid
    );

    setTransactions((prev) => {
      const curList = prev[fund.code] || [];
      const record = {
        id: uuidv4(),
        type: tradeModal.type,
        share: data.share,
        amount: isBuy ? data.totalCost : data.share * data.price,
        price: data.price,
        date: data.date,
        isAfter3pm: data.isAfter3pm,
        isDca: false,
        timestamp: Date.now(),
        ...(tradeGid ? { groupId: tradeGid } : {})
      };
      const next = [record, ...curList];
      const nextState = { ...prev, [fund.code]: next };
      return nextState;
    });

    setTradeModal({ open: false, fund: null, type: 'buy' });
  };

  const handleMouseDown = (e) => {
    if (!scrollAreaRef.current) return;
    dragStateRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, hasDragged: false };
  };

  const handleMouseLeaveOrUp = () => {
    dragStateRef.current.isDragging = false;
  };

  const handleMouseMove = (e) => {
    const ds = dragStateRef.current;
    if (!ds.isDragging || !scrollAreaRef.current) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.hasDragged && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    ds.hasDragged = true;
    e.preventDefault();
    scrollAreaRef.current.scrollLeft -= e.movementX;
  };

  const handleWheel = (e) => {
    if (!scrollAreaRef.current) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    scrollAreaRef.current.scrollLeft += delta;
  };

  const scrollTabsLeftBtn = () => {
    if (!scrollAreaRef.current) return;
    scrollAreaRef.current.scrollBy({ left: -200, behavior: 'smooth' });
  };

  const scrollTabsRightBtn = () => {
    if (!scrollAreaRef.current) return;
    scrollAreaRef.current.scrollBy({ left: 200, behavior: 'smooth' });
  };

  const scrollTabsToLeftEnd = () => {
    if (!scrollAreaRef.current) return;
    scrollAreaRef.current.scrollTo({ left: 0, behavior: 'smooth' });
  };

  const scrollTabsToRightEnd = () => {
    if (!scrollAreaRef.current) return;
    scrollAreaRef.current.scrollTo({ left: scrollAreaRef.current.scrollWidth, behavior: 'smooth' });
  };

  const handleTabClick = (tabId) => {
    if (dragStateRef.current.hasDragged) return;
    startTransition(() => setCurrentTab(tabId));
  };

  const updateTabOverflow = () => {
    const area = scrollAreaRef.current;
    if (!area) return;
    const overflowing = area.scrollWidth > area.clientWidth + 1;
    setHasTabOverflow(overflowing);
    setCanLeft(area.scrollLeft > 0);
    setCanRight(area.scrollLeft < area.scrollWidth - area.clientWidth - 1);
  };

  useEffect(() => {
    updateTabOverflow();
    let rafId = null;
    const onResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateTabOverflow();
      });
    };
    window.addEventListener('resize', onResize);

    // 额外监听 tabs 容器及内容的尺寸变化（如字体加载、动画结束等）
    let resizeObserver = null;
    let mutationObserver = null;
    const area = scrollAreaRef.current;

    if (area) {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(area);

      // 监听内部 DOM 的增删或 style 变化（framer-motion 动画会不断改变 style）
      mutationObserver = new MutationObserver(onResize);
      mutationObserver.observe(area, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }

    return () => {
      window.removeEventListener('resize', onResize);
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [groups, funds.length, favorites.size]);

  // 轻提示 (Toast)
  const showToast = (message, type = 'info') => {
    if (type === 'success') {
      sonnerToast.success(message);
    } else if (type === 'error') {
      sonnerToast.error(message);
    } else {
      sonnerToast.info(message);
    }
  };

  // 定投计划自动生成买入队列的逻辑会在 storageHelper 定义之后实现

  const handleOpenLogin = () => {
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }
    setLoginModalOpen(true);
  };

  const {
    setScanConfirmModalOpen,
    scannedFunds,
    setScannedFunds,
    selectedScannedCodes,
    setSelectedScannedCodes,
    isScanning,
    scanImportProgress,
    scanProgress,
    isOcrScan,
    setIsOcrScan,
    fileInputRef,
    handleScanClick,
    handleScanPick,
    handleRetryOcr,
    cancelScan,
    handleFilesUpload,
    handleFilesDrop,
    toggleScannedCode,
    editScannedFundCode,
    confirmScanImport
  } = useScanImport({
    setCurrentTab,
    setValuationSeries,
    showToast,
    normalizeCode,
    dedupeByCode,
    setFundTagRecords
  });

  const refreshAllRef = useRef(null);
  const {
    isSyncing,
    lastSyncTime,
    syncUserConfig,
    fetchCloudConfig,
    applyCloudConfig,
    handleSyncLocalConfig,
    triggerCustomSettingsSync,
    skipSyncRef,
    deviceConflictModalOpenRef,
    storageHelper
  } = useSyncManager({
    showToast,
    refreshAllRef,
    setTempSeconds,
    setFundTagRecords
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openFundTagsEdit = useCallback(
    (row) => {
      if (!row?.code) return;
      const raw = row.rawFund;
      const fc = String(row.code).trim();
      const tags = (fundTagRecords || [])
        .filter((r) => getFundCodesFromTagRecord(r).includes(fc))
        .map((r) => ({
          id: String(r.id ?? '').trim() || uuidv4(),
          name: String(r.name ?? '').trim(),
          theme: String(r.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME
        }))
        .filter((x) => x.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      setFundTagsEdit({
        open: true,
        code: row.code,
        name: row.fundName || raw?.name || '',
        tags
      });
    },
    [fundTagRecords]
  );

  const toggleValuationTrendCollapse = useCallback(
    (code) => {
      setCollapsedValuationTrends((prev) => {
        const next = new Set(prev);
        if (next.has(code)) {
          next.delete(code);
        } else {
          next.add(code);
        }
        return next;
      });
    },
    [setCollapsedValuationTrends]
  );

  const handleSaveFundTags = useCallback(
    (code, tagRows) => {
      if (!code) return;
      const fc = String(code).trim();
      const rows = isArray(tagRows) ? tagRows : [];
      const normalized = normalizeFundTagInstanceListFromInput(rows);

      setFundTagRecords((prev) => {
        const selectedById = new Map(normalized.map((x) => [String(x.id).trim(), x]).filter(([id]) => id));

        const byId = new Map();
        for (const r of prev) {
          const id = String(r?.id ?? '').trim();
          if (!id) continue;
          byId.set(id, r);
        }

        for (const [id, row] of [...byId.entries()]) {
          const nm = String(row.name ?? '').trim();
          if (!nm) {
            byId.delete(id);
            continue;
          }
          const meta = selectedById.get(id);
          if (meta) {
            let codes = getFundCodesFromTagRecord(row);
            if (!codes.includes(fc)) codes = [...codes, fc].sort();
            const nextRow = sanitizeTagRowForStorage({
              ...row,
              id,
              name: meta.name,
              theme: meta.theme,
              fundCodes: codes
            });
            if (nextRow) byId.set(id, nextRow);
          } else {
            const codes = getFundCodesFromTagRecord(row).filter((c) => c !== fc);
            const nextRow = sanitizeTagRowForStorage({
              ...row,
              fundCodes: codes
            });
            if (nextRow) byId.set(id, nextRow);
          }
        }

        for (const [id, meta] of selectedById) {
          if (byId.has(id)) continue;
          const row = sanitizeTagRowForStorage({
            id,
            name: meta.name,
            theme: meta.theme,
            fundCodes: [fc]
          });
          if (row) byId.set(id, row);
        }

        const next = Array.from(byId.values())
          .map(sanitizeTagRowForStorage)
          .filter(Boolean)
          .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        storageHelper.setItem('tags', JSON.stringify(next));
        return next;
      });
    },
    [storageHelper]
  );

  /** 仅写入可选池：每次新增一条独立记录（允许可选池内重名），不改变已有 fundCodes */
  const handleAddPoolTag = useCallback(
    (payload) => {
      const th = String(payload?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME;
      const rawNames =
        isArray(payload?.names) && payload.names.length
          ? payload.names
          : payload?.name != null && String(payload.name).trim()
            ? [String(payload.name).trim()]
            : [];
      if (!rawNames.length) return;

      setFundTagRecords((prev) => {
        const next = [...prev];
        for (const nm of rawNames) {
          const name = String(nm ?? '').trim();
          if (!name) continue;
          const row = sanitizeTagRowForStorage({
            id: uuidv4(),
            name,
            theme: th,
            fundCodes: []
          });
          if (row) next.push(row);
        }
        storageHelper.setItem('tags', JSON.stringify(next));
        return next;
      });
    },
    [storageHelper]
  );

  /** 从全局 tags 存储中按 id 移除该条标签记录，并清理各基金已选列表中的同 id 引用 */
  const handleDeleteGlobalTag = useCallback(
    (tagId) => {
      const id = String(tagId ?? '').trim();
      if (!id) return;
      setFundTagRecords((prev) => {
        const next = prev.filter((r) => String(r.id).trim() !== id);
        storageHelper.setItem('tags', JSON.stringify(next));
        return next;
      });
    },
    [storageHelper]
  );

  /** 更新全局标签（如名称、主题），影响所有使用该标签的基金 */
  const handleUpdateGlobalTag = useCallback(
    (tagId, payload) => {
      const id = String(tagId ?? '').trim();
      const name = String(payload?.name ?? '').trim();
      const theme = String(payload?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME;
      if (!id || !name) return;

      setFundTagRecords((prev) => {
        const next = prev.map((r) => {
          if (String(r.id).trim() === id) {
            return sanitizeTagRowForStorage({
              ...r,
              name,
              theme
            });
          }
          return r;
        });
        storageHelper.setItem('tags', JSON.stringify(next));
        return next;
      });
    },
    [storageHelper]
  );

  /** 删除前展示：该标签关联的基金文案列表（按标签 id） */
  const getTagUsageLabels = useCallback(
    (tagId) => {
      const id = String(tagId ?? '').trim();
      const row = fundTagRecords.find((r) => String(r.id).trim() === id);
      if (!row) return [];
      const codes = getFundCodesFromTagRecord(row);
      return codes.map((c) => {
        const f = funds.find((x) => String(x.code) === String(c));
        const namePart = f?.name ? String(f.name) : '';
        return namePart ? `${namePart}（${c}）` : String(c);
      });
    },
    [fundTagRecords, funds]
  );

  // 当全局标签变化且标签编辑弹框处于打开状态时，触发弹框层的重新渲染，以便底部可选标签池能立即展示最新内容
  useEffect(() => {
    const ms = useModalStore.getState();
    if (ms.fundTagsEdit?.open) {
      useModalStore.setState({ fundTagsEdit: { ...ms.fundTagsEdit, _tick: Date.now() } });
    }
  }, [fundTagRecords]);

  const applyViewMode = useCallback(
    (mode) => {
      if (mode !== 'card' && mode !== 'list') return;
      if (mode !== viewMode) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setViewMode(mode);
      storageHelper.setItem('viewMode', mode);
    },
    [storageHelper, viewMode]
  );

  const toggleFavorite = useCallback(
    (code) => {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(code)) {
          next.delete(code);
        } else {
          next.add(code);
        }
        if (next.size === 0) setCurrentTab('all');
        return next;
      });
    },
    [storageHelper]
  );

  const toggleCollapse = useCallback(
    (code) => {
      setCollapsedCodes((prev) => {
        const next = new Set(prev);
        if (next.has(code)) {
          next.delete(code);
        } else {
          next.add(code);
        }
        return next;
      });
    },
    [setCollapsedCodes]
  );

  const toggleTrendCollapse = useCallback(
    (code) => {
      setCollapsedTrends((prev) => {
        const next = new Set(prev);
        if (next.has(code)) {
          next.delete(code);
        } else {
          next.add(code);
        }
        return next;
      });
    },
    [setCollapsedTrends]
  );

  const toggleEarningsCollapse = useCallback(
    (code) => {
      setCollapsedEarnings((prev) => {
        const next = new Set(prev);
        if (next.has(code)) {
          next.delete(code);
        } else {
          next.add(code);
        }
        return next;
      });
    },
    [setCollapsedEarnings]
  );

  const scheduleDcaTrades = useCallback(async () => {
    if (!isTradingDay) return;
    const storeState = useStorageStore.getState();
    const currentDcaPlans = storeState.dcaPlans;
    if (!isPlainObject(currentDcaPlans)) return;
    const currentFunds = storeState.funds;
    const codesSet = new Set(currentFunds.map((f) => f.code));
    if (codesSet.size === 0) return;

    if (isSchedulingDcaRef.current) return;
    isSchedulingDcaRef.current = true;

    try {
      const scoped = migrateDcaPlansToScoped(currentDcaPlans);
      const groupIdSet = new Set(storeState.groups.map((g) => g?.id).filter(Boolean));

      const todayStrDynamic = formatDate();
      const today = toTz(todayStrDynamic).startOf('day');
      let nextPlans;
      try {
        nextPlans = JSON.parse(JSON.stringify(scoped));
      } catch {
        nextPlans = { ...scoped };
      }
      const newPending = [];

      const years = new Set([today.year(), today.year() + 1]);
      Object.values(scoped).forEach((bucket) => {
        if (!isPlainObject(bucket)) return;
        Object.values(bucket).forEach((plan) => {
          if (plan?.firstDate) years.add(toTz(plan.firstDate).year());
          if (plan?.lastDate) years.add(toTz(plan.lastDate).year());
        });
      });
      await loadHolidaysForYears([...years]);

      const processBucket = (scopeKey, bucket) => {
        if (!isPlainObject(bucket)) return;
        const tradeGid = scopeKey === DCA_SCOPE_GLOBAL ? null : scopeKey;
        if (tradeGid && !groupIdSet.has(tradeGid)) return;

        Object.entries(bucket).forEach(([code, plan]) => {
          if (!plan || !plan.enabled) return;
          if (!codesSet.has(code)) return;

          const amount = Number(plan.amount);
          const feeRate = Number(plan.feeRate) || 0;
          if (!amount || amount <= 0) return;

          const cycle = plan.cycle || 'monthly';
          if (!plan.firstDate) return;

          const first = toTz(plan.firstDate).startOf('day');
          if (today.isBefore(first, 'day')) return;

          const last = plan.lastDate ? toTz(plan.lastDate).startOf('day') : null;

          let current = last ? last.clone() : first.clone();
          let lastGenerated = null;

          const stepOnce = () => {
            if (cycle === 'daily') return current.add(1, 'day');
            if (cycle === 'weekly') return current.add(1, 'week');
            if (cycle === 'biweekly') return current.add(2, 'week');
            if (cycle === 'monthly') return current.add(1, 'month');
            return current.add(1, 'day');
          };

          if (last) {
            current = stepOnce();
          }

          while (true) {
            if (current.isAfter(today, 'day')) break;

            if (!current.isBefore(first, 'day')) {
              // 非交易日顺延至下一个交易日
              let tradeDate = current.clone();
              let maxAttempts = 30;
              while (!isDateTradingDay(tradeDate) && maxAttempts-- > 0) {
                tradeDate = tradeDate.add(1, 'day');
              }
              if (!isDateTradingDay(tradeDate) || tradeDate.isAfter(today, 'day')) {
                current = stepOnce();
                continue;
              }

              const dateStr = tradeDate.format('YYYY-MM-DD');

              const pending = {
                id: `dca_${scopeKey}_${code}_${dateStr}`,
                fundCode: code,
                fundName: (currentFunds.find((f) => f.code === code) || {}).name,
                type: 'buy',
                share: null,
                amount,
                feeRate,
                feeMode: undefined,
                feeValue: undefined,
                date: dateStr,
                isAfter3pm: false,
                isDca: true,
                timestamp: Date.now(),
                ...(tradeGid ? { groupId: tradeGid } : {})
              };
              newPending.push(pending);
              lastGenerated = tradeDate;
            }
            current = stepOnce();
          }

          if (lastGenerated) {
            if (!nextPlans[scopeKey]) nextPlans[scopeKey] = {};
            nextPlans[scopeKey][code] = {
              ...plan,
              lastDate: lastGenerated.format('YYYY-MM-DD')
            };
          }
        });
      };

      processBucket(DCA_SCOPE_GLOBAL, scoped[DCA_SCOPE_GLOBAL]);
      Object.keys(scoped).forEach((k) => {
        if (k === DCA_SCOPE_GLOBAL) return;
        processBucket(k, scoped[k]);
      });

      if (newPending.length === 0) {
        if (JSON.stringify(nextPlans) !== JSON.stringify(scoped)) {
          setDcaPlans(nextPlans);
        }
        return;
      }

      // 计算去重后的新 pending 列表
      const prevPending = normalizePendingTrades(useStorageStore.getState().pendingTrades);
      const existingIds = new Set(prevPending.map((t) => t.id));
      const unique = newPending.filter((t) => !existingIds.has(t.id));

      // 批量更新 dcaPlans 和 pendingTrades
      // 通过 storageStore.setItem 更新（内部会同步更新 state + localStorage + 触发云端同步）
      // 由于在同一同步代码块中，React 18 会自动批量处理，只触发一次 re-render
      const nextPending = normalizePendingTrades(unique.length > 0 ? [...prevPending, ...unique] : prevPending);
      storageStore.setItem('dcaPlans', JSON.stringify(nextPlans));
      storageStore.setItem('pendingTrades', JSON.stringify(nextPending));

      if (unique.length > 0) {
        showToast(`已生成 ${unique.length} 笔定投买入`, 'success');
      }
    } finally {
      isSchedulingDcaRef.current = false;
    }
  }, [isTradingDay, setDcaPlans]);

  const { refreshing, refreshCycleStartRef, manualRefresh, refreshAll } = useRefreshManager({
    scheduleDcaTrades,
    processPendingQueue,
    deviceConflictModalOpenRef
  });
  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  const {
    handleAddGroup,
    handleUpdateGroups,
    handleAddFundsToGroup,
    stripFundFromGroupScope,
    stripManyFundsFromGroupScope
  } = useGroupActions({ currentTab, setCurrentTab });

  const handleReorder = (oldIndex, newIndex) => {
    const movedItem = displayFunds[oldIndex];
    const targetItem = displayFunds[newIndex];
    if (!movedItem || !targetItem) return;

    if (currentTab === 'all' || currentTab === 'fav') {
      const newFunds = [...funds];
      const fromIndex = newFunds.findIndex((f) => f.code === movedItem.code);

      if (fromIndex === -1) return;

      // Remove moved item
      const [removed] = newFunds.splice(fromIndex, 1);

      // Find target index in the array (after removal)
      const toIndex = newFunds.findIndex((f) => f.code === targetItem.code);

      if (toIndex === -1) {
        // If target not found (should not happen), put it back
        newFunds.splice(fromIndex, 0, removed);
        return;
      }

      if (oldIndex < newIndex) {
        // Moving down, insert after target
        newFunds.splice(toIndex + 1, 0, removed);
      } else {
        // Moving up, insert before target
        newFunds.splice(toIndex, 0, removed);
      }

      setFunds(newFunds);
    } else {
      const groupIndex = groups.findIndex((g) => g.id === currentTab);
      if (groupIndex > -1) {
        const group = groups[groupIndex];
        const newCodes = [...group.codes];
        const fromIndex = newCodes.indexOf(movedItem.code);
        const toIndex = newCodes.indexOf(targetItem.code);

        if (fromIndex !== -1 && toIndex !== -1) {
          newCodes.splice(fromIndex, 1);
          newCodes.splice(toIndex, 0, movedItem.code);

          const newGroups = [...groups];
          newGroups[groupIndex] = { ...group, codes: newCodes };
          setGroups(newGroups);
        }
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      initFunds();
      initGroups();
      initFavorites();
      initCollapsed();
      initRefreshMs();
      initHoldings();
      initGroupHoldings();
      initPendingTrades();
      initTransactions();
      initDcaPlans();
      initCustomSettings();
      initFundDailyEarnings();
      initFundDividends();
      initSort();
      try {
        // 已登录用户：不在此处调用 refreshAll，等 fetchCloudConfig 完成后由 applyCloudConfig 统一刷新
        let shouldRefreshFromLocal = true;
        if (isSupabaseConfigured) {
          const { data, error } = await supabase.auth.getSession();
          if (!cancelled && !error && data?.session?.user) {
            shouldRefreshFromLocal = false;
          }
        }
        if (cancelled) return;

        const saved = storageStore.getItem('funds', []);
        if (isArray(saved) && saved.length) {
          const deduped = dedupeByCode(saved);
          const fundCodeSet = new Set(deduped.map((f) => f?.code).filter(Boolean));
          let storedTagRows = [];
          try {
            storedTagRows = storageStore.getItem('tags', []);
          } catch {
            /* empty */
          }
          if (!isArray(storedTagRows)) storedTagRows = [];
          const normalizedTags = storedTagRows
            .map((r) => {
              const codes = getFundCodesFromTagRecord(r).filter((c) => fundCodeSet.has(c));
              return {
                id: String(r.id || '').trim() || uuidv4(),
                name: String(r.name || '').trim(),
                theme: String(r.theme || '').trim() || DEFAULT_FUND_TAG_THEME,
                fundCodes: codes.sort()
              };
            })
            .filter((r) => r.name);
          const cleanedFunds = deduped.map(stripLegacyTagsFromFundObject);
          setFundTagRecords(normalizedTags);
          const codes = Array.from(new Set(cleanedFunds.map((f) => f.code)));
          if (codes.length && shouldRefreshFromLocal) refreshAll(codes);
        } else {
          try {
            const t = storageStore.getItem('tags', []);
            const arr = isArray(t) ? t : [];
            const normalized = arr
              .map((r) => {
                const codes = getFundCodesFromTagRecord(r);
                const name = String(r.name || '').trim();
                if (!name) return null;
                return {
                  id: String(r.id || '').trim() || uuidv4(),
                  name,
                  theme: String(r.theme || '').trim() || DEFAULT_FUND_TAG_THEME,
                  fundCodes: codes.sort()
                };
              })
              .filter(Boolean);
            setFundTagRecords(normalized);
          } catch {
            setFundTagRecords([]);
          }
        }
        setTempSeconds(Math.round(useStorageStore.getState().refreshMs / 1000));
        // 加载估值分时记录（用于分时图）
        setValuationSeries(getAllValuationSeries(funds));
        // 加载自选状态：只保留存在于 funds 中的 code，避免“自选数量 > 全部数量”
        const savedFavorites = Array.from(favorites);
        const storedFundCodeSet = new Set(funds.map((f) => f?.code).filter(Boolean));
        const cleanedFavorites = cleanCodeArray(savedFavorites, storedFundCodeSet);
        if (cleanedFavorites.length !== savedFavorites.length) {
          setFavorites(new Set(cleanedFavorites));
        }
        // 加载待处理交易
        const savedPending = storageStore.getItem('pendingTrades', []);
        if (isArray(savedPending)) {
          setPendingTrades(savedPending);
        }
        // 加载分组状态
        // 读取用户上次选择的分组（仅本地存储，不同步云端）
        const savedTab = storageStore.getItem('currentTab');
        if (
          savedTab === 'all' ||
          savedTab === 'fav' ||
          (savedTab && isArray(groups) && groups.some((g) => g?.id === savedTab))
        ) {
          setCurrentTab(savedTab);
        } else if (savedTab) {
          setCurrentTab('all');
        }
        // 加载持仓数据
        const migratedDca = migrateDcaPlansToScoped(isPlainObject(dcaPlans) ? dcaPlans : {});
        if (JSON.stringify(migratedDca) !== JSON.stringify(dcaPlans)) {
          setDcaPlans(migratedDca);
        }
        const savedTheme = storageStore.getItem('theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setTheme(savedTheme);
        }
      } catch {}
      if (!cancelled) {
        hasLocalTabInitRef.current = true;
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [isSupabaseConfigured]);

  // 切换分组后，页面自动回到顶部（跳过首次初始化恢复）
  useEffect(() => {
    if (!hasLocalTabInitRef.current) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentTab]);

  // 记录用户当前选择的分组（仅本地存储，不同步云端）
  useEffect(() => {
    if (!hasLocalTabInitRef.current) return;
    try {
      storageStore.setItem('currentTab', currentTab);
    } catch {}
  }, [currentTab]);

  // 主题同步：已由 useTheme hook 内部的 useEffect 处理，此处无需重复

  // 初始化认证状态监听
  useEffect(() => {
    if (!isSupabaseConfigured) {
      clearAuthUser();
      return;
    }
    const clearAuthState = () => {
      clearAuthUser();
      skipSyncRef.current = false;
    };

    const handleSession = async (session, event, isExplicitLogin = false) => {
      if (!session?.user) {
        if (event === 'SIGNED_OUT' && !isLoggingOutRef.current) {
          setLoginInitialError('会话已过期，请重新登录');
          setLoginModalOpen(true);
        }
        isLoggingOutRef.current = false;
        clearAuthState();
        skipSyncRef.current = false;
        return;
      }
      if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
        isLoggingOutRef.current = true;
        await supabase.auth.signOut({ scope: 'local' });
        try {
          const storageKeys = Object.keys(localStorage);
          storageKeys.forEach((key) => {
            if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
              storageHelper.removeItem(key);
            }
          });
        } catch {}
        try {
          const sessionKeys = Object.keys(sessionStorage);
          sessionKeys.forEach((key) => {
            if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
              sessionStorage.removeItem(key);
            }
          });
        } catch {}
        clearAuthState();
        setLoginInitialError('会话已过期，请重新登录');
        showToast('会话已过期，请重新登录', 'error');
        setLoginModalOpen(true);
        return;
      }
      setAuthUser(session.user);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        setLoginModalOpen(false);
        setLoginInitialError('');
      }
      // 仅在明确的登录动作（SIGNED_IN）时检查冲突；INITIAL_SESSION（刷新页面等）不检查，直接以云端为准
      fetchCloudConfig(session.user.id, isExplicitLogin, {
        refreshAfterApply: event === 'INITIAL_SESSION'
      });
    };

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        clearAuthState();
        return;
      }
      await handleSession(data?.session ?? null, 'INITIAL_SESSION');
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // INITIAL_SESSION 会由 getSession() 主动触发，这里不再重复处理
      if (event === 'INITIAL_SESSION') return;
      const isExplicitLogin = event === 'SIGNED_IN' && isExplicitLoginRef.current;
      await handleSession(session ?? null, event, isExplicitLogin);
      if (event === 'SIGNED_IN') {
        isExplicitLoginRef.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // // 实时同步
  // useEffect(() => {
  //   if (!isSupabaseConfigured || !user?.id) return;
  //   const deviceId = deviceIdRef.current;
  //   if (!deviceId) return; // 确保设备ID已初始化
  //
  //   const channel = supabase
  //     .channel(`user-configs-${user.id}`)
  //     .on('postgres_changes', { event: '*', schema: 'public', table: 'user_configs', filter: `last_device_id=neq.${deviceId}` }, async (payload) => {
  //       if (deviceConflictModalOpenRef.current) return; // 如果有拦截弹窗，忽略实时推送，防止覆盖本地数据
  //       if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
  //       const incoming = payload?.new?.data;
  //       if (!isPlainObject(incoming)) return;
  //       const incomingDeviceId = incoming?._syncMeta?.deviceId ? String(incoming._syncMeta.deviceId) : '';
  //       if (incomingDeviceId && deviceIdRef.current && incomingDeviceId === deviceIdRef.current) return;
  //       const incomingComparable = getComparablePayload(incoming);
  //       if (!incomingComparable || incomingComparable === lastSyncedRef.current) return;
  //       await applyCloudConfig(incoming, payload.new.updated_at);
  //     })
  //     .subscribe();
  //   return () => {
  //     supabase.removeChannel(channel);
  //   };
  // }, [user?.id]);

  // 登出
  const handleLogout = async () => {
    isLoggingOutRef.current = true;
    if (!isSupabaseConfigured) {
      setLoginModalOpen(false);
      setLoginInitialError('');
      clearAuthUser();
      return;
    }
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (session) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error && error.code !== 'session_not_found') {
          throw error;
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
      console.error('登出失败', err);
    } finally {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}
      try {
        const storageKeys = Object.keys(localStorage);
        storageKeys.forEach((key) => {
          if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
            storageHelper.removeItem(key);
          }
        });
      } catch {}
      try {
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach((key) => {
          if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
            sessionStorage.removeItem(key);
          }
        });
      } catch {}
      setLoginModalOpen(false);
      setLoginInitialError('');
      clearAuthUser();
    }
  };

  useEffect(() => {
    const val = String(deferredSearchTerm ?? '').trim();
    if (!val) {
      setSearchResults([]);
      return;
    }

    if (val.length < 2) return;

    setIsSearching(true);
    searchFunds(val)
      .then((results) => {
        setSearchResults(results);
      })
      .catch((e) => {
        console.error('搜索失败', e);
      })
      .finally(() => {
        setIsSearching(false);
      });
  }, [deferredSearchTerm]);

  const handleSearchInput = (e) => {
    setSearchTerm(e.target.value);
  };

  const toggleSelectFund = (fund) => {
    setSelectedFunds((prev) => {
      const exists = prev.find((f) => f.CODE === fund.CODE);
      if (exists) {
        return prev.filter((f) => f.CODE !== fund.CODE);
      }
      return [...prev, fund];
    });
  };

  const requestRemoveFund = (fund) => {
    const gid =
      currentTab !== 'all' && currentTab !== 'fav' && groups.some((g) => g.id === currentTab) ? currentTab : null;

    if (gid) {
      const gh = groupHoldings[gid]?.[fund.code];
      const hasGroupHolding = !isNil(gh) && isNumber(gh.share) && gh.share >= 0;
      const hasGroupPending = pendingTrades.some((t) => t.fundCode === fund.code && t.groupId === gid);
      const scoped = migrateDcaPlansToScoped(dcaPlans);
      const hasGroupDca = !!scoped[gid]?.[fund.code];
      const txList = transactions[fund.code] || [];
      const hasGroupTx = txList.some((t) => t.groupId === gid);
      const needsConfirm = hasGroupHolding || hasGroupPending || hasGroupDca || hasGroupTx;
      if (needsConfirm) {
        setFundDeleteConfirm({ code: fund.code, name: fund.name, scope: 'group', groupId: gid });
      } else {
        fundDetailDrawerCloseRef.current?.();
        fundDetailDialogCloseRef.current?.();
        stripFundFromGroupScope(fund.code, gid);
      }
      return;
    }

    const h = holdings[fund.code];
    const hasGlobalHolding = !isNil(h) && isNumber(h.share) && h.share >= 0;
    const hasGroupHolding = Object.values(groupHoldings || {}).some(
      (b) => !isNil(b) && !isNil(b[fund.code]) && isNumber(b[fund.code].share) && b[fund.code].share >= 0
    );
    const hasHolding = hasGlobalHolding || hasGroupHolding;
    const otherGroups = groups.filter((g) => g.codes.includes(fund.code)).map((g) => g.name);
    if (hasHolding || otherGroups.length > 0) {
      setFundDeleteConfirm({ code: fund.code, name: fund.name, scope: 'global', otherGroups });
    } else {
      fundDetailDrawerCloseRef.current?.();
      fundDetailDialogCloseRef.current?.();
      removeFund(fund.code);
    }
  };

  /** @returns {boolean|void} false 表示已弹出二次确认，由确认成功回调再清空选中；true 表示已立即执行，调用方可清空多选 */
  const requestRemoveFundsFromCurrentGroup = (codes) => {
    const gid =
      currentTab !== 'all' && currentTab !== 'fav' && groups.some((g) => g.id === currentTab) ? currentTab : null;
    const list = Array.from(new Set((codes || []).filter(Boolean)));
    if (list.length === 0) return true;

    if (gid) {
      const scoped = migrateDcaPlansToScoped(dcaPlans);
      const needsConfirm = list.some((code) => {
        const gh = groupHoldings[gid]?.[code];
        const hasGroupHolding = !isNil(gh) && isNumber(gh.share) && gh.share >= 0;
        const hasGroupPending = pendingTrades.some((t) => t.fundCode === code && t.groupId === gid);
        const hasGroupDca = !!scoped[gid]?.[code];
        const txList = transactions[code] || [];
        const hasGroupTx = txList.some((t) => t.groupId === gid);
        return hasGroupHolding || hasGroupPending || hasGroupDca || hasGroupTx;
      });

      if (needsConfirm) {
        setFundDeleteBulkConfirm({ codes: list, groupId: gid, count: list.length, scope: 'group' });
        return false;
      }

      fundDetailDrawerCloseRef.current?.();
      fundDetailDialogCloseRef.current?.();
      stripManyFundsFromGroupScope(list, gid);
      showToast(`已从当前分组移除 ${list.length} 支基金`, 'success');
      return true;
    }

    // 全部 / 自选：与单条删除、移动端批量删除作用域一致
    const fundsWithOtherGroups = [];
    for (const code of list) {
      const otherGroupNames = groups.filter((g) => g.codes.includes(code)).map((g) => g.name);
      if (otherGroupNames.length > 0) {
        const meta = funds.find((f) => f.code === code);
        fundsWithOtherGroups.push({
          code,
          name: meta?.name || code,
          otherGroups: otherGroupNames
        });
      }
    }
    const needsGlobalConfirm = list.some((code) => {
      const h = holdings[code];
      const hasGlobalHolding = !isNil(h) && isNumber(h.share) && h.share >= 0;
      const hasGroupHolding = Object.values(groupHoldings || {}).some(
        (b) => !isNil(b) && !isNil(b[code]) && isNumber(b[code].share) && b[code].share >= 0
      );
      return hasGlobalHolding || hasGroupHolding;
    });

    if (needsGlobalConfirm || fundsWithOtherGroups.length > 0) {
      setFundDeleteBulkConfirm({ codes: list, count: list.length, scope: 'global', fundsWithOtherGroups });
      return false;
    }

    fundDetailDrawerCloseRef.current?.();
    fundDetailDialogCloseRef.current?.();
    removeFundsBulk(list);
    showToast(`已删除 ${list.length} 支基金`, 'success');
    return true;
  };

  /** PC / 移动端列表共用：批量删除当前 Tab 下选中基金（与 PcFundTable onRemoveFunds 一致） */
  const removeFundsFromCurrentTabHandler = (codes) => requestRemoveFundsFromCurrentGroup(codes);

  /**
   * 批量迁移分组（含持仓/交易/待处理/定投等分组作用域数据）
   *
   * - fromTab: 'all' | 'fav' | groupId
   * - targetId: 'all' | groupId
   * - dryRun: 仅检测目标是否存在持仓数据冲突
   * - overwrite: 冲突时是否覆盖目标持仓数据
   */
  const handleMoveFunds = async ({ codes, fromTab, targetId, dryRun = false, overwrite = false } = {}) => {
    const list = Array.from(new Set((codes || []).filter(Boolean)));
    if (list.length === 0) return { conflicts: [] };

    const isCustomTab = (tab) => tab && tab !== 'all' && tab !== 'fav' && groups.some((g) => g?.id === tab);
    const fromGid = isCustomTab(fromTab) ? fromTab : null;
    const toGid = targetId && targetId !== 'all' && targetId !== 'fav' ? targetId : null;

    if (targetId === 'all' || targetId === 'fav') {
      if (targetId === 'all' && !fromGid && fromTab !== 'fav') return { conflicts: [] };
      if (targetId === 'fav' && !fromGid && fromTab !== 'all') return { conflicts: [] };
    } else {
      if (!toGid || !groups.some((g) => g?.id === toGid)) return { conflicts: [] };
      if (toGid === fromGid) return { conflicts: [] };
    }

    const conflicts = [];
    for (const code of list) {
      const hasTargetHolding = toGid ? groupHoldings?.[toGid]?.[code] != null : holdings?.[code] != null;
      if (hasTargetHolding) conflicts.push(code);
    }
    if (dryRun) return { conflicts };
    if (!overwrite && conflicts.length > 0) return { conflicts };

    // 1) groups.codes：维护基金所属分组（仅自定义分组）
    if (fromGid || toGid) {
      setGroups((prev) => {
        const next = (prev || []).map((g) => {
          if (!g?.id) return g;
          if (fromGid && g.id === fromGid) {
            return { ...g, codes: (g.codes || []).filter((c) => !list.includes(c)) };
          }
          if (toGid && g.id === toGid) {
            return { ...g, codes: Array.from(new Set([...(g.codes || []), ...list])) };
          }
          return g;
        });
        return next;
      });
    }

    // 2) holdings / groupHoldings：迁移持仓（支持覆盖确认）
    setHoldings((prev) => {
      const next = { ...(prev || {}) };

      // all/fav -> group：从 global holdings 移出（目标持仓写入 groupHoldings）
      if (!fromGid && toGid) {
        for (const code of list) delete next[code];
        return next;
      }

      // group -> all：从 groupHoldings 写入 global holdings（并在 groupHoldings 中移除）
      if (fromGid && !toGid) {
        const fromBucket = groupHoldings?.[fromGid] || {};
        let changed = false;
        for (const code of list) {
          const fromValue = fromBucket?.[code];
          if (fromValue === undefined) continue;
          if (overwrite || next[code] == null) {
            next[code] = cloneHoldingDeep(fromValue) ?? fromValue;
            changed = true;
          }
        }
        if (!changed) return prev;
        return next;
      }

      // group<->group：global holdings 不参与
      return prev;
    });

    setGroupHoldings((prev) => {
      const next = { ...(prev || {}) };
      const getBucket = (gid) => (next[gid] && isObject(next[gid]) ? { ...next[gid] } : {});

      // 读取源持仓
      const sourceBucket = fromGid ? getBucket(fromGid) : null;
      const targetBucket = toGid ? getBucket(toGid) : null;

      if (toGid) next[toGid] = targetBucket;
      if (fromGid) next[fromGid] = sourceBucket;

      for (const code of list) {
        const fromValue = fromGid ? sourceBucket?.[code] : holdings?.[code];

        // 写入目标（仅在目标为自定义分组时）
        if (toGid) {
          if (overwrite || targetBucket?.[code] == null) {
            targetBucket[code] = cloneHoldingDeep(fromValue) ?? fromValue ?? null;
          }
        }

        // 移除源分组持仓（仅源为自定义分组时；all/fav -> group 的源在 setHoldings 中删）
        if (fromGid && sourceBucket && code in sourceBucket) {
          delete sourceBucket[code];
        }
      }

      return next;
    });

    // 3) pendingTrades：迁移待处理队列（通过 groupId 归属作用域）
    setPendingTrades((prev) => {
      let changed = false;
      const next = (prev || []).map((t) => {
        if (!t?.fundCode) return t;
        if (!list.includes(t.fundCode)) return t;
        const inFromScope = fromGid ? t.groupId === fromGid : !t.groupId;
        if (!inFromScope) return t;
        changed = true;
        if (toGid) return { ...t, groupId: toGid };
        const rest = { ...t };
        delete rest.groupId;
        return rest;
      });
      if (!changed) return prev;
      return next;
    });

    // 4) transactions：迁移交易记录（通过 groupId 归属作用域）
    setTransactions((prev) => {
      const out = { ...(prev || {}) };
      let changed = false;
      for (const code of list) {
        const arr = out?.[code];
        if (!isArray(arr) || arr.length === 0) continue;
        const nextArr = arr.map((tx) => {
          if (!tx) return tx;
          const inFromScope = fromGid ? tx.groupId === fromGid : !tx.groupId;
          if (!inFromScope) return tx;
          changed = true;
          if (toGid) return { ...tx, groupId: toGid };
          const rest = { ...tx };
          delete rest.groupId;
          return rest;
        });
        out[code] = nextArr;
      }
      if (!changed) return prev;
      return out;
    });

    // 5) dcaPlans：迁移定投计划（按 scope 分桶）
    setDcaPlans((prev) => {
      const scoped = migrateDcaPlansToScoped(prev);
      const fromKey = fromGid || DCA_SCOPE_GLOBAL;
      const toKey = toGid || DCA_SCOPE_GLOBAL;
      const fromBucket = scoped[fromKey] && isObject(scoped[fromKey]) ? { ...scoped[fromKey] } : {};
      const toBucket = scoped[toKey] && isObject(scoped[toKey]) ? { ...scoped[toKey] } : {};
      let changed = false;
      for (const code of list) {
        if (fromBucket[code] === undefined) continue;
        toBucket[code] = fromBucket[code];
        delete fromBucket[code];
        changed = true;
      }
      if (!changed) return prev;
      const nextScoped = { ...scoped, [fromKey]: fromBucket, [toKey]: toBucket };
      return nextScoped;
    });

    // 6) fundDailyEarnings：每日收益序列（按 scope 分桶：all + 自定义分组 id）
    setFundDailyEarnings((prev) => {
      const fromKey = fromGid || DAILY_EARNINGS_SCOPE_ALL;
      const toKey = toGid || DAILY_EARNINGS_SCOPE_ALL;
      const base = isPlainObject(prev) ? prev : {};
      const fromBucket = isPlainObject(base[fromKey]) ? { ...base[fromKey] } : {};
      const toBucket = isPlainObject(base[toKey]) ? { ...base[toKey] } : {};
      let changed = false;
      for (const code of list) {
        if (!(code in fromBucket)) continue;
        if (!overwrite && code in toBucket) continue;
        toBucket[code] = fromBucket[code];
        delete fromBucket[code];
        changed = true;
      }
      if (!changed) return prev;
      const next = { ...base, [fromKey]: fromBucket, [toKey]: toBucket };
      return next;
    });

    // 7) favorites：维护自选星标状态
    if (targetId === 'fav' || fromTab === 'fav' || toGid) {
      setFavorites((prev) => {
        const next = new Set(prev || []);
        let changed = false;
        for (const code of list) {
          if (targetId === 'fav') {
            if (!next.has(code)) {
              next.add(code);
              changed = true;
            }
          } else if (fromTab === 'fav' || toGid) {
            if (next.has(code)) {
              next.delete(code);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }

    // 迁移成功后切换到目标分组
    setCurrentTab(targetId === 'all' ? 'all' : targetId);
    showToast('分组迁移完成', 'success');
    return { conflicts: [] };
  };

  const handleMarketTabAddFund = (fundInfo) => {
    const { code, name } = fundInfo;
    const fundsToConfirm = [
      {
        code,
        name,
        status: 'pending'
      }
    ];
    setScannedFunds(fundsToConfirm);
    setSelectedScannedCodes(new Set([code]));
    setIsOcrScan(false);
    setScanConfirmModalOpen(true);
  };

  const addFund = async (e) => {
    e?.preventDefault?.();
    setError('');
    const manualTokens = String(searchTerm || '')
      .split(/[^0-9A-Za-z]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const selectedCodes = Array.from(
      new Set([...selectedFunds.map((f) => f.CODE), ...manualTokens.filter((t) => /^\d{6}$/.test(t))])
    );
    if (selectedCodes.length === 0) {
      setError('请输入或选择基金代码');
      return;
    }
    const nameMap = {};
    selectedFunds.forEach((f) => {
      nameMap[f.CODE] = f.NAME;
    });
    const fundsToConfirm = selectedCodes.map((code) => ({
      code,
      name: nameMap[code] || '',
      status: funds.some((f) => f.code === code) ? 'added' : 'pending'
    }));
    setScannedFunds(fundsToConfirm);
    setSelectedScannedCodes(new Set(selectedCodes));
    setIsOcrScan(false);
    setScanConfirmModalOpen(true);
    setSearchTerm('');
    setSelectedFunds([]);
    setShowDropdown(false);
    inputRef.current?.blur();
    setIsSearchFocused(false);
  };

  const removeFund = (removeCode) => {
    const next = funds.filter((f) => f.code !== removeCode);
    setFunds(next);

    // 同步删除分组中的失效代码
    const nextGroups = groups.map((g) => ({
      ...g,
      codes: g.codes.filter((c) => c !== removeCode)
    }));
    setGroups(nextGroups);

    // 同步删除展开收起状态
    setCollapsedCodes((prev) => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      return nextSet;
    });

    // 同步删除业绩走势收起状态
    setCollapsedTrends((prev) => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      return nextSet;
    });

    // 同步删除我的收益收起状态
    setCollapsedEarnings((prev) => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      return nextSet;
    });

    // 同步删除自选状态
    setFavorites((prev) => {
      if (!prev || !prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      if (nextSet.size === 0 && currentTab === 'fav') setCurrentTab('all');
      return nextSet;
    });

    // 同步删除持仓数据
    setHoldings((prev) => {
      if (!prev[removeCode]) return prev;
      const next = { ...prev };
      delete next[removeCode];
      return next;
    });

    setGroupHoldings((prev) => {
      const next = {};
      let changed = false;
      for (const gid of Object.keys(prev || {})) {
        const bucket = { ...(prev[gid] || {}) };
        if (bucket[removeCode]) {
          delete bucket[removeCode];
          changed = true;
        }
        next[gid] = bucket;
      }
      return changed ? next : prev;
    });

    // 同步删除待处理交易
    setPendingTrades((prev) => {
      const next = prev.filter((trade) => trade?.fundCode !== removeCode);
      return next;
    });

    // 同步删除该基金的交易记录
    setTransactions((prev) => {
      if (!prev[removeCode]) return prev;
      const next = { ...prev };
      delete next[removeCode];
      return next;
    });

    // 同步删除该基金的估值分时数据
    clearFund(removeCode);
    setValuationSeries((prev) => {
      if (!(removeCode in prev)) return prev;
      const next = { ...prev };
      delete next[removeCode];
      return next;
    });

    // 同步删除该基金的定投计划（所有 scope）
    setDcaPlans((prev) => {
      const scoped = migrateDcaPlansToScoped(prev);
      const nextScoped = {};
      let changed = false;
      for (const [scope, bucket] of Object.entries(scoped)) {
        if (!isPlainObject(bucket)) continue;
        const nb = { ...bucket };
        if (nb[removeCode]) {
          delete nb[removeCode];
          changed = true;
        }
        nextScoped[scope] = nb;
      }
      if (!changed) return prev;
      return nextScoped;
    });

    setFundTagRecords((prev) => {
      const next = prev
        .map((r) => {
          const codes = getFundCodesFromTagRecord(r).filter((c) => c !== removeCode);
          return sanitizeTagRowForStorage({ ...r, fundCodes: codes });
        })
        .filter(Boolean);
      if (serializeTagRecordsForCompare(prev) === serializeTagRecordsForCompare(next)) return prev;
      storageHelper.setItem('tags', JSON.stringify(next));
      return next;
    });
  };

  /** 批量从「全部」逻辑删除多支基金（单次合并更新） */
  const removeFundsBulk = (codes) => {
    const set = new Set((codes || []).filter(Boolean));
    if (set.size === 0) return;

    setFunds((prev) => prev.filter((f) => !set.has(f.code)));

    setGroups((prev) => {
      const next = prev.map((g) => ({
        ...g,
        codes: g.codes.filter((c) => !set.has(c))
      }));
      return next;
    });

    setCollapsedCodes((prev) => {
      let nextSet = prev;
      let changed = false;
      for (const c of set) {
        if (nextSet.has(c)) {
          if (!changed) {
            nextSet = new Set(nextSet);
            changed = true;
          }
          nextSet.delete(c);
        }
      }
      return changed ? nextSet : prev;
    });

    setCollapsedTrends((prev) => {
      let nextSet = prev;
      let changed = false;
      for (const c of set) {
        if (nextSet.has(c)) {
          if (!changed) {
            nextSet = new Set(nextSet);
            changed = true;
          }
          nextSet.delete(c);
        }
      }
      return changed ? nextSet : prev;
    });

    setCollapsedEarnings((prev) => {
      let nextSet = prev;
      let changed = false;
      for (const c of set) {
        if (nextSet.has(c)) {
          if (!changed) {
            nextSet = new Set(nextSet);
            changed = true;
          }
          nextSet.delete(c);
        }
      }
      return changed ? nextSet : prev;
    });

    setFavorites((prev) => {
      let nextSet = prev;
      let changed = false;
      for (const c of set) {
        if (nextSet.has(c)) {
          if (!changed) {
            nextSet = new Set(nextSet);
            changed = true;
          }
          nextSet.delete(c);
        }
      }
      if (changed && nextSet.size === 0) {
        setCurrentTab('all');
      }
      return changed ? nextSet : prev;
    });

    setHoldings((prev) => {
      let next = prev;
      let changed = false;
      for (const c of set) {
        if (next[c]) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          delete next[c];
        }
      }
      return changed ? next : prev;
    });

    setGroupHoldings((prev) => {
      const next = {};
      let changed = false;
      for (const gid of Object.keys(prev || {})) {
        const bucket = { ...(prev[gid] || {}) };
        for (const c of set) {
          if (bucket[c]) {
            delete bucket[c];
            changed = true;
          }
        }
        next[gid] = bucket;
      }
      return changed ? next : prev;
    });

    setPendingTrades((prev) => {
      const next = prev.filter((t) => !set.has(t?.fundCode));
      if (next.length === prev.length) return prev;
      return next;
    });

    setTransactions((prev) => {
      let next = prev;
      let changed = false;
      for (const c of set) {
        if (next[c]) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          delete next[c];
        }
      }
      if (changed) {
        // storageHelper.setItem handled by setTransactions
      }
      return changed ? next : prev;
    });

    for (const c of set) {
      clearFund(c);
    }

    setValuationSeries((prev) => {
      let next = prev;
      let changed = false;
      for (const c of set) {
        if (c in next) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          delete next[c];
        }
      }
      return changed ? next : prev;
    });

    try {
      setFundDailyEarnings((prev) => {
        if (!isPlainObject(prev)) return prev;
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((scopeKey) => {
          const bucket = next[scopeKey];
          if (!isPlainObject(bucket)) return;
          let nb = bucket;
          let innerChanged = false;
          for (const c of set) {
            if (c in nb) {
              if (!innerChanged) {
                nb = { ...bucket };
                innerChanged = true;
              }
              delete nb[c];
            }
          }
          if (innerChanged) {
            next[scopeKey] = nb;
            changed = true;
          }
        });
        if (changed) {
          // storageHelper.setItem handled by setFundDailyEarnings
        }
        return changed ? next : prev;
      });
    } catch {
      /* empty */
    }

    setDcaPlans((prev) => {
      const scoped = migrateDcaPlansToScoped(prev);
      let changed = false;
      const nextScoped = {};
      for (const [scope, bucket] of Object.entries(scoped)) {
        if (!isPlainObject(bucket)) continue;
        const nb = { ...bucket };
        for (const c of set) {
          if (nb[c]) {
            delete nb[c];
            changed = true;
          }
        }
        nextScoped[scope] = nb;
      }
      if (!changed) return prev;
      return nextScoped;
    });

    setFundTagRecords((prev) => {
      const next = prev
        .map((r) => {
          const codes = getFundCodesFromTagRecord(r).filter((c) => !set.has(c));
          return sanitizeTagRowForStorage({ ...r, fundCodes: codes });
        })
        .filter(Boolean);
      if (serializeTagRecordsForCompare(prev) === serializeTagRecordsForCompare(next)) return prev;
      storageHelper.setItem('tags', JSON.stringify(next));
      return next;
    });
  };

  const saveSettings = (
    e,
    secondsOverride,
    showMarketIndexOverride,
    showGroupFundSearchOverride,
    isMobileOverride,
    dynamicStyleOverride,
    containerWidthOverride,
    showGroupDropdownOverride
  ) => {
    e?.preventDefault?.();
    const seconds = secondsOverride ?? tempSeconds;
    const ms = Math.max(30, Number(seconds)) * 1000;
    setTempSeconds(Math.round(ms / 1000));
    setRefreshMs(ms);
    const nextShowMarketIndex = isBoolean(showMarketIndexOverride)
      ? showMarketIndexOverride
      : isMobileOverride
        ? showMarketIndexMobile
        : showMarketIndexPc;

    const targetIsMobile = Boolean(isMobileOverride);
    if (targetIsMobile) setShowMarketIndexMobile(nextShowMarketIndex);
    else setShowMarketIndexPc(nextShowMarketIndex);

    const nextShowGroupFundSearch = isBoolean(showGroupFundSearchOverride)
      ? showGroupFundSearchOverride
      : targetIsMobile
        ? showGroupFundSearchMobile
        : showGroupFundSearchPc;
    if (targetIsMobile) setShowGroupFundSearchMobile(nextShowGroupFundSearch);
    else setShowGroupFundSearchPc(nextShowGroupFundSearch);

    const nextDynamicStyle = isBoolean(dynamicStyleOverride)
      ? dynamicStyleOverride
      : targetIsMobile
        ? dynamicStyleMobile
        : dynamicStylePc;
    if (targetIsMobile) setDynamicStyleMobile(nextDynamicStyle);
    else setDynamicStylePc(nextDynamicStyle);

    const nextShowGroupDropdown = isBoolean(showGroupDropdownOverride)
      ? showGroupDropdownOverride
      : targetIsMobile
        ? showGroupDropdownMobile
        : showGroupDropdownPc;
    if (targetIsMobile) setShowGroupDropdownMobile(nextShowGroupDropdown);
    else setShowGroupDropdownPc(nextShowGroupDropdown);

    // 在移动端不裁剪也不修改 pcContainerWidth，直接保留原值
    let w = Number(containerWidthOverride ?? containerWidth) || 1200;
    if (!targetIsMobile) {
      w = Math.min(Math.max(window.innerWidth, 2000), Math.max(600, w));
      setContainerWidth(w);
    }

    try {
      const parsed = useStorageStore.getState().customSettings || {};
      if (targetIsMobile) {
        // 仅更新当前运行端对应的开关键，不覆盖 PC 端宽度
        setCustomSettings({
          ...parsed,
          showMarketIndexMobile: nextShowMarketIndex,
          showGroupFundSearchMobile: nextShowGroupFundSearch,
          dynamicStyleMobile: nextDynamicStyle,
          showGroupDropdownMobile: nextShowGroupDropdown
        });
      } else {
        setCustomSettings({
          ...parsed,
          pcContainerWidth: w,
          showMarketIndexPc: nextShowMarketIndex,
          showGroupFundSearchPc: nextShowGroupFundSearch,
          dynamicStylePc: nextDynamicStyle,
          showGroupDropdownPc: nextShowGroupDropdown
        });
      }
    } catch {}
    setSettingsOpen(false);
  };

  const handleResetContainerWidth = () => {
    setContainerWidth(1200);
    try {
      const parsed = useStorageStore.getState().customSettings || {};
      setCustomSettings({ ...parsed, pcContainerWidth: 1200 });
    } catch {}
  };

  const importFileRef = useRef(null);
  const [importMsg, setImportMsg] = useState('');

  const exportLocalData = async () => {
    try {
      const payload = {
        funds,
        tags: storageStore.getItem('tags', []),
        favorites: Array.from(favorites),
        groups,
        collapsedCodes: Array.from(collapsedCodes),
        collapsedTrends: Array.from(collapsedTrends),
        collapsedEarnings: Array.from(collapsedEarnings),
        refreshMs,
        viewMode: storageStore.getItem('viewMode') === 'list' ? 'list' : 'card',
        holdings,
        groupHoldings,
        pendingTrades,
        transactions,
        dcaPlans,
        customSettings: customSettings || {},
        fundDailyEarnings,
        exportedAt: nowInTz().toISOString()
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: `realtime-fund-config-${Date.now()}.json`,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setSuccessModal({ open: true, message: '导出成功' });
        setSettingsOpen(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `realtime-fund-config-${Date.now()}.json`;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        setSuccessModal({ open: true, message: '导出成功' });
        setSettingsOpen(false);
      };
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') return;
        finish();
        document.removeEventListener('visibilitychange', onVisibility);
      };
      document.addEventListener('visibilitychange', onVisibility, { once: true });
      a.click();
      setTimeout(finish, 3000);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleImportFileChange = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (isPlainObject(data)) {
        // 从 localStorage 读取最新数据进行合并，防止状态滞后导致的数据丢失
        const currentFunds = storageStore.getItem('funds', []);
        const currentFavorites = storageStore.getItem('favorites', []);
        const currentGroups = storageStore.getItem('groups', []);
        const currentCollapsed = storageStore.getItem('collapsedCodes', []);
        const currentTrends = storageStore.getItem('collapsedTrends', []);
        const currentEarnings = storageStore.getItem('collapsedEarnings', []);
        const currentPendingTrades = storageStore.getItem('pendingTrades', []);
        const currentDcaPlans = storageStore.getItem('dcaPlans', {});
        const currentGroupHoldings = storageStore.getItem('groupHoldings', {});

        let mergedFunds = currentFunds;
        let appendedCodes = [];

        if (isArray(data.funds)) {
          const incomingFunds = dedupeByCode(data.funds.map(stripLegacyTagsFromFundObject));
          const existingCodes = new Set(currentFunds.map((f) => f.code));
          const newItems = incomingFunds.filter((f) => f && f.code && !existingCodes.has(f.code));
          appendedCodes = newItems.map((f) => f.code);
          mergedFunds = [...currentFunds, ...newItems];
          setFunds(mergedFunds);
        }

        if (isArray(data.favorites)) {
          const fundCodeSet = new Set(mergedFunds.map((f) => f?.code).filter(Boolean));
          const mergedFav = cleanCodeArray([...currentFavorites, ...data.favorites], fundCodeSet);
          setFavorites(new Set(mergedFav));
        }

        if (isArray(data.tags)) {
          const currentTags = storageStore.getItem('tags', []);
          const fundCodeSet = new Set(mergedFunds.map((f) => f?.code).filter(Boolean));
          const byId = new Map((isArray(currentTags) ? currentTags : []).map((r) => [String(r.id), r]));
          for (const r of data.tags) {
            if (!r || !isObject(r)) continue;
            const codes = getFundCodesFromTagRecord(r).filter((c) => fundCodeSet.has(c));
            const name = String(r.name ?? '').trim();
            if (!name) continue;
            const id = String(r.id ?? '').trim() || uuidv4();
            const existing = byId.get(id);
            const mergedCodes = existing
              ? [...new Set([...getFundCodesFromTagRecord(existing), ...codes])].sort()
              : codes.sort();
            const row = sanitizeTagRowForStorage({
              id,
              name,
              theme: String(r.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME,
              fundCodes: mergedCodes
            });
            if (row) byId.set(id, row);
          }
          const mergedTags = Array.from(byId.values())
            .map(sanitizeTagRowForStorage)
            .filter(Boolean)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
          setFundTagRecords(mergedTags);
          storageHelper.setItem('tags', JSON.stringify(mergedTags));
        }

        // fundTagLists 已废弃：导入时无需处理该字段

        if (isArray(data.groups)) {
          // 合并分组：如果 ID 相同则合并 codes，否则添加新分组
          const mergedGroups = [...currentGroups];
          data.groups.forEach((incomingGroup) => {
            const existingIdx = mergedGroups.findIndex((g) => g.id === incomingGroup.id);
            if (existingIdx > -1) {
              mergedGroups[existingIdx] = {
                ...mergedGroups[existingIdx],
                codes: Array.from(new Set([...mergedGroups[existingIdx].codes, ...(incomingGroup.codes || [])]))
              };
            } else {
              mergedGroups.push(incomingGroup);
            }
          });
          setGroups(mergedGroups);
        }

        if (isArray(data.collapsedCodes)) {
          const mergedCollapsed = Array.from(new Set([...currentCollapsed, ...data.collapsedCodes]));
          setCollapsedCodes(new Set(mergedCollapsed));
        }

        if (isArray(data.collapsedTrends)) {
          const mergedTrends = Array.from(new Set([...currentTrends, ...data.collapsedTrends]));
          setCollapsedTrends(new Set(mergedTrends));
        }

        if (isArray(data.collapsedEarnings)) {
          const mergedEarnings = Array.from(new Set([...currentEarnings, ...data.collapsedEarnings]));
          setCollapsedEarnings(new Set(mergedEarnings));
        }

        if (isNumber(data.refreshMs) && data.refreshMs >= 5000) {
          setRefreshMs(data.refreshMs);
          setTempSeconds(Math.round(data.refreshMs / 1000));
        }
        if (data.viewMode === 'card' || data.viewMode === 'list') {
          applyViewMode(data.viewMode);
        }

        if (isPlainObject(data.holdings)) {
          const mergedHoldings = { ...storageStore.getItem('holdings', {}), ...data.holdings };
          setHoldings(mergedHoldings);
        }

        if (isPlainObject(data.groupHoldings)) {
          const mergedGH = { ...(isPlainObject(currentGroupHoldings) ? currentGroupHoldings : {}) };
          Object.entries(data.groupHoldings).forEach(([gid, bucket]) => {
            if (!isPlainObject(bucket)) return;
            mergedGH[gid] = { ...(mergedGH[gid] || {}), ...bucket };
          });
          setGroupHoldings(mergedGH);
        }

        if (isPlainObject(data.transactions)) {
          const currentTransactions = storageStore.getItem('transactions', {});
          const mergedTransactions = { ...currentTransactions };
          Object.entries(data.transactions).forEach(([code, txs]) => {
            if (!isArray(txs)) return;
            const existing = mergedTransactions[code] || [];
            const existingIds = new Set(existing.map((t) => t.id));
            const newTxs = txs.filter((t) => !existingIds.has(t.id));
            mergedTransactions[code] = [...existing, ...newTxs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          });
          setTransactions(mergedTransactions);
        }

        if (isArray(data.pendingTrades)) {
          const existingPending = isArray(currentPendingTrades) ? currentPendingTrades : [];
          const incomingPending = data.pendingTrades.filter((trade) => trade && trade.fundCode);
          const fundCodeSet = new Set(mergedFunds.map((f) => f.code));
          const keyOf = (trade) => {
            if (trade?.id) return `id:${trade.id}`;
            return `k:${trade?.groupId || ''}:${trade?.fundCode || ''}:${trade?.type || ''}:${trade?.date || ''}:${trade?.share || ''}:${trade?.amount || ''}:${trade?.isAfter3pm ? 1 : 0}`;
          };
          const mergedPendingMap = new Map();
          existingPending.forEach((trade) => {
            if (!trade || !fundCodeSet.has(trade.fundCode)) return;
            mergedPendingMap.set(keyOf(trade), trade);
          });
          incomingPending.forEach((trade) => {
            if (!fundCodeSet.has(trade.fundCode)) return;
            mergedPendingMap.set(keyOf(trade), trade);
          });
          const mergedPending = Array.from(mergedPendingMap.values());
          setPendingTrades(mergedPending);
        }

        if (isPlainObject(data.dcaPlans)) {
          const mergedDca = { ...migrateDcaPlansToScoped(currentDcaPlans) };
          const incomingScoped = migrateDcaPlansToScoped(data.dcaPlans);
          Object.keys(incomingScoped).forEach((scope) => {
            mergedDca[scope] = {
              ...(isPlainObject(mergedDca[scope]) ? mergedDca[scope] : {}),
              ...(isPlainObject(incomingScoped[scope]) ? incomingScoped[scope] : {})
            };
          });
          setDcaPlans(mergedDca);
        }
        if (isPlainObject(data.customSettings)) {
          try {
            const currentCustomSettings = customSettings || {};
            const mergedSettings = {
              ...(isPlainObject(currentCustomSettings) ? currentCustomSettings : {}),
              ...data.customSettings
            };
            setCustomSettings(mergedSettings);
            if (mergedSettings.localSortRules && isArray(mergedSettings.localSortRules)) {
              setSortRules(mergedSettings.localSortRules);
            }
            if (mergedSettings.localSortDisplayMode && SORT_DISPLAY_MODES.has(mergedSettings.localSortDisplayMode)) {
              setPcSortDisplayMode(mergedSettings.localSortDisplayMode);
              setMobileSortDisplayMode(mergedSettings.localSortDisplayMode);
            } else {
              if (
                mergedSettings.pcLocalSortDisplayMode &&
                SORT_DISPLAY_MODES.has(mergedSettings.pcLocalSortDisplayMode)
              ) {
                setPcSortDisplayMode(mergedSettings.pcLocalSortDisplayMode);
              }
              if (
                mergedSettings.mobileLocalSortDisplayMode &&
                SORT_DISPLAY_MODES.has(mergedSettings.mobileLocalSortDisplayMode)
              ) {
                setMobileSortDisplayMode(mergedSettings.mobileLocalSortDisplayMode);
              }
            }
            if (isNumber(mergedSettings.pcContainerWidth) && Number.isFinite(mergedSettings.pcContainerWidth)) {
              const maxWidth = window.matchMedia('(max-width: 640px)').matches
                ? 99999
                : Math.max(window.innerWidth, 2000);
              setContainerWidth(Math.min(maxWidth, Math.max(600, mergedSettings.pcContainerWidth)));
            }
            if (isBoolean(mergedSettings.showMarketIndexPc)) setShowMarketIndexPc(mergedSettings.showMarketIndexPc);
            if (isBoolean(mergedSettings.showMarketIndexMobile))
              setShowMarketIndexMobile(mergedSettings.showMarketIndexMobile);
            if (isBoolean(mergedSettings.showGroupFundSearchPc))
              setShowGroupFundSearchPc(mergedSettings.showGroupFundSearchPc);
            if (isBoolean(mergedSettings.showGroupFundSearchMobile))
              setShowGroupFundSearchMobile(mergedSettings.showGroupFundSearchMobile);
          } catch {}
        }

        if (isPlainObject(data.fundDailyEarnings)) {
          try {
            const incomingScoped = normalizeFundDailyEarningsScoped(data.fundDailyEarnings);
            const currentScoped = normalizeFundDailyEarningsScoped(fundDailyEarnings);
            const mergedDaily = { ...currentScoped };
            Object.entries(incomingScoped).forEach(([scope, bucket]) => {
              if (!isPlainObject(bucket)) return;
              const existingBucket = isPlainObject(mergedDaily[scope]) ? mergedDaily[scope] : {};
              const mergedBucket = { ...existingBucket };
              Object.entries(bucket).forEach(([code, list]) => {
                if (!isArray(list)) return;
                const existingList = isArray(mergedBucket[code]) ? mergedBucket[code] : [];
                const existingByDate = new Map(existingList.map((item) => [item.date, item]));
                list.forEach((item) => {
                  if (!item || !item.date || !Number.isFinite(item.earnings)) return;
                  existingByDate.set(item.date, item);
                });
                mergedBucket[code] = Array.from(existingByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
              });
              mergedDaily[scope] = mergedBucket;
            });
            setFundDailyEarnings(mergedDaily);
          } catch {}
        }

        // 导入成功后，仅刷新新追加的基金
        if (appendedCodes.length) {
          // 这里需要确保 refreshAll 不会因为闭包问题覆盖掉刚刚合并好的 mergedFunds
          // 我们直接传入所有代码执行一次全量刷新是最稳妥的，或者修改 refreshAll 支持增量更新
          const allCodes = mergedFunds.map((f) => f.code);
          await refreshAll(allCodes);
        }

        setSuccessModal({ open: true, message: '导入成功' });
        setSettingsOpen(false); // 导入成功自动关闭设置弹框
        if (importFileRef.current) importFileRef.current.value = '';
      }
    } catch (err) {
      console.error('Import error:', err);
      setImportMsg('导入失败，请检查文件格式');
      setTimeout(() => setImportMsg(''), 4000);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!isMobile || mainTab !== 'home') return;

    let ticking = false;
    const handleScroll = () => {
      // 如果 body 已经被锁定了滚动（说明有弹窗打开），直接忽略滚动事件
      if (document.body.style.overflow === 'hidden') return;
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const lastScrollY = lastScrollYRef.current;
          const scrollDelta = currentScrollY - lastScrollY;
          const threshold = 10;

          if (scrollDelta > threshold && currentScrollY > 50) {
            setMobileBottomNavHidden(true);
          } else if (scrollDelta < -threshold) {
            setMobileBottomNavHidden(false);
          } else if (currentScrollY <= 0) {
            setMobileBottomNavHidden(false);
          }

          lastScrollYRef.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, mainTab]);

  useEffect(() => {
    if (!isMobile || mainTab !== 'home') {
      setMobileBottomNavHidden(false);
    }
  }, [isMobile, mainTab]);

  const settingsOpenRef = useRef(false);
  useEffect(() => {
    const unsub = useModalStore.subscribe(
      (s) => s.settingsOpen,
      (open) => {
        settingsOpenRef.current = open;
      }
    );
    settingsOpenRef.current = useModalStore.getState().settingsOpen;
    return unsub;
  }, []);
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape' && settingsOpenRef.current) setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const containerClassName = [
    'container',
    isMobile && mainTab === 'mine' ? 'mine-mobile-root' : 'content',
    isMobile && mainTab === 'home' ? 'content-with-mobile-tabbar' : ''
  ]
    .filter(Boolean)
    .join(' ');

  /** 移动端底部 Tab 切换时保留首页 DOM，用显隐代替卸载 */
  const mobileHomeTabVisible = mainTab === 'home' || mainTab === 'market';

  /** PC / 移动端行、FundCard 共用：统一 name / fundName 后走单删逻辑 */
  const handleRemoveFundEntry = useCallback(
    (rowOrFund) => {
      if (!rowOrFund?.code) return;
      const name = rowOrFund.name ?? rowOrFund.fundName ?? rowOrFund.code;
      requestRemoveFund({ code: rowOrFund.code, name });
    },
    [requestRemoveFund]
  );

  const handleToggleFavoriteRow = useCallback(
    (row) => {
      if (!row || !row.code) return;
      toggleFavorite(row.code);
    },
    [toggleFavorite]
  );

  const handleHoldingAmountClickRow = useCallback(
    (row, meta) => {
      if (!row || !row.code) return;
      if ((currentTab === 'all' || currentTab === 'fav') && row.isHoldingLinked) {
        const fund = row.rawFund || { code: row.code, name: row.fundName };
        setSelectHoldingGroupModal({ open: true, fund });
        return;
      }

      // 自定义分组：未设置持仓时，如果“全部”存在全局持仓，则提示迁移
      if (activeGroupId && meta?.hasHolding === false) {
        const gh = groupHoldings?.[activeGroupId]?.[row.code];
        const hasGroupShare = !isNil(gh) && isNumber(gh.share) && gh.share >= 0;
        const global = holdings?.[row.code];
        const hasGlobalShare = !isNil(global) && isNumber(global.share) && global.share >= 0;
        if (!hasGroupShare && hasGlobalShare) {
          const name = row.rawFund?.name ?? row.fundName ?? row.code;
          setHoldingMigrateDialog({
            open: true,
            code: row.code,
            name,
            targetGroupId: activeGroupId
          });
          return;
        }
      }

      const fund = row.rawFund || { code: row.code, name: row.fundName };
      if (meta?.hasHolding) {
        setActionModal({ open: true, fund });
      } else {
        setHoldingModal({ open: true, fund });
      }
    },
    [activeGroupId, currentTab, groupHoldings, holdings]
  );

  const handleHoldingProfitClickRow = useCallback((row) => {
    if (!row || !row.code) return;
    if (row.holdingProfitValue == null) return;
    setPercentModes((prev) => ({ ...prev, [row.code]: !prev[row.code] }));
  }, []);

  const openHoldingModal = useCallback(
    (fund) => {
      const code = fund?.code;
      if ((currentTab === 'all' || currentTab === 'fav') && code && linkedHoldingsForAllFav.linked?.has?.(code)) {
        setSelectHoldingGroupModal({ open: true, fund });
        return;
      }

      // 自定义分组：卡片视图/抽屉中“未设置持仓”点击时也走同样迁移提示
      if (activeGroupId && code) {
        const gh = groupHoldings?.[activeGroupId]?.[code];
        const hasGroupShare = !isNil(gh) && isNumber(gh.share) && gh.share >= 0;
        const global = holdings?.[code];
        const hasGlobalShare = !isNil(global) && isNumber(global.share) && global.share >= 0;
        if (!hasGroupShare && hasGlobalShare) {
          const name = fund?.name ?? code;
          setHoldingMigrateDialog({
            open: true,
            code,
            name,
            targetGroupId: activeGroupId
          });
          return;
        }
      }

      setHoldingModal({ open: true, fund });
    },
    [activeGroupId, currentTab, groupHoldings, holdings, linkedHoldingsForAllFav]
  );
  const openDataSourceModal = useCallback((fund) => {
    setDataSourceModal({ open: true, fund });
  }, []);

  const handleDataSourceSelect = useCallback(
    (fundCode, sourceId, autoSource) => {
      setFunds((prev) => {
        const next = [...prev];
        const idx = next.findIndex((f) => f.code === fundCode);
        if (idx !== -1) {
          next[idx] = {
            ...next[idx],
            dataSource: sourceId,
            autoSource: !!autoSource,
            gsz: null,
            gszzl: null,
            gztime: null,
            valuationSource: null,
            noValuation: false
          };
        }
        return next;
      });

      if (typeof window !== 'undefined') {
        try {
          const saved = JSON.parse(localStorage.getItem('rtf_unadded_ds') || '{}');
          saved[fundCode] = sourceId;
          localStorage.setItem('rtf_unadded_ds', JSON.stringify(saved));
        } catch {}
        window.dispatchEvent(new CustomEvent('rtf_unadded_datasource_change', { detail: { fundCode, sourceId } }));
      }

      // Immediately fetch new data for this fund so the UI updates
      refreshAll([fundCode]);
      showToast('切换数据源成功', 'success');
    },
    [setFunds]
  ); // refreshAll is omitted from deps to avoid loop, it's stable enough in page scope

  const openActionModal = useCallback(
    (fund) => {
      const code = fund?.code;
      if ((currentTab === 'all' || currentTab === 'fav') && code && linkedHoldingsForAllFav.linked?.has?.(code)) {
        setSelectHoldingGroupModal({ open: true, fund });
        return;
      }
      setActionModal({ open: true, fund });
    },
    [currentTab, linkedHoldingsForAllFav]
  );
  const togglePercentMode = useCallback((code) => {
    setPercentModes((prev) => ({ ...prev, [code]: !prev[code] }));
  }, []);
  const toggleTodayPercentMode = useCallback((code) => {
    setTodayPercentModes((prev) => ({ ...prev, [code]: !prev[code] }));
  }, []);

  const getFundCardPropsForRow = useCallback(
    (row) => {
      const fund = row?.rawFund || (row ? { code: row.code, name: row.fundName } : null);
      if (!fund) return {};
      return {
        fundCode: fund.code,
        fallbackFund: fund,
        todayStr,
        currentTab,
        favorites,
        dcaPlans: dcaPlansForTab,
        holdings: holdingsForTabWithLinked,
        percentModes,
        todayPercentModes,
        fundDailyEarnings: currentFundDailyEarnings,
        valuationSeries,
        collapsedCodes,
        collapsedTrends,
        collapsedValuationTrends,
        collapsedEarnings,
        transactions: transactionsForTab,
        theme,
        isTradingDay,
        getHoldingProfit: getHoldingProfitForTab,
        onToggleFavorite: toggleFavorite,
        onAddFund: handleMarketTabAddFund,
        onRemoveFund: handleRemoveFundEntry,
        onHoldingClick: openHoldingModal,
        onActionClick: openActionModal,
        onDataSourceClick: openDataSourceModal,
        onPercentModeToggle: togglePercentMode,
        onTodayPercentModeToggle: toggleTodayPercentMode,
        onToggleCollapse: toggleCollapse,
        onToggleTrendCollapse: toggleTrendCollapse,
        onToggleValuationTrendCollapse: toggleValuationTrendCollapse,
        onToggleEarningsCollapse: toggleEarningsCollapse,
        masked: maskAmounts,
        layoutMode: 'drawer',
        isHoldingLinked: !!row?.isHoldingLinked,
        fundTags: row?.fundTags || [],
        onFundTagsClick: openFundTagsEdit,
        fundExtraData: fundExtraDataByCode[fund.code] || fund.fundExtraData,
        groupTotalHoldingAmount,
        hasDca: row
          ? row.hasDca
          : !!row?.isHoldingLinked
            ? allEnabledDcaCodes.has(fund.code)
            : dcaPlansForTab[fund.code]?.enabled === true,
        hasPending: pendingCodesForTab.has(fund.code),
        userId: user?.id
      };
    },
    [
      todayStr,
      currentTab,
      favorites,
      dcaPlansForTab,
      allEnabledDcaCodes,
      holdingsForTabWithLinked,
      percentModes,
      todayPercentModes,
      currentFundDailyEarnings,
      valuationSeries,
      collapsedCodes,
      collapsedTrends,
      collapsedValuationTrends,
      collapsedEarnings,
      transactionsForTab,
      theme,
      isTradingDay,
      getHoldingProfitForTab,
      toggleFavorite,
      handleRemoveFundEntry,
      openHoldingModal,
      openActionModal,
      openDataSourceModal,
      togglePercentMode,
      toggleTodayPercentMode,
      toggleCollapse,
      toggleTrendCollapse,
      toggleValuationTrendCollapse,
      toggleEarningsCollapse,
      maskAmounts,
      openFundTagsEdit,
      fundExtraDataByCode,
      groupTotalHoldingAmount,
      pendingCodesForTab,
      user?.id
    ]
  );

  // ModalsLayer 回调 ref：页面级回调与数据通过 ref 注入，不触发重渲染
  const modalCbRef = useRef({});
  modalCbRef.current = {
    // 业务回调
    handleClearConfirm,
    handleDeleteTransaction,
    handleAddHistory,
    handleAction,
    handleTrade,
    handleSaveHolding,
    handleAddGroup,
    handleUpdateGroups,
    handleAddFundsToGroup,
    handleDataSourceSelect,
    handleSyncLocalConfig,
    handleSaveFundTags,
    handleAddPoolTag,
    handleDeleteGlobalTag,
    handleUpdateGlobalTag,
    getTagUsageLabels,
    handleMoveFunds,
    handleMergeAllGroupTransactionsToCurrent,
    stripFundFromGroupScope,
    removeFund,
    removeFundsBulk,
    stripManyFundsFromGroupScope,
    applyCloudConfig: (data) => {
      applyCloudConfig(data);
    },
    syncUserConfig,
    fetchCloudConfig: (userId, isInitialSync, remoteData, isPartial, opts) =>
      fetchCloudConfig?.(userId, isInitialSync, remoteData, isPartial, opts),
    refreshAll: (codes) => refreshAll?.(codes),
    showToast,
    cancelScan,
    handleScanPick: (e) => handleScanPick?.(e),
    handleRetryOcr: () => handleRetryOcr?.(),
    handleFilesDrop: (e) => handleFilesDrop?.(e),
    toggleScannedCode: (code) => toggleScannedCode?.(code),
    editScannedFundCode: (oldCode, newCode, newName) => editScannedFundCode?.(oldCode, newCode, newName),
    confirmScanImport: (...args) => confirmScanImport?.(...args),
    // 辅助函数
    getScopedHolding: (code, groupIdOverride) => getScopedHolding?.(code, groupIdOverride),
    getScopedGroupId: (groupIdOverride) => getScopedGroupId?.(groupIdOverride),
    getHoldingProfit: getHoldingProfitForTab,
    getScopedDcaPlan: (code, groupIdOverride) => getScopedDcaPlan?.(code, groupIdOverride),
    // 数据
    funds,
    groups,
    groupHoldings,
    transactions,
    holdings,
    dcaPlans,
    pendingTrades,
    fundTagRecords,
    fundTagListsByCode,
    favorites,
    scannedFunds: scannedFunds ?? [],
    selectedScannedCodes: selectedScannedCodes ?? new Set(),
    isOcrScan: isOcrScan ?? false,
    refreshing,
    user,
    portfolioDailySeries,
    currentTab,
    theme,
    // Settings
    tempSeconds,
    setTempSeconds,
    containerWidth,
    setContainerWidth,
    importMsg: isString(importMsg) ? importMsg : '',
    saveSettings,
    exportLocalData,
    handleResetContainerWidth,
    handleImportFileChange,
    importFileRef: importFileRef ?? { current: null },
    fileInputRef: fileInputRef ?? { current: null },
    showMarketIndexPc,
    showMarketIndexMobile,
    showGroupFundSearchPc,
    showGroupFundSearchMobile,
    dynamicStylePc,
    dynamicStyleMobile,
    showGroupDropdownPc,
    showGroupDropdownMobile,
    scanProgress: scanProgress ?? { stage: 'ocr', current: 0, total: 0 },
    scanImportProgress: scanImportProgress ?? { current: 0, total: 0, success: 0, failed: 0 },
    // Refs
    fundDetailDrawerCloseRef,
    fundDetailDialogCloseRef,
    pcBatchClearSelectionRef,
    mobileBatchClearSelectionRef,
    skipSyncRef,
    refreshCycleStartRef,
    isExplicitLoginRef,
    // Setters
    setPendingTrades,
    setHoldings,
    setGroupHoldings,
    setTransactions,
    setDcaPlans,
    setFundTagRecords,
    setFunds,
    setFavorites
  };

  return (
    <NavLayout
      mainTab={mainTab}
      setMainTab={setMainTab}
      isMobile={isMobile}
      containerRef={containerRef}
      containerClassName={containerClassName}
      containerWidth={containerWidth}
      showThemeTransition={showThemeTransition}
      setShowThemeTransition={setShowThemeTransition}
      mobileBottomNavHidden={mobileBottomNavHidden}
    >
      <div
        className="mobile-main-tab-panel mobile-main-tab-panel--home"
        style={{ display: mobileHomeTabVisible ? 'contents' : 'none' }}
        aria-hidden={!mobileHomeTabVisible || undefined}
      >
        <>
          <Announcement />
          <div className="navbar glass" ref={navbarRef}>
            {refreshing && <div className="loading-bar"></div>}
            <div className={`brand ${isSearchFocused || selectedFunds.length > 0 ? 'search-focused-sibling' : ''}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      marginRight: 4,
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden'
                    }}
                  >
                    {/* 同步中图标 */}
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        margin: 'auto',
                        opacity: isSyncing ? 1 : 0,
                        transform: isSyncing ? 'translateY(0px)' : 'translateY(4px)',
                        transition: 'opacity 0.25s ease, transform 0.25s ease'
                      }}
                    >
                      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" stroke="var(--primary)" />
                      <path d="M12 12v9" stroke="var(--accent)" />
                      <path d="m16 16-4-4-4 4" stroke="var(--accent)" />
                    </svg>
                    {/* 默认图标 */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        margin: 'auto',
                        opacity: isSyncing ? 0 : 1,
                        transform: isSyncing ? 'translateY(-4px)' : 'translateY(0px)',
                        transition: 'opacity 0.25s ease, transform 0.25s ease'
                      }}
                    >
                      <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="2" />
                      <path d="M5 14c2-4 7-6 14-5" stroke="var(--primary)" strokeWidth="2" />
                    </svg>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isSyncing ? '正在同步到云端...' : undefined}</p>
                </TooltipContent>
              </Tooltip>
              <span>基估宝</span>
            </div>
            <div
              className={`glass add-fund-section navbar-add-fund ${isSearchFocused || selectedFunds.length > 0 ? 'search-focused' : ''}`}
              role="region"
              aria-label="添加基金"
            >
              <div className="search-container" ref={dropdownRef}>
                {selectedFunds.length > 0 && (
                  <div className="selected-inline-chips" style={{ marginBottom: 8, marginLeft: 0 }}>
                    {selectedFunds.map((fund) => (
                      <div key={fund.CODE} className="fund-chip">
                        <span>{fund.NAME}</span>
                        <button onClick={() => toggleSelectFund(fund)} className="remove-chip">
                          <CloseIcon width="14" height="14" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <SearchBar
                  inputRef={inputRef}
                  searchTerm={searchTerm}
                  handleSearchInput={handleSearchInput}
                  showDropdown={showDropdown}
                  setShowDropdown={setShowDropdown}
                  isSearchFocused={isSearchFocused}
                  setIsSearchFocused={setIsSearchFocused}
                  searchResults={searchResults}
                  isSearching={isSearching}
                  selectedFunds={selectedFunds}
                  toggleSelectFund={toggleSelectFund}
                  isScanning={isScanning}
                  handleScanClick={handleScanClick}
                  addFund={addFund}
                />
              </div>
              {error && (
                <div className="muted" style={{ marginTop: 8, color: 'var(--danger)' }}>
                  {error}
                </div>
              )}
            </div>
            <div className={`actions ${isSearchFocused || selectedFunds.length > 0 ? 'search-focused-sibling' : ''}`}>
              <UpdateChecker onModalOpenChange={setIsUpdateModalOpen} />
              <span className="github-icon-wrap">
                <Image
                  unoptimized
                  alt="项目Github地址"
                  src={githubImg}
                  style={{ width: '30px', height: '30px', cursor: 'pointer' }}
                  onClick={() => window.open('https://github.com/hzm0321/real-time-fund')}
                />
              </span>
              {isMobile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="icon-button mobile-search-btn"
                      aria-label="筛选基金"
                      onClick={handleMobileSearchClick}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                        <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>筛选</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <RefreshButton
                refreshMs={refreshMs}
                manualRefresh={manualRefresh}
                refreshing={refreshing}
                fundsLength={funds.length}
                refreshCycleStartRef={refreshCycleStartRef}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="icon-button"
                    aria-label={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
                    onClick={handleThemeToggle}
                  >
                    {theme === 'dark' ? <SunIcon width="18" height="18" /> : <MoonIcon width="18" height="18" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{theme === 'dark' ? '亮色' : '暗色'}</p>
                </TooltipContent>
              </Tooltip>
              <UserMenu
                user={user}
                userAvatar={userAvatar}
                navbarHeight={navbarHeight}
                lastSyncTime={lastSyncTime}
                isSyncing={isSyncing}
                onSync={() => user?.id && syncUserConfig(user.id)}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenPortfolioEarnings={() => setPortfolioEarningsOpen(true)}
                onOpenLogin={handleOpenLogin}
                onLogout={handleLogout}
                onLogoutConfirmOpenChange={setIsLogoutConfirmOpen}
                onTutorial={() => {
                  if (isMobile) {
                    setTutorialDrawerOpen(true);
                  } else {
                    window.open(`https://fund.cc.cd/home/docs/help?theme=${theme || 'dark'}`, '_blank');
                  }
                }}
                onUpdateLog={() => setUpdateLogOpen(true)}
              />
            </div>
          </div>
          {shouldShowMarketIndex && (
            <MarketIndexAccordion
              navbarHeight={navbarHeight}
              onCustomSettingsChange={triggerCustomSettingsSync}
              refreshing={refreshing}
            />
          )}
          <div style={{ display: mainTab === 'home' ? 'contents' : 'none' }}>
            <div className="grid">
              <div className="col-12">
                <div
                  ref={filterBarRef}
                  className="filter-bar"
                  style={{
                    top: `calc(${navbarHeight}px + var(--market-index-height, 0px))`,
                    marginTop: !shouldShowMarketIndex ? navbarHeight : 0,
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12
                  }}
                >
                  <div className="tabs-container">
                    <div
                      className="tabs-scroll-wrapper"
                      style={{
                        position: 'relative',
                        flex: 1,
                        minWidth: 0,
                        paddingLeft: !showGroupDropdown && !isMobile && hasTabOverflow ? 32 : 0,
                        paddingRight: !showGroupDropdown && !isMobile && hasTabOverflow ? 32 : 0,
                        transition: 'padding 0.2s ease'
                      }}
                    >
                      <AnimatePresence>
                        {!showGroupDropdown && !isMobile && hasTabOverflow && (
                          <>
                            <motion.button
                              initial={{ opacity: 0, scale: 0.8, y: '-50%', x: 0 }}
                              animate={{ opacity: 1, scale: 1, y: '-50%', x: 0 }}
                              exit={{ opacity: 0, scale: 0.8, y: '-50%', x: 0 }}
                              whileHover={canLeft ? { scale: 1.1, y: '-50%', x: 0 } : {}}
                              whileTap={canLeft ? { scale: 0.95, y: '-50%', x: 0 } : {}}
                              transition={{ duration: 0.15 }}
                              className={`tabs-scroll-btn left ${!canLeft ? 'opacity-30 cursor-not-allowed' : ''}`}
                              disabled={!canLeft}
                              title="单击向左滚动，双击滚动到最左端"
                              onClick={scrollTabsLeftBtn}
                              onDoubleClick={scrollTabsToLeftEnd}
                            >
                              <ChevronLeft size={16} />
                            </motion.button>
                            <motion.button
                              initial={{ opacity: 0, scale: 0.8, y: '-50%', x: 0 }}
                              animate={{ opacity: 1, scale: 1, y: '-50%', x: 0 }}
                              exit={{ opacity: 0, scale: 0.8, y: '-50%', x: 0 }}
                              whileHover={canRight ? { scale: 1.1, y: '-50%', x: 0 } : {}}
                              whileTap={canRight ? { scale: 0.95, y: '-50%', x: 0 } : {}}
                              transition={{ duration: 0.15 }}
                              className={`tabs-scroll-btn right ${!canRight ? 'opacity-30 cursor-not-allowed' : ''}`}
                              disabled={!canRight}
                              title="单击向右滚动，双击滚动到最右端"
                              onClick={scrollTabsRightBtn}
                              onDoubleClick={scrollTabsToRightEnd}
                            >
                              <ChevronRight size={16} />
                            </motion.button>
                          </>
                        )}
                      </AnimatePresence>
                      <div
                        className="tabs-scroll-area"
                        ref={scrollAreaRef}
                        data-mask-left={!showGroupDropdown && canLeft}
                        data-mask-right={!showGroupDropdown && canRight}
                        onMouseDown={handleMouseDown}
                        onMouseLeave={handleMouseLeaveOrUp}
                        onMouseUp={handleMouseLeaveOrUp}
                        onMouseMove={handleMouseMove}
                        onWheel={handleWheel}
                        onScroll={updateTabOverflow}
                      >
                        <div className="tabs" ref={tabsRef}>
                          <AnimatePresence mode="popLayout">
                            {showPortfolioSummaryTab && (
                              <motion.button
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                key="portfolio-summary"
                                className={`tab ${currentTab === SUMMARY_TAB_ID ? 'active' : ''}`}
                                onClick={() => handleTabClick(SUMMARY_TAB_ID)}
                                transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                              >
                                汇总
                              </motion.button>
                            )}
                            <motion.button
                              layout
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              key="all"
                              className={`tab ${currentTab === 'all' ? 'active' : ''}`}
                              onClick={() => handleTabClick('all')}
                              transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                            >
                              全部 ({funds.length})
                            </motion.button>
                            {!showGroupDropdown &&
                              groups.map((g) => {
                                const isFav = g.id === 'fav' || g.isPreset;
                                const count = isFav ? favorites.size : g.codes?.length || 0;
                                const label = isFav ? '自选' : g.name;
                                return (
                                  <motion.button
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    key={g.id}
                                    className={`tab ${currentTab === g.id ? 'active' : ''}`}
                                    onClick={() => handleTabClick(g.id)}
                                    transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                                  >
                                    {label} ({count})
                                  </motion.button>
                                );
                              })}
                            {showGroupDropdown && (
                              <div
                                key="group-dropdown"
                                style={{ minWidth: isMobile ? 170 : 210, maxWidth: isMobile ? 230 : 300 }}
                              >
                                <Select
                                  value={isGroupDropdownTabActive ? currentTab : ''}
                                  onValueChange={(value) => handleTabClick(value)}
                                >
                                  <SelectTrigger
                                    className={cn(
                                      'h-4 py-0 text-xs shadow-none',
                                      isGroupDropdownTabActive &&
                                        'border-primary/70 text-primary ring-1 ring-primary/25'
                                    )}
                                    style={{
                                      background: isGroupDropdownTabActive
                                        ? 'color-mix(in srgb, var(--primary) 12%, var(--card-bg))'
                                        : 'var(--card-bg)',
                                      boxShadow: isGroupDropdownTabActive
                                        ? '0 0 0 1px rgba(255, 255, 255, 0.05), 0 6px 18px rgba(34, 211, 238, 0.12)'
                                        : undefined,
                                      height: 32
                                    }}
                                    aria-label="选择分组"
                                  >
                                    <SelectValue placeholder="选择分组" />
                                  </SelectTrigger>
                                  <SelectContent
                                    position="popper"
                                    align="start"
                                    style={{
                                      width: isMobile ? 230 : 300
                                    }}
                                  >
                                    <SelectGroup>
                                      {groups.map((g) => {
                                        const isFav = g.id === 'fav' || g.isPreset;
                                        const count = isFav ? favorites.size : g.codes?.length || 0;
                                        const label = isFav ? '自选' : g.name;
                                        return (
                                          <SelectItem key={g.id} value={g.id}>
                                            {label} ({count})
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </AnimatePresence>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="icon-button add-group-btn" onClick={() => setGroupModalOpen(true)}>
                                <PlusIcon width="16" height="16" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>新增分组</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                    {groups.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="icon-button manage-groups-btn" onClick={() => setGroupManageOpen(true)}>
                            <SortIcon width="16" height="16" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>管理分组</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  <div
                    className="sort-group"
                    style={{
                      display: currentTab === SUMMARY_TAB_ID ? 'none' : 'flex',
                      alignItems: 'center',
                      gap: 12
                    }}
                  >
                    <div
                      className="view-toggle"
                      style={{
                        display: 'flex',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '10px',
                        padding: '2px'
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className={`icon-button ${viewMode === 'card' ? 'active' : ''}`}
                            onClick={() => {
                              applyViewMode('card');
                            }}
                            style={{
                              border: 'none',
                              width: '32px',
                              height: '32px',
                              background: viewMode === 'card' ? 'var(--primary)' : 'transparent',
                              color: viewMode === 'card' ? '#05263b' : 'var(--muted)'
                            }}
                          >
                            <GridIcon width="16" height="16" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>卡片视图</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className={`icon-button ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => {
                              applyViewMode('list');
                            }}
                            style={{
                              border: 'none',
                              width: '32px',
                              height: '32px',
                              background: viewMode === 'list' ? 'var(--primary)' : 'transparent',
                              color: viewMode === 'list' ? '#05263b' : 'var(--muted)'
                            }}
                          >
                            <ListIcon width="16" height="16" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>表格视图</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="divider" style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

                    <div className="sort-items" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => setSortSettingOpen(true)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '12px',
                              color: 'var(--muted-foreground)',
                              cursor: 'pointer',
                              width: '50px'
                            }}
                          >
                            <span className="muted">排序</span>
                            <SettingsIcon width="14" height="14" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>排序个性化设置</p>
                        </TooltipContent>
                      </Tooltip>
                      {(isMobile ? mobileSortDisplayMode : pcSortDisplayMode) === 'dropdown' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Select
                            value={sortBy}
                            onValueChange={(nextSortBy) => {
                              startTransition(() => {
                                setSortBy(nextSortBy);
                                if (nextSortBy !== sortBy) setSortOrder('desc');
                              });
                            }}
                          >
                            <SelectTrigger
                              className="h-4 min-w-[110px] py-0 text-xs shadow-none"
                              style={{ background: 'var(--card-bg)', height: 36 }}
                            >
                              <SelectValue placeholder="选择排序规则" />
                            </SelectTrigger>
                            <SelectContent>
                              {sortRules
                                .filter((s) => s.enabled)
                                .map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.alias || s.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={sortOrder}
                            onValueChange={(value) => {
                              startTransition(() => {
                                setSortOrder(value);
                              });
                            }}
                          >
                            <SelectTrigger
                              className="h-4 min-w-[84px] py-0 text-xs shadow-none"
                              style={{ background: 'var(--card-bg)', height: 36 }}
                            >
                              <SelectValue placeholder="排序方向" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="desc">降序</SelectItem>
                              <SelectItem value="asc">升序</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="chips">
                          {sortRules
                            .filter((s) => s.enabled)
                            .map((s) => (
                              <button
                                key={s.id}
                                className={`chip ${sortBy === s.id ? 'active' : ''}`}
                                onClick={() => {
                                  startTransition(() => {
                                    if (sortBy === s.id) {
                                      // 同一按钮重复点击，切换升序/降序
                                      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                                    } else {
                                      // 切换到新的排序字段，默认用降序
                                      setSortBy(s.id);
                                      setSortOrder('desc');
                                    }
                                  });
                                }}
                                style={{
                                  height: '28px',
                                  fontSize: '12px',
                                  padding: '0 10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <span>{s.alias || s.label}</span>
                                {s.id !== 'default' && sortBy === s.id && (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      flexDirection: 'column',
                                      lineHeight: 1,
                                      fontSize: '8px'
                                    }}
                                  >
                                    <span style={{ opacity: sortOrder === 'asc' ? 1 : 0.3 }}>▲</span>
                                    <span style={{ opacity: sortOrder === 'desc' ? 1 : 0.3 }}>▼</span>
                                  </span>
                                )}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {scopedFunds.length === 0 && !(currentTab === SUMMARY_TAB_ID && showPortfolioSummaryTab) ? (
                  <EmptyStateCard
                    fundsLength={funds.length}
                    currentTab={currentTab}
                    onAddToGroup={() => setAddFundToGroupOpen(true)}
                  />
                ) : (
                  <>
                    {currentTab === SUMMARY_TAB_ID ? (
                      <SummaryTabContent
                        funds={displayFunds}
                        holdings={holdingsForTabWithLinked}
                        groups={groups}
                        getProfit={getHoldingProfitForTab}
                        summaryTabPortfolioTotals={summaryTabPortfolioTotals}
                        navbarHeight={navbarHeight}
                        filterBarHeight={filterBarHeight}
                        isGroupSummarySticky={isGroupSummarySticky}
                        setIsGroupSummarySticky={setIsGroupSummarySticky}
                        maskAmounts={maskAmounts}
                        setMaskAmounts={setMaskAmounts}
                        shouldShowMarketIndex={shouldShowMarketIndex}
                        summaryCardItems={summaryCardItems}
                        isMobile={isMobile}
                        startTransition={startTransition}
                        setCurrentTab={setCurrentTab}
                      />
                    ) : (
                      <GroupSummary
                        funds={displayFunds}
                        holdings={holdingsForTabWithLinked}
                        portfolioTabId={currentTab}
                        groups={groups}
                        getProfit={getHoldingProfitForTab}
                        summaryTotalsOverride={null}
                        stickyTop={navbarHeight + filterBarHeight + (isMobile ? -14 : 0)}
                        isSticky={isGroupSummarySticky}
                        onToggleSticky={(next) => setIsGroupSummarySticky(next)}
                        masked={maskAmounts}
                        onToggleMasked={() => setMaskAmounts((v) => !v)}
                        shouldShowMarketIndex={shouldShowMarketIndex}
                        navbarHeight={navbarHeight}
                      />
                    )}
                    {currentTab !== SUMMARY_TAB_ID && (
                      <>
                        {shouldShowGroupFundSearch && (
                          <SearchFund value={groupFundSearchTerm} onSearch={(next) => setGroupFundSearchTerm(next)} />
                        )}

                        {displayFunds.length === 0 ? (
                          <div className="glass" style={{ marginTop: 10 }}>
                            <Empty className="border-border/60">
                              <EmptyHeader>
                                <EmptyMedia variant="icon">
                                  <span className="text-3xl" aria-hidden="true">
                                    📂
                                  </span>
                                </EmptyMedia>
                                <EmptyTitle>未找到相关基金</EmptyTitle>
                                <EmptyDescription>
                                  试试搜索基金名称的部分关键词，或直接输入 6 位基金代码。
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          </div>
                        ) : (
                          <FundListView
                            viewMode={viewMode}
                            isGroupSummarySticky={isGroupSummarySticky}
                            navbarHeight={navbarHeight}
                            filterBarHeight={filterBarHeight}
                            pcFundTableData={pcFundTableData}
                            userId={user?.id}
                            currentTab={currentTab}
                            groups={groups}
                            favorites={favorites}
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                            sortRules={sortRules}
                            setSortBy={setSortBy}
                            setSortOrder={setSortOrder}
                            startTransition={startTransition}
                            handleReorder={handleReorder}
                            handleRemoveFundEntry={handleRemoveFundEntry}
                            removeFundsFromCurrentTabHandler={removeFundsFromCurrentTabHandler}
                            handleMoveFunds={handleMoveFunds}
                            pcBatchClearSelectionRef={pcBatchClearSelectionRef}
                            handleToggleFavoriteRow={handleToggleFavoriteRow}
                            handleHoldingAmountClickRow={handleHoldingAmountClickRow}
                            handleHoldingProfitClickRow={handleHoldingProfitClickRow}
                            triggerCustomSettingsSync={triggerCustomSettingsSync}
                            fundDetailDialogCloseRef={fundDetailDialogCloseRef}
                            maskAmounts={maskAmounts}
                            getFundCardPropsForRow={getFundCardPropsForRow}
                            openFundTagsEdit={openFundTagsEdit}
                            fundExtraDataByCode={fundExtraDataByCode}
                            fundDetailDrawerCloseRef={fundDetailDrawerCloseRef}
                            mobileBatchClearSelectionRef={mobileBatchClearSelectionRef}
                            handleFundCardDrawerOpenChange={handleFundCardDrawerOpenChange}
                            handleMobileSettingModalOpenChange={handleMobileSettingModalOpenChange}
                            displayFunds={displayFunds}
                            linkedHoldingsForAllFav={linkedHoldingsForAllFav}
                            todayStr={todayStr}
                            dcaPlansForTab={dcaPlansForTab}
                            holdingsForTabWithLinked={holdingsForTabWithLinked}
                            percentModes={percentModes}
                            todayPercentModes={todayPercentModes}
                            currentFundDailyEarnings={currentFundDailyEarnings}
                            valuationSeries={valuationSeries}
                            collapsedCodes={collapsedCodes}
                            collapsedTrends={collapsedTrends}
                            collapsedValuationTrends={collapsedValuationTrends}
                            collapsedEarnings={collapsedEarnings}
                            transactionsForTab={transactionsForTab}
                            theme={theme}
                            isTradingDay={isTradingDay}
                            getHoldingProfitForTab={getHoldingProfitForTab}
                            toggleFavorite={toggleFavorite}
                            openHoldingModal={openHoldingModal}
                            openActionModal={openActionModal}
                            openDataSourceModal={openDataSourceModal}
                            togglePercentMode={togglePercentMode}
                            toggleTodayPercentMode={toggleTodayPercentMode}
                            toggleCollapse={toggleCollapse}
                            toggleTrendCollapse={toggleTrendCollapse}
                            toggleValuationTrendCollapse={toggleValuationTrendCollapse}
                            toggleEarningsCollapse={toggleEarningsCollapse}
                            fundTagListsByCode={fundTagListsByCode}
                            groupTotalHoldingAmount={groupTotalHoldingAmount}
                          />
                        )}
                      </>
                    )}

                    {currentTab !== 'all' && currentTab !== 'fav' && currentTab !== SUMMARY_TAB_ID && (
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="button-dashed"
                        onClick={() => setAddFundToGroupOpen(true)}
                        style={{
                          width: '100%',
                          height: '48px',
                          border: '2px dashed var(--border)',
                          background: 'transparent',
                          borderRadius: '12px',
                          color: 'var(--muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          marginTop: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          fontSize: '14px',
                          fontWeight: 500
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--primary)';
                          e.currentTarget.style.color = 'var(--primary)';
                          e.currentTarget.style.background = 'rgba(34, 211, 238, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.color = 'var(--muted)';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <PlusIcon width="18" height="18" />
                        <span>添加基金到此分组</span>
                      </motion.button>
                    )}
                  </>
                )}
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFilesUpload}
            />

            <div className="footer">
              {!isMobile && (
                <>
                  <p style={{ marginBottom: 8 }}>
                    数据源：实时估值与重仓直连东方财富，仅供个人学习及参考使用。数据可能存在延迟，不作为任何投资建议
                  </p>
                  <p style={{ marginBottom: 12 }}>注：估算数据与真实结算数据会有1%左右误差，非股票型基金误差较大</p>
                  <div
                    style={{
                      marginTop: 12,
                      opacity: 0.8,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      遇到任何问题或需求建议可
                      <button
                        className="link-button"
                        onClick={() => {
                          if (!user?.id) {
                            sonnerToast.error('请先登录后再提交反馈');
                            return;
                          }
                          setFeedbackNonce((n) => n + 1);
                          setFeedbackOpen(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          padding: '0 4px',
                          textDecoration: 'underline',
                          fontSize: 'inherit',
                          fontWeight: 600
                        }}
                      >
                        点此提交反馈
                      </button>
                      ，或
                      <button
                        className="link-button"
                        onClick={() => _ms({ weChatOpen: true })}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          padding: '0 4px',
                          textDecoration: 'underline',
                          fontSize: 'inherit',
                          fontWeight: 600
                        }}
                      >
                        加入微信用户支持群
                      </button>
                    </p>
                    <button
                      onClick={() => setDonateOpen(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--muted)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        borderRadius: '6px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--primary)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--muted)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span>☕</span>
                      <span>点此请作者喝杯咖啡</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {hasVisitedMarketTab && (
            <div style={{ display: mainTab === 'market' ? 'contents' : 'none' }}>
              <MarketTab
                onAddFund={handleMarketTabAddFund}
                getFundCardProps={getFundCardPropsForRow}
                isActive={mainTab === 'market'}
              />
            </div>
          )}
        </>
      </div>
      {isMobile && (
        <MineTab
          visible={mainTab === 'mine'}
          user={user}
          userAvatar={userAvatar}
          lastSyncDisplay={lastSyncTime ? dayjs(lastSyncTime).format('MM-DD HH:mm') : null}
          onLogin={handleOpenLogin}
          onMyEarnings={() => setPortfolioEarningsOpen(true)}
          onTutorial={() => {
            if (isMobile) {
              setTutorialDrawerOpen(true);
            } else {
              window.open(`https://fund.cc.cd/home/docs/help?theme=${theme || 'dark'}`, '_blank');
            }
          }}
          onUpdateLog={() => setUpdateLogOpen(true)}
          onFeedback={() => {
            if (!user?.id) {
              sonnerToast.error('请先登录后再提交反馈');
              return;
            }
            setFeedbackNonce((n) => n + 1);
            setFeedbackOpen(true);
          }}
          onSponsorSupport={() => setDonateOpen(true)}
          onOpenWeChat={() => _ms({ weChatOpen: true })}
        />
      )}
      {/* 弹框渲染层 - 独立组件，订阅 useModalStore，不触发 page.jsx 重渲染 */}
      <ModalsLayer callbacksRef={modalCbRef} />
    </NavLayout>
  );
}
