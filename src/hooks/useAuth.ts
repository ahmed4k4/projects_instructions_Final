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
    if (!error) return { error: null };
    const message = /invalid login credentials|invalid_credentials/i.test(error.message)
      ? 'اسم المستخدم أو كلمة المرور غير صحيحة.'
      : /email not confirmed/i.test(error.message)
        ? 'الحساب غير مفعّل. تواصل مع مسؤول الموقع.'
        : error.message;
    return { error: message };
  }, []);

  const signUpWithPassword = useCallback(async (username: string, password: string) => {
    if (!supabase) return { error: 'Authentication is not configured.', needsConfirmation: false };
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,23}$/.test(normalized)) {
      return { error: 'Username must be 3–24 characters and use English letters, numbers, dot, dash or underscore.', needsConfirmation: false };
    }
    // Create users through the server-only Supabase Admin API. The server marks
    // the synthetic .invalid address as confirmed, so Auth never sends email.
    let signupResponse: Response;
    try {
      signupResponse = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalized, password }),
      });
    } catch {
      return { error: 'تعذر الاتصال بخدمة إنشاء الحسابات. حاول مرة أخرى.', needsConfirmation: false };
    }
    const signupResult = await signupResponse.json().catch(() => ({})) as {
      error?: string;
      session?: { access_token?: string; refresh_token?: string };
    };
    if (!signupResponse.ok) {
      return { error: signupResult.error ?? 'تعذر إنشاء الحساب.', needsConfirmation: false };
    }

    // The server returns the session created by a password grant. Persist it
    // through Supabase SDK so auth listeners and protected features update.
    if (!signupResult.session?.access_token || !signupResult.session.refresh_token) {
      return { error: 'تم إنشاء الحساب، لكن تعذر استلام جلسة الدخول. جرّب تسجيل الدخول بنفس البيانات.', needsConfirmation: false };
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: signupResult.session.access_token,
      refresh_token: signupResult.session.refresh_token,
    });
    return { error: sessionError?.message ?? null, needsConfirmation: false };
  }, []);

  const signOut = useCallback(async () => { if (supabase) await supabase.auth.signOut(); }, []);

  return { user: session?.user ?? null, session, isLoading, available: isSupabaseConfigured, signInWithPassword, signUpWithPassword, signOut };
}
