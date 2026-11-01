import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BellRing, Gauge, Layers, Plus, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BuildCard } from '@/components/domain/BuildCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { AnimatedNumber } from '@/components/shared/AnimatedNumber';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { sampleBuilds } from '@/lib/sampleData';
import { useBuildStore, useBuildTotals } from '@/store/useBuildStore';
import { formatCurrency } from '@/lib/utils';
import { makeStagger, staggerItem } from '@/lib/motion';

const stagger = makeStagger(0.07, 0.05);

const myBuilds = sampleBuilds.slice(0, 3);

export default function Dashboard() {
  const navigate = useNavigate();
  const totals = useBuildTotals();
  const activeName = useBuildStore((state) => state.buildName);
  const budget = useBuildStore((state) => state.budget);

  const averageScore = Math.round(
    myBuilds.reduce((sum, build) => sum + build.buildScore, 0) / Math.max(1, myBuilds.length),
  );

  const stats = [
    {
      label: 'Saved builds',
      value: myBuilds.length,
      suffix: '',
      icon: Layers,
      hint: '+1 draft in progress',
    },
    {
      label: 'Average score',
      value: averageScore,
      suffix: '/100',
      icon: Gauge,
      hint: 'Across saved builds',
    },
    {
      label: 'Active alerts',
      value: 4,
      suffix: '',
      icon: BellRing,
      hint: '2 price drops watched',
    },
    {
      label: 'Workspace spend',
      value: totals.totalPrice,
      suffix: '',
      icon: Wrench,
      hint: `of ${formatCurrency(budget)} budget`,
      format: (value: number) => formatCurrency(value),
    },
  ];

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow="Dashboard"
        title="Your build workspace"
        description="Saved builds, live scores and price alerts in one place. Everything here is local until you sign in."
        breadcrumbs={[{ label: 'Workspace', to: '/' }, { label: 'Dashboard' }]}
        actions={
          <Button size="sm" onClick={() => navigate('/builder')}>
            <Plus /> New build
          </Button>
        }
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <motion.div key={stat.label} variants={staggerItem}>
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <span className="grid size-9 place-items-center rounded-lg border border-border bg-surface-elevated text-primary-glow">
                  <stat.icon className="size-4" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Live</span>
              </div>
              <div className="mt-5 flex items-baseline gap-1">
                <AnimatedNumber
                  value={stat.value}
                  format={stat.format}
                  className="text-2xl font-semibold text-foreground"
                />
                <span className="font-mono text-xs text-muted-foreground">{stat.suffix}</span>
              </div>
              <p className="mt-1 text-xs font-medium">{stat.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.hint}</p>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* In-progress build */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        className="mt-6 overflow-hidden rounded-xl border border-primary/20 bg-surface p-5 shadow-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-primary-glow">In progress</p>
            <p className="mt-1 truncate text-sm font-semibold">{activeName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {totals.itemCount === 0
                ? `Empty draft · ${formatCurrency(budget)} budget`
                : `${totals.itemCount} parts selected · ${formatCurrency(totals.totalPrice)} of ${formatCurrency(budget)}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-elevated">
                <motion.div
                  className="h-full rounded-full bg-primary-gradient"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (totals.itemCount / 8) * 100)}%` }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">{totals.itemCount}/8</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/builder')}>
              Resume <Wrench />
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">My builds</h2>
          <span className="font-mono text-[11px] text-muted-foreground">{myBuilds.length} saved</span>
        </div>

        {myBuilds.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Wrench}
            title="No builds yet"
            description="Start from an empty list or ask the advisor to draft one from your budget."
            actionLabel="Open the builder"
            onAction={() => navigate('/builder')}
          />
        ) : (
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {myBuilds.map((build) => (
              <BuildCard key={build.id} build={build} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
