import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X, Loader2 } from 'lucide-react';
import { useSuggestions } from '@/hooks/useSearch';
import { formatCurrency } from '@/lib/utils';
import { retailerImageUrl } from '@/lib/retailerImage';
import { RetailerLogo } from '@/components/retail/RetailerLogo';
import { cn } from '@/lib/utils';
import type { ProductGroup } from '@/services/searchService';

/**
 * Search input with debounced autocomplete.
 *
 * Debounce is 300 ms (per spec) and lives here rather than in the query layer so
 * the value the user sees is always the value that is being fetched. Suggestions
 * show a thumbnail, the model name and the cheapest price, and can be picked with
 * the keyboard — a search box that only works with a mouse is not finished.
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: (query: string) => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // 300 ms debounce — long enough to avoid a request per keystroke, short enough
  // to feel instant.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(timer);
  }, [value]);

  const { data: suggestions = [], isFetching } = useSuggestions(debounced);

  // Close on outside click. Pointerdown rather than click so the list closes
  // before a click elsewhere is interpreted.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const pick = (group: ProductGroup) => {
    onChange(group.name);
    setDebounced(group.name);
    setOpen(false);
    onSubmit?.(group.name);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) {
      if (event.key === 'Enter') {
        setOpen(false);
        onSubmit?.(value);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = suggestions[activeIndex];
      if (chosen) pick(chosen);
      else onSubmit?.(value);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && debounced.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        className={cn(
          'glass-deep flex items-center gap-2 rounded-xl px-3 transition-[border-color,box-shadow]',
          'focus-within:border-primary/50 focus-within:shadow-glow-sm',
          'h-12 md:h-14',
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          aria-label={t('search.search')}
          // 16px: below that, iOS zooms the viewport on focus.
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70 sm:text-sm"
        />

        {isFetching ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setDebounced('');
              setOpen(false);
              inputRef.current?.focus();
            }}
            aria-label={t('search.clear')}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {showList ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border-strong bg-surface/95 shadow-card backdrop-blur-xl"
          >
            <p className="px-3 pt-2.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t('search.suggestionHint')}
            </p>
            <ul id={listId} role="listbox" className="p-1.5">
              {suggestions.length === 0 ? (
                <li className="px-2.5 py-3 text-xs text-muted-foreground">{t('search.noSuggestions')}</li>
              ) : (
                suggestions.map((group, index) => (
                  <li
                    key={group.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    id={`${listId}-${index}`}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pick(group)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors',
                        index === activeIndex ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/60',
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-elevated">
                        {retailerImageUrl(group.imageUrl) ? (
                          <img
                            src={retailerImageUrl(group.imageUrl) ?? ''}
                            alt=""
                            loading="lazy"
                            className="size-full object-contain p-0.5"
                          />
                        ) : (
                          <Search className="size-3.5 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{group.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {group.retailerIds.slice(0, 3).map((id) => (
                            <RetailerLogo key={id} retailerId={id} size="sm" />
                          ))}
                          <span className="truncate">
                            {t('search.retailersAvailable', { count: group.retailerIds.length })}
                          </span>
                        </span>
                      </span>
                      <span
                        className="shrink-0 font-mono text-xs font-medium tabular-nums text-success"
                        dir="auto"
                      >
                        {formatCurrency(group.best.priceEgp)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default SearchBar;
