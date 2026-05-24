/**
 * EnhancedTable – felváltja a sima Ant Design <Table>-t az alábbi extra funkciókkal:
 *  - Oszlop láthatóság ki/bekapcsolás (Oszlopok dropdown)
 *  - Oszlop sorrend drag-and-drop (hosszú nyomás 400ms)
 *  - Rendezés törlése gomb
 *  - Felhasználóhoz kötött szerver-oldali mentés (useUserPreference)
 *
 * Ügyfélnév helper: renderCustomerName(record) – magánszemély kezelés
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Table, Button, Dropdown, Tooltip, Space, Input, Pagination, Select, Card } from 'antd';
import type { TableProps, TableColumnType } from 'antd';
import {
  AppstoreOutlined,
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useUserPreference from '../hooks/useUserPreference';
import { useResponsiveTable } from '../hooks/useResponsiveTable';
import ResponsiveCardList from './ResponsiveCardList';

// ─── Sticky drop-indicator context for row drag ───────────────────────────
// Carries the currently-dragged row id and the last-known "over" row id.
// Row components (e.g. CostDraggableRow) read this so the blue line stays
// visible even when the pointer briefly leaves all rows.
interface RowDndIndicatorState {
  activeId: string | number | null;
  overId: string | number | null;
}
export const RowDndIndicatorContext = React.createContext<RowDndIndicatorState>({
  activeId: null,
  overId: null,
});

// ─── Drag-and-drop header cell ────────────────────────────────────────────────

const DraggableHeaderCell: React.FC<any> = ({ id, colWidth, onResizeMove, onResizeEnd, children, ...props }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: id || 'noop' });

  // Extract dnd-kit's style (touchAction: none, userSelect: none) and merge it
  // BEFORE our overrides so our styles always win. Spreading {...attributes} after
  // style={style} in JSX would otherwise overwrite our style entirely.
  const { style: attrStyle, ...otherAttributes } = (attributes as any);

  const style: React.CSSProperties = {
    ...props.style,
    ...(attrStyle || {}),           // dnd-kit: touchAction:'none', userSelect:'none'
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'default',
    userSelect: 'none',
    position: 'relative',
    overflow: 'visible',            // always visible so resize handle can straddle border
    ...(colWidth ? { width: colWidth, minWidth: colWidth } : {}),
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const startX = e.clientX;
    // Use actual rendered th width, not the prop (which may be stale)
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement;
    const startWidth = th ? th.offsetWidth : (colWidth || 100);
    const onMove = (ev: PointerEvent) => {
      const newWidth = Math.max(40, startWidth + ev.clientX - startX);
      onResizeMove?.(id, newWidth);
    };
    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const newWidth = Math.max(40, startWidth + ev.clientX - startX);
      onResizeEnd?.(id, newWidth);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    // noop – cleanup is in document pointerup listener above
  };

  if (!id) return <th {...props}>{children}</th>;
  return (
    <th {...props} ref={setNodeRef} style={style} {...otherAttributes} {...listeners}>
      {children}
      {onResizeMove && (
        <div
          onPointerDown={handleResizePointerDown}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          style={{
            position: 'absolute', top: 0, right: -4, width: 8, height: '100%',
            cursor: 'col-resize', zIndex: 10,
          }}
        />
      )}
    </th>
  );
};

// ─── Customer name helper ─────────────────────────────────────────────────────

export interface CustomerRecord {
  customer_name?: string;
  contact_names?: string;
  is_private?: boolean;
}

/**
 * Ügyfél cella renderer:
 * - Magánszemély: kapcsolattartó neve félkövéren + "Magánszemély" kicsiben
 * - Cég: cég neve félkövéren + kapcsolattartó kicsiben
 */
