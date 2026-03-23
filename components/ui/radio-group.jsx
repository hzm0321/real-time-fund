"use client"

import * as React from "react"
import { CircleIcon } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const RadioGroup = React.forwardRef(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    ref={ref}
    data-slot="radio-group"
    className={cn("grid gap-3", className)}
    {...props}
  />
))
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    data-slot="radio-group-item"
    className={cn(
      "group/radio aspect-square size-4 shrink-0 rounded-full border shadow-xs outline-none",
      "border-[var(--border)] bg-[var(--input)] text-[var(--primary)]",
      "transition-[color,box-shadow,border-color,background-color] duration-200 ease-out",
      "hover:border-[var(--muted-foreground)]",
      "data-[state=checked]:border-[var(--primary)] data-[state=checked]:bg-[var(--background)]",
      "focus-visible:border-[var(--ring)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-opacity-50",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-[var(--destructive)] aria-invalid:ring-[3px] aria-invalid:ring-[var(--destructive)] aria-invalid:ring-opacity-20",
      className
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator
      data-slot="radio-group-indicator"
      className="relative flex items-center justify-center"
    >
      <CircleIcon className="size-2 fill-current text-[var(--primary)]" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
