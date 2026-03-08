"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef(({ className, size = "default", ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    data-slot="switch"
    data-size={size}
    className={cn(
      "peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full border shadow-xs outline-none",
      "border-[var(--border)]",
      "transition-[color,box-shadow,border-color] duration-200 ease-out",
      "focus-visible:border-[var(--ring)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-opacity-50",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "hover:data-[state=unchecked]:bg-[var(--input)] hover:data-[state=unchecked]:border-[var(--muted)]",
      "data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6",
      "data-[state=checked]:border-transparent data-[state=checked]:bg-[var(--primary)]",
      "data-[state=unchecked]:bg-[var(--input)]",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        "pointer-events-none block rounded-full ring-0",
        "bg-[var(--background)]",
        "transition-transform duration-200 ease-out",
        "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
        "data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-[var(--primary-foreground)]",
        "data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-[var(--switch-thumb)]"
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
