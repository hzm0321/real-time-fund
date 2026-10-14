'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { CloseIcon } from './Icons';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DatePicker, NumericInput } from './Common';
import { fetchSmartFundNetValue } from '../api/fund';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatMoney } from '@/lib/utils';

const formatShare = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Number(n.toFixed(6)).toString();
};

export default function FundConvertModal({
  fund,
  maxOutShare = 0,
  nestedModalOpen = false,
  onClose,
  onPickInFund,
  onConfirm
}) {
  const [outShare, setOutShare] = useState('');
  const [inFund, setInFund] = useState(null);
  const [applyDate, setApplyDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [isAfter3pm, setIsAfter3pm] = useState(() => dayjs().hour() >= 15);
  const [outNetValue, setOutNetValue] = useState(null);
  const [outNetValueDate, setOutNetValueDate] = useState(null);
  const [inNetValue, setInNetValue] = useState(null);
  const [inNetValueDate, setInNetValueDate] = useState(null);
  const [loadingNetValue, setLoadingNetValue] = useState(false);
  const [outNetValueError, setOutNetValueError] = useState(null);
  const [inNetValueError, setInNetValueError] = useState(null);
  const ignoreDialogCloseUntilRef = useRef(0);
  const prevNestedModalOpenRef = useRef(false);

  useEffect(() => {
    // 每次打开/切换 fund 时重置表单（避免上一次残留）
    setOutShare('');
    setInFund(null);
    setApplyDate(dayjs().format('YYYY-MM-DD'));
    setIsAfter3pm(dayjs().hour() >= 15);
    setOutNetValue(null);
    setOutNetValueDate(null);
    setInNetValue(null);
    setInNetValueDate(null);
    setOutNetValueError(null);
    setInNetValueError(null);
    setLoadingNetValue(false);
  }, [fund?.code]);

  const maxOut = useMemo(() => {
    const n = Number(maxOutShare);
    return Number.isFinite(n) && n > 0 ? Number(n.toFixed(6)) : 0;
  }, [maxOutShare]);

  const outShareValue = useMemo(() => Number.parseFloat(outShare), [outShare]);

  const outValid = Number.isFinite(outShareValue) && outShareValue > 0 && outShareValue <= maxOut;
  const canSubmit = !!fund?.code && !!inFund?.code && outValid && !!applyDate;

  useEffect(() => {
    if (nestedModalOpen) {
      ignoreDialogCloseUntilRef.current = Date.now() + 1200;
    } else if (prevNestedModalOpenRef.current) {
      // 移动端关闭子弹框后，触摸/焦点事件可能延迟触发到父弹框。
      ignoreDialogCloseUntilRef.current = Date.now() + 1200;
    }
    prevNestedModalOpenRef.current = nestedModalOpen;
  }, [nestedModalOpen]);

  const handleOpenChange = (open) => {
    if (!open && (nestedModalOpen || Date.now() < ignoreDialogCloseUntilRef.current)) return;
    if (!open) onClose?.();
  };

  const hintMax = maxOut > 0 ? `最多可转出 ${maxOut} 份` : '暂无可转出份额';
  const navQueryDate = useMemo(() => {
    const d = dayjs(applyDate, 'YYYY-MM-DD', true);
    if (!d.isValid()) return null;
    return (isAfter3pm ? d.add(1, 'day') : d).format('YYYY-MM-DD');
  }, [applyDate, isAfter3pm]);

  useEffect(() => {
    if (!fund?.code || !navQueryDate) return;

    const getNetValues = async () => {
      setLoadingNetValue(true);
      setOutNetValue(null);
      setOutNetValueDate(null);
      setInNetValue(null);
      setInNetValueDate(null);
      setOutNetValueError(null);
      setInNetValueError(null);

      try {
        const tasks = [
          fetchSmartFundNetValue(fund.code, navQueryDate),
          inFund?.code ? fetchSmartFundNetValue(inFund.code, navQueryDate) : Promise.resolve(null)
        ];
        const [outRes, inRes] = await Promise.all(tasks);
        if (outRes && outRes.value) {
          setOutNetValue(outRes.value);
          setOutNetValueDate(outRes.date);
        } else {
          setOutNetValueError('未找到该日期的净值数据');
        }
        if (inFund?.code) {
          if (inRes && inRes.value) {
            setInNetValue(inRes.value);
            setInNetValueDate(inRes.date);
          } else {
            setInNetValueError('未找到该日期的净值数据');
          }
        }
      } catch {
        setOutNetValueError('获取净值失败');
        if (inFund?.code) setInNetValueError('获取净值失败');
      } finally {
        setLoadingNetValue(false);
      }
    };

    const timer = setTimeout(getNetValues, 500);
    return () => clearTimeout(timer);
  }, [fund?.code, inFund?.code, navQueryDate]);

  const estimatedInAmount = outValid && outNetValue ? outShareValue * Number(outNetValue) : null;
  const estimatedInShare = estimatedInAmount && inNetValue ? estimatedInAmount / Number(inNetValue) : null;

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="glass card modal gap-0"
        overlayClassName="modal-overlay"
        onPointerDownOutside={(event) => {
          if (nestedModalOpen || Date.now() < ignoreDialogCloseUntilRef.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (nestedModalOpen || Date.now() < ignoreDialogCloseUntilRef.current) event.preventDefault();
        }}
        style={{
          maxWidth: '420px',
          width: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 999
        }}
      >
        <DialogTitle className="sr-only">转换</DialogTitle>

        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '20px' }}>🔄</span>
            <span>转换</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <Alert style={{ marginBottom: 16, flexShrink: 0 }} variant="info">
          <Info className="h-4 w-4" />
          <AlertDescription>提交后将等待两只基金的确认净值，并自动完成转出与转入</AlertDescription>
        </Alert>

        <div className="scrollbar-y-styled" style={{ overflowY: 'auto', paddingRight: 4, flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>
              {fund?.name}
            </div>
            <div className="muted" style={{ fontSize: '12px' }}>
              #{fund?.code}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
              转出基金
            </label>
            <div
              className="input"
              style={{
                width: '100%',
                borderRadius: 12,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                opacity: 0.9
              }}
            >
              {fund?.name || '-'}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
              转出份额 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div
              style={{
                border: !outShare || !outValid ? '1px solid var(--danger)' : '1px solid var(--border)',
                borderRadius: 12
              }}
            >
              <NumericInput value={outShare} onChange={setOutShare} step={1} min={0} placeholder="请输入转出份额" />
            </div>
            {maxOut > 0 && (
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
                    onClick={() => setOutShare(formatShare(maxOut * opt.value))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              * {hintMax}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
              转入基金 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                const picked = await onPickInFund?.({
                  excludeCodes: [fund?.code],
                  initialSelectedCode: inFund?.code || ''
                });
                if (picked?.code) setInFund(picked);
              }}
              style={{
                width: '100%',
                justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text)',
                padding: '10px 12px',
                borderRadius: 12
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {inFund?.name ? `${inFund.name} #${inFund.code}` : '点击选择基金（单选）'}
              </span>
              <span className="muted" style={{ marginLeft: 10 }}>
                ›
              </span>
            </button>
          </div>

          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
              转换申请日期
            </label>
            <DatePicker value={applyDate} onChange={setApplyDate} />
            <div className="trade-time-slot row" style={{ gap: 8, marginTop: 10 }}>
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
            {loadingNetValue && (
              <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
                正在获取净值...
              </div>
            )}
            {!loadingNetValue && outNetValueError && (
              <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: 4 }}>
                参考净值(转出): {outNetValueError}
              </div>
            )}
            {!loadingNetValue && inFund?.code && inNetValueError && (
              <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: 4 }}>
                参考净值(转入): {inNetValueError}
              </div>
            )}
            {outNetValue && !loadingNetValue && (
              <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: 4 }}>
                参考净值(转出): {outNetValue} ({outNetValueDate})
              </div>
            )}
            {inFund?.code && inNetValue && !loadingNetValue && (
              <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: 4 }}>
                参考净值(转入): {inNetValue} ({inNetValueDate})
              </div>
            )}
            {estimatedInAmount && estimatedInShare && !loadingNetValue && (
              <div className="trade-confirm-card" style={{ marginTop: 12, fontSize: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="muted">预计转入金额</span>
                  <span>{formatMoney(estimatedInAmount)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">预计转入份额</span>
                  <span>{estimatedInShare.toFixed(6)} 份</span>
                </div>
              </div>
            )}
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              * 按转换费为 0 估算，最终结果以基金公司确认为准
            </div>
          </div>
        </div>

        <div style={{ paddingTop: 12, marginTop: 4 }}>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="button secondary" onClick={onClose} style={{ flex: 1 }}>
              取消
            </button>
            <button
              type="button"
              className="button"
              disabled={!canSubmit}
              onClick={() => {
                if (!canSubmit) return;
                onConfirm?.({
                  outFundCode: fund.code,
                  outFundName: fund.name,
                  outShare: outShareValue,
                  inFundCode: inFund.code,
                  inFundName: inFund.name,
                  date: applyDate,
                  isAfter3pm
                });
              }}
              style={{ flex: 1, opacity: canSubmit ? 1 : 0.6 }}
            >
              确认转换
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
