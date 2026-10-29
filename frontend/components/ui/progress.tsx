"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({ value = 0, className, indicatorClassName, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const bounded = Math.min(100, Math.max(0, value ?? 0));
  return (
    <ProgressPrimitive.Root className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100", className)} {...props}>
      <ProgressPrimitive.Indicator className={cn("h-full bg-emerald-500 transition-transform", indicatorClassName)} style={{ transform: `translateX(-${100 - bounded}%)` }} />
    </ProgressPrimitive.Root>
  );
}
