"use client";

import { useState } from "react";
import { ArrowRight, Check, CircleCheck, CircleX, Flame, Lock, Star, Swords, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { Dashboard, Lesson, LessonTrack, Mission } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CreditCalculator } from "./credit-tool";
import { LESSON_CONTENT, TRACKS } from "./lessons";
import { SectionHeading } from "./shared";

type Props = {
  dashboard: Dashboard;
  onCompleteLesson: (lesson: Lesson) => Promise<boolean>;
  onCompleteMission: (mission: Mission) => void;
};

export function LearnView({ dashboard, onCompleteLesson, onCompleteMission }: Props) {
  const learning = dashboard.learning;
  const [track, setTrack] = useState<LessonTrack>(() => TRACKS.find((item) => learning.lessons.some((lesson) => lesson.track === item.id && !lesson.completed))?.id ?? "budgeting");
  const [open, setOpen] = useState<Lesson | null>(null);
  const lessons = learning.lessons.filter((lesson) => lesson.track === track);
  const done = learning.lessons.filter((lesson) => lesson.completed).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section aria-label="Your progress" className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5 sm:col-span-2">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#173f5f,#15977f)] text-white" aria-hidden="true"><Star className="size-7" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-subtle">Level {learning.level}</p>
              <p className="tabular text-2xl font-semibold tracking-tight text-ink">{learning.xp_total} XP</p>
              <Progress className="mt-2" value={(learning.level_xp * 100) / learning.level_size_xp} indicatorClassName="bg-accent" aria-label={`${learning.level_xp} of ${learning.level_size_xp} XP to level ${learning.level + 1}`} />
              <p className="mt-1 text-xs text-ink-subtle">{learning.level_size_xp - learning.level_xp} XP to level {learning.level + 1} · {done} of {learning.lessons.length} lessons done</p>
            </div>
          </div>
        </Card>
        <Card className={cn("p-5", learning.completed_today && "border-[#e4572e]/30")}>
          <p className="flex items-center gap-2 text-sm text-ink-subtle"><Flame className="size-4 text-[#e4572e]" aria-hidden="true" />Learning streak</p>
          <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{learning.streak_days} day{learning.streak_days === 1 ? "" : "s"}</p>
          <p className="mt-1 text-xs text-ink-subtle">{learning.completed_today ? "Today’s lesson is done. See you tomorrow!" : "Finish one lesson today to keep it going."}</p>
        </Card>
      </section>

      <section aria-labelledby="lessons-title">
        <SectionHeading id="lessons-title" title="Lessons" description="Two minutes each: read three ideas, then pass a two-question check." />
        <div role="tablist" aria-label="Lesson tracks" className="scroll-area -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
          {TRACKS.map((item) => {
            const inTrack = learning.lessons.filter((lesson) => lesson.track === item.id);
            const finished = inTrack.every((lesson) => lesson.completed);
            return (
              <button key={item.id} type="button" role="tab" aria-selected={track === item.id} onClick={() => setTrack(item.id)} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors", track === item.id ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink-muted hover:border-line-strong")}>
                {finished && <Check className="size-4" aria-hidden="true" />}{item.label}
                <span className="sr-only">, {inTrack.filter((lesson) => lesson.completed).length} of {inTrack.length} done</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-ink-subtle">{TRACKS.find((item) => item.id === track)?.blurb}</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="tabpanel">
          {lessons.map((lesson, index) => (
            <li key={lesson.id}>
              <button type="button" onClick={() => setOpen(lesson)} className="group flex h-full w-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 text-left shadow-[var(--shadow-card)] transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent motion-reduce:transform-none">
                <span className="flex items-center justify-between">
                  <span className={cn("grid size-9 place-items-center rounded-full text-sm font-semibold", lesson.completed ? "bg-accent text-white" : "bg-sage text-ink-muted")} aria-hidden="true">{lesson.completed ? <Check className="size-4" /> : index + 1}</span>
                  <Badge tone={lesson.completed ? "accent" : "gold"}>{lesson.completed ? "Done" : `+${lesson.xp_reward} XP`}</Badge>
                </span>
                <span className="mt-4 font-semibold text-ink">{lesson.title}</span>
                <span className="mt-1 flex-1 text-sm text-ink-muted">{LESSON_CONTENT[lesson.id]?.summary}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-strong">{lesson.completed ? "Review" : "Start"}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <Challenges missions={dashboard.missions} onComplete={onCompleteMission} />

      {track === "credit" && dashboard.credit && (
        <section aria-labelledby="credit-tool-title">
          <SectionHeading id="credit-tool-title" title="Try it: credit utilization" description="Use your fictional card, or change the numbers." />
          <CreditCalculator defaultBalance={dashboard.credit.balance_cents} defaultLimit={dashboard.credit.credit_limit_cents} />
        </section>
      )}

      <LessonDialog lesson={open} onClose={() => setOpen(null)} onComplete={onCompleteLesson} />
    </div>
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

function LessonDialog({ lesson, onClose, onComplete }: { lesson: Lesson | null; onClose: () => void; onComplete: (lesson: Lesson) => Promise<boolean> }) {
  const [step, setStep] = useState<"read" | "quiz" | "done">("read");
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const content = lesson ? LESSON_CONTENT[lesson.id] : undefined;

  function reset() { setStep("read"); setAnswers([]); setChecked(false); }
  function close() { reset(); onClose(); }

  const allCorrect = content ? content.quiz.every((question, index) => answers[index] === question.answer) : false;

  async function check() {
    setChecked(true);
    if (!lesson || !allCorrect) return;
    if (lesson.completed) { setStep("done"); return; }
    setSaving(true);
    const ok = await onComplete(lesson);
    setSaving(false);
    if (ok) setStep("done");
  }

  return (
    <Dialog open={lesson !== null} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent>
        {lesson && content && (
          <>
            <DialogHeader>
              <DialogTitle>{lesson.title}</DialogTitle>
              <DialogDescription>{content.summary}</DialogDescription>
            </DialogHeader>
            {step === "read" && (
              <>
                <ol className="space-y-3">
                  {content.points.map((point, index) => <li key={point} className="flex gap-3 rounded-xl bg-sage-soft p-3 text-sm leading-relaxed text-ink"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-white" aria-hidden="true">{index + 1}</span>{point}</li>)}
                </ol>
                <Button className="mt-5 w-full" onClick={() => setStep("quiz")}>Quick check<ArrowRight className="size-4" aria-hidden="true" /></Button>
              </>
            )}
            {step === "quiz" && (
              <div className="space-y-5">
                {content.quiz.map((question, qIndex) => (
                  <fieldset key={question.question}>
                    <legend className="text-sm font-semibold text-ink">{qIndex + 1}. {question.question}</legend>
                    <div className="mt-2 grid gap-2">
                      {question.options.map((option, oIndex) => {
                        const picked = answers[qIndex] === oIndex;
                        const right = checked && picked && oIndex === question.answer;
                        const wrong = checked && picked && oIndex !== question.answer;
                        return (
                          <label key={option} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", right ? "border-accent bg-accent-soft" : wrong ? "border-danger bg-danger-soft" : picked ? "border-primary bg-sage-soft" : "border-line hover:bg-sage-soft")}>
                            <input type="radio" name={`q-${qIndex}`} checked={picked} onChange={() => { setChecked(false); setAnswers((current) => { const next = [...current]; next[qIndex] = oIndex; return next; }); }} className="sr-only" />
                            <span className="flex-1 text-ink">{option}</span>
                            {right && <CircleCheck className="size-4 text-accent" aria-label="Correct" />}
                            {wrong && <CircleX className="size-4 text-danger" aria-label="Not quite" />}
                          </label>
                        );
                      })}
                    </div>
                    {checked && answers[qIndex] === question.answer && <p className="mt-2 text-xs text-ink-muted">{question.why}</p>}
                  </fieldset>
                ))}
                {checked && !allCorrect && <p role="alert" className="text-sm text-danger">Not quite. Change your answer and check again.</p>}
                <Button className="w-full" onClick={() => void check()} disabled={saving || answers.filter((item) => item !== null && item !== undefined).length < content.quiz.length}>{saving ? "Saving…" : "Check answers"}</Button>
              </div>
            )}
            {step === "done" && (
              <div className="text-center" role="status">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent-soft text-accent-strong" aria-hidden="true"><Trophy className="size-8" /></span>
                <p className="mt-4 text-lg font-semibold text-ink">{lesson.completed ? "Nice review!" : `+${lesson.xp_reward} XP`}</p>
                <p className="mt-1 text-sm text-ink-muted">Lesson complete. Keep your streak alive tomorrow.</p>
                <Button className="mt-5 w-full" onClick={close}>Back to lessons</Button>
              </div>
            )}
          </>
        )}
        {lesson && !content && <p className="flex items-center gap-2 text-sm text-ink-muted"><Lock className="size-4" aria-hidden="true" />This lesson isn’t available yet.</p>}
      </DialogContent>
    </Dialog>
  );
}
