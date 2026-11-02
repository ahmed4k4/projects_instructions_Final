import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
import { absoluteUrl } from '@/lib/appUrl';
import i18n from '@/i18n';

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  /** True when Supabase credentials exist, so the UI can explain sign-in. */
  available: boolean;
}

/**
 * Subscribes to the Supabase auth session.
 *
 * Phase 1 shipped a purely local avatar; this hook is what makes "sign in"
 * real. It also exposes `signInWithMagicLink` / `signOut` for the Auth page.
 */
export function useAuth(): AuthState & {
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setIsLoading(false);
      })
      .catch(() => {
        if (mounted) setIsLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!supabase) return { error: i18n.t('auth.noSupabase') };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // Must be an absolute URL Supabase can redirect back to; on staging this
      // is the configured public app URL, not the preview host.
      options: { emailRedirectTo: absoluteUrl('/auth') },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return {
    user: session?.user ?? null,
    session,
    isLoading,
    available: isSupabaseConfigured,
    signInWithMagicLink,
    signOut,
  };
}
