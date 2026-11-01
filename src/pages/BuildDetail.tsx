import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Copy, Layers, Pencil, Share2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { BuildScoreRing } from '@/components/domain/BuildScoreRing';
import { CategoryIcon } from '@/components/domain/CategoryIcon';
import { CompatibilityBadge } from '@/components/domain/CompatibilityBadge';
import { PriceTag } from '@/components/shared/PriceTag';
import { ComponentName } from '@/components/shared/ComponentName';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CATEGORY_MAP, SCORE_LABELS, USE_CASE_MAP } from '@/lib/constants';
import { BUILD_ORDER } from '@/lib/navigation';
import { sampleBuilds, resolveSampleBuild } from '@/lib/sampleData';
import type { UseCase } from '@/types/build';
import { formatCurrency, formatSpecValue, formatWatts } from '@/lib/utils';
import { makeStagger, staggerItem } from '@/lib/motion';
import { useBuildStore } from '@/store/useBuildStore';

const stagger = makeStagger(0.05, 0.05);

export default function BuildDetail() {
  const { slug } = useParams<{ slug: string }>();
  const build = sampleBuilds.find((item) => item.slug === slug);
  const hydrate = useBuildStore((state) => state.hydrateFromSelection);
  const [copied, setCopied] = useState(false);

  if (!build) {
    return (
      <div className="container py-16">
        <EmptyState
          icon={Layers}
          title="That build page doesn't exist"
          description={`No saved build matches “${slug}”. It may be private or the link is incomplete.`}
          actionLabel="Browse prebuilt builds"
          onAction={() => window.location.assign('/prebuilt')}
        />
      </div>
    );
  }

  const components = resolveSampleBuild(build);
  const useCase = USE_CASE_MAP[build.useCase as UseCase];
  const shareUrl = `${window.location.origin}/b/${build.slug}`;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Share link copied', { description: shareUrl });
    } catch {
      toast.error('Could not copy the link', { description: 'Your browser blocked clipboard access.' });
    }
  };

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow={useCase?.label}
        title={build.name}
        description={build.description}
        breadcrumbs={[
          { label: 'Workspace', to: '/' },
          { label: 'Builds', to: '/prebuilt' },
          { label: build.name },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={copyShareLink}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy share link'}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                hydrate(
                  Object.fromEntries(components.map((component) => [component.category, component])),
                  build.name,
                );
                toast.success('Loaded into the builder', {
                  description: 'Swap any part and totals update live.',
                });
                window.location.assign('/builder');
              }}
            >
              <Pencil /> Customise build
            </Button>
          </>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Component list grouped by category */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-3">
          {BUILD_ORDER.map((category) => {
            const component = components.find((item) => item.category === category);
            if (!component) return null;
            const meta = CATEGORY_MAP[category];
            const specs = Object.entries(component.specs).slice(0, 4);

            return (
              <motion.div key={category} variants={staggerItem}>
                <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <CategoryIcon category={category} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {meta.label}
                      </span>
                      <CompatibilityBadge status="ok" label="Verified fit" />
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold">
                      <ComponentName component={component} />
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {specs.map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded border border-border bg-surface-elevated/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {key}: {formatSpecValue(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <PriceTag value={component.price} size="sm" animate={false} className="sm:text-end" />
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Score breakdown */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Overall</p>
                <p className="mt-1 text-sm font-semibold">Build score</p>
              </div>
              <BuildScoreRing score={build.buildScore} size={88} strokeWidth={6} />
            </div>

            <dl className="mt-6 space-y-3">
              {Object.entries(build.scoreBreakdown).map(([key, value]) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <dt className="text-muted-foreground">{SCORE_LABELS[key] ?? key}</dt>
                    <dd className="font-mono">{value}</dd>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-elevated">
                    <motion.div
                      className="h-full rounded-full bg-primary-gradient"
                      initial={{ width: 0 }}
                      animate={{ width: `${value}%` }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-6">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Totals</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Price</span>
                <PriceTag value={build.totalPrice} size="sm" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Peak draw</span>
                <span className="flex items-center gap-1 font-mono text-xs">
                  <Zap className="size-3 text-warning" /> {formatWatts(build.totalPowerWatts)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Parts</span>
                <span className="font-mono text-xs">{components.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Est. build time</span>
                <span className="font-mono text-xs">~2 h</span>
              </div>
            </div>
          </Card>

          <div className="rounded-xl border border-dashed border-border-strong p-4">
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Share2 className="size-3.5" />
              Anyone with this link can view the spec sheet. Prices reflect {formatCurrency(
                build.totalPrice,
              )}{' '}
              at publish time.
            </p>
          </div>

          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/prebuilt">← Back to prebuilt builds</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
