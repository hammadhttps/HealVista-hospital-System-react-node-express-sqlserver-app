import { useEffect, useState } from "react";

/**
 * Debounces a rapidly-changing value (a search box).
 *
 * This is a timer, which is one of the few things `useEffect` is legitimately
 * for — it is not data fetching. The query hook downstream stays declarative and
 * simply keys off the debounced value.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
