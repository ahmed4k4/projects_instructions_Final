import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/layout/Logo';
import { GradientMesh } from '@/components/shared/GradientMesh';
import { useAuth } from '@/hooks/useAuth';
import { EASE_OUT } from '@/lib/motion';

/**
 * Magic-link sign-in.
 *
 * Supabase emails a one-time link pointing back to /auth; the session is then
 * restored automatically by `onAuthStateChange`, so the page only has to submit
 * the email and (when already signed in) honour the `returnTo` intent.
 */
export default function Auth() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user, isLoading, available, signInWithMagicLink } = useAuth();

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const returnTo = params.get('returnTo') || '/dashboard';

  // Already signed in (including after returning from the email link).
  useEffect(() => {
    if (user && !isLoading) navigate(returnTo, { replace: true });
  }, [user, isLoading, navigate, returnTo]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setSending(true);
    const { error } = await signInWithMagicLink(email.trim());
    setSending(false);

    if (error) {
      toast.error(t('auth.sendError'), { description: error });
      return;
    }
    setSent(true);
    toast.success(t('auth.sentToast'), {
      description: t('auth.sentToastBody', { email: email.trim() }),
    });
  };

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-14">
      <GradientMesh intensity="subtle" />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.35, ease: EASE_OUT }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-2xl border border-border bg-surface/80 p-7 shadow-card backdrop-blur-xl">
          <Logo className="mb-6" />

          {!available ? (
            <div className="space-y-3">
              <h1 className="text-xl font-semibold tracking-tight">{t('auth.noSupabase')}</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">{t('auth.noSupabaseBody')}</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/builder')}>
                <ArrowLeft className="rtl:rotate-180" /> {t('auth.backToBuilder')}
              </Button>
            </div>
          ) : sent ? (
            <div className="space-y-3">
              <span className="grid size-11 place-items-center rounded-xl border border-success/25 bg-success/10 text-success">
                <Mail className="size-5" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">{t('auth.sentTitle')}</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t('auth.sentBody', { email })}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
                {t('auth.differentEmail')}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{t('auth.title')}</h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('auth.body')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  dir="ltr"
                />
              </div>

              <Button type="submit" className="w-full" disabled={sending || !email.trim()}>
                {sending ? <Loader2 className="animate-spin" /> : <Mail />}
                {sending ? t('auth.sending') : t('auth.sendLink')}
              </Button>

              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                {t('auth.passwordless')}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t('auth.optionalNote')}</p>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
