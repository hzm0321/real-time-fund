'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Pencil, Search, X, Loader2 } from 'lucide-react';
import { CloseIcon } from './Icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatMoney } from '@/lib/utils';
import { useUserStore } from '@/app/stores';
import { useFundFuzzyMatcher } from '@/app/hooks/useFundFuzzyMatcher';

export default function ScanImportConfirmModal({
  scannedFunds,
  selectedScannedCodes,
  onClose,
  onToggle,
  onEditFund,
  onConfirm,
  onRetryOcr,
  refreshing,
  groups = [],
  existingAllCodes = [],
  existingFavCodes = [],
  isOcrScan = false,
  currentGroup = 'all'
}) {
  const user = useUserStore((s) => s.user);
  const [selectedGroupId, setSelectedGroupId] = useState(currentGroup);
  const [expandAfterAdd, setExpandAfterAdd] = useState(true);
  const [autoDataSource, setAutoDataSource] = useState(!!user);
  const [autoImportTags, setAutoImportTags] = useState(true);
  const allCodeSet = useMemo(() => new Set((existingAllCodes || []).filter(Boolean)), [existingAllCodes]);
  const favCodeSet = useMemo(() => new Set((existingFavCodes || []).filter(Boolean)), [existingFavCodes]);

  // ===== 编辑基金代码相关状态 =====
  const [editingCode, setEditingCode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const { searchFundsLocal } = useFundFuzzyMatcher();
  const searchTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const editPanelRef = useRef(null);

  // 已存在于扫描列表中的代码集合（用于搜索排除）
  const scannedCodeSet = useMemo(
    () => new Set((scannedFunds || []).map((f) => f?.code).filter(Boolean)),
    [scannedFunds]
  );

  // 防抖搜索
  useEffect(() => {
    if (!editingCode) return;
    const query = String(searchQuery ?? '').trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchFundsLocal(query);
        // 排除已出现在确认导入弹框中的基金代码（当前编辑的除外）
        const filtered = (results || []).filter((r) => {
          const code = r?.CODE;
          if (!code) return false;
          if (code === editingCode) return false;
          if (scannedCodeSet.has(code)) return false;
          return true;
        });
        setSearchResults(filtered);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, editingCode, searchFundsLocal, scannedCodeSet]);

  // 进入编辑模式时聚焦输入框
  useEffect(() => {
    if (editingCode && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [editingCode]);

  // 编辑面板高度变化时（进入编辑模式 / 搜索结果更新）自动滚动到可视区域
  useEffect(() => {
    if (!editingCode || !editPanelRef.current) return;
    // 等待 DOM 更新和 AnimatePresence 动画展开后再滚动
    const raf = requestAnimationFrame(() => {
      editPanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [editingCode, searchResults, searching]);

  const handleStartEdit = useCallback((code) => {
    setEditingCode(code);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingCode(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
  }, []);

  const handleSelectFund = useCallback(
    (result) => {
      if (!editingCode || !result?.CODE) return;
      onEditFund?.(editingCode, result.CODE, result.NAME || '');
      handleCancelEdit();
    },
    [editingCode, onEditFund, handleCancelEdit]
  );

  const handleConfirm = () => {
    onConfirm(selectedGroupId, expandAfterAdd, autoDataSource, autoImportTags);
  };

  const formatAmount = (val) => {
    if (!val) return null;
    const num = parseFloat(String(val).replace(/,/g, ''));
    if (isNaN(num)) return null;
    return num;
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="确认导入基金"
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
        style={{ width: 480, maxWidth: '90vw' }}
      >
        <div
          className="title"
          style={{ marginBottom: 12, justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>确认导入基金</span>
            {isOcrScan && (
              <button
                onClick={onRetryOcr}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <RefreshCw width="14" height="14" />
                重新识别
              </button>
            )}
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        {isOcrScan && (
          <div className="ocr-warning" style={{ marginBottom: 12 }}>
            <span>拍照识别方案目前还在优化，请确认识别结果是否正确。</span>
          </div>
        )}
        {scannedFunds.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            未识别到有效的基金代码，请尝试更清晰的截图或手动搜索。
          </div>
        ) : (
          <>
            <div
              className="search-results pending-list scrollbar-y-styled"
              style={{ maxHeight: 360, overflowY: 'auto' }}
            >
              {scannedFunds.map((item) => {
                const isSelected = selectedScannedCodes.has(item.code);
                const isInvalid = item.status === 'invalid';
                const targetGroup = selectedGroupId;
                const inAll = allCodeSet.has(item.code);
                const inFav = favCodeSet.has(item.code);
                const groupCodes =
                  targetGroup && targetGroup !== 'all' && targetGroup !== 'fav'
                    ? groups.find((g) => g.id === targetGroup)?.codes || []
                    : [];
                const inGroup =
                  targetGroup && targetGroup !== 'all' && targetGroup !== 'fav'
                    ? groupCodes.includes(item.code)
                    : false;
                const holdAmounts = formatAmount(item.holdAmounts);
                const holdGains = formatAmount(item.holdGains);
                const hasHoldingData = holdAmounts !== null && holdGains !== null;
                const isAlreadyInTarget = targetGroup === 'all' ? inAll : targetGroup === 'fav' ? inFav : inGroup;
                const isDisabled = (isAlreadyInTarget && !hasHoldingData) || isInvalid;
                const displayName = item.name || (isInvalid ? '未找到基金' : '未知基金');
                const isEditing = editingCode === item.code;

                // 编辑模式：内联搜索面板
                if (isEditing) {
                  return (
                    <div
                      key={item.code}
                      ref={editPanelRef}
                      className="search-item scan-edit-panel"
                      style={{
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        cursor: 'default',
                        background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)'
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className="scan-edit-input-wrap"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}
                      >
                        <Search
                          width="16"
                          height="16"
                          className="muted"
                          style={{ position: 'absolute', left: 10, pointerEvents: 'none' }}
                        />
                        <input
                          ref={searchInputRef}
                          type="text"
                          className="input no-zoom scan-edit-input"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          placeholder="搜索基金名称或代码"
                          style={{
                            width: '100%',
                            paddingLeft: 34,
                            paddingRight: 36,
                            minHeight: 38,
                            height: 38,
                            borderRadius: 10
                          }}
                        />
                        {searching ? (
                          <Loader2
                            width="16"
                            height="16"
                            className="muted"
                            style={{
                              position: 'absolute',
                              right: 40,
                              animation: 'spin 1s linear infinite'
                            }}
                          />
                        ) : null}
                        <button
                          onClick={handleCancelEdit}
                          aria-label="取消编辑"
                          style={{
                            position: 'absolute',
                            right: 8,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 6,
                            transition: 'color 200ms ease, background 200ms ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--text)';
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--muted)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <X width="16" height="16" />
                        </button>
                      </div>
                      <AnimatePresence>
                        {searchQuery.trim().length >= 2 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="scan-edit-results scrollbar-y-styled"
                            style={{
                              marginTop: 8,
                              maxHeight: 200,
                              overflowY: 'auto',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2
                            }}
                          >
                            {searching && searchResults.length === 0 ? (
                              <div className="muted" style={{ fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                                搜索中...
                              </div>
                            ) : searchResults.length === 0 ? (
                              <div className="muted" style={{ fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                                未找到匹配的基金，请尝试其他关键词
                              </div>
                            ) : (
                              searchResults.map((result) => (
                                <div
                                  key={result.CODE}
                                  className="scan-edit-result-item"
                                  onClick={() => handleSelectFund(result)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    transition: 'background 200ms ease',
                                    gap: 8
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                      'color-mix(in srgb, var(--primary) 15%, transparent)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                  }}
                                >
                                  <div className="fund-info" style={{ minWidth: 0, flex: 1 }}>
                                    <span
                                      className="fund-name"
                                      style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {result.NAME}
                                    </span>
                                    <span className="fund-code muted">#{result.CODE}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                }

                // 正常模式：基金信息行
                return (
                  <div
                    key={item.code}
                    className={`search-item ${isSelected ? 'selected' : ''} ${isAlreadyInTarget && !hasHoldingData ? 'added' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (isDisabled) return;
                      onToggle(item.code);
                    }}
                    style={{
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      flexDirection: 'column',
                      alignItems: 'stretch'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="fund-info" style={{ flex: 1, minWidth: 0 }}>
                        <span className="fund-name">{displayName}</span>
                        <span className="fund-code muted">#{item.code}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        {/* 编辑按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(item.code);
                          }}
                          aria-label="编辑基金"
                          className="scan-edit-btn"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 6,
                            transition: 'color 200ms ease, background 200ms ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--primary)';
                            e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 12%, transparent)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--muted)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <Pencil width="14" height="14" />
                        </button>
                        {isAlreadyInTarget && !hasHoldingData ? (
                          <span className="added-label">已添加</span>
                        ) : isInvalid ? (
                          <span className="added-label">未找到</span>
                        ) : (
                          <div className="checkbox">{isSelected && <div className="checked-mark" />}</div>
                        )}
                      </div>
                    </div>
                    {hasHoldingData && !isDisabled && (
                      <div style={{ display: 'flex', gap: 16, marginTop: 6, paddingLeft: 0, alignItems: 'center' }}>
                        {holdAmounts !== null && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            持有金额：
                            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{formatMoney(holdAmounts)}</span>
                          </span>
                        )}
                        {holdGains !== null && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            持有收益：
                            <span
                              style={{ color: holdGains >= 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 500 }}
                            >
                              {holdGains >= 0 ? '+' : '-'}
                              {formatMoney(Math.abs(holdGains))}
                            </span>
                          </span>
                        )}
                        {isAlreadyInTarget && (
                          <span
                            className="added-label"
                            style={{
                              color: 'var(--danger)',
                              background: 'color-mix(in srgb, var(--danger) 15%, transparent)',
                              marginLeft: 'auto'
                            }}
                          >
                            已存在
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
            >
              <span className="muted" style={{ fontSize: 13 }}>
                添加后展开详情
              </span>
              <Switch checked={expandAfterAdd} onCheckedChange={(checked) => setExpandAfterAdd(!!checked)} />
            </div>
            {user && (
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8
                }}
              >
                <span className="muted" style={{ fontSize: 13 }}>
                  自动数据源
                </span>
                <Switch checked={autoDataSource} onCheckedChange={(checked) => setAutoDataSource(!!checked)} />
              </div>
            )}
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8
              }}
            >
              <span className="muted" style={{ fontSize: 13 }}>
                导入基金标签
              </span>
              <Switch checked={autoImportTags} onCheckedChange={(checked) => setAutoImportTags(!!checked)} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                添加到分组：
              </span>
              <Select value={selectedGroupId} onValueChange={(value) => setSelectedGroupId(value)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="选择分组" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {groups
                    .filter((g) => g.id !== 'all')
                    .map((g) => {
                      const isFav = g.id === 'fav' || g.isPreset;
                      return (
                        <SelectItem key={g.id} value={g.id}>
                          {isFav ? '自选' : g.name}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button" onClick={handleConfirm} disabled={selectedScannedCodes.size === 0}>
            确认导入
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
