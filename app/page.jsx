'use client';

import { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import ScanButton from './components/ScanButton';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { createWorker } from 'tesseract.js';
import { createAvatar } from '@dicebear/core';
import { identicon } from '@dicebear/collection';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { isNumber, isString, isPlainObject, isNil } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { toast as sonnerToast } from 'sonner';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Announcement from "./components/Announcement";
import EmptyStateCard from "./components/EmptyStateCard";
import FundCard from "./components/FundCard";
import GroupSummary from "./components/GroupSummary";
import GroupAccountSummaryCard from "./components/GroupAccountSummaryCard";
import {
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  CalendarIcon,
  GridIcon,
  ListIcon,
  LoginIcon,
  LogoutIcon,
  MoonIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SettingsIcon,
  SortIcon,
  SunIcon,
  UserIcon,
  CameraIcon,
  FolderPlusIcon,
} from "./components/Icons";
import AddFundToGroupModal from "./components/AddFundToGroupModal";
import CloudConfigModal from "./components/CloudConfigModal";
import ConfirmModal from "./components/ConfirmModal";
import DonateModal from "./components/DonateModal";
import FeedbackModal from "./components/FeedbackModal";
import GroupManageModal from "./components/GroupManageModal";
import GroupModal from "./components/GroupModal";
import HoldingEditModal from "./components/HoldingEditModal";
import HoldingActionModal from "./components/HoldingActionModal";
import LoginModal from "./components/LoginModal";
import ScanImportConfirmModal from "./components/ScanImportConfirmModal";
import ScanImportProgressModal from "./components/ScanImportProgressModal";
import ScanPickModal from "./components/ScanPickModal";
import ScanProgressModal from "./components/ScanProgressModal";
import SettingsModal from "./components/SettingsModal";
import SuccessModal from "./components/SuccessModal";
import TradeModal from "./components/TradeModal";
import TransactionHistoryModal from "./components/TransactionHistoryModal";
import AddHistoryModal from "./components/AddHistoryModal";
import UpdateChecker from "./components/UpdateChecker";
import UserMenu from "./components/UserMenu";
import RefreshButton from "./components/RefreshButton";
import WeChatModal from "./components/WeChatModal";
import DcaModal from "./components/DcaModal";
import FundConvertModal from "./components/FundConvertModal";
import SelectFundSingleModal from "./components/SelectFundSingleModal";
import SelectHoldingGroupModal from "./components/SelectHoldingGroupModal";
import MarketIndexAccordion from "./components/MarketIndexAccordion";
import SortSettingModal from "./components/SortSettingModal";
import githubImg from "./assets/github.svg";
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { recordValuation, getAllValuationSeries, clearFund } from './lib/valuationTimeseries';
import {
  DAILY_EARNINGS_SCOPE_ALL,
  recordDailyEarnings,
  clearDailyEarnings,
  aggregatePortfolioDailyEarnings,
} from './lib/dailyEarnings';
import { loadHolidaysForYears, isTradingDay as isDateTradingDay } from './lib/tradingCalendar';
import { asyncPool } from './lib/asyncHelper';
import { parseFundTextWithLLM, fetchFundData, fetchFundNetValueRange, fetchShanghaiIndexDate, fetchSmartFundNetValue, fetchSmartFundNetValueBackward, searchFunds, fetchFundPeriodReturns } from './api/fund';
import PcFundTable from './components/PcFundTable';
import MobileFundTable from './components/MobileFundTable';
import FundTagsEditDialog from './components/FundTagsEditDialog';
import { TAG_THEME_OPTIONS } from './components/AddTagDialog';
import MobileBottomNav from './components/MobileBottomNav';
import MineTab from './components/MineTab';
import SearchFund from './components/SearchFund';
import MyEarningsCalendarPage from './components/MyEarningsCalendarPage';
import { useFundFuzzyMatcher } from './hooks/useFundFuzzyMatcher';
import {useUserStore, clearAuthUser, setAuthUser, useStorageStore, storageStore, getFundCodesSignature, DEFAULT_SORT_RULES, SORT_DISPLAY_MODES} from './stores';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

import {
  getBrowserTimeZone,
  TZ,
  nowInTz,
  toTz,
  formatDate,
  DCA_SCOPE_GLOBAL,
  SUMMARY_TAB_ID,
  SUMMARY_SOURCE_GLOBAL,
  hasOwn,
  DEFAULT_FUND_TAG_THEME,
  normalizeFundTagTheme,
  normalizeFundTagInstanceListFromInput,
  stripLegacyTagsFromFundObject,
  getFundCodesFromTagRecord,
  sanitizeTagRowForStorage,
  serializeTagRecordsForCompare,
  mergeTagRowsByName,
  cloneHoldingDeep,
  normalizeHoldingEntryForSeed,
  seedGroupHoldingsFromGlobal,
  migrateDcaPlansToScoped
} from './lib/fundHelpers';

import GlobalToast from './components/GlobalToast';

export default function HomePage() {
  const {
    funds, setFunds, initFunds,
    groups, setGroups, initGroups,
    favorites, setFavorites, initFavorites,
    collapsedCodes, setCollapsedCodes,
    collapsedTrends, setCollapsedTrends,
    collapsedEarnings, setCollapsedEarnings,
    refreshMs, setRefreshMs,
    holdings, setHoldings,
    groupHoldings, setGroupHoldings,
    pendingTrades, setPendingTrades,
    transactions, setTransactions,
    dcaPlans, setDcaPlans,
    customSettings, setCustomSettings,
    fundDailyEarnings, setFundDailyEarnings,
    initCollapsed, initRefreshMs,
    initHoldings, initGroupHoldings,
    initPendingTrades, initTransactions,
    initDcaPlans, initCustomSettings,
    initFundDailyEarnings,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    pcSortDisplayMode, setPcSortDisplayMode,
    mobileSortDisplayMode, setMobileSortDisplayMode,
    sortRules, setSortRules,
    initSort,
  } = useStorageStore();
  /** 基金标签（独立 localStorage 键 `tags`）：{ id, name, theme, fundCodes: string[] }[] */
  const [fundTagRecords, setFundTagRecords] = useState([]);
  /**
   * 每只基金已选标签实例：仅由 `tags` 推导生成（不再持久化 fundTagLists）。
   * 形状保持为 { [code]: {id,name,theme}[] }，便于复用现有组件接口。
   */
  const fundTagListsByCode = useMemo(() => {
    const out = {};
    const codeSet = new Set((funds || []).map((f) => String(f?.code ?? '').trim()).filter(Boolean));
    for (const r of fundTagRecords || []) {
      if (!r || typeof r !== 'object') continue;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const refreshCycleStartRef = useRef(Date.now());
  const refreshingRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const isExplicitLoginRef = useRef(false);

  // 刷新频率状态
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSeconds, setTempSeconds] = useState(60);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [showMarketIndexPc, setShowMarketIndexPc] = useState(true);
  const [showMarketIndexMobile, setShowMarketIndexMobile] = useState(true);
  const [showGroupFundSearchPc, setShowGroupFundSearchPc] = useState(true);
  const [showGroupFundSearchMobile, setShowGroupFundSearchMobile] = useState(true);
  const [isGroupSummarySticky, setIsGroupSummarySticky] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const parsed = customSettings;
      if (!parsed || typeof parsed !== 'object') return;
      const w = parsed?.pcContainerWidth;
      const num = Number(w);
      if (Number.isFinite(num)) {
        setContainerWidth(Math.min(2000, Math.max(600, num)));
      }
      if (typeof parsed?.showMarketIndexPc === 'boolean') setShowMarketIndexPc(parsed.showMarketIndexPc);
      if (typeof parsed?.showMarketIndexMobile === 'boolean') setShowMarketIndexMobile(parsed.showMarketIndexMobile);
      if (typeof parsed?.showGroupFundSearchPc === 'boolean') setShowGroupFundSearchPc(parsed.showGroupFundSearchPc);
      if (typeof parsed?.showGroupFundSearchMobile === 'boolean') setShowGroupFundSearchMobile(parsed.showGroupFundSearchMobile);
    } catch { }
  }, [customSettings]);

  // 全局刷新状态
  const [refreshing, setRefreshing] = useState(false);

  // 估值分时序列（每次调用估值接口记录，用于分时图）
  const [valuationSeries, setValuationSeries] = useState(() => (typeof window !== 'undefined' ? getAllValuationSeries() : {}));
  // 自选状态
  const [currentTab, setCurrentTab] = useState('all');
  const hasLocalTabInitRef = useRef(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [addFundToGroupOpen, setAddFundToGroupOpen] = useState(false);
  const [sortSettingOpen, setSortSettingOpen] = useState(false);

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
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const deviceIdRef = useRef('');

  useEffect(() => {
    // 优先使用服务端返回的时间，如果没有则使用本地存储的时间
    // 这里只设置初始值，后续更新由接口返回的时间驱动
    const stored = storageStore.getItem('localUpdatedAt');
    if (stored) {
      setLastSyncTime(stored);
    } else {
      // 如果没有存储的时间，暂时设为 null，等待接口返回
      setLastSyncTime(null);
    }
  }, []);

  useEffect(() => {
    try {
      const key = 'rtfDeviceId';
      let id = storageStore.getItem(key);
      if (!id) {
        id = uuidv4();
        storageStore.setItem(key, id);
      }
      deviceIdRef.current = id;
    } catch {
      deviceIdRef.current = uuidv4();
    }
  }, []);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginInitialError, setLoginInitialError] = useState('');

  const userAvatar = useMemo(() => {
    if (!user?.id) return '';
    return createAvatar(identicon, {
      seed: user.id,
      size: 80
    }).toDataUri();
  }, [user?.id]);

  // 反馈弹窗状态
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackNonce, setFeedbackNonce] = useState(0);
  const [weChatOpen, setWeChatOpen] = useState(false);

  // 搜索相关状态
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedFunds, setSelectedFunds] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // 分组内基金列表搜索（点击按钮后才应用）
  const [groupFundSearchTerm, setGroupFundSearchTerm] = useState('');

  // 动态计算 Navbar 和 FilterBar 高度
  const navbarRef = useRef(null);
  const filterBarRef = useRef(null);
  const containerRef = useRef(null);
  const [navbarHeight, setNavbarHeight] = useState(0);
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const [marketIndexAccordionHeight, setMarketIndexAccordionHeight] = useState(0);
  // 主题初始固定为 dark，避免 SSR 与客户端首屏不一致导致 hydration 报错；真实偏好由 useLayoutEffect 在首帧前恢复
  const [theme, setTheme] = useState('dark');
  const [showThemeTransition, setShowThemeTransition] = useState(false);

  const handleThemeToggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    setShowThemeTransition(true);
  }, []);

  // 首帧前同步主题（与 layout 中脚本设置的 data-theme 一致），减少图标闪烁
  useLayoutEffect(() => {
    try {
      const fromDom = document.documentElement.getAttribute('data-theme');
      if (fromDom === 'light' || fromDom === 'dark') {
        setTheme(fromDom);
        return;
      }
      const fromStorage = storageStore.getItem('theme');
      if (fromStorage === 'light' || fromStorage === 'dark') {
        setTheme(fromStorage);
        document.documentElement.setAttribute('data-theme', fromStorage);
      }
    } catch { }
  }, []);

  useEffect(() => {
    const updateHeights = () => {
      if (navbarRef.current) {
        setNavbarHeight(navbarRef.current.offsetHeight);
      }
      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };

    // 初始延迟一下，确保渲染完成
    const timer = setTimeout(updateHeights, 100);
    window.addEventListener('resize', updateHeights);
    return () => {
      window.removeEventListener('resize', updateHeights);
      clearTimeout(timer);
    };
  }, [groups, currentTab]); // groups 或 tab 变化可能导致 filterBar 高度变化

  const handleMobileSearchClick = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsSearchFocused(true);
    // 等待动画完成后聚焦，避免 iOS 键盘弹出问题
    setTimeout(() => {
      inputRef.current?.focus();
    }, 350);
  };

  const [holdingModal, setHoldingModal] = useState({ open: false, fund: null });
  const [actionModal, setActionModal] = useState({ open: false, fund: null });
  const [tradeModal, setTradeModal] = useState({ open: false, fund: null, type: 'buy' }); // type: 'buy' | 'sell'
  const [convertModal, setConvertModal] = useState({ open: false, fund: null });
  const [selectFundSingleModal, setSelectFundSingleModal] = useState({ open: false, excludeCodes: [], initialSelectedCode: '' });
  const [selectHoldingGroupModal, setSelectHoldingGroupModal] = useState({ open: false, fund: null });
  const [dcaModal, setDcaModal] = useState({ open: false, fund: null });
  const [clearConfirm, setClearConfirm] = useState(null); // { fund }
  const [donateOpen, setDonateOpen] = useState(false);
  const [holdingMigrateDialog, setHoldingMigrateDialog] = useState({
    open: false,
    code: null,
    name: '',
    targetGroupId: null,
  });
  const [historyModal, setHistoryModal] = useState({ open: false, fund: null });
  const [addHistoryModal, setAddHistoryModal] = useState({ open: false, fund: null });
  const [percentModes, setPercentModes] = useState({}); // { [code]: boolean }
  const [todayPercentModes, setTodayPercentModes] = useState({}); // { [code]: boolean }

  const holdingsRef = useRef(null);
  const groupHoldingsRef = useRef(null);
  const pendingTradesRef = useRef(null);
  const transactionsRef = useRef(null);

  useEffect(() => {
    holdingsRef.current = holdings;
    groupHoldingsRef.current = groupHoldings;
    pendingTradesRef.current = pendingTrades;
    transactionsRef.current = transactions;
  }, [holdings, groupHoldings, pendingTrades, transactions]);

  const [isTradingDay, setIsTradingDay] = useState(true); // 默认为交易日，通过接口校正
  const tabsRef = useRef(null);
  const [fundDeleteConfirm, setFundDeleteConfirm] = useState(null); // { code, name }
  const [fundDeleteBulkConfirm, setFundDeleteBulkConfirm] = useState(null); // { codes: string[], count: number, groupId?: string, scope?: 'group' | 'global' }
  const fundDetailDrawerCloseRef = useRef(null); // 由 MobileFundTable 注入，用于确认删除时关闭基金详情 Drawer
  const fundDetailDialogCloseRef = useRef(null); // 由 PcFundTable 注入，用于确认删除时关闭基金详情 Dialog
  const pcBatchClearSelectionRef = useRef(null); // 由 PcFundTable 注入，批量删除二次确认成功后清空表格多选
  const mobileBatchClearSelectionRef = useRef(null); // 由 MobileFundTable 注入，批量删除二次确认成功后退出编辑态

  const todayStr = formatDate();

  const [isMobile, setIsMobile] = useState(false);
  const [hoveredPcRowCode, setHoveredPcRowCode] = useState(null); // PC 列表行悬浮高亮
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => setIsMobile(window.innerWidth <= 640);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

  const [mobileMainTab, setMobileMainTab] = useState('home');
  const [mobileBottomNavHidden, setMobileBottomNavHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const [portfolioEarningsOpen, setPortfolioEarningsOpen] = useState(false);
  const [mobileFundDrawerOpen, setMobileFundDrawerOpen] = useState(false);
  const [mobileTableSettingModalOpen, setMobileTableSettingModalOpen] = useState(false);
  const [fundTagsEdit, setFundTagsEdit] = useState({
    open: false,
    code: null,
    name: '',
    tags: [],
  });

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

  const shouldShowMarketIndex = isMobile ? showMarketIndexMobile : showMarketIndexPc;
  const shouldShowGroupFundSearch = isMobile ? showGroupFundSearchMobile : showGroupFundSearchPc;

  // 当关闭大盘指数时，重置它的高度，避免 top/stickyTop 仍沿用旧值
  useEffect(() => {
    if (!shouldShowMarketIndex) setMarketIndexAccordionHeight(0);
  }, [shouldShowMarketIndex]);

  const [isSyncing, setIsSyncing] = useState(false);

  // 存储当前被划开的基金代码
  const [swipedFundCode, setSwipedFundCode] = useState(null);

  // 点击页面其他区域时收起删除按钮
  useEffect(() => {
    const handleClickOutside = (e) => {
      // 检查点击事件是否来自删除按钮
      // 如果点击的是 .swipe-action-bg 或其子元素，不执行收起逻辑
      if (e.target.closest('.swipe-action-bg')) {
        return;
      }

      if (swipedFundCode) {
        setSwipedFundCode(null);
      }
    };

    if (swipedFundCode) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [swipedFundCode]);

  // 检查交易日状态
  const checkTradingDay = async () => {
    const now = nowInTz();
    const isWeekend = now.day() === 0 || now.day() === 6;

    // 周末直接判定为非交易日
    if (isWeekend) {
      setIsTradingDay(false);
      return;
    }

    // 工作日通过上证指数判断是否为节假日
    // 接口返回示例: v_sh000001="1~上证指数~...~20260205150000~..."
    // 第30位是时间字段
    try {
      const dateStr = await fetchShanghaiIndexDate();
      if (!dateStr) {
        setIsTradingDay(!isWeekend);
        return;
      }
      const currentStr = todayStr.replace(/-/g, '');
      if (dateStr === currentStr) {
        setIsTradingDay(true);
      } else {
        const minutes = now.hour() * 60 + now.minute();
        if (minutes >= 9 * 60 + 30) {
          setIsTradingDay(false);
        } else {
          setIsTradingDay(true);
        }
      }
    } catch (e) {
      setIsTradingDay(!isWeekend);
    }
  };

  useEffect(() => {
    checkTradingDay();
    // 每30分钟检查一次
    const timer = setInterval(checkTradingDay, 60000 * 30);
    return () => clearInterval(timer);
  }, []);

  const activeGroupId =
    currentTab !== 'all' &&
    currentTab !== 'fav' &&
    currentTab !== SUMMARY_TAB_ID &&
    groups.some((g) => g.id === currentTab)
      ? currentTab
      : null;

  // 计算持仓收益；可选第三参为分组作用域（汇总卡片/合并列表按分组计算当日收益）
  const getHoldingProfit = useCallback((fund, holding, scopeGroupIdOverride) => {
    if (!holding || !isNumber(holding.share)) return null;

    const txScope = scopeGroupIdOverride !== undefined ? scopeGroupIdOverride : activeGroupId;

    const hasTodayData = fund.jzrq === todayStr;
    const hasTodayValuation = isString(fund.gztime) && fund.gztime.startsWith(todayStr);
    const canCalcTodayProfit = hasTodayData || hasTodayValuation;

    // 如果是交易日且9点以后，且今日净值未出，则强制使用估值（隐藏涨跌幅列模式）
    const useValuation = isTradingDay && !hasTodayData;

    let currentNav;
    let profitToday;
    let shareForTodayProfit = holding.share;

    if (canCalcTodayProfit) {
      // 当日收益口径：按“昨日收盘时持有份额”计算，避免把当日买入份额算进当日收益。
      // 份额基数 = 当前份额 - 当日买入份额 + 当日卖出份额（卖出份额在开盘前仍持有，应计入当日涨跌）
      let buyToday = 0;
      let sellToday = 0;
      const list = transactions && fund?.code ? (transactions[fund.code] || []) : [];
      for (const tx of list) {
        if (!tx || tx.date !== todayStr) continue;
        const gid = tx.groupId || null;
        if (txScope) {
          if (gid !== txScope) continue;
        } else {
          if (gid) continue;
        }
        const s = Number(tx.share);
        if (!Number.isFinite(s) || s <= 0) continue;
        if (tx.type === 'buy') buyToday += s;
        else if (tx.type === 'sell') sellToday += s;
      }
      shareForTodayProfit = Math.max(0, holding.share - buyToday + sellToday);
    }

    if (!useValuation) {
      // 使用确权净值 (dwjz)
      currentNav = Number(fund.dwjz);
      if (!currentNav) return null;

      if (canCalcTodayProfit) {
        const amount = shareForTodayProfit * currentNav;
        // 优先使用昨日净值直接计算（更精确，避免涨跌幅四舍五入误差）
        const lastNav = fund.lastNav != null && fund.lastNav !== '' ? Number(fund.lastNav) : null;
        if (lastNav && Number.isFinite(lastNav) && lastNav > 0) {
          profitToday = (currentNav - lastNav) * shareForTodayProfit;
        } else {
          const gz = isString(fund.gztime) ? toTz(fund.gztime) : null;
          const jz = isString(fund.jzrq) ? toTz(fund.jzrq) : null;
          const preferGszzl =
            !!gz &&
            !!jz &&
            gz.isValid() &&
            jz.isValid() &&
            gz.startOf('day').isAfter(jz.startOf('day'));

          let rate;
          if (preferGszzl) {
            rate = Number(fund.gszzl);
          } else {
            const zzl = fund.zzl !== undefined ? Number(fund.zzl) : Number.NaN;
            rate = Number.isFinite(zzl) ? zzl : Number(fund.gszzl);
          }
          if (!Number.isFinite(rate)) rate = 0;
          profitToday = amount - (amount / (1 + rate / 100));
        }
      } else {
        profitToday = null;
      }
    } else {
      // 否则使用估值
      currentNav = fund.estPricedCoverage > 0.05
        ? fund.estGsz
        : (isNumber(fund.gsz) ? fund.gsz : Number(fund.dwjz));

      if (!currentNav) return null;

      if (canCalcTodayProfit) {
        const amount = shareForTodayProfit * currentNav;
        // 估算涨幅
        const gzChange = fund.estPricedCoverage > 0.05 ? fund.estGszzl : (Number(fund.gszzl) || 0);
        profitToday = amount - (amount / (1 + gzChange / 100));
      } else {
        profitToday = null;
      }
    }

    // 持仓金额
    const amount = holding.share * currentNav;

    // 总收益 = (当前净值 - 成本价) * 份额
    const profitTotal = isNumber(holding.cost)
      ? (currentNav - holding.cost) * holding.share
      : null;

    return {
      amount,
      profitToday,
      profitTotal,
      principalToday: isNumber(holding.cost) ? holding.cost * shareForTodayProfit : 0
    };
  }, [isTradingDay, todayStr, transactions, activeGroupId]);

  const groupsWithHoldings = useMemo(() => {
    const fundByCode = new Map((funds || []).map((f) => [f.code, f]));
    return (groups || []).filter((g) => {
      if (!g?.id || !Array.isArray(g.codes)) return false;
      const bucket = groupHoldings[g.id] || {};
      return g.codes.some((code) => {
        const fund = fundByCode.get(code);
        const h = bucket[code];
        if (!fund || !h) return false;
        const p = getHoldingProfit(fund, h, g.id);
        return p && Number.isFinite(p.amount) && p.amount > 0;
      });
    });
  }, [groups, groupHoldings, funds, getHoldingProfit]);

  /** 「全部」全局 + 各自定义分组账本，逐笔累加（同一基金可同时计入全局与分组） */
  const summaryTabPortfolioTotals = useMemo(() => {
    const fundByCode = new Map((funds || []).map((f) => [f.code, f]));
    let totalAsset = 0;
    let totalProfitToday = 0;
    let totalHoldingReturn = 0;
    let totalCost = 0;
    let totalPrincipalToday = 0;
    let hasHolding = false;
    let hasAnyTodayData = false;

    const accumulate = (fund, holding, scopeGid) => {
      if (!fund || !holding) return;
      const p = getHoldingProfit(fund, holding, scopeGid);
      if (!p || !Number.isFinite(p.amount) || p.amount <= 0) return;
      hasHolding = true;
      totalAsset += Math.round(p.amount * 100) / 100;
      if (p.profitToday != null) {
        totalProfitToday += p.profitToday;
        totalPrincipalToday += (p.principalToday || 0);
        hasAnyTodayData = true;
      }
      if (p.profitTotal != null) {
        totalHoldingReturn += p.profitTotal;
        if (typeof holding.cost === 'number' && typeof holding.share === 'number') {
          totalCost += holding.cost * holding.share;
        }
      }
    };

    Object.entries(holdings || {}).forEach(([code, h]) => {
      accumulate(fundByCode.get(code), h, null);
    });
    (groups || []).forEach((g) => {
      if (!g?.id) return;
      const bucket = groupHoldings[g.id] || {};
      Object.entries(bucket).forEach(([code, h]) => {
        accumulate(fundByCode.get(code), h, g.id);
      });
    });

    const roundedTotalProfitToday = Math.round(totalProfitToday * 100) / 100;
    const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;
    const todayReturnRate = totalPrincipalToday > 0 ? (roundedTotalProfitToday / totalPrincipalToday) * 100 : 0;

    return {
      totalAsset,
      totalProfitToday: roundedTotalProfitToday,
      totalHoldingReturn,
      hasHolding,
      returnRate,
      todayReturnRate,
      hasAnyTodayData,
    };
  }, [funds, holdings, groupHoldings, groups, getHoldingProfit]);

  const hasGlobalPortfolioForSummary = useMemo(() => {
    const fundByCode = new Map((funds || []).map((f) => [f.code, f]));
    return Object.entries(holdings || {}).some(([code, h]) => {
      const fund = fundByCode.get(code);
      if (!fund || !h) return false;
      const p = getHoldingProfit(fund, h, null);
      return p && Number.isFinite(p.amount) && p.amount > 0;
    });
  }, [funds, holdings, getHoldingProfit]);

  const showPortfolioSummaryTab = summaryTabPortfolioTotals.hasHolding;

  const { summaryMergedHoldings, summaryHoldingSourceGroupByCode } = useMemo(() => {
    const fundByCode = new Map((funds || []).map((f) => [f.code, f]));
    const merged = {};
    const sourceByCode = {};
    const codes = new Set();
    Object.entries(holdings || {}).forEach(([code, h]) => {
      const fund = fundByCode.get(code);
      if (!fund || !h) return;
      const p = getHoldingProfit(fund, h, null);
      if (p && Number.isFinite(p.amount) && p.amount > 0) codes.add(code);
    });
    for (const g of groupsWithHoldings) {
      for (const c of g.codes || []) codes.add(c);
    }
    for (const code of codes) {
      const fund = fundByCode.get(code);
      if (!fund) continue;
      let bestAmt = -Infinity;
      let bestH = null;
      let bestGid = null;
      const globalH = holdings[code];
      if (globalH) {
        const p = getHoldingProfit(fund, globalH, null);
        const amt = p?.amount;
        if (Number.isFinite(amt) && amt > bestAmt) {
          bestAmt = amt;
          bestH = globalH;
          bestGid = SUMMARY_SOURCE_GLOBAL;
        }
      }
      for (const g of groupsWithHoldings) {
        const h = groupHoldings[g.id]?.[code];
        if (!h) continue;
        const p = getHoldingProfit(fund, h, g.id);
        const amt = p?.amount;
        if (!Number.isFinite(amt)) continue;
        if (amt > bestAmt) {
          bestAmt = amt;
          bestH = h;
          bestGid = g.id;
        }
      }
      if (bestH != null && bestGid != null) {
        merged[code] = bestH;
        sourceByCode[code] = bestGid;
      }
    }
    return { summaryMergedHoldings: merged, summaryHoldingSourceGroupByCode: sourceByCode };
  }, [groupsWithHoldings, groupHoldings, funds, getHoldingProfit, holdings]);

  useEffect(() => {
    if (currentTab === SUMMARY_TAB_ID && !summaryTabPortfolioTotals.hasHolding) {
      setCurrentTab('all');
    }
  }, [currentTab, summaryTabPortfolioTotals.hasHolding]);

  const summaryCardItems = useMemo(() => {
    if (currentTab !== SUMMARY_TAB_ID) return [];
    const fundByCode = new Map((funds || []).map((f) => [f.code, f]));
    const items = [];

    if (hasGlobalPortfolioForSummary) {
      let totalAsset = 0;
      let totalHoldingReturn = 0;
      let totalCost = 0;
      let totalProfitToday = 0;
      let totalPrincipalToday = 0;
      let hasAnyTodayData = false;
      let upCount = 0;
      let downCount = 0;

      for (const fund of funds || []) {
        const holding = holdings[fund.code];
        if (!holding) continue;
        const profit = getHoldingProfit(fund, holding, null);
        if (!profit) continue;
        totalAsset += Math.round(profit.amount * 100) / 100;
        if (profit.profitToday != null) {
          totalProfitToday += profit.profitToday;
          totalPrincipalToday += (profit.principalToday || 0);
          hasAnyTodayData = true;
        }
        if (profit.profitTotal !== null) {
          totalHoldingReturn += profit.profitTotal;
          if (typeof holding.cost === 'number' && typeof holding.share === 'number') {
            totalCost += holding.cost * holding.share;
          }
        }
        const ev = fund.noValuation
          ? null
          : fund.estPricedCoverage > 0.05
            ? (isNumber(fund.estGszzl) ? Number(fund.estGszzl) : null)
            : (isNumber(fund.gszzl) ? Number(fund.gszzl) : null);
        if (ev != null && Number.isFinite(ev)) {
          if (ev > 0) upCount += 1;
          else if (ev < 0) downCount += 1;
        }
      }

      const roundedToday = Math.round(totalProfitToday * 100) / 100;
      const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;
      const todayReturnRate = totalPrincipalToday > 0 ? (roundedToday / totalPrincipalToday) * 100 : 0;
      const scopeDaily = isPlainObject(fundDailyEarnings?.[DAILY_EARNINGS_SCOPE_ALL])
        ? fundDailyEarnings[DAILY_EARNINGS_SCOPE_ALL]
        : {};
      const dailySeries = aggregatePortfolioDailyEarnings(scopeDaily);
      let cum = 0;
      const sparkSeries = dailySeries.map((pt) => {
        cum += pt.earnings;
        return { date: pt.date, earnings: cum };
      });

      items.push({
        groupId: SUMMARY_SOURCE_GLOBAL,
        groupName: '全部',
        totalAsset,
        holdingReturn: totalHoldingReturn,
        holdingReturnPercent: returnRate,
        accountReturn: roundedToday,
        accountReturnPercent: todayReturnRate,
        hasAnyTodayData,
        upCount,
        downCount,
        sparkSeries,
      });
    }

    items.push(
      ...groupsWithHoldings.map((g) => {
      const bucket = groupHoldings[g.id] || {};
      const groupFunds = (funds || []).filter((f) => g.codes.includes(f.code));
      let totalAsset = 0;
      let totalHoldingReturn = 0;
      let totalCost = 0;
      let totalProfitToday = 0;
      let totalPrincipalToday = 0;
      let hasAnyTodayData = false;
      let upCount = 0;
      let downCount = 0;

      for (const fund of groupFunds) {
        const holding = bucket[fund.code];
        const profit = getHoldingProfit(fund, holding, g.id);
        if (profit) {
          totalAsset += Math.round(profit.amount * 100) / 100;
          if (profit.profitToday != null) {
            totalProfitToday += profit.profitToday;
            totalPrincipalToday += (profit.principalToday || 0);
            hasAnyTodayData = true;
          }
          if (profit.profitTotal !== null) {
            totalHoldingReturn += profit.profitTotal;
            if (holding && typeof holding.cost === 'number' && typeof holding.share === 'number') {
              totalCost += holding.cost * holding.share;
            }
          }
        }
        const ev = fund.noValuation
          ? null
          : fund.estPricedCoverage > 0.05
            ? (isNumber(fund.estGszzl) ? Number(fund.estGszzl) : null)
            : (isNumber(fund.gszzl) ? Number(fund.gszzl) : null);
        if (ev != null && Number.isFinite(ev)) {
          if (ev > 0) upCount += 1;
          else if (ev < 0) downCount += 1;
        }
      }

      const roundedToday = Math.round(totalProfitToday * 100) / 100;
      const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;
      const todayReturnRate = totalPrincipalToday > 0 ? (roundedToday / totalPrincipalToday) * 100 : 0;

      const scopeDaily = isPlainObject(fundDailyEarnings?.[g.id]) ? fundDailyEarnings[g.id] : {};
      const dailySeries = aggregatePortfolioDailyEarnings(scopeDaily);
      let cum = 0;
      const sparkSeries = dailySeries.map((pt) => {
        cum += pt.earnings;
        return { date: pt.date, earnings: cum };
      });

      return {
        groupId: g.id,
        groupName: g.name || '分组',
        totalAsset,
        holdingReturn: totalHoldingReturn,
        holdingReturnPercent: returnRate,
        accountReturn: roundedToday,
        accountReturnPercent: todayReturnRate,
        hasAnyTodayData,
        upCount,
        downCount,
        sparkSeries,
      };
      })
    );
    return items;
  }, [
    currentTab,
    groupsWithHoldings,
    funds,
    groupHoldings,
    holdings,
    getHoldingProfit,
    fundDailyEarnings,
    hasGlobalPortfolioForSummary,
  ]);

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

    const hasGlobalHolding = (h) =>
      !!h && isNumber(h.share) && Number(h.share) > 0;

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
        if (!Number.isFinite(s) || s <= 0) continue;
        sourceGroupIds.push(gid);
        totalShare += s;

        const c = h.cost == null || h.cost === '' ? null : Number(h.cost);
        if (c != null && Number.isFinite(c) && c > 0) {
          totalCostShare += c * s;
          hasAnyCost = true;
        }
      }

      if (totalShare > 0) {
        derived[code] = {
          share: totalShare,
          cost: hasAnyCost ? totalCostShare / totalShare : null,
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
        if (Array.isArray(list) && list.length > 0) out[code] = list;
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
      const groupIds = Array.isArray(groupIdsByCode[code]) ? groupIdsByCode[code] : [];
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
        if (!Array.isArray(list) || list.length === 0) continue;

        for (const item of list) {
          const date = item?.date ? String(item.date) : '';
          const earnings = Number(item?.earnings);
          const rate = Number(item?.rate);
          const baseCostAmount = Number(item?.baseCostAmount);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          if (!Number.isFinite(earnings)) continue;
          const prev = byDate.get(date) || { earnings: 0, rowCount: 0, singleRate: null, rateCount: 0, baseCostAmount: 0 };
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
            const baseCostAmount = Number.isFinite(row.baseCostAmount) && row.baseCostAmount > 0
              ? row.baseCostAmount
              : null;
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
  }, [
    fundDailyEarnings,
    activeGroupId,
    currentTab,
    summaryHoldingSourceGroupByCode,
    linkedHoldingsForAllFav,
  ]);
  const portfolioDailySeries = useMemo(
    () => {
      if (!isPlainObject(fundDailyEarnings)) return [];
      const byDate = new Map();
      Object.values(fundDailyEarnings).forEach((bucket) => {
        if (!isPlainObject(bucket)) return;
        Object.values(bucket).forEach((list) => {
          if (!Array.isArray(list) || list.length === 0) return;
          list.forEach((item) => {
            const date = item?.date ? String(item.date) : '';
            const earnings = Number(item?.earnings);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
            if (!Number.isFinite(earnings)) return;
            byDate.set(date, (byDate.get(date) ?? 0) + earnings);
          });
        });
      });
      return [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, earnings]) => ({ date, earnings, rate: null }));
    },
    [fundDailyEarnings]
  );

  const holdingsForTabWithLinked = useMemo(() => {
    if (currentTab === SUMMARY_TAB_ID) return summaryMergedHoldings;
    if (activeGroupId) return groupHoldings[activeGroupId] || {};
    if (currentTab !== 'all' && currentTab !== 'fav') return holdings;
    const derived = linkedHoldingsForAllFav.derived || {};
    const keys = Object.keys(derived);
    if (keys.length === 0) return holdings;
    return { ...(holdings || {}), ...derived };
  }, [
    currentTab,
    activeGroupId,
    summaryMergedHoldings,
    holdings,
    groupHoldings,
    linkedHoldingsForAllFav,
  ]);

  const dcaPlansForTab = useMemo(() => {
    const scoped = migrateDcaPlansToScoped(dcaPlans);
    const bucket = scoped[activeGroupId || DCA_SCOPE_GLOBAL];
    return isPlainObject(bucket) ? bucket : {};
  }, [dcaPlans, activeGroupId]);

  const transactionsForTab = useMemo(() => {
    if (!activeGroupId) return transactions;
    const out = {};
    Object.entries(transactions || {}).forEach(([code, list]) => {
      if (!Array.isArray(list)) return;
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

  const getScopedGroupId = (groupIdOverride) => (
    groupIdOverride !== undefined ? groupIdOverride : (activeGroupId || null)
  );

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
      const fundByCode = new Map((funds || []).map((f) => [f.code, f]));
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
    if (!group || !Array.isArray(group.codes)) return null;
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

  const [sortPeriodReturnsByCode, setSortPeriodReturnsByCode] = useState({});
  const sortPeriodReturnsCacheRef = useRef(new Map());
  const needsSortPeriodReturns = ['last1Week', 'last1Month', 'last3Months', 'last6Months', 'last1Year'].includes(sortBy);

  useEffect(() => {
    if (!needsSortPeriodReturns) return;
    const codes = scopedFunds.map(f => f.code);
    if (codes.length === 0) return;

    let cancelled = false;
    const missing = [];
    const cachedBatch = {};

    for (const code of codes) {
      if (!sortPeriodReturnsCacheRef.current.has(code)) {
        missing.push(code);
      } else {
        cachedBatch[code] = sortPeriodReturnsCacheRef.current.get(code);
      }
    }

    if (Object.keys(cachedBatch).length > 0) {
      setSortPeriodReturnsByCode((prev) => {
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
      await asyncPool(4, missing, async (code) => {
        const value = await fetchFundPeriodReturns(code);
        sortPeriodReturnsCacheRef.current.set(code, value);
        if (cancelled) return;
        setSortPeriodReturnsByCode((prev) => {
          if (prev[code] === value) return prev;
          return { ...prev, [code]: value };
        });
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [scopedFunds, needsSortPeriodReturns]);

  // 过滤和排序后的基金列表（包含“列表搜索”过滤）
  const displayFunds = useMemo(
    () => {
      let filtered = [...scopedFunds];

      const q = (shouldShowGroupFundSearch ? (groupFundSearchTerm || '') : '').trim();
      if (q) {
        const qLower = q.toLowerCase();
        filtered = filtered.filter((f) => {
          const name = String(f?.name ?? '').toLowerCase();
          const code = String(f?.code ?? '').toLowerCase();
          return name.includes(qLower) || code.includes(qLower);
        });
      }

      if (currentTab !== 'all' && currentTab !== 'fav' && currentTab !== SUMMARY_TAB_ID && sortBy === 'default') {
        const group = groups.find(g => g.id === currentTab);
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
        sortBy === 'holdingAmount' || sortBy === 'todayProfit' || sortBy === 'holding'
          ? new Map(filtered.map((f) => [f.code, getHoldingProfitForTab(f, holdingsForTabWithLinked[f.code])]))
          : null;

      return filtered.sort((a, b) => {
        if (sortBy === 'yield') {
          const getYieldValue = (fund) => {
            // 与 estimateChangePercent 展示逻辑对齐：
            // - noValuation 为 true 一律视为无“估算涨幅”
            // - 有估值覆盖时用 estGszzl
            // - 否则仅在 gszzl 为数字时使用 gszzl
            if (fund.noValuation) {
              return { value: 0, hasValue: false };
            }
            if (fund.estPricedCoverage > 0.05) {
              if (isNumber(fund.estGszzl)) {
                return { value: fund.estGszzl, hasValue: true };
              }
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
          const getEstimateProfitValue = (f) => {
            const hasTodayData = f.jzrq === todayStr;
            const holding = holdingsForTabWithLinked[f.code];
            const profit = getHoldingProfitForTab(f, holding);
            const total = profit ? profit.profitTotal : null;
            if (hasTodayData) return total;

            const principal = holding && isNumber(holding.cost) && isNumber(holding.share) ? holding.cost * holding.share : 0;
            const hasTodayEstimate = !f.noValuation && isString(f.gztime) && f.gztime.startsWith(todayStr);
            const estimateChangeValue = f.noValuation ? null : (f.estPricedCoverage > 0.05 ? (isNumber(f.estGszzl) ? Number(f.estGszzl) : null) : (isNumber(f.gszzl) ? Number(f.gszzl) : null));
            const holdingProfitPercentValue = total != null && principal > 0 ? (total / principal) * 100 : null;
            const hasEstimatePercent = hasTodayEstimate && estimateChangeValue != null;
            const hasHoldingPercent = holdingProfitPercentValue != null;
            const fallbackEstimateProfitPercentValue = hasEstimatePercent || hasHoldingPercent ? (hasEstimatePercent ? estimateChangeValue : 0) + (hasHoldingPercent ? holdingProfitPercentValue : 0) : null;
            
            return fallbackEstimateProfitPercentValue != null && principal > 0 ? principal * (fallbackEstimateProfitPercentValue / 100) : null;
          };
          const valA = getEstimateProfitValue(a);
          const valB = getEstimateProfitValue(b);
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
            if (!Array.isArray(list) || list.length === 0) return null;
            let matchedDaily = null;
            if (typeof jzrq === 'string') {
              for (const item of list) {
                if (item?.date === jzrq) {
                  matchedDaily = item;
                  break;
                }
              }
            }
            if (!matchedDaily) matchedDaily = list[list.length - 1];
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
          const getCost = (h) => h?.cost != null && h?.share != null && Number.isFinite(Number(h.cost)) && Number.isFinite(Number(h.share)) ? Number(h.cost) * Number(h.share) : null;
          const valA = getCost(holdingsForTabWithLinked[a.code]);
          const valB = getCost(holdingsForTabWithLinked[b.code]);
          const hasA = valA != null && Number.isFinite(valA);
          const hasB = valB != null && Number.isFinite(valB);
          if (!hasA && !hasB) return 0;
          if (!hasA) return 1;
          if (!hasB) return -1;
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        if (['last1Week', 'last1Month', 'last3Months', 'last6Months', 'last1Year'].includes(sortBy)) {
          const keyMap = { last1Week: 'week', last1Month: 'month', last3Months: 'month3', last6Months: 'month6', last1Year: 'year1' };
          const key = keyMap[sortBy];
          const valA = sortPeriodReturnsByCode[a.code]?.[key];
          const valB = sortPeriodReturnsByCode[b.code]?.[key];
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
            if (!Array.isArray(list) || list.length === 0) return '';
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
          return sortOrder === 'asc'
            ? keyA.localeCompare(keyB, 'zh-CN')
            : keyB.localeCompare(keyA, 'zh-CN');
        }
        if (sortBy === 'name') {
          return sortOrder === 'asc' ? a.name.localeCompare(b.name, 'zh-CN') : b.name.localeCompare(a.name, 'zh-CN');
        }
        return 0;
      });
    },
    [scopedFunds, currentTab, groups, sortBy, sortOrder, holdingsForTabWithLinked, getHoldingProfitForTab, groupFundSearchTerm, shouldShowGroupFundSearch, currentFundDailyEarnings, sortPeriodReturnsByCode, todayStr, fundTagListsByCode],
  );

  const latestDailyByCode = useMemo(() => {
    const out = {};
    if (!isPlainObject(currentFundDailyEarnings)) return out;
    for (const f of displayFunds) {
      const code = f?.code;
      if (!code) continue;
      const list = currentFundDailyEarnings[code];
      if (!Array.isArray(list) || list.length === 0) continue;
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

  // PC 端表格数据（用于 PcFundTable）
  const pcFundTableData = useMemo(
    () =>
      displayFunds.map((f) => {
        const hasTodayData = f.jzrq === todayStr;
        const latestNav = f.dwjz != null && f.dwjz !== '' ? (typeof f.dwjz === 'number' ? Number(f.dwjz).toFixed(4) : String(f.dwjz)) : '—';
        const estimateNav = f.noValuation
          ? '—'
          : (f.estPricedCoverage > 0.05
            ? (f.estGsz != null ? Number(f.estGsz).toFixed(4) : '—')
            : (f.gsz != null ? (typeof f.gsz === 'number' ? Number(f.gsz).toFixed(4) : String(f.gsz)) : '—'));

        const yesterdayChangePercent =
          f.zzl != null && f.zzl !== ''
            ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%`
            : '—';
        const yesterdayChangeValue =
          f.zzl != null && f.zzl !== '' ? Number(f.zzl) : null;
        const yesterdayDate = f.jzrq || '-';

        const estimateChangePercent = f.noValuation
          ? '—'
          : (f.estPricedCoverage > 0.05
            ? (f.estGszzl != null
              ? `${f.estGszzl > 0 ? '+' : ''}${Number(f.estGszzl).toFixed(2)}%`
              : '—')
            : (isNumber(f.gszzl)
              ? `${f.gszzl > 0 ? '+' : ''}${Number(f.gszzl).toFixed(2)}%`
              : (f.gszzl ?? '—')));
        const estimateChangeValue = f.noValuation
          ? null
          : (f.estPricedCoverage > 0.05
            ? (isNumber(f.estGszzl) ? Number(f.estGszzl) : null)
            : (isNumber(f.gszzl) ? Number(f.gszzl) : null));
        const estimateTime = f.noValuation ? (f.jzrq || '-') : (f.gztime || f.time || '-');
        const hasTodayEstimate = !f.noValuation && isString(f.gztime) && f.gztime.startsWith(todayStr);

        const holding = holdingsForTabWithLinked[f.code];
        const isHoldingLinked =
          (currentTab === 'all' || currentTab === 'fav') &&
          linkedHoldingsForAllFav.linked?.has?.(f.code);
        const profit = getHoldingProfitForTab(f, holding);
        const amount = profit ? profit.amount : null;
        const holdingAmount =
          amount == null ? '未设置' : `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const holdingAmountValue = amount;
        const holdingDaysValue = holding?.firstPurchaseDate
          ? dayjs.tz(todayStr, TZ).diff(dayjs.tz(holding.firstPurchaseDate, TZ), 'day')
          : null;

        const profitToday = profit ? profit.profitToday : null;
        const todayProfit =
          profitToday == null
            ? ''
            : `${profitToday > 0 ? '+' : profitToday < 0 ? '-' : ''}${Math.abs(profitToday).toFixed(2)}`;
        const todayProfitValue = profitToday;

        const total = profit ? profit.profitTotal : null;
        const principal =
          holding && isNumber(holding.cost) && isNumber(holding.share)
            ? holding.cost * holding.share
            : 0;
        const holdingCostValue =
          holding && isNumber(holding.cost) && isNumber(holding.share)
            ? holding.cost * holding.share
            : null;
        const holdingCost =
          holdingCostValue == null
            ? '-'
            : Number(holdingCostValue).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const costNavValue =
          holding && isNumber(holding.cost) ? holding.cost : null;
        const costNav =
          costNavValue == null ? '—' : Number(costNavValue).toFixed(4);
        const todayProfitPercent =
          profitToday != null && profit?.principalToday > 0
            ? `${profitToday > 0 ? '+' : profitToday < 0 ? '-' : ''}${Math.abs((profitToday / profit.principalToday) * 100).toFixed(2)}%`
            : '';

        const latestNavDateStr = isString(f.jzrq) ? f.jzrq : '';
        const dailyMeta = latestDailyByCode?.[f.code];
        const matchedDaily =
          (latestNavDateStr ? (dailyMeta?.byDate?.get(latestNavDateStr) || null) : null)
          || dailyMeta?.last
          || null;
        const yesterdayProfitVal =
          matchedDaily && Number.isFinite(Number(matchedDaily.earnings))
            ? Number(matchedDaily.earnings)
            : null;
        const yesterdayProfit =
          yesterdayProfitVal == null
            ? ''
            : `${yesterdayProfitVal > 0 ? '+' : yesterdayProfitVal < 0 ? '-' : ''}${Math.abs(yesterdayProfitVal).toFixed(2)}`;
        const dailyBaseCostAmount =
          matchedDaily && matchedDaily.baseCostAmount != null && matchedDaily.baseCostAmount !== '' && Number.isFinite(Number(matchedDaily.baseCostAmount))
            ? Number(matchedDaily.baseCostAmount)
            : null;
        const derivedRateFromSnapshot =
          yesterdayProfitVal != null && dailyBaseCostAmount != null && dailyBaseCostAmount > 0
            ? (yesterdayProfitVal / dailyBaseCostAmount) * 100
            : null;
        const dailyRate =
          matchedDaily && matchedDaily.rate != null && matchedDaily.rate !== '' && Number.isFinite(Number(matchedDaily.rate))
            ? Number(matchedDaily.rate)
            : derivedRateFromSnapshot;
        const yesterdayProfitPercentLine =
          dailyRate != null
            ? `${dailyRate > 0 ? '+' : dailyRate < 0 ? '-' : ''}${Math.abs(dailyRate).toFixed(2)}%`
            : (yesterdayProfitVal != null && principal > 0
              ? `${yesterdayProfitVal > 0 ? '+' : yesterdayProfitVal < 0 ? '-' : ''}${Math.abs((yesterdayProfitVal / principal) * 100).toFixed(2)}%`
              : '');
        const yesterdaySecondLinePctValue =
          dailyRate != null
            ? dailyRate
            : (yesterdayProfitVal != null && principal > 0
              ? (yesterdayProfitVal / principal) * 100
              : null);

        const holdingProfit =
          total == null
            ? ''
            : `${total > 0 ? '+' : total < 0 ? '-' : ''}${Math.abs(total).toFixed(2)}`;
        const holdingProfitPercent =
          total != null && principal > 0
            ? `${total > 0 ? '+' : total < 0 ? '-' : ''}${Math.abs((total / principal) * 100).toFixed(2)}%`
            : '';
        const holdingProfitValue = total;

        const holdingProfitPercentValue =
          total != null && principal > 0 ? (total / principal) * 100 : null;
        const hasEstimatePercent = hasTodayEstimate && estimateChangeValue != null;
        const hasHoldingPercent = holdingProfitPercentValue != null;
        const fallbackEstimateProfitPercentValue = hasEstimatePercent || hasHoldingPercent
          ? (hasEstimatePercent ? estimateChangeValue : 0) + (hasHoldingPercent ? holdingProfitPercentValue : 0)
          : null;
        const estimateProfitPercentValue = hasTodayData
          ? holdingProfitPercentValue
          : fallbackEstimateProfitPercentValue;
        const estimateProfitValue = hasTodayData
          ? total
          : (estimateProfitPercentValue != null && principal > 0
            ? principal * (estimateProfitPercentValue / 100)
            : null);
        const estimateProfit =
          estimateProfitValue == null
            ? ''
            : `${estimateProfitValue > 0 ? '+' : estimateProfitValue < 0 ? '-' : ''}${Math.abs(estimateProfitValue).toFixed(2)}`;
        const estimateProfitPercent =
          estimateProfitPercentValue == null
            ? ''
            : `${estimateProfitPercentValue > 0 ? '+' : ''}${estimateProfitPercentValue.toFixed(2)}%`;

        const addBaseNavRaw = f.addBaseNav != null && f.addBaseNav !== '' ? Number(f.addBaseNav) : null;
        const addBaseNav = addBaseNavRaw != null && Number.isFinite(addBaseNavRaw) && addBaseNavRaw > 0 ? addBaseNavRaw : null;
        const sinceAddedCurrentNav = (() => {
          if (f.noValuation) {
            const v = Number(f.dwjz);
            return Number.isFinite(v) && v > 0 ? v : null;
          }
          if (f.estPricedCoverage > 0.05) {
            const v = Number(f.estGsz);
            return Number.isFinite(v) && v > 0 ? v : null;
          }
          const v = Number(f.gsz);
          return Number.isFinite(v) && v > 0 ? v : null;
        })();
        const sinceAddedChangeValue =
          addBaseNav != null && sinceAddedCurrentNav != null
            ? ((sinceAddedCurrentNav / addBaseNav) - 1) * 100
            : null;
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
          const currentYear = typeof todayStr === 'string' && todayStr.length >= 4 ? todayStr.slice(0, 4) : '';
          if (currentYear && raw.startsWith(`${currentYear}-`) && raw.length >= 10) return raw.slice(5);
          return raw;
        })();

        const fc = String(f.code ?? '').trim();
        const listFromDerived = fundTagListsByCode[fc];
        const fundTags = Array.isArray(listFromDerived)
          ? listFromDerived.map(({ name, theme }) => ({
              name: String(name ?? '').trim(),
              theme: normalizeFundTagTheme(theme),
            }))
          : [];

        return {
          rawFund: f,
          code: f.code,
          fundName: f.name,
          fundTags,
          isHoldingLinked: !!isHoldingLinked,
          isUpdated: f.jzrq === todayStr,
          hasDca: dcaPlansForTab[f.code]?.enabled === true,
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
          holdingTargetGroupId:
            currentTab === SUMMARY_TAB_ID ? summaryHoldingSourceGroupByCode[f.code] : undefined,
        };
      }),
    [
      displayFunds,
      holdingsForTabWithLinked,
      isTradingDay,
      todayStr,
      getHoldingProfitForTab,
      dcaPlansForTab,
      latestDailyByCode,
      currentTab,
      summaryHoldingSourceGroupByCode,
      linkedHoldingsForAllFav,
      fundTagRecords,
      fundTagListsByCode,
    ],
  );

  // 自动滚动选中 Tab 到可视区域
  useEffect(() => {
    if (!tabsRef.current) return;
    if (currentTab === 'all' || currentTab === SUMMARY_TAB_ID) {
      tabsRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const activeTab = tabsRef.current.querySelector('.tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentTab]);

  // 鼠标拖拽滚动逻辑
  const [isDragging, setIsDragging] = useState(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const handleSaveHolding = (code, data, groupIdOverride) => {
    const gid = getScopedGroupId(
      groupIdOverride !== undefined
        ? groupIdOverride
        : (currentTab !== 'all' && currentTab !== 'fav' && groups.some((g) => g.id === currentTab) ? currentTab : null)
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
    }
  };

  const handleClearConfirm = () => {
    if (clearConfirm?.fund) {
      const code = clearConfirm.fund.code;
      const gid = getScopedGroupId(
        clearConfirm.groupId !== undefined
          ? clearConfirm.groupId
          : (currentTab !== 'all' && currentTab !== 'fav' && groups.some((g) => g.id === currentTab) ? currentTab : null)
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
        clearDailyEarnings(code, earningsScope);
        setFundDailyEarnings((prev) => {
          if (!isPlainObject(prev) || !isPlainObject(prev[earningsScope]) || !(code in prev[earningsScope])) return prev;
          const next = { ...prev, [earningsScope]: { ...prev[earningsScope] } };
          delete next[earningsScope][code];
          return next;
        });
      } catch { }
    }
    setClearConfirm(null);
  };

  const processPendingQueue = async () => {
    const currentPending = pendingTradesRef.current;
    if (currentPending.length === 0) return;

    let stateChanged = false;
    let tempHoldings = { ...holdingsRef.current };
    let tempGroupHoldings;
    try {
      tempGroupHoldings = JSON.parse(JSON.stringify(groupHoldingsRef.current || {}));
    } catch {
      tempGroupHoldings = { ...(groupHoldingsRef.current || {}) };
    }
    const processedIds = new Set();
    const newTransactions = [];

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
      const result = (trade.netValueSearch === 'backward')
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
               (trade.share != null && Number.isFinite(Number(trade.share)) && Number(trade.share) > 0)
                 ? Number(trade.share)
                 : ((trade.amount != null && Number.isFinite(Number(trade.amount)) && Number(trade.amount) > 0)
                     ? (Number(trade.amount) / result.value)
                     : 0);
             newShare = Math.max(0, current.share - sellShare);
             newCost = current.cost;
             if (newShare === 0) newCost = 0;

             tradeShare = sellShare;
             tradeAmount = sellShare * result.value;
        }

        writeCurrent(trade.fundCode, tradeGid, newShare, newCost, {
          ...(current.firstPurchaseDate ? { firstPurchaseDate: current.firstPurchaseDate } : {}),
          ...(trade.type === 'buy' && !current.firstPurchaseDate && result.date ? { firstPurchaseDate: result.date } : {}),
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
            ...(tradeGid ? { groupId: tradeGid } : {}),
        });
      }
    }

    if (stateChanged) {
      setHoldings(tempHoldings);
      setGroupHoldings(tempGroupHoldings);

      setPendingTrades(prev => {
          const next = prev.filter(t => !processedIds.has(t.id));
          return next;
      });

      setTransactions(prev => {
          const nextState = { ...prev };
          newTransactions.forEach(tx => {
              const current = nextState[tx.fundCode] || [];
              // 避免重复添加 (虽然 id 应该唯一)
              if (!current.some(t => t.id === tx.id)) {
                  const row = {
                    id: tx.id,
                    type: tx.type,
                    share: tx.share,
                    amount: tx.amount,
                    price: tx.price,
                    date: tx.date,
                    isAfter3pm: tx.isAfter3pm,
                    isDca: tx.isDca,
                    timestamp: tx.timestamp,
                  };
                  if (tx.groupId) row.groupId = tx.groupId;
                  nextState[tx.fundCode] = [row, ...current].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
              }
          });
          return nextState;
      });

      showToast(`已处理 ${processedIds.size} 笔待定交易`, 'success');
    }
  };

  const handleDeleteTransaction = (fundCode, transactionId, groupIdOverride) => {
    setTransactions(prev => {
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
      if (!Array.isArray(list) || list.length === 0) return prev;

      const existingCurrent = list.filter((t) => t && t.groupId === targetGid);
      const copiedKey = new Set(
        existingCurrent
          .filter((t) => t?.copiedFromId)
          .map((t) => `${t.copiedFromId}|${t.copiedFromGroupId ?? ''}`)
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
        copiedFromGroupId: t.groupId ?? null,
      }));

      const nextList = [...list, ...copied].sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
      const nextState = { ...prev, [fundCode]: nextList };
      return nextState;
    });

    // 复制“待处理队列”到当前分组（不改变原记录）
    setPendingTrades((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existingCurrent = list.filter((t) => t && t.fundCode === fundCode && t.groupId === targetGid);
      const copiedKey = new Set(
        existingCurrent
          .filter((t) => t?.copiedFromId)
          .map((t) => `${t.copiedFromId}|${t.copiedFromGroupId ?? ''}`)
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
        copiedFromGroupId: t.groupId ?? null,
      }));

      const next = [...list, ...copied];
      return next;
    });

    showToast('已从全部分组复制该基金交易记录到当前分组', 'success');
  };

  const handleAddHistory = (data) => {
    const fundCode = data.fundCode;
    const historyGid = getScopedGroupId(addHistoryModal.groupId);
    // 添加历史记录仅作补录展示，不修改真实持仓金额与份额
    setTransactions(prev => {
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
        ...(historyGid ? { groupId: historyGid } : {}),
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
            ...(tradeGid ? { groupId: tradeGid } : {}),
        };

        const next = [...pendingTrades, pending];
        setPendingTrades(next);

        // 如果该基金没有持仓数据，初始化持仓金额为 0
        const tabH = tradeGid ? (groupHoldings[tradeGid] || {}) : holdings;
        if (!tabH[fund.code]) {
          handleSaveHolding(fund.code, { share: 0, cost: 0 }, tradeGid);
        }

        setTradeModal({ open: false, fund: null, type: 'buy' });
        showToast('净值暂未更新，已加入待处理队列', 'info');
        return;
    }

    const current = (tradeGid ? (groupHoldings[tradeGid] || {}) : holdings)[fund.code] || { share: 0, cost: 0 };
    const isBuy = tradeModal.type === 'buy';

    let newShare, newCost;

    if (isBuy) {
      newShare = current.share + data.share;

      // 如果传递了 totalCost（即买入总金额），则用它来计算新成本
      // 否则回退到用 share * price 计算（减仓或旧逻辑）
      const buyCost = data.totalCost !== undefined ? data.totalCost : (data.price * data.share);

      // 加权平均成本 = (原持仓成本 * 原份额 + 本次买入总花费) / 新总份额
      // 注意：这里默认将手续费也计入成本（如果 totalCost 包含了手续费）
      newCost = (current.cost * current.share + buyCost) / newShare;
    } else {
      newShare = Math.max(0, current.share - data.share);
      // 减仓不改变单位成本，只减少份额
      newCost = current.cost;
      if (newShare === 0) newCost = 0;
    }

    handleSaveHolding(fund.code, {
      share: newShare,
      cost: newCost,
      ...(current.firstPurchaseDate ? { firstPurchaseDate: current.firstPurchaseDate } : {}),
      ...(isBuy && !current.firstPurchaseDate && data.date ? { firstPurchaseDate: data.date } : {}),
    }, tradeGid);

    setTransactions(prev => {
      const curList = prev[fund.code] || [];
      const record = {
        id: uuidv4(),
        type: tradeModal.type,
        share: data.share,
        amount: isBuy ? data.totalCost : (data.share * data.price),
        price: data.price,
        date: data.date,
        isAfter3pm: data.isAfter3pm,
        isDca: false,
        timestamp: Date.now(),
        ...(tradeGid ? { groupId: tradeGid } : {}),
      };
      const next = [record, ...curList];
      const nextState = { ...prev, [fund.code]: next };
      return nextState;
    });

    setTradeModal({ open: false, fund: null, type: 'buy' });
  };

  const handleMouseDown = (e) => {
    if (!tabsRef.current) return;
    setIsDragging(true);
  };

  const handleMouseLeaveOrUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !tabsRef.current) return;
    e.preventDefault();
    tabsRef.current.scrollLeft -= e.movementX;
  };

  const handleWheel = (e) => {
    if (!tabsRef.current) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    tabsRef.current.scrollLeft += delta;
  };

  const updateTabOverflow = () => {
    if (!tabsRef.current) return;
    const el = tabsRef.current;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

  useEffect(() => {
    updateTabOverflow();
    const onResize = () => updateTabOverflow();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [groups, funds.length, favorites.size]);

  // 成功提示弹窗
  const [successModal, setSuccessModal] = useState({ open: false, message: '' });
  // 轻提示 (Toast)
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' }); // type: 'info' | 'success' | 'error'
  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ show: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 3000);
  };

  // 定投计划自动生成买入队列的逻辑会在 storageHelper 定义之后实现

  const handleOpenLogin = () => {
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }
    setLoginModalOpen(true);
  };

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false); // 扫描弹窗
  const [scanConfirmModalOpen, setScanConfirmModalOpen] = useState(false); // 扫描确认弹窗
  const [scannedFunds, setScannedFunds] = useState([]); // 扫描到的基金
  const [selectedScannedCodes, setSelectedScannedCodes] = useState(new Set()); // 选中的扫描代码
  const [isScanning, setIsScanning] = useState(false);
  const [isScanImporting, setIsScanImporting] = useState(false);
  const [scanImportProgress, setScanImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [scanProgress, setScanProgress] = useState({ stage: 'ocr', current: 0, total: 0 }); // stage: ocr | verify
  const [isOcrScan, setIsOcrScan] = useState(false); // 是否为拍照/图片识别触发的弹框
  const abortScanRef = useRef(false); // 终止扫描标记
  const fileInputRef = useRef(null);
  const ocrWorkerRef = useRef(null);
  const { resolveFundCodeByFuzzy } = useFundFuzzyMatcher();

  const handleScanClick = () => {
    if (!user?.id) {
      sonnerToast.error('该功能需登录后使用');
      return;
    }
    setScanModalOpen(true);
  };

  const handleScanPick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const cancelScan = () => {
    abortScanRef.current = true;
    setIsScanning(false);
    setScanProgress({ stage: 'ocr', current: 0, total: 0 });
    if (ocrWorkerRef.current) {
      try {
        ocrWorkerRef.current.terminate();
      } catch (e) {}
      ocrWorkerRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFiles = async (files) => {
    if (!files?.length) return;

    setIsScanning(true);
    setScanModalOpen(false); // 关闭选择弹窗
    abortScanRef.current = false;
    setScanProgress({ stage: 'ocr', current: 0, total: files.length });

    try {
      let worker = ocrWorkerRef.current;
      if (!worker) {
        const cdnBases = [
          'https://01kjzb6fhx9f8rjstc8c21qadx.esa.staticdn.net/npm',
          'https://fastly.jsdelivr.net/npm',
          'https://cdn.jsdelivr.net/npm',
        ];
        const coreCandidates = [
          'tesseract-core-simd-lstm.wasm.js',
          'tesseract-core-lstm.wasm.js',
        ];
        let lastErr = null;
        for (const base of cdnBases) {
          for (const coreFile of coreCandidates) {
            try {
              worker = await createWorker('chi_sim+eng', 1, {
                workerPath: `${base}/tesseract.js@v5.1.1/dist/worker.min.js`,
                corePath: `${base}/tesseract.js-core@v5.1.1/${coreFile}`,
              });
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
          if (!lastErr) break;
        }
        if (lastErr) throw lastErr;
        ocrWorkerRef.current = worker;
      }

      const recognizeWithTimeout = async (file, ms) => {
        let timer = null;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('OCR_TIMEOUT')), ms);
        });
        try {
          return await Promise.race([worker.recognize(file), timeout]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      const searchFundsWithTimeout = async (val, ms) => {
        let timer = null;
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve([]), ms);
        });
        try {
          return await Promise.race([searchFunds(val), timeout]);
        } catch (e) {
          return [];
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      const allFundsData = []; // 存储所有解析出的基金信息，格式为 [{fundCode, fundName, holdAmounts, holdGains}]
      const addedFundCodes = new Set(); // 用于去重

      for (let i = 0; i < files.length; i++) {
        if (abortScanRef.current) break;

        const f = files[i];
        // 更新进度：正在处理第 i+1 张
        setScanProgress(prev => ({ ...prev, current: i + 1 }));

        let text = '';
        try {
          const res = await recognizeWithTimeout(f, 30000);
          text = res?.data?.text || '';
        } catch (e) {
          if (String(e?.message || '').includes('OCR_TIMEOUT')) {
            if (worker) {
              try {
                await worker.terminate();
              } catch (err) {}
              ocrWorkerRef.current = null;
            }
            throw e;
          }
          text = '';
        }
        // 提取到 text 内容，调用大模型 api 进行解析，获取基金数据(fundCode 可能为空)
        const fundsResString = await parseFundTextWithLLM(text);
        let fundsRes = null; // 格式为 [{"fundCode": "000001", "fundName": "浙商债券","holdAmounts": "99.99", "holdGains": "99.99"}]
        try {
          fundsRes = JSON.parse(fundsResString);
        } catch (e) {
          console.error(e);
        }

        // 处理大模型解析结果，根据 fundCode 去重
        if (Array.isArray(fundsRes) && fundsRes.length > 0) {
          fundsRes.forEach((fund) => {
            const code = fund.fundCode || '';
            const name = (fund.fundName || '').trim();
            if (code && !addedFundCodes.has(code)) {
              addedFundCodes.add(code);
              allFundsData.push({
                fundCode: code,
                fundName: name,
                holdAmounts: fund.holdAmounts || '',
                holdGains: fund.holdGains || ''
              });
            } else if (!code && name) {
              // fundCode 为空但有名称，后续需要通过名称搜索基金代码
              allFundsData.push({
                fundCode: '',
                fundName: name,
                holdAmounts: fund.holdAmounts || '',
                holdGains: fund.holdGains || ''
              });
            }
          });
        }
      }

      if (abortScanRef.current) {
        return;
      }

      // 处理没有基金代码但有名称的情况，通过名称搜索基金代码
      const fundsWithoutCode = allFundsData.filter(f => !f.fundCode && f.fundName);
      if (fundsWithoutCode.length > 0) {
        setScanProgress({ stage: 'verify', current: 0, total: fundsWithoutCode.length });
        for (let i = 0; i < fundsWithoutCode.length; i++) {
          if (abortScanRef.current) break;
          const fundItem = fundsWithoutCode[i];
          setScanProgress(prev => ({ ...prev, current: i + 1 }));
          try {
            const list = await searchFundsWithTimeout(fundItem.fundName, 8000);
            // 只有当搜索结果「有且仅有一条」时，才认为名称匹配是唯一且有效的
            if (Array.isArray(list) && list.length === 1) {
              const found = list[0];
              if (found && found.CODE && !addedFundCodes.has(found.CODE)) {
                addedFundCodes.add(found.CODE);
                fundItem.fundCode = found.CODE;
              }
            } else {
              // 使用 fuse.js 读取 Public 中的 allFunds 数据进行模糊匹配，补充搜索接口的不足
              try {
                const fuzzyCode = await resolveFundCodeByFuzzy(fundItem.fundName);
                if (fuzzyCode && !addedFundCodes.has(fuzzyCode)) {
                  addedFundCodes.add(fuzzyCode);
                  fundItem.fundCode = fuzzyCode;
                }
              } catch (e) {
              }
            }
          } catch (e) {
          }
        }
      }

      // 过滤出有基金代码的记录
      const validFunds = allFundsData.filter(f => f.fundCode);
      const codes = validFunds.map(f => f.fundCode).sort();
      setScanProgress({ stage: 'verify', current: 0, total: codes.length });

      const existingCodes = new Set(funds.map(f => f.code));
      const results = [];
      for (let i = 0; i < codes.length; i++) {
        if (abortScanRef.current) break;
        const code = codes[i];
        const fundInfo = validFunds.find(f => f.fundCode === code);
        setScanProgress(prev => ({ ...prev, current: i + 1 }));

        let found = null;
        try {
          const list = await searchFundsWithTimeout(code, 8000);
          found = Array.isArray(list) ? list.find(d => d.CODE === code) : null;
        } catch (e) {
          found = null;
        }

        const alreadyAdded = existingCodes.has(code);
        const ok = !!found && !alreadyAdded;
        results.push({
          code,
          name: found ? (found.NAME || found.SHORTNAME || '') : (fundInfo?.fundName || ''),
          status: alreadyAdded ? 'added' : (ok ? 'ok' : 'invalid'),
          holdAmounts: fundInfo?.holdAmounts || '',
          holdGains: fundInfo?.holdGains || ''
        });
      }

      if (abortScanRef.current) {
        return;
      }

      setScannedFunds(results);
      setSelectedScannedCodes(new Set(results.filter(r => r.status === 'ok').map(r => r.code)));
      setIsOcrScan(true);
      setScanConfirmModalOpen(true);
    } catch (err) {
      if (!abortScanRef.current) {
        console.error('OCR Error:', err);
        showToast('图片识别失败，请重试或更换更清晰的截图', 'error');
      }
    } finally {
      setIsScanning(false);
      setScanProgress({ stage: 'ocr', current: 0, total: 0 });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFilesUpload = (event) => {
    processFiles(Array.from(event.target.files || []));
  };

  const handleFilesDrop = (files) => {
    processFiles(files);
  };

  const toggleScannedCode = (code) => {
    setSelectedScannedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const confirmScanImport = async (targetGroupId = 'all', expandAfterAdd = true) => {
    const rawCodes = Array.from(selectedScannedCodes);
    const targetExists = (code) => {
      if (!code) return false;
      if (targetGroupId === 'all') return funds.some((f) => f.code === code);
      if (targetGroupId === 'fav') return favorites?.has?.(code);
      const g = groups.find((x) => x.id === targetGroupId);
      return !!(g && Array.isArray(g.codes) && g.codes.includes(code));
    };
    const codes = rawCodes.filter((c) => !targetExists(c));
    if (codes.length === 0) {
      showToast('所选基金已在目标分组中', 'info');
      return;
    }
    setScanConfirmModalOpen(false);
    setIsScanImporting(true);
    setScanImportProgress({ current: 0, total: codes.length, success: 0, failed: 0 });

    const parseAmount = (val) => {
      if (!val) return null;
      const num = parseFloat(String(val).replace(/,/g, ''));
      return isNaN(num) ? null : num;
    };

    try {
      const newFunds = [];
      const newHoldings = {};
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        setScanImportProgress(prev => ({ ...prev, current: i + 1 }));

        const existed = funds.some(existing => existing.code === code);
        try {
          const data = existed ? (funds.find((f) => f.code === code) || null) : await fetchFundData(code);
          if (!existed && data) newFunds.push(data);

          const scannedFund = scannedFunds.find(f => f.code === code);
          const holdAmounts = parseAmount(scannedFund?.holdAmounts);
          const holdGains = parseAmount(scannedFund?.holdGains);
          const dwjz = data?.dwjz || data?.gsz || 0;

          if (!existed && holdAmounts !== null && dwjz > 0) {
            const share = holdAmounts / dwjz;
            const profit = holdGains !== null ? holdGains : 0;
            const principal = holdAmounts - profit;
            const cost = share > 0 ? principal / share : 0;
            newHoldings[code] = {
              share: Number(share.toFixed(2)),
              cost: Number(cost.toFixed(4))
            };
          }

          successCount++;
          setScanImportProgress(prev => ({ ...prev, success: prev.success + 1 }));
        } catch (e) {
          failedCount++;
          setScanImportProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        }
      }

      const newCodesSet = new Set(newFunds.map((f) => f.code));
      const allSelectedSet = new Set(codes);

      if (newFunds.length > 0) {
        setFunds(prev => dedupeByCode([...newFunds, ...prev]));

        if (Object.keys(newHoldings).length > 0) {
          setHoldings(prev => {
            const next = { ...prev, ...newHoldings };
            return next;
          });
        }

        const nextSeries = {};
        newFunds.forEach(u => {
          if (u?.code != null && !u.noValuation && Number.isFinite(Number(u.gsz))) {
            nextSeries[u.code] = recordValuation(u.code, { gsz: u.gsz, gztime: u.gztime });
          }
        });
        if (Object.keys(nextSeries).length > 0) setValuationSeries(prev => ({ ...prev, ...nextSeries }));

        if (!expandAfterAdd) {
          // 用户关闭“添加后展开详情”：将新添加基金的卡片和业绩走势都标记为收起
          setCollapsedCodes(prev => {
            const next = new Set(prev);
            newCodesSet.forEach((code) => next.add(code));
            return next;
          });
          setCollapsedTrends(prev => {
            const next = new Set(prev);
            newCodesSet.forEach((code) => next.add(code));
            return next;
          });
        }
      }

      // 无论是否新增 funds，都允许把已存在基金加入到目标分组/自选
      if (targetGroupId === 'fav') {
        setFavorites(prev => {
          const next = new Set(prev);
          codes.map(normalizeCode).filter(Boolean).forEach(code => next.add(code));
          return next;
        });
        setCurrentTab('fav');
      } else if (targetGroupId && targetGroupId !== 'all') {
        setGroups(prev => {
          return prev.map(g => {
            if (g.id === targetGroupId) {
              return {
                ...g,
                codes: Array.from(new Set([...(g.codes || []), ...codes]))
              };
            }
            return g;
          });
        });
        setCurrentTab(targetGroupId);
      } else {
        setCurrentTab('all');
      }

      if (successCount > 0) {
        setSuccessModal({ open: true, message: `成功导入 ${successCount} 个基金` });
      } else if (allSelectedSet.size > 0 && failedCount === 0) {
        setSuccessModal({ open: true, message: '所选基金已在目标分组中' });
      } else {
        showToast('未能导入任何基金', 'info');
      }
    } catch (e) {
      showToast('导入失败', 'error');
    } finally {
      setIsScanImporting(false);
      setScanImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
      setScannedFunds([]);
      setSelectedScannedCodes(new Set());
    }
  };

  const [cloudConfigModal, setCloudConfigModal] = useState({ open: false, userId: null });
  const syncDebounceRef = useRef(null);
  const lastSyncedRef = useRef('');
  const skipSyncRef = useRef(isSupabaseConfigured);
  const userIdRef = useRef(null);
  const dirtyKeysRef = useRef(new Set()); // 记录发生变化的字段

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user]);


  const scheduleSync = useCallback(() => {
    if (!userIdRef.current) return;
    if (skipSyncRef.current) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      // 收集脏数据
      const dirtyKeys = new Set(dirtyKeysRef.current);
      // 如果没有脏数据，且不是首次同步（可以增加其他判断），则不处理
      // 但这里 scheduleSync 通常是由 storage 触发，所以应该有脏数据
      // 除非是初次加载
      if (dirtyKeys.size === 0) {
        // Fallback to full sync if needed, or just return
        // 这里为了保险，如果是空的，我们做全量
        // 但通常 dirtyKeysRef 应该被填充了
      }

      const payload = collectLocalPayload(dirtyKeys.size > 0 ? dirtyKeys : null);

      // 清空脏数据标记
      dirtyKeysRef.current.clear();

      // 计算 hash 比较是否真的变了（对于部分更新，这个比较可能意义不大，除非我们也部分比较）
      // 这里简化逻辑：如果是部分更新，直接发送
      if (dirtyKeys.size > 0) {
        syncUserConfig(userIdRef.current, false, payload, true);
      } else {
        const next = getComparablePayload(payload);
        if (next === lastSyncedRef.current) return;
        lastSyncedRef.current = next;
        syncUserConfig(userIdRef.current, false, payload, false);
      }
    }, 1000 * 2); // 往云端同步的防抖时间
  }, []);

  const { setOnSync } = useStorageStore();

  const storageHelper = useMemo(() => {
    const triggerSync = (key, prevValue, nextValue) => {
      // 标记为脏数据
      if (key === '__clear__') {
        // 如果是清空，由于无法得知具体的 keys，这里可能需要特殊处理或者简单的全量标记
        // 但目前的 triggerSync 主要用于增量标记，这里简化处理
        return;
      }
      dirtyKeysRef.current.add(key);

      if (!skipSyncRef.current) {
        const now = nowInTz().toISOString();
        storageStore.setItem('localUpdatedAt', now);
        setLastSyncTime(now);
      }
      scheduleSync();
    };

    // 初始化时注入同步回调
    setOnSync(triggerSync);

    return storageStore;
  }, [setOnSync, scheduleSync]);

  useEffect(() => {
    // 仅以下 key 的变更会触发云端同步；fundValuationTimeseries 不在其中
    const keys = new Set(['funds', 'tags', 'favorites', 'groups', 'collapsedCodes', 'collapsedTrends', 'collapsedEarnings', 'refreshMs', 'holdings', 'groupHoldings', 'pendingTrades', 'dcaPlans', 'customSettings', 'fundDailyEarnings']);
    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key === 'localUpdatedAt') {
        setLastSyncTime(e.newValue);
      }
      if (!keys.has(e.key)) return;

      // 使用 storageStore 提供的签名函数进行精细判断
      import('./stores/storageStore').then(({ getFundCodesSignature, getTagsStoreSignature }) => {
        if (e.key === 'funds') {
          const prevSig = getFundCodesSignature(e.oldValue);
          const nextSig = getFundCodesSignature(e.newValue);
          if (prevSig === nextSig) return;
        }
        if (e.key === 'tags') {
          const prevSig = getTagsStoreSignature(e.oldValue);
          const nextSig = getTagsStoreSignature(e.newValue);
          if (prevSig === nextSig) return;
        }
        scheduleSync();
      });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [scheduleSync]);

  const triggerCustomSettingsSync = useCallback(() => {
    queueMicrotask(() => {
      dirtyKeysRef.current.add('customSettings');
      if (!skipSyncRef.current) {
        const now = nowInTz().toISOString();
        storageStore.setItem('localUpdatedAt', now);
        setLastSyncTime(now);
      }
      scheduleSync();
    });
  }, [scheduleSync]);

  const openFundTagsEdit = useCallback((row) => {
    if (!row?.code) return;
    const raw = row.rawFund;
    const fc = String(row.code).trim();
    const tags = (fundTagRecords || [])
      .filter((r) => getFundCodesFromTagRecord(r).includes(fc))
      .map((r) => ({
        id: String(r.id ?? '').trim() || uuidv4(),
        name: String(r.name ?? '').trim(),
        theme: String(r.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME,
      }))
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    setFundTagsEdit({
      open: true,
      code: row.code,
      name: row.fundName || raw?.name || '',
      tags,
    });
  }, [fundTagRecords]);

  const handleSaveFundTags = useCallback(
    (code, tagRows) => {
      if (!code) return;
      const fc = String(code).trim();
      const rows = Array.isArray(tagRows) ? tagRows : [];
      const normalized = normalizeFundTagInstanceListFromInput(rows);

      setFundTagRecords((prev) => {
        const selectedById = new Map(
          normalized.map((x) => [String(x.id).trim(), x]).filter(([id]) => id),
        );

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
              fundCodes: codes,
            });
            if (nextRow) byId.set(id, nextRow);
          } else {
            const codes = getFundCodesFromTagRecord(row).filter((c) => c !== fc);
            const nextRow = sanitizeTagRowForStorage({
              ...row,
              fundCodes: codes,
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
            fundCodes: [fc],
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
    [storageHelper],
  );

  /** 仅写入可选池：每次新增一条独立记录（允许可选池内重名），不改变已有 fundCodes */
  const handleAddPoolTag = useCallback(
    (payload) => {
      const th = String(payload?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME;
      const rawNames =
        Array.isArray(payload?.names) && payload.names.length
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
            fundCodes: [],
          });
          if (row) next.push(row);
        }
        storageHelper.setItem('tags', JSON.stringify(next));
        return next;
      });
    },
    [storageHelper],
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
    [storageHelper],
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
    [fundTagRecords, funds],
  );

  const applyViewMode = useCallback((mode) => {
    if (mode !== 'card' && mode !== 'list') return;
    if (mode !== viewMode) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setViewMode(mode);
    storageHelper.setItem('viewMode', mode);
  }, [storageHelper, viewMode]);

  const toggleFavorite = useCallback((code) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      if (next.size === 0) setCurrentTab('all');
      return next;
    });
  }, [storageHelper]);

  const toggleCollapse = useCallback((code) => {
    setCollapsedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, [setCollapsedCodes]);

  const toggleTrendCollapse = useCallback((code) => {
    setCollapsedTrends(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, [setCollapsedTrends]);

  const toggleEarningsCollapse = useCallback((code) => {
    setCollapsedEarnings(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, [setCollapsedEarnings]);

  const scheduleDcaTrades = useCallback(async () => {
    if (!isTradingDay) return;
    if (!isPlainObject(dcaPlans)) return;
    const codesSet = new Set(funds.map((f) => f.code));
    if (codesSet.size === 0) return;

    const scoped = migrateDcaPlansToScoped(dcaPlans);
    const groupIdSet = new Set(groups.map((g) => g?.id).filter(Boolean));

    const today = toTz(todayStr).startOf('day');
    let nextPlans;
    try {
      nextPlans = JSON.parse(JSON.stringify(scoped));
    } catch {
      nextPlans = { ...scoped };
    }
    const newPending = [];

    const years = new Set([today.year()]);
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

          if (!current.isBefore(first, 'day') && isDateTradingDay(current)) {
            const dateStr = current.format('YYYY-MM-DD');

            const pending = {
              id: `dca_${scopeKey}_${code}_${dateStr}_${Date.now()}`,
              fundCode: code,
              fundName: (funds.find(f => f.code === code) || {}).name,
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
              ...(tradeGid ? { groupId: tradeGid } : {}),
            };
            newPending.push(pending);
            lastGenerated = current;
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

    setDcaPlans(nextPlans);

    setPendingTrades(prev => {
      const merged = [...(prev || []), ...newPending];
      return merged;
    });

    showToast(`已生成 ${newPending.length} 笔定投买入`, 'success');
  }, [isTradingDay, dcaPlans, funds, todayStr, storageHelper, groups]);

  useEffect(() => {
    if (!isTradingDay) return;
    scheduleDcaTrades().catch((e) => {
      console.error('[scheduleDcaTrades]', e);
    });
  }, [isTradingDay, scheduleDcaTrades]);

  const handleAddGroup = (name) => {
    const newGroup = {
      id: `group_${Date.now()}`,
      name,
      codes: []
    };
    const next = [...groups, newGroup];
    setGroups(next);
    setCurrentTab(newGroup.id);
    setGroupModalOpen(false);
  };

  const handleRemoveGroup = (id) => {
    const next = groups.filter(g => g.id !== id);
    setGroups(next);
    if (currentTab === id) setCurrentTab('all');
    setGroupHoldings((prev) => {
      if (!prev[id]) return prev;
      const nextGh = { ...prev };
      delete nextGh[id];
      return nextGh;
    });
    setDcaPlans((prev) => {
      const scoped = migrateDcaPlansToScoped(prev);
      if (!scoped[id]) return prev;
      const nextDca = { ...scoped };
      delete nextDca[id];
      return nextDca;
    });
    setPendingTrades((prev) => {
      const nextP = prev.filter((t) => t.groupId !== id);
      return nextP;
    });
    try {
      const parsed = customSettings || {};
      if (parsed && typeof parsed === 'object' && parsed[id] !== undefined) {
        const next = { ...parsed };
        delete next[id];
        setCustomSettings(next);
      }
    } catch { }
  };

  const handleUpdateGroups = (newGroups) => {
    const removedIds = groups.filter((g) => !newGroups.find((ng) => ng.id === g.id)).map((g) => g.id);
    setGroups(newGroups);
    // 如果当前选中的分组被删除了，切换回“全部”
    if (currentTab !== 'all' && currentTab !== 'fav' && !newGroups.find(g => g.id === currentTab)) {
      setCurrentTab('all');
    }
    if (removedIds.length > 0) {
      setGroupHoldings((prev) => {
        let nextGh = { ...prev };
        let ghChanged = false;
        removedIds.forEach((rid) => {
          if (nextGh[rid]) {
            delete nextGh[rid];
            ghChanged = true;
          }
        });
        return ghChanged ? nextGh : prev;
      });
      setDcaPlans((prev) => {
        const scoped = migrateDcaPlansToScoped(prev);
        let nextDca = { ...scoped };
        let dcaChanged = false;
        removedIds.forEach((rid) => {
          if (nextDca[rid]) {
            delete nextDca[rid];
            dcaChanged = true;
          }
        });
        return dcaChanged ? nextDca : prev;
      });
      setPendingTrades((prev) => {
        const nextP = prev.filter((t) => !removedIds.includes(t.groupId));
        return nextP;
      });
      try {
        const parsed = { ...(customSettings || {}) };
        if (parsed && typeof parsed === 'object') {
          let changed = false;
          removedIds.forEach((groupId) => {
            if (parsed[groupId] !== undefined) {
              delete parsed[groupId];
              changed = true;
            }
          });
          if (changed) {
            setCustomSettings(parsed);
          }
        }
      } catch { }
      setTransactions((prev) => {
        const out = { ...(prev || {}) };
        let changed = false;
        Object.keys(out).forEach((code) => {
          const list = out[code];
          if (!Array.isArray(list) || list.length === 0) return;
          const filtered = list.filter((t) => !removedIds.includes(t?.groupId));
          if (filtered.length !== list.length) {
            changed = true;
            if (filtered.length) out[code] = filtered;
            else delete out[code];
          }
        });
        return changed ? out : prev;
      });
      setFundDailyEarnings((prev) => {
        if (!isPlainObject(prev)) return prev;
        let changed = false;
        const next = { ...prev };
        removedIds.forEach((rid) => {
          if (rid in next) {
            delete next[rid];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  };

  const handleAddFundsToGroup = (codes) => {
    if (!codes || codes.length === 0) return;
    const gid = currentTab !== 'all' && currentTab !== 'fav' ? currentTab : null;
    const next = groups.map(g => {
      if (g.id === currentTab) {
        return {
          ...g,
          codes: Array.from(new Set([...g.codes, ...codes]))
        };
      }
      return g;
    });
    setGroups(next);

    // 确保“添加到分组”仅增加分组内基金列表，不迁移任何持仓/交易/待定/定投等分组作用域数据
    if (gid) {
      const codeSet = new Set(codes.filter(Boolean));

      setGroupHoldings((prev) => {
        const bucket = prev?.[gid];
        if (!bucket || typeof bucket !== 'object') return prev;
        let changed = false;
        const nextBucket = { ...bucket };
        for (const c of codeSet) {
          // 用 null 作为“显式未设置持仓”的哨兵值，避免 seedGroupHoldingsFromGlobal 用全局持仓回填
          if (nextBucket[c] !== null) {
            nextBucket[c] = null;
            changed = true;
          }
        }
        if (!changed) return prev;
        const nextGh = { ...(prev || {}) };
        nextGh[gid] = nextBucket;
        return nextGh;
      });

      setPendingTrades((prev) => {
        const nextP = prev.filter((t) => !(codeSet.has(t.fundCode) && t.groupId === gid));
        if (nextP.length === prev.length) return prev;
        return nextP;
      });

      setTransactions((prev) => {
        const out = { ...(prev || {}) };
        let changed = false;
        for (const c of codeSet) {
          const list = out[c];
          if (!Array.isArray(list) || list.length === 0) continue;
          const filtered = list.filter((t) => t?.groupId !== gid);
          if (filtered.length !== list.length) {
            changed = true;
            if (filtered.length) out[c] = filtered;
            else delete out[c];
          }
        }
        if (!changed) return prev;
        return out;
      });

      setDcaPlans((prev) => {
        const scoped = migrateDcaPlansToScoped(prev);
        const bucket = scoped?.[gid];
        if (!bucket || typeof bucket !== 'object') return prev;
        let changed = false;
        const nextBucket = { ...bucket };
        for (const c of codeSet) {
          if (nextBucket[c] != null) {
            delete nextBucket[c];
            changed = true;
          }
        }
        if (!changed) return prev;
        const nextScoped = { ...scoped, [gid]: nextBucket };
        return nextScoped;
      });

      try {
        for (const c of codeSet) clearDailyEarnings(c, gid);
        setFundDailyEarnings((prev) => {
          if (!isPlainObject(prev) || !isPlainObject(prev[gid])) return prev;
          let changed = false;
          const nextBucket = { ...prev[gid] };
          for (const c of codeSet) {
            if (c in nextBucket) {
              delete nextBucket[c];
              changed = true;
            }
          }
          if (!changed) return prev;
          return { ...prev, [gid]: nextBucket };
        });
      } catch { /* empty */ }
    }

    setAddFundToGroupOpen(false);
    setSuccessModal({ open: true, message: `成功添加 ${codes.length} 支基金` });
  };

  /** 仅从指定自定义分组移除基金：分组 codes、该分组持仓/待定/交易/定投；不删 funds、全局 holdings */
  const stripFundFromGroupScope = (code, groupId, options = {}) => {
    const silent = options?.silent === true;
    if (!code || !groupId) return;
    const nextGroups = groups.map((g) =>
      g.id === groupId ? { ...g, codes: g.codes.filter((c) => c !== code) } : g
    );
    setGroups(nextGroups);

    setGroupHoldings((prev) => {
      if (!prev[groupId]?.[code]) return prev;
      const next = { ...prev };
      const bucket = { ...next[groupId] };
      delete bucket[code];
      next[groupId] = bucket;
      return next;
    });

    setPendingTrades((prev) => {
      const next = prev.filter((t) => !(t.fundCode === code && t.groupId === groupId));
      if (next.length === prev.length) return prev;
      return next;
    });

    setTransactions((prev) => {
      const list = prev[code] || [];
      const filtered = list.filter((t) => t.groupId !== groupId);
      if (filtered.length === list.length) return prev;
      const next = { ...prev };
      if (filtered.length) next[code] = filtered;
      else delete next[code];
      return next;
    });

    setDcaPlans((prev) => {
      const scoped = migrateDcaPlansToScoped(prev);
      if (!scoped[groupId]?.[code]) return prev;
      const bucket = { ...scoped[groupId] };
      delete bucket[code];
      const nextScoped = { ...scoped, [groupId]: bucket };
      return nextScoped;
    });
    try {
      clearDailyEarnings(code, groupId);
      setFundDailyEarnings((prev) => {
        if (!isPlainObject(prev) || !isPlainObject(prev[groupId]) || !(code in prev[groupId])) return prev;
        const next = { ...prev, [groupId]: { ...prev[groupId] } };
        delete next[groupId][code];
        return next;
      });
    } catch { /* empty */ }

    if (!silent) showToast('已从当前分组移除该基金', 'success');
  };

  /** 批量从同一自定义分组移除（单次合并更新，避免闭包叠加 strip 失效） */
  const stripManyFundsFromGroupScope = (codes, groupId) => {
    const set = new Set((codes || []).filter(Boolean));
    if (!groupId || set.size === 0) return;

    setGroups((prev) => {
      const next = prev.map((g) =>
        g.id === groupId ? { ...g, codes: g.codes.filter((c) => !set.has(c)) } : g
      );
      return next;
    });

    setGroupHoldings((prev) => {
      if (!prev[groupId]) return prev;
      const bucket = { ...prev[groupId] };
      let changed = false;
      for (const c of set) {
        if (bucket[c]) {
          delete bucket[c];
          changed = true;
        }
      }
      if (!changed) return prev;
      const next = { ...prev, [groupId]: bucket };
      return next;
    });

    setPendingTrades((prev) => {
      const next = prev.filter((t) => !(set.has(t.fundCode) && t.groupId === groupId));
      if (next.length === prev.length) return prev;
      return next;
    });

    setTransactions((prev) => {
      let next = { ...prev };
      let changed = false;
      for (const c of set) {
        const list = next[c];
        if (!list?.length) continue;
        const filtered = list.filter((t) => t.groupId !== groupId);
        if (filtered.length !== list.length) {
          changed = true;
          if (filtered.length) next[c] = filtered;
          else delete next[c];
        }
      }
      if (!changed) return prev;
      return next;
    });

    setDcaPlans((prev) => {
      const scoped = migrateDcaPlansToScoped(prev);
      if (!scoped[groupId]) return prev;
      const bucket = { ...scoped[groupId] };
      let changed = false;
      for (const c of set) {
        if (bucket[c]) {
          delete bucket[c];
          changed = true;
        }
      }
      if (!changed) return prev;
      const nextScoped = { ...scoped, [groupId]: bucket };
      return nextScoped;
    });
    try {
      for (const c of set) clearDailyEarnings(c, groupId);
      setFundDailyEarnings((prev) => {
        if (!isPlainObject(prev) || !isPlainObject(prev[groupId])) return prev;
        const bucket = prev[groupId];
        let changed = false;
        const nextBucket = { ...bucket };
        for (const c of set) {
          if (c in nextBucket) {
            delete nextBucket[c];
            changed = true;
          }
        }
        if (!changed) return prev;
        return { ...prev, [groupId]: nextBucket };
      });
    } catch { /* empty */ }
  };

  const toggleFundInGroup = (code, groupId) => {
    const next = groups.map(g => {
      if (g.id === groupId) {
        const has = g.codes.includes(code);
        return {
          ...g,
          codes: has ? g.codes.filter(c => c !== code) : [...g.codes, code]
        };
      }
      return g;
    });
    setGroups(next);
  };

  const handleReorder = (oldIndex, newIndex) => {
    const movedItem = displayFunds[oldIndex];
    const targetItem = displayFunds[newIndex];
    if (!movedItem || !targetItem) return;

    if (currentTab === 'all' || currentTab === 'fav') {
      const newFunds = [...funds];
      const fromIndex = newFunds.findIndex(f => f.code === movedItem.code);

      if (fromIndex === -1) return;

      // Remove moved item
      const [removed] = newFunds.splice(fromIndex, 1);

      // Find target index in the array (after removal)
      const toIndex = newFunds.findIndex(f => f.code === targetItem.code);

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
      const groupIndex = groups.findIndex(g => g.id === currentTab);
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

  // 按 code 去重，保留第一次出现的项，避免列表重复
  const dedupeByCode = (list) => {
    const seen = new Set();
    return list.filter((f) => {
      const c = f?.code;
      if (!c || seen.has(c)) return false;
      seen.add(c);
      return true;
    });
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
      try {        // 已登录用户：不在此处调用 refreshAll，等 fetchCloudConfig 完成后由 applyCloudConfig 统一刷新
        let shouldRefreshFromLocal = true;
        if (isSupabaseConfigured) {
          const { data, error } = await supabase.auth.getSession();
          if (!cancelled && !error && data?.session?.user) {
            shouldRefreshFromLocal = false;
          }
        }
        if (cancelled) return;

        const saved = storageStore.getItem('funds', []);
        if (Array.isArray(saved) && saved.length) {
          const deduped = dedupeByCode(saved);
          const fundCodeSet = new Set(deduped.map((f) => f?.code).filter(Boolean));
          let storedTagRows = [];
          try {
            storedTagRows = storageStore.getItem('tags', []);
          } catch { /* empty */ }
          if (!Array.isArray(storedTagRows)) storedTagRows = [];
          const normalizedTags = storedTagRows
            .map((r) => {
              const codes = getFundCodesFromTagRecord(r).filter((c) => fundCodeSet.has(c));
              return {
                id: String(r.id || '').trim() || uuidv4(),
                name: String(r.name || '').trim(),
                theme: String(r.theme || '').trim() || DEFAULT_FUND_TAG_THEME,
                fundCodes: codes.sort(),
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
            const arr = Array.isArray(t) ? t : [];
            const normalized = arr
              .map((r) => {
                const codes = getFundCodesFromTagRecord(r);
                const name = String(r.name || '').trim();
                if (!name) return null;
                return {
                  id: String(r.id || '').trim() || uuidv4(),
                  name,
                  theme: String(r.theme || '').trim() || DEFAULT_FUND_TAG_THEME,
                  fundCodes: codes.sort(),
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
      setValuationSeries(getAllValuationSeries());
      // 加载自选状态：只保留存在于 funds 中的 code，避免“自选数量 > 全部数量”
      const savedFavorites = Array.from(favorites);
      const storedFundCodeSet = new Set(funds.map((f) => f?.code).filter(Boolean));
      const cleanedFavorites = cleanCodeArray(savedFavorites, storedFundCodeSet);
      if (cleanedFavorites.length !== savedFavorites.length) {
        setFavorites(new Set(cleanedFavorites));
      }
      // 加载待处理交易
      const savedPending = storageStore.getItem('pendingTrades', []);
      if (Array.isArray(savedPending)) {
        setPendingTrades(savedPending);
      }
      // 加载分组状态
      // 读取用户上次选择的分组（仅本地存储，不同步云端）
      const savedTab = storageStore.getItem('currentTab');
      if (
        savedTab === 'all' ||
        savedTab === 'fav' ||
        (savedTab && Array.isArray(groups) && groups.some((g) => g?.id === savedTab))
      ) {
        setCurrentTab(savedTab);
      } else if (savedTab) {
        setCurrentTab('all');
      }
      // 加载持仓数据
      const seedGh = seedGroupHoldingsFromGlobal(
        holdings,
        Array.isArray(groups) ? groups : [],
        groupHoldings
      );
      if (seedGh.changed) {
        setGroupHoldings(seedGh.next);
      }
      const migratedDca = migrateDcaPlansToScoped(isPlainObject(dcaPlans) ? dcaPlans : {});
      if (JSON.stringify(migratedDca) !== JSON.stringify(dcaPlans)) {
        setDcaPlans(migratedDca);
      }
      const savedTheme = storageStore.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setTheme(savedTheme);
      }
      } catch { }
      if (!cancelled) {
        hasLocalTabInitRef.current = true;
      }
    };
    init();
    return () => { cancelled = true; };
  }, [isSupabaseConfigured]);

  // 切换分组后，页面自动回到顶部（跳过首次初始化恢复）
  useEffect(() => {
    if (!hasLocalTabInitRef.current) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentTab]);

  // 全局持仓或分组成员变化时，按分组幂等补全子账本（不覆盖已有分组持仓）
  useEffect(() => {
    if (!hasLocalTabInitRef.current) return;
    setGroupHoldings((prev) => {
      const { next, changed } = seedGroupHoldingsFromGlobal(holdings, groups, prev);
      if (!changed) return prev;
      return next;
    });
  }, [holdings, groups]);

  // 记录用户当前选择的分组（仅本地存储，不同步云端）
  useEffect(() => {
    if (!hasLocalTabInitRef.current) return;
    try {
      storageStore.setItem('currentTab', currentTab);
    } catch { }
  }, [currentTab]);

  // 主题同步到 document 并持久化
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      storageStore.setItem('theme', theme);
    } catch { }
  }, [theme]);

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
        } catch { }
        try {
          const sessionKeys = Object.keys(sessionStorage);
          sessionKeys.forEach((key) => {
            if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
              sessionStorage.removeItem(key);
            }
          });
        } catch { }
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
      fetchCloudConfig(session.user.id, isExplicitLogin);
    };

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        clearAuthState();
        return;
      }
      await handleSession(data?.session ?? null, 'INITIAL_SESSION');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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

  // 实时同步
  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;
    const deviceId = deviceIdRef.current;
    if (!deviceId) return; // 确保设备ID已初始化
    
    const channel = supabase
      .channel(`user-configs-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_configs', filter: `last_device_id=neq.${deviceId}` }, async (payload) => {
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
        const incoming = payload?.new?.data;
        if (!isPlainObject(incoming)) return;
        const incomingDeviceId = incoming?._syncMeta?.deviceId ? String(incoming._syncMeta.deviceId) : '';
        if (incomingDeviceId && deviceIdRef.current && incomingDeviceId === deviceIdRef.current) return;
        const incomingComparable = getComparablePayload(incoming);
        if (!incomingComparable || incomingComparable === lastSyncedRef.current) return;
        await applyCloudConfig(incoming, payload.new.updated_at);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);



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
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error && error.code !== 'session_not_found') {
          throw error;
        }
      }
    } catch (err) {
      showToast(err.message, 'error')
      console.error('登出失败', err);
    } finally {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch { }
      try {
        const storageKeys = Object.keys(localStorage);
        storageKeys.forEach((key) => {
          if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
            storageHelper.removeItem(key);
          }
        });
      } catch { }
      try {
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach((key) => {
          if (key === 'supabase.auth.token' || (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
            sessionStorage.removeItem(key);
          }
        });
      } catch { }
      setLoginModalOpen(false);
      setLoginInitialError('');
      clearAuthUser();
    }
  };

  const refreshCodesRef = useRef([]);
  useEffect(() => {
    refreshCodesRef.current = Array.from(new Set((funds || []).map((f) => f.code))).filter(Boolean);
  }, [funds]);

  useEffect(() => {
    refreshCycleStartRef.current = Date.now();

    const tick = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const codes = refreshCodesRef.current || [];
        if (codes.length) {
          refreshAll(codes);
        } else {
          tick(); // 如果没基金，继续等下一周期
        }
      }, refreshMs);
    };

    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refreshMs]);

  const performSearch = async (val) => {
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const fundsOnly = await searchFunds(val);
      setSearchResults(fundsOnly);
    } catch (e) {
      console.error('搜索失败', e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => performSearch(val), 300);
  };

  const toggleSelectFund = (fund) => {
    setSelectedFunds(prev => {
      const exists = prev.find(f => f.CODE === fund.CODE);
      if (exists) {
        return prev.filter(f => f.CODE !== fund.CODE);
      }
      return [...prev, fund];
    });
  };

  const getAddBaseSnapshotFromFund = (fund) => {
    const dwjz = Number(fund?.dwjz);
    if (Number.isFinite(dwjz) && dwjz > 0) {
      return { nav: dwjz, date: fund?.jzrq || null };
    }
    const gsz = Number(fund?.gsz);
    if (Number.isFinite(gsz) && gsz > 0) {
      return { nav: gsz, date: fund?.gztime || fund?.time || null };
    }
    return { nav: null, date: null };
  };

  const withAddBaseline = (fund) => {
    const next = { ...(fund || {}) };
    const now = Date.now();
    if (next.addedAt == null) next.addedAt = now;
    if (next.addBaseNav == null || next.addBaseDate == null) {
      const snap = getAddBaseSnapshotFromFund(next);
      if (next.addBaseNav == null && snap.nav != null) next.addBaseNav = snap.nav;
      if (next.addBaseDate == null && snap.date) next.addBaseDate = snap.date;
    }
    return next;
  };

  const handleScanImportConfirm = async (codes) => {
    if (!Array.isArray(codes) || codes.length === 0) return;
    const uniqueCodes = Array.from(new Set(codes));
    const toAdd = uniqueCodes.filter(c => !funds.some(f => f.code === c));
    if (toAdd.length === 0) {
      setSuccessModal({ open: true, message: '识别的基金已全部添加' });
      return;
    }
    setLoading(true);
    try {
      const added = [];
      await asyncPool(5, toAdd, async (code) => {
        try {
          const data = await fetchFundData(code);
          if (data && data.code) {
            added.push(withAddBaseline(data));
          }
        } catch (e) {
          console.error(`通过识别导入基金 ${code} 失败`, e);
        }
      });
      if (added.length > 0) {
        setFunds(prev => {
          const merged = [...prev, ...added];
          const deduped = Array.from(new Map(merged.map(f => [f.code, f])).values());
          return deduped;
        });
        const nextSeries = {};
        added.forEach(u => {
          if (u?.code != null && !u.noValuation && Number.isFinite(Number(u.gsz))) {
            nextSeries[u.code] = recordValuation(u.code, { gsz: u.gsz, gztime: u.gztime });
          }
        });
        if (Object.keys(nextSeries).length > 0) setValuationSeries(prev => ({ ...prev, ...nextSeries }));
        setSuccessModal({ open: true, message: `已导入 ${added.length} 只基金` });
      } else {
        setSuccessModal({ open: true, message: '未能导入任何基金，请检查截图清晰度' });
      }
    } finally {
      setLoading(false);
    }
  };

  const batchAddFunds = async () => {
    if (selectedFunds.length === 0) return;
    setLoading(true);
    setError('');

    try {
      const newFunds = [];
      await asyncPool(5, selectedFunds, async (f) => {
        if (funds.some(existing => existing.code === f.CODE)) return;
        try {
          const data = await fetchFundData(f.CODE);
          newFunds.push(withAddBaseline(data));
        } catch (e) {
          console.error(`添加基金 ${f.CODE} 失败`, e);
        }
      });

      if (newFunds.length > 0) {
        const updated = dedupeByCode([...newFunds, ...funds]);
        setFunds(updated);
        const nextSeries = {};
        newFunds.forEach(u => {
          if (u?.code != null && !u.noValuation && Number.isFinite(Number(u.gsz))) {
            nextSeries[u.code] = recordValuation(u.code, { gsz: u.gsz, gztime: u.gztime });
          }
        });
        if (Object.keys(nextSeries).length > 0) setValuationSeries(prev => ({ ...prev, ...nextSeries }));
      }

      setSelectedFunds([]);
      setSearchTerm('');
      setSearchResults([]);
    } catch (e) {
      setError('批量添加失败');
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = async (codes) => {
    // 【步骤 1】重入锁检查：防止多个刷新任务同时运行导致状态混乱
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);

    // 【步骤 2】参数归一化：去重并缓存当前本地存储中的基金代码，用于判断基金是否已被用户删除
    const uniqueCodes = Array.from(new Set(codes));
    let cachedStoredFundCodes = new Set();
    let cachedStoredFundsByCode = new Map();
    try {
      const arr = storageStore.getItem('funds', []);
      if (Array.isArray(arr)) {
        cachedStoredFundCodes = new Set(arr.map((x) => x?.code).filter(Boolean));
        cachedStoredFundsByCode = new Map(arr.filter((x) => x?.code).map((x) => [x.code, x]));
      }
    } catch (e) {
      console.warn('读取缓存基金列表失败', e);
    }

    const fundCodeStillInStorage = (code) => {
      if (!code) return false;
      return cachedStoredFundCodes.has(code);
    };
    const getStoredFundSnapshot = (code) => {
      if (!code) return null;
      return cachedStoredFundsByCode.get(code) || null;
    };

    try {
      const updated = [];
      const dailyChanges = {}; // 存储待更新的每日收益 { [scope]: { [code]: nextList } }
      let earningsChanged = false;

      // ... 辅助函数定义 (isValidDateStr, addDays, calcEarningsFromNavs 等) ...
      const isValidDateStr = (s) => isString(s) && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const addDays = (dateStr, days) => dayjs.tz(dateStr, TZ).add(days, 'day').format('YYYY-MM-DD');
      const subDays = (dateStr, days) => dayjs.tz(dateStr, TZ).subtract(days, 'day').format('YYYY-MM-DD');
      const calcEarningsFromNavs = (nav, prevNav, share) => (nav - prevNav) * share;
      const calcRateFromEarnings = (earnings, baseCostAmount) => {
        if (!Number.isFinite(earnings) || !Number.isFinite(baseCostAmount) || baseCostAmount <= 0) return null;
        return (earnings / baseCostAmount) * 100;
      };

      const calcLatestDayFromFund = (u, share, baseCostAmount) => {
        const nav = Number(u?.dwjz);
        if (!Number.isFinite(nav) || nav <= 0) return null;
        const lastNav = u?.lastNav != null && u.lastNav !== '' ? Number(u.lastNav) : null;
        if (lastNav != null && Number.isFinite(lastNav) && lastNav > 0) {
          const earnings = calcEarningsFromNavs(nav, lastNav, share);
          return {
            earnings,
            rate: calcRateFromEarnings(earnings, baseCostAmount),
          };
        }
        const zzl = u?.zzl != null && u.zzl !== '' ? Number(u.zzl) : Number.NaN;
        if (Number.isFinite(zzl)) {
          const prev = nav / (1 + zzl / 100);
          if (Number.isFinite(prev) && prev > 0) {
            const earnings = calcEarningsFromNavs(nav, prev, share);
            return {
              earnings,
              rate: calcRateFromEarnings(earnings, baseCostAmount),
            };
          }
        }
        return null;
      };

      const findPrevTradingNav = async (code, dateStr, navCache, u) => {
        if (u && isValidDateStr(u.jzrq) && u.jzrq === dateStr) {
          const lastNav = u?.lastNav != null && u.lastNav !== '' ? Number(u.lastNav) : null;
          if (lastNav != null && Number.isFinite(lastNav) && lastNav > 0) return lastNav;
        }
        if (navCache && navCache.size) {
          let bestD = '';
          let bestNav = null;
          for (const d of navCache.keys()) {
            if (!isValidDateStr(d) || d >= dateStr) continue;
            const v = navCache.get(d);
            if (!Number.isFinite(v) || v <= 0) continue;
            if (!bestD || d > bestD) {
              bestD = d;
              bestNav = v;
            }
          }
          if (bestNav != null) return bestNav;
        }
        const end = subDays(dateStr, 1);
        const start = subDays(dateStr, 120);
        const rows = await fetchFundNetValueRange(code, start, end);
        for (const r of rows) {
          if (navCache) navCache.set(r.date, r.nav);
        }
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].date < dateStr) {
            const v = rows[i].nav;
            if (Number.isFinite(v) && v > 0) return v;
          }
        }
        return null;
      };

      const localRecordToChanges = (scope, code, earnings, dateStr, rate, baseCostAmount, force = false) => {
        if (!dailyChanges[scope]) dailyChanges[scope] = {};
        const list = dailyChanges[scope][code] ||
                     (fundDailyEarnings[scope] && Array.isArray(fundDailyEarnings[scope][code]) ? fundDailyEarnings[scope][code] : []);
        const existingIndex = list.findIndex(item => item.date === dateStr);
        const normalizedRate = isNumber(rate) && Number.isFinite(rate) ? rate : null;
        const normalizedBaseCostAmount = Number.isFinite(Number(baseCostAmount)) && Number(baseCostAmount) > 0
          ? Number(baseCostAmount)
          : null;
        const nextList = existingIndex >= 0
          ? list.map((item, i) => {
            if (i !== existingIndex) return item;
            const prevRate = Number(item?.rate);
            const prevBaseCostAmount = Number(item?.baseCostAmount);
            // 如果是强制更新（确权阶段），或者原本数据缺失，则更新 rate 和 baseCostAmount
            const shouldUpdateRate = force || !Number.isFinite(prevRate);
            const shouldUpdateBase = force || !(Number.isFinite(prevBaseCostAmount) && prevBaseCostAmount > 0);
            return {
              date: dateStr,
              earnings,
              rate: shouldUpdateRate ? normalizedRate : prevRate,
              baseCostAmount: shouldUpdateBase ? normalizedBaseCostAmount : prevBaseCostAmount,
            };
          })
          : [...list, { date: dateStr, earnings, rate: normalizedRate, baseCostAmount: normalizedBaseCostAmount }];
        nextList.sort((a, b) => a.date.localeCompare(b.date));
        dailyChanges[scope][code] = nextList;
        earningsChanged = true;
      };

      const nextValuationSeries = { ...valuationSeries };
      let valuationChanged = false;

      // 【步骤 3】核心流水线：使用 asyncPool 控制并发（同时抓取 3 个基金），降低接口并发压力
      await asyncPool(3, uniqueCodes, async (c) => {
        if (!fundCodeStillInStorage(c)) return;
        let data = null;
        try {
          // 【步骤 3.1】数据获取：调用 api 获取实时估值、净值和持仓数据
          data = await fetchFundData(c);
        } catch (e) {
          console.error(`刷新基金 ${c} 失败`, e);
          if (fundCodeStillInStorage(c)) {
            try {
              const arr = storageStore.getItem('funds', []);
              data = arr.find((f) => f.code === c);
            } catch { }
          }
        }

        if (!data || !fundCodeStillInStorage(c)) return;

        // 如果估值接口本轮失败（回退到 fallback），且本地已有旧数据，则保留旧数据不覆盖。
        if (data.valuationSource === 'fallback' && getStoredFundSnapshot(c)) return;

        updated.push(data);

        // 【步骤 3.2】估值时序记录：提取实时估值点（gsz），用于绘制分时图
        if (data.code != null && !data.noValuation && Number.isFinite(Number(data.gsz))) {
          const value = Number(data.gsz);
          const gztime = data.gztime ?? null;
          const dateStr = (isString(gztime) && /^\d{4}-\d{2}-\d{2}/.test(gztime))
            ? gztime.slice(0, 10)
            : dayjs().tz(TZ).format('YYYY-MM-DD');
          const timeLabel = (isString(gztime) && gztime.length > 10)
            ? gztime.slice(11, 16)
            : dayjs().tz(TZ).format('HH:mm');

          const list = Array.isArray(nextValuationSeries[data.code]) ? nextValuationSeries[data.code] : [];
          const lastDate = list.length ? list[list.length - 1].date : '';

          if (dateStr > lastDate) {
            nextValuationSeries[data.code] = [{ time: timeLabel, value, date: dateStr }];
            valuationChanged = true;
          } else if (dateStr === lastDate) {
            if (!list.some(p => p.time === timeLabel)) {
              nextValuationSeries[data.code] = [...list, { time: timeLabel, value, date: dateStr }];
              valuationChanged = true;
            }
          }
        }

        // 【步骤 3.3】收益补齐逻辑：检查本地历史收益记录，如有缺失则根据持仓和历史净值进行追溯计算
        try {
          const targetScopes = [];
          if (holdings[data.code] && isNumber(holdings[data.code].share) && holdings[data.code].share > 0) {
            targetScopes.push(DAILY_EARNINGS_SCOPE_ALL);
          }
          Object.keys(groupHoldings || {}).forEach(gid => {
            if (groupHoldings[gid]?.[data.code] && isNumber(groupHoldings[gid][data.code].share) && groupHoldings[gid][data.code].share > 0) {
              targetScopes.push(gid);
            }
          });

          if (targetScopes.length === 0) return;

          const latestNavDate = data.jzrq;
          if (!isValidDateStr(latestNavDate)) return;

          const navCache = new Map();

          for (const scope of targetScopes) {
            const h = scope === DAILY_EARNINGS_SCOPE_ALL ? holdings[data.code] : groupHoldings[scope][data.code];
            const existing = dailyChanges[scope]?.[data.code] ||
                             (fundDailyEarnings[scope] && Array.isArray(fundDailyEarnings[scope][data.code]) ? fundDailyEarnings[scope][data.code] : []);
            const lastRecordedDate = existing.length ? existing[existing.length - 1]?.date : null;

            const getEffectiveShare = (targetDate) => {
              let baseShare = h.share;
              const list = transactions[data.code] || [];
              for (const tx of list) {
                if (!tx || !tx.date || tx.date < targetDate) continue;
                const gid = tx.groupId || null;
                const txInScope = (scope === DAILY_EARNINGS_SCOPE_ALL) ? !gid : (gid === scope);
                if (!txInScope) continue;
                const s = Number(tx.share) || 0;
                if (tx.type === 'buy') baseShare -= s;
                else if (tx.type === 'sell') baseShare += s;
              }
              return Math.max(0, baseShare);
            };

            if (!existing.length) {
              const share = getEffectiveShare(latestNavDate);
              const unitCost = Number(h?.cost);
              const baseCostAmount = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * share : null;
              if (share > 0) {
                const v = calcLatestDayFromFund(data, share, baseCostAmount);
                if (v && Number.isFinite(v.earnings) && fundCodeStillInStorage(data.code)) {
                  localRecordToChanges(scope, data.code, v.earnings, latestNavDate, v.rate, baseCostAmount, true);
                }
              }
              if (!(dailyChanges[scope] && dailyChanges[scope][data.code])) {
                try {
                  const nav = Number(data.dwjz);
                  if (Number.isFinite(nav) && nav > 0) {
                    navCache.set(latestNavDate, nav);
                    const prevNav = await findPrevTradingNav(data.code, latestNavDate, navCache, data);
                    const share = getEffectiveShare(latestNavDate);
                    if (fundCodeStillInStorage(data.code) && Number.isFinite(prevNav) && prevNav > 0 && share > 0) {
                      const earnings = calcEarningsFromNavs(nav, prevNav, share);
                      const unitCost = Number(h?.cost);
                      const baseCostAmount = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * share : null;
                      const rate = calcRateFromEarnings(earnings, baseCostAmount);
                      if (Number.isFinite(earnings)) {
                        localRecordToChanges(scope, data.code, earnings, latestNavDate, rate, baseCostAmount, true);
                      }
                    }
                  }
                } catch { }
              }
            } else if (isValidDateStr(lastRecordedDate) && lastRecordedDate < latestNavDate) {
              const latestNav = Number(data.dwjz);
              if (Number.isFinite(latestNav) && latestNav > 0) navCache.set(latestNavDate, latestNav);

              const start = addDays(lastRecordedDate, 1);
              const navRows = await fetchFundNetValueRange(data.code, lastRecordedDate, latestNavDate);
              if (fundCodeStillInStorage(data.code)) {
                for (const r of navRows) navCache.set(r.date, r.nav);
                const firstIdx = navRows.findIndex((r) => r.date >= start);
                if (firstIdx !== -1) {
                  for (let j = firstIdx; j < navRows.length; j++) {
                    const prevNav = j > 0 ? navRows[j - 1].nav : await findPrevTradingNav(data.code, navRows[j].date, navCache, data);
                    if (!fundCodeStillInStorage(data.code)) break;
                    if (!Number.isFinite(prevNav) || prevNav <= 0) continue;
                    const nav = navRows[j].nav;
                    const cursor = navRows[j].date;
                    if (!Number.isFinite(nav) || nav <= 0) continue;
                    const share = getEffectiveShare(cursor);
                    if (share <= 0) continue;
                    const earnings = calcEarningsFromNavs(nav, prevNav, share);
                    const unitCost = Number(h?.cost);
                    const baseCostAmount = Number.isFinite(unitCost) && unitCost > 0 ? unitCost * share : null;
                    const rate = calcRateFromEarnings(earnings, baseCostAmount);
                    if (Number.isFinite(earnings)) {
                      localRecordToChanges(scope, data.code, earnings, cursor, rate, baseCostAmount, true);
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn(`记录 ${data.code} 每日收益失败`, e);
        }
      });

      // 【步骤 4】UI 与存储同步：统一更新 React 状态和本地 localStorage，减少页面重绘
      if (updated.length > 0) {
        setFunds(prev => prev.map((f) => {
          const next = updated.find(x => x.code === f.code);
          if (!next) return f;
          const merged = { ...next };
          if (f.addedAt != null) merged.addedAt = f.addedAt;
          if (f.addBaseNav != null) merged.addBaseNav = f.addBaseNav;
          if (f.addBaseDate != null) merged.addBaseDate = f.addBaseDate;
          if (merged.addedAt == null || merged.addBaseNav == null || merged.addBaseDate == null) {
            const snap = getAddBaseSnapshotFromFund(merged);
            if (merged.addedAt == null) merged.addedAt = Date.now();
            if (merged.addBaseNav == null && snap.nav != null) merged.addBaseNav = snap.nav;
            if (merged.addBaseDate == null && snap.date) merged.addBaseDate = snap.date;
          }
          return merged;
        }));
        if (valuationChanged) {
          setValuationSeries(prev => {
            const next = { ...prev };
            Object.entries(nextValuationSeries).forEach(([code, list]) => {
               next[code] = list;
            });
            return next;
          });
          storageStore.setItem('fundValuationTimeseries', JSON.stringify(nextValuationSeries));
        }
      }

      if (earningsChanged) {
        setFundDailyEarnings(prev => {
          const next = { ...prev };
          for (const [scope, bucket] of Object.entries(dailyChanges)) {
            next[scope] = { ...next[scope], ...bucket };
          }
          for (const code of uniqueCodes) {
            if (!cachedStoredFundCodes.has(code)) {
              Object.keys(next).forEach(s => {
                if (next[s] && next[s][code]) {
                  const nb = { ...next[s] };
                  delete nb[code];
                  next[s] = nb;
                }
              });
            }
          }
          return next;
        });
      }
    } catch (e) {
      console.error('刷新过程出错', e);
    } finally {
      // 【步骤 5】后期调度：重置锁定状态，并根据用户设置的时间间隔启动下一次定时刷新
      refreshingRef.current = false;
      setRefreshing(false);
      refreshCycleStartRef.current = Date.now();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const codes = refreshCodesRef.current || [];
        if (codes.length) refreshAll(codes);
      }, refreshMs);

      // 【步骤 6】队列处理：执行可能积压的待处理交易（如到达触发价格的自动交易）
      try {
        await processPendingQueue();
      } catch (e) {
        console.warn('待交易处理出错', e);
      }
    }
  };

  const toggleViewMode = () => {
    const nextMode = viewMode === 'card' ? 'list' : 'card';
    applyViewMode(nextMode);
  };

  const requestRemoveFund = (fund) => {
    const gid =
      currentTab !== 'all' && currentTab !== 'fav' && groups.some((g) => g.id === currentTab)
        ? currentTab
        : null;

    if (gid) {
      const gh = groupHoldings[gid]?.[fund.code];
      const hasGroupHolding = gh && isNumber(gh.share) && gh.share > 0;
      const hasGroupPending = pendingTrades.some(
        (t) => t.fundCode === fund.code && t.groupId === gid
      );
      const scoped = migrateDcaPlansToScoped(dcaPlans);
      const hasGroupDca = !!(scoped[gid]?.[fund.code]);
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
    const hasGlobalHolding = h && isNumber(h.share) && h.share > 0;
    const hasGroupHolding = Object.values(groupHoldings || {}).some(
      (b) => b && b[fund.code] && isNumber(b[fund.code].share) && b[fund.code].share > 0
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
      currentTab !== 'all' && currentTab !== 'fav' && groups.some((g) => g.id === currentTab)
        ? currentTab
        : null;
    const list = Array.from(new Set((codes || []).filter(Boolean)));
    if (list.length === 0) return true;

    if (gid) {
      const scoped = migrateDcaPlansToScoped(dcaPlans);
      const needsConfirm = list.some((code) => {
        const gh = groupHoldings[gid]?.[code];
        const hasGroupHolding = gh && isNumber(gh.share) && gh.share > 0;
        const hasGroupPending = pendingTrades.some((t) => t.fundCode === code && t.groupId === gid);
        const hasGroupDca = !!(scoped[gid]?.[code]);
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
      const otherGroupNames = groups
        .filter((g) => g.codes.includes(code))
        .map((g) => g.name);
      if (otherGroupNames.length > 0) {
        const meta = funds.find((f) => f.code === code);
        fundsWithOtherGroups.push({
          code,
          name: meta?.name || code,
          otherGroups: otherGroupNames,
        });
      }
    }
    const needsGlobalConfirm = list.some((code) => {
      const h = holdings[code];
      const hasGlobalHolding = h && isNumber(h.share) && h.share > 0;
      const hasGroupHolding = Object.values(groupHoldings || {}).some(
        (b) => b && b[code] && isNumber(b[code].share) && b[code].share > 0
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
  const removeFundsFromCurrentTabHandler = (codes) =>
    requestRemoveFundsFromCurrentGroup(codes);

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
    const toGid = targetId && targetId !== 'all' ? targetId : null;

    if (targetId === 'all') {
      if (!fromGid) return { conflicts: [] };
    } else {
      if (!toGid || !groups.some((g) => g?.id === toGid)) return { conflicts: [] };
      if (toGid === fromGid) return { conflicts: [] };
    }

    const conflicts = [];
    for (const code of list) {
      const hasTargetHolding = toGid
        ? (groupHoldings?.[toGid]?.[code] != null)
        : (holdings?.[code] != null);
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
      const getBucket = (gid) => (next[gid] && typeof next[gid] === 'object' ? { ...next[gid] } : {});

      // 读取源持仓
      const sourceBucket = fromGid ? getBucket(fromGid) : null;
      const targetBucket = toGid ? getBucket(toGid) : null;

      if (toGid) next[toGid] = targetBucket;
      if (fromGid) next[fromGid] = sourceBucket;

      for (const code of list) {
        const fromValue = fromGid
          ? sourceBucket?.[code]
          : holdings?.[code];

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
        const { groupId, ...rest } = t;
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
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const nextArr = arr.map((tx) => {
          if (!tx) return tx;
          const inFromScope = fromGid ? tx.groupId === fromGid : !tx.groupId;
          if (!inFromScope) return tx;
          changed = true;
          if (toGid) return { ...tx, groupId: toGid };
          const { groupId, ...rest } = tx;
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
      const fromBucket = scoped[fromKey] && typeof scoped[fromKey] === 'object' ? { ...scoped[fromKey] } : {};
      const toBucket = scoped[toKey] && typeof scoped[toKey] === 'object' ? { ...scoped[toKey] } : {};
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
        if (!overwrite && (code in toBucket)) continue;
        toBucket[code] = fromBucket[code];
        delete fromBucket[code];
        changed = true;
      }
      if (!changed) return prev;
      const next = { ...base, [fromKey]: fromBucket, [toKey]: toBucket };
      return next;
    });

    // 迁移成功后切换到目标分组
    setCurrentTab(targetId === 'all' ? 'all' : targetId);
    showToast('分组迁移完成', 'success');
    return { conflicts: [] };
  };

  const addFund = async (e) => {
    e?.preventDefault?.();
    setError('');
    const manualTokens = String(searchTerm || '')
      .split(/[^0-9A-Za-z]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
    const selectedCodes = Array.from(new Set([
      ...selectedFunds.map(f => f.CODE),
      ...manualTokens.filter(t => /^\d{6}$/.test(t))
    ]));
    if (selectedCodes.length === 0) {
      setError('请输入或选择基金代码');
      return;
    }
    const nameMap = {};
    selectedFunds.forEach(f => { nameMap[f.CODE] = f.NAME; });
    const fundsToConfirm = selectedCodes.map(code => ({
      code,
      name: nameMap[code] || '',
      status: funds.some(f => f.code === code) ? 'added' : 'pending'
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
    const nextGroups = groups.map(g => ({
      ...g,
      codes: g.codes.filter(c => c !== removeCode)
    }));
    setGroups(nextGroups);

    // 同步删除展开收起状态
    setCollapsedCodes(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      return nextSet;
    });

    // 同步删除业绩走势收起状态
    setCollapsedTrends(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      return nextSet;
    });

    // 同步删除我的收益收起状态
    setCollapsedEarnings(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      return nextSet;
    });

    // 同步删除自选状态
    setFavorites(prev => {
      if (!prev || !prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      if (nextSet.size === 0 && currentTab === 'fav') setCurrentTab('all');
      return nextSet;
    });

    // 同步删除持仓数据
    setHoldings(prev => {
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
    setPendingTrades(prev => {
      const next = prev.filter((trade) => trade?.fundCode !== removeCode);
      return next;
    });

    // 同步删除该基金的交易记录
    setTransactions(prev => {
      if (!prev[removeCode]) return prev;
      const next = { ...prev };
      delete next[removeCode];
      return next;
    });

    // 同步删除该基金的估值分时数据
    clearFund(removeCode);
    setValuationSeries(prev => {
      if (!(removeCode in prev)) return prev;
      const next = { ...prev };
      delete next[removeCode];
      return next;
    });

    // 同步删除该基金的每日收益数据
    try {
      clearDailyEarnings(removeCode);
      setFundDailyEarnings(prev => {
        if (!isPlainObject(prev)) return prev;
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach((scopeKey) => {
          const bucket = next[scopeKey];
          if (!isPlainObject(bucket) || !(removeCode in bucket)) return;
          const nb = { ...bucket };
          delete nb[removeCode];
          next[scopeKey] = nb;
          changed = true;
        });
        return changed ? next : prev;
      });
    } catch { }

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
        codes: g.codes.filter((c) => !set.has(c)),
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
      for (const c of set) {
        clearDailyEarnings(c);
      }
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
    } catch { /* empty */ }

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

  const manualRefresh = async () => {
    if (refreshingRef.current) return;
    const codes = Array.from(new Set(funds.map((f) => f.code)));
    if (!codes.length) return;
    await refreshAll(codes);
  };

  const saveSettings = (e, secondsOverride, showMarketIndexOverride, showGroupFundSearchOverride, isMobileOverride) => {
    e?.preventDefault?.();
    const seconds = secondsOverride ?? tempSeconds;
    const ms = Math.max(30, Number(seconds)) * 1000;
    setTempSeconds(Math.round(ms / 1000));
    setRefreshMs(ms);
    const nextShowMarketIndex = typeof showMarketIndexOverride === 'boolean'
      ? showMarketIndexOverride
      : isMobileOverride
        ? showMarketIndexMobile
        : showMarketIndexPc;

    const targetIsMobile = Boolean(isMobileOverride);
    if (targetIsMobile) setShowMarketIndexMobile(nextShowMarketIndex);
    else setShowMarketIndexPc(nextShowMarketIndex);

    const nextShowGroupFundSearch = typeof showGroupFundSearchOverride === 'boolean'
      ? showGroupFundSearchOverride
      : targetIsMobile
        ? showGroupFundSearchMobile
        : showGroupFundSearchPc;
    if (targetIsMobile) setShowGroupFundSearchMobile(nextShowGroupFundSearch);
    else setShowGroupFundSearchPc(nextShowGroupFundSearch);

    const w = Math.min(2000, Math.max(600, Number(containerWidth) || 1200));
    setContainerWidth(w);
    try {
      const parsed = customSettings || {};
      if (targetIsMobile) {
        // 仅更新当前运行端对应的开关键
        setCustomSettings({
          ...parsed,
          pcContainerWidth: w,
          showMarketIndexMobile: nextShowMarketIndex,
          showGroupFundSearchMobile: nextShowGroupFundSearch,
        });
      } else {
        setCustomSettings({
          ...parsed,
          pcContainerWidth: w,
          showMarketIndexPc: nextShowMarketIndex,
          showGroupFundSearchPc: nextShowGroupFundSearch,
        });
      }
    } catch { }
    setSettingsOpen(false);
  };

  const handleResetContainerWidth = () => {
    setContainerWidth(1200);
    try {
      const parsed = customSettings || {};
      setCustomSettings({ ...parsed, pcContainerWidth: 1200 });
    } catch { }
  };

  const importFileRef = useRef(null);
  const [importMsg, setImportMsg] = useState('');

  function normalizeCode(value) {
    return String(value ?? '').trim();
  }

  function cleanCodeArray(input, allowedSet = null) {
    const arr = Array.isArray(input) ? input : [];
    const next = [];
    const seen = new Set();
    for (const v of arr) {
      const code = normalizeCode(v);
      if (!code) continue;
      if (allowedSet && !allowedSet.has(code)) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      next.push(code);
    }
    return next;
  }
  const normalizeNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const normalizeFundDailyEarningsScoped = (source) => {
    if (!isPlainObject(source)) return {};
    const values = Object.values(source);
    const hasScoped = values.some((v) => isPlainObject(v));
    if (!hasScoped) {
      return { [DAILY_EARNINGS_SCOPE_ALL]: source };
    }
    return source;
  };

  function getComparablePayload(payload) {
    if (!isPlainObject(payload)) return '';
    const rawFunds = Array.isArray(payload.funds) ? payload.funds : [];
    const fundCodes = rawFunds
      .map((fund) => normalizeCode(fund?.code || fund?.CODE))
      .filter(Boolean);
    const uniqueFundCodes = Array.from(new Set(fundCodes)).sort();

    const favorites = Array.isArray(payload.favorites)
      ? Array.from(new Set(payload.favorites.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
      : [];

    const collapsedCodes = Array.isArray(payload.collapsedCodes)
      ? Array.from(new Set(payload.collapsedCodes.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
      : [];

    const collapsedTrends = Array.isArray(payload.collapsedTrends)
      ? Array.from(new Set(payload.collapsedTrends.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
      : [];

    const collapsedEarnings = Array.isArray(payload.collapsedEarnings)
      ? Array.from(new Set(payload.collapsedEarnings.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
      : [];

    const groups = Array.isArray(payload.groups)
      ? payload.groups
          .map((group) => {
            const id = normalizeCode(group?.id);
            if (!id) return null;
            const name = isString(group?.name) ? group.name : '';
            const codes = Array.isArray(group?.codes)
              ? Array.from(new Set(group.codes.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
              : [];
            return { id, name, codes };
          })
          .filter(Boolean)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];

    const validGroupIds = new Set(groups.map((g) => g.id));

    const holdingsSource = isPlainObject(payload.holdings) ? payload.holdings : {};
    const holdings = {};
    Object.keys(holdingsSource)
      .map(normalizeCode)
      .filter((code) => uniqueFundCodes.includes(code))
      .sort()
      .forEach((code) => {
        const value = holdingsSource[code] || {};
        const share = normalizeNumber(value.share);
        const cost = normalizeNumber(value.cost);
        if (share === null && cost === null) return;
        holdings[code] = { share, cost };
      });

    const ghSource = isPlainObject(payload.groupHoldings) ? payload.groupHoldings : {};
    const groupHoldingsNorm = {};
    Object.keys(ghSource)
      .map(normalizeCode)
      .filter((gid) => validGroupIds.has(gid))
      .sort()
      .forEach((gid) => {
        const bucket = ghSource[gid] || {};
        const inner = {};
        Object.keys(bucket)
          .map(normalizeCode)
          .filter((code) => uniqueFundCodes.includes(code))
          .sort()
          .forEach((code) => {
            const value = bucket[code] || {};
            const share = normalizeNumber(value.share);
            const cost = normalizeNumber(value.cost);
            if (share === null && cost === null) return;
            inner[code] = { share, cost };
          });
        if (Object.keys(inner).length) groupHoldingsNorm[gid] = inner;
      });

    const pendingTrades = Array.isArray(payload.pendingTrades)
      ? payload.pendingTrades
          .map((trade) => {
            const fundCode = normalizeCode(trade?.fundCode);
            if (!fundCode) return null;
            const row = {
              id: trade?.id ? String(trade.id) : '',
              fundCode,
              type: trade?.type || '',
              share: normalizeNumber(trade?.share),
              amount: normalizeNumber(trade?.amount),
              feeRate: normalizeNumber(trade?.feeRate),
              feeMode: trade?.feeMode || '',
              feeValue: normalizeNumber(trade?.feeValue),
              date: trade?.date || '',
              isAfter3pm: !!trade?.isAfter3pm,
              isDca: !!trade?.isDca,
            };
            const g = trade?.groupId != null && trade.groupId !== '' ? normalizeCode(trade.groupId) : null;
            if (g) {
              if (!validGroupIds.has(g)) return null;
              row.groupId = g;
            }
            return row;
          })
          .filter((trade) => trade && uniqueFundCodes.includes(trade.fundCode))
          .sort((a, b) => {
            const gidA = a.groupId || '';
            const gidB = b.groupId || '';
            const keyA = a.id || `${gidA}|${a.fundCode}|${a.type}|${a.date}|${a.share ?? ''}|${a.amount ?? ''}|${a.feeMode}|${a.feeValue ?? ''}|${a.feeRate ?? ''}|${a.isAfter3pm ? 1 : 0}|${a.isDca ? 1 : 0}`;
            const keyB = b.id || `${gidB}|${b.fundCode}|${b.type}|${b.date}|${b.share ?? ''}|${b.amount ?? ''}|${b.feeMode}|${b.feeValue ?? ''}|${b.feeRate ?? ''}|${b.isAfter3pm ? 1 : 0}|${b.isDca ? 1 : 0}`;
            return keyA.localeCompare(keyB);
          })
      : [];

    const transactionsSource = isPlainObject(payload.transactions) ? payload.transactions : {};
    const transactions = {};
    Object.keys(transactionsSource)
      .map(normalizeCode)
      .filter((code) => uniqueFundCodes.includes(code))
      .sort()
      .forEach((code) => {
        const list = Array.isArray(transactionsSource[code]) ? transactionsSource[code] : [];
        const normalized = list
          .map((t) => {
            const id = t?.id ? String(t.id) : '';
            const type = t?.type || '';
            const share = normalizeNumber(t?.share);
            const amount = normalizeNumber(t?.amount);
            const price = normalizeNumber(t?.price);
            const date = t?.date || '';
            const timestamp = Number.isFinite(t?.timestamp) ? t.timestamp : 0;
            const isDca = !!t?.isDca;
            const isHistoryOnly = !!t?.isHistoryOnly;
            const row = { id, type, share, amount, price, date, timestamp, isDca, isHistoryOnly };
            const g = t?.groupId != null && t.groupId !== '' ? normalizeCode(t.groupId) : null;
            if (g) {
              if (!validGroupIds.has(g)) return null;
              row.groupId = g;
            }
            return row;
          })
          .filter((t) => t && (t.id || t.timestamp))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (normalized.length > 0) transactions[code] = normalized;
      });

    const dcaScoped = migrateDcaPlansToScoped(isPlainObject(payload.dcaPlans) ? payload.dcaPlans : {});
    const dcaPlans = {};
    Object.keys(dcaScoped)
      .sort()
      .forEach((scopeKeyRaw) => {
        const scopeKey = normalizeCode(scopeKeyRaw);
        if (scopeKey !== DCA_SCOPE_GLOBAL && !validGroupIds.has(scopeKey)) return;
        const bucket = dcaScoped[scopeKeyRaw];
        if (!isPlainObject(bucket)) return;
        const inner = {};
        Object.keys(bucket)
          .map(normalizeCode)
          .filter((code) => uniqueFundCodes.includes(code))
          .sort()
          .forEach((code) => {
            const plan = bucket[code] || {};
            const amount = normalizeNumber(plan.amount);
            const feeRate = normalizeNumber(plan.feeRate);
            const cycle = ['daily', 'weekly', 'biweekly', 'monthly'].includes(plan.cycle) ? plan.cycle : '';
            const firstDate = plan.firstDate ? String(plan.firstDate) : '';
            const enabled = !!plan.enabled;
            const weeklyDay = normalizeNumber(plan.weeklyDay);
            const monthlyDay = normalizeNumber(plan.monthlyDay);
            const lastDate = plan.lastDate ? String(plan.lastDate) : '';
            if (amount === null && feeRate === null && !cycle && !firstDate && !enabled && weeklyDay === null && monthlyDay === null && !lastDate) return;
            inner[code] = {
              amount,
              feeRate,
              cycle,
              firstDate,
              enabled,
              weeklyDay: weeklyDay !== null ? weeklyDay : null,
              monthlyDay: monthlyDay !== null ? monthlyDay : null,
              lastDate
            };
          });
        if (Object.keys(inner).length) dcaPlans[scopeKey] = inner;
      });

    const customSettings = isPlainObject(payload.customSettings) ? payload.customSettings : {};
    const fundDailyEarningsSource = normalizeFundDailyEarningsScoped(payload.fundDailyEarnings);
    const fundDailyEarningsSig = Object.keys(fundDailyEarningsSource)
      .sort()
      .flatMap((scopeKey) => {
        const bucket = fundDailyEarningsSource[scopeKey];
        if (!isPlainObject(bucket)) return [];
        return Object.keys(bucket)
          .map(normalizeCode)
          .filter((code) => uniqueFundCodes.includes(code))
          .sort()
          .map((code) => {
            const list = Array.isArray(bucket[code]) ? bucket[code] : [];
            const last = list.length ? list[list.length - 1] : null;
            const date = last?.date ? String(last.date) : '';
            const earnings = Number(last?.earnings);
            return `${scopeKey}|${code}|${date}|${Number.isFinite(earnings) ? earnings.toFixed(2) : ''}|${list.length}`;
          });
      });

    const tagRows = Array.isArray(payload.tags) ? payload.tags : [];
    const tagsSig = tagRows
      .map((r) => {
        const codes = getFundCodesFromTagRecord(r)
          .map((c) => normalizeCode(c))
          .filter(Boolean)
          .sort()
          .join(',');
        return `${codes}|${String(r?.id ?? '')}|${String(r?.name ?? '')}|${String(r?.theme ?? '')}`;
      })
      .sort()
      .join('\n');

    return JSON.stringify({
      funds: uniqueFundCodes,
      tagsSig,
      favorites,
      groups,
      collapsedCodes,
      collapsedTrends,
      refreshMs: Number.isFinite(payload.refreshMs) ? payload.refreshMs : 30000,
      holdings,
      groupHoldings: groupHoldingsNorm,
      pendingTrades,
      transactions,
      dcaPlans,
      customSettings,
      fundDailyEarningsSig
    });
  }

  const collectLocalPayload = (keys = null) => {
    try {
      const all = {};
      // 不包含 fundValuationTimeseries，该数据暂不同步到云端
      if (!keys || keys.has('funds')) {
        all.funds = storageStore.getItem('funds', []);
      }
      if (!keys || keys.has('favorites')) {
        all.favorites = storageStore.getItem('favorites', []);
      }
      if (!keys || keys.has('groups')) {
        all.groups = storageStore.getItem('groups', []);
      }
      if (!keys || keys.has('collapsedCodes')) {
        all.collapsedCodes = storageStore.getItem('collapsedCodes', []);
      }
      if (!keys || keys.has('collapsedTrends')) {
        all.collapsedTrends = storageStore.getItem('collapsedTrends', []);
      }
      if (!keys || keys.has('collapsedEarnings')) {
        all.collapsedEarnings = storageStore.getItem('collapsedEarnings', []);
      }
      if (!keys || keys.has('refreshMs')) {
        all.refreshMs = storageStore.getItem('refreshMs', 30000);
      }
      if (!keys || keys.has('holdings')) {
        all.holdings = storageStore.getItem('holdings', {});
      }
      if (!keys || keys.has('groupHoldings')) {
        all.groupHoldings = storageStore.getItem('groupHoldings', {});
      }
      if (!keys || keys.has('pendingTrades')) {
        all.pendingTrades = storageStore.getItem('pendingTrades', []);
      }
      if (!keys || keys.has('transactions')) {
        all.transactions = storageStore.getItem('transactions', {});
      }
      if (!keys || keys.has('dcaPlans')) {
        all.dcaPlans = storageStore.getItem('dcaPlans', {});
      }
      if (!keys || keys.has('customSettings')) {
        all.customSettings = storageStore.getItem('customSettings', {});
      }
      if (!keys || keys.has('fundDailyEarnings')) {
        all.fundDailyEarnings = storageStore.getItem('fundDailyEarnings', {});
      }
      if (!keys || keys.has('tags')) {
        all.tags = storageStore.getItem('tags', []);
      }
      // fundTagLists 已废弃：基金-标签归属仅由 tags.fundCodes 推导

      // 如果是全量收集（keys 为 null），进行完整的数据清洗和验证逻辑
      if (!keys) {
        all.funds = Array.isArray(all.funds) ? all.funds.map(stripLegacyTagsFromFundObject) : [];
        const fundCodes = new Set(
          Array.isArray(all.funds)
            ? all.funds.map((f) => f?.code).filter(Boolean)
            : []
        );

        const cleanedHoldings = isPlainObject(all.holdings)
          ? Object.entries(all.holdings).reduce((acc, [code, value]) => {
            if (!fundCodes.has(code) || !isPlainObject(value)) return acc;
            const parsedShare = isNumber(value.share)
              ? value.share
              : isString(value.share)
                ? Number(value.share)
                : NaN;
            const parsedCost = isNumber(value.cost)
              ? value.cost
              : isString(value.cost)
                ? Number(value.cost)
                : NaN;
            const nextShare = Number.isFinite(parsedShare) ? parsedShare : null;
            const nextCost = Number.isFinite(parsedCost) ? parsedCost : null;
            if (nextShare === null && nextCost === null) return acc;
            acc[code] = {
              ...value,
              share: nextShare,
              cost: nextCost
            };
            return acc;
          }, {})
          : {};

        const cleanedFavorites = Array.isArray(all.favorites)
          ? all.favorites.filter((code) => fundCodes.has(code))
          : [];
        const cleanedCollapsed = Array.isArray(all.collapsedCodes)
          ? all.collapsedCodes.filter((code) => fundCodes.has(code))
          : [];
        const cleanedCollapsedTrends = Array.isArray(all.collapsedTrends)
          ? all.collapsedTrends.filter((code) => fundCodes.has(code))
          : [];
        const cleanedCollapsedEarnings = Array.isArray(all.collapsedEarnings)
          ? all.collapsedEarnings.filter((code) => fundCodes.has(code))
          : [];
        const cleanedGroups = Array.isArray(all.groups)
          ? all.groups.map(g => ({
              ...g,
              codes: Array.isArray(g.codes) ? g.codes.filter(c => fundCodes.has(c)) : []
            }))
          : [];

        const validGroupIdSet = new Set(cleanedGroups.map((g) => g?.id).filter(Boolean));

        const cleanedGroupHoldings = isPlainObject(all.groupHoldings)
          ? Object.entries(all.groupHoldings).reduce((acc, [gid, bucket]) => {
              if (!validGroupIdSet.has(gid) || !isPlainObject(bucket)) return acc;
              const inner = Object.entries(bucket).reduce((bacc, [code, value]) => {
                if (!fundCodes.has(code) || !isPlainObject(value)) return bacc;
                const parsedShare = isNumber(value.share)
                  ? value.share
                  : isString(value.share)
                    ? Number(value.share)
                    : NaN;
                const parsedCost = isNumber(value.cost)
                  ? value.cost
                  : isString(value.cost)
                    ? Number(value.cost)
                    : NaN;
                const nextShare = Number.isFinite(parsedShare) ? parsedShare : null;
                const nextCost = Number.isFinite(parsedCost) ? parsedCost : null;
                if (nextShare === null && nextCost === null) return bacc;
                bacc[code] = {
                  ...value,
                  share: nextShare,
                  cost: nextCost
                };
                return bacc;
              }, {});
              if (Object.keys(inner).length) acc[gid] = inner;
              return acc;
            }, {})
          : {};

        const scopedDca = migrateDcaPlansToScoped(isPlainObject(all.dcaPlans) ? all.dcaPlans : {});
        const cleanedDcaPlans = Object.entries(scopedDca).reduce((acc, [scopeKey, bucket]) => {
          const sk = String(scopeKey);
          if (sk !== DCA_SCOPE_GLOBAL && !validGroupIdSet.has(sk)) return acc;
          if (!isPlainObject(bucket)) return acc;
          const inner = Object.entries(bucket).reduce((bacc, [code, plan]) => {
            if (!fundCodes.has(code) || !isPlainObject(plan)) return bacc;
            bacc[code] = plan;
            return bacc;
          }, {});
          if (Object.keys(inner).length) acc[sk] = inner;
          return acc;
        }, {});
        if (!cleanedDcaPlans[DCA_SCOPE_GLOBAL]) cleanedDcaPlans[DCA_SCOPE_GLOBAL] = {};

        const dailyScoped = normalizeFundDailyEarningsScoped(all.fundDailyEarnings);
        const cleanedFundDailyEarnings = Object.entries(dailyScoped).reduce((acc, [scopeKey, bucket]) => {
          if (!isPlainObject(bucket)) return acc;
          if (scopeKey !== DAILY_EARNINGS_SCOPE_ALL && !validGroupIdSet.has(scopeKey)) return acc;
          const normalizedBucket = Object.entries(bucket).reduce((bacc, [code, list]) => {
            if (!fundCodes.has(code) || !Array.isArray(list)) return bacc;
            const normalized = list
              .map((item) => {
                const date = item?.date ? String(item.date) : '';
                const earnings = Number(item?.earnings);
                const rateRaw = item?.rate;
                const rate = rateRaw === null || rateRaw === undefined || rateRaw === ''
                  ? null
                  : Number(rateRaw);
                const baseCostAmountRaw = item?.baseCostAmount;
                const baseCostAmount = baseCostAmountRaw === null || baseCostAmountRaw === undefined || baseCostAmountRaw === ''
                  ? null
                  : Number(baseCostAmountRaw);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
                if (!Number.isFinite(earnings)) return null;
                return {
                  date,
                  earnings,
                  ...(Number.isFinite(rate) ? { rate } : { rate: null }),
                  ...(Number.isFinite(baseCostAmount) && baseCostAmount > 0 ? { baseCostAmount } : { baseCostAmount: null }),
                };
              })
              .filter(Boolean)
              .sort((a, b) => a.date.localeCompare(b.date));
            if (normalized.length === 0) return bacc;
            bacc[code] = normalized;
            return bacc;
          }, {});
          if (Object.keys(normalizedBucket).length === 0) return acc;
          acc[scopeKey] = normalizedBucket;
          return acc;
        }, {});

        const cleanedTags = Array.isArray(all.tags)
          ? all.tags
            .map((r) => {
              const codes = getFundCodesFromTagRecord(r).filter((c) => fundCodes.has(c));
              const name = String(r?.name ?? '').trim();
              if (!name) return null;
              return sanitizeTagRowForStorage({
                ...r,
                id: String(r?.id ?? '').trim() || uuidv4(),
                name,
                theme: String(r?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME,
                fundCodes: codes,
              });
            })
            .filter(Boolean)
          : [];

        // fundTagLists 已废弃：不再清洗/返回该字段

        return {
          funds: all.funds,
          tags: cleanedTags,
          favorites: cleanedFavorites,
          groups: cleanedGroups,
          collapsedCodes: cleanedCollapsed,
          collapsedTrends: cleanedCollapsedTrends,
          collapsedEarnings: cleanedCollapsedEarnings,
          refreshMs: all.refreshMs,
          holdings: cleanedHoldings,
          groupHoldings: cleanedGroupHoldings,
          pendingTrades: all.pendingTrades,
          transactions: all.transactions,
          dcaPlans: cleanedDcaPlans,
          customSettings: isPlainObject(all.customSettings) ? all.customSettings : {},
          fundDailyEarnings: cleanedFundDailyEarnings
        };
      }

      // 如果是部分收集，直接返回读取到的字段
      return all;
    } catch {
      // 安全回退：如果是增量更新失败，返回空对象避免覆盖；全量更新则返回默认空配置
      if (keys) return {};
      return {
        funds: [],
        tags: [],
        favorites: [],
        groups: [],
        collapsedCodes: [],
        collapsedTrends: [],
        collapsedEarnings: [],
        refreshMs: 30000,
        holdings: {},
        groupHoldings: {},
        pendingTrades: [],
        transactions: {},
        dcaPlans: { [DCA_SCOPE_GLOBAL]: {} },
        customSettings: {},
        exportedAt: nowInTz().toISOString()
      };
    }
  };

  const mergeValuationFieldsByGztime = (localFund, cloudFund) => {
    if (!isPlainObject(cloudFund)) return cloudFund;
    if (!isPlainObject(localFund)) return cloudFund;

    const localGzRaw = localFund.gztime;
    const cloudGzRaw = cloudFund.gztime;

    if (!isString(localGzRaw) || !isString(cloudGzRaw)) return cloudFund;

    const localGz = toTz(localGzRaw);
    const cloudGz = toTz(cloudGzRaw);
    if (!localGz?.isValid?.() || !cloudGz?.isValid?.()) return cloudFund;

    if (!localGz.isAfter(cloudGz)) return cloudFund;

    const patch = {};
    if (!isNil(localFund.gsz)) patch.gsz = localFund.gsz;
    if (!isNil(localFund.gszzl)) patch.gszzl = localFund.gszzl;
    if (!isNil(localFund.gztime)) patch.gztime = localFund.gztime;

    return { ...cloudFund, ...patch };
  };

  const applyCloudConfig = async (cloudData, cloudUpdatedAt) => {
    if (!isPlainObject(cloudData)) return;
    skipSyncRef.current = true;
    try {
      if (cloudUpdatedAt) {
        storageHelper.setItem('localUpdatedAt', cloudUpdatedAt);
      }
      let localFundsForMerge = [];
      try {
        localFundsForMerge = storageStore.getItem('funds', []);
      } catch { }
      const localFundByCode = new Map(
        localFundsForMerge
          .map(stripLegacyTagsFromFundObject)
          .filter((f) => f && f.code != null)
          .map((f) => [String(f.code), f])
      );

      const cloudFunds = Array.isArray(cloudData.funds)
        ? dedupeByCode(cloudData.funds.map(stripLegacyTagsFromFundObject))
        : [];
      const nextFunds = cloudFunds.map((cf) => mergeValuationFieldsByGztime(localFundByCode.get(String(cf?.code)), cf));
      setFunds(nextFunds);
      const nextFundCodes = new Set(nextFunds.map((f) => f.code));

      if (hasOwn(cloudData, 'tags')) {
        const cleanedTagRows = (Array.isArray(cloudData.tags) ? cloudData.tags : [])
          .map((r) => {
            const codes = getFundCodesFromTagRecord(r).filter((c) => nextFundCodes.has(c));
            const name = String(r?.name ?? '').trim();
            if (!name) return null;
            return sanitizeTagRowForStorage({
              ...r,
              id: String(r?.id ?? '').trim() || uuidv4(),
              name,
              theme: String(r?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME,
              fundCodes: codes,
            });
          })
          .filter(Boolean);
        setFundTagRecords(cleanedTagRows);
        storageHelper.setItem('tags', JSON.stringify(cleanedTagRows));
      } else {
        try {
          const localTags = storageStore.getItem('tags', []);
          const normalized = localTags
            .map((r) => {
              const codes = getFundCodesFromTagRecord(r).filter((c) => nextFundCodes.has(c));
              return sanitizeTagRowForStorage({
                ...r,
                id: String(r.id || '').trim() || uuidv4(),
                name: String(r.name || '').trim(),
                theme: String(r.theme || '').trim() || DEFAULT_FUND_TAG_THEME,
                fundCodes: codes,
              });
            })
            .filter(Boolean);
          setFundTagRecords(normalized);
        } catch {
          setFundTagRecords([]);
        }
      }

      // fundTagLists 已废弃：基金-标签归属仅由 tags.fundCodes 推导

      // favorites 必须是字符串 code，且必须存在于 funds 中
      const nextFavorites = cleanCodeArray(cloudData.favorites, nextFundCodes);
      setFavorites(new Set(nextFavorites));

      const nextGroups = Array.isArray(cloudData.groups)
        ? cloudData.groups
            .map((g) => ({
              ...g,
              id: String(g?.id ?? '').trim() || uuidv4(),
              name: String(g?.name ?? '').trim(),
              codes: cleanCodeArray(g?.codes, nextFundCodes),
            }))
            // 保留“空分组”（codes 允许为空）；仅丢弃无名称分组，避免云端应用时误删用户刚新建的分组
            .filter((g) => g.name.length > 0)
        : [];
      setGroups(nextGroups);

      const nextCollapsed = Array.isArray(cloudData.collapsedCodes) ? cloudData.collapsedCodes : [];
      setCollapsedCodes(new Set(nextCollapsed));

      if (Array.isArray(cloudData.collapsedTrends)) {
        setCollapsedTrends(new Set(cloudData.collapsedTrends));
      }
      if (Array.isArray(cloudData.collapsedEarnings)) {
        setCollapsedEarnings(new Set(cloudData.collapsedEarnings));
      }

      const nextRefreshMs = Number.isFinite(cloudData.refreshMs) && cloudData.refreshMs >= 5000 ? cloudData.refreshMs : 30000;
      setRefreshMs(nextRefreshMs);
      setTempSeconds(Math.round(nextRefreshMs / 1000));

      const nextHoldings = isPlainObject(cloudData.holdings) ? cloudData.holdings : {};
      setHoldings(nextHoldings);

      const cloudGroupIds = new Set(nextGroups.map((g) => g?.id).filter(Boolean));

      let nextGroupHoldings = isPlainObject(cloudData.groupHoldings) ? cloudData.groupHoldings : {};
      const seedAfterCloud = seedGroupHoldingsFromGlobal(nextHoldings, nextGroups, nextGroupHoldings);
      if (seedAfterCloud.changed) {
        nextGroupHoldings = seedAfterCloud.next;
      }
      setGroupHoldings(nextGroupHoldings);

      // 兼容：旧版本云端 data 可能不包含 pendingTrades / transactions / dcaPlans 字段。
      // 若字段缺失，必须保留本地，避免“更新后云端覆盖导致记录清空”。
      if (hasOwn(cloudData, 'pendingTrades')) {
        const nextPendingTrades = Array.isArray(cloudData.pendingTrades)
          ? cloudData.pendingTrades.filter((trade) => {
              if (!trade || !nextFundCodes.has(trade.fundCode)) return false;
              if (trade.groupId && !cloudGroupIds.has(trade.groupId)) return false;
              return true;
            })
          : [];
        setPendingTrades(nextPendingTrades);
      } else {
        try {
          const localPending = storageStore.getItem('pendingTrades', []);
          setPendingTrades(Array.isArray(localPending) ? localPending : []);
        } catch { }
      }

      if (hasOwn(cloudData, 'transactions')) {
        const nextTransactions = isPlainObject(cloudData.transactions) ? cloudData.transactions : {};
        setTransactions(nextTransactions);
      } else {
        try {
          const localTx = storageStore.getItem('transactions', {});
          setTransactions(isPlainObject(localTx) ? localTx : {});
        } catch { }
      }

      if (hasOwn(cloudData, 'dcaPlans')) {
        const cloudDcaScoped = migrateDcaPlansToScoped(isPlainObject(cloudData.dcaPlans) ? cloudData.dcaPlans : {});
        const nextDcaPlans = {};
        Object.entries(cloudDcaScoped).forEach(([scopeKey, bucket]) => {
          if (scopeKey !== DCA_SCOPE_GLOBAL && !cloudGroupIds.has(scopeKey)) return;
          if (!isPlainObject(bucket)) return;
          const inner = {};
          Object.entries(bucket).forEach(([code, plan]) => {
            if (!nextFundCodes.has(code) || !isPlainObject(plan)) return;
            inner[code] = plan;
          });
          if (Object.keys(inner).length) nextDcaPlans[scopeKey] = inner;
        });
        if (!nextDcaPlans[DCA_SCOPE_GLOBAL]) nextDcaPlans[DCA_SCOPE_GLOBAL] = {};
        setDcaPlans(nextDcaPlans);
      } else {
        try {
          const localDca = storageStore.getItem('dcaPlans', {});
          setDcaPlans(migrateDcaPlansToScoped(isPlainObject(localDca) ? localDca : {}));
        } catch { }
      }

      const cloudDaily = normalizeFundDailyEarningsScoped(cloudData.fundDailyEarnings);
      const nextFundDailyEarnings = Object.entries(cloudDaily).reduce((acc, [scopeKey, bucket]) => {
        if (!isPlainObject(bucket)) return acc;
        if (scopeKey !== DAILY_EARNINGS_SCOPE_ALL && !cloudGroupIds.has(scopeKey)) return acc;
        const normalizedBucket = Object.entries(bucket).reduce((bacc, [code, list]) => {
          if (!nextFundCodes.has(code) || !Array.isArray(list)) return bacc;
          const normalized = list
            .map((item) => {
              const date = item?.date ? String(item.date) : '';
              const earnings = Number(item?.earnings);
              const rateRaw = item?.rate;
              const rate = rateRaw === null || rateRaw === undefined || rateRaw === ''
                ? null
                : Number(rateRaw);
              const baseCostAmountRaw = item?.baseCostAmount;
              const baseCostAmount = baseCostAmountRaw === null || baseCostAmountRaw === undefined || baseCostAmountRaw === ''
                ? null
                : Number(baseCostAmountRaw);
              if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
              if (!Number.isFinite(earnings)) return null;
              return {
                date,
                earnings,
                ...(Number.isFinite(rate) ? { rate } : { rate: null }),
                ...(Number.isFinite(baseCostAmount) && baseCostAmount > 0 ? { baseCostAmount } : { baseCostAmount: null }),
              };
            })
            .filter(Boolean)
            .sort((a, b) => a.date.localeCompare(b.date));
          if (normalized.length === 0) return bacc;
          bacc[code] = normalized;
          return bacc;
        }, {});
        if (Object.keys(normalizedBucket).length === 0) return acc;
        acc[scopeKey] = normalizedBucket;
        return acc;
      }, {});
      setFundDailyEarnings(nextFundDailyEarnings);

      if (isPlainObject(cloudData.customSettings)) {
        try {
          const merged = { ...(customSettings || {}), ...cloudData.customSettings };
          setCustomSettings(merged);
          if (
            typeof merged.localSortDisplayMode === 'string' &&
            SORT_DISPLAY_MODES.has(merged.localSortDisplayMode)
          ) {
            setPcSortDisplayMode(merged.localSortDisplayMode);
            setMobileSortDisplayMode(merged.localSortDisplayMode);
          } else {
            if (typeof merged.pcLocalSortDisplayMode === 'string' && SORT_DISPLAY_MODES.has(merged.pcLocalSortDisplayMode)) {
              setPcSortDisplayMode(merged.pcLocalSortDisplayMode);
            }
            if (typeof merged.mobileLocalSortDisplayMode === 'string' && SORT_DISPLAY_MODES.has(merged.mobileLocalSortDisplayMode)) {
              setMobileSortDisplayMode(merged.mobileLocalSortDisplayMode);
            }
          }
        } catch { }
      }

      if (nextFunds.length) {
        const codes = Array.from(new Set(nextFunds.map((f) => f.code)));
        if (codes.length) await refreshAll(codes);
        // 刷新完成后,强制同步本地localStorage 的 funds 数据到云端
        const currentUserId = userIdRef.current || user?.id;
        if (currentUserId) {
          try {
            const latestFunds = storageStore.getItem('funds', []);
            const localSig = getFundCodesSignature(latestFunds, ['gztime']);
            const cloudSig = getFundCodesSignature(Array.isArray(cloudData.funds) ? cloudData.funds : [], ['gztime']);
            if (localSig !== cloudSig) {
              await syncUserConfig(
                currentUserId,
                false,
                { funds: Array.isArray(latestFunds) ? latestFunds : [] },
                true
              );
            }
          } catch (e) {
            console.error('刷新后强制同步 funds 到云端失败', e);
          }
        }
      }

      const payload = collectLocalPayload();
      lastSyncedRef.current = getComparablePayload(payload);
    } finally {
      skipSyncRef.current = false;
    }
  };

  const fetchCloudConfig = async (userId, checkConflict = false) => {
    if (!userId) return;
    try {
      // 一次查询同时拿到 meta 与 data，方便两种模式复用
      const { data: meta, error: metaError } = await supabase
        .from('user_configs')
        .select('id, data, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (metaError) throw metaError;

      if (!meta?.id) {
        const { error: insertError } = await supabase
          .from('user_configs')
          .insert({ user_id: userId });
        if (insertError) throw insertError;
        setCloudConfigModal({ open: true, userId, type: 'empty' });
        return;
      }

      // 冲突检查模式：使用 meta.data 弹出冲突确认弹窗
      if (checkConflict) {
        setCloudConfigModal({ open: true, userId, type: 'conflict', cloudData: meta.data });
        return;
      }

      // 非冲突检查模式：直接复用上方查询到的 meta 数据，覆盖本地
      if (meta.data && isPlainObject(meta.data) && Object.keys(meta.data).length > 0) {
        await applyCloudConfig(meta.data, meta.updated_at);
        return;
      }

      setCloudConfigModal({ open: true, userId, type: 'empty' });
    } catch (e) {
      console.error('获取云端配置失败', e);
      skipSyncRef.current = false;
    }
  };

  const syncUserConfig = async (userId, showTip = true, payload = null, isPartial = false) => {
    if (!userId) {
      showToast(`userId 不存在，请重新登录`, 'error');
      return;
    }
    try {
      setIsSyncing(true);
      const baseData = payload || collectLocalPayload(); // Fallback to full sync if no payload
      const now = nowInTz().toISOString();
      let deviceId = deviceIdRef.current || '';
      if (!deviceId) {
        try {
          const key = 'rtfDeviceId';
          deviceId = storageStore.getItem(key) || '';
          if (!deviceId) {
            deviceId = uuidv4();
            storageStore.setItem(key, deviceId);
          }
          deviceIdRef.current = deviceId;
        } catch {
          deviceId = uuidv4();
          deviceIdRef.current = deviceId;
        }
      }
      const dataToSync = isPlainObject(baseData)
        ? {
            ...baseData,
            _syncMeta: {
              ...(isPlainObject(baseData._syncMeta) ? baseData._syncMeta : {}),
              deviceId,
              at: now,
            }
          }
        : { _syncMeta: { deviceId, at: now } };

      if (isPartial) {
        // 增量更新：使用 RPC 调用
        const { error: rpcError } = await supabase.rpc('update_user_config_partial', {
          payload: dataToSync,
          p_last_device_id: deviceId
        });

        if (rpcError) {
          console.error('增量同步失败，尝试全量同步', rpcError);
          // RPC 失败回退到全量更新
          const fullPayload = collectLocalPayload();
          const { error } = await supabase
            .from('user_configs')
            .upsert(
              {
                user_id: userId,
                data: fullPayload,
                updated_at: now
              },
              { onConflict: 'user_id' }
            );
          if (error) throw error;
        }
      } else {
        // 全量更新
        const { error } = await supabase
          .from('user_configs')
          .upsert(
            {
              user_id: userId,
              data: dataToSync,
              updated_at: now,
              last_device_id: deviceId
            },
            { onConflict: 'user_id' }
          );
        if (error) throw error;
      }

      storageHelper.setItem('localUpdatedAt', now);

      if (showTip) {
        setSuccessModal({ open: true, message: '已同步云端配置' });
      }
    } catch (e) {
      console.error('同步云端配置异常', e);
      // 临时关闭同步异常提示
      // showToast(`同步云端配置异常:${e}`, 'error');
    } finally {
      setIsSyncing(false);
      skipSyncRef.current = false;
    }
  };

  const handleSyncLocalConfig = async () => {
    const userId = cloudConfigModal.userId;
    setCloudConfigModal({ open: false, userId: null });
    await syncUserConfig(userId);
  };

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

        if (Array.isArray(data.funds)) {
          const incomingFunds = dedupeByCode(data.funds.map(stripLegacyTagsFromFundObject));
          const existingCodes = new Set(currentFunds.map(f => f.code));
          const newItems = incomingFunds.filter(f => f && f.code && !existingCodes.has(f.code));
          appendedCodes = newItems.map(f => f.code);
          mergedFunds = [...currentFunds, ...newItems];
          setFunds(mergedFunds);
        }

        if (Array.isArray(data.favorites)) {
          const fundCodeSet = new Set(mergedFunds.map((f) => f?.code).filter(Boolean));
          const mergedFav = cleanCodeArray([...currentFavorites, ...data.favorites], fundCodeSet);
          setFavorites(new Set(mergedFav));
        }

        if (Array.isArray(data.tags)) {
          const currentTags = storageStore.getItem('tags', []);
          const fundCodeSet = new Set(mergedFunds.map((f) => f?.code).filter(Boolean));
          const byId = new Map((Array.isArray(currentTags) ? currentTags : []).map((r) => [String(r.id), r]));
          for (const r of data.tags) {
            if (!r || typeof r !== 'object') continue;
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
              fundCodes: mergedCodes,
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

        if (Array.isArray(data.groups)) {
          // 合并分组：如果 ID 相同则合并 codes，否则添加新分组
          const mergedGroups = [...currentGroups];
          data.groups.forEach(incomingGroup => {
            const existingIdx = mergedGroups.findIndex(g => g.id === incomingGroup.id);
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

        if (Array.isArray(data.collapsedCodes)) {
          const mergedCollapsed = Array.from(new Set([...currentCollapsed, ...data.collapsedCodes]));
          setCollapsedCodes(new Set(mergedCollapsed));
        }

        if (Array.isArray(data.collapsedTrends)) {
          const mergedTrends = Array.from(new Set([...currentTrends, ...data.collapsedTrends]));
          setCollapsedTrends(new Set(mergedTrends));
        }

        if (Array.isArray(data.collapsedEarnings)) {
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
                 if (!Array.isArray(txs)) return;
                 const existing = mergedTransactions[code] || [];
                 const existingIds = new Set(existing.map(t => t.id));
                 const newTxs = txs.filter(t => !existingIds.has(t.id));
                 mergedTransactions[code] = [...existing, ...newTxs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
             });
             setTransactions(mergedTransactions);
        }

        if (Array.isArray(data.pendingTrades)) {
          const existingPending = Array.isArray(currentPendingTrades) ? currentPendingTrades : [];
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
              ...(isPlainObject(incomingScoped[scope]) ? incomingScoped[scope] : {}),
            };
          });
          setDcaPlans(mergedDca);
          }
        if (isPlainObject(data.customSettings)) {
          try {
            const currentCustomSettings = customSettings || {};
            const mergedSettings = {
              ...(isPlainObject(currentCustomSettings) ? currentCustomSettings : {}),
              ...data.customSettings,
            };
            setCustomSettings(mergedSettings);
            if (mergedSettings.localSortRules && Array.isArray(mergedSettings.localSortRules)) {
              setSortRules(mergedSettings.localSortRules);
            }
            if (mergedSettings.localSortDisplayMode && SORT_DISPLAY_MODES.has(mergedSettings.localSortDisplayMode)) {
              setPcSortDisplayMode(mergedSettings.localSortDisplayMode);
              setMobileSortDisplayMode(mergedSettings.localSortDisplayMode);
            } else {
              if (mergedSettings.pcLocalSortDisplayMode && SORT_DISPLAY_MODES.has(mergedSettings.pcLocalSortDisplayMode)) {
                setPcSortDisplayMode(mergedSettings.pcLocalSortDisplayMode);
              }
              if (mergedSettings.mobileLocalSortDisplayMode && SORT_DISPLAY_MODES.has(mergedSettings.mobileLocalSortDisplayMode)) {
                setMobileSortDisplayMode(mergedSettings.mobileLocalSortDisplayMode);
              }
            }
            if (typeof mergedSettings.pcContainerWidth === 'number' && Number.isFinite(mergedSettings.pcContainerWidth)) {
              setContainerWidth(Math.min(2000, Math.max(600, mergedSettings.pcContainerWidth)));
            }
            if (typeof mergedSettings.showMarketIndexPc === 'boolean') setShowMarketIndexPc(mergedSettings.showMarketIndexPc);
            if (typeof mergedSettings.showMarketIndexMobile === 'boolean') setShowMarketIndexMobile(mergedSettings.showMarketIndexMobile);
            if (typeof mergedSettings.showGroupFundSearchPc === 'boolean') setShowGroupFundSearchPc(mergedSettings.showGroupFundSearchPc);
            if (typeof mergedSettings.showGroupFundSearchMobile === 'boolean') setShowGroupFundSearchMobile(mergedSettings.showGroupFundSearchMobile);
          } catch { }
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
                if (!Array.isArray(list)) return;
                const existingList = Array.isArray(mergedBucket[code]) ? mergedBucket[code] : [];
                const existingByDate = new Map(existingList.map(item => [item.date, item]));
                list.forEach(item => {
                  if (!item || !item.date || !Number.isFinite(item.earnings)) return;
                  existingByDate.set(item.date, item);
                });
                mergedBucket[code] = Array.from(existingByDate.values())
                  .sort((a, b) => a.date.localeCompare(b.date));
              });
              mergedDaily[scope] = mergedBucket;
            });
            setFundDailyEarnings(mergedDaily);
          } catch { }
        }

        // 导入成功后，仅刷新新追加的基金
        if (appendedCodes.length) {
          // 这里需要确保 refreshAll 不会因为闭包问题覆盖掉刚刚合并好的 mergedFunds
          // 我们直接传入所有代码执行一次全量刷新是最稳妥的，或者修改 refreshAll 支持增量更新
          const allCodes = mergedFunds.map(f => f.code);
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

  const isAnyModalOpen = useMemo(
    () =>
      portfolioEarningsOpen ||
      feedbackOpen ||
      addFundToGroupOpen ||
      groupManageOpen ||
      groupModalOpen ||
      successModal.open ||
      cloudConfigModal.open ||
      isLogoutConfirmOpen ||
      holdingModal.open ||
      selectHoldingGroupModal.open ||
      actionModal.open ||
      tradeModal.open ||
      dcaModal.open ||
      addHistoryModal.open ||
      historyModal.open ||
      loginModalOpen ||
      !!clearConfirm ||
      donateOpen ||
      !!fundDeleteConfirm ||
      !!fundDeleteBulkConfirm ||
      isUpdateModalOpen ||
      weChatOpen ||
      scanModalOpen ||
      scanConfirmModalOpen ||
      isScanning ||
      isScanImporting ||
      settingsOpen ||
      sortSettingOpen ||
      mobileFundDrawerOpen ||
      mobileTableSettingModalOpen ||
      fundTagsEdit.open,
    [
      portfolioEarningsOpen,
      feedbackOpen,
      addFundToGroupOpen,
      groupManageOpen,
      groupModalOpen,
      successModal.open,
      cloudConfigModal.open,
      isLogoutConfirmOpen,
      holdingModal.open,
      selectHoldingGroupModal.open,
      actionModal.open,
      tradeModal.open,
      dcaModal.open,
      addHistoryModal.open,
      historyModal.open,
      loginModalOpen,
      clearConfirm,
      donateOpen,
      fundDeleteConfirm,
      isUpdateModalOpen,
      weChatOpen,
      scanModalOpen,
      scanConfirmModalOpen,
      isScanning,
      isScanImporting,
      settingsOpen,
      sortSettingOpen,
      mobileFundDrawerOpen,
      mobileTableSettingModalOpen,
      fundTagsEdit.open,
    ]
  );

  useEffect(() => {
    if (!isMobile || mobileMainTab !== 'home' || isAnyModalOpen) return;

    let ticking = false;
    const handleScroll = () => {
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
  }, [isMobile, mobileMainTab, isAnyModalOpen]);

  useEffect(() => {
    if (!isMobile || mobileMainTab !== 'home') {
      setMobileBottomNavHidden(false);
    }
  }, [isMobile, mobileMainTab]);

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape' && settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const containerClassName = [
    'container',
    isMobile && mobileMainTab === 'mine' ? 'mine-mobile-root' : 'content',
    isMobile && mobileMainTab === 'home' ? 'content-with-mobile-tabbar' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /** 移动端底部 Tab 切换时保留首页 DOM，用显隐代替卸载 */
  const mobileHomeTabVisible = !isMobile || mobileMainTab === 'home';

  /** PC / 移动端行、FundCard 共用：统一 name / fundName 后走单删逻辑 */
  const handleRemoveFundEntry = useCallback((rowOrFund) => {
    if (!rowOrFund?.code) return;
    const name = rowOrFund.name ?? rowOrFund.fundName ?? rowOrFund.code;
    requestRemoveFund({ code: rowOrFund.code, name });
  }, [requestRemoveFund]);

  const handleToggleFavoriteRow = useCallback((row) => {
    if (!row || !row.code) return;
    toggleFavorite(row.code);
  }, [toggleFavorite]);

  const handleHoldingAmountClickRow = useCallback((row, meta) => {
    if (!row || !row.code) return;
    if ((currentTab === 'all' || currentTab === 'fav') && row.isHoldingLinked) {
      const fund = row.rawFund || { code: row.code, name: row.fundName };
      setSelectHoldingGroupModal({ open: true, fund });
      return;
    }

    // 自定义分组：未设置持仓时，如果“全部”存在全局持仓，则提示迁移
    if (activeGroupId && meta?.hasHolding === false) {
      const gh = groupHoldings?.[activeGroupId]?.[row.code];
      const hasGroupShare = gh && isNumber(gh.share) && gh.share > 0;
      const global = holdings?.[row.code];
      const hasGlobalShare = global && isNumber(global.share) && global.share > 0;
      if (!hasGroupShare && hasGlobalShare) {
        const name = row.rawFund?.name ?? row.fundName ?? row.code;
        setHoldingMigrateDialog({
          open: true,
          code: row.code,
          name,
          targetGroupId: activeGroupId,
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
  }, [activeGroupId, currentTab, groupHoldings, holdings]);

  const handleHoldingProfitClickRow = useCallback((row) => {
    if (!row || !row.code) return;
    if (row.holdingProfitValue == null) return;
    setPercentModes((prev) => ({ ...prev, [row.code]: !prev[row.code] }));
  }, []);

  const openHoldingModal = useCallback((fund) => {
    const code = fund?.code;
    if ((currentTab === 'all' || currentTab === 'fav') && code && linkedHoldingsForAllFav.linked?.has?.(code)) {
      setSelectHoldingGroupModal({ open: true, fund });
      return;
    }

    // 自定义分组：卡片视图/抽屉中“未设置持仓”点击时也走同样迁移提示
    if (activeGroupId && code) {
      const gh = groupHoldings?.[activeGroupId]?.[code];
      const hasGroupShare = gh && isNumber(gh.share) && gh.share > 0;
      const global = holdings?.[code];
      const hasGlobalShare = global && isNumber(global.share) && global.share > 0;
      if (!hasGroupShare && hasGlobalShare) {
        const name = fund?.name ?? code;
        setHoldingMigrateDialog({
          open: true,
          code,
          name,
          targetGroupId: activeGroupId,
        });
        return;
      }
    }

    setHoldingModal({ open: true, fund });
  }, [activeGroupId, currentTab, groupHoldings, holdings, linkedHoldingsForAllFav]);
  const openActionModal = useCallback((fund) => {
    const code = fund?.code;
    if ((currentTab === 'all' || currentTab === 'fav') && code && linkedHoldingsForAllFav.linked?.has?.(code)) {
      setSelectHoldingGroupModal({ open: true, fund });
      return;
    }
    setActionModal({ open: true, fund });
  }, [currentTab, linkedHoldingsForAllFav]);
  const togglePercentMode = useCallback((code) => {
    setPercentModes((prev) => ({ ...prev, [code]: !prev[code] }));
  }, []);
  const toggleTodayPercentMode = useCallback((code) => {
    setTodayPercentModes((prev) => ({ ...prev, [code]: !prev[code] }));
  }, []);

  const getFundCardPropsForRow = useCallback((row) => {
    const fund = row?.rawFund || (row ? { code: row.code, name: row.fundName } : null);
    if (!fund) return {};
    return {
      fund,
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
      collapsedEarnings,
      transactions: transactionsForTab,
      theme,
      isTradingDay,
      getHoldingProfit: getHoldingProfitForTab,
      onToggleFavorite: toggleFavorite,
      onRemoveFund: handleRemoveFundEntry,
      onHoldingClick: openHoldingModal,
      onActionClick: openActionModal,
      onPercentModeToggle: togglePercentMode,
      onTodayPercentModeToggle: toggleTodayPercentMode,
      onToggleCollapse: toggleCollapse,
      onToggleTrendCollapse: toggleTrendCollapse,
      onToggleEarningsCollapse: toggleEarningsCollapse,
      masked: maskAmounts,
      layoutMode: 'drawer',
      isHoldingLinked: !!row?.isHoldingLinked,
      fundTags: row?.fundTags || [],
      onFundTagsClick: openFundTagsEdit,
    };
  }, [
    todayStr,
    currentTab,
    favorites,
    dcaPlansForTab,
    holdingsForTabWithLinked,
    percentModes,
    todayPercentModes,
    currentFundDailyEarnings,
    valuationSeries,
    collapsedCodes,
    collapsedTrends,
    collapsedEarnings,
    transactionsForTab,
    theme,
    isTradingDay,
    getHoldingProfitForTab,
    toggleFavorite,
    handleRemoveFundEntry,
    openHoldingModal,
    openActionModal,
    togglePercentMode,
    toggleTodayPercentMode,
    toggleCollapse,
    toggleTrendCollapse,
    toggleEarningsCollapse,
    maskAmounts,
  ]);

  return (
    <div ref={containerRef} className={containerClassName} style={{ width: containerWidth }}>
      <AnimatePresence>
        {showThemeTransition && (
          <motion.div
            className="theme-transition-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="theme-transition-circle"
              initial={{ scale: 0, opacity: 0.5 }}
              animate={{ scale: 2.5, opacity: 0 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => setShowThemeTransition(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className="mobile-main-tab-panel mobile-main-tab-panel--home"
        style={{ display: mobileHomeTabVisible ? 'contents' : 'none' }}
        aria-hidden={!mobileHomeTabVisible || undefined}
      >
      <>
      <Announcement />
      <div className="navbar glass" ref={navbarRef}>
        {refreshing && <div className="loading-bar"></div>}
        <div className={`brand ${(isSearchFocused || selectedFunds.length > 0) ? 'search-focused-sibling' : ''}`}>
          <div
            style={{
              width: 24,
              height: 24,
              marginRight: 4,
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
            title={isSyncing ? '正在同步到云端...' : undefined}
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
                transition: 'opacity 0.25s ease, transform 0.25s ease',
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
                transition: 'opacity 0.25s ease, transform 0.25s ease',
              }}
            >
              <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="2" />
              <path d="M5 14c2-4 7-6 14-5" stroke="var(--primary)" strokeWidth="2" />
            </svg>
          </div>
          <span>大大隻LALA基金宝</span>
        </div>
        <div className={`glass add-fund-section navbar-add-fund ${(isSearchFocused || selectedFunds.length > 0) ? 'search-focused' : ''}`} role="region" aria-label="添加基金">
          <div className="search-container" ref={dropdownRef}>
            {selectedFunds.length > 0 && (
              <div className="selected-inline-chips" style={{ marginBottom: 8, marginLeft: 0 }}>
                {selectedFunds.map(fund => (
                  <div key={fund.CODE} className="fund-chip">
                    <span>{fund.NAME}</span>
                    <button onClick={() => toggleSelectFund(fund)} className="remove-chip">
                      <CloseIcon width="14" height="14" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form className="form" onSubmit={addFund}>
              <div className="search-input-wrapper" style={{ flex: 1, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="navbar-search-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                    <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="input navbar-input-shell" style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    ref={inputRef}
                    className="navbar-input-field"
                    placeholder="搜索基金名称或代码..."
                    value={searchTerm}
                    onChange={handleSearchInput}
                    onFocus={() => {
                      setShowDropdown(true);
                      setIsSearchFocused(true);
                    }}
                    onBlur={() => {
                      // 延迟关闭，以允许点击搜索结果
                      setTimeout(() => setIsSearchFocused(false), 200);
                    }}
                    style={{ flex: 1 }}
                  />
                  <div style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
                    <ScanButton onClick={handleScanClick} disabled={isScanning} />
                  </div>
                </div>
                {isSearching && <div className="search-spinner" />}
              </div>
              <button
                className="button"
                type="submit"
                disabled={loading}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  display: (isSearchFocused || selectedFunds.length > 0) ? 'inline-flex' : undefined,
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                  minWidth: 'fit-content'
                }}
              >
                {loading ? '添加中…' : '添加'}
              </button>
            </form>

            <AnimatePresence>
              {showDropdown && (searchTerm.trim() || searchResults.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="search-dropdown glass scrollbar-y-styled"
                >
                  {searchResults.length > 0 ? (
                    <div className="search-results">
                      {searchResults.map((fund) => {
                        const isSelected = selectedFunds.some(f => f.CODE === fund.CODE);
                        return (
                          <div
                            key={fund.CODE}
                            className={`search-item ${isSelected ? 'selected' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              toggleSelectFund(fund);
                            }}
                          >
                            <div className="fund-info">
                              <span className="fund-name">{fund.NAME}</span>
                              <span className="fund-code muted">#{fund.CODE} | {fund.TYPE}</span>
                            </div>
                            <div className="checkbox">
                              {isSelected && <div className="checked-mark" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : searchTerm.trim() && !isSearching ? (
                    <div className="no-results muted">未找到相关基金</div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {error && <div className="muted" style={{ marginTop: 8, color: 'var(--danger)' }}>{error}</div>}
        </div>
        <div className={`actions ${(isSearchFocused || selectedFunds.length > 0) ? 'search-focused-sibling' : ''}`}>
          <UpdateChecker onModalOpenChange={setIsUpdateModalOpen} />
          <span className="github-icon-wrap">
            <Image unoptimized alt="项目Github地址" src={githubImg} style={{ width: '30px', height: '30px', cursor: 'pointer' }} onClick={() => window.open("https://github.com/hzm0321/real-time-fund")} />
          </span>
          {isMobile && (
            <button
              className="icon-button mobile-search-btn"
              aria-label="筛选基金"
              onClick={handleMobileSearchClick}
              title="筛选"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <RefreshButton
            refreshMs={refreshMs}
            manualRefresh={manualRefresh}
            refreshing={refreshing}
            fundsLength={funds.length}
            refreshCycleStartRef={refreshCycleStartRef}
          />
          <button
            className="icon-button"
            aria-label={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
            onClick={handleThemeToggle}
            title={theme === 'dark' ? '亮色' : '暗色'}
          >
            {theme === 'dark' ? <SunIcon width="18" height="18" /> : <MoonIcon width="18" height="18" />}
          </button>
          <UserMenu
            user={user}
            userAvatar={userAvatar}
            isMobile={isMobile}
            navbarHeight={navbarHeight}
            lastSyncTime={lastSyncTime}
            isSyncing={isSyncing}
            onSync={() => user?.id && syncUserConfig(user.id)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPortfolioEarnings={() => setPortfolioEarningsOpen(true)}
            onOpenLogin={handleOpenLogin}
            onLogout={handleLogout}
            onLogoutConfirmOpenChange={setIsLogoutConfirmOpen}
          />
        </div>
      </div>
      {shouldShowMarketIndex && (
        <MarketIndexAccordion
          navbarHeight={navbarHeight}
          onHeightChange={setMarketIndexAccordionHeight}
          isMobile={isMobile}
          onCustomSettingsChange={triggerCustomSettingsSync}
          refreshing={refreshing}
        />
      )}
      <div className="grid">
        <div className="col-12">
          <div ref={filterBarRef} className="filter-bar" style={{ top: navbarHeight + marketIndexAccordionHeight, marginTop: 0, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div className="tabs-container">
              <div
                className="tabs-scroll-area"
                data-mask-left={canLeft}
                data-mask-right={canRight}
              >
                <div
                  className="tabs"
                  ref={tabsRef}
                  onMouseDown={handleMouseDown}
                  onMouseLeave={handleMouseLeaveOrUp}
                  onMouseUp={handleMouseLeaveOrUp}
                  onMouseMove={handleMouseMove}
                  onWheel={handleWheel}
                  onScroll={updateTabOverflow}
                >
                  <AnimatePresence mode="popLayout">
                    {showPortfolioSummaryTab && (
                      <motion.button
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        key="portfolio-summary"
                        className={`tab ${currentTab === SUMMARY_TAB_ID ? 'active' : ''}`}
                        onClick={() => setCurrentTab(SUMMARY_TAB_ID)}
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
                      onClick={() => setCurrentTab('all')}
                      transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                    >
                      全部 ({funds.length})
                    </motion.button>
                    <motion.button
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      key="fav"
                      className={`tab ${currentTab === 'fav' ? 'active' : ''}`}
                      onClick={() => setCurrentTab('fav')}
                      transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                    >
                      自选 ({favorites.size})
                    </motion.button>
                    {groups.map(g => (
                      <motion.button
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        key={g.id}
                        className={`tab ${currentTab === g.id ? 'active' : ''}`}
                        onClick={() => setCurrentTab(g.id)}
                        transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 1 }}
                      >
                        {g.name} ({g.codes.length})
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
              {groups.length > 0 && (
                <button
                  className="icon-button manage-groups-btn"
                  onClick={() => setGroupManageOpen(true)}
                  title="管理分组"
                >
                  <SortIcon width="16" height="16" />
                </button>
              )}
              <button
                className="icon-button add-group-btn"
                onClick={() => setGroupModalOpen(true)}
                title="新增分组"
              >
                <PlusIcon width="16" height="16" />
              </button>
            </div>

            <div
              className="sort-group"
              style={{
                display: currentTab === SUMMARY_TAB_ID ? 'none' : 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div className="view-toggle" style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '2px' }}>
                <button
                  className={`icon-button ${viewMode === 'card' ? 'active' : ''}`}
                  onClick={() => { applyViewMode('card'); }}
                  style={{ border: 'none', width: '32px', height: '32px', background: viewMode === 'card' ? 'var(--primary)' : 'transparent', color: viewMode === 'card' ? '#05263b' : 'var(--muted)' }}
                  title="卡片视图"
                >
                  <GridIcon width="16" height="16" />
                </button>
                <button
                  className={`icon-button ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => { applyViewMode('list'); }}
                  style={{ border: 'none', width: '32px', height: '32px', background: viewMode === 'list' ? 'var(--primary)' : 'transparent', color: viewMode === 'list' ? '#05263b' : 'var(--muted)' }}
                  title="表格视图"
                >
                  <ListIcon width="16" height="16" />
                </button>
              </div>

              <div className="divider" style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

              <div className="sort-items" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    width: '50px',
                  }}
                  title="排序个性化设置"
                >
                  <span className="muted">排序</span>
                  <SettingsIcon width="14" height="14" />
                </button>
                { (isMobile ? mobileSortDisplayMode : pcSortDisplayMode) === 'dropdown' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Select
                      value={sortBy}
                      onValueChange={(nextSortBy) => {
                        setSortBy(nextSortBy);
                        if (nextSortBy !== sortBy) setSortOrder('desc');
                      }}
                    >
                      <SelectTrigger
                        className="h-4 min-w-[110px] py-0 text-xs shadow-none"
                        style={{ background: 'var(--card-bg)', height: 36 }}
                      >
                        <SelectValue placeholder="选择排序规则" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortRules.filter((s) => s.enabled).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.alias || s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={sortOrder}
                      onValueChange={(value) => setSortOrder(value)}
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
                    {sortRules.filter((s) => s.enabled).map((s) => (
                      <button
                        key={s.id}
                        className={`chip ${sortBy === s.id ? 'active' : ''}`}
                        onClick={() => {
                          if (sortBy === s.id) {
                            // 同一按钮重复点击，切换升序/降序
                            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            // 切换到新的排序字段，默认用降序
                            setSortBy(s.id);
                            setSortOrder('desc');
                          }
                        }}
                        style={{ height: '28px', fontSize: '12px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <span>{s.alias || s.label}</span>
                        {s.id !== 'default' && sortBy === s.id && (
                          <span
                            style={{
                              display: 'inline-flex',
                              flexDirection: 'column',
                              lineHeight: 1,
                              fontSize: '8px',
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

          {scopedFunds.length === 0 &&
          !(currentTab === SUMMARY_TAB_ID && showPortfolioSummaryTab) ? (
            <EmptyStateCard
              fundsLength={funds.length}
              currentTab={currentTab}
              onAddToGroup={() => setAddFundToGroupOpen(true)}
            />
          ) : (
            <>
              <GroupSummary
                  funds={displayFunds}
                  holdings={holdingsForTabWithLinked}
                  portfolioTabId={currentTab}
                  groups={groups}
                  getProfit={getHoldingProfitForTab}
                  summaryTotalsOverride={
                    currentTab === SUMMARY_TAB_ID ? summaryTabPortfolioTotals : null
                  }
                  stickyTop={navbarHeight + marketIndexAccordionHeight + filterBarHeight + (isMobile ? -14 : 0)}
                  isSticky={isGroupSummarySticky}
                  onToggleSticky={(next) => setIsGroupSummarySticky(next)}
                  masked={maskAmounts}
                  onToggleMasked={() => setMaskAmounts((v) => !v)}
                  marketIndexAccordionHeight={marketIndexAccordionHeight}
                  navbarHeight={navbarHeight}
                />
              {currentTab === SUMMARY_TAB_ID && summaryCardItems.length > 0 && (
                <div
                  className="grid"
                  style={{
                    marginTop: isGroupSummarySticky ? 50 : 10,
                    gridColumn: 'span 12',
                    gap: isMobile ? 10 : 16,
                  }}
                >
                  {summaryCardItems.map((row) => (
                    <div
                      key={row.groupId}
                      style={{
                        minWidth: 0,
                        gridColumn: isMobile ? 'span 12' : 'span 6',
                      }}
                    >
                      <GroupAccountSummaryCard
                        isMobile={isMobile}
                        onActivate={() =>
                          setCurrentTab(
                            row.groupId === SUMMARY_SOURCE_GLOBAL ? 'all' : row.groupId
                          )
                        }
                        groupName={row.groupName}
                        totalAsset={row.totalAsset}
                        holdingReturn={row.holdingReturn}
                        holdingReturnPercent={row.holdingReturnPercent}
                        accountReturn={row.accountReturn}
                        accountReturnPercent={row.accountReturnPercent}
                        hasAnyTodayData={row.hasAnyTodayData}
                        upCount={row.upCount}
                        downCount={row.downCount}
                        sparkSeries={row.sparkSeries}
                        masked={maskAmounts}
                      />
                    </div>
                  ))}
                </div>
              )}
              {currentTab !== SUMMARY_TAB_ID && (
                <>
              {shouldShowGroupFundSearch && (
                <SearchFund
                  value={groupFundSearchTerm}
                  onSearch={(next) => setGroupFundSearchTerm(next)}
                />
              )}

              {displayFunds.length === 0 ? (
                <div className="glass" style={{ marginTop: 10 }}>
                  <Empty className="border-border/60">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <span className="text-3xl" aria-hidden="true">📂</span>
                      </EmptyMedia>
                      <EmptyTitle>未找到相关基金</EmptyTitle>
                      <EmptyDescription>
                        试试搜索基金名称的部分关键词，或直接输入 6 位基金代码。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={viewMode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className={viewMode === 'card' ? 'grid' : 'table-container glass'}
                    style={{ marginTop: isGroupSummarySticky ? 50 : 0 }}
                  >
                  <div className={viewMode === 'card' ? 'grid col-12' : ''} style={viewMode === 'card' ? { gridColumn: 'span 12', gap: 16 } : {}}>
                    {/* PC 列表：使用 PcFundTable + 右侧冻结操作列 */}
                    {viewMode === 'list' && !isMobile && (
                        <div className="table-pc-wrap">
                          <div className="table-scroll-area">
                            <div className="table-scroll-area-inner">
                              <PcFundTable
                                stickyTop={navbarHeight + marketIndexAccordionHeight + filterBarHeight}
                                data={pcFundTableData}
                                relatedSectorSessionKey={user?.id ?? ''}
                                currentTab={currentTab}
                                groups={groups}
                                favorites={favorites}
                                sortBy={sortBy}
                                sortOrder={sortOrder}
                                sortRules={sortRules}
                                onSortChange={(id) => {
                                  if (sortBy === id) {
                                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                                  } else {
                                    setSortBy(id);
                                    setSortOrder('desc');
                                  }
                                }}
                                onReorder={handleReorder}
                                onRemoveFund={handleRemoveFundEntry}
                                onRemoveFunds={removeFundsFromCurrentTabHandler}
                                onMoveFunds={handleMoveFunds}
                                batchSelectionClearRef={pcBatchClearSelectionRef}
                                onToggleFavorite={handleToggleFavoriteRow}
                                onHoldingAmountClick={handleHoldingAmountClickRow}
                                onHoldingProfitClick={handleHoldingProfitClickRow}
                                onCustomSettingsChange={triggerCustomSettingsSync}
                                closeDialogRef={fundDetailDialogCloseRef}
                                blockDialogClose={!!fundDeleteConfirm || !!fundDeleteBulkConfirm}
                                masked={maskAmounts}
                                getFundCardProps={getFundCardPropsForRow}
                                onFundTagsClick={openFundTagsEdit}
                              />
                            </div>
                          </div>
                        </div>
                    )}
                    {viewMode === 'list' && isMobile && (
                      <MobileFundTable
                        data={pcFundTableData}
                        relatedSectorSessionKey={user?.id ?? ''}
                        currentTab={currentTab}
                        groups={groups}
                        onMoveFunds={handleMoveFunds}
                        favorites={favorites}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        sortRules={sortRules}
                        onSortChange={(id) => {
                          if (sortBy === id) {
                            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortBy(id);
                            setSortOrder('desc');
                          }
                        }}
                        stickyTop={navbarHeight + filterBarHeight + marketIndexAccordionHeight}
                        blockDrawerClose={!!fundDeleteConfirm || !!fundDeleteBulkConfirm}
                        closeDrawerRef={fundDetailDrawerCloseRef}
                        onReorder={handleReorder}
                        onRemoveFund={handleRemoveFundEntry}
                        onRemoveFunds={removeFundsFromCurrentTabHandler}
                        onToggleFavorite={handleToggleFavoriteRow}
                        onHoldingAmountClick={handleHoldingAmountClickRow}
                        onHoldingProfitClick={handleHoldingProfitClickRow}
                        batchSelectionClearRef={mobileBatchClearSelectionRef}
                        onCustomSettingsChange={triggerCustomSettingsSync}
                        onFundCardDrawerOpenChange={handleFundCardDrawerOpenChange}
                        onMobileSettingModalOpenChange={handleMobileSettingModalOpenChange}
                        getFundCardProps={getFundCardPropsForRow}
                        masked={maskAmounts}
                        onFundTagsClick={openFundTagsEdit}
                      />
                    )}
                    <AnimatePresence mode="popLayout">
                      {viewMode === 'card' && displayFunds.map((f) => (
                        <motion.div
                          layout="position"
                          key={f.code}
                          className="col-6"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          style={{ position: 'relative', overflow: 'hidden' }}
                        >
                            <FundCard
                              fund={f}
                              isHoldingLinked={
                                (currentTab === 'all' || currentTab === 'fav') &&
                                linkedHoldingsForAllFav.linked?.has?.(f?.code)
                              }
                              todayStr={todayStr}
                              currentTab={currentTab}
                              favorites={favorites}
                              dcaPlans={dcaPlansForTab}
                              holdings={holdingsForTabWithLinked}
                              percentModes={percentModes}
                              todayPercentModes={todayPercentModes}
                              fundDailyEarnings={currentFundDailyEarnings}
                              valuationSeries={valuationSeries}
                              collapsedCodes={collapsedCodes}
                              collapsedTrends={collapsedTrends}
                              collapsedEarnings={collapsedEarnings}
                              transactions={transactionsForTab}
                              theme={theme}
                              isTradingDay={isTradingDay}
                              getHoldingProfit={getHoldingProfitForTab}
                              onToggleFavorite={toggleFavorite}
                              onRemoveFund={handleRemoveFundEntry}
                              onHoldingClick={openHoldingModal}
                              onActionClick={openActionModal}
                              onPercentModeToggle={togglePercentMode}
                              onTodayPercentModeToggle={toggleTodayPercentMode}
                              onToggleCollapse={toggleCollapse}
                              onToggleTrendCollapse={toggleTrendCollapse}
                              onToggleEarningsCollapse={toggleEarningsCollapse}
                              masked={maskAmounts}
                              fundTags={Array.isArray(fundTagListsByCode[f.code]) ? fundTagListsByCode[f.code] : []}
                              onFundTagsClick={openFundTagsEdit}
                            />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </AnimatePresence>
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

      <AnimatePresence>
        {fundDeleteConfirm && (
          <ConfirmModal
            title="删除确认"
            message={
              fundDeleteConfirm.scope === 'group'
                ? `确定从当前分组中移除「${fundDeleteConfirm.name}」吗？将清除该分组内的持仓、待定交易、定投计划与分组内交易记录；不会在「全部」中删除该基金。`
                : null
            }
            messageContent={
              fundDeleteConfirm.scope === 'group'
                ? null
                : (fundDeleteConfirm.otherGroups && fundDeleteConfirm.otherGroups.length > 0
                  ? <>
                      基金 &#34;{fundDeleteConfirm.name}&#34; 还存在于以下分组：
                      <span className="text-[var(--primary)] font-semibold">
                        {fundDeleteConfirm.otherGroups.join('、')}
                      </span>
                      。删除后将同时从这些分组中移除。确定要彻底删除吗？
                    </>
                  : `基金 "${fundDeleteConfirm.name}" 存在持仓记录。删除后将从列表中移除该基金及其全部持仓与相关数据（含各分组内副本），是否继续？`)
            }
            confirmText="确定删除"
            onConfirm={() => {
              fundDetailDrawerCloseRef.current?.();
              fundDetailDialogCloseRef.current?.();
              if (fundDeleteConfirm.scope === 'group' && fundDeleteConfirm.groupId) {
                stripFundFromGroupScope(fundDeleteConfirm.code, fundDeleteConfirm.groupId);
              } else {
                removeFund(fundDeleteConfirm.code);
              }
              setFundDeleteConfirm(null);
            }}
            onCancel={() => setFundDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fundDeleteBulkConfirm && (
          <ConfirmModal
            title="批量删除确认"
            message={
              fundDeleteBulkConfirm.scope === 'global'
                ? (fundDeleteBulkConfirm.fundsWithOtherGroups && fundDeleteBulkConfirm.fundsWithOtherGroups.length > 0
                  ? null
                  : `确定删除已选的 ${fundDeleteBulkConfirm.count} 支基金吗？将从列表中移除这些基金及其全部持仓与相关数据。`)
                : `确定从当前分组中移除已选的 ${fundDeleteBulkConfirm.count} 支基金吗？将清除这些基金在该分组内的持仓、待定交易、定投计划与分组内交易记录；不会在「全部」中删除这些基金。`
            }
            messageContent={
              fundDeleteBulkConfirm.scope === 'global' && fundDeleteBulkConfirm.fundsWithOtherGroups && fundDeleteBulkConfirm.fundsWithOtherGroups.length > 0
                ? (
                    <div className="flex flex-col gap-3 text-left">
                      {fundDeleteBulkConfirm.fundsWithOtherGroups.map((f) => (
                        <p key={f.code} className="m-0 leading-relaxed">
                          基金 &#34;{f.name}&#34; 还存在于以下分组：
                          <span className="text-[var(--primary)] font-semibold">{f.otherGroups.join('、')}</span>
                          。删除后将同时从这些分组中移除。
                        </p>
                      ))}
                      <p className="m-0 leading-relaxed">
                        确定要彻底删除已选的全部 {fundDeleteBulkConfirm.count} 支基金吗？
                      </p>
                    </div>
                  )
                : null
            }
            confirmText="确定删除"
            onConfirm={() => {
              fundDetailDrawerCloseRef.current?.();
              fundDetailDialogCloseRef.current?.();
              if (fundDeleteBulkConfirm.scope === 'global') {
                removeFundsBulk(fundDeleteBulkConfirm.codes);
                showToast(`已删除 ${fundDeleteBulkConfirm.count} 支基金`, 'success');
              } else {
                stripManyFundsFromGroupScope(fundDeleteBulkConfirm.codes, fundDeleteBulkConfirm.groupId);
                showToast(`已从当前分组移除 ${fundDeleteBulkConfirm.count} 支基金`, 'success');
              }
              pcBatchClearSelectionRef.current?.();
              mobileBatchClearSelectionRef.current?.();
              setFundDeleteBulkConfirm(null);
            }}
            onCancel={() => setFundDeleteBulkConfirm(null)}
          />
        )}
      </AnimatePresence>

        <div className="footer">
          {!isMobile && (
            <>
              <p style={{ marginBottom: 8 }}>数据源：实时估值与重仓直连东方财富，仅供个人学习及参考使用。数据可能存在延迟，不作为任何投资建议</p>
              <p style={{ marginBottom: 12 }}>注：估算数据与真实结算数据会有1%左右误差，非股票型基金误差较大</p>
              <div style={{ marginTop: 12, opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '0 4px', textDecoration: 'underline', fontSize: 'inherit', fontWeight: 600 }}
                  >
                    点此提交反馈
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
      </>
      </div>
      {isMobile && (
        <MineTab
          visible={mobileMainTab === 'mine'}
          user={user}
          userAvatar={userAvatar}
          lastSyncDisplay={lastSyncTime ? dayjs(lastSyncTime).format('MM-DD HH:mm') : null}
          onLogin={handleOpenLogin}
          onMyEarnings={() => setPortfolioEarningsOpen(true)}
          onTutorial={() =>
            sonnerToast.info('敬请期待~')
          }
          onFeedback={() => {
            if (!user?.id) {
              sonnerToast.error('请先登录后再提交反馈');
              return;
            }
            setFeedbackNonce((n) => n + 1);
            setFeedbackOpen(true);
          }}
          onSponsorSupport={() => setDonateOpen(true)}
        />
      )}
      {isMobile && (
        <MobileBottomNav value={mobileMainTab} onChange={setMobileMainTab} hidden={mobileBottomNavHidden && mobileMainTab === 'home'} />
      )}

      <AnimatePresence>
        {feedbackOpen && (
          <FeedbackModal
            key={feedbackNonce}
            onClose={() => setFeedbackOpen(false)}
            user={user}
            onOpenWeChat={() => setWeChatOpen(true)}
          />
        )}
      </AnimatePresence>
      <MyEarningsCalendarPage
        open={portfolioEarningsOpen}
        onOpenChange={setPortfolioEarningsOpen}
        series={portfolioDailySeries}
        masked={maskAmounts}
        isMobile={isMobile}
        onGoHome={() => {
          setPortfolioEarningsOpen(false);
          setMobileMainTab('home');
        }}
      />
      <AnimatePresence>
        {weChatOpen && (
            <WeChatModal onClose={() => setWeChatOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addFundToGroupOpen && (
          <AddFundToGroupModal
            allFunds={funds}
            currentGroupCodes={groups.find(g => g.id === currentTab)?.codes || []}
            holdings={holdingsForTabWithLinked}
            fundTagListsByCode={fundTagListsByCode}
            fundTagRecords={fundTagRecords}
            onClose={() => setAddFundToGroupOpen(false)}
            onAdd={handleAddFundsToGroup}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectHoldingGroupModal.open && (
          <SelectHoldingGroupModal
            fund={selectHoldingGroupModal.fund}
            groups={groups}
            groupHoldings={groupHoldings}
            onClose={() => setSelectHoldingGroupModal({ open: false, fund: null })}
            onNext={(groupId) => {
              const fund = selectHoldingGroupModal.fund;
              setSelectHoldingGroupModal({ open: false, fund: null });
              setActionModal({ open: true, fund, groupId });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionModal.open && (
          <HoldingActionModal
            fund={actionModal.fund}
            onClose={() => setActionModal({ open: false, fund: null })}
            onAction={(type) => handleAction(type, actionModal.fund, actionModal.groupId)}
            groupName={actionModal.groupId ? groupById.get(actionModal.groupId)?.name : ''}
            hasHistory={!!(transactions[actionModal.fund?.code] || []).some((t) =>
              !getScopedGroupId(actionModal.groupId) ? !t.groupId : t.groupId === getScopedGroupId(actionModal.groupId)
            )}
            pendingCount={pendingTrades.filter((t) =>
              t.fundCode === actionModal.fund?.code &&
              (!getScopedGroupId(actionModal.groupId) ? !t.groupId : t.groupId === getScopedGroupId(actionModal.groupId))
            ).length}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tradeModal.open && (
          <TradeModal
            type={tradeModal.type}
            fund={tradeModal.fund}
            holding={getScopedHolding(tradeModal.fund?.code, tradeModal.groupId)}
            onClose={() => setTradeModal({ open: false, fund: null, type: 'buy' })}
            onConfirm={(data) => handleTrade(tradeModal.fund, data)}
            pendingTrades={pendingTrades.filter((t) =>
              t.fundCode === tradeModal.fund?.code &&
              (!getScopedGroupId(tradeModal.groupId) ? !t.groupId : t.groupId === getScopedGroupId(tradeModal.groupId))
            )}
            onDeletePending={(id) => {
                setPendingTrades(prev => {
                    const next = prev.filter(t => t.id !== id);
                    return next;
                });
                showToast('已撤销待处理交易', 'success');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dcaModal.open && (
          <DcaModal
            fund={dcaModal.fund}
            plan={getScopedDcaPlan(dcaModal.fund?.code, dcaModal.groupId)}
            onClose={() => setDcaModal({ open: false, fund: null })}
            onReset={(fundCode) => {
              const code = fundCode || dcaModal.fund?.code;
              if (!code) return;
              const scope = getScopedGroupId(dcaModal.groupId) || DCA_SCOPE_GLOBAL;
              setDcaPlans((prev) => {
                const scoped = migrateDcaPlansToScoped(prev);
                const bucket = isPlainObject(scoped[scope]) ? scoped[scope] : null;
                if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, code)) return prev;
                const nextBucket = { ...bucket };
                delete nextBucket[code];
                const next = { ...scoped };
                if (Object.keys(nextBucket).length === 0) delete next[scope];
                else next[scope] = nextBucket;
                return next;
                });              setDcaModal({ open: false, fund: null });
              showToast('已重置定投数据', 'success');
            }}
            onConfirm={(config) => {
              const code = config?.fundCode || dcaModal.fund?.code;
              if (!code) {
                setDcaModal({ open: false, fund: null });
                return;
              }
              const scope = getScopedGroupId(dcaModal.groupId) || DCA_SCOPE_GLOBAL;
              setDcaPlans((prev) => {
                const scoped = migrateDcaPlansToScoped(prev);
                const bucket = { ...(isPlainObject(scoped[scope]) ? scoped[scope] : {}) };
                bucket[code] = {
                  amount: config.amount,
                  feeRate: config.feeRate,
                  cycle: config.cycle,
                  firstDate: config.firstDate,
                  weeklyDay: config.weeklyDay ?? null,
                  monthlyDay: config.monthlyDay ?? null,
                  enabled: config.enabled !== false
                };
                const next = { ...scoped, [scope]: bucket };
                return next;
                });              setDcaModal({ open: false, fund: null });
              showToast('已保存定投计划', 'success');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {convertModal.open && (
          <FundConvertModal
            fund={convertModal.fund}
            allFunds={funds}
            nestedModalOpen={selectFundSingleModal.open}
            maxOutAmount={(() => {
              const f = convertModal.fund;
              const code = f?.code;
              if (!code) return 0;
              const holding = getScopedHolding(code, convertModal.groupId);
              const share = Number(holding?.share) || 0;
              const nav =
                Number(f?.dwjz) ||
                Number(f?.gsz) ||
                Number(f?.estGsz) ||
                0;
              if (!share || !nav) return 0;
              return share * nav;
            })()}
            onClose={() => setConvertModal({ open: false, fund: null })}
            onPickInFund={({ excludeCodes, initialSelectedCode }) => {
              return new Promise((resolve) => {
                // 打开单选选基弹框，并把 resolve 暂存到状态闭包中处理
                setSelectFundSingleModal({
                  open: true,
                  excludeCodes: excludeCodes || [],
                  initialSelectedCode: initialSelectedCode || '',
                  _resolve: resolve,
                });
              });
            }}
            onConfirm={(payload) => {
              const tradeGid = getScopedGroupId(convertModal.groupId);
              const nowTs = Date.now();

              const outPending = {
                id: uuidv4(),
                fundCode: payload.outFundCode,
                fundName: payload.outFundName,
                type: 'sell',
                share: null,
                amount: payload.outAmount,
                feeRate: 0,
                feeMode: 'none',
                feeValue: 0,
                date: payload.date,
                navOffsetDays: -1,
                netValueSearch: 'backward',
                isAfter3pm: false,
                isDca: false,
                timestamp: nowTs,
                ...(tradeGid ? { groupId: tradeGid } : {}),
              };

              const inPending = {
                id: uuidv4(),
                fundCode: payload.inFundCode,
                fundName: payload.inFundName,
                type: 'buy',
                share: null,
                amount: payload.inAmount,
                feeRate: 0,
                feeMode: 'none',
                feeValue: 0,
                date: payload.date,
                navOffsetDays: -1,
                netValueSearch: 'backward',
                isAfter3pm: false,
                isDca: false,
                timestamp: nowTs + 1,
                ...(tradeGid ? { groupId: tradeGid } : {}),
              };

              setPendingTrades((prev) => [...prev, outPending, inPending]);

              // 如果转入基金在当前作用域没有持仓数据，初始化为 0，避免后续展示/计算缺失
              const ensureHolding = (code) => {
                if (!code) return;
                if (!tradeGid) {
                  setHoldings((prev) => {
                    if (prev?.[code]) return prev;
                    return { ...(prev || {}), [code]: { share: 0, cost: 0 } };
                  });
                } else {
                  setGroupHoldings((prev) => {
                    const next = { ...(prev || {}) };
                    const bucket = { ...(next[tradeGid] || {}) };
                    if (bucket[code]) return prev;
                    bucket[code] = { share: 0, cost: 0 };
                    next[tradeGid] = bucket;
                    return next;
                  });
                }
              };
              ensureHolding(payload.inFundCode);

              setConvertModal({ open: false, fund: null });
              showToast('已加入待处理队列（转换）', 'info');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectFundSingleModal.open && (
          <SelectFundSingleModal
            title="选择转入基金"
            allFunds={(funds || []).filter((f) => f?.code && f.code !== convertModal.fund?.code)}
            excludeCodes={selectFundSingleModal.excludeCodes}
            initialSelectedCode={selectFundSingleModal.initialSelectedCode}
            onClose={() => {
              // 关闭且不选择：resolve null
              if (typeof selectFundSingleModal._resolve === 'function') {
                selectFundSingleModal._resolve(null);
              }
              setSelectFundSingleModal({ open: false, excludeCodes: [], initialSelectedCode: '' });
            }}
            onConfirm={(picked) => {
              if (typeof selectFundSingleModal._resolve === 'function') {
                selectFundSingleModal._resolve(picked);
              }
              setSelectFundSingleModal({ open: false, excludeCodes: [], initialSelectedCode: '' });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addHistoryModal.open && (
          <AddHistoryModal
            fund={addHistoryModal.fund}
            onClose={() => setAddHistoryModal({ open: false, fund: null })}
            onConfirm={handleAddHistory}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyModal.open && (
          <TransactionHistoryModal
            fund={historyModal.fund}
            transactions={(transactions[historyModal.fund?.code] || []).filter((t) =>
              !getScopedGroupId(historyModal.groupId) ? !t.groupId : t.groupId === getScopedGroupId(historyModal.groupId)
            )}
            pendingTransactions={pendingTrades.filter((t) =>
              t.fundCode === historyModal.fund?.code &&
              (!getScopedGroupId(historyModal.groupId) ? !t.groupId : t.groupId === getScopedGroupId(historyModal.groupId))
            )}
            onClose={() => setHistoryModal({ open: false, fund: null })}
            onDeleteTransaction={(id) => handleDeleteTransaction(historyModal.fund?.code, id, historyModal.groupId)}
            onAddHistory={() => setAddHistoryModal({ open: true, fund: historyModal.fund, groupId: getScopedGroupId(historyModal.groupId) })}
            canMergeAllGroups={!!getScopedGroupId(historyModal.groupId)}
            onMergeAllGroups={() => handleMergeAllGroupTransactionsToCurrent(historyModal.fund?.code, historyModal.groupId)}
            onDeletePending={(id) => {
                setPendingTrades(prev => {
                    const next = prev.filter(t => t.id !== id);
                    return next;
                });
                showToast('已撤销待处理交易', 'success');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {clearConfirm && (
          <ConfirmModal
            title="清空持仓"
            message={`确定要清空“${clearConfirm.fund?.name}”的所有持仓记录吗？此操作不可恢复。`}
            onConfirm={handleClearConfirm}
            onCancel={() => setClearConfirm(null)}
            confirmText="确认清空"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {holdingModal.open && (
          <HoldingEditModal
            fund={holdingModal.fund}
            holding={getScopedHolding(holdingModal.fund?.code, holdingModal.groupId)}
            onClose={() => setHoldingModal({ open: false, fund: null })}
            onSave={(data) => handleSaveHolding(holdingModal.fund?.code, data, holdingModal.groupId)}
            onOpenTrade={() => {
              const f = holdingModal.fund;
              if (!f) return;
              setHoldingModal({ open: false, fund: null });
              setTradeModal({ open: true, fund: f, type: 'buy', groupId: getScopedGroupId(holdingModal.groupId) });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fundTagsEdit.open && (
          <FundTagsEditDialog
            open={fundTagsEdit.open}
            onOpenChange={(open) => setFundTagsEdit((s) => ({ ...s, open }))}
            isMobile={isMobile}
            fundCode={fundTagsEdit.code ?? undefined}
            fundName={fundTagsEdit.name}
            tags={fundTagsEdit.tags}
            onSave={handleSaveFundTags}
            recommendedTagItems={fundTagRecords.map((r) => ({
              id: String(r?.id ?? '').trim(),
              name: String(r?.name ?? '').trim(),
              theme: String(r?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME,
            })).filter((x) => x.name)}
            onAddPoolTag={handleAddPoolTag}
            onDeleteGlobalTag={handleDeleteGlobalTag}
            getTagUsageLabels={getTagUsageLabels}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {holdingMigrateDialog.open && (
          <ConfirmModal
            title="提示"
            messageContent={
              <div>
                {holdingMigrateDialog.name || holdingMigrateDialog.code || '该基金'}
                在全部分组中存在持仓数据，请在全部分组清空该基金持仓或迁移数据到本分组。
              </div>
            }
            icon={<FolderPlusIcon width="20" height="20" className="shrink-0 text-[var(--primary)]" />}
            confirmVariant="primary"
            confirmText="迁移数据到本分组"
            onCancel={() => setHoldingMigrateDialog({ open: false, code: null, name: '', targetGroupId: null })}
            onConfirm={async () => {
              const code = holdingMigrateDialog.code;
              const gid = holdingMigrateDialog.targetGroupId;
              if (!code || !gid) {
                setHoldingMigrateDialog({ open: false, code: null, name: '', targetGroupId: null });
                return;
              }
              try {
                await handleMoveFunds({
                  codes: [code],
                  fromTab: 'all',
                  targetId: gid,
                  overwrite: true,
                });
                showToast('已迁移持仓数据到本分组', 'success');
              } catch (e) {
                console.warn('迁移持仓失败', e);
                showToast('迁移失败，请稍后再试', 'error');
              } finally {
                setHoldingMigrateDialog({ open: false, code: null, name: '', targetGroupId: null });
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {donateOpen && (
          <DonateModal onClose={() => setDonateOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {groupManageOpen && (
          <GroupManageModal
            groups={groups}
            onClose={() => setGroupManageOpen(false)}
            onSave={handleUpdateGroups}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {groupModalOpen && (
          <GroupModal
            onClose={() => setGroupModalOpen(false)}
            onConfirm={handleAddGroup}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {successModal.open && (
          <SuccessModal
            message={successModal.message}
            onClose={() => setSuccessModal({ open: false, message: '' })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cloudConfigModal.open && (
          <CloudConfigModal
            type={cloudConfigModal.type}
            onConfirm={handleSyncLocalConfig}
            onCancel={() => {
              if (cloudConfigModal.type === 'conflict' && cloudConfigModal.cloudData) {
                applyCloudConfig(cloudConfigModal.cloudData);
              } else {
                skipSyncRef.current = false;
              }
              setCloudConfigModal({ open: false, userId: null });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scanModalOpen && (
          <ScanPickModal
            onClose={() => setScanModalOpen(false)}
            onPick={handleScanPick}
            onFilesDrop={handleFilesDrop}
            isScanning={isScanning}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scanConfirmModalOpen && (
          <ScanImportConfirmModal
            scannedFunds={scannedFunds}
            selectedScannedCodes={selectedScannedCodes}
            onClose={() => setScanConfirmModalOpen(false)}
            onToggle={toggleScannedCode}
            onConfirm={confirmScanImport}
            refreshing={refreshing}
            groups={groups}
            existingAllCodes={funds.map((f) => f?.code).filter(Boolean)}
            existingFavCodes={Array.from(favorites || [])}
            isOcrScan={isOcrScan}
          />
        )}
      </AnimatePresence>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesUpload}
      />

      <AnimatePresence>
        {settingsOpen && (
          <SettingsModal
            onClose={() => setSettingsOpen(false)}
            tempSeconds={tempSeconds}
            setTempSeconds={setTempSeconds}
            saveSettings={saveSettings}
            exportLocalData={exportLocalData}
            importFileRef={importFileRef}
            handleImportFileChange={handleImportFileChange}
            importMsg={importMsg}
            isMobile={isMobile}
            containerWidth={containerWidth}
            setContainerWidth={setContainerWidth}
            onResetContainerWidth={handleResetContainerWidth}
            showMarketIndexPc={showMarketIndexPc}
            showMarketIndexMobile={showMarketIndexMobile}
            showGroupFundSearchPc={showGroupFundSearchPc}
            showGroupFundSearchMobile={showGroupFundSearchMobile}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isScanning && (
          <ScanProgressModal scanProgress={scanProgress} onCancel={cancelScan} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isScanImporting && (
          <ScanImportProgressModal scanImportProgress={scanImportProgress} />
        )}
      </AnimatePresence>

      {/* 登录模态框 */}
      <AnimatePresence>
        {loginModalOpen && (
          <LoginModal
            onClose={() => {
              setLoginModalOpen(false);
              setLoginInitialError('');
            }}
            isMobile={isMobile}
            showToast={showToast}
            isExplicitLoginRef={isExplicitLoginRef}
            initialError={loginInitialError}
          />
        )}
      </AnimatePresence>
      {/* 排序个性化设置弹框 */}
      <AnimatePresence>
        {sortSettingOpen && (
          <SortSettingModal
            open={sortSettingOpen}
            onClose={() => setSortSettingOpen(false)}
            isMobile={isMobile}
          />
        )}
      </AnimatePresence>

      {/* 全局轻提示 Toast */}
      <GlobalToast toast={toast} />
    </div>
  );
}
