'use client';

import { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { createAvatar } from '@dicebear/core';
import { glass } from '@dicebear/collection';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Announcement from "./components/Announcement";
import { DatePicker, DonateTabs, NumericInput, Stat } from "./components/Common";
import FundTrendChart from "./components/FundTrendChart";
import { ChevronIcon, CloseIcon, CloudIcon, DragIcon, ExitIcon, EyeIcon, EyeOffIcon, GridIcon, ListIcon, LoginIcon, LogoutIcon, MailIcon, PinIcon, PinOffIcon, PlusIcon, RefreshIcon, SettingsIcon, SortIcon, StarIcon, TrashIcon, UpdateIcon, UserIcon } from "./components/Icons";
import weChatGroupImg from "./assets/weChatGroup.png";
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { fetchFundData, fetchLatestRelease, fetchShanghaiIndexDate, fetchSmartFundNetValue, searchFunds, submitFeedback } from './api/fund';
import packageJson from '../package.json';

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

function FeedbackModal({ onClose, user, onOpenWeChat }) {
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const formData = new FormData(e.target);
    const nickname = formData.get("nickname")?.trim();
    if (!nickname) {
      formData.set("nickname", "匿名");
    }

    // Web3Forms Access Key
    formData.append("access_key", process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY || '');
    formData.append("subject", "基估宝 - 用户反馈");

    try {
      const data = await submitFeedback(formData);
      if (data.success) {
        setSucceeded(true);
      } else {
        setError(data.message || "提交失败，请稍后再试");
      }
    } catch (err) {
      setError("网络错误，请检查您的连接");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="意见反馈"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal feedback-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>意见反馈</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        {succeeded ? (
          <div className="success-message" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: 16 }}>🎉</div>
            <h3 style={{ marginBottom: 8 }}>感谢您的反馈！</h3>
            <p className="muted">我们已收到您的建议，会尽快查看。</p>
            <button className="button" onClick={onClose} style={{ marginTop: 24, width: '100%' }}>
              关闭
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="feedback-form">
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label htmlFor="nickname" className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                您的昵称（可选）
              </label>
              <input
                id="nickname"
                type="text"
                name="nickname"
                className="input"
                placeholder="匿名"
                style={{ width: '100%' }}
              />
            </div>
            <input type="hidden" name="email" value={user?.email || ''} />
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label htmlFor="message" className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                反馈内容
              </label>
              <textarea
                id="message"
                name="message"
                className="input"
                required
                placeholder="请描述您遇到的问题或建议..."
                style={{ width: '100%', minHeight: '120px', padding: '12px', resize: 'vertical' }}
              />
            </div>
            {error && (
              <div className="error-text" style={{ marginBottom: 16, textAlign: 'center' }}>
                {error}
              </div>
            )}

            <button className="button" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? '发送中...' : '提交反馈'}
            </button>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <p className="muted" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                如果您有 Github 账号，也可以在本项目
                <a
                  href="https://github.com/hzm0321/real-time-fund/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-button"
                  style={{ color: 'var(--primary)', textDecoration: 'underline', padding: '0 4px', fontWeight: 600 }}
                >
                  Issues
                </a>
                区留言互动
              </p>
              <p className="muted" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                或加入我们的
                <a
                  className="link-button"
                  style={{ color: 'var(--primary)', textDecoration: 'underline', padding: '0 4px', fontWeight: 600, cursor: 'pointer' }}
                  onClick={onOpenWeChat}
                >
                  微信用户交流群
                </a>
              </p>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

function WeChatModal({ onClose }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="微信用户交流群"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ zIndex: 10002 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '360px', padding: '24px' }}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>💬 微信用户交流群</span>
            </div>
            <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
                <CloseIcon width="20" height="20" />
            </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={weChatGroupImg.src} alt="WeChat Group" style={{ maxWidth: '100%', borderRadius: '8px' }} />
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: '14px' }}>
            扫码加入群聊，获取最新更新与交流
        </p>
      </motion.div>
    </motion.div>
  );
}

