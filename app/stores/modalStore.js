import { create } from 'zustand';

// ---- Module-level resolve map for Promise-based selectFundSingleModal ----
const selectFundSingleResolvers = new Map();
let selectFundSingleNonce = 0;

// ---- Default shapes for object-style modals ----
const DEFAULTS = {
  holdingModal: { open: false, fundCode: null, groupId: undefined },
  actionModal: { open: false, fundCode: null, groupId: undefined },
  tradeModal: { open: false, fundCode: null, type: 'buy', groupId: undefined },
  convertModal: { open: false, fundCode: null, groupId: undefined },
  dividendMethodModal: { open: false, fundCode: null, groupId: undefined },
  selectFundSingleModal: { open: false, excludeCodes: [], initialSelectedCode: '', _nonce: null },
  selectHoldingGroupModal: { open: false, fundCode: null },
  dataSourceModal: { open: false, fundCode: null },
  dcaModal: { open: false, fundCode: null, groupId: undefined },
  historyModal: { open: false, fundCode: null, groupId: undefined },
  addHistoryModal: { open: false, fundCode: null, groupId: undefined },
  fundTagsEdit: { open: false, code: null, name: '', tags: [] },
  holdingMigrateDialog: { open: false, code: null, name: '', targetGroupId: null },
  cloudConfigModal: { open: false, userId: null, type: null, cloudData: null },
  deviceConflictModal: { open: false, message: '', userId: null, payload: null, isPartial: false },
  successModal: { open: false, message: '' }
};

const getClosedModalState = () => ({
  settingsOpen: false,
  feedbackOpen: false,
  weChatOpen: false,
  donateOpen: false,
  loginModalOpen: false,
  loginInitialError: '',
  tutorialDrawerOpen: false,
  updateLogOpen: false,
  isUpdateModalOpen: false,
  isLogoutConfirmOpen: false,
  mobileTableSettingModalOpen: false,
  mobileFundDrawerOpen: false,
  portfolioEarningsOpen: false,
  sortSettingOpen: false,
  allSectorsModalOpen: false,
  groupModalOpen: false,
  groupManageOpen: false,
  addFundToGroupOpen: false,
  holdingModal: { ...DEFAULTS.holdingModal },
  actionModal: { ...DEFAULTS.actionModal },
  tradeModal: { ...DEFAULTS.tradeModal },
  convertModal: { ...DEFAULTS.convertModal },
  dividendMethodModal: { ...DEFAULTS.dividendMethodModal },
  selectFundSingleModal: { ...DEFAULTS.selectFundSingleModal },
  selectHoldingGroupModal: { ...DEFAULTS.selectHoldingGroupModal },
  dataSourceModal: { ...DEFAULTS.dataSourceModal },
  dcaModal: { ...DEFAULTS.dcaModal },
  historyModal: { ...DEFAULTS.historyModal },
  addHistoryModal: { ...DEFAULTS.addHistoryModal },
  fundTagsEdit: { ...DEFAULTS.fundTagsEdit },
  clearConfirm: null,
  fundDeleteConfirm: null,
  fundDeleteBulkConfirm: null,
  holdingMigrateDialog: { ...DEFAULTS.holdingMigrateDialog },
  cloudConfigModal: { ...DEFAULTS.cloudConfigModal },
  deviceConflictModal: { ...DEFAULTS.deviceConflictModal },
  successModal: { ...DEFAULTS.successModal },
  scanModalOpen: false,
  scanConfirmModalOpen: false,
  isScanning: false,
  isScanImporting: false,
  scannedFunds: [],
  selectedScannedCodes: new Set(),
  scanProgress: { stage: 'ocr', current: 0, total: 0 },
  scanImportProgress: { current: 0, total: 0, success: 0, failed: 0 },
  isOcrScan: false
});

