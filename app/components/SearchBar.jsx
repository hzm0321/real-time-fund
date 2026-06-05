'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ScanButton from './ScanButton';

export default function SearchBar({
  inputRef,
  searchTerm,
  handleSearchInput,
  showDropdown,
  setShowDropdown,
  isSearchFocused,
  setIsSearchFocused,
  searchResults,
  isSearching,
  selectedFunds,
  toggleSelectFund,
  isScanning,
  handleScanClick,
  addFund
}) {
  return (
    <>
      <form className="form" onSubmit={addFund}>
        <div className="search-input-wrapper" style={{ flex: 1, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="navbar-search-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <div className="input navbar-input-shell" style={{ display: 'flex', alignItems: 'center' }}>
            <input
              ref={inputRef}
              className="navbar-input-field"
              placeholder="搜索基金名称或代码..."
              value={searchTerm}
              onChange={handleSearchInput}
              onFocus={() => {
                setShowDropdown(true);
                setIsSearchFocused(true);
              }}
              onBlur={() => {
                // 延迟关闭，以允许点击搜索结果
                setTimeout(() => setIsSearchFocused(false), 200);
              }}
              style={{ flex: 1 }}
            />
            <div style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
              <ScanButton onClick={handleScanClick} disabled={isScanning} />
            </div>
          </div>
          {isSearching && <div className="search-spinner" />}
        </div>
        <button
          className="button"
          type="submit"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            display: isSearchFocused || selectedFunds.length > 0 ? 'inline-flex' : undefined,
            alignItems: 'center',
            justifyContent: 'center',
            whiteSpace: 'nowrap',
            minWidth: 'fit-content'
          }}
        >
          添加
        </button>
      </form>

      <AnimatePresence>
        {showDropdown && (String(searchTerm ?? '').trim() || searchResults.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="search-dropdown glass scrollbar-y-styled"
          >
            {searchResults.length > 0 ? (
              <div className="search-results">
                {searchResults.map((fund) => {
                  const isSelected = selectedFunds.some((f) => f.CODE === fund.CODE);
                  return (
                    <div
                      key={fund.CODE}
                      className={`search-item ${isSelected ? 'selected' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        toggleSelectFund(fund);
                      }}
                    >
                      <div className="fund-info">
                        <span className="fund-name">{fund.NAME}</span>
                        <span className="fund-code muted">
                          #{fund.CODE} | {fund.TYPE}
                        </span>
                      </div>
                      <div className="checkbox">{isSelected && <div className="checked-mark" />}</div>
                    </div>
                  );
                })}
              </div>
            ) : String(searchTerm ?? '').trim() && !isSearching ? (
              <div className="no-results muted">未找到相关基金</div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
