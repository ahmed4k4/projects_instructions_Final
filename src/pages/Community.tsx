import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, Heart, MessageCircle, Plus, Star, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BuildScoreRing } from '@/components/domain/BuildScoreRing';
import { PriceTag } from '@/components/shared/PriceTag';
import { sampleBuilds } from '@/lib/sampleData';
import { USE_CASE_MAP } from '@/lib/constants';
import type { UseCase } from '@/types/build';
import { formatCompact, formatWatts } from '@/lib/utils';
import { makeStagger, staggerItem } from '@/lib/motion';

const stagger = makeStagger(0.06, 0.05);

interface PostMeta {
  author: string;
  initials: string;
  tags: string[];
  rating: number;
  raters: number;
  views: number;
  comments: number;
  timeAgo: string;
}

const META: Record<string, PostMeta> = {
  'build-signal': {
    author: 'maya.zhou',
    initials: 'MZ',
    tags: ['4k', 'airflow', 'no-rgb'],
    rating: 4.9,
    raters: 214,
    views: 18400,
    comments: 63,
    timeAgo: '2 days ago',
  },
  'build-quantum': {
    author: 'dev.ferra',
    initials: 'DF',
    tags: ['llm', 'vram', 'silent'],
    rating: 4.8,
    raters: 132,
    views: 12200,
    comments: 41,
    timeAgo: '4 days ago',
  },
  'build-forge': {
    author: 'elliot.r',
    initials: 'ER',
    tags: ['editing', '8k-prores', 'color'],
    rating: 4.7,
    raters: 98,
    views: 8700,
    comments: 27,
    timeAgo: '1 week ago',
  },
  'build-vector': {
    author: 'nina.k',
    initials: 'NK',
    tags: ['1440p', 'value', 'first-build'],
    rating: 4.9,
    raters: 356,
    views: 31200,
    comments: 112,
    timeAgo: '3 days ago',
  },
  'build-terminal': {
    author: 'sam.iyer',
    initials: 'SI',
    tags: ['dev', 'quiet', 'itx-adjacent'],
    rating: 4.6,
    raters: 74,
    views: 6100,
    comments: 18,
    timeAgo: '5 days ago',
  },
  'build-broadcast': {
    author: 'jules.v',
    initials: 'JV',
    tags: ['streaming', 'nvenc', 'av1'],
    rating: 4.8,
    raters: 187,
    views: 15900,
    comments: 54,
    timeAgo: '6 days ago',
  },
};

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} / 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={
            index < Math.round(rating) ? 'size-3 fill-warning text-warning' : 'size-3 text-border-strong'
          }
        />
      ))}
    </span>
  );
}

export default function Community() {
  const { t } = useTranslation();

  return (
    <div className="container py-8 lg:py-10">
      <PageHeader
        eyebrow={t('nav.community')}
        title={t('community.title')}
        description={t('community.description')}
        breadcrumbs={[{ label: t('nav.workspace'), to: '/' }, { label: t('nav.community') }]}
        actions={
          <Button size="sm" asChild>
            <Link to="/dashboard">
              <Plus /> {t('community.publish')}
            </Link>
          </Button>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">
          {sampleBuilds.map((build) => {
            const meta = META[build.id];
            if (!meta) return null;
            const useCase = USE_CASE_MAP[build.useCase as UseCase];

            return (
              <motion.article
                key={build.id}
                variants={staggerItem}
                className="group rounded-xl border border-border bg-surface p-5 shadow-card transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-glow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border-strong bg-gradient-to-br from-primary/25 to-accent/15 text-xs font-semibold">
                      {meta.initials}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/b/${build.slug}`}
                          className="truncate text-sm font-semibold hover:text-primary-glow"
                        >
                          {build.name}
                        </Link>
                        <Badge variant="primary">{useCase?.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {t('community.by')}{' '}
                        <span className="text-foreground/80">@{meta.author}</span> · {meta.timeAgo}
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {build.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-end">
                      <PriceTag value={build.totalPrice} size="sm" animate={false} />
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {formatWatts(build.totalPowerWatts)}
                      </p>
                    </div>
                    <BuildScoreRing score={build.buildScore} size={52} strokeWidth={4} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {meta.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-border bg-surface-elevated/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-[11.5px] text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <StarRow rating={meta.rating} /> {meta.rating} ({meta.raters})
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="size-3.5" /> {formatCompact(meta.views)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="size-3.5" /> {meta.comments}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toast.success(t('community.save'), { description: build.name })}
                    >
                      <Heart /> {t('community.save')}
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/b/${build.slug}`}>{t('community.open')}</Link>
                    </Button>
                  </div>
                </footer>
              </motion.article>
            );
          })}
        </motion.div>

        {/* Sidebar: trends */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-accent" /> {t('community.trending')}
            </h2>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['#sff', '#4k', '#llm', '#quiet', '#av1', '#budget', '#watercooling', '#ddr5'].map(
                (tag, index) => (
                  <span
                    key={tag}
                    className={
                      index < 3
                        ? 'rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 font-mono text-[10.5px] text-accent'
                        : 'rounded-full border border-border px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground'
                    }
                  >
                    {tag}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">{t('community.guidelines')}</h2>
            <ul className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <li>{t('community.guide1')}</li>
              <li>{t('community.guide2')}</li>
              <li>{t('community.guide3')}</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
