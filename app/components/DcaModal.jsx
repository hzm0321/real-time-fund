'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { DatePicker, NumericInput } from './Common';
import { isNumber } from 'lodash';
import { CloseIcon } from './Icons';

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
    const day =
      isNumber(monthlyDay) && monthlyDay >= 1 && monthlyDay <= 28
        ? monthlyDay
        : Math.min(28, baseDay);

    let candidate = today.date(day);
    if (candidate.isBefore(today)) {
      candidate = today.add(1, 'month').date(day);
    }
    return candidate.format('YYYY-MM-DD');
  }

  return formatDate(today);
};

export default function DcaModal({ fund, plan, onClose, onConfirm }) {
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState('0');
  const [cycle, setCycle] = useState('monthly');
  const [enabled, setEnabled] = useState(true);
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

  useEffect(() => {
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
    if (plan.cycle && CYCLES.some(c => c.value === plan.cycle)) {
      setCycle(plan.cycle);
      setFirstDate(plan.firstDate || computeFirstDate(plan.cycle, plan.weeklyDay, plan.monthlyDay));
    } else {
      setFirstDate(plan.firstDate || computeFirstDate('monthly', null, null));
    }
  }, [plan]);

  useEffect(() => {
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

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="定投设置"
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
            <span style={{ fontSize: '20px' }}>🔁</span>
            <span>定投</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="fund-name" style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>{fund?.name}</div>
          <div className="muted" style={{ fontSize: '12px' }}>#{fund?.code}</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '14px' }}>
              <span>是否启用定投</span>
              <button
                type="button"
                onClick={() => setEnabled(v => !v)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 18,
                    borderRadius: 999,
                    background: enabled ? 'var(--primary)' : 'rgba(148,163,184,0.6)',
                    position: 'relative',
                    transition: 'background 0.2s'
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: enabled ? 16 : 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#0f172a',
                      transition: 'left 0.2s'
                    }}
                  />
                </span>
                <span style={{ fontSize: 12, color: enabled ? 'var(--primary)' : 'var(--muted)' }}>
                  {enabled ? '已启用' : '未启用'}
                </span>
              </button>
            </label>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
              定投金额 (¥) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div style={{ border: (!amount || parseFloat(amount) <= 0) ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}>
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
              <div style={{ border: feeRate === '' ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: 12 }}>
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
                定投周期 <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div className="row" style={{ gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4 }}>
                {CYCLES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCycle(opt.value)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: cycle === opt.value ? 'var(--primary)' : 'transparent',
                      color: cycle === opt.value ? '#05263b' : 'var(--muted)',
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                      padding: '4px 6px',
                      whiteSpace: 'nowrap'
                    }}
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
              <div className="row" style={{ gap: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4 }}>
                {WEEKDAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWeeklyDay(opt.value)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: weeklyDay === opt.value ? 'var(--primary)' : 'transparent',
                      color: weeklyDay === opt.value ? '#05263b' : 'var(--muted)',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: '6px 4px',
                      whiteSpace: 'nowrap'
                    }}
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
              <div
                className="scrollbar-y-styled"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 8,
                  padding: 4,
                  maxHeight: 140,
                  overflowY: 'auto',
                  scrollBehavior: 'smooth'
                }}
              >
                {Array.from({ length: 28 }).map((_, idx) => {
                  const day = idx + 1;
                  const active = monthlyDay === day;
                  return (
                    <button
                      key={day}
                      ref={active ? monthlyDayRef : null}
                      type="button"
                      onClick={() => setMonthlyDay(day)}
                      style={{
                        flex: '0 0 calc(25% - 4px)',
                        border: 'none',
                        background: active ? 'var(--primary)' : 'transparent',
                        color: active ? '#05263b' : 'var(--muted)',
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: 'pointer',
                        padding: '4px 0'
                      }}
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
            <div
              style={{
                borderRadius: 12,
                border: '1px solid var(--border)',
                padding: '10px 12px',
                fontSize: 14,
                background: 'rgba(15,23,42,0.6)'
              }}
            >
              {firstDate}
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              * 基于当前日期和所选周期/扣款日自动计算：每日=当天；每周/每两周=从今天起最近的所选工作日；每月=从今天起最近的所选日期（1-28日）。
            </div>
          </div>

          <div className="row" style={{ gap: 12, marginTop: 12 }}>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text)' }}
            >
              取消
            </button>
            <button
              type="submit"
              className="button"
              disabled={!isValid()}
              style={{ flex: 1, opacity: isValid() ? 1 : 0.6 }}
            >
              保存定投
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

