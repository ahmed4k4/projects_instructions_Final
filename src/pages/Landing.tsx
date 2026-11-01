import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  ArrowRight,
  Boxes,
  BrainCircuit,
  Check,
  CircuitBoard,
  Cpu,
  Gauge,
  MemoryStick,
  MessagesSquare,
  Sparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GradientMesh } from '@/components/shared/GradientMesh';
import { Magnetic } from '@/components/shared/Magnetic';
import { ComponentName } from '@/components/shared/ComponentName';
import { PriceTag } from '@/components/shared/PriceTag';
import { fadeUp, hoverLift, makeStagger, staggerItem, viewportOnce } from '@/lib/motion';
import { sampleComponents } from '@/lib/sampleData';
import { readShareFragment, resolveSharedBuild } from '@/lib/share';
import { useBuildStore } from '@/store/useBuildStore';

/**
 * The 3D scene pulls in Three.js (~150 kB gzip). It is code-split so the hero
 * text paints immediately and the canvas fades in when its chunk lands.
 */
const Hero3DScene = lazy(() => import('@/components/scene/Hero3DScene'));

const heroStagger = makeStagger(0.08, 0.05);
const sectionStagger = makeStagger(0.07, 0.05);

interface Feature {
  icon: LucideIcon;
  titleKey: string;
  bodyKey: string;
}

const FEATURES: Feature[] = [
  { icon: Gauge, titleKey: 'landing.features.compatTitle', bodyKey: 'landing.features.compatBody' },
  { icon: BrainCircuit, titleKey: 'landing.features.aiTitle', bodyKey: 'landing.features.aiBody' },
  { icon: Boxes, titleKey: 'landing.features.catalogTitle', bodyKey: 'landing.features.catalogBody' },
  { icon: Zap, titleKey: 'landing.features.powerTitle', bodyKey: 'landing.features.powerBody' },
  { icon: MessagesSquare, titleKey: 'landing.features.askTitle', bodyKey: 'landing.features.askBody' },
  { icon: Sparkles, titleKey: 'landing.features.shareTitle', bodyKey: 'landing.features.shareBody' },
];

const STEPS = [
  { step: '01', titleKey: 'landing.step1Title', bodyKey: 'landing.step1Body' },
  { step: '02', titleKey: 'landing.step2Title', bodyKey: 'landing.step2Body' },
  { step: '03', titleKey: 'landing.step3Title', bodyKey: 'landing.step3Body' },
];

/** Scroll-linked opacity/scale for a section. */
function useScrollFade(progress: MotionValue<number>) {
  const opacity = useTransform(progress, [0, 0.55], [1, 0]);
  const scale = useTransform(progress, [0, 0.55], [1, 0.94]);
  const y = useTransform(progress, [0, 0.55], [0, 40]);
  return { opacity, scale, y };
}

