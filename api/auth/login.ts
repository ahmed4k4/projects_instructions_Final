const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,23}$/;

function json(status: number, payload: unknown): Response {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default {
  async fetch(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const finish = (stage: string, details: Record<string, unknown> = {}) => {
      console.info('[auth login]', { requestId, stage, elapsedMs: Date.now() - startedAt, ...details });
    };
    if (request.method !== 'POST') return json(405, { requestId, error: 'Method not allowed.' });

    const origin = request.headers.get('origin');
    if (origin) {
      try {
        if (new URL(origin).origin !== new URL(request.url).origin) return json(403, { requestId, error: 'Cross-origin requests are not allowed.' });
      } catch {
        return json(403, { requestId, error: 'Invalid request origin.' });
      }
    }

    let body: { username?: unknown; password?: unknown };
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 8 * 1024) return json(413, { requestId, error: 'Request is too large.' });
      body = JSON.parse(raw) as typeof body;
    } catch {
      return json(400, { requestId, error: 'Invalid JSON.' });
    }

    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!USERNAME_PATTERN.test(username) || password.length < 8 || password.length > 72) {
      return json(400, { requestId, error: 'تأكد من اسم المستخدم وكلمة المرور.' });
    }

    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return json(503, { requestId, error: 'إعدادات Supabase غير مكتملة على الخادم.' });

    finish('password_grant_started');
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${username}@accounts.nexus.invalid`, password }),
        signal: AbortSignal.timeout(12_000),
      });
      const payload = record(await response.json().catch(() => ({})));
      if (!response.ok) {
        const code = String(payload.code ?? payload.error_code ?? payload.error ?? '');
        finish('password_grant_rejected', { status: response.status, code: code.slice(0, 80) });
        if (response.status === 400 || response.status === 401) {
          return json(401, { requestId, stage: 'password_grant', error: 'اسم المستخدم أو كلمة المرور غير صحيحة، أو أن الحساب لم يكتمل تفعيله.' });
        }
        return json(response.status >= 500 ? 502 : response.status, { requestId, stage: 'password_grant', error: 'تعذر تسجيل الدخول من خدمة الحسابات. حاول مرة أخرى.' });
      }
      if (typeof payload.access_token !== 'string' || typeof payload.refresh_token !== 'string') {
        finish('session_payload_invalid');
        return json(502, { requestId, stage: 'session_payload', error: 'خدمة الحسابات لم تُرجع جلسة دخول صالحة.' });
      }
      finish('completed');
      return json(200, {
        ok: true,
        requestId,
        session: { access_token: payload.access_token, refresh_token: payload.refresh_token },
      });
    } catch (error) {
      finish('password_grant_timeout', { errorName: error instanceof Error ? error.name : 'unknown' });
      return json(504, { requestId, stage: 'password_grant', error: 'انتهت مهلة تسجيل الدخول. حاول مرة أخرى.' });
    }
  },
};
