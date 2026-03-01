import { useState, useEffect, useCallback, useRef } from 'react';
import preferencesService from '../services/preferencesService';

/**
 * A hook for storing a named user preference synced to the server.
 *
 * - On mount: loads from localStorage immediately (instant), then fetches
 *   from the server and updates if different.
 * - On change: writes to localStorage instantly and debounces server PATCH
 *   (500 ms) to avoid excessive requests.
 *
 * Usage:
 *   const [colOrder, setColOrder, loading] = useUserPreference('customerOrders_colOrder', DEFAULT_ORDER);
 */
function useUserPreference<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const localKey = `pref_${key}`;

  const readLocal = (): T => {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch { /* ignore */ }
    return defaultValue;
  };

  const [value, setValueState] = useState<T>(readLocal);
  const [loading, setLoading] = useState(true);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: fetch full prefs from server and pick our key
  useEffect(() => {
    let cancelled = false;
    preferencesService.getAll().then(allPrefs => {
      if (cancelled) return;
      if (Object.prototype.hasOwnProperty.call(allPrefs, key)) {
        const serverValue = allPrefs[key] as T;
        setValueState(serverValue);
        localStorage.setItem(localKey, JSON.stringify(serverValue));
      }
      setLoading(false);
    }).catch(() => {
      // Server unavailable — keep localStorage value
      setLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback((updater: T | ((prev: T) => T)) => {
    setValueState(prev => {
      const next = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
      // Write to localStorage immediately
      localStorage.setItem(localKey, JSON.stringify(next));
      // Debounced server write
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        preferencesService.patch({ [key]: next }).catch(() => { /* silent */ });
      }, 500);
      return next;
    });
  }, [key, localKey]);

  return [value, setValue, loading];
}

export default useUserPreference;
