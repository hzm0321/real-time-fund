"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import {CloseIcon} from "@/app/components/Icons";

const DialogContext = React.createContext({ open: false });

function Dialog({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const currentOpen = isControlled ? openProp : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (next) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DialogContext.Provider value={{ open: currentOpen }}>
      <DialogPrimitive.Root
        modal={false}
        data-slot="dialog"
        open={isControlled ? openProp : undefined}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </DialogContext.Provider>
  );
}

function DialogTrigger({
  ...props
}) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}) {
  const { open } = React.useContext(DialogContext);
  const overlayRef = React.useRef(null);
  
  React.useEffect(() => {
    const el = overlayRef.current;
    if (!el || !open) return;
    
    const preventScroll = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    el.addEventListener("touchmove", preventScroll, { passive: false });
    el.addEventListener("wheel", preventScroll, { passive: false });
    
    return () => {
      el.removeEventListener("touchmove", preventScroll);
      el.removeEventListener("wheel", preventScroll);
    };
  }, [open]);

  return (
    <DialogPrimitive.Close asChild>
      <div
        ref={overlayRef}
        data-slot="dialog-overlay"
        data-state={open ? "open" : "closed"}
        role="button"
        tabIndex={-1}
        aria-label="关闭"
        className={cn(
          "fixed inset-0 z-50 cursor-default bg-[var(--dialog-overlay)] backdrop-blur-[4px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className
        )}
        style={{ touchAction: "none" }}
        {...props} 
      />
    </DialogPrimitive.Close>
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayClassName,
  overlayStyle,
  ...props
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} style={overlayStyle} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        className={cn(
          "fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-[16px] border border-[var(--border)] text-[var(--foreground)] p-6 dialog-content-shadow outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          "mobile-dialog-glass",
          className
        )}
        {...props}>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-md p-1.5 text-[var(--muted-foreground)] opacity-70 transition-colors duration-200 hover:opacity-100 hover:text-[var(--foreground)] hover:bg-[var(--secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] disabled:pointer-events-none cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <CloseIcon width="20" height="20" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <button type="button" className="button secondary px-4 h-11 rounded-xl cursor-pointer">
            Close
          </button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold text-[var(--foreground)]", className)}
      {...props} />
  );
}

function DialogDescription({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-[var(--muted-foreground)]", className)}
      {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