/** Floating spec card with pointer-driven 3D tilt. */
function FloatingCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  className: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { scale: 1.03, transition: { duration: 0.2 } }}
      className={`glass-deep absolute w-56 rounded-xl p-4 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary-glow">
          <Icon className="size-4" />
        </span>
        <div className="leading-tight">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="font-mono text-sm font-medium">{value}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-success">
        <Check className="size-3" /> {hint}
      </div>
    </motion.div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const hydrateFromSelection = useBuildStore((state) => state.hydrateFromSelection);

  /**
   * A `#b=<payload>` link is a complete, anonymous build. Load it into the
   * store so "Start building" continues from the shared parts instead of an
   * empty list, then clean the hash so a refresh doesn't re-apply it.
   */
  useEffect(() => {
    if (!window.location.hash.includes('b=')) return;

    const payload = readShareFragment();
    if (!payload) return;

    const { selection, missing } = resolveSharedBuild(payload, sampleComponents);
    if (Object.keys(selection).length === 0) return;

    hydrateFromSelection(selection, payload.n);
    toast.success(t('builder.local.restored'), {
      description: missing.length ? t('builder.local.missing', { count: missing.length }) : payload.n,
    });
    window.history.replaceState(null, '', window.location.pathname);
    // Runs once per mounted landing page, deliberately not on every i18n change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.4 });
  const textFade = useScrollFade(smooth);
  const sceneScale = useTransform(smooth, [0, 0.6], [1, 1.15]);
  // Never fully transparent: the scene is the hero, it should only dim.
  const sceneOpacity = useTransform(smooth, [0, 0.6], [1, 0.35]);

  const featured = sampleComponents.filter((component) =>
    ['cpu-7800x3d', 'gpu-4090', 'ram-ddr5-32-6000', 'mb-x670e'].includes(component.id),
  );

  return (
    <div className="relative">
      {/* ------------------------------------------------------------------ */}
      {/* HERO                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section ref={heroRef} className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <GradientMesh />

        <div className="relative mx-auto max-w-6xl">
          <motion.div
            style={reduce ? undefined : textFade}
            className="relative z-10 mx-auto max-w-5xl text-center"
          >
            <motion.div variants={heroStagger} initial="hidden" animate="visible">
              <motion.div variants={fadeUp} className="flex justify-center">
                <Badge variant="primary" className="gap-1.5 px-3 py-1">
                  <Sparkles className="size-3" />
                  {t('landing.badge')}
                </Badge>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
              >
                {t('landing.heroLine1')}
                <span className="block text-gradient">{t('landing.heroLine2')}</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
              >
                {t('landing.heroBody')}
              </motion.p>

              <motion.div
                variants={fadeUp}
                className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Magnetic strength={10}>
                  <Button asChild size="lg" className="group w-full sm:w-auto">
                    <Link to="/builder">
                      {t('landing.startBuilding')}
                      <ArrowRight className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                    </Link>
                  </Button>
                </Magnetic>
                <Magnetic strength={8}>
                  <Button asChild size="lg" variant="glass" className="w-full sm:w-auto">
                    <Link to="/ai-advisor">
                      <Sparkles /> {t('landing.openAdvisor')}
                    </Link>
                  </Button>
                </Magnetic>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* 3D scene */}
          <motion.div
            style={reduce ? undefined : { scale: sceneScale, opacity: sceneOpacity }}
            className="relative mx-auto -mt-6 h-[340px] w-full max-w-4xl sm:h-[420px] lg:-mt-16 lg:h-[480px]"
          >
            {/* Glow sits behind the canvas, inside the same sized box. */}
            <div className="pointer-events-none absolute inset-4 -z-10 rounded-full bg-primary/20 blur-[130px]" />
            <Suspense fallback={null}>
              <Hero3DScene className="h-full w-full cursor-grab active:cursor-grabbing" />
            </Suspense>
          </motion.div>

          {/* Floating spec cards */}
          <div className="relative mx-auto mt-4 hidden h-56 max-w-5xl lg:block">
            <FloatingCard
              icon={Cpu}
              label={t('landing.floatCpu')}
              value="Ryzen 7 7800X3D"
              hint="AM5 · 120 W"
              className="left-[2%] top-4"
            />
            <FloatingCard
              icon={CircuitBoard}
              label={t('landing.floatGpu')}
              value="RTX 4090 · 24 GB"
              hint="336 mm · 450 W"
              className="right-[2%] top-0"
            />
            <FloatingCard
              icon={MemoryStick}
              label={t('landing.floatPower')}
              value="138 W"
              hint="1000 W Titanium"
              className="left-[20%] top-28"
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="glass-deep absolute bottom-0 start-1/2 w-64 -translate-x-1/2 rounded-xl border-gradient p-5 text-center shadow-glow-sm rtl:translate-x-1/2"
            >
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t('landing.floatTotal')}
              </p>
              <PriceTag value={3249} size="lg" className="mt-1 block text-foreground" />
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-success">
                <Check className="size-3" /> {t('landing.floatCompatible')}
              </div>
            </motion.div>
          </div>

          {/* Trust row */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {['landing.trust1', 'landing.trust2', 'landing.trust3', 'landing.trust4'].map((key) => (
              <span key={key} className="flex items-center gap-1.5">
                <Check className="size-3.5 text-success" />
                {t(key)}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FEATURES                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section id="features" className="relative px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={sectionStagger}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className="mx-auto max-w-2xl text-center"
          >
            <motion.p variants={fadeUp} className="text-[11px] uppercase tracking-[0.18em] text-primary-glow">
              {t('landing.featuresEyebrow')}
            </motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('landing.featuresTitle')}
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t('landing.featuresBody')}
            </motion.p>
          </motion.div>

          <motion.div
            variants={sectionStagger}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {FEATURES.map((feature) => (
              <motion.div
                key={feature.titleKey}
                variants={staggerItem}
                {...(reduce ? {} : hoverLift)}
                className="glass-card group relative overflow-hidden rounded-xl p-6 transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-glow-sm"
              >
                <div className="absolute -end-10 -top-10 size-32 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <span className="relative grid size-10 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary-glow">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="relative mt-5 text-sm font-semibold">{t(feature.titleKey)}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(feature.bodyKey)}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* HOW IT WORKS                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div
            variants={sectionStagger}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className="max-w-2xl"
          >
            <motion.p variants={fadeUp} className="text-[11px] uppercase tracking-[0.18em] text-primary-glow">
              {t('landing.stepsEyebrow')}
            </motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('landing.stepsTitle')}
            </motion.h2>
          </motion.div>

          <motion.ol
            variants={sectionStagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="relative mt-14 grid gap-8 md:grid-cols-3"
          >
            <div className="absolute start-0 end-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent md:block" />
            {STEPS.map((item) => (
              <motion.li key={item.step} variants={staggerItem} className="relative">
                <div className="relative z-10 grid size-12 place-items-center rounded-xl border border-border-strong bg-surface font-mono text-sm text-primary-glow shadow-card">
                  {item.step}
                </div>
                <h3 className="mt-5 text-base font-semibold">{t(item.titleKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(item.bodyKey)}</p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* COMPONENT PREVIEW                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            variants={sectionStagger}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className="flex flex-wrap items-end justify-between gap-4"
          >
            <motion.div variants={fadeUp}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary-glow">
                {t('landing.catalogEyebrow')}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {t('landing.catalogTitle2')}
              </h2>
            </motion.div>
            <motion.div variants={fadeUp}>
              <Button asChild variant="ghost" size="sm">
                <Link to="/builder">
                  {t('landing.browseAll')} <ArrowRight className="rtl:rotate-180" />
                </Link>
              </Button>
            </motion.div>
          </motion.div>

          <motion.div
            variants={sectionStagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {featured.map((component) => (
              <motion.div
                key={component.id}
                variants={staggerItem}
                className="glass-card rounded-xl p-4 transition-colors duration-300 hover:border-primary/30"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t(`categories.${component.category}`)}
                </p>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm font-medium leading-snug">
                  <ComponentName component={component} />
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <PriceTag value={component.price} size="sm" animate={false} />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {t('builder.specs.score', { value: component.performanceScore })}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FINAL CTA                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative px-4 py-24 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border border-primary/25 bg-surface p-10 text-center shadow-[0_0_80px_-30px_rgba(99,102,241,0.55)] sm:p-16"
        >
          <div className="absolute inset-0 grid-overlay opacity-50" />
          <div className="absolute -start-20 -top-20 size-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-24 -end-16 size-64 rounded-full bg-accent/15 blur-3xl" />

          <div className="relative">
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('landing.ctaTitle')}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {t('landing.ctaBody')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Magnetic strength={10}>
                <Button asChild size="lg" className="group w-full sm:w-auto">
                  <Link to="/builder">
                    {t('landing.ctaPrimary')}
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                  </Link>
                </Button>
              </Magnetic>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link to="/prebuilt">{t('landing.ctaSecondary')}</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
