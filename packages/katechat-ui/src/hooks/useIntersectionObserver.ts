import { DependencyList, useEffect, useRef } from "react";

export function useIntersectionObserver<T extends HTMLElement>(callback: () => void, deps: DependencyList, delay = 0) {
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useRef<T>(null);
  // Persisted across observer re-creations: the observer is torn down and
  // rebuilt whenever deps/callback change (in practice on every render of the
  // consumer), and a freshly created IntersectionObserver immediately reports
  // the current state. Without tracking the previous state the callback would
  // re-fire in a loop while the target stays visible — e.g. loading every
  // messages page in a row after a single scroll to the top.
  const wasIntersecting = useRef<boolean>(false);

  useEffect(() => {
    observer.current?.disconnect();
    const timeoutId = setTimeout(() => {
      observer.current = new IntersectionObserver(entries => {
        const isIntersecting = entries[0].isIntersecting;
        // fire only on the "entered the viewport" transition
        if (isIntersecting && !wasIntersecting.current) callback();
        wasIntersecting.current = isIntersecting;
      });

      if (ref.current) observer.current.observe(ref.current);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      observer.current?.disconnect();
    };
  }, [deps, callback]);

  return ref;
}
