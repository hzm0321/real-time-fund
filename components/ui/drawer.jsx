'use client';
import { isFunction, isNumber } from 'lodash';

import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '@/lib/utils';

const DrawerScrollLockContext = React.createContext(null);

/**
 * 移动端滚动锁定：不再对 body 设置任何属性，
 * 仅在 Context 中提供 open 状态，然后在 DrawerOverlay 中处理禁止遮罩层的滚动。
 */
function useScrollLock(open) {
  return React.useMemo(() => (open ? { open } : null), [open]);
}

/**
 * 缓存"正常"视口高度（无虚拟键盘时）。
 * 移动端聚焦输入框后键盘弹出会缩小 visualViewport.height，
 * 导致 Drawer 基于 vh 计算的高度异常偏小。
 * 通过缓存正常高度，Drawer 打开时使用缓存值而非被压缩的视口高度。
 */
let _cachedNormalViewportHeight = null;

function getViewportHeight() {
  if (typeof window === 'undefined') return null;
  const innerHeight = window.innerHeight;
  const visualHeight = window.visualViewport?.height;
  const current =
    Number.isFinite(visualHeight) && visualHeight > 0
      ? visualHeight
      : Number.isFinite(innerHeight) && innerHeight > 0
        ? innerHeight
        : null;
  // 更新缓存：首次赋值，或当前视口更大（键盘已收起）时刷新
  if (current != null && (_cachedNormalViewportHeight == null || current > _cachedNormalViewportHeight)) {
    _cachedNormalViewportHeight = current;
  }
  return current;
}

/** 获取用于 vh 计算的参考高度：优先使用缓存的正常视口高度，避免键盘弹出干扰 */
function getReferenceHeight() {
  getViewportHeight(); // 顺带刷新缓存
  return _cachedNormalViewportHeight ?? getViewportHeight();
}

function parseVhToPx(vhStr) {
  if (isNumber(vhStr)) return Number.isFinite(vhStr) && vhStr >= 0 ? vhStr : null;
  const match = String(vhStr).match(/^([\d.]+)\s*vh$/);
  if (!match) return null;
  const ratio = Number(match[1]);
  const viewportHeight = getReferenceHeight();
  if (!Number.isFinite(ratio) || viewportHeight == null) return null;
  return (viewportHeight * ratio) / 100;
}

/**
 * 将 style 对象中的 vh 值（如 height: '85vh'）转换为 px，
 * 使用缓存的正常视口高度，避免虚拟键盘弹出导致高度偏小。
 */
function convertStyleVhToPx(style) {
  if (!style || typeof style !== 'object') return style;
  const result = { ...style };
  const vhProps = ['height', 'maxHeight', 'minHeight', 'top', 'bottom'];
  for (const prop of vhProps) {
    const val = result[prop];
    if (typeof val === 'string') {
      const px = parseVhToPx(val);
      if (px != null) result[prop] = `${px}px`;
    }
  }
  return result;
}

/**
 * 将 className 中的 Tailwind vh 任意值类（如 h-[85vh]、max-h-[90vh]、min-h-[20vh]）
 * 转换为等价的 px 内联样式，避免 CSS vh 受虚拟键盘影响。
 * 返回 { cleanClassName, overrides } — cleanClassName 为去除已转换类后的字符串，
 * overrides 为需要合并到 style 中的 px 值。
 */
function extractClassNameVhOverrides(className) {
  if (!className || typeof className !== 'string') return { cleanClassName: className, overrides: {} };
  const overrides = {};
  const propMap = { h: 'height', 'max-h': 'maxHeight', 'min-h': 'minHeight' };
  const cleanParts = [];
  for (const token of className.split(/\s+/)) {
    let matched = false;
    for (const [prefix, cssProp] of Object.entries(propMap)) {
      const re = new RegExp(`^(?:sm:|md:|lg:|xl:)?(?:data-\\[.*?\\]:)?${prefix}-\\[([\\d.]+)vh\\]$`);
      const m = token.match(re);
      if (m) {
        const px = parseVhToPx(`${m[1]}vh`);
        if (px != null) overrides[cssProp] = `${px}px`;
        matched = true;
        break;
      }
    }
    if (!matched) cleanParts.push(token);
  }
  return { cleanClassName: cleanParts.join(' '), overrides };
}

