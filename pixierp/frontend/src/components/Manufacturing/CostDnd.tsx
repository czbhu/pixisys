import React, { createContext, useContext } from 'react';
import { Button } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RowDndIndicatorContext } from '../EnhancedTable';

// Shared row context so the DragHandle can pick up listeners from the
// surrounding sortable row.
interface RowContextProps {
  setActivatorNodeRef?: (el: HTMLElement | null) => void;
  listeners?: any;
}
export const CostRowContext = createContext<RowContextProps>({});

/**
 * Module-level marker that records WHICH activator started the most
 * recent drag — set during the pointerdown capture phase before the
 * @dnd-kit pointer-sensor activation timer fires. Consumers can read
 * this in their `onReorder` handler to switch between single-row and
 * group (e.g. whole-order) reorder semantics.
 */
export const dragModeRef: { current: 'single' | 'group' } = { current: 'single' };

export const CostDragHandle: React.FC = () => {
  const { setActivatorNodeRef, listeners } = useContext(CostRowContext);
  return (
    <Button
      type="text"
      size="small"
      ref={setActivatorNodeRef}
      icon={<MenuOutlined style={{ cursor: 'grab', color: '#999' }} />}
      {...listeners}
    />
  );
};

export const CostDraggableRow: React.FC<any> = ({ children, ...props }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    over,
    active,
  } = useSortable({ id: props['data-row-key'] });

  // Sticky indicator from EnhancedTable (rowDnd) – stays visible even when
  // the pointer briefly leaves every row. Falls back to the local useSortable
  // values for legacy callers (ProductSubItemsTable etc.) that don't use
  // EnhancedTable's rowDnd.
  const sticky = useContext(RowDndIndicatorContext);
  const rowId = props['data-row-key'];
  const stickyActive = sticky.activeId;
  const stickyOver = sticky.overId;
  const useSticky = stickyActive != null;

  // Determine drop indicator side: above or below this row.
  let dropSide: 'top' | 'bottom' | null = null;
  if (useSticky) {
    if (
      stickyOver != null &&
      String(stickyOver) === String(rowId) &&
      String(stickyActive) !== String(rowId) &&
      active && over
    ) {
      const activeRect = active.rect.current.translated;
      const overRect = over.rect;
      if (activeRect && overRect) {
        const activeCenter = activeRect.top + activeRect.height / 2;
        const overCenter = overRect.top + overRect.height / 2;
        dropSide = activeCenter < overCenter ? 'top' : 'bottom';
      } else {
        dropSide = 'bottom';
      }
    }
  } else if (isOver && active && over && active.id !== over.id) {
    const activeRect = active.rect.current.translated;
    const overRect = over.rect;
    if (activeRect && overRect) {
      const activeCenter = activeRect.top + activeRect.height / 2;
      const overCenter = overRect.top + overRect.height / 2;
      dropSide = activeCenter < overCenter ? 'top' : 'bottom';
    } else {
      dropSide = 'bottom';
    }
  }

  // Apply dnd-kit transform if present. With a sortable strategy
  // (legacy callers), non-dragged rows get a slide-aside translation;
  // without a strategy (default), only the dragged row gets a transform.
  const appliedTransform = CSS.Transform.toString(
    transform && { ...transform, scaleY: 1, scaleX: 1 }
  );

  const style: React.CSSProperties = {
    ...props.style,
    transform: appliedTransform,
    transition: isDragging ? 'none' : (transition || 'box-shadow 100ms ease'),
    position: 'relative',
    ...(isDragging
      ? {
          zIndex: 9999,
          background: '#e6f4ff',
          boxShadow: '0 8px 24px rgba(22, 119, 255, 0.25), 0 0 0 2px #1677ff inset',
          opacity: 0.96,
          cursor: 'grabbing',
          // Disable pointer-events on the floating ghost so it doesn't
          // block hover detection on rows underneath it.
          pointerEvents: 'none',
        }
      : {}),
    ...(dropSide && !isDragging
      ? {
          // Single 3px coloured line at the top or bottom of the row.
          boxShadow: dropSide === 'top'
            ? 'inset 0 3px 0 0 #1677ff'
            : 'inset 0 -3px 0 0 #1677ff',
        }
      : {}),
  };

  return (
    <CostRowContext.Provider value={{ setActivatorNodeRef, listeners }}>
      <tr
        {...props}
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...(listeners || {})}
        onPointerDownCapture={(e) => {
          // Default to single-row drag. A more specific activator deeper in
          // the row (e.g. the order-number cell) can overwrite this in its
          // own capture-phase handler, which fires AFTER this one because
          // capture phase runs outermost → innermost.
          dragModeRef.current = 'single';
          (props.onPointerDownCapture as any)?.(e);
        }}
      >
        {children}
      </tr>
    </CostRowContext.Provider>
  );
};

