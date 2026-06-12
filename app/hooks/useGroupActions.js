import { isArray, isObject, isPlainObject } from 'lodash';
import { useStorageStore, useModalStore } from '../stores';
import { migrateDcaPlansToScoped } from '../lib/fundHelpers';
import { toast as sonnerToast } from 'sonner';

/**
 * 分组操作核心逻辑自定义 Hook
 * @param {object} deps
 * @param {string} deps.currentTab - 当前活跃 Tab ID
 * @param {Function} deps.setCurrentTab - 激活 Tab 更新方法
 */
export function useGroupActions({ currentTab, setCurrentTab }) {
  const {
    groups,
    setGroups,
    customSettings,
    setCustomSettings,
    setGroupHoldings,
    setDcaPlans,
    setPendingTrades,
    setTransactions,
    setFundDailyEarnings
  } = useStorageStore();

  const setGroupModalOpen = (open) => useModalStore.setState({ groupModalOpen: open });
  const setAddFundToGroupOpen = (open) => useModalStore.setState({ addFundToGroupOpen: open });
  const setSuccessModal = (state) => useModalStore.setState({ successModal: state });

  const showToast = (message, type = 'info') => {
    if (type === 'success') {
      sonnerToast.success(message);
    } else if (type === 'error') {
      sonnerToast.error(message);
    } else {
      sonnerToast.info(message);
    }
  };

  const handleAddGroup = (name) => {
    const newGroup = {
      id: `group_${Date.now()}`,
      name,
      codes: []
    };
    const next = [...groups, newGroup];
    setGroups(next);
    setCurrentTab(newGroup.id);
    setGroupModalOpen(false);
  };

  const handleUpdateGroups = (newGroups) => {
    const removedIds = groups.filter((g) => !newGroups.find((ng) => ng.id === g.id)).map((g) => g.id);
    setGroups(newGroups);
    // 如果当前选中的分组被删除了，切换回“全部”
    if (currentTab !== 'all' && currentTab !== 'fav' && !newGroups.find((g) => g.id === currentTab)) {
      setCurrentTab('all');
    }
    if (removedIds.length > 0) {
      setGroupHoldings((prev) => {
        let nextGh = { ...prev };
        let ghChanged = false;
        removedIds.forEach((rid) => {
          if (nextGh[rid]) {
            delete nextGh[rid];
            ghChanged = true;
          }
        });
        return ghChanged ? nextGh : prev;
      });
      setDcaPlans((prev) => {
        const scoped = migrateDcaPlansToScoped(prev);
        let nextDca = { ...scoped };
        let dcaChanged = false;
        removedIds.forEach((rid) => {
          if (nextDca[rid]) {
            delete nextDca[rid];
            dcaChanged = true;
          }
        });
        return dcaChanged ? nextDca : prev;
      });
      setPendingTrades((prev) => {
        const nextP = prev.filter((t) => !removedIds.includes(t.groupId));
        return nextP;
      });
      try {
        const parsed = { ...(customSettings || {}) };
        if (parsed && isObject(parsed)) {
          let changed = false;
          removedIds.forEach((groupId) => {
            if (parsed[groupId] !== undefined) {
              delete parsed[groupId];
              changed = true;
            }
          });
          if (changed) {
            setCustomSettings(parsed);
          }
        }
      } catch (e) {
        // ignore
      }
      setTransactions((prev) => {
        const out = { ...(prev || {}) };
        let changed = false;
        Object.keys(out).forEach((code) => {
          const list = out[code];
          if (!isArray(list) || list.length === 0) return;
          const filtered = list.filter((t) => !removedIds.includes(t?.groupId));
          if (filtered.length !== list.length) {
            changed = true;
            if (filtered.length) out[code] = filtered;
            else delete out[code];
          }
        });
        return changed ? out : prev;
      });
      setFundDailyEarnings((prev) => {
        if (!isPlainObject(prev)) return prev;
        let changed = false;
        const next = { ...prev };
        removedIds.forEach((rid) => {
          if (rid in next) {
            delete next[rid];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  };

  const handleAddFundsToGroup = (codes) => {
    if (!codes || codes.length === 0) return;
    const gid = currentTab !== 'all' && currentTab !== 'fav' ? currentTab : null;
    const next = groups.map((g) => {
      if (g.id === currentTab) {
        return {
          ...g,
          codes: Array.from(new Set([...g.codes, ...codes]))
        };
      }
      return g;
    });
    setGroups(next);

    // 确保“添加到分组”仅增加分组内基金列表，不迁移任何持仓/交易/待定/定投等分组作用域数据
    if (gid) {
      const codeSet = new Set(codes.filter(Boolean));

      setGroupHoldings((prev) => {
        const bucket = prev?.[gid];
        if (!bucket || !isObject(bucket)) return prev;
        let changed = false;
        const nextBucket = { ...bucket };
        for (const c of codeSet) {
          if (nextBucket[c] !== null) {
            nextBucket[c] = null;
            changed = true;
          }
        }
        if (!changed) return prev;
        const nextGh = { ...(prev || {}) };
        nextGh[gid] = nextBucket;
        return nextGh;
      });

      setPendingTrades((prev) => {
        const nextP = prev.filter((t) => !(codeSet.has(t.fundCode) && t.groupId === gid));
        if (nextP.length === prev.length) return prev;
        return nextP;
      });

      setTransactions((prev) => {
        const out = { ...(prev || {}) };
        let changed = false;
        for (const c of codeSet) {
          const list = out[c];
          if (!isArray(list) || list.length === 0) continue;
          const filtered = list.filter((t) => t?.groupId !== gid);
          if (filtered.length !== list.length) {
            changed = true;
            if (filtered.length) out[c] = filtered;
            else delete out[c];
          }
        }
        if (!changed) return prev;
        return out;
      });

      setDcaPlans((prev) => {
        const scoped = migrateDcaPlansToScoped(prev);
        const bucket = scoped?.[gid];
        if (!bucket || !isObject(bucket)) return prev;
        let changed = false;
        const nextBucket = { ...bucket };
        for (const c of codeSet) {
          if (nextBucket[c] != null) {
            delete nextBucket[c];
            changed = true;
          }
        }
        if (!changed) return prev;
        const nextScoped = { ...scoped, [gid]: nextBucket };
        return nextScoped;
      });

      try {
        setFundDailyEarnings((prev) => {
          if (!isPlainObject(prev) || !isPlainObject(prev[gid])) return prev;
          let changed = false;
          const nextBucket = { ...prev[gid] };
          for (const c of codeSet) {
            if (c in nextBucket) {
              delete nextBucket[c];
              changed = true;
            }
          }
          if (!changed) return prev;
          return { ...prev, [gid]: nextBucket };
        });
      } catch (e) {
        // ignore
      }
    }

    setAddFundToGroupOpen(false);
    setSuccessModal({ open: true, message: `成功添加 ${codes.length} 支基金` });
  };

  const stripFundFromGroupScope = (code, groupId, options = {}) => {
    const silent = options?.silent === true;
    if (!code || !groupId) return;
    const nextGroups = groups.map((g) => (g.id === groupId ? { ...g, codes: g.codes.filter((c) => c !== code) } : g));
    setGroups(nextGroups);

    setGroupHoldings((prev) => {
      if (!prev[groupId]?.[code]) return prev;
      const next = { ...prev };
      const bucket = { ...next[groupId] };
      delete bucket[code];
      next[groupId] = bucket;
      return next;
    });

    setPendingTrades((prev) => {
      const next = prev.filter((t) => !(t.fundCode === code && t.groupId === groupId));
      if (next.length === prev.length) return prev;
      return next;
    });

    setTransactions((prev) => {
      const list = prev[code] || [];
      const filtered = list.filter((t) => t.groupId !== groupId);
      if (filtered.length === list.length) return prev;
      const next = { ...prev };
      if (filtered.length) next[code] = filtered;
      else delete next[code];
      return next;
    });

    setDcaPlans((prev) => {
      const scoped = migrateDcaPlansToScoped(prev);
      if (!scoped[groupId]?.[code]) return prev;
      const bucket = { ...scoped[groupId] };
      delete bucket[code];
      const nextScoped = { ...scoped, [groupId]: bucket };
      return nextScoped;
    });
    try {
      setFundDailyEarnings((prev) => {
        if (!isPlainObject(prev) || !isPlainObject(prev[groupId]) || !(code in prev[groupId])) return prev;
        const next = { ...prev, [groupId]: { ...prev[groupId] } };
        delete next[groupId][code];
        return next;
      });
    } catch (e) {
      // ignore
    }

    if (!silent) showToast('已从当前分组移除该基金', 'success');
  };

  const stripManyFundsFromGroupScope = (codes, groupId) => {
    const set = new Set((codes || []).filter(Boolean));
    if (!groupId || set.size === 0) return;

    setGroups((prev) => {
      const next = prev.map((g) => (g.id === groupId ? { ...g, codes: g.codes.filter((c) => !set.has(c)) } : g));
      return next;
    });

    setGroupHoldings((prev) => {
      if (!prev[groupId]) return prev;
      const bucket = { ...prev[groupId] };
      let changed = false;
      for (const c of set) {
        if (bucket[c]) {
          delete bucket[c];
          changed = true;
        }
      }
      if (!changed) return prev;
      const next = { ...prev, [groupId]: bucket };
      return next;
    });

    setPendingTrades((prev) => {
      const next = prev.filter((t) => !(set.has(t.fundCode) && t.groupId === groupId));
      if (next.length === prev.length) return prev;
      return next;
    });

    setTransactions((prev) => {
      let next = { ...prev };
      let changed = false;
      for (const c of set) {
        const list = next[c];
        if (!list?.length) continue;
        const filtered = list.filter((t) => t.groupId !== groupId);
        if (filtered.length !== list.length) {
          changed = true;
          if (filtered.length) next[c] = filtered;
          else delete next[c];
        }
      }
      if (!changed) return prev;
      return next;
    });

    setDcaPlans((prev) => {
      const scoped = migrateDcaPlansToScoped(prev);
      if (!scoped[groupId]) return prev;
      const bucket = { ...scoped[groupId] };
      let changed = false;
      for (const c of set) {
        if (bucket[c]) {
          delete bucket[c];
          changed = true;
        }
      }
      if (!changed) return prev;
      const nextScoped = { ...scoped, [groupId]: bucket };
      return nextScoped;
    });
    try {
      setFundDailyEarnings((prev) => {
        if (!isPlainObject(prev) || !isPlainObject(prev[groupId])) return prev;
        const bucket = prev[groupId];
        let changed = false;
        const nextBucket = { ...bucket };
        for (const c of set) {
          if (c in nextBucket) {
            delete nextBucket[c];
            changed = true;
          }
        }
        if (!changed) return prev;
        return { ...prev, [groupId]: nextBucket };
      });
    } catch (e) {
      // ignore
    }
  };

  return {
    handleAddGroup,
    handleUpdateGroups,
    handleAddFundsToGroup,
    stripFundFromGroupScope,
    stripManyFundsFromGroupScope
  };
}
