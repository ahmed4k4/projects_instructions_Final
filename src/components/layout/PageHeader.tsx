import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { fadeUp, makeStagger } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}

const stagger = makeStagger(0.05, 0.02);

/** Animated page heading used by every route. */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <motion.header
      variants={stagger}
      initial="hidden"
      animate="visible"
      className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}
    >
      <div className="min-w-0 space-y-2">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <motion.nav variants={fadeUp} aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {crumb.to ? (
                  <Link
                    to={crumb.to}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground/80">{crumb.label}</span>
                )}
                {index < breadcrumbs.length - 1 && (
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                )}
              </span>
            ))}
          </motion.nav>
        )}

        {eyebrow && (
          <motion.p
            variants={fadeUp}
            className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-glow"
          >
            {eyebrow}
          </motion.p>
        )}

        <motion.h1 variants={fadeUp} className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </motion.h1>

        {description && (
          <motion.p variants={fadeUp} className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </motion.p>
        )}
      </div>

      {actions && (
        <motion.div variants={fadeUp} className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </motion.div>
      )}
    </motion.header>
  );
}
