"use client";

import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Check, ChevronRight, History, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, SquarePen, Trash2, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { coachApi, type CoachBrief, type CoachProposal, type CoachReply, type CoachRole, type Dashboard } from "@/lib/api";
import { cn } from "@/lib/utils";
import { cad, describeError } from "./shared";

/** Messages sent per request; the API accepts at most 12, ending with the new question. */
const HISTORY_LIMIT = 11;
const MAX_QUESTION_LENGTH = 600;

type ProposalState = "approving" | "approved" | "dismissed";
export type CoachMessage = { id: string; role: CoachRole; content: string; reply?: CoachReply };
type ChatError = { title: string; detail: string };
export type Conversation = { id: string; title: string; updated_at: string; messages: CoachMessage[]; proposals: Record<string, ProposalState> };

const STORAGE_KEY = "penny-coach-chats";
const MAX_SAVED_CHATS = 30;

/** Saved chats from this device. Storage can be blocked or hold old data, so failures are ignored. */
function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is Conversation => typeof item?.id === "string" && Array.isArray(item?.messages)) : [];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_SAVED_CHATS))); } catch { /* Keep chats in memory. */ }
}

/**
 * Conversation state, owned by the app shell so chats survive switching tabs. Every chat is
 * kept in a history list (saved on this device); "New chat" starts a fresh one.
 */
export function useCoachChat() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const latest = useRef({ conversations, activeId });
  useEffect(() => { latest.current = { conversations, activeId }; }, [conversations, activeId]);
  useEffect(() => { saveConversations(conversations); }, [conversations]);

  const active = conversations.find((item) => item.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  /** Applies a change to one conversation and moves it to the top of the list. */
  const update = useCallback((id: string, change: (conversation: Conversation) => Conversation) => {
    setConversations((current) => {
      const target = current.find((item) => item.id === id);
      if (!target) return current;
      return [{ ...change(target), updated_at: new Date().toISOString() }, ...current.filter((item) => item.id !== id)];
    });
  }, []);

  const send = useCallback(async (text: string) => {
    const question = text.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question || pending) return;
    const userMessage: CoachMessage = { id: crypto.randomUUID(), role: "user", content: question };
    let id = latest.current.activeId;
    const existing = latest.current.conversations.find((item) => item.id === id);
    const thread = [...(existing?.messages ?? []), userMessage];
    if (!existing) {
      id = crypto.randomUUID();
      const created: Conversation = { id, title: question.length > 60 ? `${question.slice(0, 57)}…` : question, updated_at: new Date().toISOString(), messages: thread, proposals: {} };
      setConversations((current) => [created, ...current]);
      setActiveId(id);
    } else {
      update(existing.id, (conversation) => ({ ...conversation, messages: thread }));
    }
    const conversationId = id as string;
    setPending(true);
    setError(null);
    try {
      const history = thread.slice(-HISTORY_LIMIT - 1).map(({ role, content }) => ({ role, content }));
      while (history[0]?.role === "assistant") history.shift();
      const reply = await coachApi.chat(history);
      update(conversationId, (conversation) => ({ ...conversation, messages: [...conversation.messages, { id: crypto.randomUUID(), role: "assistant", content: reply.reply, reply }] }));
    } catch (reason) {
      setError(describeError(reason, "Penny couldn’t answer"));
    } finally {
      setPending(false);
    }
  }, [pending, update]);

  /** Resends the last question after a failure. */
  const retry = useCallback(() => {
    const id = latest.current.activeId;
    const conversation = latest.current.conversations.find((item) => item.id === id);
    const last = conversation?.messages.at(-1);
    if (!conversation || last?.role !== "user") return;
    const trimmed = { ...conversation, messages: conversation.messages.slice(0, -1) };
    latest.current = { ...latest.current, conversations: latest.current.conversations.map((item) => (item.id === trimmed.id ? trimmed : item)) };
    update(conversation.id, () => trimmed);
    void send(last.content);
  }, [send, update]);

  const newChat = useCallback(() => { setActiveId(null); setError(null); }, []);
  const open = useCallback((id: string) => { setActiveId(id); setError(null); }, []);
  const remove = useCallback((id: string) => {
    setConversations((current) => current.filter((item) => item.id !== id));
    setActiveId((current) => (current === id ? null : current));
  }, []);
  const setProposal = useCallback((proposalId: string, state: ProposalState | null) => {
    const id = latest.current.activeId;
    if (!id) return;
    update(id, (conversation) => {
      const next = { ...conversation.proposals };
      if (state) next[proposalId] = state; else delete next[proposalId];
      return { ...conversation, proposals: next };
    });
  }, [update]);

  return { conversations, activeId, messages, proposals: active?.proposals ?? {}, pending, error, send, retry, newChat, open, remove, setProposal };
}

