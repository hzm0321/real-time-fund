'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import packageJson from '../../package.json';
import { fetchLatestRelease } from '../api/fund';
import { UpdateIcon } from './Icons';
import UpdatePromptModal from './UpdatePromptModal';

export default function UpdateChecker({ onModalOpenChange }) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [updateContent, setUpdateContent] = useState('');
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  useEffect(() => {
    onModalOpenChange?.(updateModalOpen);
  }, [updateModalOpen, onModalOpenChange]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GITHUB_LATEST_RELEASE_URL) return;

    const checkUpdate = async () => {
      try {
        const data = await fetchLatestRelease();
        if (!data?.tagName) return;
        const remoteVersion = data.tagName.replace(/^v/, '');
        if (remoteVersion !== packageJson.version) {
          setHasUpdate(true);
          setLatestVersion(remoteVersion);
          setUpdateContent(data.body || '');
        }
      } catch (e) {
        console.error('Check update failed:', e);
      }
    };

    checkUpdate();
    const interval = setInterval(checkUpdate, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {hasUpdate && (
        <div
          className="badge"
          title={`发现新版本 ${latestVersion}，点击前往下载`}
          style={{ cursor: 'pointer', borderColor: 'var(--success)', color: 'var(--success)' }}
          onClick={() => setUpdateModalOpen(true)}
        >
          <UpdateIcon width="14" height="14" />
        </div>
      )}

      <AnimatePresence>
        {updateModalOpen && (
          <UpdatePromptModal
            open={updateModalOpen}
            updateContent={updateContent}
            onClose={() => setUpdateModalOpen(false)}
            onRefresh={() => window.location.reload()}
          />
        )}
      </AnimatePresence>
    </>
  );
}

