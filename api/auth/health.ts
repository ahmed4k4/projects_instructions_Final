/** Safe deployment diagnostics: reports configuration presence, never secrets. */
export default {
  fetch(request: Request): Response {
    if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    let projectRef: string | null = null;
    try { projectRef = new URL(supabaseUrl).hostname.split('.')[0] ?? null; } catch { /* invalid/missing URL */ }
    return Response.json({
      ok: Boolean(supabaseUrl && anonKey && serviceRoleKey),
      release: '1.2.1',
      signupReady: Boolean(supabaseUrl && anonKey && serviceRoleKey),
      loginReady: Boolean(supabaseUrl && anonKey),
      projectRef,
      environment: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'development' ? 'development' : 'unknown'),
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  },
};
