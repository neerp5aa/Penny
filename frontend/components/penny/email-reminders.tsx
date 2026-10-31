"use client";

import { type FormEvent, useEffect, useState } from "react";
import { BellRing, CircleAlert, Eye, LoaderCircle, Mail, MailCheck, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ReminderKinds, type ReminderState, remindersApi, type SentEmail } from "@/lib/api";
import { cn } from "@/lib/utils";
import { describeError } from "./shared";

const SECTION = "rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6";

const KIND_OPTIONS: { key: keyof ReminderKinds; label: string; description: string }[] = [
  { key: "bills", label: "Bills and subscriptions", description: "Up to three days before anything recurring is due." },
  { key: "budgets", label: "Budget alerts", description: "When a category passes 85% of its limit, and again if it goes over." },
  { key: "streaks", label: "Green streak at risk", description: "When today’s spending puts your Money Score streak in danger." },
  { key: "lessons", label: "Daily lesson", description: "A nudge to keep your learning streak going." },
];

const STATUS: Record<SentEmail["status"], { label: string; tone: "accent" | "neutral" | "danger" }> = {
  sent: { label: "Sent", tone: "accent" },
  preview: { label: "Preview", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

const TRIGGER: Record<SentEmail["trigger"], string> = { scheduled: "Automatic", manual: "Sent now", test: "Test" };

/** Email reminders: address, which reminders, delivery status, and recent emails. */
export function EmailReminders() {
  const [state, setState] = useState<ReminderState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [kinds, setKinds] = useState<ReminderKinds>({ bills: true, budgets: true, streaks: true, lessons: false });
  const [busy, setBusy] = useState<"save" | "test" | "now" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function apply(next: ReminderState) {
    setState(next);
    setEmail(next.email ?? "");
    setEnabled(next.enabled);
    setKinds(next.kinds);
  }

  function load() {
    remindersApi.state().then((next) => { apply(next); setLoadError(""); }).catch((reason: unknown) => setLoadError(describeError(reason, "Couldn’t load reminders").detail));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  useEffect(() => { load(); }, []);

  const dirty = state !== null && (enabled !== state.enabled || (email.trim() || null) !== state.email || KIND_OPTIONS.some(({ key }) => kinds[key] !== state.kinds[key]));

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setBusy("save");
    setMessage(null);
    try {
      apply(await remindersApi.update({ enabled, email: email.trim() || null, kinds }));
      setMessage({ tone: "ok", text: enabled ? "Saved. Penny will email you when something’s due." : "Saved. Email reminders are off." });
    } catch (reason) {
      setMessage({ tone: "error", text: describeError(reason, "Couldn’t save").detail });
    } finally {
      setBusy(null);
    }
  }

  async function send(kind: "test" | "now") {
    setBusy(kind);
    setMessage(null);
    try {
      if (dirty) apply(await remindersApi.update({ enabled, email: email.trim() || null, kinds }));
      const result = await (kind === "test" ? remindersApi.test() : remindersApi.sendNow());
      setMessage(
        result.status === "sent" ? { tone: "ok", text: `Sent to ${result.to}. Check your inbox (and spam, the first time).` }
          : result.status === "preview" ? { tone: "ok", text: "Email isn’t set up on the server yet, so here’s a preview of what would be sent." }
            : { tone: "error", text: result.error ?? "The email couldn’t be sent." },
      );
      apply(await remindersApi.state());
    } catch (reason) {
      setMessage({ tone: "error", text: describeError(reason, "Couldn’t send").detail });
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <section className={SECTION} aria-labelledby="reminders-title" aria-busy={!loadError}>
        <h2 id="reminders-title" className="flex items-center gap-2 text-lg font-semibold text-ink"><BellRing className="size-5 text-gold-strong" aria-hidden="true" />Email reminders</h2>
        {loadError
          ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{loadError}<Button size="sm" variant="ghost" onClick={load}><RefreshCw className="size-4" aria-hidden="true" />Try again</Button></div>
          : <div className="mt-4 h-40 animate-pulse rounded-xl bg-sage-soft" />}
      </section>
    );
  }

  const noAddress = !email.trim();
  return (
    <section className={SECTION} aria-labelledby="reminders-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="reminders-title" className="flex items-center gap-2 text-lg font-semibold text-ink"><BellRing className="size-5 text-gold-strong" aria-hidden="true" />Email reminders</h2>
        {state.delivery === "smtp" ? <Badge><MailCheck className="mr-1 size-3.5" aria-hidden="true" />Email connected</Badge> : <Badge tone="gold"><Eye className="mr-1 size-3.5" aria-hidden="true" />Preview mode</Badge>}
      </div>
      <p className="mt-1 text-sm text-ink-subtle">
        {state.delivery === "smtp"
          ? `Sent from ${state.sender}. Penny checks ${state.check_minutes ? `every ${state.check_minutes} minutes` : "only when you press Send"} and never emails the same reminder twice.`
          : "The server has no email account set up yet, so reminders are composed and shown below instead of being sent."}
      </p>

      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
          <span><span className="block text-sm font-semibold text-ink">Email me reminders</span><span className="block text-sm text-ink-subtle">One email with everything that’s due, not one per item.</span></span>
          <input type="checkbox" role="switch" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5 shrink-0 accent-[var(--color-accent)]" />
        </label>

        <div>
          <label htmlFor="reminder-email" className="text-sm font-semibold text-ink">Send to</label>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input id="reminder-email" type="email" inputMode="email" autoComplete="email" value={email} maxLength={254} placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} className="pl-9" aria-describedby="reminder-email-hint" />
          </div>
          <p id="reminder-email-hint" className="mt-1.5 text-xs text-ink-subtle">Emails include amounts from your Penny account.</p>
        </div>

        <fieldset className={cn("divide-y divide-line rounded-xl border border-line px-4 transition-opacity", !enabled && "opacity-60")}>
          <legend className="sr-only">Which reminders</legend>
          {KIND_OPTIONS.map(({ key, label, description }) => (
            <label key={key} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3">
              <span><span className="block text-sm font-semibold text-ink">{label}</span><span className="mt-0.5 block text-sm text-ink-subtle">{description}</span></span>
              <input type="checkbox" checked={kinds[key]} onChange={() => setKinds({ ...kinds, [key]: !kinds[key] })} className="size-5 shrink-0 accent-[var(--color-accent)]" />
            </label>
          ))}
        </fieldset>

        {message && <p role={message.tone === "error" ? "alert" : "status"} className={cn("rounded-xl px-3 py-2 text-sm", message.tone === "error" ? "bg-danger-soft text-danger" : "bg-accent-soft text-ink")}>{message.text}</p>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="sm:flex-1" disabled={busy !== null || !dirty}>{busy === "save" && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}Save</Button>
          <Button type="button" variant="outline" disabled={busy !== null || noAddress || state.emails_left_this_hour === 0} onClick={() => void send("test")}>{busy === "test" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}Send a test</Button>
          <Button type="button" variant="outline" disabled={busy !== null || noAddress || state.emails_left_this_hour === 0} onClick={() => void send("now")}>{busy === "now" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}Send what’s due now</Button>
        </div>
        <p className="text-xs text-ink-subtle">{state.emails_left_this_hour} of 6 emails left this hour.</p>
      </form>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink">Due today</h3>
        {state.due.length === 0 ? (
          <p className="mt-1 text-sm text-ink-subtle">Nothing needs a reminder right now{KIND_OPTIONS.some(({ key }) => state.kinds[key]) ? "." : ". Turn on a reminder type above."}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {state.due.map((item) => (
              <li key={`${item.kind}-${item.title}`} className="rounded-xl bg-sage-soft/70 px-3 py-2 text-sm">
                <span className="flex items-start justify-between gap-2"><span className="font-semibold text-ink">{item.title}</span>{item.already_sent && <Badge tone="neutral" className="shrink-0">Emailed</Badge>}</span>
                <span className="block text-ink-subtle">{item.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.log.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink">Recent emails</h3>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {state.log.map((entry) => (
              <li key={entry.id}>
                <details className="group px-3 py-2.5">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm">
                    <Badge tone={STATUS[entry.status].tone} className="shrink-0">{STATUS[entry.status].label}</Badge>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{entry.subject}</span>
                    <span className="shrink-0 text-xs text-ink-subtle">{TRIGGER[entry.trigger]} · {new Date(entry.at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</span>
                  </summary>
                  {entry.error && <p className="mt-2 flex items-start gap-1.5 text-sm text-danger"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{entry.error}</p>}
                  <p className="mt-2 text-xs text-ink-subtle">To {entry.to}</p>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-sage-soft p-3 font-sans text-xs leading-relaxed text-ink-muted">{entry.text}</pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
