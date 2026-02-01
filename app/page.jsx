'use client';

import { useEffect, useRef, useState } from 'react';

function PlusIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6l1-2h6l1 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 6l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M19.4 15a7.97 7.97 0 0 0 .1-2l2-1.5-2-3.5-2.3.5a8.02 8.02 0 0 0-1.7-1l-.4-2.3h-4l-.4 2.3a8.02 8.02 0 0 0-1.7 1l-2.3-.5-2 3.5 2 1.5a7.97 7.97 0 0 0 .1 2l-2 1.5 2 3.5 2.3-.5a8.02 8.02 0 0 0 1.7 1l.4 2.3h4l.4-2.3a8.02 8.02 0 0 0 1.7-1l2.3.5 2-3.5-2-1.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 0 1 12.5-6.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 5h3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12a8 8 0 0 1-12.5 6.9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 19H5v-3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ChevronIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon({ filled, ...props }) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={filled ? "var(--accent)" : "none"}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value, delta }) {
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className={`value ${dir}`}>{value}</span>
      {typeof delta === 'number' && (
        <span className={`badge ${dir}`}>
          {delta > 0 ? '↗' : delta < 0 ? '↘' : '—'} {Math.abs(delta).toFixed(2)}%
        </span>
      )}
    </div>
  );
}

