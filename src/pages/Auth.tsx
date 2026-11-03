import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Loader2, Mail, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/layout/Logo';
import { GradientMesh } from '@/components/shared/GradientMesh';
import { useAuth } from '@/hooks/useAuth';
import { EASE_OUT } from '@/lib/motion';

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
    if (!username.trim() || password.length < 8) return;
    setBusy(true);
    const result = mode === 'login'
      ? await signInWithPassword(username, password)
      : await signUpWithPassword(username, password);
    setBusy(false);
    if (result.error) { toast.error(ar ? 'تعذر إتمام العملية' : 'Could not complete the request', { description: result.error }); return; }
    if (mode === 'signup' && 'needsConfirmation' in result && result.needsConfirmation) {
      setConfirmation(true);
      toast.info(ar ? 'تعذر تفعيل الجلسة. راجع إعداد Confirm email في Supabase.' : 'No session was created. Check the Supabase Confirm email setting.');
      return;
    }
    toast.success(ar ? 'تم تسجيل الدخول' : 'Signed in successfully');
    navigate(returnTo, { replace: true });
  };

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-10">
      <GradientMesh intensity="subtle" />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }} className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border bg-surface/90 p-6 shadow-card backdrop-blur-xl sm:p-7">
          <Logo className="mb-6" />
          {!available ? (
            <div className="space-y-3">
              <h1 className="text-xl font-semibold">{ar ? 'الحسابات غير مفعّلة' : 'Accounts are not configured'}</h1>
              <p className="text-sm text-muted-foreground">{ar ? 'يمكنك استخدام كل أدوات الموقع والمستشار الذكي كزائر.' : 'You can use every feature and the AI advisor as a guest.'}</p>
            </div>
          ) : confirmation ? (
            <div className="space-y-3">
              <Mail className="size-8 text-primary" />
              <h1 className="text-xl font-semibold">{ar ? 'تم إنشاء الحساب' : 'Account created'}</h1>
              <p className="text-sm text-muted-foreground">{ar ? 'لم يتم إنشاء جلسة الدخول تلقائيًا. جرّب تسجيل الدخول مرة أخرى، وإذا استمرت المشكلة راجع إعدادات Supabase.' : 'The account was created but a session was not started. Try signing in again; if the issue continues, check Supabase settings.'}</p>
              <Button variant="outline" onClick={() => { setConfirmation(false); setMode('login'); }}>{ar ? 'العودة لتسجيل الدخول' : 'Back to sign in'}</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold">{mode === 'login' ? (ar ? 'تسجيل الدخول' : 'Sign in') : (ar ? 'إنشاء حساب' : 'Create account')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{ar ? 'الحساب اختياري. كل المميزات تعمل بدون تسجيل الدخول.' : 'An account is optional. All features work without signing in.'}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">{ar ? 'اسم المستخدم' : 'Username'}</Label>
                <Input id="username" type="text" autoComplete="username" minLength={3} maxLength={24} required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ahmed_4k4" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{ar ? 'كلمة المرور' : 'Password'}</Label>
                <Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={ar ? '8 أحرف على الأقل' : 'At least 8 characters'} dir="ltr" />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !username.trim() || password.length < 8}>
                {busy ? <Loader2 className="animate-spin" /> : mode === 'login' ? <LogIn /> : <UserPlus />}
                {busy ? (ar ? 'جارٍ التنفيذ...' : 'Please wait...') : mode === 'login' ? (ar ? 'دخول' : 'Sign in') : (ar ? 'إنشاء الحساب' : 'Create account')}
              </Button>
              <button type="button" className="w-full text-sm text-primary hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
                {mode === 'login' ? (ar ? 'ليس لديك حساب؟ أنشئ حسابًا' : 'New here? Create an account') : (ar ? 'لديك حساب بالفعل؟ سجل الدخول' : 'Already have an account? Sign in')}
              </button>
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />{ar ? 'يتم إنشاء الحساب مباشرة باسم المستخدم وكلمة المرور، بدون إرسال رسائل بريد إلكتروني.' : 'Your account is created directly with a username and password. No email is sent.'}</p>
            </form>
          )}
          <div className="mt-5 border-t border-border pt-4">
            <Button variant="outline" className="w-full" onClick={() => navigate(returnTo, { replace: true })}>
              <ArrowLeft className="rtl:rotate-180" />{ar ? 'المتابعة كزائر بدون حساب' : 'Continue as guest'}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{ar ? 'المستشار الذكي وبناء التجميعات والبحث والمقارنة متاحة للزوار.' : 'AI advisor, PC builder, search and comparison are available to guests.'}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
