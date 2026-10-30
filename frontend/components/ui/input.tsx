import * as React from "react";
import { cn } from "@/lib/utils";

const control = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-ink-subtle/80 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:bg-sage-soft disabled:text-ink-subtle aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%234f5b67%22%3E%3Cpath d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%234f5b67%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/%3E%3C/svg%3E')] bg-[length:1.25rem] bg-[right_0.6rem_center] bg-no-repeat pr-9", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("block text-sm font-semibold text-ink", className)} {...props} />;
}
