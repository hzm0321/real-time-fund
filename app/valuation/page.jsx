'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isArray, isNil } from 'lodash';
import { RefreshCw } from 'lucide-react';

const getSnapshotUrl = () => {
  if (typeof window === 'undefined') return '/valuation-latest.json';
  const marker = '/valuation';
  const pathname = window.location.pathname || '';
  const markerIndex = pathname.indexOf(marker);
  const basePath = markerIndex >= 0 ? pathname.slice(0, markerIndex) : '';
  return `${basePath}/valuation-latest.json`;
};

const formatPercent = (value) => {
  if (isNil(value) || !Number.isFinite(Number(value))) return '--';
  const num = Number(value);
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
};

const formatNumber = (value, digits = 4) => {
  if (isNil(value) || !Number.isFinite(Number(value))) return '--';
  return Number(value).toFixed(digits);
};

const trendClassName = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'valuation-trend neutral';
  if (num > 0) return 'valuation-trend up';
  if (num < 0) return 'valuation-trend down';
  return 'valuation-trend neutral';
};

const EmptyState = ({ message }) => <div className="valuation-empty">{message}</div>;

const AssetTable = ({ title, rows, type }) => (
  <section className="valuation-card">
    <div className="valuation-card-title">
      <h2>{title}</h2>
      <span>{rows.length} 项</span>
    </div>
    {rows.length === 0 ? (
      <EmptyState message="暂未配置数据" />
    ) : (
      <div className="valuation-table-wrap">
        <table className="valuation-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>代码</th>
              <th>{type === 'fund' ? '估算净值' : '现价'}</th>
              <th>涨跌幅</th>
              <th>{type === 'fund' ? '估值时间' : '更新时间'}</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${type}-${row.code}`}>
                <td>{row.name || '--'}</td>
                <td>{row.code || '--'}</td>
                <td>{formatNumber(type === 'fund' ? row.gsz : row.price, type === 'fund' ? 4 : 2)}</td>
                <td className={trendClassName(type === 'fund' ? row.gszzl : row.changePercent)}>
                  {formatPercent(type === 'fund' ? row.gszzl : row.changePercent)}
                </td>
                <td>{type === 'fund' ? row.gztime || '--' : row.time || '--'}</td>
                <td>{row.error ? <span className="valuation-error">{row.error}</span> : '正常'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export default function ValuationSnapshotPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const snapshotUrl = useMemo(() => getSnapshotUrl(), []);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${snapshotUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSnapshot(data);
    } catch (err) {
      setSnapshot(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [snapshotUrl]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const funds = isArray(snapshot?.funds) ? snapshot.funds : [];
  const stocks = isArray(snapshot?.stocks) ? snapshot.stocks : [];

  return (
    <main className="valuation-page">
      <div className="valuation-hero">
        <div>
          <p className="valuation-kicker">企业微信定时推送</p>
          <h1>14:30 自选估值快照</h1>
          <p className="valuation-subtitle">
            展示 GitHub Actions 每个交易日北京时间 14:30 生成并推送的基金、股票/指数估值结果。
          </p>
        </div>
        <button className="valuation-refresh" type="button" onClick={loadSnapshot} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'valuation-spin' : ''} />
          刷新
        </button>
      </div>

      <section className="valuation-meta">
        <div>
          <span>生成时间</span>
          <strong>{snapshot?.generatedAtBeijing || '--'}</strong>
        </div>
        <div>
          <span>推送状态</span>
          <strong>{snapshot?.wecom?.skipped ? '未配置 webhook，已跳过' : snapshot ? '已处理' : '--'}</strong>
        </div>
        <div>
          <span>数据源</span>
          <strong>天天基金 / 腾讯财经</strong>
        </div>
      </section>

      {loading ? <EmptyState message="正在加载定时估值数据..." /> : null}
      {!loading && error ? <EmptyState message={`暂无定时估值数据：${error}`} /> : null}
      {!loading && !error ? (
        <div className="valuation-grid">
          <AssetTable title="基金估值" rows={funds} type="fund" />
          <AssetTable title="股票 / 指数行情" rows={stocks} type="stock" />
        </div>
      ) : null}

      <style jsx>{`
        .valuation-page {
          min-height: 100vh;
          padding: 32px;
          color: var(--foreground, #111827);
          background:
            radial-gradient(circle at top left, rgba(59, 130, 246, 0.18), transparent 32rem),
            radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.14), transparent 30rem),
            var(--background, #f8fafc);
        }

        .valuation-hero,
        .valuation-card,
        .valuation-meta,
        .valuation-empty {
          border: 1px solid rgba(255, 255, 255, 0.38);
          background: rgba(255, 255, 255, 0.66);
          box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(18px);
          border-radius: 24px;
        }

        .valuation-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 28px;
          margin: 0 auto 20px;
          max-width: 1180px;
        }

        .valuation-kicker {
          margin: 0 0 8px;
          color: #2563eb;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.08em;
        }

        .valuation-hero h1 {
          margin: 0;
          font-size: 34px;
          line-height: 1.2;
        }

        .valuation-subtitle {
          max-width: 720px;
          margin: 12px 0 0;
          color: #64748b;
          line-height: 1.7;
        }

        .valuation-refresh {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 0;
          border-radius: 999px;
          padding: 10px 16px;
          color: #fff;
          background: linear-gradient(135deg, #2563eb, #14b8a6);
          cursor: pointer;
          transition:
            transform 0.2s ease,
            opacity 0.2s ease;
        }

        .valuation-refresh:disabled {
          opacity: 0.7;
          cursor: wait;
        }

        .valuation-refresh:not(:disabled):hover {
          transform: translateY(-1px);
        }

        .valuation-spin {
          animation: valuation-spin 1s linear infinite;
        }

        .valuation-meta {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          max-width: 1180px;
          margin: 0 auto 20px;
          padding: 18px;
        }

        .valuation-meta div {
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.56);
        }

        .valuation-meta span {
          display: block;
          margin-bottom: 6px;
          color: #64748b;
          font-size: 13px;
        }

        .valuation-meta strong {
          font-size: 15px;
        }

        .valuation-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          max-width: 1180px;
          margin: 0 auto;
        }

        .valuation-card {
          padding: 22px;
          overflow: hidden;
        }

        .valuation-card-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .valuation-card-title h2 {
          margin: 0;
          font-size: 20px;
        }

        .valuation-card-title span {
          color: #64748b;
          font-size: 13px;
        }

        .valuation-table-wrap {
          overflow-x: auto;
        }

        .valuation-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
        }

        .valuation-table th,
        .valuation-table td {
          padding: 12px 10px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.22);
          text-align: left;
          white-space: nowrap;
        }

        .valuation-table th {
          color: #64748b;
          font-size: 13px;
          font-weight: 600;
        }

        .valuation-trend.up {
          color: #dc2626;
          font-weight: 700;
        }

        .valuation-trend.down {
          color: #16a34a;
          font-weight: 700;
        }

        .valuation-trend.neutral {
          color: #64748b;
        }

        .valuation-error {
          color: #d97706;
        }

        .valuation-empty {
          max-width: 1180px;
          margin: 0 auto 20px;
          padding: 24px;
          color: #64748b;
          text-align: center;
        }

        @keyframes valuation-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 640px) {
          .valuation-page {
            padding: 16px;
          }

          .valuation-hero {
            flex-direction: column;
            align-items: flex-start;
            padding: 20px;
            border-radius: 20px;
          }

          .valuation-hero h1 {
            font-size: 26px;
          }

          .valuation-refresh {
            width: 100%;
            justify-content: center;
          }

          .valuation-meta {
            grid-template-columns: 1fr;
          }

          .valuation-card {
            padding: 16px;
            border-radius: 20px;
          }
        }
      `}</style>
    </main>
  );
}
