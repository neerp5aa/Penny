import { createBrowserClient } from "@supabase/ssr";

type BrowserClient = ReturnType<typeof createBrowserClient>;
let browserClient: BrowserClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function createSupabaseBrowserClient(): BrowserClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not configured");
  browserClient ??= createBrowserClient(url, key);
  return browserClient;
}

/** The signed-in user's Supabase access token, or null when there is no session. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Email of the signed-in Supabase user, for display only. The API verifies identity itself. */
export async function getSupabaseUserEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  return data.session?.user.email ?? null;
}

export async function signOutOfSupabase(): Promise<void> {
  if (isSupabaseConfigured()) await createSupabaseBrowserClient().auth.signOut();
}
