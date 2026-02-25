import { createClient, type Session, type User, type SupabaseClient } from "@supabase/supabase-js";

export type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

// Lazy-initialized Supabase client
let _supabase: SupabaseClient | null = null;
let _initPromise: Promise<SupabaseClient | null> | null = null;

async function initSupabase(): Promise<SupabaseClient | null> {
  if (_supabase) return _supabase;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const res = await fetch("/api/config");
      const config = await res.json();
      if (config.supabaseUrl && config.supabaseAnonKey) {
        _supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
        return _supabase;
      }
    } catch {}
    return null;
  })();

  return _initPromise;
}

export async function getSupabase() {
  return initSupabase();
}

export async function signInWithGoogle() {
  const sb = await initSupabase();
  if (!sb) throw new Error("Auth not configured");
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const sb = await initSupabase();
  if (!sb) return;
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const sb = await initSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

export async function onAuthStateChange(callback: (session: Session | null) => void) {
  const sb = await initSupabase();
  if (!sb) {
    callback(null);
    return { unsubscribe: () => {} };
  }
  const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return subscription;
}
