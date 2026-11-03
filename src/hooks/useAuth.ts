import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';

const usernameEmail = (username: string) => `${username.trim().toLowerCase()}@accounts.nexus.invalid`;

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  available: boolean;
}

/** Optional username/password account. The app and AI remain fully usable as guest. */
export function useAuth(): AuthState & {
  signInWithPassword: (username: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (username: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setIsLoading(false); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setIsLoading(false); }
    }).catch(() => { if (mounted) setIsLoading(false); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsLoading(false);
    });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, []);


  const signInWithPassword = useCallback(async (username: string, password: string) => {
    if (!supabase) return { error: 'Authentication is not configured.' };
    const { error } = await supabase.auth.signInWithPassword({ email: usernameEmail(username), password });
    return { error: error?.message ?? null };
  }, []);

  const signUpWithPassword = useCallback(async (username: string, password: string) => {
    if (!supabase) return { error: 'Authentication is not configured.', needsConfirmation: false };
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,23}$/.test(normalized)) {
      return { error: 'Username must be 3–24 characters and use English letters, numbers, dot, dash or underscore.', needsConfirmation: false };
    }
    const { data, error } = await supabase.auth.signUp({
      email: usernameEmail(normalized),
      password,
      options: { data: { username: normalized, login_method: 'username_password' } },
    });
    // This app uses non-deliverable .invalid aliases. Supabase email confirmation
    // must be disabled so signup does not try to send a message to that alias.
    return { error: error?.message ?? null, needsConfirmation: !error && !data.session };
  }, []);

  const signOut = useCallback(async () => { if (supabase) await supabase.auth.signOut(); }, []);

  return { user: session?.user ?? null, session, isLoading, available: isSupabaseConfigured, signInWithPassword, signUpWithPassword, signOut };
}
