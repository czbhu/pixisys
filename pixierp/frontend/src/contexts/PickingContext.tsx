import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pixierp_picking_v1';

export interface PickingItem {
  id: string;
  // Material
  materialKey: string;
  materialId: number | null;
  materialName: string;
  supplierName: string | null;
  needed: number;
  unit: string;
  costItemIds: number[];
  manufacturingProductId: number;
  // Source
  sourceType: 'rfq' | 'customer_order' | 'ordered_product' | 'unknown';
  sourceId: number;
  sourceNumber: string;
  sourceItemName: string;
  // Status
  status: 'pending' | 'in_list' | 'picked';
  addedAt: string;
  pickedAt?: string;
  pickWarehouseId?: number;
  pickWarehouseName?: string;
  pickedQuantity?: number;
  note?: string;
}

interface PickingContextType {
  items: PickingItem[];
  addItem: (data: Omit<PickingItem, 'id' | 'addedAt' | 'status'>) => string;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<PickingItem>) => void;
  moveToList: (ids: string[]) => void;
  markPicked: (id: string, warehouseId: number, warehouseName: string, qty: number) => void;
  clearPicked: () => void;
  findItem: (manufacturingProductId: number, materialKey: string, sourceId?: number) => PickingItem | undefined;
  totalPendingCount: number;
}

const PickingContext = createContext<PickingContextType | null>(null);

export const usePicking = (): PickingContextType => {
  const ctx = useContext(PickingContext);
  if (!ctx) throw new Error('usePicking must be used within PickingProvider');
  return ctx;
};

export const PickingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<PickingItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((data: Omit<PickingItem, 'id' | 'addedAt' | 'status'>): string => {
    const id = `pick_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setItems(prev => [...prev, { ...data, id, status: 'pending', addedAt: new Date().toISOString() }]);
    return id;
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<PickingItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }, []);

  const moveToList = useCallback((ids: string[]) => {
    setItems(prev => prev.map(it => ids.includes(it.id) ? { ...it, status: 'in_list' as const } : it));
  }, []);

  const markPicked = useCallback((id: string, warehouseId: number, warehouseName: string, qty: number) => {
    setItems(prev => prev.map(it => it.id === id ? {
      ...it,
      status: 'picked' as const,
      pickedAt: new Date().toISOString(),
      pickWarehouseId: warehouseId,
      pickWarehouseName: warehouseName,
      pickedQuantity: qty,
    } : it));
  }, []);

  const clearPicked = useCallback(() => {
    setItems(prev => prev.filter(it => it.status !== 'picked'));
  }, []);

  const findItem = useCallback((mProductId: number, mKey: string, srcId?: number): PickingItem | undefined => {
    return items.find(it =>
      it.manufacturingProductId === mProductId &&
      it.materialKey === mKey &&
      (srcId == null || srcId === 0 ? true : it.sourceId === srcId)
    );
  }, [items]);

  const totalPendingCount = items.filter(it => it.status === 'pending').length;

  return (
    <PickingContext.Provider value={{
      items, addItem, removeItem, updateItem,
      moveToList, markPicked, clearPicked, findItem,
      totalPendingCount,
    }}>
      {children}
    </PickingContext.Provider>
  );
};
