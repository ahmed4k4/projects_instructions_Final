import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, CircuitBoard, Cpu, HardDrive, Loader2, LogIn, MemoryStick, ShieldCheck, UserPlus, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/hooks/useAuth';
import { EASE_OUT } from '@/lib/motion';

const hardware = [
  { icon: Cpu, code: '01', name: 'PROCESSOR', detail: 'Compute core' },
  { icon: CircuitBoard, code: '02', name: 'GRAPHICS', detail: 'Visual engine' },
  { icon: MemoryStick, code: '03', name: 'MEMORY', detail: 'Fast access' },
  { icon: HardDrive, code: '04', name: 'STORAGE', detail: 'Your data' },
];

export default function Auth() {
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user, isLoading, available, signInWithPassword, signUpWithPassword } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const returnTo = params.get('returnTo') || '/dashboard';

  useEffect(() => { if (user && !isLoading) navigate(returnTo, { replace: true }); }, [user, isLoading, navigate, returnTo]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || password.length < 8 || busy) return;
    setBusy(true);
    try {
      const result = mode === 'login'
        ? await signInWithPassword(username, password)
        : await signUpWithPassword(username, password);
      if (result.error) {
        toast.error(ar ? 'تعذر إتمام العملية' : 'Could not complete the request', { description: result.error });
        return;
      }
      if (mode === 'signup' && 'needsConfirmation' in result && result.needsConfirmation) {
        setConfirmation(true);
        return;
      }
      toast.success(ar ? (mode === 'login' ? 'أهلًا بعودتك' : 'تم إنشاء حسابك') : (mode === 'login' ? 'Welcome back' : 'Account created'));
      navigate(returnTo, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rigpilot-workbench relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-8 sm:px-6 lg:py-14">
      <div aria-hidden className="pointer-events-none absolute -start-32 top-10 size-80 rounded-full bg-primary/10 blur-[100px]" />
      <div aria-hidden className="pointer-events-none absolute -end-28 bottom-0 size-96 rounded-full bg-secondary/10 blur-[110px]" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.45, ease: EASE_OUT }}
        className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border-strong bg-surface/90 shadow-[0_36px_100px_-44px_rgba(0,0,0,0.85)] backdrop-blur-2xl lg:grid-cols-[1.04fr_0.96fr]"
      >
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden border-e border-border bg-[linear-gradient(150deg,rgb(var(--surface-elevated)),rgb(var(--surface-inset)))] p-9 lg:flex xl:p-12">
          <div aria-hidden className="absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)', backgroundSize: '32px 32px', maskImage: 'linear-gradient(to bottom, black, transparent 92%)' }} />
          <div aria-hidden className="absolute -end-20 top-28 size-80 rounded-full border border-primary/20" />
          <div aria-hidden className="absolute -end-8 top-40 size-56 rounded-full border border-secondary/20" />
          <div className="relative z-10"><Logo /></div>

          <div className="relative z-10">
            <div className="mb-5 flex items-center gap-2 text-primary-glow">
              <span className="h-px w-8 bg-primary" />
              <span className="technical-kicker">RIGPILOT / BUILD SYSTEM</span>
            </div>
            <h2 className="max-w-md text-4xl font-bold leading-[1.16] tracking-tight xl:text-5xl">
              {ar ? <>كل مكوّن له دور.<br /><span className="text-gradient">كل تجميعة لها هدف.</span></> : <>Every component has a purpose.<br /><span className="text-gradient">Every build has a goal.</span></>}
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
              {ar ? 'مساحة واحدة لاختيار المكونات، وفحص التوافق، وموازنة الأداء والميزانية قبل ما تشتري.' : 'One workspace to select components, validate compatibility, and balance performance with budget before you buy.'}
            </p>

            <div className="hardware-panel relative mt-9 overflow-hidden rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="technical-kicker">SYSTEM BLUEPRINT</span>
                <span className="flex items-center gap-1.5 text-[10px] text-success"><span className="size-1.5 rounded-full bg-success shadow-[0_0_12px_rgb(var(--success))]" /> {ar ? 'جاهز للتجميع' : 'BUILD READY'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {hardware.map(({ icon: Icon, code, name, detail }) => (
                  <div key={code} className="rounded-xl border border-border bg-background/45 p-3">
                    <div className="flex items-center justify-between"><Icon className="size-4 text-primary-glow" /><span className="font-mono text-[9px] text-muted-foreground">{code}</span></div>
                    <p className="mt-3 font-mono text-[10px] font-semibold tracking-wider">{name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-[10px] text-accent">
                <Zap className="size-3.5" /> {ar ? 'التوافق والأداء قبل قرار الشراء' : 'Compatibility and performance before purchase'}
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>ENGINEERED FOR YOUR NEXT BUILD</span><span className="font-mono">NX / 01</span>
          </div>
        </section>

        <section className="relative flex flex-col justify-center p-6 sm:p-9 xl:p-12">
          <div className="mb-8 flex items-center justify-between lg:hidden"><Logo /><span className="technical-kicker">BUILD WITH CONFIDENCE</span></div>
          {!available ? (
            <div className="space-y-4">
              <div className="grid size-12 place-items-center rounded-2xl border border-warning/20 bg-warning/10 text-warning"><ShieldCheck /></div>
              <h1 className="text-2xl font-bold">{ar ? 'الحسابات غير مفعّلة حاليًا' : 'Accounts are not configured'}</h1>
              <p className="text-sm leading-7 text-muted-foreground">{ar ? 'تقدر تستخدم أدوات بناء الكمبيوتر والبحث والمقارنة كزائر بدون حساب.' : 'You can use the PC builder, search and comparison tools as a guest.'}</p>
            </div>
          ) : confirmation ? (
            <div className="space-y-4">
              <div className="grid size-12 place-items-center rounded-2xl border border-success/20 bg-success/10 text-success"><ShieldCheck /></div>
              <h1 className="text-2xl font-bold">{ar ? 'تم إنشاء الحساب' : 'Account created'}</h1>
              <p className="text-sm leading-7 text-muted-foreground">{ar ? 'لم يتم فتح جلسة الدخول تلقائيًا. جرّب تسجيل الدخول بنفس اسم المستخدم وكلمة المرور.' : 'The account was created but a session was not started. Sign in with the same username and password.'}</p>
              <Button variant="outline" onClick={() => { setConfirmation(false); setMode('login'); }}>{ar ? 'العودة لتسجيل الدخول' : 'Back to sign in'}</Button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <p className="technical-kicker">{mode === 'login' ? 'RIGPILOT ID / ACCESS' : 'RIGPILOT ID / CREATE'}</p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-[2.1rem]">{mode === 'login' ? (ar ? 'مرحبًا بعودتك' : 'Welcome back') : (ar ? 'ابدأ مساحة عملك' : 'Create your workspace')}</h1>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{ar ? 'حسابك اختياري؛ تقدر تبدأ كزائر وتحتفظ بالتجميعات محليًا.' : 'An account is optional. Start as a guest and keep builds locally.'}</p>
              </div>

              <div className="mb-6 grid grid-cols-2 rounded-xl border border-border bg-background/60 p-1">
                <button type="button" onClick={() => setMode('login')} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === 'login' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/15' : 'text-muted-foreground hover:text-foreground'}`}>{ar ? 'تسجيل الدخول' : 'Sign in'}</button>
                <button type="button" onClick={() => setMode('signup')} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === 'signup' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/15' : 'text-muted-foreground hover:text-foreground'}`}>{ar ? 'حساب جديد' : 'Create account'}</button>
              </div>

              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username">{ar ? 'اسم المستخدم' : 'Username'}</Label>
                  <Input id="username" type="text" autoComplete="username" minLength={3} maxLength={24} required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ahmed_4k4" dir="ltr" className="h-12 rounded-xl border-border-strong bg-background/65 px-4" />
                  <p className="text-[11px] text-muted-foreground">{ar ? '3–24 حرفًا إنجليزيًا أو رقمًا، مع . _ -' : '3–24 characters. English letters, numbers, dot, dash or underscore.'}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{ar ? 'كلمة المرور' : 'Password'}</Label>
                  <Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={ar ? '8 أحرف على الأقل' : 'At least 8 characters'} dir="ltr" className="h-12 rounded-xl border-border-strong bg-background/65 px-4" />
                </div>
                <Button type="submit" className="group h-12 w-full rounded-xl text-sm font-bold shadow-[0_12px_30px_-14px_rgb(var(--primary)/0.8)]" disabled={busy || !username.trim() || password.length < 8}>
                  {busy ? <Loader2 className="animate-spin" /> : mode === 'login' ? <LogIn /> : <UserPlus />}
                  {busy ? (ar ? 'جارٍ التحقق من الحساب...' : 'Verifying account...') : mode === 'login' ? (ar ? 'دخول إلى مساحة العمل' : 'Enter workspace') : (ar ? 'إنشاء الحساب' : 'Create account')}
                  {!busy && <ArrowUpRight className="ms-auto transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
                </Button>
              </form>

              <p className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-background/40 p-3 text-[11px] leading-6 text-muted-foreground">
                <ShieldCheck className="mt-1 size-4 shrink-0 text-primary-glow" />
                {ar ? 'لا نطلب بريدًا إلكترونيًا. يتم الدخول باسم المستخدم وكلمة المرور فقط.' : 'No email address is required. Sign in with your username and password.'}
              </p>
            </>
          )}

          <div className="mt-8 border-t border-border pt-5">
            <Button variant="outline" className="h-11 w-full rounded-xl border-border-strong" onClick={() => navigate(returnTo, { replace: true })}>
              <ArrowLeft className="rtl:rotate-180" />{ar ? 'المتابعة كزائر' : 'Continue as guest'}
            </Button>
            <p className="mt-3 text-center text-[10px] text-muted-foreground">{ar ? 'البناء الذكي · فحص التوافق · مقارنة الأسعار — متاحة بدون تسجيل' : 'Smart builder · Compatibility checks · Price comparison — no account required'}</p>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
