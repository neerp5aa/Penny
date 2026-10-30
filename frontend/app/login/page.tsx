"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/penny/app-shell";
import { Field } from "@/components/penny/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don’t match. Check them and try again.";
  if (/email not confirmed/i.test(message)) return "This account hasn’t been confirmed yet. Ask the team to confirm it in Supabase.";
  if (/fetch|network/i.test(message)) return "Couldn’t reach the sign-in service. Check your connection and try again.";
  return message;
}

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
      if (authError) { setError(friendlyAuthError(authError.message)); setBusy(false); return; }
      router.replace("/");
    } catch (reason) {
      setError(friendlyAuthError(reason instanceof Error ? reason.message : "Sign-in failed"));
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm animate-enter">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div><p className="text-lg font-semibold tracking-tight text-ink">Penny</p><p className="text-xs text-ink-subtle">Make money make sense</p></div>
        </div>
        <div className="mt-8 rounded-[1.5rem] border border-line bg-surface p-6 shadow-[var(--shadow-raised)] sm:p-7">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-subtle">Use the demo account your team set up. Never use real banking passwords.</p>
          <form onSubmit={signIn} className="mt-6 space-y-4">
            <Field label="Email">{(props) => <Input {...props} name="email" type="email" autoComplete="email" required disabled={!configured || busy} />}</Field>
            <Field label="Password">{(props) => <Input {...props} name="password" type="password" autoComplete="current-password" required disabled={!configured || busy} />}</Field>
            {error && <p role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">{error}</p>}
            <Button type="submit" disabled={!configured || busy} className="w-full">
              {busy ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Signing in…</> : "Sign in"}
            </Button>
          </form>
          {!configured && <p className="mt-4 rounded-xl bg-gold-soft p-3 text-sm text-gold-strong">Sign-in isn’t set up yet. Add the Supabase URL and publishable key to <code>frontend/.env.local</code>, then restart the dev server.</p>}
        </div>
        <p className="mt-5 flex items-start gap-2 text-xs text-ink-subtle"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />Penny uses only fictional accounts and amounts. No bank is ever connected.</p>
        <Link href="/" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-strong hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Back to Penny</Link>
      </div>
    </main>
  );
}
