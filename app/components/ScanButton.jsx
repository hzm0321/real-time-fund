import React from 'react';
import { CameraIcon } from './Icons';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export default function ScanButton({ onClick, disabled }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="icon-button"
          onClick={onClick}
          disabled={disabled}
          style={{
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'wait' : 'pointer',
            width: '32px',
            height: '32px'
          }}
        >
          {disabled ? (
            <div
              className="loading-spinner"
              style={{
                width: 16,
                height: 16,
                border: '2px solid var(--muted)',
                borderTopColor: 'var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            />
          ) : (
            <CameraIcon width="18" height="18" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>拍照/上传图片识别基金代码</p>
      </TooltipContent>
    </Tooltip>
  );
}