function HoldingActionModal({ fund, onClose, onAction }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="持仓操作"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '320px' }}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>持仓操作</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>{fund?.name}</div>
          <div className="muted" style={{ fontSize: '12px' }}>#{fund?.code}</div>
        </div>

        <div className="grid" style={{ gap: 12 }}>
          <button className="button col-6" onClick={() => onAction('buy')} style={{ background: 'rgba(34, 211, 238, 0.1)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
            加仓
          </button>
          <button className="button col-6" onClick={() => onAction('sell')} style={{ background: 'rgba(248, 113, 113, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
            减仓
          </button>
          <button className="button col-12" onClick={() => onAction('edit')} style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>
            编辑持仓
          </button>
          <button
            className="button col-12"
            onClick={() => onAction('clear')}
            style={{
              marginTop: 8,
              background: 'linear-gradient(180deg, #ef4444, #f87171)',
              border: 'none',
              color: '#2b0b0b',
              fontWeight: 600
            }}
          >
            清空持仓
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TradeModal({ type, fund, holding, onClose, onConfirm, pendingTrades = [], onDeletePending }) {
  const isBuy = type === 'buy';
  const [share, setShare] = useState('');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState('0');
  const [date, setDate] = useState(() => {
    return formatDate();
  });
  const [isAfter3pm, setIsAfter3pm] = useState(nowInTz().hour() >= 15);
  const [calcShare, setCalcShare] = useState(null);

  const currentPendingTrades = useMemo(() => {
    return pendingTrades.filter(t => t.fundCode === fund?.code);
  }, [pendingTrades, fund]);

  const pendingSellShare = useMemo(() => {
      return currentPendingTrades
          .filter(t => t.type === 'sell')
          .reduce((acc, curr) => acc + (Number(curr.share) || 0), 0);
  }, [currentPendingTrades]);

  const availableShare = holding ? Math.max(0, holding.share - pendingSellShare) : 0;

  const [showPendingList, setShowPendingList] = useState(false);

  // Auto-close pending list if empty
  useEffect(() => {
      if (showPendingList && currentPendingTrades.length === 0) {
          setShowPendingList(false);
      }
  }, [showPendingList, currentPendingTrades]);

  const getEstimatePrice = () => fund?.estPricedCoverage > 0.05 ? fund?.estGsz : (typeof fund?.gsz === 'number' ? fund?.gsz : Number(fund?.dwjz));
  const [price, setPrice] = useState(getEstimatePrice());
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [actualDate, setActualDate] = useState(null);

  useEffect(() => {
    if (date && fund?.code) {
        setLoadingPrice(true);
        setActualDate(null);

        let queryDate = date;
        if (isAfter3pm) {
            queryDate = toTz(date).add(1, 'day').format('YYYY-MM-DD');
        }

        fetchSmartFundNetValue(fund.code, queryDate).then(result => {
            if (result) {
                setPrice(result.value);
                setActualDate(result.date);
            } else {
                setPrice(0);
                setActualDate(null);
            }
        }).finally(() => setLoadingPrice(false));
    }
  }, [date, isAfter3pm, isBuy, fund]);

  const [feeMode, setFeeMode] = useState('rate'); // 'rate' | 'amount'
  const [feeValue, setFeeValue] = useState('0'); // Stores either rate or amount depending on mode
  const [showConfirm, setShowConfirm] = useState(false);

  // Sell logic calculations
  const sellShare = parseFloat(share) || 0;
  const sellPrice = parseFloat(price) || 0;
  const sellAmount = sellShare * sellPrice;

  // Calculate fee and return based on mode
  let sellFee = 0;
  if (feeMode === 'rate') {
    const rate = parseFloat(feeValue) || 0;
    sellFee = sellAmount * (rate / 100);
  } else {
    sellFee = parseFloat(feeValue) || 0;
  }

  const estimatedReturn = sellAmount - sellFee;

  useEffect(() => {
    if (!isBuy) return;
    const a = parseFloat(amount);
    const f = parseFloat(feeRate);
    const p = parseFloat(price);
    if (a > 0 && !isNaN(f)) {
        if (p > 0) {
            const netAmount = a / (1 + f / 100);
            const s = netAmount / p;
            setCalcShare(s.toFixed(2));
        } else {
            setCalcShare('待确认');
        }
    } else {
      setCalcShare(null);
    }
  }, [isBuy, amount, feeRate, price]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isBuy) {
      if (!amount || !feeRate || !date || calcShare === null) return;
      setShowConfirm(true);
    } else {
      if (!share || !date) return;
      setShowConfirm(true);
    }
  };

  const handleFinalConfirm = () => {
      if (isBuy) {
        onConfirm({ share: calcShare === '待确认' ? null : Number(calcShare), price: Number(price), totalCost: Number(amount), date, isAfter3pm, feeRate: Number(feeRate) });
        return;
      }
      onConfirm({ share: Number(share), price: Number(price), date: actualDate || date, isAfter3pm, feeMode, feeValue });
  };

  const isValid = isBuy
    ? (!!amount && !!feeRate && !!date && calcShare !== null)
    : (!!share && !!date);

  const handleSetShareFraction = (fraction) => {
      if(availableShare > 0) {
          setShare((availableShare * fraction).toFixed(2));
      }
  };

  const [revokeTrade, setRevokeTrade] = useState(null);

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isBuy ? "加仓" : "减仓"}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>{isBuy ? '📥' : '📤'}</span>
            <span>{showPendingList ? '待交易队列' : (showConfirm ? (isBuy ? '买入确认' : '卖出确认') : (isBuy ? '加仓' : '减仓'))}</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        {!showPendingList && !showConfirm && currentPendingTrades.length > 0 && (
            <div
                style={{
                    marginBottom: 16,
                    background: 'rgba(230, 162, 60, 0.1)',
                    border: '1px solid rgba(230, 162, 60, 0.2)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#e6a23c',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                }}
                onClick={() => setShowPendingList(true)}
            >
                <span>⚠️ 当前有 {currentPendingTrades.length} 笔待处理交易</span>
                <span style={{ textDecoration: 'underline' }}>查看详情 &gt;</span>
            </div>
        )}

        {showPendingList ? (
            <div className="pending-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <div className="pending-list-header" style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(6px)', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <button
                        className="button secondary"
                        onClick={() => setShowPendingList(false)}
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                        &lt; 返回
                    </button>
                </div>
                <div className="pending-list-items" style={{ paddingTop: 0 }}>
                    {currentPendingTrades.map((trade, idx) => (
                        <div key={trade.id || idx} style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontWeight: 600, fontSize: '14px', color: trade.type === 'buy' ? 'var(--danger)' : 'var(--success)' }}>
                                    {trade.type === 'buy' ? '买入' : '卖出'}
                                </span>
                                <span className="muted" style={{ fontSize: '12px' }}>{trade.date} {trade.isAfter3pm ? '(15:00后)' : ''}</span>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px' }}>
                                <span className="muted">份额/金额</span>
                                <span>{trade.share ? `${trade.share} 份` : `¥${trade.amount}`}</span>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', fontSize: '12px', marginTop: 4 }}>
                                <span className="muted">状态</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ color: '#e6a23c' }}>等待净值更新...</span>
                                    <button
                                        className="button secondary"
                                        onClick={() => setRevokeTrade(trade)}
                                        style={{
                                            padding: '2px 8px',
                                            fontSize: '10px',
                                            height: 'auto',
                                            background: 'rgba(255,255,255,0.1)',
                                            color: 'var(--text)'
                                        }}
                                    >
                                        撤销
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ) : (
            <>
        {!showConfirm && (
        <div style={{ marginBottom: 16 }}>
          <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>{fund?.name}</div>
          <div className="muted" style={{ fontSize: '12px' }}>#{fund?.code}</div>
        </div>
        )}

        {showConfirm ? (
            isBuy ? (
            <div style={{ fontSize: '14px' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">基金名称</span>
                        <span style={{ fontWeight: 600 }}>{fund?.name}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">买入金额</span>
                        <span>¥{Number(amount).toFixed(2)}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">买入费率</span>
                        <span>{Number(feeRate).toFixed(2)}%</span>
                    </div>
                     <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">参考净值</span>
                        <span>{loadingPrice ? '查询中...' : (price ? `¥${Number(price).toFixed(4)}` : '待查询 (加入队列)')}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">预估份额</span>
                        <span>{calcShare === '待确认' ? '待确认' : `${Number(calcShare).toFixed(2)} 份`}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">买入日期</span>
                        <span>{date}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                        <span className="muted">交易时段</span>
                        <span>{isAfter3pm ? '15:00后' : '15:00前'}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '12px', textAlign: 'right', marginTop: 4 }}>
                        {loadingPrice ? '正在获取该日净值...' : `*基于${price === getEstimatePrice() ? '当前净值/估值' : '当日净值'}测算`}
                    </div>
                </div>

                {holding && calcShare !== '待确认' && (
                    <div style={{ marginBottom: 20 }}>
                        <div className="muted" style={{ marginBottom: 8, fontSize: '12px' }}>持仓变化预览</div>
                        <div className="row" style={{ gap: 12 }}>
                            <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有份额</div>
                                <div style={{ fontSize: '12px' }}>
                                    <span style={{ opacity: 0.7 }}>{holding.share.toFixed(2)}</span>
                                    <span style={{ margin: '0 4px' }}>→</span>
                                    <span style={{ fontWeight: 600 }}>{(holding.share + Number(calcShare)).toFixed(2)}</span>
                                </div>
                            </div>
                            {price ? (
                                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                    <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有市值 (估)</div>
                                    <div style={{ fontSize: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>¥{(holding.share * Number(price)).toFixed(2)}</span>
                                        <span style={{ margin: '0 4px' }}>→</span>
                                        <span style={{ fontWeight: 600 }}>¥{((holding.share + Number(calcShare)) * Number(price)).toFixed(2)}</span>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                <div className="row" style={{ gap: 12 }}>
                    <button
                        type="button"
                        className="button secondary"
                        onClick={() => setShowConfirm(false)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
                    >
                        返回修改
                    </button>
                    <button
                        type="button"
                        className="button"
                        onClick={handleFinalConfirm}
                        disabled={loadingPrice}
                        style={{ flex: 1, background: 'var(--primary)', opacity: loadingPrice ? 0.6 : 1, color: '#05263b' }}
                    >
                        {loadingPrice ? '请稍候' : (price ? '确认买入' : '加入待处理队列')}
                    </button>
                </div>
            </div>
            ) : (
            <div style={{ fontSize: '14px' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">基金名称</span>
                        <span style={{ fontWeight: 600 }}>{fund?.name}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">卖出份额</span>
                        <span>{sellShare.toFixed(2)} 份</span>
                    </div>
                     <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">预估卖出单价</span>
                        <span>{loadingPrice ? '查询中...' : (price ? `¥${sellPrice.toFixed(4)}` : '待查询 (加入队列)')}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">卖出费率/费用</span>
                        <span>{feeMode === 'rate' ? `${feeValue}%` : `¥${feeValue}`}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">预估手续费</span>
                        <span>{price ? `¥${sellFee.toFixed(2)}` : '待计算'}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <span className="muted">卖出日期</span>
                        <span>{date}</span>
                    </div>
                     <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                        <span className="muted">预计回款</span>
                        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{loadingPrice ? '计算中...' : (price ? `¥${estimatedReturn.toFixed(2)}` : '待计算')}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '12px', textAlign: 'right', marginTop: 4 }}>
                        {loadingPrice ? '正在获取该日净值...' : `*基于${price === getEstimatePrice() ? '当前净值/估值' : '当日净值'}测算`}
                    </div>
                </div>

                {holding && (
                    <div style={{ marginBottom: 20 }}>
                        <div className="muted" style={{ marginBottom: 8, fontSize: '12px' }}>持仓变化预览</div>
                        <div className="row" style={{ gap: 12 }}>
                            <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有份额</div>
                                <div style={{ fontSize: '12px' }}>
                                    <span style={{ opacity: 0.7 }}>{holding.share.toFixed(2)}</span>
                                    <span style={{ margin: '0 4px' }}>→</span>
                                    <span style={{ fontWeight: 600 }}>{(holding.share - sellShare).toFixed(2)}</span>
                                </div>
                            </div>
                            {price ? (
                                <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                                    <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>持有市值 (估)</div>
                                    <div style={{ fontSize: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>¥{(holding.share * sellPrice).toFixed(2)}</span>
                                        <span style={{ margin: '0 4px' }}>→</span>
                                        <span style={{ fontWeight: 600 }}>¥{((holding.share - sellShare) * sellPrice).toFixed(2)}</span>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                <div className="row" style={{ gap: 12 }}>
                    <button
                        type="button"
                        className="button secondary"
                        onClick={() => setShowConfirm(false)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
                    >
                        返回修改
                    </button>
                    <button
                        type="button"
                        className="button"
                        onClick={handleFinalConfirm}
                        disabled={loadingPrice}
                        style={{ flex: 1, background: 'var(--danger)', opacity: loadingPrice ? 0.6 : 1 }}
                    >
                        {loadingPrice ? '请稍候' : (price ? '确认卖出' : '加入待处理队列')}
                    </button>
                </div>
            </div>
            )
        ) : (
        <form onSubmit={handleSubmit}>
          {isBuy ? (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  加仓金额 (¥) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ border: !amount ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}>
                  <NumericInput
                    value={amount}
                    onChange={setAmount}
                    step={100}
                    min={0}
                    placeholder="请输入加仓金额"
                  />
                </div>
              </div>

              <div className="row" style={{ gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                    买入费率 (%) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <div style={{ border: !feeRate ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}>
                    <NumericInput
                      value={feeRate}
                      onChange={setFeeRate}
                      step={0.01}
                      min={0}
                      placeholder="0.12"
                    />
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                    加仓日期 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <DatePicker value={date} onChange={setDate} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  交易时段
                </label>
                <div className="row" style={{ gap: 8, background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setIsAfter3pm(false)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: !isAfter3pm ? 'var(--primary)' : 'transparent',
                      color: !isAfter3pm ? '#05263b' : 'var(--muted)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 8px'
                    }}
                  >
                    15:00前
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAfter3pm(true)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: isAfter3pm ? 'var(--primary)' : 'transparent',
                      color: isAfter3pm ? '#05263b' : 'var(--muted)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 8px'
                    }}
                  >
                    15:00后
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 12, fontSize: '12px' }}>
                {loadingPrice ? (
                    <span className="muted">正在查询净值数据...</span>
                ) : price === 0 ? null : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="muted">参考净值: {Number(price).toFixed(4)}</span>
                    </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  卖出份额 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ border: !share ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}>
                  <NumericInput
                    value={share}
                    onChange={setShare}
                    step={1}
                    min={0}
                    placeholder={holding ? `最多可卖 ${availableShare.toFixed(2)} 份` : "请输入卖出份额"}
                  />
                </div>
                {holding && holding.share > 0 && (
                   <div className="row" style={{ gap: 8, marginTop: 8 }}>
                       {[
                           { label: '1/4', value: 0.25 },
                           { label: '1/3', value: 1/3 },
                           { label: '1/2', value: 0.5 },
                           { label: '全部', value: 1 }
                       ].map((opt) => (
                           <button
                               key={opt.label}
                               type="button"
                               onClick={() => handleSetShareFraction(opt.value)}
                               style={{
                                   flex: 1,
                                   padding: '4px 8px',
                                   fontSize: '12px',
                                   background: 'rgba(255,255,255,0.1)',
                                   border: 'none',
                                   borderRadius: '4px',
                                   color: 'var(--text)',
                                   cursor: 'pointer'
                               }}
                           >
                               {opt.label}
                           </button>
                       ))}
                   </div>
                )}
                 {holding && (
                    <div className="muted" style={{ fontSize: '12px', marginTop: 6 }}>
                        当前持仓: {holding.share.toFixed(2)} 份 {pendingSellShare > 0 && <span style={{color: '#e6a23c', marginLeft: 8}}>冻结: {pendingSellShare.toFixed(2)} 份</span>}
                    </div>
                )}
              </div>

              <div className="row" style={{ gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label className="muted" style={{ fontSize: '14px' }}>
                      {feeMode === 'rate' ? '卖出费率 (%)' : '卖出费用 (¥)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                          setFeeMode(m => m === 'rate' ? 'amount' : 'rate');
                          setFeeValue('0');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      切换为{feeMode === 'rate' ? '金额' : '费率'}
                    </button>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
                    <NumericInput
                      value={feeValue}
                      onChange={setFeeValue}
                      step={feeMode === 'rate' ? 0.01 : 1}
                      min={0}
                      placeholder={feeMode === 'rate' ? "0.00" : "0.00"}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                    卖出日期 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <DatePicker value={date} onChange={setDate} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  交易时段
                </label>
                <div className="row" style={{ gap: 8, background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setIsAfter3pm(false)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: !isAfter3pm ? 'var(--primary)' : 'transparent',
                      color: !isAfter3pm ? '#05263b' : 'var(--muted)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 8px'
                    }}
                  >
                    15:00前
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAfter3pm(true)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: isAfter3pm ? 'var(--primary)' : 'transparent',
                      color: isAfter3pm ? '#05263b' : 'var(--muted)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '6px 8px'
                    }}
                  >
                    15:00后
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 12, fontSize: '12px' }}>
                {loadingPrice ? (
                    <span className="muted">正在查询净值数据...</span>
                ) : price === 0 ? null : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="muted">参考净值: {price.toFixed(4)}</span>
                    </div>
                )}
              </div>
            </>
          )}

          <div className="row" style={{ gap: 12, marginTop: 12 }}>
            <button type="button" className="button secondary" onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>取消</button>
            <button
              type="submit"
              className="button"
              disabled={!isValid || loadingPrice}
              style={{ flex: 1, opacity: (!isValid || loadingPrice) ? 0.6 : 1 }}
            >
              确定
            </button>
          </div>
        </form>
      )}
              </>
            )}
      </motion.div>
      <AnimatePresence>
        {revokeTrade && (
          <ConfirmModal
            key="revoke-confirm"
            title="撤销交易"
            message={`确定要撤销这笔 ${revokeTrade.share ? `${revokeTrade.share}份` : `¥${revokeTrade.amount}`} 的${revokeTrade.type === 'buy' ? '买入' : '卖出'}申请吗？`}
            onConfirm={() => {
                onDeletePending?.(revokeTrade.id);
                setRevokeTrade(null);
            }}
            onCancel={() => setRevokeTrade(null)}
            confirmText="确认撤销"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function HoldingEditModal({ fund, holding, onClose, onSave }) {
  const [mode, setMode] = useState('amount'); // 'amount' | 'share'

  // 基础数据
  const dwjz = fund?.dwjz || fund?.gsz || 0;

  // 表单状态
  const [share, setShare] = useState('');
  const [cost, setCost] = useState('');
  const [amount, setAmount] = useState('');
  const [profit, setProfit] = useState('');

  // 初始化数据
  useEffect(() => {
    if (holding) {
      const s = holding.share || 0;
      const c = holding.cost || 0;
      setShare(String(s));
      setCost(String(c));

      if (dwjz > 0) {
        const a = s * dwjz;
        const p = (dwjz - c) * s;
        setAmount(a.toFixed(2));
        setProfit(p.toFixed(2));
      }
    }
  }, [holding, fund]);

  // 切换模式时同步数据
  const handleModeChange = (newMode) => {
    if (newMode === mode) return;
    setMode(newMode);

    if (newMode === 'share') {
      // 从金额/收益 -> 份额/成本
      if (amount && dwjz > 0) {
        const a = parseFloat(amount);
        const p = parseFloat(profit || 0);
        const s = a / dwjz;
        const principal = a - p;
        const c = s > 0 ? principal / s : 0;

        setShare(s.toFixed(2)); // 保留2位小数，或者更多？基金份额通常2位
        setCost(c.toFixed(4));
      }
    } else {
      // 从份额/成本 -> 金额/收益
      if (share && dwjz > 0) {
        const s = parseFloat(share);
        const c = parseFloat(cost || 0);
        const a = s * dwjz;
        const p = (dwjz - c) * s;

        setAmount(a.toFixed(2));
        setProfit(p.toFixed(2));
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    let finalShare = 0;
    let finalCost = 0;

    if (mode === 'share') {
      if (!share || !cost) return;
      finalShare = Number(Number(share).toFixed(2));
      finalCost = Number(cost);
    } else {
      if (!amount || !dwjz) return;
      const a = Number(amount);
      const p = Number(profit || 0);
      const rawShare = a / dwjz;
      finalShare = Number(rawShare.toFixed(2));
      const principal = a - p;
      finalCost = finalShare > 0 ? principal / finalShare : 0;
    }

    onSave({
      share: finalShare,
      cost: finalCost
    });
    onClose();
  };

  const isValid = mode === 'share'
    ? (share && cost && !isNaN(share) && !isNaN(cost))
    : (amount && !isNaN(amount) && (!profit || !isNaN(profit)) && dwjz > 0);

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="编辑持仓"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '400px' }}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>设置持仓</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>{fund?.name}</div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="muted" style={{ fontSize: '12px' }}>#{fund?.code}</div>
            <div className="badge" style={{ fontSize: '12px' }}>
              最新净值：<span style={{ fontWeight: 600, color: 'var(--primary)' }}>{dwjz}</span>
            </div>
          </div>
        </div>

        <div className="tabs-container" style={{ marginBottom: 20, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 12 }}>
          <div className="row" style={{ gap: 0 }}>
            <button
              type="button"
              className={`tab ${mode === 'amount' ? 'active' : ''}`}
              onClick={() => handleModeChange('amount')}
              style={{ flex: 1, justifyContent: 'center', height: 32, borderRadius: 8 }}
            >
              按金额
            </button>
            <button
              type="button"
              className={`tab ${mode === 'share' ? 'active' : ''}`}
              onClick={() => handleModeChange('share')}
              style={{ flex: 1, justifyContent: 'center', height: 32, borderRadius: 8 }}
            >
              按份额
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'amount' ? (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  持有金额 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  className={`input ${!amount ? 'error' : ''}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="请输入持有总金额"
                  style={{
                    width: '100%',
                    border: !amount ? '1px solid var(--danger)' : undefined
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  持有收益
                </label>
                <input
                  type="number"
                  step="any"
                  className="input"
                  value={profit}
                  onChange={(e) => setProfit(e.target.value)}
                  placeholder="请输入持有总收益 (可为负)"
                  style={{ width: '100%' }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  持有份额 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  className={`input ${!share ? 'error' : ''}`}
                  value={share}
                  onChange={(e) => setShare(e.target.value)}
                  placeholder="请输入持有份额"
                  style={{
                    width: '100%',
                    border: !share ? '1px solid var(--danger)' : undefined
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  持仓成本价 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  className={`input ${!cost ? 'error' : ''}`}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="请输入持仓成本价"
                  style={{
                    width: '100%',
                    border: !cost ? '1px solid var(--danger)' : undefined
                  }}
                />
              </div>
            </>
          )}

          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="button secondary" onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>取消</button>
            <button
              type="submit"
              className="button"
              disabled={!isValid}
              style={{ flex: 1, opacity: isValid ? 1 : 0.6 }}
            >
              保存
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function AddResultModal({ failures, onClose }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="添加结果"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>部分基金添加失败</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        <div className="muted" style={{ marginBottom: 12, fontSize: '14px' }}>
          未获取到估值数据的基金如下：
        </div>
        <div className="list">
          {failures.map((it, idx) => (
            <div className="item" key={idx}>
              <span className="name">{it.name || '未知名称'}</span>
              <div className="values">
                <span className="badge">#{it.code}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="button" onClick={onClose}>知道了</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SuccessModal({ message, onClose }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="成功提示"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="success-message" style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: 16 }}>🎉</div>
          <h3 style={{ marginBottom: 8 }}>{message}</h3>
          <p className="muted">操作已完成，您可以继续使用。</p>
          <button className="button" onClick={onClose} style={{ marginTop: 24, width: '100%' }}>
            关闭
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CloudConfigModal({ onConfirm, onCancel, type = 'empty' }) {
  const isConflict = type === 'conflict';
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isConflict ? "配置冲突提示" : "云端同步提示"}
      onClick={isConflict ? undefined : onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ maxWidth: '420px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CloudIcon width="20" height="20" />
            <span>{isConflict ? '发现配置冲突' : '云端暂无配置'}</span>
          </div>
          {!isConflict && (
            <button className="icon-button" onClick={onCancel} style={{ border: 'none', background: 'transparent' }}>
              <CloseIcon width="20" height="20" />
            </button>
          )}
        </div>
        <p className="muted" style={{ marginBottom: 20, fontSize: '14px', lineHeight: '1.6' }}>
          {isConflict
            ? '检测到本地配置与云端不一致，请选择操作：'
            : '是否将本地配置同步到云端？'}
        </p>
        <div className="row" style={{ flexDirection: 'column', gap: 12 }}>
          <button className="button" onClick={onConfirm}>
            {isConflict ? '保留本地 (覆盖云端)' : '同步本地到云端'}
          </button>
          <button className="button secondary" onClick={onCancel}>
            {isConflict ? '使用云端 (覆盖本地)' : '暂不同步'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel, confirmText = "确定删除" }) {
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ zIndex: 10002 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ maxWidth: '400px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 12 }}>
          <TrashIcon width="20" height="20" className="danger" />
          <span>{title}</span>
        </div>
        <p className="muted" style={{ marginBottom: 24, fontSize: '14px', lineHeight: '1.6' }}>
          {message}
        </p>
        <div className="row" style={{ gap: 12 }}>
          <button className="button secondary" onClick={onCancel} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>取消</button>
          <button className="button danger" onClick={onConfirm} style={{ flex: 1 }}>{confirmText}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GroupManageModal({ groups, onClose, onSave }) {
  const [items, setItems] = useState(groups);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }

  const handleReorder = (newOrder) => {
    setItems(newOrder);
  };

  const handleRename = (id, newName) => {
    const truncatedName = (newName || '').slice(0, 8);
    setItems(prev => prev.map(item => item.id === id ? { ...item, name: truncatedName } : item));
  };

  const handleDeleteClick = (id, name) => {
    const itemToDelete = items.find(it => it.id === id);
    const isNew = !groups.find(g => g.id === id);
    const isEmpty = itemToDelete && (!itemToDelete.codes || itemToDelete.codes.length === 0);

    if (isNew || isEmpty) {
      setItems(prev => prev.filter(item => item.id !== id));
    } else {
      setDeleteConfirm({ id, name });
    }
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      setItems(prev => prev.filter(item => item.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    }
  };

  const handleAddRow = () => {
    const newGroup = {
      id: `group_${nowInTz().valueOf()}`,
      name: '',
      codes: []
    };
    setItems(prev => [...prev, newGroup]);
  };

  const handleConfirm = () => {
    const hasEmpty = items.some(it => !it.name.trim());
    if (hasEmpty) return;
    onSave(items);
    onClose();
  };

  const isAllValid = items.every(it => it.name.trim() !== '');

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="管理分组"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ maxWidth: '500px', width: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>管理分组</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div className="group-manage-list-container" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
          {items.length === 0 ? (
            <div className="empty-state muted" style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: '32px', marginBottom: 12, opacity: 0.5 }}>📂</div>
              <p>暂无自定义分组</p>
            </div>
          ) : (
            <Reorder.Group axis="y" values={items} onReorder={handleReorder} className="group-manage-list">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <Reorder.Item
                    key={item.id}
                    value={item}
                    className="group-manage-item glass"
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 35,
                      mass: 1,
                      layout: { duration: 0.2 }
                    }}
                  >
                    <div className="drag-handle" style={{ cursor: 'grab', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                      <DragIcon width="18" height="18" className="muted" />
                    </div>
                    <input
                      className={`input group-rename-input ${!item.name.trim() ? 'error' : ''}`}
                      value={item.name}
                      onChange={(e) => handleRename(item.id, e.target.value)}
                      placeholder="请输入分组名称..."
                      style={{
                        flex: 1,
                        height: '36px',
                        background: 'rgba(0,0,0,0.2)',
                        border: !item.name.trim() ? '1px solid var(--danger)' : 'none'
                      }}
                    />
                    <button
                      className="icon-button danger"
                      onClick={() => handleDeleteClick(item.id, item.name)}
                      title="删除分组"
                      style={{ width: '36px', height: '36px', flexShrink: 0 }}
                    >
                      <TrashIcon width="16" height="16" />
                    </button>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
          )}
          <button
            className="add-group-row-btn"
            onClick={handleAddRow}
            style={{
              width: '100%',
              marginTop: 12,
              padding: '10px',
              borderRadius: '12px',
              border: '1px dashed var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--muted)',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <PlusIcon width="16" height="16" />
            <span>新增分组</span>
          </button>
        </div>

        <div style={{ marginTop: 24 }}>
          {!isAllValid && (
            <div className="error-text" style={{ marginBottom: 12, textAlign: 'center' }}>
              所有分组名称均不能为空
            </div>
          )}
          <button
            className="button"
            onClick={handleConfirm}
            disabled={!isAllValid}
            style={{ width: '100%', opacity: isAllValid ? 1 : 0.6 }}
          >
            完成
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {deleteConfirm && (
          <ConfirmModal
            title="删除确认"
            message={`确定要删除分组 "${deleteConfirm.name}" 吗？分组内的基金不会被删除。`}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AddFundToGroupModal({ allFunds, currentGroupCodes, onClose, onAdd }) {
  const [selected, setSelected] = useState(new Set());

  // 过滤出未在当前分组中的基金
  const availableFunds = (allFunds || []).filter(f => !(currentGroupCodes || []).includes(f.code));

  const toggleSelect = (code) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ maxWidth: '500px', width: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlusIcon width="20" height="20" />
            <span>添加基金到分组</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div className="group-manage-list-container" style={{ maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px' }}>
          {availableFunds.length === 0 ? (
            <div className="empty-state muted" style={{ textAlign: 'center', padding: '40px 0' }}>
              <p>所有基金已在该分组中</p>
            </div>
          ) : (
            <div className="group-manage-list">
              {availableFunds.map((fund) => (
                <div
                  key={fund.code}
                  className={`group-manage-item glass ${selected.has(fund.code) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(fund.code)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="checkbox" style={{ marginRight: 12 }}>
                    {selected.has(fund.code) && <div className="checked-mark" />}
                  </div>
                  <div className="fund-info" style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{fund.name}</div>
                    <div className="muted" style={{ fontSize: '12px' }}>#{fund.code}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 24, gap: 12 }}>
          <button className="button secondary" onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>取消</button>
          <button
            className="button"
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
            style={{ flex: 1 }}
          >
            确定 ({selected.size})
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GroupModal({ onClose, onConfirm }) {
  const [name, setName] = useState('');
  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="新增分组"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        style={{ maxWidth: '400px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlusIcon width="20" height="20" />
            <span>新增分组</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>分组名称（最多 8 个字）</label>
          <input
            className="input"
            autoFocus
            placeholder="请输入分组名称..."
            value={name}
            onChange={(e) => {
              const v = e.target.value || '';
              // 限制最多 8 个字符（兼容中英文），超出部分自动截断
              setName(v.slice(0, 8));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onConfirm(name.trim());
            }}
          />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <button className="button secondary" onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}>取消</button>
          <button className="button" onClick={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()} style={{ flex: 1 }}>确定</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// 数字滚动组件
function CountUp({ value, prefix = '', suffix = '', decimals = 2, className = '', style = {} }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    if (previousValue.current === value) return;

    const start = previousValue.current;
    const end = value;
    const duration = 600; // 0.6秒动画
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
    let totalProfitYesterday = 0;
    let totalProfitToday = 0;
    let totalHoldingReturn = 0;
    let totalCost = 0;
    let hasHolding = false;

    funds.forEach(fund => {
      const holding = holdings[fund.code];
      const profit = getProfit(fund, holding);

      if (profit) {
        hasHolding = true;
        totalAsset += profit.amount;
        totalProfitToday += (typeof profit.profitToday === 'number' ? profit.profitToday : 0);
        totalProfitYesterday += (typeof profit.profitYesterday === 'number' ? profit.profitYesterday : 0);
        if (profit.profitTotal !== null) {
          totalHoldingReturn += profit.profitTotal;
          if (holding && typeof holding.cost === 'number' && typeof holding.share === 'number') {
            totalCost += holding.cost * holding.share;
          }
        }
      }
    });

    const returnRate = totalCost > 0 ? (totalHoldingReturn / totalCost) * 100 : 0;

    return { totalAsset, totalProfitYesterday, totalProfitToday, totalHoldingReturn, hasHolding, returnRate };
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
  }, [winW, summary.totalAsset, summary.totalProfitYesterday, summary.totalProfitToday, summary.totalHoldingReturn, summary.returnRate, showPercent, assetSize, metricSize]); // 添加 assetSize, metricSize 到依赖，确保逐步缩小生效

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
            <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>昨日收益</div>
            <div
              className={summary.totalProfitYesterday > 0 ? 'up' : summary.totalProfitYesterday < 0 ? 'down' : ''}
              style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
            >
              {isMasked ? (
                <span style={{ fontSize: metricSize }}>******</span>
              ) : (
                <>
                  <span style={{ marginRight: 1 }}>{summary.totalProfitYesterday > 0 ? '+' : summary.totalProfitYesterday < 0 ? '-' : ''}</span>
                  <CountUp value={Math.abs(summary.totalProfitYesterday)} style={{ fontSize: metricSize }} />
                </>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>当日收益</div>
            <div
              className={summary.totalProfitToday > 0 ? 'up' : summary.totalProfitToday < 0 ? 'down' : ''}
              style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
            >
              {isMasked ? (
                <span style={{ fontSize: metricSize }}>******</span>
              ) : (
                <>
                  <span style={{ marginRight: 1 }}>{summary.totalProfitToday > 0 ? '+' : summary.totalProfitToday < 0 ? '-' : ''}</span>
                  <CountUp value={Math.abs(summary.totalProfitToday)} style={{ fontSize: metricSize }} />
                </>
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
  const refreshingRef = useRef(false);
  const isLoggingOutRef = useRef(false);

  // 刷新频率状态
  const [refreshMs, setRefreshMs] = useState(30000);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSeconds, setTempSeconds] = useState(30);

  // 全局刷新状态
  const [refreshing, setRefreshing] = useState(false);

  // 收起/展开状态
  const [collapsedCodes, setCollapsedCodes] = useState(new Set());
  const [collapsedTrends, setCollapsedTrends] = useState(new Set()); // New state for collapsed trend charts

  // 自选状态
  const [favorites, setFavorites] = useState(new Set());
  const [groups, setGroups] = useState([]); // [{ id, name, codes: [] }]
  const [currentTab, setCurrentTab] = useState('all');
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [addFundToGroupOpen, setAddFundToGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

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
  const [clearConfirm, setClearConfirm] = useState(null); // { fund }
  const [donateOpen, setDonateOpen] = useState(false);
  const [holdings, setHoldings] = useState({}); // { [code]: { share: number, cost: number } }
  const [pendingTrades, setPendingTrades] = useState([]); // [{ id, fundCode, share, date, ... }]
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
    const interval = setInterval(checkUpdate, 10 * 60 * 1000); // 10 minutes
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
    // 每分钟检查一次
    const timer = setInterval(checkTradingDay, 60000);
    return () => clearInterval(timer);
  }, []);

  // 计算持仓收益
  const getHoldingProfit = (fund, holding) => {
    if (!holding || typeof holding.share !== 'number') return null;

    const now = nowInTz();
    const isAfter9 = now.hour() >= 9;
    const hasTodayData = fund.jzrq === todayStr;
    const hasTodayValuation = typeof fund.gztime === 'string' && fund.gztime.startsWith(todayStr);
    const canCalcTodayProfit = hasTodayData || hasTodayValuation;

    // 如果是交易日且9点以后，且今日净值未出，则强制使用估值（隐藏涨跌幅列模式）
    const useValuation = isTradingDay && isAfter9 && !hasTodayData;

    let currentNav;
    let profitToday;
    let profitYesterday = null;

    if (!useValuation) {
      // 使用确权净值 (dwjz)
      currentNav = Number(fund.dwjz);
      if (!currentNav) return null;

      if (canCalcTodayProfit) {
        const amount = holding.share * currentNav;
        // 优先用 zzl (真实涨跌幅), 降级用 gszzl
        const rate = fund.zzl !== undefined ? Number(fund.zzl) : (Number(fund.gszzl) || 0);
        profitToday = amount - (amount / (1 + rate / 100));
      } else {
        profitToday = null;
      }
    } else {
      // 否则使用估值
      currentNav = fund.estPricedCoverage > 0.05
        ? fund.estGsz
        : (typeof fund.gsz === 'number' ? fund.gsz : Number(fund.dwjz));

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

    let yesterdayRate = Number(fund.yesterdayZzl);
    if (!Number.isFinite(yesterdayRate)) {
      const latestRate = Number(fund.zzl);
      if (fund.jzrq && fund.jzrq !== todayStr && Number.isFinite(latestRate)) {
        yesterdayRate = latestRate;
      }
    }
    const yesterdayRate = Number(fund.yesterdayZzl);
    if (Number.isFinite(yesterdayRate)) {
      profitYesterday = amount - (amount / (1 + yesterdayRate / 100));
    }

    // 总收益 = (当前净值 - 成本价) * 份额
    const profitTotal = typeof holding.cost === 'number'
      ? (currentNav - holding.cost) * holding.share
      : null;

    return {
      amount,
      profitToday,
      profitYesterday,
      profitTotal
    };
  };


  // 过滤和排序后的基金列表
  const displayFunds = funds
    .filter(f => {
      if (currentTab === 'all') return true;
      if (currentTab === 'fav') return favorites.has(f.code);
      const group = groups.find(g => g.id === currentTab);
      return group ? group.codes.includes(f.code) : true;
    })
    .sort((a, b) => {
      if (sortBy === 'yield') {
        const valA = typeof a.estGszzl === 'number' ? a.estGszzl : (Number(a.gszzl) || 0);
        const valB = typeof b.estGszzl === 'number' ? b.estGszzl : (Number(b.gszzl) || 0);
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
    });

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
  // Removed startX and scrollLeft state as we use movementX now
  const [tabsOverflow, setTabsOverflow] = useState(false);
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
    setActionModal({ open: false, fund: null });
    if (type === 'edit') {
      setHoldingModal({ open: true, fund });
    } else if (type === 'clear') {
      setClearConfirm({ fund });
    } else if (type === 'buy' || type === 'sell') {
      setTradeModal({ open: true, fund, type });
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
        if (trade.type === 'buy') {
             const feeRate = trade.feeRate || 0;
             const netAmount = trade.amount / (1 + feeRate / 100);
             const share = netAmount / result.value;
             newShare = current.share + share;
             newCost = (current.cost * current.share + trade.amount) / newShare;
        } else {
             newShare = Math.max(0, current.share - trade.share);
             newCost = current.cost;
             if (newShare === 0) newCost = 0;
        }

        tempHoldings[trade.fundCode] = { share: newShare, cost: newCost };
        stateChanged = true;
        processedIds.add(trade.id);
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

      showToast(`已处理 ${processedIds.size} 笔待定交易`, 'success');
    }
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
    setTabsOverflow(el.scrollWidth > el.clientWidth);
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

  const handleOpenLogin = () => {
    setUserMenuOpen(false);
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }
    setLoginModalOpen(true);
  };

  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [cloudConfigModal, setCloudConfigModal] = useState({ open: false, userId: null });
  const syncDebounceRef = useRef(null);
  const lastSyncedRef = useRef('');
  const skipSyncRef = useRef(false);
  const userIdRef = useRef(null);

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
      const payload = collectLocalPayload();
      const next = getComparablePayload(payload);
      if (next === lastSyncedRef.current) return;
      lastSyncedRef.current = next;
      syncUserConfig(userIdRef.current, false);
    }, 2000);
  }, []);

  const storageHelper = useMemo(() => {
    const keys = new Set(['funds', 'favorites', 'groups', 'collapsedCodes', 'collapsedTrends', 'refreshMs', 'holdings', 'pendingTrades', 'viewMode']);
    const triggerSync = (key, prevValue, nextValue) => {
      if (keys.has(key)) {
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
    const keys = new Set(['funds', 'favorites', 'groups', 'collapsedCodes', 'collapsedTrends', 'refreshMs', 'holdings', 'pendingTrades', 'viewMode']);
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
      if (savedHoldings && typeof savedHoldings === 'object') {
        setHoldings(savedHoldings);
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

    const handleSession = async (session, event) => {
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
      fetchCloudConfig(session.user.id);
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
      await handleSession(session ?? null, event);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;
    const channel = supabase
      .channel(`user-configs-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_configs', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const incoming = payload?.new?.data;
        if (!incoming || typeof incoming !== 'object') return;
        const incomingComparable = getComparablePayload(incoming);
        if (!incomingComparable || incomingComparable === lastSyncedRef.current) return;
        await applyCloudConfig(incoming, payload.new.updated_at);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_configs', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const incoming = payload?.new?.data;
        if (!incoming || typeof incoming !== 'object') return;
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
        fetchCloudConfig(data.user.id);
      }
    } catch (err) {
      setLoginError(err.message || '验证失败，请检查验证码或稍后再试');
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
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const codes = Array.from(new Set(funds.map((f) => f.code)));
      if (codes.length) refreshAll(codes);
    }, refreshMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [funds, refreshMs]);

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
      }
    } catch (e) {
      console.error(e);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
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
    const hasHolding = h && typeof h.share === 'number' && h.share > 0;
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
    if (!payload || typeof payload !== 'object') return '';
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
            const name = typeof group?.name === 'string' ? group.name : '';
            const codes = Array.isArray(group?.codes)
              ? Array.from(new Set(group.codes.map(normalizeCode).filter((code) => uniqueFundCodes.includes(code)))).sort()
              : [];
            return { id, name, codes };
          })
          .filter(Boolean)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];

    const holdingsSource = payload.holdings && typeof payload.holdings === 'object' && !Array.isArray(payload.holdings)
      ? payload.holdings
      : {};
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
              isAfter3pm: !!trade?.isAfter3pm
            };
          })
          .filter((trade) => trade && uniqueFundCodes.includes(trade.fundCode))
          .sort((a, b) => {
            const keyA = a.id || `${a.fundCode}|${a.type}|${a.date}|${a.share ?? ''}|${a.amount ?? ''}|${a.feeMode}|${a.feeValue ?? ''}|${a.feeRate ?? ''}|${a.isAfter3pm ? 1 : 0}`;
            const keyB = b.id || `${b.fundCode}|${b.type}|${b.date}|${b.share ?? ''}|${b.amount ?? ''}|${b.feeMode}|${b.feeValue ?? ''}|${b.feeRate ?? ''}|${b.isAfter3pm ? 1 : 0}`;
            return keyA.localeCompare(keyB);
          })
      : [];

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
      viewMode
    });
  }

  const collectLocalPayload = () => {
    try {
      const funds = JSON.parse(localStorage.getItem('funds') || '[]');
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      const groups = JSON.parse(localStorage.getItem('groups') || '[]');
      const collapsedCodes = JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
      const collapsedTrends = JSON.parse(localStorage.getItem('collapsedTrends') || '[]');
      const viewMode = localStorage.getItem('viewMode') === 'list' ? 'list' : 'card';
      const fundCodes = new Set(
        Array.isArray(funds)
          ? funds.map((f) => f?.code).filter(Boolean)
          : []
      );
      const holdings = JSON.parse(localStorage.getItem('holdings') || '{}');
      const pendingTrades = JSON.parse(localStorage.getItem('pendingTrades') || '[]');
      const cleanedHoldings = holdings && typeof holdings === 'object' && !Array.isArray(holdings)
        ? Object.entries(holdings).reduce((acc, [code, value]) => {
          if (!fundCodes.has(code) || !value || typeof value !== 'object') return acc;
          const parsedShare = typeof value.share === 'number'
            ? value.share
            : typeof value.share === 'string'
              ? Number(value.share)
              : NaN;
          const parsedCost = typeof value.cost === 'number'
            ? value.cost
            : typeof value.cost === 'string'
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
      const cleanedFavorites = Array.isArray(favorites)
        ? favorites.filter((code) => fundCodes.has(code))
        : [];
      const cleanedCollapsed = Array.isArray(collapsedCodes)
        ? collapsedCodes.filter((code) => fundCodes.has(code))
        : [];
      const cleanedCollapsedTrends = Array.isArray(collapsedTrends)
        ? collapsedTrends.filter((code) => fundCodes.has(code))
        : [];
      const cleanedGroups = Array.isArray(groups)
        ? groups.map((group) => ({
          ...group,
          codes: Array.isArray(group?.codes)
            ? group.codes.filter((code) => fundCodes.has(code))
            : []
        }))
        : [];
      const cleanedPendingTrades = Array.isArray(pendingTrades)
        ? pendingTrades.filter((trade) => trade && fundCodes.has(trade.fundCode))
        : [];
      return {
        funds,
        favorites: cleanedFavorites,
        groups: cleanedGroups,
        collapsedCodes: cleanedCollapsed,
        collapsedTrends: cleanedCollapsedTrends,
        refreshMs: parseInt(localStorage.getItem('refreshMs') || '30000', 10),
        holdings: cleanedHoldings,
        pendingTrades: cleanedPendingTrades,
        viewMode,
        exportedAt: nowInTz().toISOString()
      };
    } catch {
      return {
        funds: [],
        favorites: [],
        groups: [],
        collapsedCodes: [],
        refreshMs: 30000,
        holdings: {},
        pendingTrades: [],
        viewMode: 'card',
        exportedAt: nowInTz().toISOString()
      };
    }
  };

  const applyCloudConfig = async (cloudData, cloudUpdatedAt) => {
    if (!cloudData || typeof cloudData !== 'object') return;
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

      const nextHoldings = cloudData.holdings && typeof cloudData.holdings === 'object' ? cloudData.holdings : {};
      setHoldings(nextHoldings);
      storageHelper.setItem('holdings', JSON.stringify(nextHoldings));

      const nextPendingTrades = Array.isArray(cloudData.pendingTrades)
        ? cloudData.pendingTrades.filter((trade) => trade && nextFundCodes.has(trade.fundCode))
        : [];
      setPendingTrades(nextPendingTrades);
      storageHelper.setItem('pendingTrades', JSON.stringify(nextPendingTrades));

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

  const fetchCloudConfig = async (userId) => {
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
      if (data?.data && typeof data.data === 'object' && Object.keys(data.data).length > 0) {
        const localPayload = collectLocalPayload();
        const localComparable = getComparablePayload(localPayload);
        const cloudComparable = getComparablePayload(data.data);

        if (localComparable !== cloudComparable) {
          // 如果数据不一致，无论时间戳如何，都提示用户
          // 用户可以选择使用本地数据覆盖云端，或者使用云端数据覆盖本地
          setCloudConfigModal({ open: true, userId, type: 'conflict', cloudData: data.data });
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

  const syncUserConfig = async (userId, showTip = true) => {
    if (!userId) {
      showToast(`userId 不存在，请重新登录`, 'error');
      return;
    }
    try {
      setIsSyncing(true);
      const payload = collectLocalPayload();
      const now = nowInTz().toISOString();
      const { data: upsertData, error: updateError } = await supabase
        .from('user_configs')
        .upsert(
          {
            user_id: userId,
            data: payload,
            updated_at: now
          },
          { onConflict: 'user_id' }
        )
        .select();

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
        refreshMs: parseInt(localStorage.getItem('refreshMs') || '30000', 10),
        viewMode: localStorage.getItem('viewMode') === 'list' ? 'list' : 'card',
        holdings: JSON.parse(localStorage.getItem('holdings') || '{}'),
        pendingTrades: JSON.parse(localStorage.getItem('pendingTrades') || '[]'),
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
      if (data && typeof data === 'object') {
        // 从 localStorage 读取最新数据进行合并，防止状态滞后导致的数据丢失
        const currentFunds = JSON.parse(localStorage.getItem('funds') || '[]');
        const currentFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        const currentGroups = JSON.parse(localStorage.getItem('groups') || '[]');
        const currentCollapsed = JSON.parse(localStorage.getItem('collapsedCodes') || '[]');
        const currentPendingTrades = JSON.parse(localStorage.getItem('pendingTrades') || '[]');

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

        if (typeof data.refreshMs === 'number' && data.refreshMs >= 5000) {
          setRefreshMs(data.refreshMs);
          setTempSeconds(Math.round(data.refreshMs / 1000));
          storageHelper.setItem('refreshMs', String(data.refreshMs));
        }
        if (data.viewMode === 'card' || data.viewMode === 'list') {
          applyViewMode(data.viewMode);
        }

        if (data.holdings && typeof data.holdings === 'object') {
          const mergedHoldings = { ...JSON.parse(localStorage.getItem('holdings') || '{}'), ...data.holdings };
          setHoldings(mergedHoldings);
          storageHelper.setItem('holdings', JSON.stringify(mergedHoldings));
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
      !!clearConfirm ||
      donateOpen ||
      !!fundDeleteConfirm ||
      updateModalOpen ||
      weChatOpen;

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
    updateModalOpen,
    weChatOpen
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="2" />
            <path d="M5 14c2-4 7-6 14-5" stroke="var(--primary)" strokeWidth="2" />
          </svg>
          <span>基估宝</span>
          <AnimatePresence>
            {isSyncing && (
              <motion.div
                key="sync-icon"
                initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                animate={{ opacity: 1, width: 'auto', marginLeft: 8 }}
                exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', height: 24 }}
                title="正在同步到云端..."
              >
                <motion.svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                >
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" stroke="var(--primary)" />
                  <path d="M12 12v9" stroke="var(--accent)" />
                  <path d="m16 16-4-4-4 4" stroke="var(--accent)" />
                </motion.svg>
              </motion.div>
            )}
          </AnimatePresence>
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
                <div className="input navbar-input-shell">
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
                  />
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
                  justifyContent: 'center'
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
          <div className="badge" title="当前刷新频率">
            <span>刷新</span>
            <strong>{Math.round(refreshMs / 1000)}秒</strong>
          </div>
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
                    <img
                      src={userAvatar}
                      alt="用户头像"
                      style={{ width: '100%', height: '100%', borderRadius: '50%' }}
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
                  style={{ transformOrigin: 'top right' }}
                >
                  {user ? (
                    <>
                      <div className="user-menu-header">
                        <div className="user-avatar-large">
                          {userAvatar ? (
                            <img
                              src={userAvatar}
                              alt="用户头像"
                              style={{ width: '100%', height: '100%', borderRadius: '50%' }}
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
                  stickyTop={navbarHeight + filterBarHeight + (isMobile ? -2 : 0)}
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
                    {viewMode === 'list' && (
                      <div className="table-header-row">
                        <div className="table-header-cell">基金名称</div>
                        <div className="table-header-cell text-right">净值/估值</div>
                        <div className="table-header-cell text-right">涨跌幅</div>
                        <div className="table-header-cell text-right">估值时间</div>
                        <div className="table-header-cell text-right">持仓金额</div>
                        <div className="table-header-cell text-right">昨日盈亏</div>
                        <div className="table-header-cell text-right">当日盈亏</div>
                        <div className="table-header-cell text-right">持有收益</div>
                        <div className="table-header-cell text-center">操作</div>
                      </div>
                    )}
                    <AnimatePresence mode="popLayout">
                      {displayFunds.map((f) => (
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
                                  const now = nowInTz();
                                  const isAfter9 = now.hour() >= 9;
                                  const hasTodayData = f.jzrq === todayStr;
                                  const shouldHideChange = isTradingDay && isAfter9 && !hasTodayData;

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
                                            {f.estPricedCoverage > 0.05 ? `${f.estGszzl > 0 ? '+' : ''}${f.estGszzl.toFixed(2)}%` : (typeof f.gszzl === 'number' ? `${f.gszzl > 0 ? '+' : ''}${f.gszzl.toFixed(2)}%` : f.gszzl ?? '—')}
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
                                  const yesterdayValue = profit ? profit.profitYesterday : null;
                                  const hasYesterday = yesterdayValue !== null;

                                  return (
                                    <div className="table-cell text-right profit-cell">
                                      <span
                                        className={hasYesterday ? (yesterdayValue > 0 ? 'up' : yesterdayValue < 0 ? 'down' : '') : 'muted'}
                                        style={{ fontWeight: 700 }}
                                      >
                                        {hasYesterday
                                          ? `${yesterdayValue > 0 ? '+' : yesterdayValue < 0 ? '-' : ''}¥${Math.abs(yesterdayValue).toFixed(2)}`
                                          : '—'}
                                      </span>
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
                                          : '—'}
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
                                        const now = nowInTz();
                                        const isAfter9 = now.hour() >= 9;
                                        const hasTodayData = f.jzrq === todayStr;
                                        const shouldHideChange = isTradingDay && isAfter9 && !hasTodayData;

                                        if (shouldHideChange) return null;

                                        return (
                                          <Stat
                                            label="涨跌幅"
                                            value={f.zzl !== undefined ? `${f.zzl > 0 ? '+' : ''}${Number(f.zzl).toFixed(2)}%` : ''}
                                            delta={f.zzl}
                                          />
                                        );
                                      })()}
                                      <Stat label="估值净值" value={f.estPricedCoverage > 0.05 ? f.estGsz.toFixed(4) : (f.gsz ?? '—')} />
                                      <Stat
                                        label="估值涨跌幅"
                                        value={f.estPricedCoverage > 0.05 ? `${f.estGszzl > 0 ? '+' : ''}${f.estGszzl.toFixed(2)}%` : (typeof f.gszzl === 'number' ? `${f.gszzl > 0 ? '+' : ''}${f.gszzl.toFixed(2)}%` : f.gszzl ?? '—')}
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
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center' }}>
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
                                          style={{ cursor: 'pointer', flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center' }}
                                          onClick={() => setActionModal({ open: true, fund: f })}
                                        >
                                          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            持仓金额 <SettingsIcon width="12" height="12" style={{ opacity: 0.7 }} />
                                          </span>
                                          <span className="value">¥{profit.amount.toFixed(2)}</span>
                                        </div>
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center' }}>
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                                          <span className="label">昨日盈亏</span>
                                          <span className={`value ${profit.profitYesterday > 0 ? 'up' : profit.profitYesterday < 0 ? 'down' : ''}`}>
                                            {typeof profit.profitYesterday === 'number'
                                              ? `${profit.profitYesterday > 0 ? '+' : profit.profitYesterday < 0 ? '-' : ''}¥${Math.abs(profit.profitYesterday).toFixed(2)}`
                                              : '—'}
                                          </span>
                                        </div>
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center' }}>
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                                          <span className="label">昨日盈亏</span>
                                          <span className={`value ${profit.profitYesterday > 0 ? 'up' : profit.profitYesterday < 0 ? 'down' : ''}`}>
                                            {typeof profit.profitYesterday === 'number'
                                              ? `${profit.profitYesterday > 0 ? '+' : profit.profitYesterday < 0 ? '-' : ''}¥${Math.abs(profit.profitYesterday).toFixed(2)}`
                                              : '—'}
                                          </span>
                                        </div>
                                        <div className="stat" style={{ flexDirection: 'column', gap: 4 }}>
                                          <span className="label">当日盈亏</span>
                                          <span className={`value ${profit.profitToday > 0 ? 'up' : profit.profitToday < 0 ? 'down' : ''}`}>
                                            {profit.profitToday > 0 ? '+' : profit.profitToday < 0 ? '-' : ''}¥{Math.abs(profit.profitToday).toFixed(2)}
                                          </span>
                                        </div>
                                        {profit.profitTotal !== null && (
                                          <div
                                            className="stat"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPercentModes(prev => ({ ...prev, [f.code]: !prev[f.code] }));
                                            }}
                                            style={{ cursor: 'pointer', flexDirection: 'column', gap: 4, alignItems: 'center', textAlign: 'center' }}
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
                                                {typeof h.change === 'number' && (
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
                                />
                              </>
                            )}
                          </motion.div>
                        </motion.div>
                      ))}
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
          <div className="modal-overlay" onClick={() => setDonateOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass card modal"
              style={{ maxWidth: '360px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>☕ 请作者喝杯咖啡</span>
                </div>
                <button className="icon-button" onClick={() => setDonateOpen(false)} style={{ border: 'none', background: 'transparent' }}>
                  <CloseIcon width="20" height="20" />
                </button>
              </div>

              <div style={{ marginBottom: 20 }}>
                <DonateTabs />
              </div>

              <div className="muted" style={{ fontSize: '12px', textAlign: 'center', lineHeight: 1.5 }}>
                感谢您的支持！您的鼓励是我持续维护和更新的动力。
              </div>
            </motion.div>
          </div>
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

      {settingsOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="设置" onClick={() => setSettingsOpen(false)}>
          <div className="glass card modal" onClick={(e) => e.stopPropagation()}>
            <div className="title" style={{ marginBottom: 12 }}>
              <SettingsIcon width="20" height="20" />
              <span>设置</span>
              <span className="muted">配置刷新频率</span>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>刷新频率</div>
              <div className="chips" style={{ marginBottom: 12 }}>
                {[10, 30, 60, 120, 300].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`chip ${tempSeconds === s ? 'active' : ''}`}
                    onClick={() => setTempSeconds(s)}
                    aria-pressed={tempSeconds === s}
                  >
                    {s} 秒
                  </button>
                ))}
              </div>
              <input
                className="input"
                type="number"
                min="10"
                step="5"
                value={tempSeconds}
                onChange={(e) => setTempSeconds(Number(e.target.value))}
                placeholder="自定义秒数"
              />
              {tempSeconds < 10 && (
                <div className="error-text" style={{ marginTop: 8 }}>
                  最小 10 秒
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>数据导出</div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="button" onClick={exportLocalData}>导出配置</button>
              </div>
              <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem', marginTop: 26 }}>数据导入</div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button type="button" className="button" onClick={() => importFileRef.current?.click?.()}>导入配置</button>
              </div>
              <input
                ref={importFileRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={handleImportFileChange}
              />
              {importMsg && (
                <div className="muted" style={{ marginTop: 8 }}>
                  {importMsg}
                </div>
              )}
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="button" onClick={saveSettings} disabled={tempSeconds < 10}>保存并关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 更新提示弹窗 */}
      <AnimatePresence>
        {updateModalOpen && (
          <motion.div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="更新提示"
            onClick={() => setUpdateModalOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ zIndex: 10002 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass card modal"
              style={{ maxWidth: '400px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="title" style={{ marginBottom: 12 }}>
                <UpdateIcon width="20" height="20" style={{color: 'var(--success)'}} />
                <span>更新提示</span>
              </div>
              <div style={{ marginBottom: 24 }}>
                <p className="muted" style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: 12 }}>
                  检测到新版本，是否刷新浏览器以更新？
                  <br/>
                  更新内容如下：
                </p>
                {updateContent && (
                  <div style={{
                    background: 'rgba(0,0,0,0.2)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    {updateContent}
                  </div>
                )}
              </div>
              <div className="row" style={{ gap: 12 }}>
                <button
                  className="button secondary"
                  onClick={() => setUpdateModalOpen(false)}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
                >
                  取消
                </button>
                <button
                  className="button"
                  onClick={() => window.location.reload()}
                  style={{ flex: 1, background: 'var(--success)', color: '#fff', border: 'none' }}
                >
                  刷新浏览器
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 登录模态框 */}
      {loginModalOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="登录"
          onClick={() => {
            setLoginModalOpen(false);
            setLoginError('');
            setLoginSuccess('');
            setLoginEmail('');
          }}
        >
          <div className="glass card modal login-modal" onClick={(e) => e.stopPropagation()}>
            <div className="title" style={{ marginBottom: 16 }}>
              <MailIcon width="20" height="20" />
              <span>邮箱登录</span>
              <span className="muted">使用邮箱验证登录</span>
            </div>

            <form onSubmit={handleSendOtp}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
                  请输入邮箱，我们将发送验证码到您的邮箱
                </div>
                <input
                  style={{width: '100%'}}
                  className="input"
                  type="email"
                  placeholder="your@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  disabled={loginLoading || !!loginSuccess}
                />
              </div>

              {loginSuccess && (
                <div className="login-message success" style={{ marginBottom: 12 }}>
                  <span>{loginSuccess}</span>
                </div>
              )}

              {loginSuccess && (
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
                    请输入邮箱验证码以完成注册/登录
                  </div>
                  <input
                    className="input"
                    type="text"
                    placeholder="输入验证码"
                    value={loginOtp}
                    onChange={(e) => setLoginOtp(e.target.value)}
                    disabled={loginLoading}
                    maxLength={6}
                  />
                </div>
              )}
              {loginError && (
                <div className="login-message error" style={{ marginBottom: 12 }}>
                  <span>{loginError}</span>
                </div>
              )}
              <div className="row" style={{ justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setLoginModalOpen(false);
                    setLoginError('');
                    setLoginSuccess('');
                    setLoginEmail('');
                    setLoginOtp('');
                  }}
                  disabled={loginLoading}
                >
                  取消
                </button>
                <button
                  className="button"
                  type={loginSuccess ? 'button' : 'submit'}
                  onClick={loginSuccess ? handleVerifyEmailOtp : undefined}
                  disabled={loginLoading || (loginSuccess && !loginOtp)}
                >
                  {loginLoading ? '处理中...' : loginSuccess ? '确认验证码' : '发送邮箱验证码'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
