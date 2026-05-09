'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, X, Search, Wallet } from 'lucide-react';
import { fetchSectorFlowKline, searchSectorsByRelatedSector } from '../api/fund';

export default function SectorFlowModal({
  open,
  onClose,
  sectors,
  onAddSector,
  onRemoveSector,
  onSectorClick,
}) {
  const [activeTab, setActiveTab] = useState('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // 组件挂载/更新日志 - 只在open变化时打印
  useEffect(() => {
    console.log('[SectorFlowModal] open变化:', open, '时间:', Date.now());
    if (!open) {
      setActiveTab('list');
      setSearchTerm('');
      setSearchResults([]);
    }
  }, [open]);

  const searchSectors = useCallback(async (term) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchSectorsByRelatedSector(term.trim(), { limit: 20 });

      if (results.length > 0) {
        const mappedResults = results
          .filter(item => item.secid != null)
          .map(item => ({
            name: item.related_sector,
            secid: item.secid,
            code: item.secid.split('.')[1] || '',
            market: item.secid.split('.')[0] || ''
          }))
          .filter(s => !sectors.some(us => us.name === s.name));

        setSearchResults(mappedResults);
      } else {
        setSearchResults([]);
      }
    } catch (e) {
      console.error('[SectorFlowModal] 搜索失败:', e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [sectors]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchSectors(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchSectors]);

  // 只在open为true时计算排序，避免后台重复计算
  const sortedSectors = useMemo(() => {
    if (!open) return [];
    return [...sectors].sort((a, b) => (b.fundFlow || 0) - (a.fundFlow || 0));
  }, [sectors, open]);

  const handleAdd = async (sector) => {
    try {
      // 使用 fetchSectorFlowKline 获取准确的资金流向数据
      const flowData = await fetchSectorFlowKline(sector.secid);
      onAddSector({
        ...sector,
        // 使用 mainFlow 作为 fundFlow（主力净流入）
        fundFlow: flowData?.mainFlow || 0,
        // 保留其他可能的数据
        change: 0 // 涨跌幅需要另外获取
      });
    } catch {
      onAddSector(sector);
    }
    setSearchTerm('');
    setActiveTab('list');
  };

  const formatFund = (val) => {
    if (!val && val !== 0) return '-';
    const billion = val / 100000000;
    return `${billion >= 0 ? '+' : ''}${billion.toFixed(2)}亿`;
  };

  // 如果弹框未打开，返回null不渲染任何内容
  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="glass card"
        style={{ maxWidth: '480px', maxHeight: '80vh', overflow: 'hidden' }}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wallet width="20" height="20" style={{ color: 'var(--success)' }} />
              板块资金流向
            </span>
            <button
              onClick={onClose}
              className="icon-button"
              style={{ background: 'transparent', border: 'none' }}
              aria-label="关闭"
            >
              <X width="18" height="18" />
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-row" style={{ gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <button
            className={`button ${activeTab === 'list' ? '' : 'secondary'}`}
            onClick={() => setActiveTab('list')}
            style={{ flex: 1, fontSize: '13px' }}
          >
            我的板块 ({sectors.length})
          </button>
          <button
            className={`button ${activeTab === 'search' ? '' : 'secondary'}`}
            onClick={() => { setActiveTab('search'); setSearchTerm(''); }}
            style={{ flex: 1, fontSize: '13px' }}
          >
            <Plus width="14" height="14" style={{ marginRight: 4 }} />
            添加板块
          </button>
        </div>

        {activeTab === 'list' ? (
          <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {sortedSectors.length === 0 ? (
              <div className="muted" style={{ textAlign: 'center', padding: '40px 20px' }}>
                暂无板块，点击「添加板块」搜索添加
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedSectors.map((sector) => (
                  <div
                    key={sector.name}
                    className="glass"
                    onClick={() => onSectorClick?.(sector)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--glass-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: 4 }}>
                        {sector.name}
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: '13px' }}>
                        <span className={sector.change >= 0 ? 'up' : 'down'}>
                          {sector.change >= 0 ? '+' : ''}{sector.change?.toFixed(2) || '0.00'}%
                        </span>
                        <span style={{ color: sector.fundFlow >= 0 ? 'var(--danger)' : 'var(--success)' }}>
                          资金{sector.fundFlow >= 0 ? '流入' : '流出'} {formatFund(sector.fundFlow)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSector(sector.name);
                      }}
                      className="icon-button"
                      style={{ background: 'transparent', border: 'none', color: 'var(--muted)' }}
                      aria-label="删除"
                    >
                      <X width="16" height="16" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Search width="16" height="16" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="搜索板块名称，如：CPO、半导体..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input"
                style={{ paddingLeft: 40, width: '100%' }}
                autoFocus
              />
            </div>

            <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
              {isSearching ? (
                <div className="muted" style={{ textAlign: 'center', padding: '30px 20px' }}>
                  搜索中...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="muted" style={{ textAlign: 'center', padding: '30px 20px' }}>
                  {searchTerm ? '未找到相关板块' : '输入板块名称搜索，如：CPO、半导体'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {searchResults.map((sector) => (
                    <div
                      key={sector.name}
                      className="glass"
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid var(--border)',
                        cursor: 'pointer'
                      }}
                      onClick={() => handleAdd(sector)}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{sector.name}</div>
                        <div className="muted" style={{ fontSize: '12px', marginTop: 2 }}>
                          {sector.code}
                        </div>
                      </div>
                      <Plus width="18" height="18" style={{ color: 'var(--success)' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
