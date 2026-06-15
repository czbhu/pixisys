/**
 * useNewRowTracker – server-side new-row tracking.
 *
 * On mount: calls POST /api/v1/page-visit/ → gets previous visit time from backend.
 * After data loads: calls GET /api/v1/new-records/ → gets IDs of changed records.
 * On row open: calls POST /api/v1/record-seen/ → marks record seen, removes dot.
 *
 * Badge count = number of new_ids returned by the backend.
 * This is per-user and persisted in the database.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import api from '../services/api';

export const PAGE_KEYS = [
  '/sales/rfqs',
  '/sales/customer-orders',
  '/sales/delivery-notes',
  '/personal/approvals',
  '/manufacturing/ordered-products',
] as const;

export interface NewRowTrackerResult {
  newIds: Set<number>;
  markSeen: (record: any) => void;
  loadNewIds: (recordIds: number[]) => void;
}

export function useNewRowTracker(pageKey: string): NewRowTrackerResult {
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const loadedRef = useRef(false);

  // Register page visit on mount (backend stores timestamp, returns previous visit)
  useEffect(() => {
    api.post('/page-visit/', { page_key: pageKey }).catch(() => {});
    loadedRef.current = false;
    return () => { loadedRef.current = false; };
  }, [pageKey]);

  // Called after data loads with the list of record IDs visible in the table
  const loadNewIds = useCallback((recordIds: number[]) => {
    if (!recordIds.length) {
      setNewIds(new Set());
      window.dispatchEvent(new CustomEvent('erp-badge-update', { detail: { pageKey, count: 0 } }));
      return;
    }
    const idsParam = recordIds.join(',');
    api.get(`/new-records/?page_key=${encodeURIComponent(pageKey)}&ids=${idsParam}`)
      .then(res => {
        const ids = new Set<number>((res.data.new_ids || []).map((id: any) => Number(id)));
        setNewIds(ids);
        window.dispatchEvent(new CustomEvent('erp-badge-update', {
          detail: { pageKey, count: ids.size },
        }));
      })
      .catch(() => {});
  }, [pageKey]);

  // Mark a record as seen: remove dot, decrement badge
  const markSeen = useCallback((record: any) => {
    const id = Number(record.id ?? record.pk);
    if (!id || !newIds.has(id)) return;

    const next = new Set(Array.from(newIds).filter(x => x !== id));
    setNewIds(next);
    window.dispatchEvent(new CustomEvent('erp-badge-seen', {
      detail: { pageKey, count: next.size },
    }));

    // Persist to backend (fire and forget)
    api.post('/record-seen/', { page_key: pageKey, record_ids: [id] }).catch(() => {});
  }, [pageKey, newIds]);

  return { newIds, markSeen, loadNewIds };
}

/**
 * Builds the "new row" dot column for Ant Design tables.
 */
export function newDotColumn(newIds: Set<number>): any {
  return {
    key: '_new_dot',
    title: '',
    width: 14,
    className: 'new-dot-col',
    render: (_: any, record: any) => {
      const id = Number(record.id ?? record.pk);
      return newIds.has(id)
        ? React.createElement('span', {
            title: 'Változott az utolsó látogatás óta',
            style: {
              display: 'inline-block', width: 7, height: 7,
              borderRadius: '50%', background: '#ff4d4f',
              flexShrink: 0, verticalAlign: 'middle',
            },
          })
        : null;
    },
  };
}
