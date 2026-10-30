"use client";

import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, Bot, Check, CheckCircle2, ChevronRight, Eye, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { coachApi, type CoachBrief, type CoachProposal, type CoachReply, type CoachRole, type CoachSignal, type Dashboard } from "@/lib/api";
import { cn } from "@/lib/utils";
import { cad, describeError } from "./shared";

/** Messages sent per request; the API accepts at most 12, ending with the new question. */
const HISTORY_LIMIT = 11;
const MAX_QUESTION_LENGTH = 600;

type ProposalState = "approving" | "approved" | "dismissed";
export type CoachMessage = { id: string; role: CoachRole; content: string; reply?: CoachReply };
type ChatError = { title: string; detail: string };

/** Conversation state, owned by the app shell so the chat survives switching tabs. */
export function useCoachChat() {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [proposals, setProposals] = useState<Record<string, ProposalState>>({});
  const latest = useRef(messages);
  useEffect(() => { latest.current = messages; }, [messages]);

  const send = useCallback(async (text: string) => {
    const question = text.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question || pending) return;
    const userMessage: CoachMessage = { id: crypto.randomUUID(), role: "user", content: question };
    const thread = [...latest.current, userMessage];
    setMessages(thread);
    setPending(true);
    setError(null);
    try {
      const history = thread.slice(-HISTORY_LIMIT - 1).map(({ role, content }) => ({ role, content }));
      while (history[0]?.role === "assistant") history.shift();
      const reply = await coachApi.chat(history);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: reply.reply, reply }]);
    } catch (reason) {
      setError(describeError(reason, "Penny couldn’t answer"));
    } finally {
      setPending(false);
    }
  }, [pending]);

  /** Resends the last question after a failure. */
  const retry = useCallback(() => {
    const last = latest.current.at(-1);
    if (last?.role !== "user") return;
    setMessages((current) => current.slice(0, -1));
    latest.current = latest.current.slice(0, -1);
    void send(last.content);
  }, [send]);

  const reset = useCallback(() => { setMessages([]); setError(null); setProposals({}); }, []);
  const setProposal = useCallback((id: string, state: ProposalState | null) => {
    setProposals((current) => {
      const next = { ...current };
      if (state) next[id] = state; else delete next[id];
      return next;
    });
  }, []);

  return { messages, pending, error, proposals, send, retry, reset, setProposal };
}

export type CoachChat = ReturnType<typeof useCoachChat>;

export function CoachView({ chat, dashboard, onDashboardChange, onApproved }: { chat: CoachChat; dashboard: Dashboard; onDashboardChange: (dashboard: Dashboard) => void; onApproved: (message: string) => void }) {
  const [brief, setBrief] = useState<CoachBrief | null>(null);
  const [briefError, setBriefError] = useState(false);
  const [approvalError, setApprovalError] = useState<ChatError | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { messages, pending, error } = chat;

  // Refresh the check-in whenever the underlying data changes (for example after an approval).
  useEffect(() => {
    let active = true;
    coachApi.brief()
      .then((data) => { if (active) { setBrief(data); setBriefError(false); } })
      .catch(() => { if (active) setBriefError(true); });
    return () => { active = false; };
  }, [dashboard]);

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  async function approve(proposal: CoachProposal) {
    chat.setProposal(proposal.id, "approving");
    setApprovalError(null);
    try {
      const response = await coachApi.approve(proposal);
      chat.setProposal(proposal.id, "approved");
      onDashboardChange(response.dashboard);
      onApproved(proposal.title);
    } catch (reason) {
      chat.setProposal(proposal.id, null);
      setApprovalError(describeError(reason, "That change couldn’t be applied"));
    }
  }

  const lastAssistant = messages.findLast((message) => message.role === "assistant");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <CheckIn brief={brief} failed={briefError} compact={messages.length > 0} disabled={pending} onAsk={(text) => void chat.send(text)} />

      {messages.length > 0 && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">Conversation</h2>
          <Button variant="ghost" size="sm" onClick={chat.reset} disabled={pending}><RotateCcw className="size-4" aria-hidden="true" />New chat</Button>
        </div>
      )}

      <div role="log" aria-live="polite" aria-busy={pending} aria-label="Conversation with Penny AI" className="space-y-4">
        {messages.map((message) => message.role === "user"
          ? <UserBubble key={message.id} text={message.content} />
          : (
            <AssistantMessage
              key={message.id}
              reply={message.reply!}
              proposalState={message.reply?.proposal ? chat.proposals[message.reply.proposal.id] : undefined}
              showFollowUps={message === lastAssistant && !pending}
              disabled={pending}
              onAsk={(text) => void chat.send(text)}
              onApprove={(proposal) => void approve(proposal)}
              onDismiss={(proposal) => chat.setProposal(proposal.id, "dismissed")}
            />
          ))}
        {pending && <Thinking />}
        {error && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/25 bg-danger-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold text-danger">{error.title}</p><p className="mt-1 text-sm text-ink-muted">{error.detail}</p></div>
            <Button variant="outline" size="sm" onClick={chat.retry}><RotateCcw className="size-4" aria-hidden="true" />Try again</Button>
          </div>
        )}
        {approvalError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{approvalError.title}: {approvalError.detail}</p>}
        <div ref={endRef} />
      </div>

      <Composer disabled={pending} onSend={(text) => void chat.send(text)} />
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-ink-subtle">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Educational guidance using fictional data. Every amount Penny quotes is checked against your records, and nothing changes without your approval.
      </p>
    </div>
  );
}

