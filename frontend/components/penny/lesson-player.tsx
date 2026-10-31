"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, CircleCheck, CircleX, Heart, HeartCrack, LoaderCircle, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { type AnswerResult, type AttemptView, type Dashboard, learnApi, type LessonCard, type LessonDetail, type QuestionView } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BadgeChip, Stars, TIER_STYLE } from "./learn-shared";
import { describeError } from "./shared";
import { LessonExample } from "./smart-cards";

type Props = {
  lesson: LessonCard | null;
  onClose: () => void;
  onFinished: (dashboard: Dashboard | null) => void;
  onTask: (task: NonNullable<LessonDetail["task"]>) => void;
};

/** Read the cards, then answer every question with a limited number of hearts. */
export function LessonPlayer({ lesson, onClose, onFinished, onTask }: Props) {
  return (
    <Dialog open={lesson !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {lesson && <Player key={lesson.id} lesson={lesson} onClose={onClose} onFinished={onFinished} onTask={onTask} />}
      </DialogContent>
    </Dialog>
  );
}

type Phase = "read" | "challenge" | "result";

function Player({ lesson, onClose, onFinished, onTask }: { lesson: LessonCard } & Omit<Props, "lesson">) {
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [phase, setPhase] = useState<Phase>("read");
  const [card, setCard] = useState(0);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [index, setIndex] = useState(0);
  const [hearts, setHearts] = useState(lesson.hearts);
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [final, setFinal] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const style = TIER_STYLE[lesson.tier];

  useEffect(() => {
    let live = true;
    learnApi.lesson(lesson.id).then((data) => { if (live) setDetail(data); }).catch((reason: unknown) => { if (live) setError(describeError(reason, "Couldn’t open this lesson").detail); });
    return () => { live = false; };
  }, [lesson.id]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const next = await learnApi.start(lesson.id);
      setAttempt(next);
      setHearts(next.hearts_left);
      setIndex(0);
      setFeedback(null);
      setFinal(null);
      setPhase("challenge");
    } catch (reason) {
      setError(describeError(reason, "Couldn’t start the challenge").detail);
    } finally {
      setBusy(false);
    }
  }

  async function submit(body: { choices?: string[]; value?: string }) {
    if (!attempt) return;
    const question = attempt.questions[index];
    setBusy(true);
    setError("");
    try {
      const result = await learnApi.answer(attempt.id, { question_id: question.id, ...body });
      setFeedback(result);
      setHearts(result.hearts_left);
      if (result.status !== "active") {
        setFinal(result);
        onFinished(result.dashboard);
      }
    } catch (reason) {
      // Unreadable answers (like "abc" for a number) cost no heart; the server says what's wrong.
      setError(describeError(reason, "Couldn’t check that answer").detail);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setError("");
    if (final) { setPhase("result"); return; }
    setFeedback(null);
    setIndex(index + 1);
  }

  if (!detail) {
    return (
      <>
        <DialogHeader><DialogTitle>{lesson.title}</DialogTitle><DialogDescription>{lesson.summary}</DialogDescription></DialogHeader>
        {error ? <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : <div className="grid place-items-center py-10"><LoaderCircle className="size-6 animate-spin text-ink-subtle" aria-label="Loading lesson" /></div>}
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <p className="flex items-center gap-2 text-xs font-semibold text-ink-subtle"><span className={cn("rounded-full px-2 py-0.5", style.chip)}>{style.label}</span>{phase === "read" ? "Read" : phase === "challenge" ? "Challenge" : "Results"}</p>
        <DialogTitle className="mt-1.5">{lesson.title}</DialogTitle>
        {phase === "read" && <DialogDescription>{lesson.summary}</DialogDescription>}
      </DialogHeader>

      {phase === "read" && (
        <ReadCards detail={detail} index={card} onIndex={setCard} busy={busy} error={error} onStart={() => void start()} />
      )}

      {phase === "challenge" && attempt && (
        <div>
          <div className="flex items-center gap-3">
            <Progress className="h-2.5 flex-1" value={((index + (feedback ? 1 : 0)) * 100) / attempt.questions.length} indicatorClassName="bg-accent" aria-label={`Question ${index + 1} of ${attempt.questions.length}`} />
            <Hearts left={hearts} total={attempt.hearts_total} />
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Question {index + 1} of {attempt.questions.length}</p>
          <QuestionCard key={attempt.questions[index].id} question={attempt.questions[index]} feedback={feedback} busy={busy} error={error} onSubmit={(body) => void submit(body)} onNext={next} lastStep={Boolean(final)} />
        </div>
      )}

      {phase === "result" && final?.result && (
        <ResultScreen
          result={final.result}
          detail={detail}
          busy={busy}
          onRetry={() => void start()}
          onReview={() => { setCard(0); setPhase("read"); }}
          onClose={onClose}
          onTask={onTask}
        />
      )}
    </>
  );
}

function ReadCards({ detail, index, onIndex, busy, error, onStart }: { detail: LessonDetail; index: number; onIndex: (index: number) => void; busy: boolean; error: string; onStart: () => void }) {
  const last = index === detail.cards.length - 1;
  return (
    <div>
      <div className="flex gap-1.5" aria-hidden="true">{detail.cards.map((_, dot) => <span key={dot} className={cn("h-1.5 flex-1 rounded-full", dot <= index ? "bg-accent" : "bg-sage")} />)}</div>
      <div className="mt-4 min-h-36 rounded-2xl bg-sage-soft p-5" aria-live="polite">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-subtle"><BookOpen className="size-3.5" aria-hidden="true" />Card {index + 1} of {detail.cards.length}</p>
        <p className="mt-2 text-base leading-relaxed text-ink">{detail.cards[index]}</p>
      </div>
      {last && (
        <>
          <div className="mt-4"><LessonExample lessonId={detail.card.id} /></div>
          <div className="mt-4 rounded-2xl border border-line p-4 text-sm text-ink-muted">
            <p className="font-semibold text-ink">Ready for the challenge?</p>
            <p className="mt-1">{detail.card.question_count} questions · <Heart className="inline size-3.5 fill-danger text-danger" aria-hidden="true" /> {detail.card.hearts} hearts. Each wrong answer costs a heart, and the cards stay hidden until you finish, so take a moment to re-read.</p>
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex gap-2">
        {index > 0 && <Button variant="outline" onClick={() => onIndex(index - 1)}>Back</Button>}
        {last
          ? <Button className="flex-1" onClick={onStart} disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}Start challenge</Button>
          : <Button className="flex-1" onClick={() => onIndex(index + 1)}>Next card<ArrowRight className="size-4" aria-hidden="true" /></Button>}
      </div>
    </div>
  );
}

function Hearts({ left, total }: { left: number; total: number }) {
  return (
    <span className="flex shrink-0 gap-0.5" role="img" aria-label={`${left} of ${total} hearts left`} aria-live="polite">
      {Array.from({ length: total }, (_, slot) => slot < left
        ? <Heart key={slot} className="size-5 fill-danger text-danger" aria-hidden="true" />
        : <HeartCrack key={slot} className="size-5 text-line-strong" aria-hidden="true" />)}
    </span>
  );
}

const UNIT_HINT = { $: "Enter a dollar amount", "%": "Enter a percentage", years: "Enter a number of years", "": "Enter a number" } as const;

function QuestionCard({ question, feedback, busy, error, onSubmit, onNext, lastStep }: { question: QuestionView; feedback: AnswerResult | null; busy: boolean; error: string; onSubmit: (body: { choices?: string[]; value?: string }) => void; onNext: () => void; lastStep: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [order, setOrder] = useState(() => question.options.map((option) => option.id));
  const text = new Map(question.options.map((option) => [option.id, option.text]));
  const locked = feedback !== null;
  const ready = question.kind === "number" ? value.trim() !== "" : question.kind === "order" ? true : picked.length > 0;

  function check(event: FormEvent) {
    event.preventDefault();
    if (locked) { onNext(); return; }
    if (!ready) return;
    onSubmit(question.kind === "number" ? { value } : { choices: question.kind === "order" ? order : picked });
  }

  function move(position: number, by: -1 | 1) {
    const next = [...order];
    [next[position], next[position + by]] = [next[position + by], next[position]];
    setOrder(next);
  }

  const optionState = (id: string) => {
    if (!feedback) return picked.includes(id) ? "picked" : "idle";
    if (feedback.correct_choices.includes(id)) return "right";
    return picked.includes(id) ? "wrong" : "idle";
  };

  return (
    <form onSubmit={check} className="mt-2">
      <fieldset disabled={busy}>
        <legend className="text-lg font-semibold leading-snug text-ink">{question.prompt}</legend>
        {question.kind === "multi" && <p className="mt-1 text-sm text-ink-subtle">Select all that apply. You need every right one, and none of the wrong ones.</p>}
        {question.kind === "order" && <p className="mt-1 text-sm text-ink-subtle">Use the arrows to put them in order, first at the top.</p>}

        {(question.kind === "choice" || question.kind === "multi") && (
          <div className="mt-4 grid gap-2">
            {question.options.map((option) => {
              const stateOf = optionState(option.id);
              const single = question.kind === "choice";
              return (
                <label key={option.id} className={cn("flex min-h-12 items-center gap-3 rounded-xl border-2 p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", locked ? "cursor-default" : "cursor-pointer hover:bg-sage-soft", stateOf === "right" ? "border-zone-green bg-zone-green-soft" : stateOf === "wrong" ? "border-danger bg-danger-soft" : stateOf === "picked" ? "border-primary bg-sage-soft" : "border-line")}>
                  <input
                    type={single ? "radio" : "checkbox"}
                    name={question.id}
                    checked={picked.includes(option.id)}
                    disabled={locked}
                    onChange={() => setPicked(single ? [option.id] : picked.includes(option.id) ? picked.filter((id) => id !== option.id) : [...picked, option.id])}
                    className="size-5 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span className="flex-1 text-ink">{option.text}</span>
                  {stateOf === "right" && <CircleCheck className="size-5 shrink-0 text-[#0d7a4d] dark:text-zone-green" aria-label="Correct answer" />}
                  {stateOf === "wrong" && <CircleX className="size-5 shrink-0 text-danger" aria-label="Your answer, incorrect" />}
                </label>
              );
            })}
          </div>
        )}

        {question.kind === "number" && (
          <div className="mt-4">
            <label htmlFor={`${question.id}-value`} className="sr-only">{UNIT_HINT[question.unit]}</label>
            <div className={cn("flex items-center rounded-2xl border-2 px-4 focus-within:ring-4 focus-within:ring-accent/15", feedback ? (feedback.correct ? "border-zone-green bg-zone-green-soft" : "border-danger bg-danger-soft") : "border-line")}>
              {question.unit === "$" && <span className="text-2xl font-semibold text-ink-subtle" aria-hidden="true">$</span>}
              <input id={`${question.id}-value`} inputMode="decimal" autoComplete="off" value={value} readOnly={locked} onChange={(event) => setValue(event.target.value)} placeholder="0" className="tabular min-h-14 w-full min-w-0 bg-transparent px-1 text-2xl font-semibold text-ink placeholder:text-ink-subtle/50 focus:outline-none" />
              {question.unit === "%" && <span className="text-2xl font-semibold text-ink-subtle" aria-hidden="true">%</span>}
              {question.unit === "years" && <span className="text-base font-semibold text-ink-subtle" aria-hidden="true">years</span>}
            </div>
            {feedback && !feedback.correct && feedback.correct_value && <p className="mt-2 text-sm text-ink">Answer: <span className="tabular font-semibold">{question.unit === "$" ? `$${Number(feedback.correct_value).toLocaleString("en-CA")}` : `${feedback.correct_value}${question.unit === "%" ? "%" : question.unit === "years" ? " years" : ""}`}</span></p>}
          </div>
        )}

        {question.kind === "order" && (
          <ol className="mt-4 grid gap-2">
            {(feedback && !feedback.correct ? feedback.correct_choices : order).map((id, position, list) => (
              <li key={id} className={cn("flex min-h-12 items-center gap-2 rounded-xl border-2 p-2 pl-3 text-sm", feedback ? (feedback.correct ? "border-zone-green bg-zone-green-soft" : "border-info bg-info-soft") : "border-line")}>
                <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-surface text-xs font-semibold text-ink-muted" aria-hidden="true">{position + 1}</span>
                <span className="flex-1 text-ink">{text.get(id)}</span>
                {!locked && (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => move(position, -1)} disabled={position === 0} aria-label={`Move “${text.get(id)}” up`} className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-sage-soft disabled:opacity-30"><ArrowUp className="size-4" aria-hidden="true" /></button>
                    <button type="button" onClick={() => move(position, 1)} disabled={position === list.length - 1} aria-label={`Move “${text.get(id)}” down`} className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-sage-soft disabled:opacity-30"><ArrowDown className="size-4" aria-hidden="true" /></button>
                  </span>
                )}
              </li>
            ))}
            {feedback && !feedback.correct && <p className="text-xs text-ink-subtle">Shown in the correct order.</p>}
          </ol>
        )}
      </fieldset>

      {feedback && (
        <div role="status" className={cn("mt-4 rounded-2xl p-4", feedback.correct ? "bg-zone-green-soft" : "bg-danger-soft")}>
          <p className={cn("flex items-center gap-2 font-semibold", feedback.correct ? "text-[#0d7a4d] dark:text-zone-green" : "text-danger")}>
            {feedback.correct ? <><CircleCheck className="size-5" aria-hidden="true" />Correct!</> : <><HeartCrack className="size-5" aria-hidden="true" />Not quite. You lost a heart.</>}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{feedback.explanation}</p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <Button type="submit" className="mt-5 w-full" disabled={busy || (!locked && !ready)}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        {!locked ? "Check answer" : lastStep ? "See results" : "Next question"}
      </Button>
    </form>
  );
}

function ResultScreen({ result, detail, busy, onRetry, onReview, onClose, onTask }: { result: NonNullable<AnswerResult["result"]>; detail: LessonDetail; busy: boolean; onRetry: () => void; onReview: () => void; onClose: () => void; onTask: (task: NonNullable<LessonDetail["task"]>) => void }) {
  if (!result.passed) {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-danger-soft text-danger" aria-hidden="true"><HeartCrack className="size-8" /></span>
        <p className="mt-4 text-xl font-semibold text-ink">Out of hearts</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">That one’s tough. Re-read the cards (the explanations you just saw help too), then try again with full hearts. No XP is lost.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" onClick={onReview}><BookOpen className="size-4" aria-hidden="true" />Review the cards</Button>
          <Button className="flex-1" onClick={onRetry} disabled={busy}><RotateCcw className="size-4" aria-hidden="true" />Try again</Button>
        </div>
      </div>
    );
  }
  const levelUp = result.level_after > result.level_before;
  return (
    <div className="text-center">
      <span className="mx-auto grid size-16 animate-enter place-items-center rounded-full bg-gold-soft text-gold-strong" aria-hidden="true"><Trophy className="size-8" /></span>
      <p className="mt-4 text-xl font-semibold text-ink">{result.stars === 3 ? "Flawless!" : "Lesson passed!"}</p>
      <div className="mt-2 flex justify-center"><Stars count={result.stars} className="size-8" /></div>
      <p className="mt-2 text-sm text-ink-muted">
        {result.mistakes === 0 ? "No hearts lost." : `${result.mistakes} heart${result.mistakes === 1 ? "" : "s"} lost.`}{" "}
        {result.xp_awarded > 0 ? <span className="font-semibold text-accent-strong">+{result.xp_awarded} XP</span> : result.stars < 3 ? "Beat your best stars to earn more XP." : "You’ve already earned the XP for this one."}
      </p>
      {levelUp && <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-strong"><Sparkles className="size-4" aria-hidden="true" />Level up! You’re now level {result.level_after}</p>}
      {result.new_badges.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">New badge{result.new_badges.length === 1 ? "" : "s"}</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-2">{result.new_badges.map((badge) => <BadgeChip key={badge.id} badge={badge} />)}</ul>
        </div>
      )}
      {detail.task && (
        <div className="mt-5 rounded-2xl border border-accent/30 bg-accent-soft/50 p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-strong">Put it into practice</p>
          <p className="mt-1 text-sm font-semibold text-ink">{detail.task.label}</p>
          <Button size="sm" variant="outline" className="mt-3 bg-surface" onClick={() => detail.task && onTask(detail.task)}>{detail.task.prompt ? "Ask Penny" : "Go there"}<ArrowRight className="size-4" aria-hidden="true" /></Button>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {result.stars < 3 && <Button variant="outline" className="flex-1" onClick={onRetry} disabled={busy}><RotateCcw className="size-4" aria-hidden="true" />Replay for 3 stars</Button>}
        <Button className="flex-1" onClick={onClose}>Back to lessons</Button>
      </div>
    </div>
  );
}
