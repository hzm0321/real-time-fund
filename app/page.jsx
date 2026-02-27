'use client';

import { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { createWorker } from 'tesseract.js';
import { createAvatar } from '@dicebear/core';
import { glass } from '@dicebear/collection';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isNumber, isString, isPlainObject } from 'lodash';
import Announcement from "./components/Announcement";
import { Stat } from "./components/Common";
import FundTrendChart from "./components/FundTrendChart";
import FundIntradayChart from "./components/FundIntradayChart";
import { ChevronIcon, CloseIcon, ExitIcon, EyeIcon, EyeOffIcon, GridIcon, ListIcon, LoginIcon, LogoutIcon, PinIcon, PinOffIcon, PlusIcon, RefreshIcon, SettingsIcon, SortIcon, StarIcon, TrashIcon, UpdateIcon, UserIcon, CameraIcon } from "./components/Icons";
import AddFundToGroupModal from "./components/AddFundToGroupModal";
import AddResultModal from "./components/AddResultModal";
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
import UpdatePromptModal from "./components/UpdatePromptModal";
import WeChatModal from "./components/WeChatModal";
import DcaModal from "./components/DcaModal";
import githubImg from "./assets/github.svg";
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { recordValuation, getAllValuationSeries, clearFund } from './lib/valuationTimeseries';
import { fetchFundData, fetchLatestRelease, fetchShanghaiIndexDate, fetchSmartFundNetValue, searchFunds, extractFundNamesWithLLM } from './api/fund';
import packageJson from '../package.json';
import PcFundTable from './components/PcFundTable';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_TZ = 'Asia/Shanghai';
const getBrowserTimeZone = () => {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || DEFAULT_TZ;
  }
  return DEFAULT_TZ;
};
const TZ = getBrowserTimeZone();
dayjs.tz.setDefault(TZ);
const nowInTz = () => dayjs().tz(TZ);
const toTz = (input) => (input ? dayjs.tz(input, TZ) : nowInTz());
const formatDate = (input) => toTz(input).format('YYYY-MM-DD');

function ScanButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      className="icon-button"
      onClick={onClick}
      disabled={disabled}
      title="拍照/上传图片识别基金代码"
      style={{
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'wait' : 'pointer',
        width: '32px',
        height: '32px'
      }}
    >
      {disabled ? (
        <div className="loading-spinner" style={{ width: 16, height: 16, border: '2px solid var(--muted)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      ) : (
        <CameraIcon width="18" height="18" />
      )}
    </button>
  );
}

