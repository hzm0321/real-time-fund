'use client';
import { isString } from 'lodash';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import packageJson from '../../package.json';
import { fetchLatestRelease } from '../api/fund';
import { UpdateIcon } from './Icons';
import UpdatePromptModal from './UpdatePromptModal';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/**
 * 智能版本比对函数：判断远程版本是否高于本地版本。
 * 兼容处理 GitHub Tag 带有后缀（如 v2.4.0-pro, v2.4.0(PRO)）而 package.json 中为纯数字版本（如 2.4.0）的场景，
 * 避免因为后缀字符不同（例如 "2.4.0-pro" !== "2.4.0"）导致用户刷新后依然无限提示更新的死循环。
 */
const isNewerVersion = (remoteTag, localVersion) => {
  if (!isString(remoteTag) || !isString(localVersion)) return false;

  const cleanRemote = remoteTag.replace(/^v/i, '').trim();
  const cleanLocal = localVersion.replace(/^v/i, '').trim();
  if (cleanRemote === cleanLocal) return false;

  const getCoreNumbers = (str) => {
    const match = str.match(/\d+(\.\d+)*/);
    return match ? match[0].split('.').map((n) => parseInt(n, 10) || 0) : [];
  };

  const remoteNums = getCoreNumbers(cleanRemote);
  const localNums = getCoreNumbers(cleanLocal);

  if (remoteNums.length === 0 || localNums.length === 0) {
    return cleanRemote !== cleanLocal;
  }

  const maxLen = Math.max(remoteNums.length, localNums.length);
  for (let i = 0; i < maxLen; i++) {
    const r = remoteNums[i] ?? 0;
    const l = localNums[i] ?? 0;
    if (r > l) return true;
    if (r < l) return false;
  }

  // 当核心数字版本号完全一致时（例如 cleanRemote="2.4.0-pro", cleanLocal="2.4.0"），
  // 如果一方以另一方开头（即只在末尾多出了修饰后缀），说明属于同主版本的变体，不触发强制更新提示
  if (cleanRemote.startsWith(cleanLocal) || cleanLocal.startsWith(cleanRemote)) {
    return false;
  }

  return cleanRemote > cleanLocal;
};

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
        if (!data || !data.tagName || !isString(data.tagName)) return;
        const remoteVersion = data.tagName.replace(/^v/, '');
        if (isNewerVersion(data.tagName, packageJson.version)) {
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
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="badge"
              style={{ cursor: 'pointer', borderColor: 'var(--success)', color: 'var(--success)' }}
              onClick={() => setUpdateModalOpen(true)}
            >
              <UpdateIcon width="14" height="14" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{`发现新版本 ${latestVersion}，点击前往下载`}</p>
          </TooltipContent>
        </Tooltip>
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
