import { useEffect, useRef, useState } from 'react';

/**
 * Reports the pixel width of an element as it resizes.
 *
 * The charts draw in real pixel coordinates rather than a stretched viewBox, so
 * strokes and text keep their intended weight at every container width.
 */
export default function useMeasure(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const read = () => setWidth(node.clientWidth || fallback);
    read();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }

    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fallback]);

  return [ref, width];
}
