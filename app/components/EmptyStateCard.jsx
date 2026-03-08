'use client';

export default function EmptyStateCard({
  fundsLength = 0,
  currentTab = 'all',
  onAddToGroup,
}) {
  const isEmpty = fundsLength === 0;
  const isGroupTab = currentTab !== 'all' && currentTab !== 'fav';

  return (
    <div
      className="glass card empty"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: 16, opacity: 0.5 }}>📂</div>
      <div className="muted" style={{ marginBottom: 20 }}>
        {isEmpty ? '尚未添加基金' : '该分组下暂无数据'}
      </div>
      {isGroupTab && fundsLength > 0 && (
        <button className="button" onClick={onAddToGroup}>
          添加基金到此分组
        </button>
      )}
    </div>
  );
}
