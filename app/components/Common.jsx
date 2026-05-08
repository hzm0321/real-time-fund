'use client';

import { useState } from 'react';
import Image from 'next/image';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import zhifubaoImg from "../assets/zhifubao.jpg";
import weixinImg from "../assets/weixin.jpg";
import { CalendarIcon, MinusIcon, PlusIcon, TrendUpIcon, TrendDownIcon } from './Icons';

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

export function ConsecutiveTrendBadge({ trend }) {
  if (!trend || !trend.type || !trend.days || trend.days < 3) return null;

  const isUp = trend.type === 'up';
  // 连涨红(danger)，连跌绿(success)
  const color = isUp ? 'var(--danger)' : 'var(--success)';
  const Icon = isUp ? TrendUpIcon : TrendDownIcon;

  return (
    <span
      className="consecutive-trend-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '1px',
        color: color,
        fontSize: '11px',
        fontWeight: 'bold',
        marginRight: '4px',
        verticalAlign: 'middle',
        position: 'relative',
        bottom: '1px',
      }}
      title={`连续${trend.days}天${isUp ? '上涨' : '下跌'}`}
    >
      <Icon width="12" height="12" />
      <span style={{ lineHeight: 1 }}>{trend.days}</span>
    </span>
  );
}

export function DatePicker({ value, onChange, position = 'bottom', minDate }) {
  const [open, setOpen] = useState(false);
  const today = nowInTz().startOf('day');
  const selected = value ? toTz(value).toDate() : undefined;
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];

  const disabled = minDate
    ? { before: toTz(minDate).startOf('day').toDate() }
    : { after: today.toDate() };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="input date-picker-trigger w-full justify-between font-normal"
        >
          <span>{value || '选择日期'}</span>
          <CalendarIcon width="16" height="16" className="muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="date-picker-dropdown glass card w-auto overflow-hidden p-0 !z-[13000]"
        align="start"
        side={position === 'top' ? 'top' : 'bottom'}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          formatters={{
            formatWeekdayName: (date) => weekdayLabels[date.getDay()],
          }}
          classNames={{
            dropdown_root:
              "relative rounded-md border-0 shadow-none has-focus:border-0 has-focus:ring-0",
            today:
              "rounded-md bg-primary/15 text-primary data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground",
          }}
          disabled={disabled}
          onSelect={(d) => {
            if (!d) return;
            const next = toTz(d).startOf('day');
            if (minDate && next.isBefore(toTz(minDate).startOf('day'))) return;
            if (!minDate && next.isAfter(today)) return;
            onChange(formatDate(next));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
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
