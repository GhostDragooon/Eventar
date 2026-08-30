import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * First page, last page and a one-either-side window around the current page,
 * with the runs between them collapsed. A run of exactly one page is rendered
 * rather than collapsed — an ellipsis costs the same width as the number it
 * would hide.
 */
function pageItems(page: number, pageCount: number): (number | 'gap')[] {
  const kept = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);

  const items: (number | 'gap')[] = [];
  let previous = 0;
  for (const value of kept) {
    if (value - previous === 2) items.push(previous + 1);
    else if (value - previous > 2) items.push('gap');
    items.push(value);
    previous = value;
  }
  return items;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Pagination">
      <ul className="flex flex-wrap items-center gap-xs">
        <li>
          <PageButton label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </PageButton>
        </li>
        {pageItems(page, pageCount).map((value, index) =>
          value === 'gap' ? (
            // aria-hidden, no control inside: a skipped run is a visual cue
            // only, so it is neither focusable nor announced as a page.
            <li
              key={`gap-${index}`}
              aria-hidden
              className="min-h-11 min-w-11 flex items-center justify-center font-label-md text-label-md text-on-surface-variant"
            >
              …
            </li>
          ) : (
            <li key={value}>
              <PageButton label={`Page ${value}`} current={value === page} onClick={() => onPageChange(value)}>
                {value}
              </PageButton>
            </li>
          ),
        )}
        <li>
          <PageButton label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>
            Next
          </PageButton>
        </li>
      </ul>
    </nav>
  );
}

function PageButton({
  children,
  label,
  current = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={current ? 'default' : 'outline'}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-11 min-w-11 px-sm font-label-md text-label-md',
        // The underline is the non-colour cue for "you are here" — colour
        // alone would leave the current page unmarked for anyone who cannot
        // distinguish the fill.
        current && 'underline underline-offset-4',
      )}
    >
      {children}
    </Button>
  );
}
