import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * `true` when the build has no Supabase credentials. The UI uses this to stay
 * fully navigable (with sample data) instead of crashing on a fresh clone.
 */
export const isSupabaseConfigured = Boolean(url && anonKey) && !url?.includes('your-project-ref');

function createSupabaseClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) {
    console.warn(
      '[RIGPILOT] Supabase is not configured. Copy .env.example to .env.local and set ' +
        'VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY. The app will run with sample data.',
    );
    return null;
  }

  return createClient<Database>(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: { 'x-application-name': 'rigpilot-pc-builder' },
    },
  });
}

/**
 * Typed Supabase client. `null` before credentials are supplied — always use
 * `requireSupabase()` when a query cannot proceed without it.
 */
export const supabase = createSupabaseClient();

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase client is not initialised. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.',
    );
  }
  return supabase;
}
