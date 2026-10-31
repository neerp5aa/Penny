"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Check, Flame, Heart, Lock, LoaderCircle, RefreshCw, SlidersHorizontal, Star, Swords, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { type Dashboard, type LearnBadge, type LearnCountry, type LearnProfile, type LearnState, learnApi, type LessonCard, type LessonTaskView, type LessonTier, type LessonTrack, type Mission, type TopicPath } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CreditCalculator } from "./credit-tool";
import { LessonPlayer } from "./lesson-player";
import { BadgeChip, Stars, TIER_STYLE } from "./learn-shared";
import { describeError, SectionHeading } from "./shared";

type Props = {
  dashboard: Dashboard;
  onCompleteMission: (mission: Mission) => void;
  /** Applies the snapshot returned when a lesson ends, so XP and streaks update everywhere. */
  onProgress: (dashboard: Dashboard) => void;
  onNavigate: (view: LessonTaskView) => void;
  onAsk: (question: string) => void;
};

const COUNTRIES: { id: LearnCountry; flag: string; name: string; detail: string }[] = [
  { id: "CA", flag: "🇨🇦", name: "Canada", detail: "CRA and T4s, TFSA/RRSP/FHSA, CDIC, the 35% interest cap" },
  { id: "US", flag: "🇺🇸", name: "United States", detail: "IRS and W-2s, 401(k)/IRA/Roth, FDIC, the CARD Act" },
];

const TOPIC_CHOICES: { id: LessonTrack; label: string; blurb: string }[] = [
  { id: "budgeting", label: "Budgeting", blurb: "Plan money before it’s spent" },
  { id: "saving", label: "Saving", blurb: "Emergency funds, interest, goals" },
  { id: "tax", label: "Tax", blurb: "Brackets, slips, refunds, credits" },
  { id: "credit", label: "Credit", blurb: "Scores, interest, paying down debt" },
  { id: "rules", label: "Rules & rights", blurb: "Deposit insurance, loan laws, scams" },
  { id: "investing", label: "Investing", blurb: "Accounts, fees, compounding" },
];

const LEVELS: { id: LessonTier; title: string; detail: string }[] = [
  { id: "easy", title: "I’m new to this", detail: "Start every topic at Easy. Pass a level to unlock the next." },
  { id: "medium", title: "I know the basics", detail: "Easy and Medium are open from the start." },
  { id: "hard", title: "Challenge me", detail: "Every level is open, Hard included." },
];

function useLearnState(version: number) {
  const [state, setState] = useState<LearnState | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    learnApi.state().then((next) => { setState(next); setError(""); }).catch((reason: unknown) => setError(describeError(reason, "Couldn’t load your lessons").detail));
  }, []);
  // Reload whenever XP changes elsewhere (a challenge completed, a lesson finished).
  useEffect(() => { load(); }, [load, version]);
  return { state, setState, error, reload: load };
}

