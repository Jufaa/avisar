import { useEffect, useRef, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  title: string;
  description?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Bottom sheet on a phone, centered dialog on a desktop.
 *
 * The same component either way: one mental model for the user, one place to
 * get focus handling and the escape key right.
 */
export function Sheet({ open, title, description, onClose, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Opening is the event that moves focus — never a re-render.
  //
  // This effect deliberately depends on `open` alone. Adding `onClose` here
  // once meant that a caller passing an inline arrow refocused the panel on
  // every keystroke, which pulled the cursor out of whatever input the user
  // was typing in after a single letter.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel so a keyboard user is not left behind on the
    // page underneath.
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Separate, because this one genuinely needs the current `onClose`.
  // Re-subscribing a listener is free; stealing focus is not.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-2xl leading-none text-ink-500 hover:bg-line-soft"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && <footer className="border-t border-line-soft px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