function safePreventDefault(e) {
  if (isFunction(e?.preventDefault) && e?.cancelable !== false) e.preventDefault();
}

function stopEvent(e) {
  safePreventDefault(e);
  if (isFunction(e?.stopPropagation)) e.stopPropagation();
}

function getEventClientY(e) {
  const nativeEvent = e?.nativeEvent ?? e;
  const touches = e?.touches ?? nativeEvent?.touches ?? nativeEvent?.changedTouches;
  const clientY = e?.clientY ?? nativeEvent?.clientY ?? touches?.[0]?.clientY;
  return Number.isFinite(clientY) ? clientY : null;
}

function Drawer({ open, ...props }) {
  const scrollLock = useScrollLock(open);
  const contextValue = React.useMemo(() => ({ ...scrollLock, open: !!open }), [scrollLock, open]);
  return (
    <DrawerScrollLockContext.Provider value={contextValue}>
      <DrawerPrimitive.Root modal={false} data-slot="drawer" open={open} {...props} />
    </DrawerScrollLockContext.Provider>
  );
}

function DrawerTrigger({ ...props }) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({ ...props }) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({ className, style, ...props }) {
  const ctx = React.useContext(DrawerScrollLockContext);
  const { open = false, ...scrollLockProps } = ctx || {};

  const overlayRef = React.useRef(null);

  React.useEffect(() => {
    const el = overlayRef.current;
    if (!el || !open) return;

    el.addEventListener('touchmove', stopEvent, { passive: false });
    el.addEventListener('wheel', stopEvent, { passive: false });

    return () => {
      el.removeEventListener('touchmove', stopEvent);
      el.removeEventListener('wheel', stopEvent);
    };
  }, [open]);

  // modal={false} 时 vaul 不渲染/隐藏 Overlay，用自定义遮罩 div 保证始终有遮罩；点击遮罩关闭
  return (
    <div
      ref={overlayRef}
      data-slot="drawer-overlay"
      data-state={open ? 'open' : 'closed'}
      role="button"
      tabIndex={-1}
      aria-label="关闭"
      className={cn(
        'fixed inset-0 z-50 cursor-default bg-[var(--drawer-overlay,rgba(0,0,0,0.45))] backdrop-blur-[6px]',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className
      )}
      {...scrollLockProps}
      {...props}
      style={{ touchAction: 'none', ...style }}
    />
  );
}

