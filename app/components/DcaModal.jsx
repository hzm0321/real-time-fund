'use client';

import { useEffect, useState, useRef } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { RotateCcw } from 'lucide-react';
import { DatePicker, NumericInput } from './Common';
import { isNumber } from 'lodash';
import { CloseIcon } from './Icons';
import ConfirmModal from './ConfirmModal';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
const formatDate = (input) => dayjs.tz(input, TZ).format('YYYY-MM-DD');

const CYCLES = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'biweekly', label: '每两周' },
  { value: 'monthly', label: '每月' }
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' }
];

const computeFirstDate = (cycle, weeklyDay, monthlyDay) => {
  const today = nowInTz().startOf('day');

  if (cycle === 'weekly' || cycle === 'biweekly') {
    const todayDay = today.day(); // 0-6, 1=周一
    let target = isNumber(weeklyDay) ? weeklyDay : todayDay;
    if (target < 1 || target > 5) {
      // 如果当前是周末且未设定，默认周一
      target = 1;
    }
    let candidate = today;
    for (let i = 0; i < 14; i += 1) {
      if (candidate.day() === target && !candidate.isBefore(today)) {
        break;
      }
      candidate = candidate.add(1, 'day');
    }
    return candidate.format('YYYY-MM-DD');
  }

  if (cycle === 'monthly') {
    const baseDay = today.date();
    const day = isNumber(monthlyDay) && monthlyDay >= 1 && monthlyDay <= 28 ? monthlyDay : Math.min(28, baseDay);

    let candidate = today.date(day);
    if (candidate.isBefore(today)) {
      candidate = today.add(1, 'month').date(day);
    }
    return candidate.format('YYYY-MM-DD');
  }

  return formatDate(today);
};

const resolveDailyFirstDate = (savedFirstDate) => {
  const autoFirstDate = computeFirstDate('daily');
  if (!savedFirstDate) return autoFirstDate;

  return dayjs.tz(savedFirstDate, TZ).isAfter(dayjs.tz(autoFirstDate, TZ)) ? savedFirstDate : autoFirstDate;
};

