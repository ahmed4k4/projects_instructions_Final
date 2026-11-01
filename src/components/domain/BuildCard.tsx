import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Cpu, Star, Zap } from 'lucide-react';
import type { SampleBuild } from '@/lib/sampleData';
import { CATEGORY_MAP, USE_CASE_MAP } from '@/lib/constants';
import type { UseCase } from '@/types/build';
import { cn, formatCurrency, formatWatts } from '@/lib/utils';
import { staggerItem } from '@/lib/motion';
import { Badge } from '@/components/ui/badge';
import { BuildScoreRing } from './BuildScoreRing';

interface BuildCardProps {
  build: SampleBuild;
  rating?: { avg: number; count: number };
  className?: string;
}

/** Shared card for prebuilt + dashboard + community grids. */
export function BuildCard({ build, rating, className }: BuildCardProps) {
  const useCase = USE_CASE_MAP[build.useCase as UseCase];
  const gpuId = build.componentIds.find((id) => id.startsWith('gpu-'));
  const cpuId = build.componentIds.find((id) => id.startsWith('cpu-'));

  return (
    <motion.article variants={staggerItem} className={cn('group relative', className)}>
      <Link
        to={`/b/${build.slug}`}
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card',
          'transition-[transform,border-color,box-shadow] duration-300 ease-nexus',
          'hover:-translate-y-1 hover:border-primary/30 hover:shadow-glow-sm',
        )}
      >
        {/* Visual header: gradient + component glyphs instead of stock imagery */}
        <div className="relative h-32 overflow-hidden border-b border-border bg-gradient-to-br from-primary/15 via-surface to-accent/10">
          <div className="absolute inset-0 grid-overlay opacity-70" />
          <div className="absolute -end-6 -top-6 size-28 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute bottom-3 start-4 flex items-center gap-2">
            <Badge variant="primary">{useCase?.label ?? build.useCase}</Badge>
            {rating && (
              <Badge variant="default" className="gap-1">
                <Star className="size-3 fill-warning text-warning" />
                {rating.avg.toFixed(1)} ({rating.count})
              </Badge>
            )}
          </div>
          <div className="absolute bottom-3 end-4 flex gap-1.5">
            {[cpuId, gpuId].filter(Boolean).map((id) => {
              const meta = CATEGORY_MAP[id!.startsWith('gpu') ? 'gpu' : 'cpu'];
              const Icon = meta.icon;
              return (
                <span
                  key={id}
                  className="grid size-7 place-items-center rounded-md border border-border-strong bg-surface/80 text-muted-foreground backdrop-blur"
                >
                  <Icon className="size-3.5" />
                </span>
              );
            })}
          </div>
          <ArrowUpRight className="absolute end-4 top-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pe-1">
              <h3 className="truncate text-sm font-semibold">{build.name}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {build.description}
              </p>
            </div>
            <BuildScoreRing
              score={build.buildScore}
              size={56}
              strokeWidth={5}
              label="Build score"
              className="shrink-0"
            />
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
            <div>
              <div className="font-mono text-base font-medium tabular-nums">
                {formatCurrency(build.totalPrice)}
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Zap className="size-3" /> {formatWatts(build.totalPowerWatts)}
                </span>
                <span className="flex items-center gap-1">
                  <Cpu className="size-3" /> {build.componentIds.length} parts
                </span>
              </div>
            </div>
            <span className="text-xs font-medium text-primary-glow opacity-0 transition-opacity group-hover:opacity-100">
              View build →
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
