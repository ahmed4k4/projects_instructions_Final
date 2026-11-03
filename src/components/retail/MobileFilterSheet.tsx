import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';

/**
 * Mobile filter sheet.
 *
 * A tall filter list cannot live in an expanding accordion: once it opens, the
 * results it is meant to refine are pushed off screen, so the user edits
 * filters blind. A bottom sheet keeps the grid in place behind a scrim, which is
 * the pattern every shopping app uses on a phone.
 *
 * Behaviour that makes it feel native rather than a div that appears:
 *   · slides up from the bottom edge with a spring-free tween (a spring here
 *     overshoots and clips against the viewport)
 *   · drag down to dismiss, released past 120 px
 *   · backdrop tap, Escape, and the close button all dismiss
 *   · body scroll is locked while open, so the page behind does not creep
 *   · `pointer-events: none` once closing, so a tap during the exit animation
 *     cannot land on the dismissed sheet
 *   · respects `prefers-reduced-motion` (no slide, no scrim fade)
 */
export interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  /** Applied live as filters change; the sheet stays open for comparison. */
  children: React.ReactNode;
}

export function MobileFilterSheet({ open, onClose, children }: MobileFilterSheetProps) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  // Scroll lock + Escape. One effect, cleaned up together.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="filter-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={onClose}
            aria-hidden
            className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm md:hidden"
          />

          <motion.div
            key="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('search.filtersTitle')}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={reduce ? { duration: 0 } : { duration: 0.28, ease: EASE_OUT }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              // Released a real distance downward, or flung: dismiss.
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            style={{ pointerEvents: open ? 'auto' : 'none' }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-hidden rounded-t-2xl border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {/* Grab handle: signals draggability and gives the drag a target. */}
            <div className="flex cursor-grab justify-center py-2.5 active:cursor-grabbing">
              <span className="h-1 w-10 rounded-full bg-border-strong" aria-hidden />
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
              <h2 className="text-sm font-semibold">{t('search.filtersTitle')}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-[70dvh] overflow-y-auto px-4 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default MobileFilterSheet;
