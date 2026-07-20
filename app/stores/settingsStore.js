import { isBoolean, isFunction, isObject } from 'lodash';
import { create } from 'zustand';

/**
 * 本地配置状态 Zustand Store
 */
export const useSettingsStore = create((set) => ({
  tempSeconds: 60,
  containerWidth: 1200,
  showMarketIndexPc: true,
  showMarketIndexMobile: true,
  showGroupFundSearchPc: true,
  showGroupFundSearchMobile: true,
  dynamicStylePc: true,
  dynamicStyleMobile: true,
  showGroupDropdownPc: false,
  showGroupDropdownMobile: false,
  isGroupSummarySticky: false,

  setTempSeconds: (val) => set({ tempSeconds: isFunction(val) ? val(useSettingsStore.getState().tempSeconds) : val }),
  setContainerWidth: (val) =>
    set({ containerWidth: isFunction(val) ? val(useSettingsStore.getState().containerWidth) : val }),
  setShowMarketIndexPc: (val) =>
    set({ showMarketIndexPc: isFunction(val) ? val(useSettingsStore.getState().showMarketIndexPc) : val }),
  setShowMarketIndexMobile: (val) =>
    set({
      showMarketIndexMobile: isFunction(val) ? val(useSettingsStore.getState().showMarketIndexMobile) : val
    }),
  setShowGroupFundSearchPc: (val) =>
    set({
      showGroupFundSearchPc: isFunction(val) ? val(useSettingsStore.getState().showGroupFundSearchPc) : val
    }),
  setShowGroupFundSearchMobile: (val) =>
    set({
      showGroupFundSearchMobile: isFunction(val) ? val(useSettingsStore.getState().showGroupFundSearchMobile) : val
    }),
  setDynamicStylePc: (val) =>
    set({ dynamicStylePc: isFunction(val) ? val(useSettingsStore.getState().dynamicStylePc) : val }),
  setDynamicStyleMobile: (val) =>
    set({ dynamicStyleMobile: isFunction(val) ? val(useSettingsStore.getState().dynamicStyleMobile) : val }),
  setShowGroupDropdownPc: (val) =>
    set({
      showGroupDropdownPc: isFunction(val) ? val(useSettingsStore.getState().showGroupDropdownPc) : val
    }),
  setShowGroupDropdownMobile: (val) =>
    set({
      showGroupDropdownMobile: isFunction(val) ? val(useSettingsStore.getState().showGroupDropdownMobile) : val
    }),
  setIsGroupSummarySticky: (val) =>
    set({
      isGroupSummarySticky: isFunction(val) ? val(useSettingsStore.getState().isGroupSummarySticky) : val
    }),

  /**
   * 从 customSettings 解析并同步配置到 Zustand 状态
   */
  syncFromCustomSettings: (customSettings) => {
    if (!customSettings || !isObject(customSettings)) return;
    try {
      const patch = {};
      const w = customSettings.pcContainerWidth;
      const num = Number(w);
      if (Number.isFinite(num)) {
        const maxWidth =
          typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
            ? 99999
            : typeof window !== 'undefined'
              ? Math.max(window.innerWidth, 2000)
              : 1200;
        patch.containerWidth = Math.min(maxWidth, Math.max(600, num));
      }
      if (isBoolean(customSettings.showMarketIndexPc)) patch.showMarketIndexPc = customSettings.showMarketIndexPc;
      if (isBoolean(customSettings.showMarketIndexMobile))
        patch.showMarketIndexMobile = customSettings.showMarketIndexMobile;
      if (isBoolean(customSettings.showGroupFundSearchPc))
        patch.showGroupFundSearchPc = customSettings.showGroupFundSearchPc;
      if (isBoolean(customSettings.showGroupFundSearchMobile))
        patch.showGroupFundSearchMobile = customSettings.showGroupFundSearchMobile;
      if (isBoolean(customSettings.dynamicStylePc)) patch.dynamicStylePc = customSettings.dynamicStylePc;
      if (isBoolean(customSettings.dynamicStyleMobile)) patch.dynamicStyleMobile = customSettings.dynamicStyleMobile;
      if (isBoolean(customSettings.showGroupDropdownPc)) patch.showGroupDropdownPc = customSettings.showGroupDropdownPc;
      if (isBoolean(customSettings.showGroupDropdownMobile))
        patch.showGroupDropdownMobile = customSettings.showGroupDropdownMobile;

      if (Object.keys(patch).length > 0) {
        set(patch);
      }
    } catch (e) {
      // ignore
    }
  }
}));
