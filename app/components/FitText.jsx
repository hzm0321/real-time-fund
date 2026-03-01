'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * 根据容器宽度动态缩小字体，使内容不溢出。
 * 使用 ResizeObserver 监听容器宽度，内容超出时按比例缩小 fontSize，不低于 minFontSize。
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - 要显示的文本（会单行、不换行）
 * @param {number} [props.maxFontSize=14] - 最大字号（px）
 * @param {number} [props.minFontSize=10] - 最小字号（px），再窄也不低于此值
 * @param {string} [props.className] - 外层容器 className
 * @param {Object} [props.style] - 外层容器 style（宽度由父级决定，建议父级有明确宽度）
 * @param {string} [props.as='span'] - 外层容器标签 'span' | 'div'
 */
export default function FitText({
  children,
  maxFontSize = 14,
  minFontSize = 10,
  className,
  style = {},
  as: Tag = 'span',
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);

  const adjust = () => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const containerWidth = container.clientWidth;
    if (containerWidth <= 0) return;

    // 先恢复到最大字号再测量，确保在「未缩放」状态下取到真实内容宽度
    content.style.fontSize = `${maxFontSize}px`;

    const run = () => {
      const contentWidth = content.scrollWidth;
      if (contentWidth <= 0) return;
      let size = maxFontSize;
      if (contentWidth > containerWidth) {
        size = (containerWidth / contentWidth) * maxFontSize;
        size = Math.max(minFontSize, Math.min(maxFontSize, size));
      }
      content.style.fontSize = `${size}px`;
    };

    requestAnimationFrame(run);
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    adjust();
    const ro = new ResizeObserver(adjust);
    ro.observe(container);
    return () => ro.disconnect();
  }, [children, maxFontSize, minFontSize]);

  return (
    <Tag
      ref={containerRef}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      <span
        ref={contentRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          fontWeight: 'inherit',
          fontSize: `${maxFontSize}px`,
        }}
      >
        {children}
      </span>
    </Tag>
  );
}