export function renderCustomerName(record: CustomerRecord): React.ReactNode {
  const { customer_name, contact_names, is_private } = record;

  const primaryName = is_private
    ? contact_names || 'Magánszemély'
    : customer_name || '-';

  const tooltipText = is_private
    ? contact_names
    : [customer_name, contact_names].filter(Boolean).join(' – ');

  return (
    <Tooltip title={tooltipText}>
      <div>
        <div
          style={{
            fontWeight: 'bold',
            display: '-webkit-box',
            WebkitLineClamp: is_private || contact_names ? 2 : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {primaryName}
        </div>
        {is_private && (
          <div style={{ fontSize: 10, color: '#aaa', lineHeight: '14px' }}>
            Magánszemély
          </div>
        )}
        {!is_private && contact_names && (
          <div
            style={{
              fontSize: 11,
              color: '#666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {contact_names}
          </div>
        )}
      </div>
    </Tooltip>
  );
}

// ─── EnhancedTable props ──────────────────────────────────────────────────────

export interface EnhancedTableProps<T = any> extends Omit<TableProps<T>, 'components'> {
  /** Egyedi kulcs – a felhasználói beállítások tárolásához (pl. "quotes", "employees") */
  tableKey: string;
  /**
   * Oszlop megnevezések a dropdownban.
   * Ha nincs megadva, a column.title-t használja.
   */
  colLabels?: Record<string, string>;
  /**
   * Alapértelmezetten rejtett oszlopkulcsok.
   * Ha nincs megadva, minden oszlop látható.
   */
  defaultHiddenKeys?: string[];
  /** Extra gomb / elem a toolbar-ban (kereső Input mellett, oszlopok ikon előtt) */
  toolbarExtra?: React.ReactNode;
  /** Ha true, az Oszlopok gomb nem jelenik meg (pl. egyszerű kis táblákhoz) */
  noColumnManager?: boolean;
  /** Beépített kereső: érték */
  searchValue?: string;
  /** Beépített kereső: callback */
  onSearchChange?: (value: string) => void;
  /** Beépített kereső: placeholder */
  searchPlaceholder?: string;
  /** Ha true, soha nem vált kártyás nézetre (pl. POS) */
  disableCardLayout?: boolean;
  /** Explicit container-width threshold (px) at which to switch to card layout */
  cardBreakpoint?: number;
  /** Custom body-level table components (e.g., { body: { row: DraggableRow } }). Merged with EnhancedTable’s header override. */
  bodyComponents?: TableProps<T>['components'];
  /** Optional row drag-and-drop reordering. When provided, rows are wrapped in a
   *  vertical SortableContext using the supplied row ids. The drag handle must
   *  be a component using useSortable from this same DndContext (e.g. CostDraggableRow). */
  rowDnd?: {
    items: (string | number)[];
    onReorder: (activeId: string | number, overId: string | number) => void;
  };
  /** Ha megadva, EnhancedTable egy Card-ba csomagolja magát, és a toolbar a Card fejlécébe (extra) kerül */
  cardTitle?: React.ReactNode;
  /** Tartalom a Card fejléc és a tábla között (pl. szűrő sorok) – csak cardTitle esetén */
  innerHeader?: React.ReactNode;
}

// ─── EnhancedTable component ──────────────────────────────────────────────────

function EnhancedTable<T extends object = any>({
  tableKey,
  columns: rawColumns = [],
  colLabels,
  defaultHiddenKeys = [],
  toolbarExtra,
  noColumnManager = false,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Keresés...',
  disableCardLayout = false,
  cardBreakpoint,
  bodyComponents,
  cardTitle,
  innerHeader,
  rowDnd,
  ...tableProps
}: EnhancedTableProps<T>) {
  // Derive default order and visibility maps from the column definitions ────
  const allKeys = useMemo(
    () => (rawColumns as TableColumnType<T>[]).map((c) => String(c.key ?? c.dataIndex ?? '')).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const defaultVisibility = useMemo<Record<string, boolean>>(() => {
    const vis: Record<string, boolean> = {};
    allKeys.forEach((k) => {
      vis[k] = !defaultHiddenKeys.includes(k);
    });
    return vis;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labelFor = (col: TableColumnType<T>): string => {
    const key = String(col.key ?? col.dataIndex ?? '');
    if (colLabels?.[key]) return colLabels[key];
    if (typeof col.title === 'string') return col.title;
    return key;
  };

  // Preferences: visibility ─────────────────────────────────────────────────
  const [colVis, setColVis] = useUserPreference<Record<string, boolean>>(
    `${tableKey}_colVis`,
    defaultVisibility
  );
  const mergedColVis: Record<string, boolean> = { ...defaultVisibility, ...colVis };
  const toggleCol = (key: string) =>
    setColVis((prev) => ({ ...(prev || defaultVisibility), [key]: !mergedColVis[key] }));

  // Preferences: column widths ──────────────────────────────────────────────
  const [colWidthsPref, setColWidthsPref] = useUserPreference<Record<string, number>>(
    `${tableKey}_colWidths`,
    {}
  );
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  const mergedWidths: Record<string, number> = { ...(colWidthsPref || {}), ...liveWidths };

  const handleResizeMove = useCallback((key: string, width: number) => {
    setLiveWidths(prev => ({ ...prev, [key]: width }));
  }, []);

  const handleResizeEnd = useCallback((key: string, width: number) => {
    setLiveWidths({});
    setColWidthsPref(prev => ({ ...(prev || {}), [key]: width }));
  }, [setColWidthsPref]);

  // Preferences: column order ───────────────────────────────────────────────
  const [colOrderRaw, setColOrder] = useUserPreference<string[]>(
    `${tableKey}_colOrder`,
    allKeys
  );
  const colOrder = useMemo(() => {
    const saved = colOrderRaw || allKeys;
    // Start with saved keys that still exist in allKeys
    const merged: string[] = saved.filter((k: string) => allKeys.includes(k));
    const mergedSet = new Set(merged);
    // Insert new/renamed keys at their natural position (based on allKeys order),
    // not blindly at the end (which would push them after 'actions').
    allKeys.forEach((k, idx) => {
      if (!mergedSet.has(k)) {
        let insertAt = merged.length; // default: append
        for (let i = idx - 1; i >= 0; i--) {
          const pos = merged.indexOf(allKeys[i]);
          if (pos !== -1) { insertAt = pos + 1; break; }
        }
        merged.splice(insertAt, 0, k);
        mergedSet.add(k);
      }
    });
    return merged;
  }, [colOrderRaw, allKeys]);

  // Sort reset ──────────────────────────────────────────────────────────────
  const [tableResetKey, setTableResetKey] = useState(0);

  // ─── Card-mode sort state ────────────────────────────────────────────────
  const [cardSortKey, setCardSortKey] = useState<string>('');
  const [cardSortDir, setCardSortDir] = useState<'asc' | 'desc'>('asc');

  // Columns that have a sorter function (used for the card-mode sort dropdown)
  const sortableColumns = useMemo(
    () => (rawColumns as TableColumnType<T>[]).filter(
      (c) => typeof (c as any).sorter === 'function' && String(c.key ?? c.dataIndex ?? '') !== 'actions'
    ),
    [rawColumns]
  );

  // Sorted data for card mode (Table mode lets Ant Design handle sorting natively)
  const cardSortedData = useMemo(() => {
    const data = (tableProps.dataSource ?? []) as any[];
    if (!cardSortKey) return data;
    const col = (rawColumns as TableColumnType<T>[]).find(
      (c) => String(c.key ?? c.dataIndex ?? '') === cardSortKey
    );
    if (!col || typeof (col as any).sorter !== 'function') return data;
    const sorterFn = (col as any).sorter as (a: any, b: any) => number;
    return [...data].sort((a, b) => {
      const result = sorterFn(a, b);
      return cardSortDir === 'asc' ? result : -result;
    });
  }, [tableProps.dataSource, cardSortKey, cardSortDir, rawColumns]);

  // DnD sensors ─────────────────────────────────────────────────────────────
  // Use distance:5 activation for column drag (5px movement to start)
  // so the correct column is always grabbed without needing a long-press.
  const rowSensor = useSensor(PointerSensor, { activationConstraint: { distance: 4 } });
  const colSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const sensors = useSensors(rowDnd ? rowSensor : colSensor);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setStickyOverId(null);
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    // Row drag: id is in rowDnd.items – forward to caller
    if (rowDnd && rowDnd.items.some(i => String(i) === String(active.id))) {
      rowDnd.onReorder(active.id as any, over.id as any);
      return;
    }
    // Column drag
    setColOrder((prev) => {
      const src = prev || allKeys;
      const oldIdx = src.indexOf(active.id as string);
      const newIdx = src.indexOf(over.id as string);
      return arrayMove(src, oldIdx, newIdx);
    });
  };

  // Sticky drop indicator state ──────────────────────────────────
  // Keeps the kek line visible even when the pointer momentarily leaves
  // every row (between rows, on table border etc). Updated only when a new
  // row becomes 'over' and cleared on drag end / cancel.
  const [activeDragId, setActiveDragId] = useState<string | number | null>(null);
  const [stickyOverId, setStickyOverId] = useState<string | number | null>(null);

  const handleDragStart = (e: DragStartEvent) => {
    if (rowDnd && rowDnd.items.some(i => String(i) === String(e.active.id))) {
      setActiveDragId(e.active.id as any);
    }
  };
  const handleDragOver = (e: DragOverEvent) => {
    if (e.over && rowDnd && rowDnd.items.some(i => String(i) === String(e.over!.id))) {
      setStickyOverId(e.over.id as any);
    }
  };
  const handleDragCancel = () => {
    setStickyOverId(null);
    setActiveDragId(null);
  };

  // Build the final column list ─────────────────────────────────────────────
  const processedColumns = useMemo(() => {
    const colMap = new Map(
      (rawColumns as TableColumnType<T>[]).map((c) => [
        String(c.key ?? c.dataIndex ?? ''),
        c,
      ])
    );
    return colOrder
      .filter((k) => mergedColVis[k] !== false)
      .map((k) => colMap.get(k))
      .filter(Boolean)
      .map((c) => {
        const key = String((c as any).key ?? (c as any).dataIndex ?? '');
        const isActions = key === 'actions';
        const savedWidth = !isActions ? mergedWidths[key] : undefined;
        // Always give every column an explicit width so tableLayout="fixed"
        // respects each column independently — no redistribution of space.
        const effectiveWidth = savedWidth || (c as any).width || 150;

        // ── Auto-truncate + native browser tooltip on overflow ───────────
        // Every data column has a fixed width (tableLayout="fixed"), so any
        // content wider than the cell gets clipped. We add an inner ellipsis
        // span and use the browser-native `title` attribute (zero React
        // overhead — no portals, no extra components) so users see the full
        // value on hover. Skipped for: actions column, drag handle column.
        let processed: any = c;
        // ellipsis: false on a column opts it out of the auto-nowrap wrapper
        // (used for multiline description columns that manage their own layout)
        const skipAutoTooltip = isActions || key === 'drag' || (c as any).ellipsis === false;
        if (!skipAutoTooltip) {
          const origRender = (c as any).render;
          const wrappedRender = (value: any, record: any, index: number) => {
            const node = origRender ? origRender(value, record, index) : value;
            // Pick a string title only when value is primitive — avoids
            // serialising React nodes and keeps custom renders (Tags, etc.)
            // free of double-tooltips.
            const titleStr = (typeof value === 'string' || typeof value === 'number')
              ? String(value)
              : undefined;
            return (
              <span
                title={titleStr}
                style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {node}
              </span>
            );
          };
          processed = {
            ...c,
            ellipsis: typeof (c as any).ellipsis === 'object'
              ? { ...(c as any).ellipsis, showTitle: false }
              : { showTitle: false },
            render: wrappedRender,
          };
        }

        if (isActions) {
          // Actions column: fixed width, not resizable, not draggable
          return {
            ...processed,
            width: (processed as any).width || 120,
            onHeaderCell: () => ({ id: key }),
          };
        }
        return {
          ...processed,
          width: effectiveWidth,
          onHeaderCell: () => ({
            id: key,
            colWidth: effectiveWidth,
            onResizeMove: handleResizeMove,
            onResizeEnd: handleResizeEnd,
          }),
        };
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawColumns, colOrder, mergedColVis, mergedWidths, handleResizeMove, handleResizeEnd]);

  // ─── Responsive card layout ────────────────────────────────────────────────
  const { containerRef, useCardLayout } = useResponsiveTable(
    rawColumns as any[],
    mergedColVis,
    cardBreakpoint
  );

  // Columns dropdown menu ───────────────────────────────────────────────────
  const dropdownItems = useMemo(() => {
    if (noColumnManager) return [];
    const toggleItems = (rawColumns as TableColumnType<T>[])
      .filter((c) => String(c.key ?? c.dataIndex ?? '') !== 'actions')
      .map((c) => {
        const key = String(c.key ?? c.dataIndex ?? '');
        const visible = mergedColVis[key] !== false;
        return {
          key,
          label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
              {visible ? (
                <CheckOutlined style={{ color: '#1677ff' }} />
              ) : (
                <CloseOutlined style={{ color: '#bbb' }} />
              )}
              {labelFor(c)}
            </span>
          ),
          onClick: () => toggleCol(key),
        };
      });

    return [
      ...toggleItems,
      { type: 'divider' as const },
      {
        key: '__reset_vis',
        label: (
          <span style={{ color: '#888', fontSize: 12 }}>
            <ReloadOutlined style={{ marginRight: 6 }} />Láthatóság alaphelyzete
          </span>
        ),
        onClick: () => setColVis(defaultVisibility),
      },
      {
        key: '__reset_order',
        label: (
          <span style={{ color: '#888', fontSize: 12 }}>
            <ReloadOutlined style={{ marginRight: 6 }} />Sorrend alaphelyzete
          </span>
        ),
        onClick: () => setColOrder(allKeys),
      },
      {
        key: '__reset_sort',
        label: (
          <span style={{ color: '#888', fontSize: 12 }}>
            <ReloadOutlined style={{ marginRight: 6 }} />Rendezés törlése
          </span>
        ),
        onClick: () => setTableResetKey((k) => k + 1),
      },
      {
        key: '__reset_widths',
        label: (
          <span style={{ color: '#888', fontSize: 12 }}>
            <ReloadOutlined style={{ marginRight: 6 }} />Oszlopszélességek alaphelyzete
          </span>
        ),
        onClick: () => { setLiveWidths({}); setColWidthsPref({}); },
      },
    ];
  }, [rawColumns, mergedColVis, defaultVisibility, allKeys, noColumnManager]);

  const colButton = !noColumnManager && (
    <Dropdown menu={{ items: dropdownItems }} trigger={['click']}>
      <Tooltip title="Oszlopok kezelése">
        <Button icon={<AppstoreOutlined />} />
      </Tooltip>
    </Dropdown>
  );

  const hasSearch = searchValue !== undefined && onSearchChange;
  const showCardSort = !disableCardLayout && useCardLayout && sortableColumns.length > 0;
  const showToolbar = !noColumnManager || toolbarExtra || hasSearch || showCardSort;

  // ─── Pagination state (centered top + footer with row selector) ──────────
  const pag = tableProps.pagination;
  const origPageSize = (pag && typeof pag === 'object') ? ((pag as any).pageSize ?? 20) : 20;
  const origCurrent = (pag && typeof pag === 'object') ? (pag as any).current : undefined;
  const origOnChange = (pag && typeof pag === 'object') ? (pag as any).onChange : undefined;
  const fullDataSource = (tableProps.dataSource ?? []) as any[];
  const dataLen = fullDataSource.length;

  const [intPage, setIntPage] = useState(1);
  const [intPageSize, setIntPageSize] = useUserPreference<number>(`${tableKey}_pageSize`, origPageSize);
  const page = origCurrent ?? intPage;
  const size = intPageSize;
  const handlePageChange = (p: number) => { setIntPage(p); origOnChange?.(p, size); };
  const handleSizeChange = (s: number) => { setIntPageSize(s); setIntPage(1); origOnChange?.(1, s); };

  // When search value or dataSource length changes, reset to page 1
  const prevDataLenRef = React.useRef(dataLen);
  React.useEffect(() => {
    if (prevDataLenRef.current !== dataLen) {
      prevDataLenRef.current = dataLen;
      if (!origCurrent) setIntPage(1);
    }
  }, [dataLen, origCurrent]);

  // Slice dataSource for client-side pagination (only when pag is not false and no external current)
  const pagedDataSource = useMemo(() => {
    if (pag === false || origCurrent !== undefined) return fullDataSource;
    const start = (page - 1) * size;
    return fullDataSource.slice(start, start + size);
  }, [fullDataSource, pag, origCurrent, page, size]);

  const pagSizeOptions = [{ value: 10, label: '10 / oldal' }, { value: 20, label: '20 / oldal' }, { value: 50, label: '50 / oldal' }, { value: 100, label: '100 / oldal' }, { value: 200, label: '200 / oldal' }, { value: 500, label: '500 / oldal' }, { value: 1000, label: '1000 / oldal' }];

  // Cross-page selection: when the table does client-side pagination, only the
  // current page's rows are in dataSource. Ant Design's rowSelection.onChange
  // reports only keys for those visible rows, so navigating pages would wipe
  // out selections from other pages. We wrap onChange to merge the new keys
  // with existing keys from pages not currently shown.
  const enhancedRowSelection = useMemo(() => {
    const rs = (tableProps as any).rowSelection;
    if (!rs || !rs.onChange) return rs;
    // Nothing to merge when all data is shown (pagination disabled or external current)
    if (pag === false || origCurrent !== undefined) return rs;
    const rk = (tableProps as any).rowKey;
    const getKey = (row: any): React.Key => {
      if (typeof rk === 'function') return rk(row);
      if (typeof rk === 'string') return row[rk];
      return row.key;
    };
    const currentPageKeySet = new Set<React.Key>(pagedDataSource.map(getKey));
    return {
      ...rs,
      onChange: (newKeys: React.Key[], newRows: any[], info: any) => {
        const otherPageKeys = ((rs.selectedRowKeys ?? []) as React.Key[]).filter(
          (k) => !currentPageKeySet.has(k)
        );
        rs.onChange([...otherPageKeys, ...newKeys], newRows, info);
      },
    };
  }, [(tableProps as any).rowSelection, (tableProps as any).rowKey, pagedDataSource, pag, origCurrent]);

  const pagRow = pag !== false ? (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}>
      <Pagination current={page} pageSize={size} total={dataLen} onChange={handlePageChange} showTotal={(t: number, r: [number, number]) => `${r[0]}-${r[1]} / ${t}`} size="small" showSizeChanger={false} />
      <Select value={size} onChange={handleSizeChange} size="small" variant="borderless" style={{ position: 'absolute', right: 0, width: 100, fontSize: 11, height: 24, lineHeight: '24px' }} popupMatchSelectWidth={false} options={pagSizeOptions} />
    </div>
  ) : null;

  const topPag = false as any;

  const footerFn = pag !== false && dataLen > size ? () => (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <Pagination current={page} pageSize={size} total={dataLen} onChange={handlePageChange} showTotal={(t: number, r: [number, number]) => `${r[0]}-${r[1]} / ${t}`} size="small" showSizeChanger={false} />
      <Select value={size} onChange={handleSizeChange} size="small" variant="borderless" style={{ position: 'absolute', right: 0, width: 100, fontSize: 11, height: 24, lineHeight: '24px' }} popupMatchSelectWidth={false} options={pagSizeOptions} />
    </div>
  ) : undefined;

  const toolbarNode = showToolbar ? (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        ...(cardTitle ? { flex: 1, minWidth: 0 } : { marginBottom: 8 }),
      }}
    >
      {hasSearch && (
        <Input
          prefix={<SearchOutlined />}
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          allowClear
          style={{ flex: 1 }}
        />
      )}
      {colButton}
      {showCardSort && (
        <Space size={4}>
          <Select
            size="small"
            placeholder="Rendezés..."
            allowClear
            popupMatchSelectWidth={false}
            style={{ minWidth: 130 }}
            value={cardSortKey || undefined}
            onChange={(v: string | undefined) => { setCardSortKey(v ?? ''); }}
          >
            {sortableColumns.map((col) => {
              const key = String(col.key ?? (col as any).dataIndex ?? '');
              return <Select.Option key={key} value={key}>{labelFor(col)}</Select.Option>;
            })}
          </Select>
          {cardSortKey && (
            <Tooltip title={cardSortDir === 'asc' ? 'Növekvő sorrend' : 'Csökkenő sorrend'}>
              <Button
                size="small"
                icon={cardSortDir === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
                onClick={() => setCardSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              />
            </Tooltip>
          )}
        </Space>
      )}
      {toolbarExtra}
    </div>
  ) : null;

  const tableContent = (
    <>
      {!disableCardLayout && useCardLayout ? (
        <ResponsiveCardList
          columns={processedColumns as any[]}
          dataSource={cardSortedData as any[]}
          rowKey={(tableProps.rowKey as any) ?? 'id'}
          loading={tableProps.loading as boolean}
          colVisibility={mergedColVis}
          currentPage={page}
          pageSize={size}
          onPageChange={handlePageChange}
          onPageSizeChange={handleSizeChange}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={colOrder} strategy={horizontalListSortingStrategy}>
            {pagRow}
            {(() => {
              const tableEl = (
                <Table<T>
                  key={tableResetKey}
                  {...tableProps}
                  rowSelection={enhancedRowSelection}
                  dataSource={pagedDataSource as T[]}
                  tableLayout="fixed"
                  scroll={{ x: processedColumns.reduce((s, c) => s + (typeof (c as any).width === 'number' ? (c as any).width : 150), 0), ...((tableProps as any).scroll || {}) }}
                  pagination={topPag}
                  footer={footerFn}
                  columns={processedColumns as TableColumnType<T>[]}
                  components={{
                    ...(bodyComponents || {}),
                    header: {
                      row: ({ children, ...rowProps }: any) => (
                        <tr {...rowProps}>{children}</tr>
                      ),
                      cell: DraggableHeaderCell,
                    },
                  }}
                />
              );
              return rowDnd
                ? (
                  <SortableContext items={rowDnd.items} strategy={verticalListSortingStrategy}>
                    <RowDndIndicatorContext.Provider value={{ activeId: activeDragId, overId: stickyOverId }}>
                      {tableEl}
                    </RowDndIndicatorContext.Provider>
                  </SortableContext>
                )
                : tableEl;
            })()}
          </SortableContext>
        </DndContext>
      )}
    </>
  );

  if (cardTitle !== undefined) {
    const cardHeader = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flexShrink: 0, fontWeight: 600 }}>{cardTitle}</span>
        {toolbarNode}
      </div>
    );
    return (
      <Card title={cardHeader}>
        {innerHeader}
        <div ref={containerRef}>
          {tableContent}
        </div>
      </Card>
    );
  }

  return (
    <div ref={containerRef}>
      {toolbarNode}
      {tableContent}
    </div>
  );
}

export default EnhancedTable;
