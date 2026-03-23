'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import zhifubaoImg from "../assets/zhifubao.jpg";
import weixinImg from "../assets/weixin.jpg";
import { CalendarIcon, MinusIcon, PlusIcon } from './Icons';

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

export function DatePicker({ value, onChange, position = 'bottom' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => value ? toTz(value) : nowInTz());

  useEffect(() => {
    const close = () => setIsOpen(false);
    if (isOpen) window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [isOpen]);

  const year = currentMonth.year();
  const month = currentMonth.month();

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(currentMonth.subtract(1, 'month').startOf('month'));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(currentMonth.add(1, 'month').startOf('month'));
  };

  const handleSelect = (e, day) => {
    e.stopPropagation();
    const dateStr = formatDate(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

    const today = nowInTz().startOf('day');
    const selectedDate = toTz(dateStr).startOf('day');

    if (selectedDate.isAfter(today)) return;

    onChange(dateStr);
    setIsOpen(false);
  };

  const daysInMonth = currentMonth.daysInMonth();
  const firstDayOfWeek = currentMonth.startOf('month').day();

  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  return (
    <div className="date-picker" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <div
        className="date-picker-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{value || '选择日期'}</span>
        <CalendarIcon width="16" height="16" className="muted" />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: position === 'top' ? -10 : 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: position === 'top' ? -10 : 10, scale: 0.95 }}
            className="date-picker-dropdown glass card"
            style={{
              position: 'absolute',
              ...(position === 'top' ? { bottom: '100%', marginBottom: 8 } : { top: '100%', marginTop: 8 }),
              left: 0,
              width: '100%',
              padding: 12,
              zIndex: 10
            }}
          >
            <div className="calendar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <button type="button" onClick={handlePrevMonth} className="icon-button" style={{ width: 24, height: 24 }}>&lt;</button>
              <span style={{ fontWeight: 600 }}>{year}年 {month + 1}月</span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="icon-button"
                style={{ width: 24, height: 24 }}
              >
                &gt;
              </button>
            </div>

            <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
              {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                <div key={d} className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>{d}</div>
              ))}
              {days.map((d, i) => {
                if (!d) return <div key={i} />;
                const dateStr = formatDate(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
                const isSelected = value === dateStr;
                const today = nowInTz().startOf('day');
                const current = toTz(dateStr).startOf('day');
                const isToday = current.isSame(today);
                const isFuture = current.isAfter(today);

                return (
                  <div
                    key={i}
                    className={`date-picker-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}`}
                    onClick={(e) => !isFuture && handleSelect(e, d)}
                  >
                    {d}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DonateTabs() {
  const [method, setMethod] = useState('wechat');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div className="tabs glass" style={{ padding: 4, borderRadius: 12, width: '100%', display: 'flex' }}>
        <button
          onClick={() => setMethod('alipay')}
          style={{
            flex: 1,
            padding: '8px 0',
            border: 'none',
            background: method === 'alipay' ? 'rgba(34, 211, 238, 0.15)' : 'transparent',
            color: method === 'alipay' ? 'var(--primary)' : 'var(--muted)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.2s ease'
          }}
        >
          支付宝
        </button>
        <button
          onClick={() => setMethod('wechat')}
          style={{
            flex: 1,
            padding: '8px 0',
            border: 'none',
            background: method === 'wechat' ? 'rgba(34, 211, 238, 0.15)' : 'transparent',
            color: method === 'wechat' ? 'var(--primary)' : 'var(--muted)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.2s ease'
          }}
        >
          微信支付
        </button>
      </div>

      <div
        style={{
          width: 200,
          height: 200,
          background: 'white',
          borderRadius: 12,
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          {method === 'alipay' ? (
            <Image
              src={zhifubaoImg}
              alt="支付宝收款码"
              fill
              sizes="184px"
              style={{ objectFit: 'contain' }}
            />
          ) : (
            <Image
              src={weixinImg}
              alt="微信收款码"
              fill
              sizes="184px"
              style={{ objectFit: 'contain' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function NumericInput({ value, onChange, step = 1, min = 0, placeholder }) {
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  const fmt = (n) => Number(n).toFixed(decimals);
  const inc = () => {
    const v = parseFloat(value);
    const base = isNaN(v) ? 0 : v;
    const next = base + step;
    onChange(fmt(next));
  };
  const dec = () => {
    const v = parseFloat(value);
    const base = isNaN(v) ? 0 : v;
    const next = Math.max(min, base - step);
    onChange(fmt(next));
  };
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className="input no-zoom"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', paddingRight: 56 }}
      />
      <div style={{ position: 'absolute', right: 6, top: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className="icon-button" type="button" onClick={inc} style={{ width: 44, height: 16, padding: 0 }}>
          <PlusIcon width="14" height="14" />
        </button>
        <button className="icon-button" type="button" onClick={dec} style={{ width: 44, height: 16, padding: 0 }}>
          <MinusIcon width="14" height="14" />
        </button>
      </div>
    </div>
  );
}

export function Stat({ label, value, delta }) {
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
  return (
    <div className="stat" style={{ flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span className="label" style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span className={`value ${dir}`} style={{ fontSize: '15px', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
