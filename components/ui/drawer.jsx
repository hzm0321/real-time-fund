"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

const DrawerScrollLockContext = React.createContext(null)

/**
 * 移动端滚动锁定：仅将 body 设为 position:fixed，用负值 top 把页面“拉”回当前视口位置，
 * 既锁定滚动又保留视觉位置；overlay 上 ontouchmove preventDefault 防止背景触摸滚动。
 */
function useScrollLock(open) {
  const savedScrollYRef = React.useRef(0)
  const onOverlayTouchMove = React.useCallback((e) => {
    e.preventDefault()
  }, [])

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return
    const scrollY = window.scrollY ?? window.pageYOffset
    savedScrollYRef.current = scrollY
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
    }
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = "0"
    document.body.style.right = "0"
    document.body.style.width = "100%"
    return () => {
      document.body.style.position = prev.position
      document.body.style.top = prev.top
      document.body.style.left = prev.left
      document.body.style.right = prev.right
      document.body.style.width = prev.width
      window.scrollTo(0, savedScrollYRef.current)
    }
  }, [open])

  return React.useMemo(
    () => (open ? { onTouchMove: onOverlayTouchMove } : null),
    [open, onOverlayTouchMove]
  )
}

function parseVhToPx(vhStr) {
  if (typeof vhStr === "number") return vhStr
  const match = String(vhStr).match(/^([\d.]+)\s*vh$/)
  if (!match) return null
  return (window.innerHeight * Number(match[1])) / 100
}

function Drawer({ open, ...props }) {
  const scrollLock = useScrollLock(open)
  const contextValue = React.useMemo(
    () => ({ ...scrollLock, open: !!open }),
    [scrollLock, open]
  )
  return (
    <DrawerScrollLockContext.Provider value={contextValue}>
      <DrawerPrimitive.Root modal={false} data-slot="drawer" open={open} {...props} />
    </DrawerScrollLockContext.Provider>
  )
}

function DrawerTrigger({
  ...props
}) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}) {
  const ctx = React.useContext(DrawerScrollLockContext)
  const { open = false, ...scrollLockProps } = ctx || {}
  // modal={false} 时 vaul 不渲染/隐藏 Overlay，用自定义遮罩 div 保证始终有遮罩；点击遮罩关闭
  return (
    <DrawerPrimitive.Close asChild>
      <div
        data-slot="drawer-overlay"
        data-state={open ? "open" : "closed"}
        role="button"
        tabIndex={-1}
        aria-label="关闭"
        className={cn(
          "fixed inset-0 z-50 cursor-default bg-[var(--drawer-overlay,rgba(0,0,0,0.45))] backdrop-blur-[6px]",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className
        )}
        {...scrollLockProps}
        {...props}
      />
    </DrawerPrimitive.Close>
  );
}

function DrawerContent({
  className,
  children,
  defaultHeight = "77vh",
  minHeight = "20vh",
  maxHeight = "90vh",
  ...props
}) {
  const [heightPx, setHeightPx] = React.useState(() =>
    typeof window !== "undefined" ? parseVhToPx(defaultHeight) : null
  );
  const [isDragging, setIsDragging] = React.useState(false);
  const dragRef = React.useRef({ startY: 0, startHeight: 0 });

  const minPx = React.useMemo(() => parseVhToPx(minHeight), [minHeight]);
  const maxPx = React.useMemo(() => parseVhToPx(maxHeight), [maxHeight]);

  React.useEffect(() => {
    const px = parseVhToPx(defaultHeight);
    if (px != null) setHeightPx(px);
  }, [defaultHeight]);

  React.useEffect(() => {
    const sync = () => {
      const max = parseVhToPx(maxHeight);
      const min = parseVhToPx(minHeight);
      setHeightPx((prev) => {
        if (prev == null) return parseVhToPx(defaultHeight);
        const clamped = Math.min(prev, max ?? prev);
        return Math.max(clamped, min ?? clamped);
      });
    };
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [defaultHeight, minHeight, maxHeight]);

  const handlePointerDown = React.useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(true);
      dragRef.current = { startY: e.clientY ?? e.touches?.[0]?.clientY, startHeight: heightPx ?? parseVhToPx(defaultHeight) ?? 0 };
    },
    [heightPx, defaultHeight]
  );

  React.useEffect(() => {
    if (!isDragging) return;
    const move = (e) => {
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      const { startY, startHeight } = dragRef.current;
      const delta = startY - clientY;
      const next = Math.min(maxPx ?? Infinity, Math.max(minPx ?? 0, startHeight + delta));
      setHeightPx(next);
    };
    const up = () => setIsDragging(false);
    document.addEventListener("mousemove", move, { passive: true });
    document.addEventListener("mouseup", up);
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
    };
  }, [isDragging, minPx, maxPx]);

  const contentStyle = React.useMemo(() => {
    if (heightPx == null) return undefined;
    return { height: `${heightPx}px`, maxHeight: maxPx != null ? `${maxPx}px` : undefined };
  }, [heightPx, maxPx]);

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        style={contentStyle}
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-[var(--card)] text-[var(--text)] border-[var(--border)]",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-[var(--radius)] data-[vaul-drawer-direction=top]:border-b drawer-shadow-top",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[88vh] data-[vaul-drawer-direction=bottom]:rounded-t-[20px] data-[vaul-drawer-direction=bottom]:border-t drawer-shadow-bottom",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          "drawer-content-theme",
          className
        )}
        {...props}>
        <div
          role="separator"
          aria-label="拖动调整高度"
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          className={cn(
            "mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full bg-[var(--muted)] cursor-n-resize touch-none select-none",
            "group-data-[vaul-drawer-direction=bottom]/drawer-content:block",
            "hover:bg-[var(--muted-foreground)/0.4] active:bg-[var(--muted-foreground)/0.6]"
          )}
        />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 border-b border-[var(--border)] group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        "drawer-header-theme",
        className
      )}
      {...props} />
  );
}

function DrawerFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props} />
  );
}

function DrawerTitle({
  className,
  ...props
}) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-semibold text-[var(--text)]", className)}
      {...props} />
  );
}

function DrawerDescription({
  className,
  ...props
}) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-[var(--muted)]", className)}
      {...props} />
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
  DrawerDescription,
}
