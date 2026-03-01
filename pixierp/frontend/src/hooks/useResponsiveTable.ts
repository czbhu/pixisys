import { useEffect, useRef, useState, useMemo } from 'react';

const DEFAULT_COL_WIDTH = 120;

/**
 * Hook to determine whether a table should switch to card layout.
 *
 * Measures the actual container width via ResizeObserver and compares it
 * to the estimated total width required by the visible columns.
 *
 * @param columns  – Ant Design column definitions (must have key/dataIndex, optionally width)
 * @param colVisibility – optional map of key → boolean (true = visible). If omitted, all columns are visible.
 * @returns { containerRef, useCardLayout }
 */
export function useResponsiveTable(
  columns: readonly { key?: React.Key; dataIndex?: string | string[]; width?: number; [k: string]: any }[],
  colVisibility?: Record<string, boolean>,
  cardBreakpoint?: number
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const requiredWidth = useMemo(() => {
    let total = 0;
    for (const col of columns) {
      const key = String(col.key ?? col.dataIndex ?? '');
      if (colVisibility && colVisibility[key] === false) continue;
      total += (col.width as number) || DEFAULT_COL_WIDTH;
    }
    return total;
  }, [columns, colVisibility]);

  // cardBreakpoint overrides column-sum heuristic when explicitly provided
  const threshold = cardBreakpoint ?? requiredWidth;

  // Fallback: if ResizeObserver hasn't fired yet, use a viewport heuristic
  const useCardLayout = containerWidth > 0
    ? containerWidth < threshold
    : typeof window !== 'undefined' && window.innerWidth < threshold + 250;

  return { containerRef, useCardLayout, containerWidth, requiredWidth };
}
