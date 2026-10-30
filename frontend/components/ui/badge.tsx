import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", {
  variants: {
    tone: {
      accent: "bg-accent-soft text-accent-strong",
      neutral: "bg-sage text-ink-muted",
      gold: "bg-gold-soft text-gold-strong",
      danger: "bg-danger-soft text-danger",
      info: "bg-info-soft text-info",
      inverse: "bg-white/15 text-white",
    },
  },
  defaultVariants: { tone: "accent" },
});

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