// Generic interface every cost-like item must satisfy
export interface CostDndItem {
  id: number;
  sort_order?: number;
  parent_local_id?: number | null;
}

// ── Tree visualization helpers ─────────────────────────────────────────────
export interface CostTreeMeta {
  depth: number;
  isLast: boolean;          // is this row the last child of its parent (or last root)?
  ancestorIsLast: boolean[]; // for each ancestor level (root..parent), whether THAT ancestor was the last child
}

/** Compute depth + sibling-position metadata for a flat parent_local_id list. */
export function buildCostTreeMeta<T extends CostDndItem>(items: T[]): Map<number, CostTreeMeta> {
  return buildTreeMetaBy(items, it => it.parent_local_id ?? null);
}

/**
 * Generic version of `buildCostTreeMeta` that lets the caller specify how
 * to read the parent reference. Useful for lists that store the parent
 * under a different key (e.g. `parent` or `parent_id`).
 */
export function buildTreeMetaBy<T extends { id: number }>(
  items: T[],
  getParent: (it: T) => number | null | undefined,
): Map<number, CostTreeMeta> {
  const meta = new Map<number, CostTreeMeta>();
  const depth = new Map<number, number>();
  const getDepth = (id: number, seen = new Set<number>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const it = items.find(x => x.id === id);
    if (!it) { depth.set(id, 0); return 0; }
    const pid = getParent(it);
    if (!pid) { depth.set(id, 0); return 0; }
    const d = 1 + getDepth(pid, seen);
    depth.set(id, d);
    return d;
  };
  items.forEach(i => getDepth(i.id));

  const groups = new Map<number | 'root', T[]>();
  items.forEach(it => {
    const pid = getParent(it);
    const key: number | 'root' = pid ?? 'root';
    const arr = groups.get(key) || [];
    arr.push(it);
    groups.set(key, arr);
  });

  const isLastMap = new Map<number, boolean>();
  groups.forEach(arr => {
    arr.forEach((it, i) => isLastMap.set(it.id, i === arr.length - 1));
  });

  const getAncestorChain = (id: number): boolean[] => {
    const it = items.find(x => x.id === id);
    if (!it) return [];
    const pid = getParent(it);
    if (!pid) return [];
    const parentChain = getAncestorChain(pid);
    return [...parentChain, isLastMap.get(pid) ?? true];
  };

  items.forEach(it => {
    meta.set(it.id, {
      depth: depth.get(it.id) ?? 0,
      isLast: isLastMap.get(it.id) ?? true,
      ancestorIsLast: getAncestorChain(it.id),
    });
  });
  return meta;
}

/**
 * Build tree meta from a *flat* list whose ordering already encodes the
 * tree (DFS pre-order) and whose depth is given per row. Useful for
 * pre-flattened views like the RFQ cost calculation table.
 */
export function buildTreeMetaFromDepths(depths: number[]): CostTreeMeta[] {
  const result: CostTreeMeta[] = depths.map(d => ({ depth: d, isLast: true, ancestorIsLast: [] }));
  // For each row, find the next sibling (next row whose depth <= current).
  // It is the "last" child of its parent if no next row at the same depth
  // appears before a row with smaller depth.
  for (let i = 0; i < depths.length; i++) {
    const d = depths[i];
    let isLast = true;
    for (let j = i + 1; j < depths.length; j++) {
      if (depths[j] < d) break;
      if (depths[j] === d) { isLast = false; break; }
    }
    result[i].isLast = isLast;
  }
  // ancestorIsLast: walk back from i to find each ancestor (last row at depth k < d)
  for (let i = 0; i < depths.length; i++) {
    const d = depths[i];
    const chain: boolean[] = [];
    for (let lvl = 0; lvl < d; lvl++) {
      // find nearest preceding row at depth = lvl
      let parentIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (depths[j] === lvl) { parentIdx = j; break; }
        if (depths[j] < lvl) break;
      }
      chain.push(parentIdx >= 0 ? result[parentIdx].isLast : true);
    }
    result[i].ancestorIsLast = chain;
  }
  return result;
}

