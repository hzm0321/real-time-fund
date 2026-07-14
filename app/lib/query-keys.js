/** @param {string} normalizedUrl */
export const eastmoneyScript = (normalizedUrl) => ['eastmoneyScript', normalizedUrl];

/** @param {string} fundCode */
export const fundHoldingsArchives = (fundCode) => ['fundHoldingsArchives', String(fundCode).trim()];

/** @param {string} code @param {string} authSegment */
export const relatedSectors = (code, authSegment) => ['relatedSectors', String(code).trim(), String(authSegment)];

/** @param {string} relatedSector */
export const fundSecid = (relatedSector) => ['fundSecid', String(relatedSector).trim()];

/** @param {string} secid */
export const eastSectorQuote = (secid) => ['eastSectorQuote', String(secid).trim()];

/** @param {string} tp */
export const bkDetailQuote = (tp) => ['bkDetailQuote', String(tp).trim()];

/** @param {string} fundCode */
export const fundSectorOptions = (fundCode) => ['fundSectorOptions', String(fundCode).trim()];

/** @param {string} fundCode */
export const pingzhongdata = (fundCode) => ['pingzhongdata', String(fundCode).trim()];

/** @param {string} code @param {string} range @param {string} netValueType */
export const fundHistory = (code, range, netValueType = 'unit') => ['fundHistory', code, range, netValueType];
export const fundValuationTrend = (code, range) => ['fundValuationTrend', code, range];
export const marketStatus = () => ['marketStatus'];

/** @param {string} val */
export const fundSearch = (val) => ['fundSearch', String(val).trim()];

export const eastmoneyFundcodeSearchList = () => ['eastmoneyFundcodeSearchList'];

/** @param {string} fundCode @param {string} dateStr */
export const ocrFundChart = (fundCode, dateStr) => ['ocrFundChart', String(fundCode).trim(), dateStr];

/** @param {string} userId */
export const ocrDailyRemaining = (userId) => ['ocrDailyRemaining', String(userId || '').trim()];

/** @param {string} fundCode */
export const fundConfirmDays = (fundCode) => ['fundConfirmDays', String(fundCode).trim()];

/** @param {string} code @param {string} jzrq @param {number} actualZzl */
export const bestValuationSource = (code, jzrq, actualZzl) => [
  'bestValuationSource',
  String(code).trim(),
  jzrq,
  actualZzl
];

/** 批量最准数据源查询的 cache key（以排序后的 code:jzrq:actualZzl 拼接） */
export const bestValuationSourceBatch = (itemsKey) => ['bestValuationSourceBatch', itemsKey];

/** @param {string} fundCode */
export const fundBestSource = (fundCode) => ['fundBestSource', String(fundCode).trim()];

/** @param {string} fundCode */
export const isQdiiFund = (fundCode) => ['isQdiiFund', String(fundCode).trim()];

/** @param {string} fundCode — QDII 估值数据（gs_qdii 表） */
export const qdiiValuation = (fundCode) => ['qdiiValuation', String(fundCode).trim()];

/** @param {string} userId */
export const membershipStatus = (userId) => ['membershipStatus', String(userId || '').trim()];
