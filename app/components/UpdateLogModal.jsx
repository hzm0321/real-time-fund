'use client';

import { useEffect, useState } from 'react';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { CloseIcon } from './Icons';
import dayjs from 'dayjs';

export default function UpdateLogModal({ open, onOpenChange }) {
  const isMobile = useIsMobile();
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      fetch('https://api.github.com/repos/hzm0321/real-time-fund/releases')
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch releases');
          return res.json();
        })
        .then((data) => {
          setReleases(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [open]);

  const content = (
    <div className="flex-1 overflow-y-auto p-4 md:p-6" style={{ WebkitOverflowScrolling: 'touch' }}>
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <span className="loading-spinner" style={{ width: 24, height: 24, border: '2px solid var(--muted)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-[var(--danger)]">加载失败: {error}</div>
      ) : releases.length === 0 ? (
        <div className="text-center py-8 text-[var(--muted)]">暂无更新日志</div>
      ) : (
        <div className="space-y-6">
          {releases.map((release) => (
            <div key={release.id} className="relative pl-6 border-l-2 border-[var(--border)]">
              <div className="absolute w-3 h-3 bg-[var(--primary)] rounded-full -left-[7px] top-1.5" />
              <div className="mb-2 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                <h3 className="text-base font-semibold text-[var(--text)]">{release.name || release.tag_name}</h3>
                <span className="text-xs text-[var(--muted)]">{dayjs(release.published_at).format('YYYY-MM-DD')}</span>
              </div>
              <div 
                className="text-sm text-[var(--muted-foreground)] whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: release.body?.replace(/\n/g, '<br />') }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="glass" style={{ height: '85vh' }}>
          <DrawerHeader className="flex-shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 px-5 pb-3 pt-4 text-left border-b border-[var(--border)]">
            <DrawerTitle className="text-base font-semibold text-[var(--text)]">更新日志</DrawerTitle>
            <DrawerClose
              className="icon-button border-none bg-transparent p-1"
              title="关闭"
              style={{ borderColor: 'transparent', backgroundColor: 'transparent' }}
            >
              <CloseIcon width="20" height="20" />
            </DrawerClose>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-[var(--border)]">
          <DialogTitle>更新日志</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
