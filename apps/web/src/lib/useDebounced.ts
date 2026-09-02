import { useEffect, useState } from 'react';

/**
 * Delays a fast-changing value so it can be used as a query key.
 *
 * Typing "Fernández" without this fires nine requests, eight of which are
 * thrown away — and on a phone over mobile data, the last one is not
 * guaranteed to arrive last.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
