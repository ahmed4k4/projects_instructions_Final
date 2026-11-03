import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Numbered pagination for the search grid.
 *
 * Why numbers instead of infinite scroll: a shopper comparing prices wants to
 * know how deep the list goes and to jump back to page 2, and `?page=3` is a
 * state they can bookmark or send to someone. Requirements this satisfies:
 *
 *   · **Bounded window** — at most seven buttons, so 40 pages never overflow a
 *     phone. The first and last page are always reachable.
 *   · **Keyboard/screen-reader parity** — real `<button>`s with `aria-current`,
 *     and a labelled `<nav>`; nothing depends on scroll position.
 *   · **RTL-safe chevrons** — mirrored with `rtl:rotate-180`, which is the
 *     direction of travel, not the icon's meaning.
 */
export interface PaginationProps {
  page: number;
  totalPages: number;
  /** 1-based index of the first item on this page. */
  firstShown: number;
  /** 1-based index of the last item on this page. */
  lastShown: number;
  /** Total products matched, before paging. */
  total: number;
  onChange: (page: number) => void;
  className?: string;
}

/** Page numbers to render, with `null` marking an ellipsis break. */
function pageWindow(page: number, totalPages: number, span = 1): Array<number | null> {
  const pages = new Set<number>([1, totalPages, page]);

  for (let offset = 1; offset <= span; offset += 1) {
    if (page - offset >= 1) pages.add(page - offset);
    if (page + offset <= totalPages) pages.add(page + offset);
  }

  const ordered = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  let previous = 0;

  for (const value of ordered) {
    // A single missing page is shown as the number; only a real gap gets "…".
    if (previous && value - previous === 2) out.push(previous + 1);
    else if (previous && value - previous > 2) out.push(null);
    out.push(value);
    previous = value;
  }

  return out;
}

export function Pagination({
  page,
  totalPages,
  firstShown,
  lastShown,
  total,
  onChange,
  className,
}: PaginationProps) {
  const { t } = useTranslation();

  if (totalPages <= 1) {
    return (
      <p className={cn('text-center text-[11px] text-muted-foreground', className)}>
        {t('search.showingAll', { count: total })}
      </p>
    );
  }

  const items = pageWindow(page, totalPages);

  return (
    <nav aria-label={t('search.pagination')} className={cn('flex flex-col items-center gap-3', className)}>
      <p className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
        {t('search.showingRange', { first: firstShown, last: lastShown, total })}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label={t('search.previousPage')}
        >
          <ChevronLeft className="rtl:rotate-180" />
          <span className="hidden sm:inline">{t('search.previous')}</span>
        </Button>

        {items.map((value, index) =>
          value === null ? (
            <span key={`gap-${index}`} aria-hidden className="px-1 font-mono text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              aria-current={value === page ? 'page' : undefined}
              aria-label={t('search.pageNumber', { page: value })}
              className={cn(
                'grid size-9 place-items-center rounded-lg border font-mono text-xs transition-colors pointer-coarse:size-11',
                value === page
                  ? 'border-primary/40 bg-primary/15 text-primary-glow'
                  : 'border-border text-muted-foreground hover:border-border-strong hover:bg-surface-elevated hover:text-foreground',
              )}
            >
              {value}
            </button>
          ),
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label={t('search.nextPage')}
        >
          <span className="hidden sm:inline">{t('search.next')}</span>
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
    </nav>
  );
}

export default Pagination;
