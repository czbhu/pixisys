import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pixierp_order_cart_v1';

export interface CartItem {
  id: string;
  // Material
  materialKey: string;       // String(ref_id) OR "name:materialName" – used for dedup
  materialId: number | null;
  materialName: string;
  supplierName: string | null;
  needed: number;
  unit: string;
  costPrice: number;
  costItemIds: number[];     // manufacturing cost_item IDs for email rendering
  manufacturingProductId: number;
  // Source context
  sourceType: 'rfq' | 'customer_order' | 'ordered_product' | 'unknown';
  sourceId: number;
  sourceNumber: string;
  sourceItemName: string;
  // Status
  status: 'in_cart' | 'ordered';
  orderedAt?: string;
  addedAt: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (data: Omit<CartItem, 'id' | 'addedAt' | 'status'>) => string;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<CartItem>) => void;
  markOrdered: (ids: string[], orderedAt: string) => void;
  clearOrdered: () => void;
  /** Find a cart item for a specific material+product+source combo */
  findItem: (manufacturingProductId: number, materialKey: string, sourceId?: number) => CartItem | undefined;
  totalActiveCount: number;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export const useCart = (): CartContextType => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((data: Omit<CartItem, 'id' | 'addedAt' | 'status'>): string => {
    const id = `cart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setItems(prev => [...prev, { ...data, id, status: 'in_cart', addedAt: new Date().toISOString() }]);
    return id;
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<CartItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }, []);

  const markOrdered = useCallback((ids: string[], orderedAt: string) => {
    setItems(prev => prev.map(it => ids.includes(it.id) ? { ...it, status: 'ordered', orderedAt } : it));
  }, []);

  const clearOrdered = useCallback(() => {
    setItems(prev => prev.filter(it => it.status !== 'ordered'));
  }, []);

  const findItem = useCallback((mProductId: number, mKey: string, srcId?: number): CartItem | undefined => {
    return items.find(it =>
      it.manufacturingProductId === mProductId &&
      it.materialKey === mKey &&
      (srcId == null || srcId === 0 ? true : it.sourceId === srcId)
    );
  }, [items]);

  const totalActiveCount = items.filter(it => it.status === 'in_cart').length;

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateItem,
      markOrdered, clearOrdered, findItem,
      totalActiveCount, drawerOpen, setDrawerOpen,
    }}>
      {children}
    </CartContext.Provider>
  );
};