export default function HomePage() {
  const [funds, setFunds] = useState([]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  
  // 刷新频率状态
  const [refreshMs, setRefreshMs] = useState(30000);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSeconds, setTempSeconds] = useState(30);

  // 全局刷新状态
  const [refreshing, setRefreshing] = useState(false);

  // 收起/展开状态
  const [collapsedCodes, setCollapsedCodes] = useState(new Set());

  // 自选状态
  const [favorites, setFavorites] = useState(new Set());
  const [currentTab, setCurrentTab] = useState('all');

  const toggleFavorite = (code) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      localStorage.setItem('favorites', JSON.stringify(Array.from(next)));
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
      localStorage.setItem('collapsedCodes', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('funds') || '[]');
      if (Array.isArray(saved) && saved.length) {
        setFunds(saved);
        refreshAll(saved.map((f) => f.code));
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
      // 加载自选状态
      const savedFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (Array.isArray(savedFavorites)) {
        setFavorites(new Set(savedFavorites));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const codes = funds.map((f) => f.code);
      if (codes.length) refreshAll(codes);
    }, refreshMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [funds, refreshMs]);

  // --- 辅助：JSONP 数据抓取逻辑 ---
  const loadScript = (url) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => {
        document.body.removeChild(script);
        resolve();
      };
      script.onerror = () => {
        document.body.removeChild(script);
        reject(new Error('数据加载失败'));
      };
      document.body.appendChild(script);
    });
  };

  const fetchFundData = async (c) => {
    return new Promise(async (resolve, reject) => {
      // 腾讯接口识别逻辑优化
      const getTencentPrefix = (code) => {
        if (code.startsWith('6') || code.startsWith('9')) return 'sh';
        if (code.startsWith('0') || code.startsWith('3')) return 'sz';
        if (code.startsWith('4') || code.startsWith('8')) return 'bj';
        return 'sz';
      };

      const gzUrl = `https://fundgz.1234567.com.cn/js/${c}.js?rt=${Date.now()}`;
      
      // 使用更安全的方式处理全局回调，避免并发覆盖
      const currentCallback = `jsonpgz_${c}_${Math.random().toString(36).slice(2, 7)}`;
      
      // 动态拦截并处理 jsonpgz 回调
      const scriptGz = document.createElement('script');
      // 东方财富接口固定调用 jsonpgz，我们通过修改全局变量临时捕获它
      scriptGz.src = gzUrl;
      
      const originalJsonpgz = window.jsonpgz;
      window.jsonpgz = (json) => {
        window.jsonpgz = originalJsonpgz; // 立即恢复
        const gszzlNum = Number(json.gszzl);
        const gzData = {
          code: json.fundcode,
          name: json.name,
          dwjz: json.dwjz,
          gsz: json.gsz,
          gztime: json.gztime,
          gszzl: Number.isFinite(gszzlNum) ? gszzlNum : json.gszzl
        };
        
        // 获取重仓股票列表
        const holdingsUrl = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${c}&topline=10&year=&month=&rt=${Date.now()}`;
        loadScript(holdingsUrl).then(async () => {
          let holdings = [];
          const html = window.apidata?.content || '';
          const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
          for (const r of rows) {
            const cells = (r.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi) || []).map(td => td.replace(/<[^>]*>/g, '').trim());
            const codeIdx = cells.findIndex(txt => /^\d{6}$/.test(txt));
            const weightIdx = cells.findIndex(txt => /\d+(?:\.\d+)?\s*%/.test(txt));
            if (codeIdx >= 0 && weightIdx >= 0) {
              holdings.push({
                code: cells[codeIdx],
                name: cells[codeIdx + 1] || '',
                weight: cells[weightIdx],
                change: null
              });
            }
          }
          
          holdings = holdings.slice(0, 10);
          
          if (holdings.length) {
            try {
              const tencentCodes = holdings.map(h => `s_${getTencentPrefix(h.code)}${h.code}`).join(',');
              const quoteUrl = `https://qt.gtimg.cn/q=${tencentCodes}`;
              
              await new Promise((resQuote) => {
                const scriptQuote = document.createElement('script');
                scriptQuote.src = quoteUrl;
                scriptQuote.onload = () => {
                  holdings.forEach(h => {
                    const varName = `v_s_${getTencentPrefix(h.code)}${h.code}`;
                    const dataStr = window[varName];
                    if (dataStr) {
                      const parts = dataStr.split('~');
                      // parts[5] 是涨跌幅
                      if (parts.length > 5) {
                        h.change = parseFloat(parts[5]);
                      }
                    }
                  });
                  if (document.body.contains(scriptQuote)) document.body.removeChild(scriptQuote);
                  resQuote();
                };
                scriptQuote.onerror = () => {
                  if (document.body.contains(scriptQuote)) document.body.removeChild(scriptQuote);
                  resQuote();
                };
                document.body.appendChild(scriptQuote);
              });
            } catch (e) {
              console.error('获取股票涨跌幅失败', e);
            }
          }
          
          resolve({ ...gzData, holdings });
        }).catch(() => resolve({ ...gzData, holdings: [] }));
      };

      scriptGz.onerror = () => {
        window.jsonpgz = originalJsonpgz;
        if (document.body.contains(scriptGz)) document.body.removeChild(scriptGz);
        reject(new Error('基金数据加载失败'));
      };

      document.body.appendChild(scriptGz);
      // 加载完立即移除脚本
      setTimeout(() => {
        if (document.body.contains(scriptGz)) document.body.removeChild(scriptGz);
      }, 5000);
    });
  };

  const refreshAll = async (codes) => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 改用串行请求，避免全局回调 jsonpgz 并发冲突
      const updated = [];
      for (const c of codes) {
        try {
          const data = await fetchFundData(c);
          updated.push(data);
        } catch (e) {
          console.error(`刷新基金 ${c} 失败`, e);
          // 失败时保留旧数据
          const old = funds.find(f => f.code === c);
          if (old) updated.push(old);
        }
      }
      if (updated.length) {
        setFunds(updated);
        localStorage.setItem('funds', JSON.stringify(updated));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const addFund = async (e) => {
    e.preventDefault();
    setError('');
    const clean = code.trim();
    if (!clean) {
      setError('请输入基金编号');
      return;
    }
    if (funds.some((f) => f.code === clean)) {
      setError('该基金已添加');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchFundData(clean);
      const next = [data, ...funds];
      setFunds(next);
      localStorage.setItem('funds', JSON.stringify(next));
      setCode('');
    } catch (e) {
      setError(e.message || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  const removeFund = (removeCode) => {
    const next = funds.filter((f) => f.code !== removeCode);
    setFunds(next);
    localStorage.setItem('funds', JSON.stringify(next));

    // 同步删除展开收起状态
    setCollapsedCodes(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      localStorage.setItem('collapsedCodes', JSON.stringify(Array.from(nextSet)));
      return nextSet;
    });

    // 同步删除自选状态
    setFavorites(prev => {
      if (!prev.has(removeCode)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(removeCode);
      localStorage.setItem('favorites', JSON.stringify(Array.from(nextSet)));
      if (nextSet.size === 0) setCurrentTab('all');
      return nextSet;
    });
  };

  const manualRefresh = async () => {
    if (refreshing) return;
    const codes = funds.map((f) => f.code);
    if (!codes.length) return;
    await refreshAll(codes);
  };

  const saveSettings = (e) => {
    e?.preventDefault?.();
    const ms = Math.max(5, Number(tempSeconds)) * 1000;
    setRefreshMs(ms);
    localStorage.setItem('refreshMs', String(ms));
    setSettingsOpen(false);
  };

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape' && settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  return (
    <div className="container content">
      <div className="navbar glass">
        {refreshing && <div className="loading-bar"></div>}
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="2" />
            <path d="M5 14c2-4 7-6 14-5" stroke="var(--primary)" strokeWidth="2" />
          </svg>
          <span>实时基金估值</span>
        </div>
        <div className="actions">
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
          <button
            className="icon-button"
            aria-label="打开设置"
            onClick={() => setSettingsOpen(true)}
            title="设置"
          >
            <SettingsIcon width="18" height="18" />
          </button>
        </div>
      </div>

      <div className="grid">
        <div className="col-12 glass card add-fund-section" role="region" aria-label="添加基金">
          <div className="title" style={{ marginBottom: 12 }}>
            <PlusIcon width="20" height="20" />
            <span>添加基金</span>
            <span className="muted">输入基金编号（例如：110022）</span>
          </div>
          <form className="form" onSubmit={addFund}>
            <input
              className="input"
              placeholder="基金编号"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
            />
            <button className="button" type="submit" disabled={loading}>
              {loading ? '添加中…' : '添加'}
            </button>
          </form>
          {error && <div className="muted" style={{ marginTop: 8, color: 'var(--danger)' }}>{error}</div>}
        </div>

        <div className="col-12">
          {funds.length > 0 && favorites.size > 0 && (
            <div className="tabs" style={{ marginBottom: 16 }}>
              <button 
                className={`tab ${currentTab === 'all' ? 'active' : ''}`}
                onClick={() => setCurrentTab('all')}
              >
                全部 ({funds.length})
              </button>
              <button 
                className={`tab ${currentTab === 'fav' ? 'active' : ''}`}
                onClick={() => setCurrentTab('fav')}
              >
                自选 ({favorites.size})
              </button>
            </div>
          )}

          {funds.length === 0 ? (
            <div className="glass card empty">尚未添加基金</div>
          ) : (
            <div className="grid">
              {funds
                .filter(f => currentTab === 'all' || favorites.has(f.code))
                .map((f) => (
                <div key={f.code} className="col-6">
                  <div className="glass card">
                    <div className="row" style={{ marginBottom: 10 }}>
                      <div className="title">
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
                        <span>{f.name}</span>
                        <span className="muted">#{f.code}</span>
                      </div>
                      <div className="actions">
                        <div className="badge-v">
                          <span>估值时间</span>
                          <strong>{f.gztime || f.time || '-'}</strong>
                        </div>
                        <button
                          className="icon-button danger"
                          onClick={() => removeFund(f.code)}
                          title="删除"
                        >
                          <TrashIcon width="18" height="18" />
                        </button>
                      </div>
                    </div>
                    <div className="row" style={{ marginBottom: 12 }}>
                      <Stat label="单位净值" value={f.dwjz ?? '—'} />
                      <Stat label="估值净值" value={f.gsz ?? '—'} />
                      <Stat label="涨跌幅" value={typeof f.gszzl === 'number' ? `${f.gszzl.toFixed(2)}%` : f.gszzl ?? '—'} delta={Number(f.gszzl) || 0} />
                    </div>
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
                    {Array.isArray(f.holdings) && f.holdings.length ? (
                      <div className={`list ${collapsedCodes.has(f.code) ? 'collapsed' : ''}`} style={{ 
                        display: collapsedCodes.has(f.code) ? 'none' : 'grid'
                      }}>
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
                      <div className="muted" style={{ display: collapsedCodes.has(f.code) ? 'none' : 'block' }}>暂无重仓数据</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="footer">数据源：实时估值与重仓直连东方财富，无需后端，部署即用</div>

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
                min="5"
                step="5"
                value={tempSeconds}
                onChange={(e) => setTempSeconds(Number(e.target.value))}
                placeholder="自定义秒数"
              />
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="button" onClick={saveSettings}>保存并关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
