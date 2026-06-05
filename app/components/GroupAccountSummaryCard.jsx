'use client';
import { isArray, isFunction } from 'lodash';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/**
 * 分组账户汇总卡片（只读展示，不包含任何持仓编辑/交易入口）
 */
function formatSignedAmount(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  const r = Number(value.toFixed(decimals));
  const abs = Math.abs(r).toFixed(decimals);
  if (r > 0) return `+${abs}`;
  if (r < 0) return `-${abs}`;
  return abs;
}

function formatSignedPercent(pct, decimals = 2) {
  if (!Number.isFinite(pct)) return '—';
  const r = Number(pct.toFixed(decimals));
  const abs = Math.abs(r).toFixed(decimals);
  if (r > 0) return `+${abs}%`;
  if (r < 0) return `-${abs}%`;
  return `${abs}%`;
}

function formatAmountPlain(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.abs(value).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/** 与 formatSignedAmount / 百分比展示相同小数位对齐，避免显示为 0.00 却仍按微正负着色 */
function roundedForDisplayTone(v, decimals = 2) {
  if (v == null || !Number.isFinite(v)) return null;
  return Number(v.toFixed(decimals));
}

/** 返回 className + 内联 color，避免 Tailwind 等覆盖 .muted/.up/.down 导致「改色无效」 */
function toneSignedAmount(v, decimals = 2) {
  const r = roundedForDisplayTone(v, decimals);
  if (r == null || r === 0) {
    return { className: 'muted', color: 'var(--muted)' };
  }
  if (r > 0) {
    return { className: 'up', color: 'var(--danger)' };
  }
  return { className: 'down', color: 'var(--success)' };
}

function tonePercent(pct, decimals = 2) {
  const r = roundedForDisplayTone(pct, decimals);
  if (r == null || r === 0) {
    return { className: 'muted', color: 'var(--muted)' };
  }
  if (r > 0) {
    return { className: 'up', color: 'var(--danger)' };
  }
  return { className: 'down', color: 'var(--success)' };
}

/** 分组汇总卡片标题左侧：账本轮廓 + 迷你走势，颜色跟随主题 --primary */
function GroupCardTitleIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M5 6.5C5 5.67157 5.67157 5 6.5 5H9.17157C9.70201 5 10.2107 5.21071 10.5858 5.58579L11.4142 6.41421C11.7893 6.78929 12.298 7 12.8284 7H17.5C18.3284 7 19 7.67157 19 8.5V17.5C19 18.3284 18.3284 19 17.5 19H6.5C5.67157 19 5 18.3284 5 17.5V6.5Z"
        stroke="var(--primary)"
        strokeWidth="1.35"
        strokeLinejoin="round"
        fill="var(--primary)"
        fillOpacity={0.1}
      />
      <path
        d="M7.5 14.5L10 12l2 2.5L16.5 9"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16.5" cy="9" r="1.15" fill="var(--primary)" />
      <circle cx="12" cy="14.5" r="1.15" fill="var(--primary)" />
      <circle cx="10" cy="12" r="1.15" fill="var(--primary)" />
      <circle cx="7.5" cy="14.5" r="1.15" fill="var(--primary)" />
    </svg>
  );
}

function Sparkline({ series, className = '' }) {
  if (!isArray(series) || series.length < 2) return null;
  const values = series.map((p) => Number(p?.earnings)).filter((n) => Number.isFinite(n));
  if (values.length < 2) return null;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const w = 96;
  const h = 40;
  const pad = 2;
  const innerW = w - 2 * pad;
  const innerH = h - 2 * pad;
  const pts = series.map((p, i) => {
    const v = Number(p?.earnings);
    const t = series.length > 1 ? i / (series.length - 1) : 0;
    const x = pad + t * innerW;
    const y = pad + (1 - (v - min) / (max - min)) * innerH;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  });
  const last = values[values.length - 1];
  const first = values[0];
  const stroke = last >= first ? 'var(--danger)' : 'var(--success)';
  return (
    <svg width={w} height={h} className={className} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function GroupAccountSummaryCard({
  /** 与首页 `` 一致：true 为移动布局，false 为 PC */
  /** 点击整张卡片时回调（如切换到对应分组 / 「全部」） */
  onActivate,
  groupName,
  totalAsset,
  holdingReturn,
  holdingReturnPercent,
  accountReturn,
  accountReturnPercent,
  hasAnyTodayData,
  upCount = 0,
  downCount = 0,
  sparkSeries = [],
  masked = false
}) {
  const isMobile = useIsMobile();
  const holdingTone = toneSignedAmount(holdingReturn, 2);
  const holdingPctTone = tonePercent(holdingReturnPercent, 2);
  const accountTone = hasAnyTodayData
    ? toneSignedAmount(accountReturn, 2)
    : { className: 'muted', color: 'var(--muted)' };
  const accountPctTone = hasAnyTodayData
    ? tonePercent(accountReturnPercent, 2)
    : { className: 'muted', color: 'var(--muted)' };

  const interactive = isFunction(onActivate);

  return (
    <div
      className="glass card"
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `切换到${groupName || '分组'}` : undefined}
      onClick={interactive ? () => onActivate() : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
      style={{
        marginBottom: 6,
        padding: isMobile ? '10px 10px' : '10px 12px',
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 12,
        cursor: interactive ? 'pointer' : undefined,
        outlineOffset: interactive ? 2 : undefined
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, minWidth: 0 }}>
          <span style={{ display: 'flex', flexShrink: 0, lineHeight: 0 }} aria-hidden>
            <GroupCardTitleIcon size={isMobile ? 20 : 22} />
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {groupName}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="up">
                {upCount}
                <span style={{ marginLeft: 2 }}>▲</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>估算上涨</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="down">
                {downCount}
                <span style={{ marginLeft: 2 }}>▼</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>估算下跌</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
            账户资产
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {masked ? <span className="mask-text">******</span> : formatAmountPlain(totalAsset ?? 0, 2)}
          </div>
        </div>
        <Sparkline series={sparkSeries} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: isMobile ? 10 : 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
            持有收益
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              className={holdingTone.className}
              style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: holdingTone.color }}
            >
              {masked ? <span className="mask-text">******</span> : formatSignedAmount(holdingReturn ?? 0, 2)}
            </span>
            {!masked && (
              <span
                className={holdingPctTone.className}
                style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  color: holdingPctTone.color
                }}
              >
                {formatSignedPercent(holdingReturnPercent, 2)}
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>
            当日收益
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span
              className={accountTone.className}
              style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: accountTone.color }}
            >
              {masked ? (
                <span className="mask-text">******</span>
              ) : !hasAnyTodayData ? (
                '--'
              ) : (
                formatSignedAmount(accountReturn ?? 0, 2)
              )}
            </span>
            {!masked && hasAnyTodayData && (
              <span
                className={accountPctTone.className}
                style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  color: accountPctTone.color
                }}
              >
                {formatSignedPercent(accountReturnPercent, 2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
