'use client';

import { AnimatePresence } from 'framer-motion';
import { RefreshCw, FolderPlusIcon } from 'lucide-react';
import { isPlainObject } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import dynamic from 'next/dynamic';
import { useModalStore } from '../stores';

// 低频弹窗：懒加载
const CloudConfigModal = dynamic(() => import('./CloudConfigModal'), { ssr: false });
const DonateModal = dynamic(() => import('./DonateModal'), { ssr: false });
const FeedbackModal = dynamic(() => import('./FeedbackModal'), { ssr: false });
const WeChatModal = dynamic(() => import('./WeChatModal'), { ssr: false });
const DcaModal = dynamic(() => import('./DcaModal'), { ssr: false });
const FundConvertModal = dynamic(() => import('./FundConvertModal'), { ssr: false });
const SelectFundSingleModal = dynamic(() => import('./SelectFundSingleModal'), { ssr: false });
const SelectHoldingGroupModal = dynamic(() => import('./SelectHoldingGroupModal'), { ssr: false });
const ScanImportConfirmModal = dynamic(() => import('./ScanImportConfirmModal'), { ssr: false });
const ScanImportProgressModal = dynamic(() => import('./ScanImportProgressModal'), { ssr: false });
const ScanPickModal = dynamic(() => import('./ScanPickModal'), { ssr: false });
const ScanProgressModal = dynamic(() => import('./ScanProgressModal'), { ssr: false });
const AddHistoryModal = dynamic(() => import('./AddHistoryModal'), { ssr: false });
const AllSectorsModal = dynamic(() => import('./AllSectorsModal'), { ssr: false });
const DividendMethodModal = dynamic(() => import('./DividendMethodModal'), { ssr: false });

// 高频组件：同步加载
import ConfirmModal from './ConfirmModal';
import GroupManageModal from './GroupManageModal';
import GroupModal from './GroupModal';
import HoldingEditModal from './HoldingEditModal';
import HoldingActionModal from './HoldingActionModal';
import LoginModal from './LoginModal';
import SettingsModal from './SettingsModal';
import SuccessModal from './SuccessModal';
import TradeModal from './TradeModal';
import TransactionHistoryModal from './TransactionHistoryModal';
import TutorialDrawer from './TutorialDrawer';
import UpdateLogModal from './UpdateLogModal';
import SortSettingModal from './SortSettingModal';
import AddFundToGroupModal from './AddFundToGroupModal';
import FundDataSourceSelector from './FundDataSourceSelector';
import FundTagsEditDialog from './FundTagsEditDialog';
import MyEarningsCalendarPage from './MyEarningsCalendarPage';
import { DEFAULT_FUND_TAG_THEME, DCA_SCOPE_GLOBAL } from '@/app/constants';
import { migrateDcaPlansToScoped } from '../lib/fundHelpers';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/**
 * ModalsLayer — 将所有弹框渲染从 page.jsx 抽离到独立组件。
 *
 * 通过订阅 useModalStore 获取弹框开关状态，
 * 通过 callbacksRef 获取页面级回调与数据（ref 更新不触发重渲染）。
 *
 * 当弹框开关时，仅 ModalsLayer 重渲染，page.jsx 主体不受影响。
 *
 * @param {{ current: Object }} props.callbacksRef - 页面级回调与数据的 ref 封装
 */
