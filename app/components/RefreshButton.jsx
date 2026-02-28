'use client';

import { useEffect, useState } from "react";
import { RefreshIcon } from './Icons';

export default function RefreshButton({ refreshCycleStartRef, refreshMs, manualRefresh, refreshing, fundsLength }) {

  // 刷新周期进度 0~1，用于环形进度条
  const [refreshProgress, setRefreshProgress] = useState(0);

  // 刷新进度条：每 100ms 更新一次进度
  useEffect(() => {
    if (fundsLength === 0 || refreshMs <= 0) return;
    const t = setInterval(() => {
      const elapsed = Date.now() - refreshCycleStartRef.current;
      const p = Math.min(1, elapsed / refreshMs);
      setRefreshProgress(p);
    }, 100);
    return () => clearInterval(t);
  }, [fundsLength, refreshMs]);

  return (
    <div
      className="refresh-btn-wrap"
      style={{ '--progress': refreshProgress }}
      title={`刷新周期 ${Math.round(refreshMs / 1000)} 秒`}
    >
      <button
        className="icon-button"
        aria-label="立即刷新"
        onClick={manualRefresh}
        disabled={refreshing || fundsLength === 0}
        aria-busy={refreshing}
        title="立即刷新"
      >
        <RefreshIcon className={refreshing ? 'spin' : ''} width="18" height="18" />
      </button>
    </div>
  );
}
