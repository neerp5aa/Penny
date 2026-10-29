"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  const [message, setMessage] = useState("");
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
    setMessage(error ? error.message : "Signed in. Return to the demo dashboard.");
  }
  return <main className="grid min-h-screen place-items-center bg-[#f6f8f5] p-4"><div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-6 grid size-12 place-items-center rounded-2xl bg-emerald-600 text-xl font-black text-white">P</div><h1 className="text-2xl font-black">Sign in to Penny</h1><p className="mt-2 text-sm text-slate-600">Local Supabase Auth for development. Never use real financial credentials.</p><form onSubmit={signIn} className="mt-6 space-y-4"><label className="block text-sm font-semibold">Email<input name="email" type="email" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label><label className="block text-sm font-semibold">Password<input name="password" type="password" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label><button disabled={!configured} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Sign in</button></form>{!configured && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Copy <code>.env.example</code> to <code>.env.local</code> and add local Supabase values.</p>}{message && <p aria-live="polite" className="mt-4 text-sm">{message}</p>}<Link href="/" className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-emerald-700">Back to fictional demo</Link></div></main>;
}