// 数字滚动组件（初始化时无动画，后续变更再动画）
function CountUp({ value, prefix = '', suffix = '', decimals = 2, className = '', style = {} }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const isFirstChange = useRef(true);

  useEffect(() => {
    if (previousValue.current === value) return;

    // 首次数值变化（包括从 0/默认值变为实际数据）不做动画，直接跳到目标值
    if (isFirstChange.current) {
      isFirstChange.current = false;
      previousValue.current = value;
      setDisplayValue(value);
      return;
    }

    const start = previousValue.current;
    const end = value;
    const duration = 400; // 0.4秒动画
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutQuart
      const ease = 1 - Math.pow(1 - progress, 4);

      const current = start + (end - start) * ease;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = value;
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span className={className} style={style}>
      {prefix}{Math.abs(displayValue).toFixed(decimals)}{suffix}
    </span>
  );
}

function GroupSummary({ funds, holdings, groupName, getProfit, stickyTop }) {
  const [showPercent, setShowPercent] = useState(true);
  const [isMasked, setIsMasked] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const rowRef = useRef(null);
  const [assetSize, setAssetSize] = useState(24);
  const [metricSize, setMetricSize] = useState(18);
  const [winW, setWinW] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWinW(window.innerWidth);
      const onR = () => setWinW(window.innerWidth);
      window.addEventListener('resize', onR);
      return () => window.removeEventListener('resize', onR);
    }
  }, []);

  const summary = useMemo(() => {
    let totalAsset = 0;
    let totalProfitToday = 0;
    let totalHoldingReturn = 0;
    let totalCost = 0;
    let hasHolding = false;
    let hasAnyTodayData = false;

    funds.forEach(fund => {
      const holding = holdings[fund.code];
      const profit = getProfit(fund, holding);

      if (profit) {
        hasHolding = true;
        totalAsset += profit.amount;
        if (profit.profitToday != null) {
          // 与卡片展示口径一致：先按“分”四舍五入再汇总，避免浮点误差/逐项舍入差导致不一致
          totalProfitToday += Math.round(profit.profitToday * 100) / 100;
          hasAnyTodayData = true;
        }
        if (profit.profitTotal !== null) {
          totalHoldingReturn += profit.profitTotal;
          if (holding && isNumber(holding.cost) && isNumber(holding.share)) {
            totalCost += holding.cost * holding.share;
          }
        }
      }
    });

    const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;

    return { totalAsset, totalProfitToday, totalHoldingReturn, hasHolding, returnRate, hasAnyTodayData };
  }, [funds, holdings, getProfit]);

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const height = el.clientHeight;
    // 使用 80px 作为更严格的阈值，因为 margin/padding 可能导致实际占用更高
    const tooTall = height > 80;
    if (tooTall) {
      setAssetSize(s => Math.max(16, s - 1));
      setMetricSize(s => Math.max(12, s - 1));
    } else {
      // 如果高度正常，尝试适当恢复字体大小，但不要超过初始值
      // 这里的逻辑可以优化：如果当前远小于阈值，可以尝试增大，但为了稳定性，主要处理缩小的场景
      // 或者：如果高度非常小（例如远小于80），可以尝试+1，但要小心死循环
    }
  }, [winW, summary.totalAsset, summary.totalProfitToday, summary.totalHoldingReturn, summary.returnRate, showPercent, assetSize, metricSize]); // 添加 assetSize, metricSize 到依赖，确保逐步缩小生效

  if (!summary.hasHolding) return null;

  return (
    <div className={isSticky ? "group-summary-sticky" : ""} style={isSticky && stickyTop ? { top: stickyTop } : {}}>
    <div className="glass card group-summary-card" style={{ marginBottom: 8, padding: '16px 20px', background: 'rgba(255, 255, 255, 0.03)', position: 'relative' }}>
      <span
        className="sticky-toggle-btn"
        onClick={() => setIsSticky(!isSticky)}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 24,
          height: 24,
          padding: 4,
          opacity: 0.6,
          zIndex: 10,
          color: 'var(--muted)'
        }}
      >
        {isSticky ? <PinIcon width="14" height="14" /> : <PinOffIcon width="14" height="14" />}
      </span>
      <div ref={rowRef} className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div className="muted" style={{ fontSize: '12px' }}>{groupName}</div>
            <button
              className="fav-button"
              onClick={() => setIsMasked(value => !value)}
              aria-label={isMasked ? '显示资产' : '隐藏资产'}
              style={{ margin: 0, padding: 2, display: 'inline-flex', alignItems: 'center' }}
            >
              {isMasked ? <EyeOffIcon width="16" height="16" /> : <EyeIcon width="16" height="16" />}
            </button>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: '16px', marginRight: 2 }}>¥</span>
            {isMasked ? (
              <span style={{ fontSize: assetSize, position: 'relative', top: 4 }}>******</span>
            ) : (
              <CountUp value={summary.totalAsset} style={{ fontSize: assetSize }} />
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>当日收益</div>
            <div
              className={summary.hasAnyTodayData ? (summary.totalProfitToday > 0 ? 'up' : summary.totalProfitToday < 0 ? 'down' : '') : 'muted'}
              style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
            >
              {isMasked ? (
                <span style={{ fontSize: metricSize }}>******</span>
              ) : summary.hasAnyTodayData ? (
                <>
                  <span style={{ marginRight: 1 }}>{summary.totalProfitToday > 0 ? '+' : summary.totalProfitToday < 0 ? '-' : ''}</span>
                  <CountUp value={Math.abs(summary.totalProfitToday)} style={{ fontSize: metricSize }} />
                </>
              ) : (
                <span style={{ fontSize: metricSize }}>--</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有收益{showPercent ? '(%)' : ''}</div>
            <div
              className={summary.totalHoldingReturn > 0 ? 'up' : summary.totalHoldingReturn < 0 ? 'down' : ''}
              style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
              onClick={() => setShowPercent(!showPercent)}
              title="点击切换金额/百分比"
            >
              {isMasked ? (
                <span style={{ fontSize: metricSize }}>******</span>
              ) : (
                <>
                  <span style={{ marginRight: 1 }}>{summary.totalHoldingReturn > 0 ? '+' : summary.totalHoldingReturn < 0 ? '-' : ''}</span>
                  {showPercent ? (
                    <CountUp value={Math.abs(summary.returnRate)} suffix="%" style={{ fontSize: metricSize }} />
                  ) : (
                    <CountUp value={Math.abs(summary.totalHoldingReturn)} style={{ fontSize: metricSize }} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

export default function HomePage() {
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const refreshCycleStartRef = useRef(Date.now());
  const refreshingRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const isExplicitLoginRef = useRef(false);

  // 刷新频率状态
  const [refreshMs, setRefreshMs] = useState(30000);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSeconds, setTempSeconds] = useState(30);

  // 全局刷新状态
  const [refreshing, setRefreshing] = useState(false);
  // 刷新周期进度 0~1，用于环形进度条
  const [refreshProgress, setRefreshProgress] = useState(0);

  // 收起/展开状态
  const [collapsedCodes, setCollapsedCodes] = useState(new Set());
  const [collapsedTrends, setCollapsedTrends] = useState(new Set()); // New state for collapsed trend charts

  // 估值分时序列（每次调用估值接口记录，用于分时图）
  const [valuationSeries, setValuationSeries] = useState(() => (typeof window !== 'undefined' ? getAllValuationSeries() : {}));

  // 自选状态
  const [favorites, setFavorites] = useState(new Set());
  const [groups, setGroups] = useState([]); // [{ id, name, codes: [] }]
  const [currentTab, setCurrentTab] = useState('all');
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [addFundToGroupOpen, setAddFundToGroupOpen] = useState(false);

  // 排序状态
  const [sortBy, setSortBy] = useState('default'); // default, name, yield, holding
  const [sortOrder, setSortOrder] = useState('desc'); // asc | desc

  // 视图模式
  const [viewMode, setViewMode] = useState('card'); // card, list

  // 用户认证状态
  const [user, setUser] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  useEffect(() => {
    // 优先使用服务端返回的时间，如果没有则使用本地存储的时间
    // 这里只设置初始值，后续更新由接口返回的时间驱动
    const stored = window.localStorage.getItem('localUpdatedAt');
    if (stored) {
      setLastSyncTime(stored);
    } else {
      // 如果没有存储的时间，暂时设为 null，等待接口返回
      setLastSyncTime(null);
    }
  }, []);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');
  const [loginOtp, setLoginOtp] = useState('');

  const userAvatar = useMemo(() => {
    if (!user?.id) return '';
    return createAvatar(glass, {
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
  const [addResultOpen, setAddResultOpen] = useState(false);
  const [addFailures, setAddFailures] = useState([]);

  // 动态计算 Navbar 和 FilterBar 高度
  const navbarRef = useRef(null);
  const filterBarRef = useRef(null);
  const [navbarHeight, setNavbarHeight] = useState(0);
  const [filterBarHeight, setFilterBarHeight] = useState(0);

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
  const [dcaModal, setDcaModal] = useState({ open: false, fund: null });
  const [clearConfirm, setClearConfirm] = useState(null); // { fund }
  const [donateOpen, setDonateOpen] = useState(false);
  const [holdings, setHoldings] = useState({}); // { [code]: { share: number, cost: number } }
  const [pendingTrades, setPendingTrades] = useState([]); // [{ id, fundCode, share, date, ... }]
  const [transactions, setTransactions] = useState({}); // { [code]: [{ id, type, amount, share, price, date, timestamp }] }
  const [dcaPlans, setDcaPlans] = useState({}); // { [code]: { amount, feeRate, cycle, firstDate, enabled } }
  const [historyModal, setHistoryModal] = useState({ open: false, fund: null });
  const [addHistoryModal, setAddHistoryModal] = useState({ open: false, fund: null });
  const [percentModes, setPercentModes] = useState({}); // { [code]: boolean }

  const holdingsRef = useRef(holdings);
  const pendingTradesRef = useRef(pendingTrades);

  useEffect(() => {
    holdingsRef.current = holdings;
    pendingTradesRef.current = pendingTrades;
  }, [holdings, pendingTrades]);

  const [isTradingDay, setIsTradingDay] = useState(true); // 默认为交易日，通过接口校正
  const tabsRef = useRef(null);
  const [fundDeleteConfirm, setFundDeleteConfirm] = useState(null); // { code, name }

  const todayStr = formatDate();

  const [isMobile, setIsMobile] = useState(false);
  const [hoveredPcRowCode, setHoveredPcRowCode] = useState(null); // PC 列表行悬浮高亮
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => setIsMobile(window.innerWidth <= 640);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

  // 检查更新
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [updateContent, setUpdateContent] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // 未配置 GitHub 最新版本接口地址时，不进行更新检查
    if (!process.env.NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL) return;

    const checkUpdate = async () => {
      try {
        const data = await fetchLatestRelease();
        if (!data?.tagName) return;
        const remoteVersion = data.tagName.replace(/^v/, '');
        if (remoteVersion !== packageJson.version) {
          setHasUpdate(true);
          setLatestVersion(remoteVersion);
          setUpdateContent(data.body || '');
        }
      } catch (e) {
        console.error('Check update failed:', e);
      }
    };

    checkUpdate();
    const interval = setInterval(checkUpdate, 30 * 60 * 1000); // 30 minutes
    return () => clearInterval(interval);
  }, []);

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

  // 计算持仓收益
  const getHoldingProfit = useCallback((fund, holding) => {
    if (!holding || !isNumber(holding.share)) return null;

    const hasTodayData = fund.jzrq === todayStr;
    const hasTodayValuation = isString(fund.gztime) && fund.gztime.startsWith(todayStr);
    const canCalcTodayProfit = hasTodayData || hasTodayValuation;

    // 如果是交易日且9点以后，且今日净值未出，则强制使用估值（隐藏涨跌幅列模式）
    const useValuation = isTradingDay && !hasTodayData;

    let currentNav;
    let profitToday;

    if (!useValuation) {
      // 使用确权净值 (dwjz)
      currentNav = Number(fund.dwjz);
      if (!currentNav) return null;

      if (canCalcTodayProfit) {
        const amount = holding.share * currentNav;
        // 优先用 zzl (真实涨跌幅), 降级用 gszzl
        // 若 gztime 日期 > jzrq，说明估值更新晚于净值日期，优先使用 gszzl 计算当日盈亏
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
        const amount = holding.share * currentNav;
        // 估值涨跌幅
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
      profitTotal
    };
  }, [isTradingDay, todayStr]);


  // 过滤和排序后的基金列表
  const displayFunds = useMemo(
    () => funds
      .filter(f => {
        if (currentTab === 'all') return true;
        if (currentTab === 'fav') return favorites.has(f.code);
        const group = groups.find(g => g.id === currentTab);
        return group ? group.codes.includes(f.code) : true;
      })
      .sort((a, b) => {
        if (sortBy === 'yield') {
          const valA = isNumber(a.estGszzl) ? a.estGszzl : (a.gszzl ?? a.zzl ?? 0);
          const valB = isNumber(b.estGszzl) ? b.estGszzl : (b.gszzl ?? a.zzl ?? 0);
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        if (sortBy === 'holding') {
          const pa = getHoldingProfit(a, holdings[a.code]);
          const pb = getHoldingProfit(b, holdings[b.code]);
          const valA = pa?.profitTotal ?? Number.NEGATIVE_INFINITY;
          const valB = pb?.profitTotal ?? Number.NEGATIVE_INFINITY;
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        if (sortBy === 'name') {
          return sortOrder === 'asc' ? a.name.localeCompare(b.name, 'zh-CN') : b.name.localeCompare(a.name, 'zh-CN');
        }
        return 0;
      }),
    [funds, currentTab, favorites, groups, sortBy, sortOrder, holdings, getHoldingProfit],
  );

  // PC 端表格数据（用于 PcFundTable）
  const pcFundTableData = useMemo(
    () =>
      displayFunds.map((f) => {
        const hasTodayData = f.jzrq === todayStr;
        const shouldHideChange = isTradingDay && !hasTodayData;
        const navOrEstimate = !shouldHideChange
          ? (f.dwjz ?? '—')
          : (f.noValuation
            ? (f.dwjz ?? '—')
            : (f.estPricedCoverage > 0.05
              ? (f.estGsz != null ? Number(f.estGsz).toFixed(4) : '—')
              : (f.gsz ?? '—')));

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

        const holding = holdings[f.code];
        const profit = getHoldingProfit(f, holding);
        const amount = profit ? profit.amount : null;
        const holdingAmount =
          amount == null ? '未设置' : `¥${amount.toFixed(2)}`;
        const holdingAmountValue = amount;

        const profitToday = profit ? profit.profitToday : null;
        const todayProfit =
          profitToday == null
            ? ''
            : `${profitToday > 0 ? '+' : profitToday < 0 ? '-' : ''}¥${Math.abs(profitToday).toFixed(2)}`;
        const todayProfitValue = profitToday;

        const total = profit ? profit.profitTotal : null;
        const principal =
          holding && isNumber(holding.cost) && isNumber(holding.share)
            ? holding.cost * holding.share
            : 0;
        const asPercent = !!percentModes[f.code];
        const holdingProfit =
          total == null
            ? ''
            : (asPercent && principal > 0
              ? `${total > 0 ? '+' : total < 0 ? '-' : ''}${Math.abs((total / principal) * 100).toFixed(2)}%`
              : `${total > 0 ? '+' : total < 0 ? '-' : ''}¥${Math.abs(total).toFixed(2)}`);
        const holdingProfitValue = total;

        return {
          rawFund: f,
          code: f.code,
          fundName: f.name,
          isUpdated: f.jzrq === todayStr,
          navOrEstimate,
          yesterdayChangePercent,
          yesterdayChangeValue,
          yesterdayDate,
          estimateChangePercent,
          estimateChangeValue,
          estimateChangeMuted: f.noValuation,
          estimateTime,
          holdingAmount,
          holdingAmountValue,
          todayProfit,
          todayProfitValue,
          holdingProfit,
          holdingProfitValue,
        };
      }),
    [displayFunds, holdings, isTradingDay, todayStr, getHoldingProfit, percentModes],
  );

  // 自动滚动选中 Tab 到可视区域
  useEffect(() => {
    if (!tabsRef.current) return;
    if (currentTab === 'all') {
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

  const handleSaveHolding = (code, data) => {
    setHoldings(prev => {
      const next = { ...prev };
      if (data.share === null && data.cost === null) {
        delete next[code];
      } else {
        next[code] = data;
      }
      storageHelper.setItem('holdings', JSON.stringify(next));
      return next;
    });
    setHoldingModal({ open: false, fund: null });
  };

  const handleAction = (type, fund) => {
    if (type !== 'history') {
      setActionModal({ open: false, fund: null });
    }

    if (type === 'edit') {
      setHoldingModal({ open: true, fund });
    } else if (type === 'clear') {
      setClearConfirm({ fund });
    } else if (type === 'buy' || type === 'sell') {
      setTradeModal({ open: true, fund, type });
    } else if (type === 'history') {
      setHistoryModal({ open: true, fund });
    } else if (type === 'dca') {
      setDcaModal({ open: true, fund });
    }
  };

  const handleClearConfirm = () => {
    if (clearConfirm?.fund) {
      handleSaveHolding(clearConfirm.fund.code, { share: null, cost: null });
    }
    setClearConfirm(null);
  };

  const processPendingQueue = async () => {
    const currentPending = pendingTradesRef.current;
    if (currentPending.length === 0) return;

    let stateChanged = false;
    let tempHoldings = { ...holdingsRef.current };
    const processedIds = new Set();
    const newTransactions = [];

    for (const trade of currentPending) {
      let queryDate = trade.date;
      if (trade.isAfter3pm) {
          queryDate = toTz(trade.date).add(1, 'day').format('YYYY-MM-DD');
      }

      // 尝试获取智能净值
      const result = await fetchSmartFundNetValue(trade.fundCode, queryDate);

      if (result && result.value > 0) {
        // 成功获取，执行交易
        const current = tempHoldings[trade.fundCode] || { share: 0, cost: 0 };

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
             newShare = Math.max(0, current.share - trade.share);
             newCost = current.cost;
             if (newShare === 0) newCost = 0;

             tradeShare = trade.share;
             tradeAmount = trade.share * result.value;
        }

        tempHoldings[trade.fundCode] = { share: newShare, cost: newCost };
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
            timestamp: Date.now()
        });
      }
    }

    if (stateChanged) {
      setHoldings(tempHoldings);
      storageHelper.setItem('holdings', JSON.stringify(tempHoldings));

      setPendingTrades(prev => {
          const next = prev.filter(t => !processedIds.has(t.id));
          storageHelper.setItem('pendingTrades', JSON.stringify(next));
          return next;
      });

      setTransactions(prev => {
          const nextState = { ...prev };
          newTransactions.forEach(tx => {
              const current = nextState[tx.fundCode] || [];
              // 避免重复添加 (虽然 id 应该唯一)
              if (!current.some(t => t.id === tx.id)) {
                  nextState[tx.fundCode] = [tx, ...current].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
              }
          });
          storageHelper.setItem('transactions', JSON.stringify(nextState));
          return nextState;
      });

      showToast(`已处理 ${processedIds.size} 笔待定交易`, 'success');
    }
  };

  const handleDeleteTransaction = (fundCode, transactionId) => {
    setTransactions(prev => {
      const current = prev[fundCode] || [];
      const next = current.filter(t => t.id !== transactionId);
      const nextState = { ...prev, [fundCode]: next };
      storageHelper.setItem('transactions', JSON.stringify(nextState));
      return nextState;
    });
    showToast('交易记录已删除', 'success');
  };

  const handleAddHistory = (data) => {
    const fundCode = data.fundCode;
    // 添加历史记录仅作补录展示，不修改真实持仓金额与份额
    setTransactions(prev => {
      const current = prev[fundCode] || [];
      const record = {
        id: crypto.randomUUID(),
        type: data.type,
        share: data.share,
        amount: data.amount,
        price: data.price,
        date: data.date,
        isAfter3pm: false, // 历史记录通常不需要此标记，或者默认为 false
        isDca: false,
        isHistoryOnly: true, // 仅记录，不参与持仓计算
        timestamp: data.timestamp || Date.now()
      }
      // 按时间倒序排列
      const next = [record, ...current].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const nextState = { ...prev, [fundCode]: next };
      storageHelper.setItem('transactions', JSON.stringify(nextState));
      return nextState;
    });
    showToast('历史记录已添加', 'success');
    setAddHistoryModal({ open: false, fund: null });
  };

  const handleTrade = (fund, data) => {
    // 如果没有价格（API失败），加入待处理队列
    if (!data.price || data.price === 0) {
        const pending = {
            id: crypto.randomUUID(),
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
            timestamp: Date.now()
        };

        const next = [...pendingTrades, pending];
        setPendingTrades(next);
        storageHelper.setItem('pendingTrades', JSON.stringify(next));

        setTradeModal({ open: false, fund: null, type: 'buy' });
        showToast('净值暂未更新，已加入待处理队列', 'info');
        return;
    }

    const current = holdings[fund.code] || { share: 0, cost: 0 };
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

    handleSaveHolding(fund.code, { share: newShare, cost: newCost });

    setTransactions(prev => {
      const current = prev[fund.code] || [];
      const record = {
        id: crypto.randomUUID(),
        type: tradeModal.type,
        share: data.share,
        amount: isBuy ? data.totalCost : (data.share * data.price),
        price: data.price,
        date: data.date,
        isAfter3pm: data.isAfter3pm,
        isDca: false,
        timestamp: Date.now()
      };
      const next = [record, ...current];
      const nextState = { ...prev, [fund.code]: next };
      storageHelper.setItem('transactions', JSON.stringify(nextState));
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
    setUserMenuOpen(false);
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }
    setLoginModalOpen(true);
  };

  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false); // 扫描弹窗
  const [scanConfirmModalOpen, setScanConfirmModalOpen] = useState(false); // 扫描确认弹窗
  const [scannedFunds, setScannedFunds] = useState([]); // 扫描到的基金
  const [selectedScannedCodes, setSelectedScannedCodes] = useState(new Set()); // 选中的扫描代码
  const [isScanning, setIsScanning] = useState(false);
  const [isScanImporting, setIsScanImporting] = useState(false);
  const [scanImportProgress, setScanImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [scanProgress, setScanProgress] = useState({ stage: 'ocr', current: 0, total: 0 }); // stage: ocr | verify
  const abortScanRef = useRef(false); // 终止扫描标记
  const fileInputRef = useRef(null);
  const ocrWorkerRef = useRef(null);

  const handleScanClick = () => {
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

      const allCodes = new Set();
      const allNames = new Set();
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
        const matches = text.match(/\b\d{6}\b/g) || [];
        matches.forEach(c => allCodes.add(c));

        // 如果当前图片中没有识别出基金编码，尝试从文本中提取可能的中文基金名称（调用 GLM 接口）
        if (!matches.length && text) {
          let parsedNames = [];
          try {
            parsedNames = await extractFundNamesWithLLM(text);
          } catch (e) {
            parsedNames = [];
          }
          parsedNames.forEach((name) => {
            if (isString(name)) {
              allNames.add(name.trim());
            }
          });
        }
      }

      if (abortScanRef.current) {
        // 如果是手动终止，不显示结果弹窗
        return;
      }

      // 如果所有截图中都没有识别出基金编码，尝试使用识别到的中文名称去搜索基金
      if (allCodes.size === 0 && allNames.size > 0) {
        const names = Array.from(allNames);
        setScanProgress({ stage: 'verify', current: 0, total: names.length });
        for (let i = 0; i < names.length; i++) {
          if (abortScanRef.current) break;
          const name = names[i];
          setScanProgress(prev => ({ ...prev, current: i + 1 }));
          try {
            const list = await searchFundsWithTimeout(name, 8000);
            // 只有当搜索结果「有且仅有一条」时，才认为名称匹配是唯一且有效的
            if (Array.isArray(list) && list.length === 1) {
              const found = list[0];
              if (found && found.CODE) {
                allCodes.add(found.CODE);
              }
            }
          } catch (e) {
          }
        }
      }

      const codes = Array.from(allCodes).sort();
      setScanProgress({ stage: 'verify', current: 0, total: codes.length });

      const existingCodes = new Set(funds.map(f => f.code));
      const results = [];
      for (let i = 0; i < codes.length; i++) {
        if (abortScanRef.current) break;
        const code = codes[i];
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
          name: found ? (found.NAME || found.SHORTNAME || '') : '',
          status: alreadyAdded ? 'added' : (ok ? 'ok' : 'invalid')
        });
      }

      if (abortScanRef.current) {
        return;
      }

      setScannedFunds(results);
      setSelectedScannedCodes(new Set(results.filter(r => r.status === 'ok').map(r => r.code)));
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

  const confirmScanImport = async () => {
    const codes = Array.from(selectedScannedCodes);
    if (codes.length === 0) {
      showToast('请至少选择一个基金代码', 'error');
      return;
    }
    setScanConfirmModalOpen(false);
    setIsScanImporting(true);
    setScanImportProgress({ current: 0, total: codes.length, success: 0, failed: 0 });

    try {
      const newFunds = [];
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        setScanImportProgress(prev => ({ ...prev, current: i + 1 }));

        if (funds.some(existing => existing.code === code)) continue;
        try {
          const data = await fetchFundData(code);
          newFunds.push(data);
          successCount++;
          setScanImportProgress(prev => ({ ...prev, success: prev.success + 1 }));
        } catch (e) {
          failedCount++;
          setScanImportProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        }
      }

      if (newFunds.length > 0) {
        setFunds(prev => {
          const updated = dedupeByCode([...newFunds, ...prev]);
          storageHelper.setItem('funds', JSON.stringify(updated));
          return updated;
        });
        const nextSeries = {};
        newFunds.forEach(u => {
          if (u?.code != null && !u.noValuation && Number.isFinite(Number(u.gsz))) {
            nextSeries[u.code] = recordValuation(u.code, { gsz: u.gsz, gztime: u.gztime });
          }
        });
        if (Object.keys(nextSeries).length > 0) setValuationSeries(prev => ({ ...prev, ...nextSeries }));
        setSuccessModal({ open: true, message: `成功导入 ${successCount} 个基金` });
      } else {
        if (codes.length > 0 && successCount === 0 && failedCount === 0) {
          setSuccessModal({ open: true, message: '识别的基金已全部添加' });
        } else {
          showToast('未能导入任何基金', 'info');
        }
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
  const skipSyncRef = useRef(false);
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

  const getFundCodesSignature = useCallback((value) => {
    try {
      const list = JSON.parse(value || '[]');
      if (!Array.isArray(list)) return '';
      const codes = list.map((item) => item?.code).filter(Boolean);
      return Array.from(new Set(codes)).sort().join('|');
    } catch (e) {
      return '';
    }
  }, []);

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
    }, 1000 * 5); // 往云端同步的防抖时间
  }, []);

  const storageHelper = useMemo(() => {
    // 仅以下 key 参与云端同步；fundValuationTimeseries 不同步到云端（测试中功能，暂不同步）
    const keys = new Set(['funds', 'favorites', 'groups', 'collapsedCodes', 'collapsedTrends', 'refreshMs', 'holdings', 'pendingTrades', 'transactions', 'viewMode', 'dcaPlans']);
    const triggerSync = (key, prevValue, nextValue) => {
      if (keys.has(key)) {
        // 标记为脏数据
        dirtyKeysRef.current.add(key);

        if (key === 'funds') {
          const prevSig = getFundCodesSignature(prevValue);
          const nextSig = getFundCodesSignature(nextValue);
          if (prevSig === nextSig) return;
        }
        if (!skipSyncRef.current) {
          const now = nowInTz().toISOString();
          window.localStorage.setItem('localUpdatedAt', now);
          setLastSyncTime(now);
        }
        scheduleSync();
      }
    };
    return {
      setItem: (key, value) => {
        const prevValue = key === 'funds' ? window.localStorage.getItem(key) : null;
        window.localStorage.setItem(key, value);
        if (key === 'localUpdatedAt') {
          setLastSyncTime(value);
        }
        triggerSync(key, prevValue, value);
      },
      removeItem: (key) => {
        const prevValue = key === 'funds' ? window.localStorage.getItem(key) : null;
        window.localStorage.removeItem(key);
        triggerSync(key, prevValue, null);
      },
      clear: () => {
        window.localStorage.clear();
        if (!skipSyncRef.current) {
          const now = nowInTz().toISOString();
          window.localStorage.setItem('localUpdatedAt', now);
          setLastSyncTime(now);
        }
        scheduleSync();
      }
    };
  }, [getFundCodesSignature, scheduleSync]);

  useEffect(() => {
    // 仅以下 key 的变更会触发云端同步；fundValuationTimeseries 不在其中
    const keys = new Set(['funds', 'favorites', 'groups', 'collapsedCodes', 'collapsedTrends', 'refreshMs', 'holdings', 'pendingTrades', 'viewMode', 'dcaPlans']);
    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key === 'localUpdatedAt') {
        setLastSyncTime(e.newValue);
      }
      if (!keys.has(e.key)) return;
      if (e.key === 'funds') {
        const prevSig = getFundCodesSignature(e.oldValue);
        const nextSig = getFundCodesSignature(e.newValue);
        if (prevSig === nextSig) return;
      }
      scheduleSync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [getFundCodesSignature, scheduleSync]);

  const applyViewMode = useCallback((mode) => {
    if (mode !== 'card' && mode !== 'list') return;
    setViewMode(mode);
    storageHelper.setItem('viewMode', mode);
  }, [storageHelper]);

  const toggleFavorite = (code) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      storageHelper.setItem('favorites', JSON.stringify(Array.from(next)));
      if (next.size === 0) setCurrentTab('all');
      return next;
    });
  };

  const toggleCollapse = (code) => {
    setCollapsedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      // 同步到本地存储
      storageHelper.setItem('collapsedCodes', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const toggleTrendCollapse = (code) => {
    setCollapsedTrends(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      storageHelper.setItem('collapsedTrends', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const scheduleDcaTrades = useCallback(() => {
    if (!isPlainObject(dcaPlans)) return;
    const codesSet = new Set(funds.map((f) => f.code));
    if (codesSet.size === 0) return;

    const today = toTz(todayStr).startOf('day');
    const nextPlans = { ...dcaPlans };
    const newPending = [];

    Object.entries(dcaPlans).forEach(([code, plan]) => {
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

      // 回溯补单：从 lastDate (若不存在则从 firstDate 前一天) 开始，按周期一直推到今天
      let anchor = last ? last : first.clone().subtract(1, 'day');
      let current = anchor;
      let lastGenerated = null;

      const stepOnce = () => {
        if (cycle === 'daily') return current.add(1, 'day');
        if (cycle === 'weekly') return current.add(1, 'week');
        if (cycle === 'biweekly') return current.add(2, 'week');
        if (cycle === 'monthly') return current.add(1, 'month');
        return current.add(1, 'day');
      };

      // 循环生成所有 <= today 的应扣款日
      while (true) {
        current = stepOnce();
        if (current.isAfter(today, 'day')) break;
        if (current.isBefore(first, 'day')) continue;

        const dateStr = current.format('YYYY-MM-DD');

        const pending = {
          id: `dca_${code}_${dateStr}_${Date.now()}`,
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
          timestamp: Date.now()
        };
        newPending.push(pending);
        lastGenerated = current;
      }

      if (lastGenerated) {
        nextPlans[code] = {
          ...plan,
          lastDate: lastGenerated.format('YYYY-MM-DD')
        };
      }
    });

    if (newPending.length === 0) {
      if (JSON.stringify(nextPlans) !== JSON.stringify(dcaPlans)) {
        setDcaPlans(nextPlans);
        storageHelper.setItem('dcaPlans', JSON.stringify(nextPlans));
      }
      return;
    }

    setDcaPlans(nextPlans);
    storageHelper.setItem('dcaPlans', JSON.stringify(nextPlans));

    setPendingTrades(prev => {
      const merged = [...(prev || []), ...newPending];
      storageHelper.setItem('pendingTrades', JSON.stringify(merged));
      return merged;
    });

    showToast(`已生成 ${newPending.length} 笔定投买入`, 'success');
  }, [dcaPlans, funds, todayStr, storageHelper]);

  useEffect(() => {
    if (!isTradingDay) return;
    scheduleDcaTrades();
  }, [isTradingDay, scheduleDcaTrades]);

  const handleAddGroup = (name) => {
    const newGroup = {
      id: `group_${Date.now()}`,
      name,
      codes: []
    };
    const next = [...groups, newGroup];
    setGroups(next);
    storageHelper.setItem('groups', JSON.stringify(next));
    setCurrentTab(newGroup.id);
    setGroupModalOpen(false);
  };

  const handleRemoveGroup = (id) => {
    const next = groups.filter(g => g.id !== id);
    setGroups(next);
    storageHelper.setItem('groups', JSON.stringify(next));
    if (currentTab === id) setCurrentTab('all');
  };

  const handleUpdateGroups = (newGroups) => {
    setGroups(newGroups);
    storageHelper.setItem('groups', JSON.stringify(newGroups));
    // 如果当前选中的分组被删除了，切换回“全部”
    if (currentTab !== 'all' && currentTab !== 'fav' && !newGroups.find(g => g.id === currentTab)) {
      setCurrentTab('all');
    }
  };

  const handleAddFundsToGroup = (codes) => {
    if (!codes || codes.length === 0) return;
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
    storageHelper.setItem('groups', JSON.stringify(next));
    setAddFundToGroupOpen(false);
    setSuccessModal({ open: true, message: `成功添加 ${codes.length} 支基金` });
  };

  const removeFundFromCurrentGroup = (code) => {
    const next = groups.map(g => {
      if (g.id === currentTab) {
        return {
          ...g,
          codes: g.codes.filter(c => c !== code)
        };
      }
      return g;
    });
    setGroups(next);
    storageHelper.setItem('groups', JSON.stringify(next));
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
    storageHelper.setItem('groups', JSON.stringify(next));
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
    try {
      const saved = JSON.parse(localStorage.getItem('funds') || '[]');
      if (Array.isArray(saved) && saved.length) {
        const deduped = dedupeByCode(saved);
        setFunds(deduped);
        storageHelper.setItem('funds', JSON.stringify(deduped));
        const codes = Array.from(new Set(deduped.map((f) => f.code)));
        if (codes.length) refreshAll(codes);
      }
      const savedMs = parseInt(localStorage.getItem('refreshMs') || '30000', 10);
      if (Number.isFinite(savedMs) && savedMs >= 5000) {
        setRefreshMs(savedMs);
        setTempSeconds(Math.round(savedMs / 1000));
      }
      // 加载收起状态
      const savedCollapsed = JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
      if (Array.isArray(savedCollapsed)) {
        setCollapsedCodes(new Set(savedCollapsed));
      }
      // 加载业绩走势收起状态
      const savedTrends = JSON.parse(localStorage.getItem('collapsedTrends') || '[]');
      if (Array.isArray(savedTrends)) {
        setCollapsedTrends(new Set(savedTrends));
      }
      // 加载估值分时记录（用于分时图）
      setValuationSeries(getAllValuationSeries());
      // 加载自选状态
      const savedFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (Array.isArray(savedFavorites)) {
        setFavorites(new Set(savedFavorites));
      }
      // 加载待处理交易
      const savedPending = JSON.parse(localStorage.getItem('pendingTrades') || '[]');
      if (Array.isArray(savedPending)) {
        setPendingTrades(savedPending);
      }
      // 加载分组状态
      const savedGroups = JSON.parse(localStorage.getItem('groups') || '[]');
      if (Array.isArray(savedGroups)) {
        setGroups(savedGroups);
      }
      // 加载持仓数据
      const savedHoldings = JSON.parse(localStorage.getItem('holdings') || '{}');
      if (isPlainObject(savedHoldings)) {
        setHoldings(savedHoldings);
      }
      const savedTransactions = JSON.parse(localStorage.getItem('transactions') || '{}');
      if (isPlainObject(savedTransactions)) {
        setTransactions(savedTransactions);
      }
      const savedDcaPlans = JSON.parse(localStorage.getItem('dcaPlans') || '{}');
      if (isPlainObject(savedDcaPlans)) {
        setDcaPlans(savedDcaPlans);
      }
      const savedViewMode = localStorage.getItem('viewMode');
      if (savedViewMode === 'card' || savedViewMode === 'list') {
        setViewMode(savedViewMode);
      }
    } catch { }
  }, []);

  // 初始化认证状态监听
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(null);
      setUserMenuOpen(false);
      return;
    }
    const clearAuthState = () => {
      setUser(null);
      setUserMenuOpen(false);
    };

    const handleSession = async (session, event, isExplicitLogin = false) => {
      if (!session?.user) {
        if (event === 'SIGNED_OUT' && !isLoggingOutRef.current) {
          setLoginError('会话已过期，请重新登录');
          setLoginModalOpen(true);
        }
        isLoggingOutRef.current = false;
        clearAuthState();
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
        setLoginError('会话已过期，请重新登录');
        showToast('会话已过期，请重新登录', 'error');
        setLoginModalOpen(true);
        return;
      }
      setUser(session.user);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        setLoginModalOpen(false);
        setLoginEmail('');
        setLoginSuccess('');
        setLoginError('');
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

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;
    const channel = supabase
      .channel(`user-configs-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_configs', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const incoming = payload?.new?.data;
        if (!isPlainObject(incoming)) return;
        const incomingComparable = getComparablePayload(incoming);
        if (!incomingComparable || incomingComparable === lastSyncedRef.current) return;
        await applyCloudConfig(incoming, payload.new.updated_at);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_configs', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const incoming = payload?.new?.data;
        if (!isPlainObject(incoming)) return;
        const incomingComparable = getComparablePayload(incoming);
        if (!incomingComparable || incomingComparable === lastSyncedRef.current) return;
        await applyCloudConfig(incoming, payload.new.updated_at);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginSuccess('');
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!loginEmail.trim()) {
      setLoginError('请输入邮箱地址');
      return;
    }
    if (!emailRegex.test(loginEmail.trim())) {
      setLoginError('请输入有效的邮箱地址');
      return;
    }

    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: loginEmail.trim(),
        options: {
          shouldCreateUser: true
        }
      });
      if (error) throw error;
      setLoginSuccess('验证码已发送，请查收邮箱输入验证码完成注册/登录');
    } catch (err) {
      if (err.message?.includes('rate limit')) {
        setLoginError('请求过于频繁，请稍后再试');
      } else if (err.message?.includes('network')) {
        setLoginError('网络错误，请检查网络连接');
      } else {
        setLoginError(err.message || '发送验证码失败，请稍后再试');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    setLoginError('');
    if (!loginOtp || loginOtp.length < 4) {
      setLoginError('请输入邮箱中的验证码');
      return;
    }
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }
    try {
      isExplicitLoginRef.current = true;
      setLoginLoading(true);
      const { data, error } = await supabase.auth.verifyOtp({
        email: loginEmail.trim(),
        token: loginOtp.trim(),
        type: 'email'
      });
      if (error) throw error;
      if (data?.user) {
        setLoginModalOpen(false);
        setLoginEmail('');
        setLoginOtp('');
        setLoginSuccess('');
        setLoginError('');
      }
    } catch (err) {
      setLoginError(err.message || '验证失败，请检查验证码或稍后再试');
      isExplicitLoginRef.current = false;
    }
    setLoginLoading(false);
  };

  // 登出
  const handleLogout = async () => {
    isLoggingOutRef.current = true;
    if (!isSupabaseConfigured) {
      setLoginModalOpen(false);
      setLoginError('');
      setLoginSuccess('');
      setLoginEmail('');
      setLoginOtp('');
      setUserMenuOpen(false);
      setUser(null);
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
      setLoginError('');
      setLoginSuccess('');
      setLoginEmail('');
      setLoginOtp('');
      setUserMenuOpen(false);
      setUser(null);
    }
  };

  // 关闭用户菜单（点击外部时）
  const userMenuRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  useEffect(() => {
    refreshCycleStartRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const codes = Array.from(new Set(funds.map((f) => f.code)));
      if (codes.length) refreshAll(codes);
    }, refreshMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [funds, refreshMs]);

  // 刷新进度条：每 100ms 更新一次进度
  useEffect(() => {
    if (funds.length === 0 || refreshMs <= 0) return;
    const t = setInterval(() => {
      const elapsed = Date.now() - refreshCycleStartRef.current;
      const p = Math.min(1, elapsed / refreshMs);
      setRefreshProgress(p);
    }, 100);
    return () => clearInterval(t);
  }, [funds.length, refreshMs]);

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
      for (const code of toAdd) {
        try {
          const data = await fetchFundData(code);
          if (data && data.code) {
            added.push(data);
          }
        } catch (e) {
          console.error(`通过识别导入基金 ${code} 失败`, e);
        }
      }
      if (added.length > 0) {
        setFunds(prev => {
          const merged = [...prev, ...added];
          const deduped = Array.from(new Map(merged.map(f => [f.code, f])).values());
          storageHelper.setItem('funds', JSON.stringify(deduped));
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
      for (const f of selectedFunds) {
        if (funds.some(existing => existing.code === f.CODE)) continue;
        try {
          const data = await fetchFundData(f.CODE);
          newFunds.push(data);
        } catch (e) {
          console.error(`添加基金 ${f.CODE} 失败`, e);
        }
      }

      if (newFunds.length > 0) {
        const updated = dedupeByCode([...newFunds, ...funds]);
        setFunds(updated);
        storageHelper.setItem('funds', JSON.stringify(updated));
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
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    const uniqueCodes = Array.from(new Set(codes));
    try {
      const updated = [];
      for (const c of uniqueCodes) {
        try {
          const data = await fetchFundData(c);
          updated.push(data);
        } catch (e) {
          console.error(`刷新基金 ${c} 失败`, e);
          // 失败时从当前 state 中寻找旧数据
          setFunds(prev => {
            const old = prev.find((f) => f.code === c);
            if (old) updated.push(old);
            return prev;
          });
        }
      }

      if (updated.length > 0) {
        setFunds(prev => {
          // 将更新后的数据合并回当前最新的 state 中，防止覆盖掉刚刚导入的数据
          const merged = [...prev];
          updated.forEach(u => {
            const idx = merged.findIndex(f => f.code === u.code);
            if (idx > -1) {
              merged[idx] = u;
            } else {
              merged.push(u);
            }
          });
          const deduped = dedupeByCode(merged);
          storageHelper.setItem('funds', JSON.stringify(deduped));
          return deduped;
        });
        // 记录估值分时：每次刷新写入一条，新日期到来时自动清掉老日期数据
        const nextSeries = {};
        updated.forEach(u => {
          if (u?.code != null && !u.noValuation && Number.isFinite(Number(u.gsz))) {
            const val = recordValuation(u.code, { gsz: u.gsz, gztime: u.gztime });
            nextSeries[u.code] = val;
          }
        });
        if (Object.keys(nextSeries).length > 0) {
          setValuationSeries(prev => ({ ...prev, ...nextSeries }));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      refreshCycleStartRef.current = Date.now();
      try {
        await processPendingQueue();
      }catch (e) {
        showToast('待交易队列计算出错', 'error')
      }
    }
  };

  const toggleViewMode = () => {
    const nextMode = viewMode === 'card' ? 'list' : 'card';
    applyViewMode(nextMode);
  };

  const requestRemoveFund = (fund) => {
    const h = holdings[fund.code];
    const hasHolding = h && isNumber(h.share) && h.share > 0;
    if (hasHolding) {
      setFundDeleteConfirm({ code: fund.code, name: fund.name });
    } else {
      removeFund(fund.code);
    }
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
    setLoading(true);
    try {
      const newFunds = [];
      const failures = [];
      const nameMap = {};
      selectedFunds.forEach(f => { nameMap[f.CODE] = f.NAME; });
      for (const c of selectedCodes) {
        if (funds.some((f) => f.code === c)) continue;
        try {
          const data = await fetchFundData(c);
          newFunds.push(data);
        } catch (err) {
          failures.push({ code: c, name: nameMap[c] });
        }
      }
      if (newFunds.length === 0) {
        setError('未添加任何新基金');
      } else {
        const next = dedupeByCode([...newFunds, ...funds]);
        setFunds(next);
        storageHelper.setItem('funds', JSON.stringify(next));
        const nextSeries = {};
        newFunds.forEach(u => {
          if (u?.code != null && !u.noValuation && Number.isFinite(Number(u.gsz))) {
            nextSeries[u.code] = recordValuation(u.code, { gsz: u.gsz, gztime: u.gztime });
          }
        });
        if (Object.keys(nextSeries).length > 0) setValuationSeries(prev => ({ ...prev, ...nextSeries }));
      }
      setSearchTerm('');
      setSelectedFunds([]);
      setShowDropdown(false);
      inputRef.current?.blur();
      setIsSearchFocused(false);
      if (failures.length > 0) {
        setAddFailures(failures);
        setAddResultOpen(true);
      }
    } catch (e) {
      setError(e.message || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  const removeFund = (removeCode) => {
    const next = funds.filter((f) => f.code !== removeCode);
    setFunds(next);
    storageHelper.setItem('funds', JSON.stringify(next));

    // 同步删除分组中的失效代码
    const nextGroups = groups.map(g => ({
      ...g,
      codes: g.codes.filter(c => c !== removeCode)
    }));
    setGroups(nextGroups);
    storageHelper.setItem('groups', JSON.stringify(nextGroups));

    // 同步删除展开收起状态
    setCollapsedCodes(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      storageHelper.setItem('collapsedCodes', JSON.stringify(Array.from(nextSet)));
      return nextSet;
    });

    // 同步删除业绩走势收起状态
    setCollapsedTrends(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      storageHelper.setItem('collapsedTrends', JSON.stringify(Array.from(nextSet)));
      return nextSet;
    });

    // 同步删除自选状态
    setFavorites(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      storageHelper.setItem('favorites', JSON.stringify(Array.from(nextSet)));
      if (nextSet.size === 0) setCurrentTab('all');
      return nextSet;
    });

    // 同步删除持仓数据
    setHoldings(prev => {
      if (!prev[removeCode]) return prev;
      const next = { ...prev };
      delete next[removeCode];
      storageHelper.setItem('holdings', JSON.stringify(next));
      return next;
    });

    // 同步删除待处理交易
    setPendingTrades(prev => {
      const next = prev.filter((trade) => trade?.fundCode !== removeCode);
      storageHelper.setItem('pendingTrades', JSON.stringify(next));
      return next;
    });

    // 同步删除该基金的交易记录
    setTransactions(prev => {
      if (!prev[removeCode]) return prev;
      const next = { ...prev };
      delete next[removeCode];
      storageHelper.setItem('transactions', JSON.stringify(next));
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

    // 同步删除该基金的定投计划
    setDcaPlans(prev => {
      if (!prev || !prev[removeCode]) return prev;
      const next = { ...prev };
      delete next[removeCode];
      storageHelper.setItem('dcaPlans', JSON.stringify(next));
      return next;
    });
  };

  const manualRefresh = async () => {
    if (refreshingRef.current) return;
    const codes = Array.from(new Set(funds.map((f) => f.code)));
    if (!codes.length) return;
    await refreshAll(codes);
  };

  const saveSettings = (e) => {
    e?.preventDefault?.();
    const ms = Math.max(10, Number(tempSeconds)) * 1000;
    setRefreshMs(ms);
    storageHelper.setItem('refreshMs', String(ms));
    setSettingsOpen(false);
  };

  const importFileRef = useRef(null);
  const [importMsg, setImportMsg] = useState('');

  const normalizeCode = (value) => String(value || '').trim();
  const normalizeNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
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

    const pendingTrades = Array.isArray(payload.pendingTrades)
      ? payload.pendingTrades
          .map((trade) => {
            const fundCode = normalizeCode(trade?.fundCode);
            if (!fundCode) return null;
            return {
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
              isDca: !!trade?.isDca
            };
          })
          .filter((trade) => trade && uniqueFundCodes.includes(trade.fundCode))
          .sort((a, b) => {
            const keyA = a.id || `${a.fundCode}|${a.type}|${a.date}|${a.share ?? ''}|${a.amount ?? ''}|${a.feeMode}|${a.feeValue ?? ''}|${a.feeRate ?? ''}|${a.isAfter3pm ? 1 : 0}|${a.isDca ? 1 : 0}`;
            const keyB = b.id || `${b.fundCode}|${b.type}|${b.date}|${b.share ?? ''}|${b.amount ?? ''}|${b.feeMode}|${b.feeValue ?? ''}|${b.feeRate ?? ''}|${b.isAfter3pm ? 1 : 0}|${b.isDca ? 1 : 0}`;
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
            return { id, type, share, amount, price, date, timestamp, isDca };
          })
          .filter((t) => t.id || t.timestamp)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (normalized.length > 0) transactions[code] = normalized;
      });

    const dcaSource = isPlainObject(payload.dcaPlans) ? payload.dcaPlans : {};
    const dcaPlans = {};
    Object.keys(dcaSource)
      .map(normalizeCode)
      .filter((code) => uniqueFundCodes.includes(code))
      .sort()
      .forEach((code) => {
        const plan = dcaSource[code] || {};
        const amount = normalizeNumber(plan.amount);
        const feeRate = normalizeNumber(plan.feeRate);
        const cycle = ['daily', 'weekly', 'biweekly', 'monthly'].includes(plan.cycle) ? plan.cycle : '';
        const firstDate = plan.firstDate ? String(plan.firstDate) : '';
        const enabled = !!plan.enabled;
        const weeklyDay = normalizeNumber(plan.weeklyDay);
        const monthlyDay = normalizeNumber(plan.monthlyDay);
        const lastDate = plan.lastDate ? String(plan.lastDate) : '';
        if (amount === null && feeRate === null && !cycle && !firstDate && !enabled && weeklyDay === null && monthlyDay === null && !lastDate) return;
        dcaPlans[code] = {
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

    const viewMode = payload.viewMode === 'list' ? 'list' : 'card';

    return JSON.stringify({
      funds: uniqueFundCodes,
      favorites,
      groups,
      collapsedCodes,
      collapsedTrends,
      refreshMs: Number.isFinite(payload.refreshMs) ? payload.refreshMs : 30000,
      holdings,
      pendingTrades,
      transactions,
      dcaPlans,
      viewMode
    });
  }

  const collectLocalPayload = (keys = null) => {
    try {
      const all = {};
      // 不包含 fundValuationTimeseries，该数据暂不同步到云端
      if (!keys || keys.has('funds')) {
        all.funds = JSON.parse(localStorage.getItem('funds') || '[]');
      }
      if (!keys || keys.has('favorites')) {
        all.favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      }
      if (!keys || keys.has('groups')) {
        all.groups = JSON.parse(localStorage.getItem('groups') || '[]');
      }
      if (!keys || keys.has('collapsedCodes')) {
        all.collapsedCodes = JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
      }
      if (!keys || keys.has('collapsedTrends')) {
        all.collapsedTrends = JSON.parse(localStorage.getItem('collapsedTrends') || '[]');
      }
      if (!keys || keys.has('viewMode')) {
        all.viewMode = localStorage.getItem('viewMode') === 'list' ? 'list' : 'card';
      }
      if (!keys || keys.has('refreshMs')) {
        all.refreshMs = parseInt(localStorage.getItem('refreshMs') || '30000', 10);
      }
      if (!keys || keys.has('holdings')) {
        all.holdings = JSON.parse(localStorage.getItem('holdings') || '{}');
      }
      if (!keys || keys.has('pendingTrades')) {
        all.pendingTrades = JSON.parse(localStorage.getItem('pendingTrades') || '[]');
      }
      if (!keys || keys.has('transactions')) {
        all.transactions = JSON.parse(localStorage.getItem('transactions') || '{}');
      }
      if (!keys || keys.has('dcaPlans')) {
        all.dcaPlans = JSON.parse(localStorage.getItem('dcaPlans') || '{}');
      }

      // 如果是全量收集（keys 为 null），进行完整的数据清洗和验证逻辑
      if (!keys) {
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
        const cleanedGroups = Array.isArray(all.groups)
          ? all.groups.map(g => ({
              ...g,
              codes: Array.isArray(g.codes) ? g.codes.filter(c => fundCodes.has(c)) : []
            }))
          : [];

        const cleanedDcaPlans = isPlainObject(all.dcaPlans)
          ? Object.entries(all.dcaPlans).reduce((acc, [code, plan]) => {
              if (!fundCodes.has(code) || !isPlainObject(plan)) return acc;
              acc[code] = plan;
              return acc;
            }, {})
          : {};

        return {
          funds: all.funds,
          favorites: cleanedFavorites,
          groups: cleanedGroups,
          collapsedCodes: cleanedCollapsed,
          collapsedTrends: cleanedCollapsedTrends,
          refreshMs: all.refreshMs,
          holdings: cleanedHoldings,
          pendingTrades: all.pendingTrades,
          transactions: all.transactions,
          dcaPlans: cleanedDcaPlans,
          viewMode: all.viewMode
        };
      }

      // 如果是部分收集，直接返回读取到的字段
      return all;
    } catch {
      // 安全回退：如果是增量更新失败，返回空对象避免覆盖；全量更新则返回默认空配置
      if (keys) return {};
      return {
        funds: [],
        favorites: [],
        groups: [],
        collapsedCodes: [],
        collapsedTrends: [],
        refreshMs: 30000,
        holdings: {},
        pendingTrades: [],
        transactions: {},
        dcaPlans: {},
        viewMode: 'card',
        exportedAt: nowInTz().toISOString()
      };
    }
  };

  const applyCloudConfig = async (cloudData, cloudUpdatedAt) => {
    if (!isPlainObject(cloudData)) return;
    skipSyncRef.current = true;
    try {
      if (cloudUpdatedAt) {
        storageHelper.setItem('localUpdatedAt', cloudUpdatedAt);
      }
      const nextFunds = Array.isArray(cloudData.funds) ? dedupeByCode(cloudData.funds) : [];
      setFunds(nextFunds);
      storageHelper.setItem('funds', JSON.stringify(nextFunds));
      const nextFundCodes = new Set(nextFunds.map((f) => f.code));

      const nextFavorites = Array.isArray(cloudData.favorites) ? cloudData.favorites : [];
      setFavorites(new Set(nextFavorites));
      storageHelper.setItem('favorites', JSON.stringify(nextFavorites));

      const nextGroups = Array.isArray(cloudData.groups) ? cloudData.groups : [];
      setGroups(nextGroups);
      storageHelper.setItem('groups', JSON.stringify(nextGroups));

      const nextCollapsed = Array.isArray(cloudData.collapsedCodes) ? cloudData.collapsedCodes : [];
      setCollapsedCodes(new Set(nextCollapsed));
      storageHelper.setItem('collapsedCodes', JSON.stringify(nextCollapsed));

      const nextRefreshMs = Number.isFinite(cloudData.refreshMs) && cloudData.refreshMs >= 5000 ? cloudData.refreshMs : 30000;
      setRefreshMs(nextRefreshMs);
      setTempSeconds(Math.round(nextRefreshMs / 1000));
      storageHelper.setItem('refreshMs', String(nextRefreshMs));

      if (cloudData.viewMode === 'card' || cloudData.viewMode === 'list') {
        applyViewMode(cloudData.viewMode);
      }

      const nextHoldings = isPlainObject(cloudData.holdings) ? cloudData.holdings : {};
      setHoldings(nextHoldings);
      storageHelper.setItem('holdings', JSON.stringify(nextHoldings));

      const nextPendingTrades = Array.isArray(cloudData.pendingTrades)
        ? cloudData.pendingTrades.filter((trade) => trade && nextFundCodes.has(trade.fundCode))
        : [];
      setPendingTrades(nextPendingTrades);
      storageHelper.setItem('pendingTrades', JSON.stringify(nextPendingTrades));

      const nextTransactions = isPlainObject(cloudData.transactions) ? cloudData.transactions : {};
      setTransactions(nextTransactions);
      storageHelper.setItem('transactions', JSON.stringify(nextTransactions));

      const cloudDca = isPlainObject(cloudData.dcaPlans) ? cloudData.dcaPlans : {};
      const nextDcaPlans = Object.entries(cloudDca).reduce((acc, [code, plan]) => {
        if (!nextFundCodes.has(code) || !isPlainObject(plan)) return acc;
        acc[code] = plan;
        return acc;
      }, {});
      setDcaPlans(nextDcaPlans);
      storageHelper.setItem('dcaPlans', JSON.stringify(nextDcaPlans));

      if (nextFunds.length) {
        const codes = Array.from(new Set(nextFunds.map((f) => f.code)));
        if (codes.length) await refreshAll(codes);
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
      const { data, error } = await supabase
        .from('user_configs')
        .select('id, data, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) {
        const { error: insertError } = await supabase
          .from('user_configs')
          .insert({ user_id: userId });
        if (insertError) throw insertError;
        setCloudConfigModal({ open: true, userId, type: 'empty' });
        return;
      }
      if (data?.data && isPlainObject(data.data) && Object.keys(data.data).length > 0) {
        const localPayload = collectLocalPayload();
        const localComparable = getComparablePayload(localPayload);
        const cloudComparable = getComparablePayload(data.data);

        if (localComparable !== cloudComparable) {
          // 如果数据不一致
          if (checkConflict) {
            // 只有明确要求检查冲突时才提示（例如刚登录时）
            setCloudConfigModal({ open: true, userId, type: 'conflict', cloudData: data.data });
            return;
          }
          // 否则直接覆盖本地（例如已登录状态下的刷新）
          await applyCloudConfig(data.data, data.updated_at);
          return;
        }

        await applyCloudConfig(data.data, data.updated_at);
        return;
      }
      setCloudConfigModal({ open: true, userId, type: 'empty' });
    } catch (e) {
      console.error('获取云端配置失败', e);
    }
  };

  const syncUserConfig = async (userId, showTip = true, payload = null, isPartial = false) => {
    if (!userId) {
      showToast(`userId 不存在，请重新登录`, 'error');
      return;
    }
    try {
      setIsSyncing(true);
      const dataToSync = payload || collectLocalPayload(); // Fallback to full sync if no payload
      const now = nowInTz().toISOString();

      let upsertData = null;
      let updateError = null;

      if (isPartial) {
        // 增量更新：使用 RPC 调用
        const { error: rpcError } = await supabase.rpc('update_user_config_partial', {
          payload: dataToSync
        });

        if (rpcError) {
          console.error('增量同步失败，尝试全量同步', rpcError);
          // RPC 失败回退到全量更新
          const fullPayload = collectLocalPayload();
          const { data, error } = await supabase
            .from('user_configs')
            .upsert(
              {
                user_id: userId,
                data: fullPayload,
                updated_at: now
              },
              { onConflict: 'user_id' }
            )
            .select();
          upsertData = data;
          updateError = error;
        } else {
          // RPC 成功，模拟 upsertData 格式以便后续逻辑通过
          upsertData = [{ id: 'rpc_success' }];
        }
      } else {
        // 全量更新
        const { data, error } = await supabase
          .from('user_configs')
          .upsert(
            {
              user_id: userId,
              data: dataToSync,
              updated_at: now
            },
            { onConflict: 'user_id' }
          )
          .select();
        upsertData = data;
        updateError = error;
      }

      if (updateError) throw updateError;
      if (!upsertData || upsertData.length === 0) {
        throw new Error('同步失败：未写入任何数据，请检查账号状态或重新登录');
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
        funds: JSON.parse(localStorage.getItem('funds') || '[]'),
        favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
        groups: JSON.parse(localStorage.getItem('groups') || '[]'),
        collapsedCodes: JSON.parse(localStorage.getItem('collapsedCodes') || '[]'),
        collapsedTrends: JSON.parse(localStorage.getItem('collapsedTrends') || '[]'),
        refreshMs: parseInt(localStorage.getItem('refreshMs') || '30000', 10),
        viewMode: localStorage.getItem('viewMode') === 'list' ? 'list' : 'card',
        holdings: JSON.parse(localStorage.getItem('holdings') || '{}'),
        pendingTrades: JSON.parse(localStorage.getItem('pendingTrades') || '[]'),
        transactions: JSON.parse(localStorage.getItem('transactions') || '{}'),
        dcaPlans: JSON.parse(localStorage.getItem('dcaPlans') || '{}'),
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
        const currentFunds = JSON.parse(localStorage.getItem('funds') || '[]');
        const currentFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        const currentGroups = JSON.parse(localStorage.getItem('groups') || '[]');
        const currentCollapsed = JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
        const currentTrends = JSON.parse(localStorage.getItem('collapsedTrends') || '[]');
        const currentPendingTrades = JSON.parse(localStorage.getItem('pendingTrades') || '[]');
        const currentDcaPlans = JSON.parse(localStorage.getItem('dcaPlans') || '{}');

        let mergedFunds = currentFunds;
        let appendedCodes = [];

        if (Array.isArray(data.funds)) {
          const incomingFunds = dedupeByCode(data.funds);
          const existingCodes = new Set(currentFunds.map(f => f.code));
          const newItems = incomingFunds.filter(f => f && f.code && !existingCodes.has(f.code));
          appendedCodes = newItems.map(f => f.code);
          mergedFunds = [...currentFunds, ...newItems];
          setFunds(mergedFunds);
          storageHelper.setItem('funds', JSON.stringify(mergedFunds));
        }

        if (Array.isArray(data.favorites)) {
          const mergedFav = Array.from(new Set([...currentFavorites, ...data.favorites]));
          setFavorites(new Set(mergedFav));
          storageHelper.setItem('favorites', JSON.stringify(mergedFav));
        }

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
          storageHelper.setItem('groups', JSON.stringify(mergedGroups));
        }

        if (Array.isArray(data.collapsedCodes)) {
          const mergedCollapsed = Array.from(new Set([...currentCollapsed, ...data.collapsedCodes]));
          setCollapsedCodes(new Set(mergedCollapsed));
          storageHelper.setItem('collapsedCodes', JSON.stringify(mergedCollapsed));
        }

        if (Array.isArray(data.collapsedTrends)) {
          const mergedTrends = Array.from(new Set([...currentTrends, ...data.collapsedTrends]));
          setCollapsedTrends(new Set(mergedTrends));
          storageHelper.setItem('collapsedTrends', JSON.stringify(mergedTrends));
        }

        if (isNumber(data.refreshMs) && data.refreshMs >= 5000) {
          setRefreshMs(data.refreshMs);
          setTempSeconds(Math.round(data.refreshMs / 1000));
          storageHelper.setItem('refreshMs', String(data.refreshMs));
        }
        if (data.viewMode === 'card' || data.viewMode === 'list') {
          applyViewMode(data.viewMode);
        }

        if (isPlainObject(data.holdings)) {
          const mergedHoldings = { ...JSON.parse(localStorage.getItem('holdings') || '{}'), ...data.holdings };
          setHoldings(mergedHoldings);
          storageHelper.setItem('holdings', JSON.stringify(mergedHoldings));
        }

        if (isPlainObject(data.transactions)) {
             const currentTransactions = JSON.parse(localStorage.getItem('transactions') || '{}');
             const mergedTransactions = { ...currentTransactions };
             Object.entries(data.transactions).forEach(([code, txs]) => {
                 if (!Array.isArray(txs)) return;
                 const existing = mergedTransactions[code] || [];
                 const existingIds = new Set(existing.map(t => t.id));
                 const newTxs = txs.filter(t => !existingIds.has(t.id));
                 mergedTransactions[code] = [...existing, ...newTxs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
             });
             setTransactions(mergedTransactions);
             storageHelper.setItem('transactions', JSON.stringify(mergedTransactions));
        }

        if (Array.isArray(data.pendingTrades)) {
          const existingPending = Array.isArray(currentPendingTrades) ? currentPendingTrades : [];
          const incomingPending = data.pendingTrades.filter((trade) => trade && trade.fundCode);
          const fundCodeSet = new Set(mergedFunds.map((f) => f.code));
          const keyOf = (trade) => {
            if (trade?.id) return `id:${trade.id}`;
            return `k:${trade?.fundCode || ''}:${trade?.type || ''}:${trade?.date || ''}:${trade?.share || ''}:${trade?.amount || ''}:${trade?.isAfter3pm ? 1 : 0}`;
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
          storageHelper.setItem('pendingTrades', JSON.stringify(mergedPending));
        }

        if (isPlainObject(data.dcaPlans)) {
          const mergedDca = { ...(isPlainObject(currentDcaPlans) ? currentDcaPlans : {}), ...data.dcaPlans };
          setDcaPlans(mergedDca);
          storageHelper.setItem('dcaPlans', JSON.stringify(mergedDca));
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

  useEffect(() => {
    const isAnyModalOpen =
      settingsOpen ||
      feedbackOpen ||
      addResultOpen ||
      addFundToGroupOpen ||
      groupManageOpen ||
      groupModalOpen ||
      successModal.open ||
      cloudConfigModal.open ||
      logoutConfirmOpen ||
      holdingModal.open ||
      actionModal.open ||
      tradeModal.open ||
      dcaModal.open ||
      !!clearConfirm ||
      donateOpen ||
      !!fundDeleteConfirm ||
      updateModalOpen ||
      weChatOpen ||
      scanModalOpen ||
      scanConfirmModalOpen;

    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [
    settingsOpen,
    feedbackOpen,
    addResultOpen,
    addFundToGroupOpen,
    groupManageOpen,
    groupModalOpen,
    successModal.open,
    cloudConfigModal.open,
    logoutConfirmOpen,
    holdingModal.open,
    actionModal.open,
    tradeModal.open,
    clearConfirm,
    donateOpen,
    fundDeleteConfirm,
    updateModalOpen,
    weChatOpen,
    scanModalOpen,
    scanConfirmModalOpen
  ]);

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape' && settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const getGroupName = () => {
    if (currentTab === 'all') return '全部资产';
    if (currentTab === 'fav') return '自选资产';
    const group = groups.find(g => g.id === currentTab);
    return group ? `${group.name}资产` : '分组资产';
  };

  return (
    <div className="container content">
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
          <span>基估宝</span>
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
                disabled={loading || refreshing}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  pointerEvents: refreshing ? 'none' : 'auto',
                  opacity: refreshing ? 0.6 : 1,
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
                  className="search-dropdown glass"
                >
                  {searchResults.length > 0 ? (
                    <div className="search-results">
                      {searchResults.map((fund) => {
                        const isSelected = selectedFunds.some(f => f.CODE === fund.CODE);
                        const isAlreadyAdded = funds.some(f => f.code === fund.CODE);
                        return (
                          <div
                            key={fund.CODE}
                            className={`search-item ${isSelected ? 'selected' : ''} ${isAlreadyAdded ? 'added' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              if (isAlreadyAdded) return;
                              toggleSelectFund(fund);
                            }}
                          >
                            <div className="fund-info">
                              <span className="fund-name">{fund.NAME}</span>
                              <span className="fund-code muted">#{fund.CODE} | {fund.TYPE}</span>
                            </div>
                            {isAlreadyAdded ? (
                              <span className="added-label">已添加</span>
                            ) : (
                              <div className="checkbox">
                                {isSelected && <div className="checked-mark" />}
                              </div>
                            )}
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
          {hasUpdate && (
            <div
              className="badge"
              title={`发现新版本 ${latestVersion}，点击前往下载`}
              style={{ cursor: 'pointer', borderColor: 'var(--success)', color: 'var(--success)' }}
              onClick={() => setUpdateModalOpen(true)}
            >
              <UpdateIcon width="14" height="14" />
            </div>
          )}
          <Image unoptimized alt="项目Github地址" src={githubImg} style={{ width: '30px', height: '30px', cursor: 'pointer' }} onClick={() => window.open("https://github.com/hzm0321/real-time-fund")} />
          {isMobile && (
            <button
              className="icon-button mobile-search-btn"
              aria-label="搜索基金"
              onClick={handleMobileSearchClick}
              title="搜索"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <div
            className="refresh-btn-wrap"
            style={{ '--progress': refreshProgress }}
            title={`刷新周期 ${Math.round(refreshMs / 1000)} 秒`}
          >
            <button
              className="icon-button"
              aria-label="立即刷新"
              onClick={manualRefresh}
              disabled={refreshing || funds.length === 0}
              aria-busy={refreshing}
              title="立即刷新"
            >
              <RefreshIcon className={refreshing ? 'spin' : ''} width="18" height="18" />
            </button>
          </div>
          {/*<button*/}
          {/*  className="icon-button"*/}
          {/*  aria-label="打开设置"*/}
          {/*  onClick={() => setSettingsOpen(true)}*/}
          {/*  title="设置"*/}
          {/*  hidden*/}
          {/*>*/}
          {/*  <SettingsIcon width="18" height="18" />*/}
          {/*</button>*/}
          {/* 用户菜单 */}
          <div className="user-menu-container" ref={userMenuRef}>
            <button
              className={`icon-button user-menu-trigger ${user ? 'logged-in' : ''}`}
              aria-label={user ? '用户菜单' : '登录'}
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              title={user ? (user.email || '用户') : '用户菜单'}
            >
              {user ? (
                <div className="user-avatar-small">
                  {userAvatar ? (
                    <Image
                      src={userAvatar}
                      alt="用户头像"
                      width={20}
                      height={20}
                      unoptimized
                      style={{ borderRadius: '50%' }}
                    />
                  ) : (
                    (user.email?.charAt(0).toUpperCase() || 'U')
                  )}
                </div>
              ) : (
                <UserIcon width="18" height="18" />
              )}
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  className="user-menu-dropdown glass"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  style={{ transformOrigin: 'top right', top: navbarHeight + (isMobile ? -20 : 10) }}
                >
                  {user ? (
                    <>
                      <div className="user-menu-header">
                        <div className="user-avatar-large">
                          {userAvatar ? (
                            <Image
                              src={userAvatar}
                              alt="用户头像"
                              width={40}
                              height={40}
                              unoptimized
                              style={{ borderRadius: '50%' }}
                            />
                          ) : (
                            (user.email?.charAt(0).toUpperCase() || 'U')
                          )}
                        </div>
                        <div className="user-info">
                          <span className="user-email">{user.email}</span>
                          <span className="user-status">已登录</span>
                          {lastSyncTime && (
                            <span className="muted" style={{ fontSize: '10px', marginTop: 2 }}>
                              同步于 {dayjs(lastSyncTime).format('MM-DD HH:mm')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="user-menu-divider" />
                      <button
                        className="user-menu-item"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setSettingsOpen(true);
                        }}
                      >
                        <SettingsIcon width="16" height="16" />
                        <span>设置</span>
                      </button>
                      <button
                        className="user-menu-item danger"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setLogoutConfirmOpen(true);
                        }}
                      >
                        <LogoutIcon width="16" height="16" />
                        <span>登出</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="user-menu-item"
                        onClick={handleOpenLogin}
                      >
                        <LoginIcon width="16" height="16" />
                        <span>登录</span>
                      </button>
                      <button
                        className="user-menu-item"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setSettingsOpen(true);
                        }}
                      >
                        <SettingsIcon width="16" height="16" />
                        <span>设置</span>
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="col-12">
          <div ref={filterBarRef} className="filter-bar" style={{ top: isMobile ? undefined : navbarHeight , marginTop: navbarHeight, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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

            <div className="sort-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                <span className="muted" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <SortIcon width="14" height="14" />
                  排序
                </span>
                <div className="chips">
                  {[
                    { id: 'default', label: '默认' },
                    { id: 'yield', label: '涨跌幅' },
                    { id: 'holding', label: '持有收益' },
                    { id: 'name', label: '名称' },
                  ].map((s) => (
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
                      <span>{s.label}</span>
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
              </div>
            </div>
          </div>

          {displayFunds.length === 0 ? (
            <div className="glass card empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: 16, opacity: 0.5 }}>📂</div>
              <div className="muted" style={{ marginBottom: 20 }}>{funds.length === 0 ? '尚未添加基金' : '该分组下暂无数据'}</div>
              {currentTab !== 'all' && currentTab !== 'fav' && funds.length > 0 && (
                <button className="button" onClick={() => setAddFundToGroupOpen(true)}>
                  添加基金到此分组
                </button>
              )}
            </div>
          ) : (
            <>
              <GroupSummary
                  funds={displayFunds}
                  holdings={holdings}
                  groupName={getGroupName()}
                  getProfit={getHoldingProfit}
                  stickyTop={navbarHeight + filterBarHeight + (isMobile ? -14 : 0)}
                />

              {currentTab !== 'all' && currentTab !== 'fav' && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="button-dashed"
                  onClick={() => setAddFundToGroupOpen(true)}
                  style={{
                    width: '100%',
                    height: '48px',
                    border: '2px dashed rgba(255,255,255,0.1)',
                    background: 'transparent',
                    borderRadius: '12px',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '16px',
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
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.color = 'var(--muted)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <PlusIcon width="18" height="18" />
                  <span>添加基金到此分组</span>
                </motion.button>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={viewMode}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={viewMode === 'card' ? 'grid' : 'table-container glass'}
                >
                  <div className={viewMode === 'card' ? 'grid col-12' : ''} style={viewMode === 'card' ? { gridColumn: 'span 12', gap: 16 } : {}}>
                    {/* PC 列表：使用 PcFundTable + 右侧冻结操作列 */}
                    {viewMode === 'list' && !isMobile && (
                        <div className="table-pc-wrap">
                          <div className="table-scroll-area">
                            <div className="table-scroll-area-inner">
                              <PcFundTable
                                data={pcFundTableData}
                                refreshing={refreshing}
                                currentTab={currentTab}
                                favorites={favorites}
                                onRemoveFund={(row) => {
                                  if (refreshing) return;
                                  if (!row || !row.code) return;
                                  requestRemoveFund({ code: row.code, name: row.fundName });
                                }}
                                onToggleFavorite={(row) => {
                                  if (!row || !row.code) return;
                                  toggleFavorite(row.code);
                                }}
                                onRemoveFromGroup={(row) => {
                                  if (!row || !row.code) return;
                                  removeFundFromCurrentGroup(row.code);
                                }}
                                onHoldingAmountClick={(row, meta) => {
                                  if (!row || !row.code) return;
                                  const fund = row.rawFund || { code: row.code, name: row.fundName };
                                  if (meta?.hasHolding) {
                                    setActionModal({ open: true, fund });
                                  } else {
                                    setHoldingModal({ open: true, fund });
                                  }
                                }}
                                onHoldingProfitClick={(row) => {
                                  if (!row || !row.code) return;
                                  if (row.holdingProfitValue == null) return;
                                  setPercentModes(prev => ({ ...prev, [row.code]: !prev[row.code] }));
                                }}
                              />
                            </div>
                          </div>
                        </div>
                    )}
                    {viewMode === 'list' && isMobile && (
                      <div className="table-header-row">
                        <div className="table-header-cell">基金名称</div>
                        <div className="table-header-cell text-right">净值/估值</div>
                        <div className="table-header-cell text-right">涨跌幅</div>
                        <div className="table-header-cell text-right">估值时间</div>
                        <div className="table-header-cell text-right">持仓金额</div>
                        <div className="table-header-cell text-right">当日收益</div>
                        <div className="table-header-cell text-right">持有收益</div>
                        <div className="table-header-cell text-center">操作</div>
                      </div>
                    )}
                    <AnimatePresence mode="popLayout">
                      {displayFunds.map((f) =>
                        (viewMode === 'list' && !isMobile) ? null : (
                        <motion.div
                          layout="position"
                          key={f.code}
                          className={viewMode === 'card' ? 'col-6' : 'table-row-wrapper'}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          style={{ position: 'relative', overflow: 'hidden' }}
                        >
                          {viewMode === 'list' && isMobile && (
                            <div
                              className="swipe-action-bg"
                              onClick={(e) => {
                                e.stopPropagation(); // 阻止冒泡，防止触发全局收起导致状态混乱
                                if (refreshing) return;
                                requestRemoveFund(f);
                              }}
                              style={{ pointerEvents: refreshing ? 'none' : 'auto', opacity: refreshing ? 0.6 : 1 }}
                            >
                              <TrashIcon width="18" height="18" />
                              <span>删除</span>
                            </div>
                          )}
                          <motion.div
                            className={viewMode === 'card' ? 'glass card' : 'table-row'}
                            drag={viewMode === 'list' && isMobile ? "x" : false}
                            dragConstraints={{ left: -80, right: 0 }}
                            dragElastic={0.1}
                            // 增加 dragDirectionLock 确保在垂直滚动时不会轻易触发水平拖拽
                            dragDirectionLock={true}
                            // 调整触发阈值，只有明显的水平拖拽意图才响应
                            onDragStart={(event, info) => {
                              // 如果水平移动距离小于垂直移动距离，或者水平速度很小，视为垂直滚动意图，不进行拖拽处理
                              // framer-motion 的 dragDirectionLock 已经处理了大部分情况，但可以进一步微调体验
                            }}
                            // 如果当前行不是被选中的行，强制回到原点 (x: 0)
                            animate={viewMode === 'list' && isMobile ? { x: swipedFundCode === f.code ? -80 : 0 } : undefined}
                            onDragEnd={(e, { offset, velocity }) => {
                              if (viewMode === 'list' && isMobile) {
                                if (offset.x < -40) {
                                  setSwipedFundCode(f.code);
                                } else {
                                  setSwipedFundCode(null);
                                }
                              }
                            }}
                            onClick={(e) => {
                              // 阻止事件冒泡，避免触发全局的 click listener 导致立刻被收起
                              // 只有在已经展开的情况下点击自身才需要阻止冒泡（或者根据需求调整）
                              // 这里我们希望：点击任何地方都收起。
                              // 如果点击的是当前行，且不是拖拽操作，上面的全局 listener 会处理收起。
                              // 但为了防止点击行内容触发收起后又立即触发行的其他点击逻辑（如果有的话），
                              // 可以在这里处理。不过当前需求是“点击其他区域收起”，
                              // 实际上全局 listener 已经覆盖了“点击任何区域（包括其他行）收起”。
                              // 唯一的问题是：点击当前行的“删除按钮”时，会先触发全局 click 导致收起，然后触发删除吗？
                              // 删除按钮在底层，通常不会受影响，因为 React 事件和原生事件的顺序。
                              // 但为了保险，删除按钮的 onClick 应该阻止冒泡。

                              // 如果当前行已展开，点击行内容（非删除按钮）应该收起
                              if (viewMode === 'list' && isMobile && swipedFundCode === f.code) {
                                e.stopPropagation(); // 阻止冒泡，自己处理收起，避免触发全局再次处理
                                setSwipedFundCode(null);
                              }
                            }}
                            style={{
                              background: viewMode === 'list' ? 'var(--bg)' : undefined,
                              position: 'relative',
                              zIndex: 1
                            }}
                          >
                            {viewMode === 'list' ? (
                              <>
                                <div className="table-cell name-cell">
                                  {currentTab !== 'all' && currentTab !== 'fav' ? (
                                    <button
                                      className="icon-button fav-button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeFundFromCurrentGroup(f.code);
                                      }}
                                      title="从当前分组移除"
                                    >
                                      <ExitIcon width="18" height="18" style={{ transform: 'rotate(180deg)' }} />
                                    </button>
                                  ) : (
                                    <button
                                      className={`icon-button fav-button ${favorites.has(f.code) ? 'active' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(f.code);
                                      }}
                                      title={favorites.has(f.code) ? "取消自选" : "添加自选"}
                                    >
                                      <StarIcon width="18" height="18" filled={favorites.has(f.code)} />
                                    </button>
                                  )}
                                  <div className="title-text">
                                    <span
                                      className={`name-text ${f.jzrq === todayStr ? 'updated' : ''}`}
                                      title={f.jzrq === todayStr ? "今日净值已更新" : ""}
                                    >
                                      {f.name}
                                    </span>
                                    <span className="muted code-text">#{f.code}</span>
                                  </div>
                                </div>
                                {(() => {
                                  const hasTodayData = f.jzrq === todayStr;
                                  const shouldHideChange = isTradingDay && !hasTodayData;

                                  if (!shouldHideChange) {
                                    // 如果涨跌幅列显示（即非交易时段或今日净值已更新），则显示单位净值和真实涨跌幅
                                    return (
                                      <>
                                        <div className="table-cell text-right value-cell">
                                          <span style={{ fontWeight: 700 }}>{f.dwjz ?? '—'}</span>
                                        </div>
                                        <div className="table-cell text-right change-cell">
                                          <span className={f.zzl > 0 ? 'up' : f.zzl < 0 ? 'down' : ''} style={{ fontWeight: 700 }}>
                                            {f.zzl !== undefined ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : ''}
                                          </span>
                                        </div>
                                      </>
                                    );
                                  } else {
                                    // 否则显示估值净值和估值涨跌幅
                                    // 如果是无估值数据的基金，直接显示净值数据
                                    if (f.noValuation) {
                                      return (
                                        <>
                                          <div className="table-cell text-right value-cell">
                                            <span style={{ fontWeight: 700 }}>{f.dwjz ?? '—'}</span>
                                          </div>
                                          <div className="table-cell text-right change-cell">
                                            <span className={f.zzl > 0 ? 'up' : f.zzl < 0 ? 'down' : ''} style={{ fontWeight: 700 }}>
                                              {f.zzl !== undefined && f.zzl !== null ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : '—'}
                                            </span>
                                          </div>
                                        </>
                                      );
                                    }
                                    return (
                                      <>
                                        <div className="table-cell text-right value-cell">
                                          <span style={{ fontWeight: 700 }}>{f.estPricedCoverage > 0.05 ? f.estGsz.toFixed(4) : (f.gsz ?? '—')}</span>
                                        </div>
                                        <div className="table-cell text-right change-cell">
                                          <span className={f.estPricedCoverage > 0.05 ? (f.estGszzl > 0 ? 'up' : f.estGszzl < 0 ? 'down' : '') : (Number(f.gszzl) > 0 ? 'up' : Number(f.gszzl) < 0 ? 'down' : '')} style={{ fontWeight: 700 }}>
                                            {f.estPricedCoverage > 0.05 ? `${f.estGszzl > 0 ? '+' : ''}${f.estGszzl.toFixed(2)}%` : (isNumber(f.gszzl) ? `${f.gszzl > 0 ? '+' : ''}${f.gszzl.toFixed(2)}%` : f.gszzl ?? '—')}
                                          </span>
                                        </div>
                                      </>
                                    );
                                  }
                                })()}
                                <div className="table-cell text-right time-cell">
                                  <span className="muted" style={{ fontSize: '12px' }}>{f.noValuation ? (f.jzrq || '-') : (f.gztime || f.time || '-')}</span>
                                </div>
                                {!isMobile && (() => {
                                  const holding = holdings[f.code];
                                  const profit = getHoldingProfit(f, holding);
                                  const amount = profit ? profit.amount : null;
                                  if (amount === null) {
                                    return (
                                      <div
                                        className="table-cell text-right holding-amount-cell"
                                        title="设置持仓"
                                        onClick={(e) => { e.stopPropagation(); setHoldingModal({ open: true, fund: f }); }}
                                      >
                                        <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '12px', cursor: 'pointer' }}>
                                          未设置 <SettingsIcon width="12" height="12" />
                                        </span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div
                                      className="table-cell text-right holding-amount-cell"
                                      title="点击设置持仓"
                                      onClick={(e) => { e.stopPropagation(); setActionModal({ open: true, fund: f }); }}
                                    >
                                      <span style={{ fontWeight: 700, marginRight: 6 }}>¥{amount.toFixed(2)}</span>
                                      <button
                                        className="icon-button"
                                        onClick={(e) => { e.stopPropagation(); setActionModal({ open: true, fund: f }); }}
                                        title="编辑持仓"
                                        style={{ border: 'none', width: '28px', height: '28px', marginLeft: -6 }}
                                      >
                                        <SettingsIcon width="14" height="14" />
                                      </button>
                                    </div>
                                  );
                                })()}
                                {(() => {
                                  const holding = holdings[f.code];
                                  const profit = getHoldingProfit(f, holding);
                                  const profitValue = profit ? profit.profitToday : null;
                                  const hasProfit = profitValue !== null;

                                  return (
                                    <div className="table-cell text-right profit-cell">
                                      <span
                                        className={hasProfit ? (profitValue > 0 ? 'up' : profitValue < 0 ? 'down' : '') : 'muted'}
                                        style={{ fontWeight: 700 }}
                                      >
                                        {hasProfit
                                          ? `${profitValue > 0 ? '+' : profitValue < 0 ? '-' : ''}¥${Math.abs(profitValue).toFixed(2)}`
                                          : ''}
                                      </span>
                                    </div>
                                  );
                                })()}
                                {!isMobile && (() => {
                                  const holding = holdings[f.code];
                                  const profit = getHoldingProfit(f, holding);
                                  const total = profit ? profit.profitTotal : null;
                                  const principal = holding && holding.cost && holding.share ? holding.cost * holding.share : 0;
                                  const asPercent = percentModes[f.code];
                                  const hasTotal = total !== null;
                                  const formatted = hasTotal
                                    ? (asPercent && principal > 0
                                      ? `${total > 0 ? '+' : total < 0 ? '-' : ''}${Math.abs((total / principal) * 100).toFixed(2)}%`
                                      : `${total > 0 ? '+' : total < 0 ? '-' : ''}¥${Math.abs(total).toFixed(2)}`)
                                    : '';
                                  const cls = hasTotal ? (total > 0 ? 'up' : total < 0 ? 'down' : '') : 'muted';
                                  return (
                                    <div
                                      className="table-cell text-right holding-cell"
                                      title="点击切换金额/百分比"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (hasTotal) {
                                          setPercentModes(prev => ({ ...prev, [f.code]: !prev[f.code] }));
                                        }
                                      }}
                                      style={{ cursor: hasTotal ? 'pointer' : 'default' }}
                                    >
                                      <span className={cls} style={{ fontWeight: 700 }}>{formatted}</span>
                                    </div>
                                  );
                                })()}
                                <div className="table-cell text-center action-cell" style={{ gap: 4 }}>
                                  <button
                                    className="icon-button danger"
                                    onClick={() => !refreshing && requestRemoveFund(f)}
                                    title="删除"
                                    disabled={refreshing}
                                    style={{ width: '28px', height: '28px', opacity: refreshing ? 0.6 : 1, cursor: refreshing ? 'not-allowed' : 'pointer' }}
                                  >
                                    <TrashIcon width="14" height="14" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="row" style={{ marginBottom: 10 }}>
                                  <div className="title">
                                    {currentTab !== 'all' && currentTab !== 'fav' ? (
                                      <button
                                        className="icon-button fav-button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFundFromCurrentGroup(f.code);
                                        }}
                                        title="从当前分组移除"
                                      >
                                        <ExitIcon width="18" height="18" style={{ transform: 'rotate(180deg)' }} />
                                      </button>
                                    ) : (
                                      <button
                                        className={`icon-button fav-button ${favorites.has(f.code) ? 'active' : ''}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleFavorite(f.code);
                                        }}
                                        title={favorites.has(f.code) ? "取消自选" : "添加自选"}
                                      >
                                        <StarIcon width="18" height="18" filled={favorites.has(f.code)} />
                                      </button>
                                    )}
                                    <div className="title-text">
                                      <span
                                        className={`name-text ${f.jzrq === todayStr ? 'updated' : ''}`}
                                        title={f.jzrq === todayStr ? "今日净值已更新" : ""}
                                      >
                                        {f.name}
                                      </span>
                                      <span className="muted">#{f.code}</span>
                                    </div>
                                  </div>

                                  <div className="actions">
                                    <div className="badge-v">
                                      <span>{f.noValuation ? '净值日期' : '估值时间'}</span>
                                      <strong>{f.noValuation ? (f.jzrq || '-') : (f.gztime || f.time || '-')}</strong>
                                    </div>
                                    <div className="row" style={{ gap: 4 }}>
                                      <button
                                        className="icon-button danger"
                                        onClick={() => !refreshing && requestRemoveFund(f)}
                                        title="删除"
                                        disabled={refreshing}
                                        style={{ width: '28px', height: '28px', opacity: refreshing ? 0.6 : 1, cursor: refreshing ? 'not-allowed' : 'pointer' }}
                                      >
                                        <TrashIcon width="14" height="14" />
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="row" style={{ marginBottom: 12 }}>
                                  <Stat label="单位净值" value={f.dwjz ?? '—'} />
                                  {f.noValuation ? (
                                    // 无估值数据的基金，直接显示净值涨跌幅，不显示估值相关字段
                                    <Stat
                                      label="涨跌幅"
                                      value={f.zzl !== undefined && f.zzl !== null ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : '—'}
                                      delta={f.zzl}
                                    />
                                  ) : (
                                    <>
                                      {(() => {
                                        const hasTodayData = f.jzrq === todayStr;
                                        let isYesterdayChange = false;
                                        let isPreviousTradingDay = false;
                                        if (!hasTodayData && isString(f.jzrq)) {
                                          const today = toTz(todayStr).startOf('day');
                                          const jzDate = toTz(f.jzrq).startOf('day');
                                          const yesterday = today.clone().subtract(1, 'day');
                                          if (jzDate.isSame(yesterday, 'day')) {
                                            isYesterdayChange = true;
                                          } else if (jzDate.isBefore(yesterday, 'day')) {
                                            isPreviousTradingDay = true;
                                          }
                                        }
                                        const shouldHideChange = isTradingDay && !hasTodayData && !isYesterdayChange && !isPreviousTradingDay;

                                        if (shouldHideChange) return null;

                                        const changeLabel = hasTodayData ? '涨跌幅' : (isYesterdayChange ? '昨日涨跌幅' : (isPreviousTradingDay ? '上一交易日涨跌幅' : '涨跌幅'));
                                        return (
                                          <Stat
                                            label={changeLabel}
                                            value={f.zzl !== undefined ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : ''}
                                            delta={f.zzl}
                                          />
                                        );
                                      })()}
                                      <Stat label="估值净值" value={f.estPricedCoverage > 0.05 ? f.estGsz.toFixed(4) : (f.gsz ?? '—')} />
                                      <Stat
                                        label="估值涨跌幅"
                                        value={f.estPricedCoverage > 0.05 ? `${f.estGszzl > 0 ? '+' : ''}${f.estGszzl.toFixed(2)}%` : (isNumber(f.gszzl) ? `${f.gszzl > 0 ? '+' : ''}${f.gszzl.toFixed(2)}%` : f.gszzl ?? '—')}
                                        delta={f.estPricedCoverage > 0.05 ? f.estGszzl : (Number(f.gszzl) || 0)}
                                      />
                                    </>
                                  )}
                                </div>

                                <div className="row" style={{ marginBottom: 12 }}>
                                  {(() => {
                                    const holding = holdings[f.code];
                                    const profit = getHoldingProfit(f, holding);

                                    if (!profit) {
                                      return (
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                                          <span className="label">持仓金额</span>
                                          <div
                                            className="value muted"
                                            style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                            onClick={() => setHoldingModal({ open: true, fund: f })}
                                          >
                                            未设置 <SettingsIcon width="12" height="12" />
                                          </div>
                                        </div>
                                      );
                                    }

                                    return (
                                      <>
                                        <div
                                          className="stat"
                                          style={{ cursor: 'pointer', flexDirection: 'column', gap: 4 }}
                                          onClick={() => setActionModal({ open: true, fund: f })}
                                        >
                                          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            持仓金额 <SettingsIcon width="12" height="12" style={{ opacity: 0.7 }} />
                                          </span>
                                          <span className="value">¥{profit.amount.toFixed(2)}</span>
                                        </div>
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                                          <span className="label">当日收益</span>
                                          <span className={`value ${profit.profitToday != null ? (profit.profitToday > 0 ? 'up' : profit.profitToday < 0 ? 'down' : '') : 'muted'}`}>
                                            {profit.profitToday != null
                                              ? `${profit.profitToday > 0 ? '+' : profit.profitToday < 0 ? '-' : ''}¥${Math.abs(profit.profitToday).toFixed(2)}`
                                              : '--'}
                                          </span>
                                        </div>
                                        {profit.profitTotal !== null && (
                                          <div
                                            className="stat"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPercentModes(prev => ({ ...prev, [f.code]: !prev[f.code] }));
                                            }}
                                            style={{ cursor: 'pointer', flexDirection: 'column', gap: 4 }}
                                            title="点击切换金额/百分比"
                                          >
                                            <span className="label">持有收益{percentModes[f.code] ? '(%)' : ''}</span>
                                            <span className={`value ${profit.profitTotal > 0 ? 'up' : profit.profitTotal < 0 ? 'down' : ''}`}>
                                              {profit.profitTotal > 0 ? '+' : profit.profitTotal < 0 ? '-' : ''}
                                              {percentModes[f.code]
                                                ? `${Math.abs((holding.cost * holding.share) ? (profit.profitTotal / (holding.cost * holding.share)) * 100 : 0).toFixed(2)}%`
                                                : `¥${Math.abs(profit.profitTotal).toFixed(2)}`
                                              }
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>

                                {f.estPricedCoverage > 0.05 && (
                                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: -8, marginBottom: 10, textAlign: 'right' }}>
                                    基于 {Math.round(f.estPricedCoverage * 100)}% 持仓估算
                                  </div>
                                )}
                                {Array.isArray(valuationSeries[f.code]) && valuationSeries[f.code].length >= 2 && (
                                  <FundIntradayChart
                                    series={valuationSeries[f.code]}
                                    referenceNav={f.dwjz != null ? Number(f.dwjz) : undefined}
                                  />
                                )}
                                <div
                                  style={{ marginBottom: 8, cursor: 'pointer', userSelect: 'none' }}
                                  className="title"
                                  onClick={() => toggleCollapse(f.code)}
                                >
                                  <div className="row" style={{ width: '100%', flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span>前10重仓股票</span>
                                      <ChevronIcon
                                        width="16"
                                        height="16"
                                        className="muted"
                                        style={{
                                          transform: collapsedCodes.has(f.code) ? 'rotate(-90deg)' : 'rotate(0deg)',
                                          transition: 'transform 0.2s ease'
                                        }}
                                      />
                                    </div>
                                    <span className="muted">涨跌幅 / 占比</span>
                                  </div>
                                </div>
                                <AnimatePresence>
                                  {!collapsedCodes.has(f.code) && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                                      style={{ overflow: 'hidden' }}
                                    >
                                      {Array.isArray(f.holdings) && f.holdings.length ? (
                                        <div className="list">
                                          {f.holdings.map((h, idx) => (
                                            <div className="item" key={idx}>
                                              <span className="name">{h.name}</span>
                                              <div className="values">
                                                {isNumber(h.change) && (
                                                  <span className={`badge ${h.change > 0 ? 'up' : h.change < 0 ? 'down' : ''}`} style={{ marginRight: 8 }}>
                                                    {h.change > 0 ? '+' : ''}{h.change.toFixed(2)}%
                                                  </span>
                                                )}
                                                <span className="weight">{h.weight}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="muted" style={{ padding: '8px 0' }}>暂无重仓数据</div>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                                <FundTrendChart
                                  code={f.code}
                                  isExpanded={!collapsedTrends.has(f.code)}
                                  onToggleExpand={() => toggleTrendCollapse(f.code)}
                                  transactions={transactions[f.code] || []}
                                />
                              </>
                            )}
                          </motion.div>
                        </motion.div>
                        )
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {fundDeleteConfirm && (
          <ConfirmModal
            title="删除确认"
            message={`基金 "${fundDeleteConfirm.name}" 存在持仓记录。删除后将移除该基金及其持仓数据，是否继续？`}
            confirmText="确定删除"
            onConfirm={() => {
              removeFund(fundDeleteConfirm.code);
              setFundDeleteConfirm(null);
            }}
            onCancel={() => setFundDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {logoutConfirmOpen && (
          <ConfirmModal
            title="确认登出"
            message="确定要退出当前账号吗？"
            confirmText="确认登出"
            onConfirm={() => {
              setLogoutConfirmOpen(false);
              handleLogout();
            }}
            onCancel={() => setLogoutConfirmOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="footer">
        <p style={{ marginBottom: 8 }}>数据源：实时估值与重仓直连东方财富，仅供个人学习及参考使用。数据可能存在延迟，不作为任何投资建议</p>
        <p style={{ marginBottom: 12 }}>注：估算数据与真实结算数据会有1%左右误差，非股票型基金误差较大</p>
        <div style={{ marginTop: 12, opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <p style={{ margin: 0 }}>
            遇到任何问题或需求建议可
            <button
              className="link-button"
              onClick={() => {
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
      </div>

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
      <AnimatePresence>
        {weChatOpen && (
            <WeChatModal onClose={() => setWeChatOpen(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {addResultOpen && (
          <AddResultModal
            failures={addFailures}
            onClose={() => setAddResultOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addFundToGroupOpen && (
          <AddFundToGroupModal
            allFunds={funds}
            currentGroupCodes={groups.find(g => g.id === currentTab)?.codes || []}
            onClose={() => setAddFundToGroupOpen(false)}
            onAdd={handleAddFundsToGroup}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionModal.open && (
          <HoldingActionModal
            fund={actionModal.fund}
            onClose={() => setActionModal({ open: false, fund: null })}
            onAction={(type) => handleAction(type, actionModal.fund)}
            hasHistory={!!transactions[actionModal.fund?.code]?.length}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tradeModal.open && (
          <TradeModal
            type={tradeModal.type}
            fund={tradeModal.fund}
            holding={holdings[tradeModal.fund?.code]}
            onClose={() => setTradeModal({ open: false, fund: null, type: 'buy' })}
            onConfirm={(data) => handleTrade(tradeModal.fund, data)}
            pendingTrades={pendingTrades}
            onDeletePending={(id) => {
                setPendingTrades(prev => {
                    const next = prev.filter(t => t.id !== id);
                    storageHelper.setItem('pendingTrades', JSON.stringify(next));
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
            plan={dcaPlans[dcaModal.fund?.code]}
            onClose={() => setDcaModal({ open: false, fund: null })}
            onConfirm={(config) => {
              const code = config?.fundCode || dcaModal.fund?.code;
              if (!code) {
                setDcaModal({ open: false, fund: null });
                return;
              }
              setDcaPlans(prev => {
                const next = { ...(prev || {}) };
                next[code] = {
                  amount: config.amount,
                  feeRate: config.feeRate,
                  cycle: config.cycle,
                  firstDate: config.firstDate,
                  weeklyDay: config.weeklyDay ?? null,
                  monthlyDay: config.monthlyDay ?? null,
                  enabled: config.enabled !== false
                };
                storageHelper.setItem('dcaPlans', JSON.stringify(next));
                return next;
              });
              setDcaModal({ open: false, fund: null });
              showToast('已保存定投计划', 'success');
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
            transactions={transactions[historyModal.fund?.code] || []}
            pendingTransactions={pendingTrades.filter(t => t.fundCode === historyModal.fund?.code)}
            onClose={() => setHistoryModal({ open: false, fund: null })}
            onDeleteTransaction={(id) => handleDeleteTransaction(historyModal.fund?.code, id)}
            onAddHistory={() => setAddHistoryModal({ open: true, fund: historyModal.fund })}
            onDeletePending={(id) => {
                setPendingTrades(prev => {
                    const next = prev.filter(t => t.id !== id);
                    storageHelper.setItem('pendingTrades', JSON.stringify(next));
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
            holding={holdings[holdingModal.fund?.code]}
            onClose={() => setHoldingModal({ open: false, fund: null })}
            onSave={(data) => handleSaveHolding(holdingModal.fund?.code, data)}
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
        />
      )}

      {/* 更新提示弹窗 */}
      <AnimatePresence>
        {updateModalOpen && (
          <UpdatePromptModal
            updateContent={updateContent}
            onClose={() => setUpdateModalOpen(false)}
            onRefresh={() => window.location.reload()}
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
      {loginModalOpen && (
        <LoginModal
          onClose={() => {
            setLoginModalOpen(false);
            setLoginError('');
            setLoginSuccess('');
            setLoginEmail('');
            setLoginOtp('');
          }}
          loginEmail={loginEmail}
          setLoginEmail={setLoginEmail}
          loginOtp={loginOtp}
          setLoginOtp={setLoginOtp}
          loginLoading={loginLoading}
          loginError={loginError}
          loginSuccess={loginSuccess}
          handleSendOtp={handleSendOtp}
          handleVerifyEmailOtp={handleVerifyEmailOtp}
        />
      )}

      {/* 全局轻提示 Toast */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            style={{
              position: 'fixed',
              top: 24,
              left: '50%',
              zIndex: 9999,
              padding: '10px 20px',
              background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.9)' :
                          toast.type === 'success' ? 'rgba(34, 197, 94, 0.9)' :
                          'rgba(30, 41, 59, 0.9)',
              color: '#fff',
              borderRadius: '8px',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              maxWidth: '90vw',
              whiteSpace: 'nowrap'
            }}
          >
            {toast.type === 'error' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
            {toast.type === 'success' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
