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

/** @param {string} fundCode */
export const pingzhongdata = (fundCode) => ['pingzhongdata', String(fundCode).trim()];

/** @param {string} code @param {string} range */
export const fundHistory = (code, range) => ['fundHistory', String(code).trim(), range];

/** @param {string} val */
export const fundSearch = (val) => ['fundSearch', String(val).trim()];

export const eastmoneyFundcodeSearchList = () => ['eastmoneyFundcodeSearchList'];
