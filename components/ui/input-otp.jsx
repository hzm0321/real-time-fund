'use client';

import * as React from 'react';
import { OTPInput, OTPInputContext } from 'input-otp';
import { MinusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function InputOTP({ className, containerClassName, ...props }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn('flex items-center gap-2 has-disabled:opacity-50', containerClassName)}
      className={cn('disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }) {
  return <div data-slot="input-otp-group" className={cn('flex items-center gap-2', className)} {...props} />;
}

function InputOTPSlot({ index, className, ...props }) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        'relative flex h-12 w-10 items-center justify-center rounded-md border-2 bg-background text-lg font-semibold shadow-sm transition-all duration-200',
        'border-slate-200 dark:border-white/25',
        'text-foreground dark:text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
        'data-[active=true]:border-primary data-[active=true]:ring-2 data-[active=true]:ring-primary/30 dark:data-[active=true]:ring-primary/40',
        'aria-invalid:border-destructive aria-invalid:text-destructive',
        'dark:bg-slate-900/50 dark:data-[active=true]:bg-slate-800/50',
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-px animate-caret-blink bg-primary duration-1000" />
        </div>
      )}
    </div>
  );
}

function InputOTPSeparator({ ...props }) {
  return (
    <div
      data-slot="input-otp-separator"
      role="separator"
      className="text-muted-foreground dark:text-muted-foreground/50"
      {...props}
    >
      <MinusIcon className="h-4 w-4" />
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