export type CoachChat = ReturnType<typeof useCoachChat>;

export function CoachView({ chat, dashboard, onDashboardChange, onApproved }: { chat: CoachChat; dashboard: Dashboard; onDashboardChange: (dashboard: Dashboard) => void; onApproved: (message: string) => void }) {
  const [brief, setBrief] = useState<CoachBrief | null>(null);
  const [approvalError, setApprovalError] = useState<ChatError | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { messages, pending, error } = chat;

  // The greeting and suggested questions follow the latest data (for example after an approval).
  useEffect(() => {
    let active = true;
    coachApi.brief().then((data) => { if (active) setBrief(data); }).catch(() => undefined);
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
  const historyList = <ChatHistory chat={chat} onPicked={() => setHistoryOpen(false)} />;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside aria-label="Chat history" className="hidden lg:block">
        <div className="sticky top-28">{historyList}</div>
      </aside>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-ink-muted">{chat.activeId ? chat.conversations.find((item) => item.id === chat.activeId)?.title : "New chat"}</h2>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setHistoryOpen(true)}><History className="size-4" aria-hidden="true" />Chats{chat.conversations.length > 0 && <span className="tabular text-ink-subtle">{chat.conversations.length}</span>}</Button>
            {messages.length > 0 && <Button variant="ghost" size="sm" onClick={chat.newChat} disabled={pending}><SquarePen className="size-4" aria-hidden="true" />New chat</Button>}
          </div>
        </div>

        {messages.length === 0 && <Welcome name={dashboard.profile.display_name.split(" ")[0]} questions={brief?.suggested_questions} disabled={pending} onAsk={(text) => void chat.send(text)} />}

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
          Educational guidance using fictional data. Every amount Penny quotes is checked against your records, and nothing changes without your approval. Chats are saved on this device.
        </p>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Your chats</DialogTitle><DialogDescription>Saved on this device.</DialogDescription></DialogHeader>
          {historyList}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Past conversations, newest first, with a button to start a new one. */
function ChatHistory({ chat, onPicked }: { chat: CoachChat; onPicked: () => void }) {
  return (
    <nav aria-label="Past chats" className="space-y-3">
      <Button className="w-full" onClick={() => { chat.newChat(); onPicked(); }} disabled={chat.pending}><SquarePen className="size-4" aria-hidden="true" />New chat</Button>
      {chat.conversations.length === 0 ? <p className="px-1 text-sm text-ink-subtle">Your chats will appear here.</p> : (
        <ul className="space-y-1">
          {chat.conversations.map((conversation) => {
            const current = conversation.id === chat.activeId;
            return (
              <li key={conversation.id} className={cn("group flex items-center rounded-xl transition-colors", current ? "bg-primary-soft" : "hover:bg-sage-soft")}>
                <button type="button" aria-current={current ? "true" : undefined} onClick={() => { chat.open(conversation.id); onPicked(); }} className="min-h-12 min-w-0 flex-1 px-3 py-2 text-left">
                  <span className={cn("block truncate text-sm", current ? "font-semibold text-ink" : "text-ink")}>{conversation.title}</span>
                  <span className="block text-xs text-ink-subtle">{relativeDay(conversation.updated_at)} · {Math.ceil(conversation.messages.length / 2)} question{conversation.messages.length > 2 ? "s" : ""}</span>
                </button>
                <button type="button" onClick={() => chat.remove(conversation.id)} className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-subtle opacity-70 hover:bg-danger-soft hover:text-danger group-hover:opacity-100" aria-label={`Delete chat: ${conversation.title}`}><Trash2 className="size-4" aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

function relativeDay(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return then.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return then.toLocaleDateString("en-CA", { weekday: "long" });
  return then.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

const FALLBACK_QUESTIONS = ["What should I focus on this week?", "Where am I overspending?", "Can I afford a $150 concert ticket?"];

/** A short welcome and a few questions to start with. */
function Welcome({ name, questions = FALLBACK_QUESTIONS, disabled, onAsk }: { name: string; questions?: string[]; disabled: boolean; onAsk: (text: string) => void }) {
  return (
    <section aria-labelledby="welcome-title" className="space-y-4">
      <div className="rounded-[var(--radius-card)] bg-hero p-5 text-white shadow-[var(--shadow-raised)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15" aria-hidden="true"><Sparkles className="size-5" /></span>
          <div>
            <h2 id="welcome-title" className="text-xl font-semibold tracking-tight sm:text-2xl">Hi {name}, how can I help?</h2>
            <p className="mt-1 text-sm text-white/75">I know your budgets, bills, goals, and spending. Ask me anything, or start with one of these.</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
        {questions.map((question) => <Chip key={question} disabled={disabled} onClick={() => onAsk(question)}>{question}</Chip>)}
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
