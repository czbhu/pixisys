import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';

export interface CartItem {
  id: number | string;  // string for variant keys like "42-red-sku"
  product_id: number;   // always the base Material ID
  code: string;
  name: string;
  image_url: string | null;
  unit: string;
  unit_selling_price: number | null;
  currency: string;
  quantity: number;
}

interface CartCtx {
  items: CartItem[];
  add: (product: Omit<CartItem, 'quantity'>) => void;
  remove: (id: number | string) => void;
  setQty: (id: number | string, qty: number) => void;
  clear: () => void;
  count: number;
}

const CART_KEY = 'pixierp_public_cart';

const CartContext = createContext<CartCtx>({
  items: [], add: () => {}, remove: () => {}, setQty: () => {}, clear: () => {}, count: 0,
});

export const PublicCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch {}
  }, [items]);

  const add = useCallback((p: Omit<CartItem, 'quantity'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === p.id);
      if (existing) return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...p, quantity: 1 }];
    });
  }, []);

  const remove = useCallback((id: number | string) => setItems(prev => prev.filter(i => i.id !== id)), []);

  const setQty = useCallback((id: number | string, qty: number) => {
    if (qty <= 0) { setItems(prev => prev.filter(i => i.id !== id)); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return (
    <CartContext.Provider value={{ items, add, remove, setQty, clear, count: items.reduce((s, i) => s + i.quantity, 0) }}>
      {children}
    </CartContext.Provider>
  );
};

export const usePublicCart = () => useContext(CartContext);