export default function ModalsLayer({ callbacksRef }) {
  const cb = callbacksRef;

  // ========== Modal 开关状态订阅 ==========
  const settingsOpen = useModalStore((s) => s.settingsOpen);
  const feedbackOpen = useModalStore((s) => s.feedbackOpen);
  const feedbackNonce = useModalStore((s) => s.feedbackNonce);
  const weChatOpen = useModalStore((s) => s.weChatOpen);
  const donateOpen = useModalStore((s) => s.donateOpen);
  const loginModalOpen = useModalStore((s) => s.loginModalOpen);
  const loginInitialError = useModalStore((s) => s.loginInitialError);
  const tutorialDrawerOpen = useModalStore((s) => s.tutorialDrawerOpen);
  const updateLogOpen = useModalStore((s) => s.updateLogOpen);
  const portfolioEarningsOpen = useModalStore((s) => s.portfolioEarningsOpen);
  const mobileFundDrawerOpen = useModalStore((s) => s.mobileFundDrawerOpen);
  const mobileTableSettingModalOpen = useModalStore((s) => s.mobileTableSettingModalOpen);
  const sortSettingOpen = useModalStore((s) => s.sortSettingOpen);
  const allSectorsModalOpen = useModalStore((s) => s.allSectorsModalOpen);
  const groupModalOpen = useModalStore((s) => s.groupModalOpen);
  const groupManageOpen = useModalStore((s) => s.groupManageOpen);
  const addFundToGroupOpen = useModalStore((s) => s.addFundToGroupOpen);
  const addHistoryModal = useModalStore((s) => s.addHistoryModal);
  const historyModal = useModalStore((s) => s.historyModal);
  const fundTagsEdit = useModalStore((s) => s.fundTagsEdit);

  // 对象型弹框
  const holdingModal = useModalStore((s) => s.holdingModal);
  const actionModal = useModalStore((s) => s.actionModal);
  const tradeModal = useModalStore((s) => s.tradeModal);
  const convertModal = useModalStore((s) => s.convertModal);
  const dividendMethodModal = useModalStore((s) => s.dividendMethodModal);
  const selectFundSingleModal = useModalStore((s) => s.selectFundSingleModal);
  const selectHoldingGroupModal = useModalStore((s) => s.selectHoldingGroupModal);
  const dataSourceModal = useModalStore((s) => s.dataSourceModal);
  const dcaModal = useModalStore((s) => s.dcaModal);
  const clearConfirm = useModalStore((s) => s.clearConfirm);
  const holdingMigrateDialog = useModalStore((s) => s.holdingMigrateDialog);

  // 确认弹框
  const fundDeleteConfirm = useModalStore((s) => s.fundDeleteConfirm);
  const fundDeleteBulkConfirm = useModalStore((s) => s.fundDeleteBulkConfirm);

  // Cloud/sync
  const successModal = useModalStore((s) => s.successModal);
  const cloudConfigModal = useModalStore((s) => s.cloudConfigModal);
  const deviceConflictModal = useModalStore((s) => s.deviceConflictModal);

  // Scan
  const scanModalOpen = useModalStore((s) => s.scanModalOpen);
  const scanConfirmModalOpen = useModalStore((s) => s.scanConfirmModalOpen);
  const isScanning = useModalStore((s) => s.isScanning);
  const isScanImporting = useModalStore((s) => s.isScanImporting);

  // ---- Modal setter 兼容层（直接操作 Zustand，不订阅）----
  const _ms = useModalStore.setState;
  const _gs = useModalStore.getState;
  const setSettingsOpen = (v) => _ms({ settingsOpen: typeof v === 'function' ? v(_gs().settingsOpen) : v });
  const setFeedbackOpen = (v) => _ms({ feedbackOpen: typeof v === 'function' ? v(_gs().feedbackOpen) : v });
  const setWeChatOpen = (v) => _ms({ weChatOpen: typeof v === 'function' ? v(_gs().weChatOpen) : v });
  const setDonateOpen = (v) => _ms({ donateOpen: typeof v === 'function' ? v(_gs().donateOpen) : v });
  const setLoginModalOpen = (v) => _ms({ loginModalOpen: typeof v === 'function' ? v(_gs().loginModalOpen) : v });
  const setLoginInitialError = (v) =>
    _ms({ loginInitialError: typeof v === 'function' ? v(_gs().loginInitialError) : v });
  const setTutorialDrawerOpen = (v) =>
    _ms({ tutorialDrawerOpen: typeof v === 'function' ? v(_gs().tutorialDrawerOpen) : v });
  const setUpdateLogOpen = (v) => _ms({ updateLogOpen: typeof v === 'function' ? v(_gs().updateLogOpen) : v });
  const setSortSettingOpen = (v) => _ms({ sortSettingOpen: typeof v === 'function' ? v(_gs().sortSettingOpen) : v });
  const setAllSectorsModalOpen = (v) =>
    _ms({ allSectorsModalOpen: typeof v === 'function' ? v(_gs().allSectorsModalOpen) : v });
  const setGroupModalOpen = (v) => _ms({ groupModalOpen: typeof v === 'function' ? v(_gs().groupModalOpen) : v });
  const setGroupManageOpen = (v) => _ms({ groupManageOpen: typeof v === 'function' ? v(_gs().groupManageOpen) : v });
  const setAddFundToGroupOpen = (v) =>
    _ms({ addFundToGroupOpen: typeof v === 'function' ? v(_gs().addFundToGroupOpen) : v });
  const setPortfolioEarningsOpen = (v) =>
    _ms({ portfolioEarningsOpen: typeof v === 'function' ? v(_gs().portfolioEarningsOpen) : v });
  const setSuccessModal = (v) => _ms({ successModal: typeof v === 'function' ? v(_gs().successModal) : v });
  const setCloudConfigModal = (v) => _ms({ cloudConfigModal: typeof v === 'function' ? v(_gs().cloudConfigModal) : v });
  const setDeviceConflictModal = (v) =>
    _ms({ deviceConflictModal: typeof v === 'function' ? v(_gs().deviceConflictModal) : v });
  const setFundDeleteConfirm = (v) =>
    _ms({ fundDeleteConfirm: typeof v === 'function' ? v(_gs().fundDeleteConfirm) : v });
  const setFundDeleteBulkConfirm = (v) =>
    _ms({ fundDeleteBulkConfirm: typeof v === 'function' ? v(_gs().fundDeleteBulkConfirm) : v });
  const setHoldingModal = (v) => _ms({ holdingModal: typeof v === 'function' ? v(_gs().holdingModal) : v });
  const setActionModal = (v) => _ms({ actionModal: typeof v === 'function' ? v(_gs().actionModal) : v });
  const setTradeModal = (v) => _ms({ tradeModal: typeof v === 'function' ? v(_gs().tradeModal) : v });
  const setConvertModal = (v) => _ms({ convertModal: typeof v === 'function' ? v(_gs().convertModal) : v });
  const setDividendMethodModal = (v) =>
    _ms({ dividendMethodModal: typeof v === 'function' ? v(_gs().dividendMethodModal) : v });
  const setSelectFundSingleModal = (v) =>
    _ms({ selectFundSingleModal: typeof v === 'function' ? v(_gs().selectFundSingleModal) : v });
  const setSelectHoldingGroupModal = (v) =>
    _ms({ selectHoldingGroupModal: typeof v === 'function' ? v(_gs().selectHoldingGroupModal) : v });
  const setDataSourceModal = (v) => _ms({ dataSourceModal: typeof v === 'function' ? v(_gs().dataSourceModal) : v });
  const setDcaModal = (v) => _ms({ dcaModal: typeof v === 'function' ? v(_gs().dcaModal) : v });
  const setClearConfirm = (v) => _ms({ clearConfirm: typeof v === 'function' ? v(_gs().clearConfirm) : v });
  const setHoldingMigrateDialog = (v) =>
    _ms({ holdingMigrateDialog: typeof v === 'function' ? v(_gs().holdingMigrateDialog) : v });
  const setHistoryModal = (v) => _ms({ historyModal: typeof v === 'function' ? v(_gs().historyModal) : v });
  const setAddHistoryModal = (v) => _ms({ addHistoryModal: typeof v === 'function' ? v(_gs().addHistoryModal) : v });
  const setFundTagsEdit = (v) => _ms({ fundTagsEdit: typeof v === 'function' ? v(_gs().fundTagsEdit) : v });
  const setMobileTableSettingModalOpen = (v) =>
    _ms({ mobileTableSettingModalOpen: typeof v === 'function' ? v(_gs().mobileTableSettingModalOpen) : v });
  const setMobileFundDrawerOpen = (v) =>
    _ms({ mobileFundDrawerOpen: typeof v === 'function' ? v(_gs().mobileFundDrawerOpen) : v });
  const setScanModalOpen = (v) => _ms({ scanModalOpen: typeof v === 'function' ? v(_gs().scanModalOpen) : v });
  const setScanConfirmModalOpen = (v) =>
    _ms({ scanConfirmModalOpen: typeof v === 'function' ? v(_gs().scanConfirmModalOpen) : v });

  return (
    <>
      {/* ===== Modal: 删除确认 ===== */}
      <AnimatePresence>
        {fundDeleteConfirm && (
          <ConfirmModal
            title="删除确认"
            message={
              fundDeleteConfirm.scope === 'group'
                ? `确定从当前分组中移除「${fundDeleteConfirm.name}」吗？将清除该分组内的持仓、待定交易、定投计划与分组内交易记录；不会在「全部」中删除该基金。`
                : null
            }
            messageContent={
              fundDeleteConfirm.scope === 'group' ? null : fundDeleteConfirm.otherGroups &&
                fundDeleteConfirm.otherGroups.length > 0 ? (
                <>
                  基金 &#34;{fundDeleteConfirm.name}&#34; 还存在于以下分组：
                  <span className="text-[var(--primary)] font-semibold">
                    {fundDeleteConfirm.otherGroups.join('、')}
                  </span>
                  。删除后将同时从这些分组中移除。确定要彻底删除吗？
                </>
              ) : (
                `基金 "${fundDeleteConfirm.name}" 存在持仓记录。删除后将从列表中移除该基金及其全部持仓与相关数据（含各分组内副本），是否继续？`
              )
            }
            confirmText="确定删除"
            onConfirm={() => {
              cb.current.fundDetailDrawerCloseRef?.current?.();
              cb.current.fundDetailDialogCloseRef?.current?.();
              if (fundDeleteConfirm.scope === 'group' && fundDeleteConfirm.groupId) {
                cb.current.stripFundFromGroupScope(fundDeleteConfirm.code, fundDeleteConfirm.groupId);
              } else {
                cb.current.removeFund(fundDeleteConfirm.code);
              }
              setFundDeleteConfirm(null);
            }}
            onCancel={() => setFundDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 批量删除确认 ===== */}
      <AnimatePresence>
        {fundDeleteBulkConfirm && (
          <ConfirmModal
            title="批量删除确认"
            message={
              fundDeleteBulkConfirm.scope === 'global'
                ? fundDeleteBulkConfirm.fundsWithOtherGroups && fundDeleteBulkConfirm.fundsWithOtherGroups.length > 0
                  ? null
                  : `确定删除已选的 ${fundDeleteBulkConfirm.count} 支基金吗？将从列表中移除这些基金及其全部持仓与相关数据。`
                : `确定从当前分组中移除已选的 ${fundDeleteBulkConfirm.count} 支基金吗？将清除这些基金在该分组内的持仓、待定交易、定投计划与分组内交易记录；不会在「全部」中删除这些基金。`
            }
            messageContent={
              fundDeleteBulkConfirm.scope === 'global' &&
              fundDeleteBulkConfirm.fundsWithOtherGroups &&
              fundDeleteBulkConfirm.fundsWithOtherGroups.length > 0 ? (
                <div className="flex flex-col gap-3 text-left">
                  {fundDeleteBulkConfirm.fundsWithOtherGroups.map((f) => (
                    <p key={f.code} className="m-0 leading-relaxed">
                      基金 &#34;{f.name}&#34; 还存在于以下分组：
                      <span className="text-[var(--primary)] font-semibold">{f.otherGroups.join('、')}</span>
                      。删除后将同时从这些分组中移除。
                    </p>
                  ))}
                  <p className="m-0 leading-relaxed">
                    确定要彻底删除已选的全部 {fundDeleteBulkConfirm.count} 支基金吗？
                  </p>
                </div>
              ) : null
            }
            confirmText="确定删除"
            onConfirm={() => {
              cb.current.fundDetailDrawerCloseRef?.current?.();
              cb.current.fundDetailDialogCloseRef?.current?.();
              if (fundDeleteBulkConfirm.scope === 'global') {
                cb.current.removeFundsBulk(fundDeleteBulkConfirm.codes);
                cb.current.showToast(`已删除 ${fundDeleteBulkConfirm.count} 支基金`, 'success');
              } else {
                cb.current.stripManyFundsFromGroupScope(fundDeleteBulkConfirm.codes, fundDeleteBulkConfirm.groupId);
                cb.current.showToast(`已从当前分组移除 ${fundDeleteBulkConfirm.count} 支基金`, 'success');
              }
              cb.current.pcBatchClearSelectionRef?.current?.();
              cb.current.mobileBatchClearSelectionRef?.current?.();
              setFundDeleteBulkConfirm(null);
            }}
            onCancel={() => setFundDeleteBulkConfirm(null)}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 反馈 ===== */}
      <AnimatePresence>
        {feedbackOpen && (
          <FeedbackModal
            key={feedbackNonce}
            onClose={() => setFeedbackOpen(false)}
            user={cb.current.user}
            onOpenWeChat={() => setWeChatOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 每日收益 ===== */}
      <MyEarningsCalendarPage
        open={portfolioEarningsOpen}
        onOpenChange={setPortfolioEarningsOpen}
        series={cb.current.portfolioDailySeries}
        masked={cb.current.maskAmounts}
        onGoHome={() => {
          setPortfolioEarningsOpen(false);
        }}
      />

      {/* ===== Modal: 微信 ===== */}
      <AnimatePresence>{weChatOpen && <WeChatModal onClose={() => setWeChatOpen(false)} />}</AnimatePresence>

      {/* ===== Drawer: 使用教程 ===== */}
      <AnimatePresence>
        {tutorialDrawerOpen && <TutorialDrawer open onOpenChange={setTutorialDrawerOpen} />}
      </AnimatePresence>

      {/* ===== Modal: 更新日志 ===== */}
      <AnimatePresence>{updateLogOpen && <UpdateLogModal open onOpenChange={setUpdateLogOpen} />}</AnimatePresence>

      {/* ===== Modal: 全部板块 ===== */}
      <AnimatePresence>
        {allSectorsModalOpen && <AllSectorsModal onClose={() => setAllSectorsModalOpen(false)} />}
      </AnimatePresence>

      {/* ===== Modal: 添加基金到分组 ===== */}
      <AnimatePresence>
        {addFundToGroupOpen && (
          <AddFundToGroupModal
            allFunds={cb.current.funds}
            currentGroupCodes={(cb.current.groups || []).find((g) => g.id === cb.current.currentTab)?.codes || []}
            holdings={cb.current.holdings}
            fundTagListsByCode={cb.current.fundTagListsByCode}
            fundTagRecords={cb.current.fundTagRecords}
            onClose={() => setAddFundToGroupOpen(false)}
            onAdd={cb.current.handleAddFundsToGroup}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 选择持仓分组 ===== */}
      <AnimatePresence>
        {selectHoldingGroupModal.open && (
          <SelectHoldingGroupModal
            fund={selectHoldingGroupModal.fund}
            groups={cb.current.groups}
            groupHoldings={cb.current.groupHoldings}
            onClose={() => setSelectHoldingGroupModal({ open: false, fund: null })}
            onNext={(groupId) => {
              const fund = selectHoldingGroupModal.fund;
              setSelectHoldingGroupModal({ open: false, fund: null });
              setActionModal({ open: true, fund, groupId });
            }}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 数据源选择 ===== */}
      <AnimatePresence>
        {dataSourceModal.open && dataSourceModal.fund && (
          <FundDataSourceSelector
            fund={dataSourceModal.fund}
            onClose={() => setDataSourceModal({ open: false, fund: null })}
            onSelect={(sourceId) => cb.current.handleDataSourceSelect(dataSourceModal.fund.code, sourceId)}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 持仓操作 ===== */}
      <AnimatePresence>
        {actionModal.open && (
          <HoldingActionModal
            fund={actionModal.fund}
            onClose={() => setActionModal({ open: false, fund: null })}
            onAction={(type) => cb.current.handleAction(type, actionModal.fund, actionModal.groupId)}
            groupName={
              actionModal.groupId ? (cb.current.groups || []).find((g) => g.id === actionModal.groupId)?.name : ''
            }
            hasHistory={
              !!(cb.current.transactions?.[actionModal.fund?.code] || []).some((t) =>
                !cb.current.getScopedGroupId?.(actionModal.groupId)
                  ? !t.groupId
                  : t.groupId === cb.current.getScopedGroupId?.(actionModal.groupId)
              )
            }
            pendingCount={
              (cb.current.pendingTrades || []).filter(
                (t) =>
                  t.fundCode === actionModal.fund?.code &&
                  (!cb.current.getScopedGroupId?.(actionModal.groupId)
                    ? !t.groupId
                    : t.groupId === cb.current.getScopedGroupId?.(actionModal.groupId))
              ).length
            }
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 交易 ===== */}
      <AnimatePresence>
        {tradeModal.open && (
          <TradeModal
            type={tradeModal.type}
            fund={tradeModal.fund}
            holding={cb.current.getScopedHolding?.(tradeModal.fund?.code, tradeModal.groupId)}
            onClose={() => setTradeModal({ open: false, fund: null, type: 'buy' })}
            onConfirm={(data) => cb.current.handleTrade(tradeModal.fund, data)}
            pendingTrades={(cb.current.pendingTrades || []).filter(
              (t) =>
                t.fundCode === tradeModal.fund?.code &&
                (!cb.current.getScopedGroupId?.(tradeModal.groupId)
                  ? !t.groupId
                  : t.groupId === cb.current.getScopedGroupId?.(tradeModal.groupId))
            )}
            onDeletePending={(id) => {
              cb.current.setPendingTrades?.((prev) => {
                const next = prev.filter((t) => t.id !== id);
                return next;
              });
              cb.current.showToast?.('已撤销待处理交易', 'success');
            }}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 定投 ===== */}
      <AnimatePresence>
        {dcaModal.open && (
          <DcaModal
            fund={dcaModal.fund}
            plan={cb.current.getScopedDcaPlan?.(dcaModal.fund?.code, dcaModal.groupId)}
            onClose={() => setDcaModal({ open: false, fund: null })}
            onReset={(fundCode) => {
              const code = fundCode || dcaModal.fund?.code;
              if (!code) return;
              const scope = cb.current.getScopedGroupId?.(dcaModal.groupId) || DCA_SCOPE_GLOBAL;
              cb.current.setDcaPlans?.((prev) => {
                const scoped = migrateDcaPlansToScoped(prev);
                const bucket = isPlainObject(scoped[scope]) ? scoped[scope] : null;
                if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, code)) return prev;
                const nextBucket = { ...bucket };
                delete nextBucket[code];
                const next = { ...scoped };
                if (Object.keys(nextBucket).length === 0) delete next[scope];
                else next[scope] = nextBucket;
                return next;
              });
              setDcaModal({ open: false, fund: null });
              cb.current.showToast?.('已重置定投数据', 'success');
            }}
            onConfirm={(config) => {
              const code = config?.fundCode || dcaModal.fund?.code;
              if (!code) {
                setDcaModal({ open: false, fund: null });
                return;
              }
              const scope = cb.current.getScopedGroupId?.(dcaModal.groupId) || DCA_SCOPE_GLOBAL;
              cb.current.setDcaPlans?.((prev) => {
                const scoped = migrateDcaPlansToScoped(prev);
                const bucket = { ...(isPlainObject(scoped[scope]) ? scoped[scope] : {}) };
                bucket[code] = {
                  amount: config.amount,
                  feeRate: config.feeRate,
                  cycle: config.cycle,
                  firstDate: config.firstDate,
                  weeklyDay: config.weeklyDay ?? null,
                  monthlyDay: config.monthlyDay ?? null,
                  enabled: config.enabled !== false
                };
                const next = { ...scoped, [scope]: bucket };
                return next;
              });
              setDcaModal({ open: false, fund: null });
              cb.current.showToast?.('已保存定投计划', 'success');
            }}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 基金转换 ===== */}
      <AnimatePresence>
        {convertModal.open && (
          <FundConvertModal
            fund={convertModal.fund}
            allFunds={cb.current.funds}
            nestedModalOpen={selectFundSingleModal.open}
            maxOutAmount={(() => {
              const f = convertModal.fund;
              const code = f?.code;
              if (!code) return 0;
              const holding = cb.current.getScopedHolding?.(code, convertModal.groupId);
              const share = Number(holding?.share) || 0;
              const nav = Number(f?.dwjz) || Number(f?.gsz) || 0;
              if (!share || !nav) return 0;
              return share * nav;
            })()}
            onClose={() => setConvertModal({ open: false, fund: null })}
            onPickInFund={({ excludeCodes, initialSelectedCode }) => {
              return new Promise((resolve) => {
                setSelectFundSingleModal({
                  open: true,
                  excludeCodes: excludeCodes || [],
                  initialSelectedCode: initialSelectedCode || '',
                  _resolve: resolve
                });
              });
            }}
            onConfirm={(payload) => {
              const tradeGid = cb.current.getScopedGroupId?.(convertModal.groupId);
              const nowTs = Date.now();

              const outPending = {
                id: uuidv4(),
                fundCode: payload.outFundCode,
                fundName: payload.outFundName,
                type: 'sell',
                share: null,
                amount: payload.outAmount,
                feeRate: 0,
                feeMode: 'none',
                feeValue: 0,
                date: payload.date,
                navOffsetDays: -1,
                netValueSearch: 'backward',
                isAfter3pm: false,
                isDca: false,
                timestamp: nowTs,
                ...(tradeGid ? { groupId: tradeGid } : {})
              };

              const inPending = {
                id: uuidv4(),
                fundCode: payload.inFundCode,
                fundName: payload.inFundName,
                type: 'buy',
                share: null,
                amount: payload.inAmount,
                feeRate: 0,
                feeMode: 'none',
                feeValue: 0,
                date: payload.date,
                navOffsetDays: -1,
                netValueSearch: 'backward',
                isAfter3pm: false,
                isDca: false,
                timestamp: nowTs + 1,
                ...(tradeGid ? { groupId: tradeGid } : {})
              };

              cb.current.setPendingTrades?.((prev) => [...prev, outPending, inPending]);

              const ensureHolding = (code) => {
                if (!code) return;
                if (!tradeGid) {
                  cb.current.setHoldings?.((prev) => {
                    if (prev?.[code]) return prev;
                    return { ...(prev || {}), [code]: { share: 0, cost: 0 } };
                  });
                } else {
                  cb.current.setGroupHoldings?.((prev) => {
                    const next = { ...(prev || {}) };
                    const bucket = { ...(next[tradeGid] || {}) };
                    if (bucket[code]) return prev;
                    bucket[code] = { share: 0, cost: 0 };
                    next[tradeGid] = bucket;
                    return next;
                  });
                }
              };
              ensureHolding(payload.inFundCode);

              // 方案一：确保转换到的新基金如果不在当前分组的显示列表 (codes) 中，将其主动追加进去
              if (tradeGid) {
                const groupsList = cb.current.groups || [];
                const targetGroup = groupsList.find((g) => g.id === tradeGid);
                if (targetGroup && !(targetGroup.codes || []).includes(payload.inFundCode)) {
                  const nextGroups = groupsList.map((g) => {
                    if (g.id === tradeGid) {
                      return { ...g, codes: [...(g.codes || []), payload.inFundCode] };
                    }
                    return g;
                  });
                  cb.current.handleUpdateGroups?.(nextGroups);
                }
              }

              setConvertModal({ open: false, fund: null });
              cb.current.showToast?.('已加入待处理队列（转换）', 'info');
            }}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 分红方式 ===== */}
      <AnimatePresence>
        {dividendMethodModal.open && (
          <DividendMethodModal
            fund={dividendMethodModal.fund}
            groupId={dividendMethodModal.groupId}
            onClose={() => setDividendMethodModal({ open: false, fund: null })}
            showToast={cb.current.showToast}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 单选选基 ===== */}
      <AnimatePresence>
        {selectFundSingleModal.open && (
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectFundSingleModal
                allFunds={(cb.current.funds || []).filter((f) => f?.code && f.code !== convertModal.fund?.code)}
                excludeCodes={selectFundSingleModal.excludeCodes}
                initialSelectedCode={selectFundSingleModal.initialSelectedCode}
                onClose={() => {
                  if (typeof selectFundSingleModal._resolve === 'function') {
                    selectFundSingleModal._resolve(null);
                  }
                  setSelectFundSingleModal({ open: false, excludeCodes: [], initialSelectedCode: '' });
                }}
                onConfirm={(picked) => {
                  if (typeof selectFundSingleModal._resolve === 'function') {
                    selectFundSingleModal._resolve(picked);
                  }
                  setSelectFundSingleModal({ open: false, excludeCodes: [], initialSelectedCode: '' });
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>选择转入基金</p>
            </TooltipContent>
          </Tooltip>
        )}
      </AnimatePresence>

      {/* ===== Modal: 添加历史交易 ===== */}
      <AnimatePresence>
        {addHistoryModal.open && (
          <AddHistoryModal
            fund={addHistoryModal.fund}
            onClose={() => setAddHistoryModal({ open: false, fund: null })}
            onConfirm={cb.current.handleAddHistory}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 交易历史 ===== */}
      <AnimatePresence>
        {historyModal.open && (
          <TransactionHistoryModal
            fund={historyModal.fund}
            transactions={(cb.current.transactions?.[historyModal.fund?.code] || []).filter((t) =>
              !cb.current.getScopedGroupId?.(historyModal.groupId)
                ? !t.groupId
                : t.groupId === cb.current.getScopedGroupId?.(historyModal.groupId)
            )}
            pendingTransactions={(cb.current.pendingTrades || []).filter(
              (t) =>
                t.fundCode === historyModal.fund?.code &&
                (!cb.current.getScopedGroupId?.(historyModal.groupId)
                  ? !t.groupId
                  : t.groupId === cb.current.getScopedGroupId?.(historyModal.groupId))
            )}
            onClose={() => setHistoryModal({ open: false, fund: null })}
            onDeleteTransaction={(id) =>
              cb.current.handleDeleteTransaction?.(historyModal.fund?.code, id, historyModal.groupId)
            }
            onAddHistory={() =>
              setAddHistoryModal({
                open: true,
                fund: historyModal.fund,
                groupId: cb.current.getScopedGroupId?.(historyModal.groupId)
              })
            }
            canMergeAllGroups={!!cb.current.getScopedGroupId?.(historyModal.groupId)}
            onMergeAllGroups={() =>
              cb.current.handleMergeAllGroupTransactionsToCurrent?.(historyModal.fund?.code, historyModal.groupId)
            }
            onDeletePending={(id) => {
              cb.current.setPendingTrades?.((prev) => {
                const next = prev.filter((t) => t.id !== id);
                return next;
              });
              cb.current.showToast?.('已撤销待处理交易', 'success');
            }}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 清空持仓 ===== */}
      <AnimatePresence>
        {clearConfirm && (
          <ConfirmModal
            title="清空持仓"
            message={`确定要清空"${clearConfirm.fund?.name}"的所有持仓记录吗？此操作不可恢复。`}
            onConfirm={cb.current.handleClearConfirm}
            onCancel={() => setClearConfirm(null)}
            confirmText="确认清空"
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 编辑持仓 ===== */}
      <AnimatePresence>
        {holdingModal.open &&
          (() => {
            const f = holdingModal.fund;
            const h = cb.current.getScopedHolding?.(f?.code, holdingModal.groupId);
            const p = cb.current.getHoldingProfit?.(f, h, holdingModal.groupId);
            return (
              <HoldingEditModal
                fund={f}
                holding={h}
                nav={p?.nav}
                onClose={() => setHoldingModal({ open: false, fund: null })}
                onSave={(data) => cb.current.handleSaveHolding?.(f?.code, data, holdingModal.groupId)}
                onOpenTrade={() => {
                  if (!f) return;
                  setHoldingModal({ open: false, fund: null });
                  setTradeModal({
                    open: true,
                    fund: f,
                    type: 'buy',
                    groupId: cb.current.getScopedGroupId?.(holdingModal.groupId)
                  });
                }}
              />
            );
          })()}
      </AnimatePresence>

      {/* ===== Modal: 编辑标签 ===== */}
      <AnimatePresence>
        {fundTagsEdit.open && (
          <FundTagsEditDialog
            open={fundTagsEdit.open}
            onOpenChange={(open) => setFundTagsEdit((s) => ({ ...s, open }))}
            fundCode={fundTagsEdit.code ?? undefined}
            fundName={fundTagsEdit.name}
            tags={fundTagsEdit.tags}
            onSave={cb.current.handleSaveFundTags}
            recommendedTagItems={(cb.current.fundTagRecords || [])
              .map((r) => ({
                id: String(r?.id ?? '').trim(),
                name: String(r?.name ?? '').trim(),
                theme: String(r?.theme ?? '').trim() || DEFAULT_FUND_TAG_THEME
              }))
              .filter((x) => x.name)}
            onAddPoolTag={cb.current.handleAddPoolTag}
            onDeleteGlobalTag={cb.current.handleDeleteGlobalTag}
            getTagUsageLabels={cb.current.getTagUsageLabels}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 持仓迁移 ===== */}
      <AnimatePresence>
        {holdingMigrateDialog.open && (
          <ConfirmModal
            title="提示"
            messageContent={
              <div>
                {holdingMigrateDialog.name || holdingMigrateDialog.code || '该基金'}
                在全部分组中存在持仓数据，请在全部分组清空该基金持仓或迁移数据到本分组。
              </div>
            }
            icon={<FolderPlusIcon width="20" height="20" className="shrink-0 text-[var(--primary)]" />}
            confirmVariant="primary"
            confirmText="迁移数据到本分组"
            onCancel={() => setHoldingMigrateDialog({ open: false, code: null, name: '', targetGroupId: null })}
            onConfirm={async () => {
              const code = holdingMigrateDialog.code;
              const gid = holdingMigrateDialog.targetGroupId;
              if (!code || !gid) {
                setHoldingMigrateDialog({ open: false, code: null, name: '', targetGroupId: null });
                return;
              }
              try {
                await cb.current.handleMoveFunds?.({
                  codes: [code],
                  fromTab: 'all',
                  targetId: gid,
                  overwrite: true
                });
                cb.current.showToast?.('已迁移持仓数据到本分组', 'success');
              } catch (e) {
                console.warn('迁移持仓失败', e);
                cb.current.showToast?.('迁移失败，请稍后再试', 'error');
              } finally {
                setHoldingMigrateDialog({ open: false, code: null, name: '', targetGroupId: null });
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 打赏 ===== */}
      <AnimatePresence>{donateOpen && <DonateModal onClose={() => setDonateOpen(false)} />}</AnimatePresence>

      {/* ===== Modal: 分组管理 ===== */}
      <AnimatePresence>
        {groupManageOpen && (
          <GroupManageModal
            groups={cb.current.groups}
            onClose={() => setGroupManageOpen(false)}
            onSave={cb.current.handleUpdateGroups}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 新建分组 ===== */}
      <AnimatePresence>
        {groupModalOpen && (
          <GroupModal onClose={() => setGroupModalOpen(false)} onConfirm={cb.current.handleAddGroup} />
        )}
      </AnimatePresence>

      {/* ===== Modal: 成功提示 ===== */}
      <AnimatePresence>
        {successModal.open && (
          <SuccessModal message={successModal.message} onClose={() => setSuccessModal({ open: false, message: '' })} />
        )}
      </AnimatePresence>

      {/* ===== Modal: 设备冲突 ===== */}
      <AnimatePresence>
        {deviceConflictModal.open && (
          <ConfirmModal
            title="其它设备登录提示"
            onCancel={() => {
              setDeviceConflictModal({ ...deviceConflictModal, open: false });
              if (cb.current.skipSyncRef) cb.current.skipSyncRef.current = false;
              if (cb.current.refreshCycleStartRef) cb.current.refreshCycleStartRef.current = Date.now();
            }}
            onConfirm={async () => {
              const { userId } = deviceConflictModal;
              setDeviceConflictModal({ ...deviceConflictModal, open: false });
              if (cb.current.refreshCycleStartRef) cb.current.refreshCycleStartRef.current = Date.now();
              await cb.current.fetchCloudConfig?.(userId, false, { forceTakeover: true });
            }}
            message={deviceConflictModal.message}
            confirmText="确认接管"
            icon={<RefreshCw width="20" height="20" className="shrink-0 text-[var(--primary)]" />}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 云配置同步 ===== */}
      <AnimatePresence>
        {cloudConfigModal.open && (
          <CloudConfigModal
            type={cloudConfigModal.type}
            onConfirm={cb.current.handleSyncLocalConfig}
            onCancel={() => {
              if (cloudConfigModal.type === 'conflict' && cloudConfigModal.cloudData) {
                cb.current.applyCloudConfig?.(cloudConfigModal.cloudData);
                cb.current.syncUserConfig?.(cloudConfigModal.userId, false, cloudConfigModal.cloudData, false, {
                  forceTakeover: true
                });
              } else {
                if (cb.current.skipSyncRef) cb.current.skipSyncRef.current = false;
              }
              setCloudConfigModal({ open: false, userId: null });
            }}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 扫描识别 - 选择 ===== */}
      <AnimatePresence>
        {scanModalOpen && (
          <ScanPickModal
            onClose={() => setScanModalOpen(false)}
            onPick={cb.current.handleScanPick}
            onFilesDrop={cb.current.handleFilesDrop}
            isScanning={isScanning}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 扫描识别 - 确认 ===== */}
      <AnimatePresence>
        {scanConfirmModalOpen && (
          <ScanImportConfirmModal
            scannedFunds={cb.current.scannedFunds}
            selectedScannedCodes={cb.current.selectedScannedCodes}
            onClose={() => setScanConfirmModalOpen(false)}
            onToggle={cb.current.toggleScannedCode}
            onConfirm={cb.current.confirmScanImport}
            onRetryOcr={cb.current.handleRetryOcr}
            refreshing={cb.current.refreshing}
            groups={cb.current.groups}
            existingAllCodes={(cb.current.funds || []).map((f) => f?.code).filter(Boolean)}
            existingFavCodes={Array.from(cb.current.favorites || new Set())}
            isOcrScan={cb.current.isOcrScan}
            currentGroup={cb.current.currentTab === 'summary' ? 'all' : cb.current.currentTab}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 设置 ===== */}
      <AnimatePresence>
        {settingsOpen && (
          <SettingsModal
            onClose={() => setSettingsOpen(false)}
            tempSeconds={cb.current.tempSeconds}
            setTempSeconds={cb.current.setTempSeconds}
            saveSettings={cb.current.saveSettings}
            exportLocalData={cb.current.exportLocalData}
            importFileRef={cb.current.importFileRef}
            handleImportFileChange={cb.current.handleImportFileChange}
            importMsg={cb.current.importMsg}
            containerWidth={cb.current.containerWidth}
            setContainerWidth={cb.current.setContainerWidth}
            onResetContainerWidth={cb.current.handleResetContainerWidth}
            showMarketIndexPc={cb.current.showMarketIndexPc}
            showMarketIndexMobile={cb.current.showMarketIndexMobile}
            showGroupFundSearchPc={cb.current.showGroupFundSearchPc}
            showGroupFundSearchMobile={cb.current.showGroupFundSearchMobile}
            dynamicStylePc={cb.current.dynamicStylePc}
            dynamicStyleMobile={cb.current.dynamicStyleMobile}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 扫描进度 ===== */}
      <AnimatePresence>
        {isScanning && <ScanProgressModal scanProgress={cb.current.scanProgress} onCancel={cb.current.cancelScan} />}
      </AnimatePresence>

      {/* ===== Modal: 扫描导入进度 ===== */}
      <AnimatePresence>
        {isScanImporting && <ScanImportProgressModal scanImportProgress={cb.current.scanImportProgress} />}
      </AnimatePresence>

      {/* ===== Modal: 登录 ===== */}
      <AnimatePresence>
        {loginModalOpen && (
          <LoginModal
            onClose={() => {
              setLoginModalOpen(false);
              setLoginInitialError('');
            }}
            showToast={cb.current.showToast}
            isExplicitLoginRef={cb.current.isExplicitLoginRef}
            initialError={loginInitialError}
          />
        )}
      </AnimatePresence>

      {/* ===== Modal: 排序个性化设置 ===== */}
      <AnimatePresence>
        {sortSettingOpen && <SortSettingModal open={sortSettingOpen} onClose={() => setSortSettingOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
