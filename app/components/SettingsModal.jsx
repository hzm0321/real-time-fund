'use client';

import { SettingsIcon } from './Icons';

export default function SettingsModal({
  onClose,
  tempSeconds,
  setTempSeconds,
  saveSettings,
  exportLocalData,
  importFileRef,
  handleImportFileChange,
  importMsg
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="设置" onClick={onClose}>
      <div className="glass card modal" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ marginBottom: 12 }}>
          <SettingsIcon width="20" height="20" />
          <span>设置</span>
          <span className="muted">配置刷新频率</span>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>刷新频率</div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {[30, 60, 120, 300].map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${tempSeconds === s ? 'active' : ''}`}
                onClick={() => setTempSeconds(s)}
                aria-pressed={tempSeconds === s}
              >
                {s} 秒
              </button>
            ))}
          </div>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min="30"
            step="5"
            value={tempSeconds}
            onChange={(e) => setTempSeconds(Number(e.target.value))}
            placeholder="自定义秒数"
          />
          {tempSeconds < 30 && (
            <div className="error-text" style={{ marginTop: 8 }}>
              最小 30 秒
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>数据导出</div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="button" onClick={exportLocalData}>导出配置</button>
          </div>
          <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem', marginTop: 26 }}>数据导入</div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="button" onClick={() => importFileRef.current?.click?.()}>导入配置</button>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />
          {importMsg && (
            <div className="muted" style={{ marginTop: 8 }}>
              {importMsg}
            </div>
          )}
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="button" onClick={saveSettings} disabled={tempSeconds < 30}>保存并关闭</button>
        </div>
      </div>
    </div>
  );
}
