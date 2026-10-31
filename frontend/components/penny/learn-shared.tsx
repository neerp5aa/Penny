import { Award, Brain, Crown, Flame, Footprints, Globe, Lock, Star, Trophy, Zap } from "lucide-react";
import type { LearnBadge, LessonTier } from "@/lib/api";
import { cn } from "@/lib/utils";

export const TIER_STYLE: Record<LessonTier, { label: string; chip: string }> = {
  easy: { label: "Easy", chip: "bg-zone-green-soft text-[#0d7a4d] dark:text-zone-green" },
  medium: { label: "Medium", chip: "bg-gold-soft text-gold-strong" },
  hard: { label: "Hard", chip: "bg-danger-soft text-danger" },
};

const BADGE_ICONS: Record<string, typeof Award> = { "first-steps": Footprints, flawless: Crown, "brain-power": Brain, "topic-master": Trophy, "on-a-roll": Flame, "week-warrior": Zap, "border-crosser": Globe };

export function BadgeChip({ badge }: { badge: LearnBadge }) {
  const Icon = BADGE_ICONS[badge.id] ?? Award;
  return (
    <li className={cn("flex min-h-12 shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3", badge.earned ? "border-gold/40 bg-gold-soft" : "border-line bg-surface opacity-70")}>
      <span className={cn("grid size-8 place-items-center rounded-full", badge.earned ? "bg-gold text-white" : "bg-sage text-ink-subtle")} aria-hidden="true">{badge.earned ? <Icon className="size-4" /> : <Lock className="size-3.5" />}</span>
      <span className="text-xs"><span className="block font-semibold text-ink">{badge.title}</span><span className="block text-ink-subtle">{badge.earned ? "Earned" : badge.description}</span></span>
    </li>
  );
}

export function Stars({ count, className = "size-4" }: { count: number; className?: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((value) => <Star key={value} className={cn(className, value <= count ? "fill-gold text-gold" : "text-line-strong")} aria-hidden="true" />)}
    </span>
  );
}