export function LearnView({ dashboard, onCompleteMission, onProgress, onNavigate, onAsk }: Props) {
  const { state, setState, error, reload } = useLearnState(dashboard.xp_total);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<LessonCard | null>(null);

  if (error && !state) {
    return (
      <Card className="mx-auto max-w-xl p-6 text-center">
        <p className="font-semibold text-ink">Your lessons didn’t load</p>
        <p className="mt-1 text-sm text-ink-subtle">{error}</p>
        <Button className="mt-4" variant="outline" onClick={reload}><RefreshCw className="size-4" aria-hidden="true" />Try again</Button>
      </Card>
    );
  }
  if (!state) return <div className="mx-auto max-w-5xl space-y-4" aria-busy="true" aria-label="Loading lessons">{[0, 1, 2].map((key) => <div key={key} className="h-40 animate-pulse rounded-[var(--radius-card)] bg-sage-soft" />)}</div>;

  if (!state.profile.country) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="p-5 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-strong">Set up your learning</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Learn money the way it works where you live</h2>
          <p className="mt-1 text-sm text-ink-muted">Three quick questions. You can change any of them later.</p>
          <ProfileForm initial={state.profile} submitLabel="Start learning" onSaved={setState} />
        </Card>
      </div>
    );
  }

  const country = COUNTRIES.find((item) => item.id === state.profile.country) ?? COUNTRIES[0];
  const selected = state.topics.filter((topic) => topic.selected);
  const others = state.topics.filter((topic) => !topic.selected);
  const credit = selected.some((topic) => topic.id === "credit");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ProgressHeader state={state} country={country} onEdit={() => setEditing(true)} />
      <BadgeShelf badges={state.badges} />

      <section aria-labelledby="paths-title" className="space-y-4">
        <SectionHeading id="paths-title" title="Your paths" description="Read the cards, then beat the challenge. Wrong answers cost a heart; run out and you start again." />
        {selected.map((topic) => <TopicRow key={topic.id} topic={topic} onOpen={setOpen} />)}
        {others.length > 0 && (
          <details className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-sage-soft/40 p-4">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-ink">
              More topics ({others.length})<span className="text-xs font-normal text-ink-subtle">Add them under Customize</span>
            </summary>
            <div className="mt-3 space-y-4">{others.map((topic) => <TopicRow key={topic.id} topic={topic} onOpen={setOpen} />)}</div>
          </details>
        )}
      </section>

      <Challenges missions={dashboard.missions} onComplete={onCompleteMission} />

      {credit && dashboard.credit && (
        <section aria-labelledby="credit-tool-title">
          <SectionHeading id="credit-tool-title" title="Try it: credit utilization" description="Use your fictional card, or change the numbers." />
          <CreditCalculator defaultBalance={dashboard.credit.balance_cents} defaultLimit={dashboard.credit.credit_limit_cents} />
        </section>
      )}

      <p className="px-1 text-xs text-ink-subtle">Lessons are general education for {country.name}, current to 2026. They aren’t personal tax, legal, credit, or investment advice.</p>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customize your learning</DialogTitle>
            <DialogDescription>Your stars and XP are kept when you switch country or topics.</DialogDescription>
          </DialogHeader>
          {editing && <ProfileForm initial={state.profile} submitLabel="Save" onSaved={(next) => { setState(next); setEditing(false); }} />}
        </DialogContent>
      </Dialog>

      <LessonPlayer
        lesson={open}
        onClose={() => setOpen(null)}
        onFinished={(snapshot) => { if (snapshot) onProgress(snapshot); else reload(); }}
        onTask={(task) => { setOpen(null); if (task.prompt) onAsk(task.prompt); else onNavigate(task.view); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Profile: country, topics, starting level

function ProfileForm({ initial, submitLabel, onSaved }: { initial: LearnProfile; submitLabel: string; onSaved: (state: LearnState) => void }) {
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState<LearnCountry | null>(initial.country);
  const [topics, setTopics] = useState<LessonTrack[]>(initial.country ? initial.topics : ["budgeting", "saving", "tax"]);
  const [level, setLevel] = useState<LessonTier>(initial.start_tier);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const steps = ["Country", "Topics", "Level"];
  const canContinue = step === 0 ? country !== null : step === 1 ? topics.length > 0 : true;

  async function save() {
    if (!country) return;
    setBusy(true);
    setError("");
    try {
      onSaved(await learnApi.setProfile({ country, topics, start_tier: level }));
    } catch (reason) {
      setError(describeError(reason, "Couldn’t save").detail);
    } finally {
      setBusy(false);
    }
  }

  const option = (on: boolean) => cn("flex cursor-pointer items-center gap-3 rounded-xl border-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", on ? "border-accent bg-accent-soft/60" : "border-line hover:border-line-strong");

  return (
    <div className="mt-5">
      <ol className="mb-5 flex items-center gap-2" aria-label="Steps">
        {steps.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={index === step ? "step" : undefined}>
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", index < step ? "bg-accent text-white" : index === step ? "bg-primary text-on-primary" : "bg-sage text-ink-subtle")}>{index < step ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}</span>
            <span className={cn("text-sm", index === step ? "font-semibold text-ink" : "text-ink-subtle")}>{label}</span>
            {index < steps.length - 1 && <span className="hidden h-px flex-1 bg-line sm:block" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <fieldset>
          <legend className="text-base font-semibold text-ink">Where do you live?</legend>
          <p className="mt-0.5 text-sm text-ink-subtle">Tax, credit, accounts, and consumer rules differ by country.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {COUNTRIES.map((item) => (
              <label key={item.id} className={cn(option(country === item.id), "min-h-24 items-start rounded-2xl p-4")}>
                <input type="radio" name="learn-country" value={item.id} checked={country === item.id} onChange={() => setCountry(item.id)} className="sr-only" />
                <span className="text-3xl leading-none" aria-hidden="true">{item.flag}</span>
                <span className="min-w-0"><span className="block font-semibold text-ink">{item.name}</span><span className="mt-0.5 block text-xs text-ink-subtle">{item.detail}</span></span>
                {country === item.id && <Check className="ml-auto size-5 shrink-0 text-accent-strong" aria-hidden="true" />}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend className="text-base font-semibold text-ink">What do you want to learn?</legend>
          <p className="mt-0.5 text-sm text-ink-subtle">Pick at least one. Each topic has Easy, Medium, and Hard levels.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {TOPIC_CHOICES.map((item) => {
              const on = topics.includes(item.id);
              return (
                <label key={item.id} className={cn(option(on), "min-h-14 px-3 py-2")}>
                  <input type="checkbox" checked={on} onChange={() => setTopics((current) => (on ? current.filter((id) => id !== item.id) : [...current, item.id]))} className="size-5 shrink-0 accent-[var(--color-accent)]" />
                  <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{item.label}</span><span className="block text-xs text-ink-subtle">{item.blurb}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend className="text-base font-semibold text-ink">How much do you already know?</legend>
          <p className="mt-0.5 text-sm text-ink-subtle">This only decides what’s unlocked at the start.</p>
          <div className="mt-3 grid gap-2">
            {LEVELS.map((item) => (
              <label key={item.id} className={cn(option(level === item.id), "min-h-16 px-4 py-3")}>
                <input type="radio" name="learn-level" checked={level === item.id} onChange={() => setLevel(item.id)} className="sr-only" />
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", TIER_STYLE[item.id].chip)}>{TIER_STYLE[item.id].label}</span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{item.title}</span><span className="block text-xs text-ink-subtle">{item.detail}</span></span>
                {level === item.id && <Check className="ml-auto size-5 shrink-0 text-accent-strong" aria-hidden="true" />}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex gap-2">
        {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)} disabled={busy}>Back</Button>}
        {step < steps.length - 1
          ? <Button className="flex-1" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continue</Button>
          : <Button className="flex-1" disabled={busy || !country || topics.length === 0} onClick={() => void save()}>{busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{submitLabel}</Button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Progress, badges, paths

function ProgressHeader({ state, country, onEdit }: { state: LearnState; country: (typeof COUNTRIES)[number]; onEdit: () => void }) {
  const lessons = state.topics.filter((topic) => topic.selected).flatMap((topic) => topic.lessons);
  const stars = lessons.reduce((total, lesson) => total + lesson.stars, 0);
  return (
    <section aria-label="Your progress" className="grid gap-3 sm:grid-cols-3">
      <Card className="p-5 sm:col-span-2">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#173f5f,#15977f)] text-white" aria-hidden="true"><Star className="size-7" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-subtle">Level {state.level}</p>
              <button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-ink hover:bg-sage-soft">
                <span aria-hidden="true">{country.flag}</span>{country.name}<span className="sr-only">. Customize your learning</span><SlidersHorizontal className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="tabular text-2xl font-semibold tracking-tight text-ink">{state.xp_total} XP</p>
            <Progress className="mt-2" value={(state.level_xp * 100) / state.level_size_xp} indicatorClassName="bg-accent" aria-label={`${state.level_xp} of ${state.level_size_xp} XP to level ${state.level + 1}`} />
            <p className="mt-1 text-xs text-ink-subtle">{state.level_size_xp - state.level_xp} XP to level {state.level + 1} · <Star className="inline size-3 fill-gold text-gold" aria-hidden="true" /> {stars} of {lessons.length * 3} stars in your paths</p>
          </div>
        </div>
      </Card>
      <Card className={cn("p-5", state.completed_today && "border-[#e4572e]/30")}>
        <p className="flex items-center gap-2 text-sm text-ink-subtle"><Flame className="size-4 text-[#e4572e]" aria-hidden="true" />Learning streak</p>
        <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{state.streak_days} day{state.streak_days === 1 ? "" : "s"}</p>
        <p className="mt-1 text-xs text-ink-subtle">{state.completed_today ? "Today’s lesson is done. See you tomorrow!" : "Pass one lesson today to keep it going."}</p>
      </Card>
    </section>
  );
}

function BadgeShelf({ badges }: { badges: LearnBadge[] }) {
  const earned = badges.filter((badge) => badge.earned).length;
  return (
    <section aria-labelledby="badges-title">
      <h2 id="badges-title" className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><Award className="size-4 text-gold-strong" aria-hidden="true" />Badges <span className="font-normal text-ink-subtle">{earned} of {badges.length}</span></h2>
      <ul className="scroll-area -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {badges.map((badge) => <BadgeChip key={badge.id} badge={badge} />)}
      </ul>
    </section>
  );
}

function TopicRow({ topic, onOpen }: { topic: TopicPath; onOpen: (lesson: LessonCard) => void }) {
  const passed = topic.lessons.filter((lesson) => lesson.passed).length;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight text-ink">{topic.label} <span className="text-sm font-normal text-ink-subtle">· {topic.blurb}</span></h3>
        <span className="text-xs font-semibold text-ink-subtle">{passed === topic.lessons.length ? <span className="inline-flex items-center gap-1 text-accent-strong"><Trophy className="size-3.5" aria-hidden="true" />Mastered</span> : `${passed} of ${topic.lessons.length} levels`}</span>
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {topic.lessons.map((lesson, index) => {
          const style = TIER_STYLE[lesson.tier];
          const previous = topic.lessons[index - 1];
          return (
            <li key={lesson.id}>
              <button
                type="button"
                disabled={lesson.locked}
                onClick={() => onOpen(lesson)}
                className={cn("group flex h-full w-full flex-col rounded-2xl border p-4 text-left transition-[transform,border-color,box-shadow] disabled:cursor-not-allowed", lesson.locked ? "border-dashed border-line-strong bg-sage-soft/50" : lesson.passed ? "border-accent/40 bg-surface hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] motion-reduce:transform-none" : "border-line bg-surface ring-2 ring-accent/30 hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-card)] motion-reduce:transform-none")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", style.chip)}>{style.label}</span>
                  {lesson.locked ? <Lock className="size-4 text-ink-subtle" aria-hidden="true" /> : lesson.passed ? <Stars count={lesson.stars} /> : <Badge tone="gold">+{lesson.xp_max} XP</Badge>}
                </span>
                <span className={cn("mt-3 font-semibold", lesson.locked ? "text-ink-muted" : "text-ink")}>{lesson.title}</span>
                <span className="mt-1 flex-1 text-sm text-ink-subtle">{lesson.locked ? `Pass ${previous ? TIER_STYLE[previous.tier].label : "the level before"} to unlock.` : lesson.summary}</span>
                <span className="mt-3 flex items-center gap-3 text-xs text-ink-subtle">
                  <span className="inline-flex items-center gap-1"><Heart className="size-3.5 fill-danger text-danger" aria-hidden="true" />{lesson.hearts}<span className="sr-only"> hearts</span></span>
                  <span>{lesson.question_count} questions</span>
                  {lesson.passed && <span className="tabular ml-auto">{lesson.xp_earned}/{lesson.xp_max} XP</span>}
                </span>
                <span className="sr-only">{lesson.locked ? "Locked" : lesson.passed ? `Passed with ${lesson.stars} stars` : "Not started"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Challenges({ missions, onComplete }: { missions: Mission[]; onComplete: (mission: Mission) => void }) {
  return (
    <section aria-labelledby="challenges-title">
      <SectionHeading id="challenges-title" title="Challenges" description="Small real-world actions. Each one earns XP." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {missions.map((mission) => (
          <li key={mission.id}>
            <Card className={cn("flex h-full items-start gap-3 p-4", mission.completed && "bg-sage-soft/60")}>
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", mission.completed ? "bg-accent-soft text-accent-strong" : "bg-gold-soft text-gold-strong")} aria-hidden="true">{mission.completed ? <Trophy className="size-4" /> : <Swords className="size-4" />}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{mission.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{mission.description}</p>
              </div>
              {mission.completed ? <Badge>+{mission.xp_reward} XP</Badge> : <Button size="sm" variant="outline" onClick={() => onComplete(mission)}>Done</Button>}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
