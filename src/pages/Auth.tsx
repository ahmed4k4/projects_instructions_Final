import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
      toast.error('Could not send the link', { description: error });
      return;
    }
    setSent(true);
    toast.success('Check your inbox', { description: `We sent a sign-in link to ${email.trim()}.` });
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
              <h1 className="text-xl font-semibold tracking-tight">Accounts need Supabase</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Add{' '}
                <code className="rounded bg-surface-inset px-1 py-0.5 font-mono text-xs">
                  VITE_SUPABASE_URL
                </code>{' '}
                and{' '}
                <code className="rounded bg-surface-inset px-1 py-0.5 font-mono text-xs">
                  VITE_SUPABASE_ANON_KEY
                </code>{' '}
                to <code className="rounded bg-surface-inset px-1 py-0.5 font-mono text-xs">.env.local</code>{' '}
                to enable sign-in and saving.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/builder')}>
                <ArrowLeft /> Back to the builder
              </Button>
            </div>
          ) : sent ? (
            <div className="space-y-3">
              <span className="grid size-11 place-items-center rounded-xl border border-success/25 bg-success/10 text-success">
                <Mail className="size-5" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">Please check your inbox</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                We sent a sign-in link to <span className="text-foreground">{email}</span>. Open it on this
                device — it expires after an hour.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Sign in to Nexus</h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Save builds, publish to the community and chat with the advisor.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <Button type="submit" className="w-full" disabled={sending || !email.trim()}>
                {sending ? <Loader2 className="animate-spin" /> : <Mail />}
                {sending ? 'Sending link…' : 'Email me a sign-in link'}
              </Button>

              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                Passwordless. The link signs you in once and is valid for one hour.
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
