import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Layers, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BuildCard } from '@/components/domain/BuildCard';
import { Button } from '@/components/ui/button';
import { PREBUILT_FILTERS } from '@/lib/navigation';
import { sampleBuilds } from '@/lib/sampleData';
import { spring, makeStagger } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { UseCase } from '@/types/build';

const stagger = makeStagger(0.07, 0.05);

export default function PrebuiltConfigs() {
  const [filter, setFilter] = useState<(typeof PREBUILT_FILTERS)[number]['id']>('all');

  const builds = useMemo(
    () =>
      filter === 'all' ? sampleBuilds : sampleBuilds.filter((build) => build.useCase === (filter as UseCase)),
    [filter],
  );

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow="Prebuilt"
        title="Configurations that ship unchanged"
        description="Six opinionated builds, each verified against the compatibility rules. Start from one and swap a part — totals update instantly."
        breadcrumbs={[{ label: 'Workspace', to: '/' }, { label: 'Prebuilt' }]}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/builder">
              Start from scratch <ArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="mt-8 flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface/60 p-1 no-scrollbar">
        {PREBUILT_FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                'relative shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId="prebuilt-filter-indicator"
                  className="absolute inset-0 rounded-lg border border-border-strong bg-surface-elevated"
                  transition={spring}
                />
              )}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </div>

      {builds.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border-strong p-16 text-center">
          <Layers className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium">No configuration in this category yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The catalogue grows every release — try “All builds”.
          </p>
        </div>
      ) : (
        <motion.div
          key={filter}
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          {builds.map((build) => (
            <BuildCard key={build.id} build={build} />
          ))}
        </motion.div>
      )}

      <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/20 bg-surface/60 p-6 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary-glow">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Nothing quite fits?</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Give the advisor your budget and workload — it drafts a list you can edit part by part.
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to="/ai-advisor">Generate a build</Link>
        </Button>
      </div>
    </div>
  );
}
