import { useRef, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GradientMesh } from '@/components/shared/GradientMesh';
import { PriceTag } from '@/components/shared/PriceTag';
import { fadeUp, hoverLift, makeStagger, staggerItem, viewportOnce } from '@/lib/motion';
import { sampleComponents } from '@/lib/sampleData';

const heroStagger = makeStagger(0.08, 0.05);
const sectionStagger = makeStagger(0.07, 0.05);

const FEATURES = [
  {
    icon: Gauge,
    title: 'Compatibility engine',
    description:
      'Sockets, RAM types, GPU clearance, PSU headroom and cooler height are verified as you pick — no surprise reddit threads.',
    tone: 'primary',
  },
  {
    icon: BrainCircuit,
    title: 'Gemini build advisor',
    description:
      'Describe your budget and workload in plain language. Get a coherent parts list with the reasoning behind every pick.',
    tone: 'accent',
  },
  {
    icon: Boxes,
    title: '32 curators-grade parts',
    description: 'A curated catalogue with real TDPs, lengths and chipset data — not scraped marketing copy.',
    tone: 'secondary',
  },
  {
    icon: Zap,
    title: 'Live power budget',
    description:
      'Every component contributes its draw. See total watts and the PSU headroom you actually have left.',
    tone: 'warning',
  },
  {
    icon: MessagesSquare,
    title: 'Ask follow-ups',
    description: '“Is 32 GB enough for Unreal?” — the advisor knows your exact build and answers in context.',
    tone: 'success',
  },
  {
    icon: Sparkles,
    title: 'Shareable build pages',
    description: 'Every build gets a clean, linkable page at /b/:slug so friends can review the spec sheet.',
    tone: 'primary',
  },
] as const;

const STEPS = [
  {
    step: '01',
    title: 'Set your target',
    body: 'Budget, resolution and the workload that matters — gaming, AI, editing, or all three.',
  },
  {
    step: '02',
    title: 'Parts are verified',
    body: 'The engine scores every pick against your other components and rebuilds the totals live.',
  },
  {
    step: '03',
    title: 'Buy with confidence',
    body: 'Export a share link, compare store prices, and keep the spec sheet handy for your first boot.',
  },
];

/** Floating hero card with pointer-driven 3D tilt. */
function FloatingCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
  delay,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  hint: string;
  className: string;
  delay: number;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], ['8deg', '-8deg']), { stiffness: 180, damping: 18 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], ['-10deg', '10deg']), {
    stiffness: 180,
    damping: 18,
  });

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      className={`glass absolute w-56 rounded-xl p-4 shadow-card will-change-transform ${className}`}
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
  const heroRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const featured = sampleComponents
    .filter((component) => ['cpu-7800x3d', 'gpu-4090', 'ram-ddr5-32-6000', 'mb-x670e'].includes(component.id))
    .slice(0, 4);

  return (
    <div className="relative">
      {/* ------------------------------------------------------------------ */}
      {/* HERO                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section ref={heroRef} className="relative overflow-hidden px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
        <GradientMesh />

        <motion.div
          variants={heroStagger}
          initial="hidden"
          animate="visible"
          className="relative mx-auto max-w-5xl text-center"
        >
          <motion.div variants={fadeUp} className="flex justify-center">
            <Badge variant="primary" className="gap-1.5 px-3 py-1">
              <Sparkles className="size-3" />
              Phase 1 · design system + architecture live
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          >
            Build a PC that actually
            <span className="block text-gradient">makes sense.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Nexus checks every socket, watt and millimetre while you choose — then hands the whole build to
            Gemini for an honest second opinion. No guesswork, no incompatible carts.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg" className="group w-full sm:w-auto">
              <Link to="/builder">
                Start building
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="glass" className="w-full sm:w-auto">
              <Link to="/ai-advisor">
                <Sparkles /> Open AI advisor
              </Link>
            </Button>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
          >
            {[
              '32 verified components',
              '8 categories',
              'Real TDP & clearance data',
              'Free while in preview',
            ].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <Check className="size-3.5 text-success" />
                {item}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Floating spec cards */}
        <div className="relative mx-auto mt-20 hidden h-64 max-w-6xl md:block">
          <div className="absolute inset-0 grid-overlay opacity-40" />
          <FloatingCard
            icon={Cpu}
            label="Processor"
            value="Ryzen 7 7800X3D"
            hint="Socket AM5 matched"
            className="left-[4%] top-2"
            delay={0.35}
          />
          <FloatingCard
            icon={CircuitBoard}
            label="Graphics"
            value="RTX 4090 · 24 GB"
            hint="336 mm fits the O11"
            className="right-[4%] top-0"
            delay={0.45}
          />
          <FloatingCard
            icon={MemoryStick}
            label="Power headroom"
            value="138 W spare"
            hint="1000 W Titanium PSU"
            className="left-[22%] top-32"
            delay={0.55}
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="glass absolute bottom-0 start-1/2 w-64 -translate-x-1/2 rounded-xl border-gradient p-5 text-center shadow-glow-sm"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Estimated total</p>
            <PriceTag value={3249} size="lg" className="mt-1 block text-foreground" />
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-success">
              <Check className="size-3" /> All 8 parts compatible
            </div>
          </motion.div>
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
              Why Nexus
            </motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything a first-time builder wishes they had
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Built by the same logic that catches expensive mistakes before checkout — then explained in
              plain English.
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
                key={feature.title}
                variants={staggerItem}
                {...(reduce ? {} : hoverLift)}
                className="group relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-card transition-[border-color,box-shadow] duration-300 hover:border-primary/25 hover:shadow-glow-sm"
              >
                <div className="absolute -end-10 -top-10 size-32 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <span className="relative grid size-10 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary-glow">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="relative mt-5 text-sm font-semibold">{feature.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
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
              How it works
            </motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Three steps from budget to boot
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
                <h3 className="mt-5 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
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
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary-glow">Catalogue</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Parts with real numbers
              </h2>
            </motion.div>
            <motion.div variants={fadeUp}>
              <Button asChild variant="ghost" size="sm">
                <Link to="/builder">
                  Browse all <ArrowRight />
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
                className="rounded-xl border border-border bg-surface/70 p-4 transition-colors duration-300 hover:border-primary/25"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {component.category}
                </p>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm font-medium leading-snug">
                  {component.name}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <PriceTag value={component.price} size="sm" animate={false} />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    score {component.performanceScore}
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
              Your next build is 8 parts away.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Start from an empty list or let the advisor draft one from your budget. Nothing is saved to a
              server until you ask for it.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group w-full sm:w-auto">
                <Link to="/builder">
                  Open the builder
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link to="/prebuilt">See prebuilt configs</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