export const useModalStore = create((set, get) => ({
  // ---- Simple boolean modals ----
  settingsOpen: false,
  feedbackOpen: false,
  feedbackNonce: 0,
  weChatOpen: false,
  donateOpen: false,
  loginModalOpen: false,
  loginInitialError: '',
  tutorialDrawerOpen: false,
  updateLogOpen: false,
  isUpdateModalOpen: false,
  isLogoutConfirmOpen: false,
  mobileTableSettingModalOpen: false,
  mobileFundDrawerOpen: false,
  portfolioEarningsOpen: false,
  sortSettingOpen: false,
  allSectorsModalOpen: false,
  allSectorsFilter: 'industry',
  allSectorsSort: 'change_pct',
  allSectorsSortOrder: 'desc',

  // ---- Group modals ----
  groupModalOpen: false,
  groupManageOpen: false,
  addFundToGroupOpen: false,

  // ---- Data-bearing modals ----
  holdingModal: { ...DEFAULTS.holdingModal },
  actionModal: { ...DEFAULTS.actionModal },
  tradeModal: { ...DEFAULTS.tradeModal },
  convertModal: { ...DEFAULTS.convertModal },
  dividendMethodModal: { ...DEFAULTS.dividendMethodModal },
  selectFundSingleModal: { ...DEFAULTS.selectFundSingleModal },
  selectHoldingGroupModal: { ...DEFAULTS.selectHoldingGroupModal },
  dataSourceModal: { ...DEFAULTS.dataSourceModal },
  dcaModal: { ...DEFAULTS.dcaModal },
  historyModal: { ...DEFAULTS.historyModal },
  addHistoryModal: { ...DEFAULTS.addHistoryModal },
  fundTagsEdit: { ...DEFAULTS.fundTagsEdit },

  // ---- Confirm dialogs (truthy/null) ----
  clearConfirm: null,
  fundDeleteConfirm: null,
  fundDeleteBulkConfirm: null,
  holdingMigrateDialog: { ...DEFAULTS.holdingMigrateDialog },

  // ---- Cloud/sync modals ----
  cloudConfigModal: { ...DEFAULTS.cloudConfigModal },
  deviceConflictModal: { ...DEFAULTS.deviceConflictModal },
  successModal: { ...DEFAULTS.successModal },

  // ---- Scan modals (migrated from useScanImport) ----
  scanModalOpen: false,
  scanConfirmModalOpen: false,
  isScanning: false,
  isScanImporting: false,
  scannedFunds: [],
  selectedScannedCodes: new Set(),
  scanProgress: { stage: 'ocr', current: 0, total: 0 },
  scanImportProgress: { current: 0, total: 0, success: 0, failed: 0 },
  isOcrScan: false,
  modalErrorResetKey: 0,

  // ---- Actions ----

  /** Generic close: resets a named modal to its default value */
  closeModal: (name) => {
    if (DEFAULTS[name]) {
      set({ [name]: { ...DEFAULTS[name] } });
    } else {
      // boolean modals and confirm dialogs
      set({ [name]: false });
    }
  },

  /** Close all modal/drawer/dialog state after a render-time crash. */
  closeAllModals: () =>
    set((state) => ({
      ...getClosedModalState(),
      modalErrorResetKey: state.modalErrorResetKey + 1
    })),

  /**
   * Central modal router: closes actionModal, opens target modal.
   * All in one set() for atomicity.
   */
  handleAction: (type, fundCode, groupId) => {
    const base = type !== 'history' ? { actionModal: { ...DEFAULTS.actionModal } } : {};

    if (type === 'edit') {
      set({ ...base, holdingModal: { open: true, fundCode, groupId } });
    } else if (type === 'clear') {
      set({ ...base, clearConfirm: { fundCode, groupId } });
    } else if (type === 'buy' || type === 'sell') {
      set({ ...base, tradeModal: { open: true, fundCode, type, groupId } });
    } else if (type === 'history') {
      set({ ...base, historyModal: { open: true, fundCode, groupId } });
    } else if (type === 'dca') {
      set({ ...base, dcaModal: { open: true, fundCode, groupId } });
    } else if (type === 'convert') {
      set({ ...base, convertModal: { open: true, fundCode, groupId } });
    } else if (type === 'dividend') {
      set({ ...base, dividendMethodModal: { open: true, fundCode, groupId } });
    }
  },

  /**
   * Opens selectFundSingleModal and returns a Promise that resolves
   * with the picked fund (or null on cancel).
   */
  openSelectFundSingle: (excludeCodes, initialSelectedCode) => {
    const nonce = ++selectFundSingleNonce;
    return new Promise((resolve) => {
      selectFundSingleResolvers.set(nonce, resolve);
      set({
        selectFundSingleModal: {
          open: true,
          excludeCodes: excludeCodes || [],
          initialSelectedCode: initialSelectedCode || '',
          _nonce: nonce
        }
      });
    });
  },

  /** Resolves the pending selectFundSingleModal Promise and closes the modal */
  resolveSelectFundSingle: (picked) => {
    const { selectFundSingleModal } = get();
    const nonce = selectFundSingleModal._nonce;
    if (nonce != null) {
      const resolve = selectFundSingleResolvers.get(nonce);
      if (resolve) {
        resolve(picked);
        selectFundSingleResolvers.delete(nonce);
      }
    }
    set({ selectFundSingleModal: { ...DEFAULTS.selectFundSingleModal } });
  }
}));

// ---- Non-React accessor for use in callbacks ----
export const getModalState = () => useModalStore.getState();