export default function DcaModal({ fund, plan, onClose, onConfirm, onReset }) {
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState('0');
  const [cycle, setCycle] = useState('monthly');
  const [enabled, setEnabled] = useState(true);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [weeklyDay, setWeeklyDay] = useState(() => {
    const d = nowInTz().day();
    return d >= 1 && d <= 5 ? d : 1;
  });
  const [monthlyDay, setMonthlyDay] = useState(() => {
    const d = nowInTz().date();
    return d >= 1 && d <= 28 ? d : 1;
  });
  const [firstDate, setFirstDate] = useState(() => computeFirstDate('monthly', null, null));
  const monthlyDayRef = useRef(null);
  const skipNextAutoComputeRef = useRef(false);

  useEffect(() => {
    skipNextAutoComputeRef.current = true;
    if (!plan) {
      // 新建定投时，以当前默认 weeklyDay/monthlyDay 计算一次首扣日期
      setFirstDate(computeFirstDate('monthly', weeklyDay, monthlyDay));
      return;
    }
    if (plan.amount != null) {
      setAmount(String(plan.amount));
    }
    if (plan.feeRate != null) {
      setFeeRate(String(plan.feeRate));
    }
    if (typeof plan.enabled === 'boolean') {
      setEnabled(plan.enabled);
    }
    if (isNumber(plan.weeklyDay)) {
      setWeeklyDay(plan.weeklyDay);
    }
    if (isNumber(plan.monthlyDay)) {
      setMonthlyDay(plan.monthlyDay);
    }
    if (plan.cycle && CYCLES.some((c) => c.value === plan.cycle)) {
      setCycle(plan.cycle);
      setFirstDate(
        plan.cycle === 'daily'
          ? resolveDailyFirstDate(plan.firstDate)
          : plan.firstDate || computeFirstDate(plan.cycle, plan.weeklyDay, plan.monthlyDay)
      );
    } else {
      setFirstDate(plan.firstDate || computeFirstDate('monthly', null, null));
    }
  }, [plan]);

  useEffect(() => {
    if (skipNextAutoComputeRef.current) {
      skipNextAutoComputeRef.current = false;
      return;
    }
    if (cycle === 'daily') return;
    setFirstDate(computeFirstDate(cycle, weeklyDay, monthlyDay));
  }, [cycle, weeklyDay, monthlyDay]);

  useEffect(() => {
    if (cycle !== 'monthly') return;
    if (monthlyDayRef.current) {
      try {
        monthlyDayRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {}
    }
  }, [cycle, monthlyDay]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    const rate = parseFloat(feeRate);
    if (!fund?.code) return;
    if (!amt || amt <= 0) return;
    if (isNaN(rate) || rate < 0) return;
    if (!cycle) return;
    if ((cycle === 'weekly' || cycle === 'biweekly') && (weeklyDay < 1 || weeklyDay > 5)) return;
    if (cycle === 'monthly' && (monthlyDay < 1 || monthlyDay > 28)) return;

    onConfirm?.({
      type: 'dca',
      fundCode: fund.code,
      fundName: fund.name,
      amount: amt,
      feeRate: rate,
      cycle,
      firstDate,
      weeklyDay: cycle === 'weekly' || cycle === 'biweekly' ? weeklyDay : null,
      monthlyDay: cycle === 'monthly' ? monthlyDay : null,
      enabled
    });
  };

  const isValid = () => {
    const amt = parseFloat(amount);
    const rate = parseFloat(feeRate);
    if (!fund?.code || !cycle || !firstDate) return false;
    if (!(amt > 0) || isNaN(rate) || rate < 0) return false;
    if ((cycle === 'weekly' || cycle === 'biweekly') && (weeklyDay < 1 || weeklyDay > 5)) return false;
    if (cycle === 'monthly' && (monthlyDay < 1 || monthlyDay > 28)) return false;
    return true;
  };

  const handleOpenChange = (open) => {
    if (!open) {
      onClose?.();
    }
  };

  return (
    <>
      {resetConfirmOpen && (
        <ConfirmModal
          title="重置定投数据"
          message={`是否重置「${fund?.name || fund?.code || '该基金'}」在当前分组下的定投数据？确认后将清除该基金在当前分组内的定投设置。`}
          icon={<RotateCcw width="20" height="20" className="shrink-0 text-[var(--primary)]" />}
          confirmText="确认重置"
          confirmVariant="danger"
          onCancel={() => setResetConfirmOpen(false)}
          onConfirm={() => {
            setResetConfirmOpen(false);
            // 由父级负责清除“当前分组-该基金”的定投数据
            onReset?.(fund?.code);
          }}
        />
      )}
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="glass card modal dca-modal"
          overlayClassName="modal-overlay"
          style={{
            maxWidth: '420px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 999,
            width: '90vw'
          }}
        >
          <DialogTitle className="sr-only">定投设置</DialogTitle>
          <div
            className="scrollbar-y-styled"
            style={{
              overflowY: 'auto',
              paddingRight: 4,
              flex: 1
            }}
          >
            <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '20px' }}>🔁</span>
                <span>定投</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setResetConfirmOpen(true)}
                      disabled={!plan}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--primary)',
                        opacity: plan ? 1 : 0.4,
                        cursor: plan ? 'pointer' : 'not-allowed'
                      }}
                    >
                      <RotateCcw width="18" height="18" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{plan ? '重置当前分组定投数据' : '暂无定投数据可重置'}</p>
                  </TooltipContent>
                </Tooltip>
                <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
                  <CloseIcon width="20" height="20" />
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>
                {fund?.name}
              </div>
              <div className="muted" style={{ fontSize: '12px' }}>
                #{fund?.code}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label
                  className="muted"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '14px' }}
                >
                  <span>是否启用定投</span>
                  <button
                    type="button"
                    onClick={() => setEnabled((v) => !v)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span className={`dca-toggle-track ${enabled ? 'enabled' : ''}`}>
                      <span className="dca-toggle-thumb" style={{ left: enabled ? 16 : 2 }} />
                    </span>
                    <span style={{ fontSize: 12, color: enabled ? 'var(--primary)' : 'var(--muted)' }}>
                      {enabled ? '已启用' : '未启用'}
                    </span>
                  </button>
                </label>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                  定投金额 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div
                  style={{
                    border: !amount || parseFloat(amount) <= 0 ? '1px solid var(--danger)' : '1px solid var(--border)',
                    borderRadius: 12
                  }}
                >
                  <NumericInput
                    value={amount}
                    onChange={setAmount}
                    step={100}
                    min={0}
                    placeholder="请输入每次定投金额"
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
                      border: feeRate === '' ? '1px solid var(--danger)' : '1px solid var(--border)',
                      borderRadius: 12
                    }}
                  >
                    <NumericInput value={feeRate} onChange={setFeeRate} step={0.1} min={0} placeholder="0.12" />
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                    定投周期 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <div className="dca-option-group row" style={{ gap: 4 }}>
                    {CYCLES.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`dca-option-btn ${cycle === opt.value ? 'active' : ''}`}
                        onClick={() => setCycle(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(cycle === 'weekly' || cycle === 'biweekly') && (
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                    扣款星期 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <div className="dca-option-group row" style={{ gap: 4 }}>
                    {WEEKDAY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`dca-option-btn dca-weekday-btn ${weeklyDay === opt.value ? 'active' : ''}`}
                        onClick={() => setWeeklyDay(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cycle === 'monthly' && (
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                    扣款日 <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <div className="dca-monthly-day-group scrollbar-y-styled">
                    {Array.from({ length: 28 }).map((_, idx) => {
                      const day = idx + 1;
                      const active = monthlyDay === day;
                      return (
                        <button
                          key={day}
                          ref={active ? monthlyDayRef : null}
                          type="button"
                          className={`dca-option-btn dca-monthly-btn ${active ? 'active' : ''}`}
                          onClick={() => setMonthlyDay(day)}
                        >
                          {day}日
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: '14px' }}>
                  首次扣款日期
                </label>
                {cycle === 'daily' ? (
                  <DatePicker value={firstDate} onChange={setFirstDate} minDate={nowInTz().format('YYYY-MM-DD')} />
                ) : (
                  <div className="dca-first-date-display">{firstDate}</div>
                )}
                <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                  {cycle === 'daily'
                    ? '* 选择首次扣款日期（不能晚于今天）'
                    : '* 基于当前日期和所选周期/扣款日自动计算：每日=当天；每周/每两周=从今天起最近的所选工作日；每月=从今天起最近的所选日期（1-28日）。'}
                </div>
              </div>
            </form>
          </div>
          <div
            style={{
              paddingTop: 12,
              marginTop: 4
            }}
          >
            <div className="row" style={{ gap: 12 }}>
              <button type="button" className="button secondary dca-cancel-btn" onClick={onClose} style={{ flex: 1 }}>
                取消
              </button>
              <button
                type="button"
                className="button"
                disabled={!isValid()}
                onClick={handleSubmit}
                style={{ flex: 1, opacity: isValid() ? 1 : 0.6 }}
              >
                保存定投
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
