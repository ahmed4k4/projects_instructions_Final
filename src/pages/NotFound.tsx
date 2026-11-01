import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Home, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GradientMesh } from '@/components/shared/GradientMesh';

export default function NotFound() {
  const reduce = useReducedMotion();

  return (
    <div className="relative flex min-h-[calc(100dvh-8rem)] items-center justify-center overflow-hidden px-4 py-16">
      <GradientMesh intensity="subtle" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-w-lg text-center"
      >
        <div className="relative inline-block">
          <motion.p
            className="text-gradient select-none font-mono text-[7rem] font-semibold leading-none tracking-tighter sm:text-[9rem]"
            animate={reduce ? undefined : { x: [0, -2, 2, -1, 0], opacity: [1, 0.86, 1] }}
            transition={{ duration: 0.28, repeat: Infinity, repeatDelay: 3.6 }}
          >
            404
          </motion.p>
          <motion.p
            aria-hidden
            className="pointer-events-none absolute inset-0 select-none font-mono text-[7rem] font-semibold leading-none tracking-tighter text-accent/25 sm:text-[9rem]"
            animate={reduce ? undefined : { x: [0, 2, -2, 1, 0], y: [0, -1, 1, 0] }}
            transition={{ duration: 0.28, repeat: Infinity, repeatDelay: 3.6 }}
          >
            404
          </motion.p>
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">This slot is empty</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you tried to load isn't in the parts catalogue. It may have moved, or the link was copied
          incompletely.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/">
              <Home /> Back to home
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/builder">
              <Wrench /> Open the builder
            </Link>
          </Button>
        </div>

        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Or check your dashboard
        </Link>
      </motion.div>
    </div>
  );
}
