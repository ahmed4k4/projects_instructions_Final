const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,23}$/;
const MAX_BODY_BYTES = 8 * 1024;
const localAttempts = new Map<string, number[]>();

function json(status: number, payload: unknown): Response {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isDuplicate(message: string): boolean {
  return /already.*registered|already.*exists|duplicate key|user already|email_exists/i.test(message);
}

function getUpstreamMessage(value: Record<string, unknown>): string {
  return [value.code, value.error_code, value.error, value.msg, value.message, value.error_description]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .slice(0, 700);
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => ({})) as unknown;
  return { response, body };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function checkLocalRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const attempts = (localAttempts.get(ip) ?? []).filter((time) => time > windowStart);
  if (attempts.length >= 5) {
    localAttempts.set(ip, attempts);
    return false;
  }
  attempts.push(now);
  localAttempts.set(ip, attempts);
  // Bound memory in warm serverless instances.
  if (localAttempts.size > 2_000) {
    for (const [key, values] of localAttempts) {
      const fresh = values.filter((time) => time > windowStart);
      if (fresh.length) localAttempts.set(key, fresh);
      else localAttempts.delete(key);
    }
  }
  return true;
}

async function handleSignup(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) return json(403, { error: 'Cross-origin requests are not allowed.' });
    } catch {
      return json(403, { error: 'Invalid request origin.' });
    }
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return json(415, { error: 'Content-Type must be application/json.' });
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return json(413, { error: 'Request is too large.' });

  let body: { username?: unknown; password?: unknown };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(413, { error: 'Request is too large.' });
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json(400, { error: 'Invalid JSON.' });
  }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_PATTERN.test(username)) {
    return json(400, { error: 'اسم المستخدم يجب أن يكون من 3 إلى 24 حرفًا إنجليزيًا أو رقمًا، ويمكن استخدام . _ -' });
  }
  if (password.length < 8 || password.length > 72) {
    return json(400, { error: 'كلمة المرور يجب أن تكون من 8 إلى 72 حرفًا.' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json(503, { error: 'إعدادات Supabase غير مكتملة. تأكد من SUPABASE_SERVICE_ROLE_KEY وVITE_SUPABASE_ANON_KEY على Vercel.' });
  }

  const forwarded = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for'))?.split(',')[0]?.trim();
  const clientIp = forwarded || request.headers.get('x-real-ip') || 'unknown-client';
  if (!checkLocalRateLimit(clientIp)) return json(429, { error: 'تم الوصول للحد المؤقت لإنشاء الحسابات. حاول مرة أخرى بعد ساعة.' });

  // Best-effort distributed throttle. It is deliberately time-bounded so a slow
  // PostgREST/RPC call cannot consume the whole Vercel function execution window.
  const fingerprint = await sha256(`${process.env.AUTH_RATE_LIMIT_SALT || supabaseUrl}:${clientIp}`);
  try {
    const quota = await fetchJson(`${supabaseUrl}/rest/v1/rpc/consume_username_signup_slot`, {
      method: 'POST',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_fingerprint: fingerprint, p_limit: 5, p_window_seconds: 3600 }),
    }, 900);
    if (quota.response.ok && quota.body === false) {
      return json(429, { error: 'تم الوصول للحد المؤقت لإنشاء الحسابات. حاول مرة أخرى بعد ساعة.' });
    }
    if (!quota.response.ok) console.warn('[auth signup] distributed quota unavailable; local throttle remains active:', quota.response.status);
  } catch (error) {
    console.warn('[auth signup] distributed quota timed out; local throttle remains active:', error instanceof Error ? error.message : 'unknown');
  }

  const email = `${username}@accounts.nexus.invalid`;
  const adminUrl = `${supabaseUrl}/auth/v1/admin/users`;
  let createStatus = 0;
  let createMessage = '';
  try {
    const created = await fetchJson(adminUrl, {
      method: 'POST',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username, login_method: 'username_password' } }),
    }, 3_500);
    createStatus = created.response.status;
    createMessage = getUpstreamMessage(asRecord(created.body));
    if (!created.response.ok && !isDuplicate(createMessage)) {
      console.error('[auth signup] Admin REST createUser failed:', { status: createStatus, message: createMessage });
      const message = createStatus === 401 || createStatus === 403
        ? 'مفتاح Supabase السري غير صحيح. راجع SUPABASE_SERVICE_ROLE_KEY في Vercel.'
        : createStatus === 404
          ? 'رابط مشروع Supabase غير صحيح. راجع SUPABASE_URL.'
          : createStatus === 429
            ? 'خدمة الحسابات مشغولة مؤقتًا. حاول لاحقًا.'
            : /weak_password|password.*(weak|short)|should be at least/i.test(createMessage)
              ? 'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل.'
              : 'تعذر إنشاء الحساب من Supabase. راجع سجل api/auth/signup في Vercel.';
      return json(createStatus >= 500 ? 502 : createStatus === 429 ? 429 : 400, { error: message });
    }
  } catch (error) {
    console.error('[auth signup] Admin REST request timed out/failed:', error instanceof Error ? error.message : error);
    return json(504, { error: 'تأخر رد خدمة الحسابات. لم نتمكن من تأكيد إنشاء الحساب؛ جرّب تسجيل الدخول بنفس اسم المستخدم قبل محاولة إنشاء الحساب مرة أخرى.' });
  }

  // Authenticate immediately and return a regular Supabase session. This also
  // makes retries idempotent: if the prior request created the user but timed
  // out before responding, the same username/password can recover the session.
  try {
    const login = await fetchJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }, 3_000);
    if (!login.response.ok) {
      const message = getUpstreamMessage(asRecord(login.body));
      console.error('[auth signup] post-create password grant failed:', { status: login.response.status, message, createStatus });
      if (isDuplicate(createMessage) && login.response.status === 400) {
        return json(409, { error: 'اسم المستخدم موجود بالفعل، لكن كلمة المرور غير صحيحة.' });
      }
      return json(502, { error: 'تم إنشاء الحساب، لكن تعذر فتح الجلسة تلقائيًا. جرّب تسجيل الدخول بنفس اسم المستخدم وكلمة المرور.' });
    }
    const session = asRecord(login.body);
    if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') {
      return json(502, { error: 'تم إنشاء الحساب، لكن Supabase لم يُرجع جلسة صالحة. جرّب تسجيل الدخول.' });
    }
    return json(201, {
      ok: true,
      user: session.user ?? { username },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    });
  } catch (error) {
    console.error('[auth signup] password grant timed out/failed:', error instanceof Error ? error.message : error);
    return json(504, { error: 'تم إنشاء الحساب، لكن تأخر فتح الجلسة. جرّب تسجيل الدخول بنفس البيانات؛ لا تنشئ حسابًا جديدًا.' });
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    return await handleSignup(request);
  } catch (error) {
    console.error('[auth signup] Unhandled signup failure:', error);
    return json(500, { error: 'حدث خطأ غير متوقع أثناء إنشاء الحساب. راجع سجلات api/auth/signup في Vercel.' });
  }
}