function DrawerContent({
  className,
  children,
  defaultHeight = '77vh',
  minHeight = '20vh',
  maxHeight = '90vh',
  style: styleProp,
  ...props
}) {
  // 将 className 中的 Tailwind vh 类（如 h-[85vh]、max-h-[90vh]）转为 px 内联样式
  const classNameResult = React.useMemo(() => extractClassNameVhOverrides(className), [className]);
  const { cleanClassName, overrides: classNameVhOverrides } = classNameResult;
  // 将 style prop 中的 vh 值（如 height: '85vh'）转为 px
  const convertedStyleProp = React.useMemo(() => convertStyleVhToPx(styleProp), [styleProp]);
  const [heightPx, setHeightPx] = React.useState(() =>
    typeof window !== 'undefined' ? parseVhToPx(defaultHeight) : null
  );
  const [isDragging, setIsDragging] = React.useState(false);
  const dragRef = React.useRef({ startY: 0, startHeight: 0 });

  const minPx = React.useMemo(() => parseVhToPx(minHeight), [minHeight]);
  const maxPx = React.useMemo(() => parseVhToPx(maxHeight), [maxHeight]);

  React.useEffect(() => {
    const px = parseVhToPx(defaultHeight);
    if (Number.isFinite(px)) setHeightPx(px);
  }, [defaultHeight]);

  // 键盘出现/消失时自动补偿高度：
  // - 键盘弹出（视口缩小）→ 保持基于正常视口的高度不变
  // - 键盘收起（视口恢复）→ 重新按 defaultHeight 同步
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => {
      // 刷新缓存（如果视口变大了说明键盘收起了）
      getViewportHeight();
      setHeightPx(() => {
        const fallback = parseVhToPx(defaultHeight);
        return Number.isFinite(fallback) ? fallback : null;
      });
    };
    // 仅监听 window resize（键盘收起/横竖屏切换），不监听 visualViewport resize
    // 因为 visualViewport resize 在键盘弹出时也会触发，会导致高度被压缩
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
    };
  }, [defaultHeight, minHeight, maxHeight]);

  const handlePointerDown = React.useCallback(
    (e) => {
      const startY = getEventClientY(e);
      if (!Number.isFinite(startY)) return;
      safePreventDefault(e);
      setIsDragging(true);
      const fallbackHeight = parseVhToPx(defaultHeight);
      dragRef.current = {
        startY,
        startHeight: Number.isFinite(heightPx) ? heightPx : Number.isFinite(fallbackHeight) ? fallbackHeight : 0
      };
    },
    [heightPx, defaultHeight]
  );

  React.useEffect(() => {
    if (!isDragging) return;
    const move = (e) => {
      const clientY = getEventClientY(e);
      const { startY, startHeight } = dragRef.current;
      if (!Number.isFinite(clientY) || !Number.isFinite(startY) || !Number.isFinite(startHeight)) return;
      const delta = startY - clientY;
      const lower = Number.isFinite(minPx) ? minPx : 0;
      const upper = Number.isFinite(maxPx) ? maxPx : Infinity;
      const next = Math.min(upper, Math.max(lower, startHeight + delta));
      if (Number.isFinite(next)) setHeightPx(next);
    };
    const up = () => setIsDragging(false);
    document.addEventListener('mousemove', move, { passive: true });
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
    };
  }, [isDragging, minPx, maxPx]);

  const contentStyle = React.useMemo(() => {
    const base = {};
    if (Number.isFinite(heightPx)) base.height = `${heightPx}px`;
    if (Number.isFinite(maxPx)) base.maxHeight = `${maxPx}px`;
    // className vh 转换的 px 值覆盖（优先级高于 defaultHeight 计算值）
    Object.assign(base, classNameVhOverrides);
    // 调用者显式传入的 style 最后覆盖（最高优先级）
    if (convertedStyleProp) Object.assign(base, convertedStyleProp);
    return Object.keys(base).length > 0 ? base : undefined;
  }, [heightPx, maxPx, classNameVhOverrides, convertedStyleProp]);

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        style={contentStyle}
        className={cn(
          'group/drawer-content fixed z-50 flex h-auto flex-col bg-[var(--card)] text-[var(--text)] border-[var(--border)]',
          'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-[var(--radius)] data-[vaul-drawer-direction=top]:border-b drawer-shadow-top',
          'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[88vh] data-[vaul-drawer-direction=bottom]:rounded-t-[20px] data-[vaul-drawer-direction=bottom]:border-t drawer-shadow-bottom',
          'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm',
          'data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm',
          'drawer-content-theme',
          cleanClassName
        )}
        {...props}
      >
        <div
          role="separator"
          aria-label="拖动调整高度"
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          className={cn(
            'mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full bg-[var(--muted)] cursor-n-resize touch-none select-none',
            'group-data-[vaul-drawer-direction=bottom]/drawer-content:block',
            'hover:bg-[var(--muted-foreground)/0.4] active:bg-[var(--muted-foreground)/0.6]'
          )}
        />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        'flex flex-col gap-0.5 p-4 border-b border-[var(--border)] group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left',
        'drawer-header-theme',
        className
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }) {
  return <div data-slot="drawer-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

function DrawerTitle({ className, ...props }) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('font-semibold text-[var(--text)]', className)}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-[var(--muted)]', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription
};
