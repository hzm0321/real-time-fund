'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CloseIcon } from './Icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function ScanImportConfirmModal({
  scannedFunds,
  selectedScannedCodes,
  onClose,
  onToggle,
  onConfirm,
  refreshing,
  groups = [],
  isOcrScan = false
}) {
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [expandAfterAdd, setExpandAfterAdd] = useState(true);

  const handleConfirm = () => {
    onConfirm(selectedGroupId, expandAfterAdd);
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
        <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
          <span>确认导入基金</span>
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
            <div className="search-results pending-list" style={{ maxHeight: 360, overflowY: 'auto' }}>
              {scannedFunds.map((item) => {
                const isSelected = selectedScannedCodes.has(item.code);
                const isAlreadyAdded = item.status === 'added';
                const isInvalid = item.status === 'invalid';
                const isDisabled = isAlreadyAdded || isInvalid;
                const displayName = item.name || (isInvalid ? '未找到基金' : '未知基金');
                const holdAmounts = formatAmount(item.holdAmounts);
                const holdGains = formatAmount(item.holdGains);
                const hasHoldingData = holdAmounts !== null && holdGains !== null;
                return (
                  <div
                    key={item.code}
                    className={`search-item ${isSelected ? 'selected' : ''} ${isAlreadyAdded ? 'added' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (isDisabled) return;
                      onToggle(item.code);
                    }}
                    style={{ cursor: isDisabled ? 'not-allowed' : 'pointer', flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="fund-info">
                        <span className="fund-name">{displayName}</span>
                        <span className="fund-code muted">#{item.code}</span>
                      </div>
                      {isAlreadyAdded ? (
                        <span className="added-label">已添加</span>
                      ) : isInvalid ? (
                        <span className="added-label">未找到</span>
                      ) : (
                        <div className="checkbox">
                          {isSelected && <div className="checked-mark" />}
                        </div>
                      )}
                    </div>
                    {hasHoldingData && !isDisabled && (
                      <div style={{ display: 'flex', gap: 16, marginTop: 6, paddingLeft: 0 }}>
                        {holdAmounts !== null && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            持有金额：<span style={{ color: 'var(--text)', fontWeight: 500 }}>¥{holdAmounts.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </span>
                        )}
                        {holdGains !== null && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            持有收益：<span style={{ color: holdGains >= 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 500 }}>
                              {holdGains >= 0 ? '+' : '-'}¥{Math.abs(holdGains).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>添加后展开详情</span>
              <Switch
                checked={expandAfterAdd}
                onCheckedChange={(checked) => setExpandAfterAdd(!!checked)}
              />
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>添加到分组：</span>
              <Select value={selectedGroupId} onValueChange={(value) => setSelectedGroupId(value)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="选择分组" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="fav">自选</SelectItem>
                  {groups.filter(g => g.id !== 'all' && g.id !== 'fav').map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="button secondary" onClick={onClose}>取消</button>
          <button className="button" onClick={handleConfirm} disabled={selectedScannedCodes.size === 0 || refreshing}>确认导入</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