/** Render tree guides ( │ / ├ / └ ) in front of a node label. */
export const CostTreeGuide: React.FC<{ meta?: CostTreeMeta; children?: React.ReactNode }> = ({ meta, children }) => {
  if (!meta || meta.depth === 0) {
    return <span style={{ display: 'inline-flex', alignItems: 'center' }}>{children}</span>;
  }
  const cellStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 16,
    textAlign: 'center',
    color: '#bfbfbf',
    fontFamily: 'monospace',
    userSelect: 'none',
    flex: '0 0 auto',
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
      {meta.ancestorIsLast.map((isLast, i) => (
        <span key={i} style={cellStyle}>{isLast ? '\u00A0' : '│'}</span>
      ))}
      <span style={cellStyle}>{meta.isLast ? '└' : '├'}</span>
      <span style={{ minWidth: 0, flex: 1 }}>{children}</span>
    </span>
  );
};


/**
 * Apply a drag & drop result to a flat list with parent_local_id nesting.
 * - Reorders by moving `activeId` to `overId`'s index.
 * - Re-assigns `parent_local_id` based on horizontal `deltaX`:
 *   - drag right → indent (becomes child of previous sibling)
 *   - drag left  → outdent (walks up the parent chain)
 * - Cycle-safe: never makes the moved row a descendant of itself.
 * Returns a new array with `sort_order` rewritten 0..N-1.
 */
export function applyCostDnd<T extends CostDndItem>(
  items: T[],
  activeId: number,
  overId: number,
  deltaX: number,
  pxPerLevel: number = 16,
): T[] {
  const oldIdx = items.findIndex(i => i.id === activeId);
  const overIdx = items.findIndex(i => i.id === overId);
  if (oldIdx < 0 || overIdx < 0) return items;

  // First reorder
  const moved = activeId === overId ? [...items] : arrayMove(items, oldIdx, overIdx);
  const newIdx = moved.findIndex(i => i.id === activeId);

  // Build depth map over the *moved* list (using its existing parents)
  const depth = new Map<number, number>();
  const getDepth = (id: number | null | undefined, seen = new Set<number>()): number => {
    if (!id) return 0;
    if (seen.has(id)) return 0;
    seen.add(id);
    if (depth.has(id)) return depth.get(id)!;
    const it = moved.find(x => x.id === id);
    if (!it || !it.parent_local_id) { depth.set(id, 0); return 0; }
    const d = 1 + getDepth(it.parent_local_id, seen);
    depth.set(id, d);
    return d;
  };
  moved.forEach(i => getDepth(i.id));

  const currentDepth = depth.get(activeId) ?? 0;
  const targetDepth = Math.max(0, currentDepth + Math.round(deltaX / pxPerLevel));

  let newParent: number | null = null;
  if (newIdx === 0 || targetDepth === 0) {
    newParent = null;
  } else {
    const prev = moved[newIdx - 1];
    const prevDepth = depth.get(prev.id) ?? 0;
    if (targetDepth > prevDepth) {
      // Child of previous row (cap at prevDepth + 1)
      newParent = prev.id;
    } else if (targetDepth === prevDepth) {
      newParent = prev.parent_local_id ?? null;
    } else {
      // Walk up prev's chain by (prevDepth - targetDepth) levels
      let cur: T | undefined = prev;
      let steps = prevDepth - targetDepth;
      while (cur && steps-- > 0) {
        const pid: number | null | undefined = cur.parent_local_id;
        cur = pid ? moved.find(x => x.id === pid) : undefined;
      }
      newParent = cur ? (cur.parent_local_id ?? null) : null;
    }
  }

  // Cycle protection: ensure newParent is not a descendant of activeId
  if (newParent != null) {
    let cur: T | undefined = moved.find(x => x.id === newParent);
    const seen = new Set<number>();
    while (cur) {
      if (cur.id === activeId) { newParent = null; break; }
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      const pid: number | null | undefined = cur.parent_local_id;
      cur = pid ? moved.find(x => x.id === pid) : undefined;
    }
  }

  return moved.map((it, i) => i === newIdx
    ? ({ ...it, sort_order: i, parent_local_id: newParent } as T)
    : ({ ...it, sort_order: i } as T));
}
