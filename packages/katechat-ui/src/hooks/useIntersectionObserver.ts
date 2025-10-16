import { DependencyList, useEffect, useRef } from "react";

export function useIntersectionObserver<T extends HTMLElement>(callback: () => void, deps: DependencyList, delay = 0) {
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useRef<T>(null);

  useEffect(() => {
    observer.current?.disconnect();
    const timeoutId = setTimeout(() => {
      observer.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) callback();
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
