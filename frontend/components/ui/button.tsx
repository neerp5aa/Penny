import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-11 select-none items-center whitespace-nowrap justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary shadow-sm hover:bg-primary-hover",
        secondary: "bg-accent-soft text-accent-strong hover:bg-primary-soft",
        outline: "border border-line-strong bg-surface text-ink hover:bg-sage-soft",
        ghost: "text-ink-muted hover:bg-sage-soft hover:text-ink",
        destructive: "bg-danger text-on-danger hover:bg-danger-hover",
        "destructive-soft": "bg-danger-soft text-danger hover:bg-danger-soft-hover",
      },
      size: {
        default: "min-h-11",
        sm: "min-h-10 rounded-lg px-3 text-sm",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, type = "button", ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
