'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isNumber } from 'lodash';
import { fetchFundPingzhongdata, fetchSmartFundNetValue } from '../api/fund';
import { DatePicker, NumericInput } from './Common';
import ConfirmModal from './ConfirmModal';
import { CloseIcon } from './Icons';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import PendingTradesModal from './PendingTradesModal';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

dayjs.extend(utc);
dayjs.extend(timezone);

import { DEFAULT_TZ } from '@/app/constants';
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

export default function TradeModal({ type, fund, holding, onClose, onConfirm, pendingTrades = [], onDeletePending }) {
  const isBuy = type === 'buy';
  const [share, setShare] = useState('');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState('0');
  const [minBuyAmount, setMinBuyAmount] = useState(0);
  const [loadingBuyMeta, setLoadingBuyMeta] = useState(false);
  const [buyMetaError, setBuyMetaError] = useState(null);
  const [date, setDate] = useState(() => {
    return formatDate();
  });
  const [isAfter3pm, setIsAfter3pm] = useState(nowInTz().hour() >= 15);
  const [calcShare, setCalcShare] = useState(null);

  const parseNumberish = (input) => {
    if (input === null || typeof input === 'undefined') return null;
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    const cleaned = String(input).replace(/[^\d.]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  useEffect(() => {
    if (!isBuy || !fund?.code) return;
    let cancelled = false;

    setLoadingBuyMeta(true);
    setBuyMetaError(null);

    fetchFundPingzhongdata(fund.code)
      .then((pz) => {
        if (cancelled) return;
        const rate = parseNumberish(pz?.fund_Rate);
        const minsg = parseNumberish(pz?.fund_minsg);

        if (Number.isFinite(minsg)) {
          setMinBuyAmount(minsg);
        } else {
          setMinBuyAmount(0);
        }

        if (Number.isFinite(rate)) {
          setFeeRate((prev) => {
            const prevNum = parseNumberish(prev);
            const shouldOverride = prev === '' || prev === '0' || prevNum === 0 || prevNum === null;
            return shouldOverride ? rate.toFixed(2) : prev;
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setBuyMetaError(e?.message || '买入信息加载失败');
        setMinBuyAmount(0);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingBuyMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isBuy, fund?.code]);

  const currentPendingTrades = useMemo(() => {
    return pendingTrades.filter((t) => t.fundCode === fund?.code);
  }, [pendingTrades, fund]);

  const pendingSellShare = useMemo(() => {
    return currentPendingTrades
      .filter((t) => t.type === 'sell')
      .reduce((acc, curr) => acc + (Number(curr.share) || 0), 0);
  }, [currentPendingTrades]);

  const availableShare = holding ? Math.max(0, holding.share - pendingSellShare) : 0;

  const [showPendingList, setShowPendingList] = useState(false);

  useEffect(() => {
    if (showPendingList && currentPendingTrades.length === 0) {
      setShowPendingList(false);
    }
  }, [showPendingList, currentPendingTrades]);

  const getEstimatePrice = () => (isNumber(fund?.gsz) ? fund?.gsz : Number(fund?.dwjz));
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

      fetchSmartFundNetValue(fund.code, queryDate)
        .then((result) => {
          if (result) {
            setPrice(result.value);
            setActualDate(result.date);
          } else {
            setPrice(0);
            setActualDate(null);
          }
        })
        .finally(() => setLoadingPrice(false));
    }
  }, [date, isAfter3pm, isBuy, fund]);

  const [feeMode, setFeeMode] = useState('rate');
  const [feeValue, setFeeValue] = useState('0');
  const [showConfirm, setShowConfirm] = useState(false);

  const sellShare = parseFloat(share) || 0;
  const sellPrice = parseFloat(price) || 0;
  const sellAmount = sellShare * sellPrice;

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
        setCalcShare(s.toFixed(6));
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
      onConfirm({
        share: calcShare === '待确认' ? null : Number(calcShare),
        price: Number(price),
        totalCost: Number(amount),
        date: actualDate || date,
        isAfter3pm,
        feeRate: Number(feeRate)
      });
      return;
    }
    onConfirm({ share: Number(share), price: Number(price), date: actualDate || date, isAfter3pm, feeMode, feeValue });
  };

  const isValid = isBuy ? !!amount && !!feeRate && !!date && calcShare !== null && !loadingBuyMeta : !!share && !!date;

  const handleSetShareFraction = (fraction) => {
    if (availableShare > 0) {
      setShare(Number((availableShare * fraction).toFixed(6)).toString());
    }
  };

  const [revokeTrade, setRevokeTrade] = useState(null);

  const handleOpenChange = (open) => {
    if (!open) {
      onClose?.();
    }
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal trade-modal"
        overlayClassName="modal-overlay"
        overlayStyle={{ zIndex: 99 }}
        style={{ maxWidth: '420px', width: '90vw', zIndex: 99 }}
      >
        <DialogTitle className="sr-only">{isBuy ? '加仓' : '减仓'}</DialogTitle>
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>{isBuy ? '📥' : '📤'}</span>
            <span>{showConfirm ? (isBuy ? '买入确认' : '卖出确认') : isBuy ? '加仓' : '减仓'}</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        {!showConfirm && currentPendingTrades.length > 0 && (
          <div className="trade-pending-alert" onClick={() => setShowPendingList(true)}>
            <span>⚠️ 当前有 {currentPendingTrades.length} 笔待处理交易</span>
            <span style={{ textDecoration: 'underline' }}>查看详情 &gt;</span>
          </div>
        )}

        {!showConfirm && (
          <div style={{ marginBottom: 16 }}>
            <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>
              {fund?.name}
            </div>
            <div className="muted" style={{ fontSize: '12px' }}>
              #{fund?.code}
            </div>
          </div>
        )}

        {showConfirm ? (
          isBuy ? (
            <div style={{ fontSize: '14px' }}>
              <div className="trade-confirm-card">
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">基金名称</span>
                  <span style={{ fontWeight: 600 }}>{fund?.name}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">买入金额</span>
                  <span>{Number(amount).toFixed(2)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">买入费率</span>
                  <span>{Number(feeRate).toFixed(2)}%</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">参考净值</span>
                  <span>
                    {loadingPrice ? '查询中...' : price ? `${Number(price).toFixed(4)}` : '待查询 (加入队列)'}
                  </span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">预估份额</span>
                  <span>{calcShare === '待确认' ? '待确认' : `${Number(calcShare).toFixed(2)} 份`}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">买入日期</span>
                  <span>{date}</span>
                </div>
                <div
                  className="row trade-confirm-divider"
                  style={{ justifyContent: 'space-between', marginBottom: 8, paddingTop: 8 }}
                >
                  <span className="muted">交易时段</span>
                  <span>{isAfter3pm ? '15:00后' : '15:00前'}</span>
                </div>
                <div className="muted" style={{ fontSize: '12px', textAlign: 'right', marginTop: 4 }}>
                  {loadingPrice
                    ? '正在获取该日净值...'
                    : `*基于${price === getEstimatePrice() ? '当前净值/估值' : '当日净值'}测算`}
                </div>
              </div>

              {holding && calcShare !== '待确认' && (
                <div style={{ marginBottom: 20 }}>
                  <div className="muted" style={{ marginBottom: 8, fontSize: '12px' }}>
                    持仓变化预览
                  </div>
                  <div className="row" style={{ gap: 12 }}>
                    <div className="trade-preview-card" style={{ flex: 1 }}>
                      <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>
                        持有份额
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        <span style={{ opacity: 0.7 }}>{holding.share.toFixed(2)}</span>
                        <span style={{ margin: '0 4px' }}>→</span>
                        <span style={{ fontWeight: 600 }}>{(holding.share + Number(calcShare)).toFixed(2)}</span>
                      </div>
                    </div>
                    {price ? (
                      <div className="trade-preview-card" style={{ flex: 1 }}>
                        <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>
                          持有市值 (估)
                        </div>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ opacity: 0.7 }}>{(holding.share * Number(price)).toFixed(2)}</span>
                          <span style={{ margin: '0 4px' }}>→</span>
                          <span style={{ fontWeight: 600 }}>
                            {((holding.share + Number(calcShare)) * Number(price)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="row" style={{ gap: 12 }}>
                <button
                  type="button"
                  className="button secondary trade-back-btn"
                  onClick={() => setShowConfirm(false)}
                  style={{ flex: 1 }}
                >
                  返回修改
                </button>
                <button
                  type="button"
                  className="button queue-button"
                  onClick={handleFinalConfirm}
                  disabled={loadingPrice}
                  style={{ flex: 1, background: 'var(--primary)', opacity: loadingPrice ? 0.6 : 1 }}
                >
                  {loadingPrice ? '请稍候' : price ? '确认买入' : '加入待处理队列'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '14px' }}>
              <div className="trade-confirm-card">
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
                  <span>{loadingPrice ? '查询中...' : price ? `${sellPrice.toFixed(4)}` : '待查询 (加入队列)'}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">卖出费率/费用</span>
                  <span>{feeMode === 'rate' ? `${feeValue}%` : `${feeValue}`}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">预估手续费</span>
                  <span>{price ? `${sellFee.toFixed(2)}` : '待计算'}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="muted">卖出日期</span>
                  <span>{date}</span>
                </div>
                <div
                  className="row trade-confirm-divider"
                  style={{ justifyContent: 'space-between', marginBottom: 8, paddingTop: 8 }}
                >
                  <span className="muted">预计回款</span>
                  <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                    {loadingPrice ? '计算中...' : price ? `${estimatedReturn.toFixed(2)}` : '待计算'}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: '12px', textAlign: 'right', marginTop: 4 }}>
                  {loadingPrice
                    ? '正在获取该日净值...'
                    : `*基于${price === getEstimatePrice() ? '当前净值/估值' : '当日净值'}测算`}
                </div>
              </div>

              {holding && (
                <div style={{ marginBottom: 20 }}>
                  <div className="muted" style={{ marginBottom: 8, fontSize: '12px' }}>
                    持仓变化预览
                  </div>
                  <div className="row" style={{ gap: 12 }}>
                    <div className="trade-preview-card" style={{ flex: 1 }}>
                      <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>
                        持有份额
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        <span style={{ opacity: 0.7 }}>{holding.share.toFixed(2)}</span>
                        <span style={{ margin: '0 4px' }}>→</span>
                        <span style={{ fontWeight: 600 }}>{(holding.share - sellShare).toFixed(2)}</span>
                      </div>
                    </div>
                    {price ? (
                      <div className="trade-preview-card" style={{ flex: 1 }}>
                        <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>
                          持有市值 (估)
                        </div>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ opacity: 0.7 }}>{(holding.share * sellPrice).toFixed(2)}</span>
                          <span style={{ margin: '0 4px' }}>→</span>
                          <span style={{ fontWeight: 600 }}>
                            {((holding.share - sellShare) * sellPrice).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="row" style={{ gap: 12 }}>
                <button
                  type="button"
                  className="button secondary trade-back-btn"
                  onClick={() => setShowConfirm(false)}
                  style={{ flex: 1 }}
                >
                  返回修改
                </button>
                <button
                  type="button"
                  className="button queue-button"
                  onClick={handleFinalConfirm}
                  disabled={loadingPrice}
                  style={{ flex: 1, background: 'var(--danger)', opacity: loadingPrice ? 0.6 : 1 }}
                >
                  {loadingPrice ? '请稍候' : price ? '确认卖出' : '加入待处理队列'}
                </button>
              </div>
            </div>
          )
        ) : (
          <form onSubmit={handleSubmit}>
            {isBuy ? (
              <>
                <div style={{ position: 'relative' }}>
                  <div style={{ pointerEvents: loadingBuyMeta ? 'none' : 'auto', opacity: loadingBuyMeta ? 0.55 : 1 }}>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                        加仓金额 <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <div
                        style={{
                          border: !amount ? '1px solid var(--danger)' : '1px solid var(--border)',
                          borderRadius: 12
                        }}
                      >
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
                        <div
                          style={{
                            border: !feeRate ? '1px solid var(--danger)' : '1px solid var(--border)',
                            borderRadius: 12
                          }}
                        >
                          <NumericInput value={feeRate} onChange={setFeeRate} step={0.1} min={0} placeholder="0.12" />
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
                      <div className="trade-time-slot row" style={{ gap: 8 }}>
                        <button
                          type="button"
                          className={!isAfter3pm ? 'trade-time-btn active' : 'trade-time-btn'}
                          onClick={() => setIsAfter3pm(false)}
                        >
                          15:00前
                        </button>
                        <button
                          type="button"
                          className={isAfter3pm ? 'trade-time-btn active' : 'trade-time-btn'}
                          onClick={() => setIsAfter3pm(true)}
                        >
                          15:00后
                        </button>
                      </div>
                    </div>

                    <div style={{ marginBottom: 12, fontSize: '12px' }}>
                      {buyMetaError ? (
                        <span className="muted" style={{ color: 'var(--danger)' }}>
                          {buyMetaError}
                        </span>
                      ) : null}
                      {loadingPrice ? (
                        <span className="muted">正在查询净值数据...</span>
                      ) : price === 0 ? null : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className="muted">参考净值: {Number(price).toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {loadingBuyMeta && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        padding: 12,
                        borderRadius: 12,
                        background: 'rgba(0,0,0,0.25)',
                        backdropFilter: 'blur(2px)',
                        WebkitBackdropFilter: 'blur(2px)'
                      }}
                    >
                      <Spinner className="size-5" />
                      <span className="muted" style={{ fontSize: 12 }}>
                        正在加载买入费率/最小金额...
                      </span>
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
                  <div
                    style={{ border: !share ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}
                  >
                    <NumericInput
                      value={share}
                      onChange={setShare}
                      step={1}
                      min={0}
                      placeholder={holding ? `最多可卖 ${availableShare.toFixed(2)} 份` : '请输入卖出份额'}
                    />
                  </div>
                  {holding && holding.share > 0 && (
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      {[
                        { label: '1/4', value: 0.25 },
                        { label: '1/3', value: 1 / 3 },
                        { label: '1/2', value: 0.5 },
                        { label: '全部', value: 1 }
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          className="trade-amount-btn"
                          onClick={() => handleSetShareFraction(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {holding && (
                    <div className="muted" style={{ fontSize: '12px', marginTop: 6 }}>
                      当前持仓: {holding.share.toFixed(2)} 份{' '}
                      {pendingSellShare > 0 && (
                        <span className="trade-pending-status" style={{ marginLeft: 8 }}>
                          冻结: {pendingSellShare.toFixed(2)} 份
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="row" style={{ gap: 12, marginBottom: 16 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label className="muted" style={{ fontSize: '14px' }}>
                        {feeMode === 'rate' ? '卖出费率 (%)' : '卖出费用 ()'}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setFeeMode((m) => (m === 'rate' ? 'amount' : 'rate'));
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
                        step={feeMode === 'rate' ? 0.1 : 1}
                        min={0}
                        placeholder={feeMode === 'rate' ? '0.00' : '0.00'}
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
                  <div className="trade-time-slot row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className={!isAfter3pm ? 'trade-time-btn active' : 'trade-time-btn'}
                      onClick={() => setIsAfter3pm(false)}
                    >
                      15:00前
                    </button>
                    <button
                      type="button"
                      className={isAfter3pm ? 'trade-time-btn active' : 'trade-time-btn'}
                      onClick={() => setIsAfter3pm(true)}
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
              <button type="button" className="button secondary trade-cancel-btn" onClick={onClose} style={{ flex: 1 }}>
                取消
              </button>
              <button
                type="submit"
                className="button"
                disabled={!isValid || loadingPrice || (isBuy && loadingBuyMeta)}
                style={{ flex: 1, opacity: !isValid || loadingPrice || (isBuy && loadingBuyMeta) ? 0.6 : 1 }}
              >
                确定
              </button>
            </div>
          </form>
        )}
      </DialogContent>
      <AnimatePresence>
        {revokeTrade && (
          <ConfirmModal
            key="revoke-confirm"
            title="撤销交易"
            message={`确定要撤销这笔 ${revokeTrade.share ? `${revokeTrade.share}份` : `${revokeTrade.amount}`} 的${revokeTrade.type === 'buy' ? '买入' : '卖出'}申请吗？`}
            onConfirm={() => {
              onDeletePending?.(revokeTrade.id);
              setRevokeTrade(null);
            }}
            onCancel={() => setRevokeTrade(null)}
            confirmText="确认撤销"
          />
        )}
      </AnimatePresence>
      <PendingTradesModal
        open={showPendingList}
        trades={currentPendingTrades}
        onClose={() => setShowPendingList(false)}
        onRevoke={(trade) => setRevokeTrade(trade)}
      />
    </Dialog>
  );
}