const SIGNAL_STYLE: Record<CoachSignal["tone"], { icon: typeof Eye; className: string; label: string }> = {
  alert: { icon: AlertTriangle, className: "bg-danger-soft text-danger", label: "Needs attention" },
  watch: { icon: Eye, className: "bg-gold-soft text-gold-strong", label: "Keep an eye on" },
  positive: { icon: CheckCircle2, className: "bg-accent-soft text-accent-strong", label: "Going well" },
};

function CheckIn({ brief, failed, compact, disabled, onAsk }: { brief: CoachBrief | null; failed: boolean; compact: boolean; disabled: boolean; onAsk: (text: string) => void }) {
  if (failed && !brief) {
    return <Card className="p-5"><p className="font-semibold text-ink">Ask Penny anything about your money</p><p className="mt-1 text-sm text-ink-subtle">Your check-in couldn’t load, but you can still ask a question below.</p></Card>;
  }
  if (!brief) {
    return <Card className="flex items-center gap-3 p-5" role="status"><LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" /><span className="text-sm text-ink-muted">Reading your month…</span></Card>;
  }
  const signals = (
    <ul className="grid gap-2 sm:grid-cols-2">
      {brief.signals.map((signal) => {
        const style = SIGNAL_STYLE[signal.tone];
        const Icon = style.icon;
        return (
          <li key={signal.id}>
            <button type="button" disabled={disabled} onClick={() => onAsk(signal.prompt)} className="group flex min-h-11 w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:border-accent hover:bg-sage-soft disabled:opacity-60">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", style.className)}><Icon className="size-4" aria-hidden="true" /><span className="sr-only">{style.label}</span></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{signal.title}</span><span className="mt-0.5 block text-sm text-ink-muted">{signal.detail}</span></span>
              <ChevronRight className="mt-1 size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (compact) {
    return (
      <details className="group rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><Sparkles className="size-4 text-accent" aria-hidden="true" />{brief.month_label} check-in</span>
          <ChevronRight className="size-4 text-ink-subtle transition-transform group-open:rotate-90" aria-hidden="true" />
        </summary>
        <div className="border-t border-line p-3">{signals}</div>
      </details>
    );
  }

  return (
    <section aria-labelledby="checkin-title" className="space-y-4">
      <div className="rounded-[var(--radius-card)] bg-hero p-5 text-white shadow-[var(--shadow-raised)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15" aria-hidden="true"><Sparkles className="size-5" /></span>
          <div>
            <h2 id="checkin-title" className="text-xl font-semibold tracking-tight sm:text-2xl">{brief.greeting}</h2>
            <p className="mt-1 text-sm text-white/75">I’ve read your budgets, bills, goals, and spending. Tap anything below, or ask your own question.</p>
          </div>
        </div>
      </div>
      {signals}
      <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
        {brief.suggested_questions.map((question) => <Chip key={question} disabled={disabled} onClick={() => onAsk(question)}>{question}</Chip>)}
      </div>
    </section>
  );
}

function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 lg:bottom-4">
      <label htmlFor="coach-question" className="sr-only">Ask Penny AI about your money</label>
      <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-[var(--shadow-raised)] focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
        <textarea
          id="coach-question"
          rows={1}
          value={text}
          maxLength={MAX_QUESTION_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Can I afford a $300 concert trip? How do I hit my goal sooner?"
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-ink [field-sizing:content] placeholder:text-ink-subtle/80 focus:outline-none"
        />
        <Button type="submit" size="icon" disabled={disabled || !text.trim()} aria-label="Send question">
          {disabled ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <ArrowUp className="size-5" aria-hidden="true" />}
        </Button>
      </div>
    </form>
  );
}

function UserBubble({ text }: { text: string }) {
  return <div className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-info px-4 py-3 text-sm font-medium text-white shadow-[var(--shadow-card)]">{text}</p></div>;
}

function Thinking() {
  return (
    <div className="flex items-center gap-3" role="status">
      <Avatar />
      <p className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 text-sm text-ink-muted"><LoaderCircle className="mr-2 inline size-4 animate-spin align-[-3px] text-accent" aria-hidden="true" />Checking your numbers…</p>
    </div>
  );
}

function Avatar() {
  return <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-white" aria-hidden="true"><Bot className="size-5" /></span>;
}

function AssistantMessage({ reply, proposalState, showFollowUps, disabled, onAsk, onApprove, onDismiss }: { reply: CoachReply; proposalState: ProposalState | undefined; showFollowUps: boolean; disabled: boolean; onAsk: (text: string) => void; onApprove: (proposal: CoachProposal) => void; onDismiss: (proposal: CoachProposal) => void }) {
  return (
    <article className="flex gap-3" aria-label="Penny AI reply">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-md border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <RichText text={reply.reply} />
          {reply.tools_used.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
              <Wrench className="size-3.5" aria-hidden="true" />
              {reply.tools_used.map((tool, index) => <span key={`${tool.name}-${index}`}>{tool.label}</span>)}
            </p>
          )}
          {reply.facts.length > 0 && <Facts reply={reply} />}
          <SourceLine reply={reply} />
        </div>
        {reply.proposal && proposalState !== "dismissed" && <ProposalCard proposal={reply.proposal} state={proposalState} onApprove={onApprove} onDismiss={onDismiss} />}
        {showFollowUps && reply.follow_ups.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Follow-up questions">
            {reply.follow_ups.map((question) => <Chip key={question} disabled={disabled} onClick={() => onAsk(question)}>{question}</Chip>)}
          </div>
        )}
      </div>
    </article>
  );
}

function Facts({ reply }: { reply: CoachReply }) {
  return (
    <details className="group mt-3 rounded-xl bg-sage-soft">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-ink-muted [&::-webkit-details-marker]:hidden">
        <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />Numbers behind this answer · {reply.facts.length}
        <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <dl className="divide-y divide-line px-3 pb-2">
        {reply.facts.map((fact) => (
          <div key={`${fact.label}-${fact.display}`} className="flex justify-between gap-3 py-1.5 text-sm">
            <dt className="text-ink-muted">{fact.label}</dt>
            <dd className={cn("tabular font-semibold", fact.cents !== null && fact.cents < 0 ? "text-danger" : "text-ink")}>{fact.display}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const FALLBACK_LABEL: Record<NonNullable<CoachReply["fallback_reason"]>, string> = {
  no_api_key: "AI isn’t configured",
  model_error: "AI was unavailable",
  timeout: "AI took too long",
  unverified_numbers: "AI answer failed the number check",
};

function SourceLine({ reply }: { reply: CoachReply }) {
  if (reply.source === "ai") {
    const seconds = (reply.usage.elapsed_ms / 1000).toFixed(1);
    return <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-subtle"><Badge tone="accent"><Sparkles className="size-3" aria-hidden="true" />AI</Badge>{reply.model} · {seconds}s</p>;
  }
  return <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-subtle"><Badge tone="gold">Built-in answer</Badge>{reply.fallback_reason ? FALLBACK_LABEL[reply.fallback_reason] : null}</p>;
}

function ProposalCard({ proposal, state, onApprove, onDismiss }: { proposal: CoachProposal; state: ProposalState | undefined; onApprove: (proposal: CoachProposal) => void; onDismiss: (proposal: CoachProposal) => void }) {
  const approved = state === "approved";
  const label = proposal.kind === "goal_contribution" ? "Saved" : "Limit";
  return (
    <Card className="border-accent/30 bg-accent-soft p-4">
      <div className="flex items-center gap-2"><LockKeyhole className="size-4 text-accent-strong" aria-hidden="true" /><h3 className="font-semibold text-ink">{approved ? "Change applied" : "Review this change"}</h3></div>
      <p className="mt-1 text-sm font-medium text-ink">{proposal.title}</p>
      {proposal.reason && <p className="mt-1 text-sm text-ink-muted">{proposal.reason}</p>}
      <p className="tabular mt-2 text-sm text-ink-muted">{proposal.target_name}: {label} {cad(proposal.current_cents)} → <span className="font-semibold text-ink">{cad(proposal.proposed_cents)}</span></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => onApprove(proposal)} disabled={state !== undefined}>
          {state === "approving" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : approved ? <Check className="size-4" aria-hidden="true" /> : null}
          {approved ? "Approved" : "Approve"}
        </Button>
        {!approved && <Button variant="ghost" onClick={() => onDismiss(proposal)} disabled={state === "approving"}>Not now</Button>}
      </div>
    </Card>
  );
}

function Chip({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="min-h-11 rounded-full border border-line bg-sage-soft px-3 text-left text-sm font-medium text-ink-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-ink disabled:opacity-50">{children}</button>;
}

/** Renders the coach's light formatting: paragraphs, "- " bullet lists, and **bold**. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((block) => block.split("\n").filter((line) => line.trim()));
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-ink">
      {blocks.map((lines, index) => {
        const isList = lines.every((line) => /^\s*[-•*]\s+/.test(line));
        if (isList) return <ul key={index} className="list-disc space-y-1 pl-5 marker:text-accent">{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*[-•*]\s+/, ""))}</li>)}</ul>;
        return lines.map((line, i) => /^\s*[-•*]\s+/.test(line)
          ? <ul key={`${index}-${i}`} className="list-disc pl-5 marker:text-accent"><li>{inline(line.replace(/^\s*[-•*]\s+/, ""))}</li></ul>
          : <p key={`${index}-${i}`}>{inline(line)}</p>);
      })}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong> : part);
}
