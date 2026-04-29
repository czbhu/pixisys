import React, { createContext, useContext } from 'react';
import { Button } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Shared row context so the DragHandle can pick up listeners from the
// surrounding sortable row.
interface RowContextProps {
  setActivatorNodeRef?: (el: HTMLElement | null) => void;
  listeners?: any;
}
export const CostRowContext = createContext<RowContextProps>({});

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
  } = useSortable({ id: props['data-row-key'] });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#e6f7ff' } : {}),
  };

  return (
    <CostRowContext.Provider value={{ setActivatorNodeRef, listeners }}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes}>
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
