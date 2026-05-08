import { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { toast as sonnerToast } from 'sonner';
import { parseFundTextWithLLM, fetchFundData, searchFunds } from '../api/fund';
import { recordValuation } from '../lib/valuationTimeseries';
import { useFundFuzzyMatcher } from './useFundFuzzyMatcher';
import { useStorageStore, useUserStore } from '../stores';

/**
 * OCR 扫描导入基金的完整流程
 *
 * @param {{
 *   setCurrentTab: Function,
 *   setValuationSeries: Function,
 *   setSuccessModal: Function,
 *   showToast: Function,
 *   normalizeCode: Function,
 *   dedupeByCode: Function,
 * }} deps
 */
export function useScanImport({
  setCurrentTab,
  setValuationSeries,
  setSuccessModal,
  showToast,
  normalizeCode,
  dedupeByCode,
}) {
  const user = useUserStore((s) => s.user);
  const funds = useStorageStore((s) => s.funds);
  const favorites = useStorageStore((s) => s.favorites);
  const groups = useStorageStore((s) => s.groups);
  
  const setFunds = useStorageStore((s) => s.setFunds);
  const setHoldings = useStorageStore((s) => s.setHoldings);
  const setFavorites = useStorageStore((s) => s.setFavorites);
  const setGroups = useStorageStore((s) => s.setGroups);
  const setGroupHoldings = useStorageStore((s) => s.setGroupHoldings);
  const setCollapsedCodes = useStorageStore((s) => s.setCollapsedCodes);
  const setCollapsedTrends = useStorageStore((s) => s.setCollapsedTrends);

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanConfirmModalOpen, setScanConfirmModalOpen] = useState(false);
  const [scannedFunds, setScannedFunds] = useState([]);
  const [selectedScannedCodes, setSelectedScannedCodes] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isScanImporting, setIsScanImporting] = useState(false);
  const [scanImportProgress, setScanImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [scanProgress, setScanProgress] = useState({ stage: 'ocr', current: 0, total: 0 });
  const [isOcrScan, setIsOcrScan] = useState(false);

  const abortScanRef = useRef(false);
  const fileInputRef = useRef(null);
  const ocrWorkerRef = useRef(null);

  const { resolveFundCodeByFuzzy } = useFundFuzzyMatcher();

  const handleScanClick = () => {
    if (!user?.id) {
      sonnerToast.error('该功能需登录后使用');
      return;
    }
    setScanModalOpen(true);
  };

  const handleScanPick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const cancelScan = () => {
    abortScanRef.current = true;
    setIsScanning(false);
    setScanProgress({ stage: 'ocr', current: 0, total: 0 });
    if (ocrWorkerRef.current) {
      try {
        ocrWorkerRef.current.terminate();
      } catch (e) {}
      ocrWorkerRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFiles = async (files) => {
    if (!files?.length) return;

    setIsScanning(true);
    setScanModalOpen(false);
    abortScanRef.current = false;
    setScanProgress({ stage: 'ocr', current: 0, total: files.length });

    try {
      let worker = ocrWorkerRef.current;
      if (!worker) {
        const cdnBases = [
          'https://01kjzb6fhx9f8rjstc8c21qadx.esa.staticdn.net/npm',
          'https://fastly.jsdelivr.net/npm',
          'https://cdn.jsdelivr.net/npm',
        ];
        const coreCandidates = [
          'tesseract-core-simd-lstm.wasm.js',
          'tesseract-core-lstm.wasm.js',
        ];
        let lastErr = null;
        for (const base of cdnBases) {
          for (const coreFile of coreCandidates) {
            try {
              worker = await createWorker('chi_sim+eng', 1, {
                workerPath: `${base}/tesseract.js@v5.1.1/dist/worker.min.js`,
                corePath: `${base}/tesseract.js-core@v5.1.1/${coreFile}`,
              });
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
          if (!lastErr) break;
        }
        if (lastErr) throw lastErr;
        ocrWorkerRef.current = worker;
      }

      const recognizeWithTimeout = async (file, ms) => {
        let timer = null;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('OCR_TIMEOUT')), ms);
        });
        try {
          return await Promise.race([worker.recognize(file), timeout]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      const searchFundsWithTimeout = async (val, ms) => {
        let timer = null;
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve([]), ms);
        });
        try {
          return await Promise.race([searchFunds(val), timeout]);
        } catch (e) {
          return [];
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      const allFundsData = [];
      const addedFundCodes = new Set();

      for (let i = 0; i < files.length; i++) {
        if (abortScanRef.current) break;

        const f = files[i];
        setScanProgress(prev => ({ ...prev, current: i + 1 }));

        let text = '';
        try {
          const res = await recognizeWithTimeout(f, 30000);
          text = res?.data?.text || '';
        } catch (e) {
          if (String(e?.message || '').includes('OCR_TIMEOUT')) {
            if (worker) {
              try { await worker.terminate(); } catch (err) {}
              ocrWorkerRef.current = null;
            }
            throw e;
          }
          text = '';
        }

        const fundsResString = await parseFundTextWithLLM(text);
        let fundsRes = null;
        try {
          fundsRes = JSON.parse(fundsResString);
        } catch (e) {
          console.error(e);
        }

        if (Array.isArray(fundsRes) && fundsRes.length > 0) {
          fundsRes.forEach((fund) => {
            const code = fund.fundCode || '';
            const name = (fund.fundName || '').trim();
            if (code && !addedFundCodes.has(code)) {
              addedFundCodes.add(code);
              allFundsData.push({ fundCode: code, fundName: name, holdAmounts: fund.holdAmounts || '', holdGains: fund.holdGains || '' });
            } else if (!code && name) {
              allFundsData.push({ fundCode: '', fundName: name, holdAmounts: fund.holdAmounts || '', holdGains: fund.holdGains || '' });
            }
          });
        }
      }

      if (abortScanRef.current) return;

      // 处理没有基金代码但有名称的情况，通过名称搜索基金代码
      const fundsWithoutCode = allFundsData.filter(f => !f.fundCode && f.fundName);
      if (fundsWithoutCode.length > 0) {
        setScanProgress({ stage: 'verify', current: 0, total: fundsWithoutCode.length });
        for (let i = 0; i < fundsWithoutCode.length; i++) {
          if (abortScanRef.current) break;
          const fundItem = fundsWithoutCode[i];
          setScanProgress(prev => ({ ...prev, current: i + 1 }));
          try {
            const list = await searchFundsWithTimeout(fundItem.fundName, 8000);
            if (Array.isArray(list) && list.length === 1) {
              const found = list[0];
              if (found && found.CODE && !addedFundCodes.has(found.CODE)) {
                addedFundCodes.add(found.CODE);
                fundItem.fundCode = found.CODE;
              }
            } else {
              try {
                const fuzzyCode = await resolveFundCodeByFuzzy(fundItem.fundName);
                if (fuzzyCode && !addedFundCodes.has(fuzzyCode)) {
                  addedFundCodes.add(fuzzyCode);
                  fundItem.fundCode = fuzzyCode;
                }
              } catch (e) {}
            }
          } catch (e) {}
        }
      }

      const validFunds = allFundsData.filter(f => f.fundCode);
      const codes = validFunds.map(f => f.fundCode).sort();
      setScanProgress({ stage: 'verify', current: 0, total: codes.length });

      const existingCodes = new Set(funds.map(f => f.code));
      const results = [];
      for (let i = 0; i < codes.length; i++) {
        if (abortScanRef.current) break;
        const code = codes[i];
        const fundInfo = validFunds.find(f => f.fundCode === code);
        setScanProgress(prev => ({ ...prev, current: i + 1 }));

        let found = null;
        try {
          const list = await searchFundsWithTimeout(code, 8000);
          found = Array.isArray(list) ? list.find(d => d.CODE === code) : null;
        } catch (e) {
          found = null;
        }

        const alreadyAdded = existingCodes.has(code);
        const ok = !!found && !alreadyAdded;
        results.push({
          code,
          name: found ? (found.NAME || found.SHORTNAME || '') : (fundInfo?.fundName || ''),
          status: alreadyAdded ? 'added' : (ok ? 'ok' : 'invalid'),
          holdAmounts: fundInfo?.holdAmounts || '',
          holdGains: fundInfo?.holdGains || '',
        });
      }

      if (abortScanRef.current) return;

      setScannedFunds(results);
      setSelectedScannedCodes(new Set(results.filter(r => r.status === 'ok').map(r => r.code)));
      setIsOcrScan(true);
      setScanConfirmModalOpen(true);
    } catch (err) {
      if (!abortScanRef.current) {
        console.error('OCR Error:', err);
        showToast('图片识别失败，请重试或更换更清晰的截图', 'error');
      }
    } finally {
      setIsScanning(false);
      setScanProgress({ stage: 'ocr', current: 0, total: 0 });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFilesUpload = (event) => {
    processFiles(Array.from(event.target.files || []));
  };

  const handleFilesDrop = (files) => {
    processFiles(files);
  };

  const toggleScannedCode = (code) => {
    setSelectedScannedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const confirmScanImport = async (targetGroupId = 'all', expandAfterAdd = true) => {
    const parseAmount = (val) => {
      if (!val && val !== 0) return null;
      const num = parseFloat(String(val).replace(/,/g, ''));
      return isNaN(num) ? null : num;
    };

    const rawCodes = Array.from(selectedScannedCodes);
    const targetExists = (code) => {
      if (!code) return false;
      if (targetGroupId === 'all') return funds.some((f) => f.code === code);
      if (targetGroupId === 'fav') return favorites?.has?.(code);
      const g = groups.find((x) => x.id === targetGroupId);
      return !!(g && Array.isArray(g.codes) && g.codes.includes(code));
    };

    const codes = rawCodes.filter((c) => {
      const exists = targetExists(c);
      const scannedFund = scannedFunds.find(f => f.code === c);
      const holdAmounts = parseAmount(scannedFund?.holdAmounts);
      const holdGains = parseAmount(scannedFund?.holdGains);
      const hasHoldingData = holdAmounts !== null && holdGains !== null;
      return !exists || hasHoldingData;
    });

    if (codes.length === 0) {
      showToast('所选基金已在目标分组中', 'info');
      return;
    }
    setScanConfirmModalOpen(false);
    setIsScanImporting(true);
    setScanImportProgress({ current: 0, total: codes.length, success: 0, failed: 0 });

    try {
      const newFunds = [];
      const newHoldings = {};
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        setScanImportProgress(prev => ({ ...prev, current: i + 1 }));

        const existed = funds.some(existing => existing.code === code);
        try {
          const data = existed ? (funds.find((f) => f.code === code) || null) : await fetchFundData(code);
          if (!existed && data) newFunds.push(data);

          const scannedFund = scannedFunds.find(f => f.code === code);
          const holdAmounts = parseAmount(scannedFund?.holdAmounts);
          const holdGains = parseAmount(scannedFund?.holdGains);
          const dwjz = data?.dwjz || data?.gsz || 0;

          if (holdAmounts !== null && dwjz > 0) {
            const share = holdAmounts / dwjz;
            const profit = holdGains !== null ? holdGains : 0;
            const principal = holdAmounts - profit;
            const cost = share > 0 ? principal / share : 0;
            newHoldings[code] = {
              share: Number(share.toFixed(2)),
              cost: Number(cost.toFixed(4)),
            };
          }

          successCount++;
          setScanImportProgress(prev => ({ ...prev, success: prev.success + 1 }));
        } catch (e) {
          failedCount++;
          setScanImportProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        }
      }

      const newCodesSet = new Set(newFunds.map((f) => f.code));
      const allSelectedSet = new Set(codes);

      if (newFunds.length > 0) {
        setFunds(prev => dedupeByCode([...newFunds, ...prev]));

        if (Object.keys(newHoldings).length > 0) {
          if (targetGroupId !== 'all' && targetGroupId !== 'fav') {
            setGroupHoldings(prev => {
              const bucket = prev[targetGroupId] ? { ...prev[targetGroupId] } : {};
              return { ...prev, [targetGroupId]: { ...bucket, ...newHoldings } };
            });
          } else {
            setHoldings(prev => ({ ...prev, ...newHoldings }));
          }
        }

        const nextSeries = {};
        newFunds.forEach(u => {
          if (u?.code != null && !u.noValuation && Number.isFinite(Number(u.gsz))) {
            nextSeries[u.code] = recordValuation(u.code, { gsz: u.gsz, gztime: u.gztime });
          }
        });
        if (Object.keys(nextSeries).length > 0) setValuationSeries(prev => ({ ...prev, ...nextSeries }));

        if (!expandAfterAdd) {
          setCollapsedCodes(prev => {
            const next = new Set(prev);
            newCodesSet.forEach((code) => next.add(code));
            return next;
          });
          setCollapsedTrends(prev => {
            const next = new Set(prev);
            newCodesSet.forEach((code) => next.add(code));
            return next;
          });
        }
      }

      if (targetGroupId === 'fav') {
        setFavorites(prev => {
          const next = new Set(prev);
          codes.map(normalizeCode).filter(Boolean).forEach(code => next.add(code));
          return next;
        });
        setCurrentTab('fav');
      } else if (targetGroupId && targetGroupId !== 'all') {
        setGroups(prev => prev.map(g => {
          if (g.id === targetGroupId) {
            return { ...g, codes: Array.from(new Set([...(g.codes || []), ...codes])) };
          }
          return g;
        }));
        setCurrentTab(targetGroupId);
      } else {
        setCurrentTab('all');
      }

      if (successCount > 0) {
        setSuccessModal({ open: true, message: `成功导入 ${successCount} 个基金` });
      } else if (allSelectedSet.size > 0 && failedCount === 0) {
        setSuccessModal({ open: true, message: '所选基金已在目标分组中' });
      } else {
        showToast('未能导入任何基金', 'info');
      }
    } catch (e) {
      showToast('导入失败', 'error');
    } finally {
      setIsScanImporting(false);
      setScanImportProgress({ current: 0, total: 0, success: 0, failed: 0 });
      setScannedFunds([]);
      setSelectedScannedCodes(new Set());
    }
  };

  return {
    // 状态
    scanModalOpen, setScanModalOpen,
    scanConfirmModalOpen, setScanConfirmModalOpen,
    scannedFunds, setScannedFunds,
    selectedScannedCodes, setSelectedScannedCodes,
    isScanning,
    isScanImporting,
    scanImportProgress,
    scanProgress,
    isOcrScan, setIsOcrScan,
    fileInputRef,
    // 操作
    handleScanClick,
    handleScanPick,
    cancelScan,
    handleFilesUpload,
    handleFilesDrop,
    toggleScannedCode,
    confirmScanImport,
  };
}
