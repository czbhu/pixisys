import React, { useState, useEffect, useRef } from 'react';
import { Typography, Card, Row, Col, Button, Table, Input, InputNumber, message, Modal, Space, Tag, Form, Descriptions, Spin, Tabs, Empty } from 'antd';
import NumInput from '../../components/NumInput';
import { ShoppingCartOutlined, UserOutlined, PlusOutlined, MinusOutlined, DeleteOutlined, EditOutlined, AppstoreOutlined, CloseCircleFilled, ShoppingOutlined } from '@ant-design/icons';
import CustomerSelection from './components/CustomerSelection';
import CheckoutSummary from './components/CheckoutSummary';
import FuelScreen from './components/FuelScreen';
import FuelPumpStrip from './components/FuelPumpStrip';
import api from '../../services/api';
import './POS.css';

const { Title, Text } = Typography;

interface CartItem {
  material_id: number;
  product_code: string;
  product_name: string;
  product_description: string;
  quantity: number;
  unit: string;
  gross_unit_price: number;
  net_unit_price: number;
  vat_rate: number;
  is_discounted: boolean;
  original_gross_price?: number;
  fuel_transaction_id?: number;
}

interface Customer {
  id: number;
  name: string;
  address: string;
  tax_number: string;
  full_tax_number?: string;
  vat_code?: string;
  county_code?: string;
  email: string;
}

interface Material {
  id: number;
  code: string;
  name: string;
  description: string;
  unit: string;
  gross_price: number;
  net_price: number;
  vat_rate: number;
  current_stock: number;
  discount_price?: number;
  material_group?: number | null;
  material_groups?: number[] | null;
}

interface MaterialGroup {
  id: number;
  name: string;
  parent: number | null;
  image_url?: string | null;
}

interface POSProps {
  showAllCategories?: boolean;
  allowedMaterialGroupIds?: number[];
  allowedWarehouseIds?: number[];
  fuel?: import('./components/FuelScreen').FuelContext | null;
  posId?: number | null;
  onTransactionCompleted?: () => void;
}

const POS: React.FC<POSProps> = ({ showAllCategories = true, allowedMaterialGroupIds = [], allowedWarehouseIds = [], fuel = null, posId = null, onTransactionCompleted }) => {
  const [showCheckout, setShowCheckout] = useState(false);
  const [showFuel, setShowFuel] = useState(false);
  const [pendingRebills, setPendingRebills] = useState<any[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDiscountPrices, setShowDiscountPrices] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  // Product detail/edit sheet
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMaterial, setDetailMaterial] = useState<any>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailForm] = Form.useForm();
  const [detailSuppliers, setDetailSuppliers] = useState<any[]>([]);
  const [detailCostItems, setDetailCostItems] = useState<any[]>([]);
  const [detailStocks, setDetailStocks] = useState<any[]>([]);
  const [detailSizes, setDetailSizes] = useState<any[]>([]);
  const [detailVariants, setDetailVariants] = useState<any[]>([]);
  
  // Product list states
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [currentProductLetter, setCurrentProductLetter] = useState<string | null>(null);
  const [showProductLetter, setShowProductLetter] = useState(false);
  const productLetterTimeoutRef = useRef<number | null>(null);
  const searchInputRef = useRef<any>(null);

  // Category browser
  const [categories, setCategories] = useState<MaterialGroup[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryModalParentId, setCategoryModalParentId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');

  // Reszponzív mód: lg (992px) alatti képernyőkön a panelek egymás alá kerülnek
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 991px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 991px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Táblamagasság mérése: a termékkosár/lista pontosan a rendelkezésre álló helyig érjen
  // (a virtuális táblához numerikus scroll.y kell, ezért mérünk ResizeObserver-rel)
  const productsWrapRef = useRef<HTMLDivElement>(null);
  const cartWrapRef = useRef<HTMLDivElement>(null);
  const [prodTableY, setProdTableY] = useState(420);
  const [cartTableY, setCartTableY] = useState(320);

  useEffect(() => {
    const measure = () => {
      const pw = productsWrapRef.current;
      if (pw) {
        const header = pw.querySelector('.ant-table-header') as HTMLElement | null;
        setProdTableY(Math.max(180, pw.clientHeight - (header?.offsetHeight || 40) - 2));
      }
      const cw = cartWrapRef.current;
      if (cw) {
        const header = cw.querySelector('.ant-table-header') as HTMLElement | null;
        setCartTableY(Math.max(120, cw.clientHeight - (header?.offsetHeight || 40) - 2));
      }
    };
    measure();
    const t = setTimeout(measure, 150); // a táblafejléc renderelése után újramér
    const ro = new ResizeObserver(measure);
    if (productsWrapRef.current) ro.observe(productsWrapRef.current);
    if (cartWrapRef.current) ro.observe(cartWrapRef.current);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [isMobile, materials, categories]);

  // Get display tax number (full format if available)
  const getDisplayTaxNumber = (customer: Customer | null): string => {
    if (!customer) return '';
    
    // 1. Try full_tax_number first
    if (customer.full_tax_number && customer.full_tax_number.trim()) {
      return customer.full_tax_number;
    }
    
    // 2. Try to build from parts (tax_number-vat_code-county_code)
    if (customer.tax_number && customer.vat_code && customer.county_code) {
      return `${customer.tax_number}-${customer.vat_code}-${customer.county_code}`;
    }
    
    // 3. Fallback to tax_number only
    return customer.tax_number || '';
  };

  // Request fullscreen on mount if opened in new window
  useEffect(() => {
    const requestFullscreen = async () => {
      try {
        // Check if document is not already in fullscreen
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (error) {
        console.log('Fullscreen request failed:', error);
        // Fullscreen might be blocked by browser policy, just continue normally
      }
    };
    
    // Small delay to ensure DOM is ready
    const timer = setTimeout(requestFullscreen, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchPendingRebills();
  }, []);

  // Refetch products whenever the POS's allowed warehouse restriction changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchMaterials();
  }, [JSON.stringify(allowedWarehouseIds)]);

  useEffect(() => {
    filterMaterials();
  }, [searchText, materials, showAllCategories, allowedMaterialGroupIds, selectedCategoryId, categories]);

  // Kategória modal megnyitásakor görgetés a kiválasztott kategória csempéjéhez
  useEffect(() => {
    if (!categoryModalOpen || selectedCategoryId === null) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-cat-id="${selectedCategoryId}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 150);
    return () => clearTimeout(timer);
  }, [categoryModalOpen, categoryModalParentId, selectedCategoryId]);

  useEffect(() => {
    const handleGlobalTyping = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const isTypingInInput = !!activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      );

      if (isTypingInInput) {
        return;
      }

      if (event.key === 'Escape') {
        setSearchText('');
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        setSearchText(prev => prev.slice(0, -1));
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setSearchText(prev => prev + event.key);
        searchInputRef.current?.focus?.();
      }
    };

    window.addEventListener('keydown', handleGlobalTyping);
    return () => window.removeEventListener('keydown', handleGlobalTyping);
  }, []);

  useEffect(() => {
    const body = document.querySelector('.pos-products-table .ant-table-body');
    if (!body) return;

    const handleScroll = (e: Event) => {
      if (!filteredMaterials.length) return;

      // Virtuális táblánál a DOM-ban csak a látható sorok vannak, és a görgető
      // elem a belső rc-virtual-list-holder: az indexet a scroll pozícióból
      // számoljuk a tényleges sormagasság alapján.
      const scrollEl = e.target as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const firstRow = body.querySelector('tbody tr') as HTMLElement | null;
      const rowHeight = firstRow?.offsetHeight || 30;
      const rowIndex = Math.max(0, Math.min(
        filteredMaterials.length - 1,
        Math.round(scrollTop / rowHeight),
      ));

      const item = filteredMaterials[rowIndex];
      const firstLetter = (item?.name || '').charAt(0).toUpperCase();
      if (firstLetter) {
        setCurrentProductLetter(firstLetter);
        setShowProductLetter(true);
        if (productLetterTimeoutRef.current) {
          window.clearTimeout(productLetterTimeoutRef.current);
        }
        productLetterTimeoutRef.current = window.setTimeout(() => {
          setShowProductLetter(false);
        }, 600);
      }
    };

    // capture: a virtuális lista belső konténerének scroll eseményét is elkapjuk
    body.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => {
      body.removeEventListener('scroll', handleScroll, { capture: true } as any);
      if (productLetterTimeoutRef.current) {
        window.clearTimeout(productLetterTimeoutRef.current);
      }
    };
  }, [filteredMaterials]);

  const fetchMaterials = async () => {
    setLoadingMaterials(true);
    try {
      const params: any = { is_active: true };
      if (allowedWarehouseIds.length > 0) {
        params.warehouse_ids = allowedWarehouseIds.join(',');
      }
      // Dedicated lightweight, unpaginated endpoint (minimal fields) — loads the
      // whole product catalog (thousands of items) in a single fast request.
      const response = await api.get('/warehouse/materials/pos-products/', { params });
      const all: Material[] = response.data || [];
      setMaterials(all);
      
      // Initialize quantities
      const initialQuantities: Record<number, number> = {};
      all.forEach((mat: Material) => {
        initialQuantities[mat.id] = 1;
      });
      setQuantities(initialQuantities);
    } catch (error) {
      console.error('Error fetching materials:', error);
      message.error('Nem sikerült betölteni a termékeket');
    } finally {
      setLoadingMaterials(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/warehouse/material-groups/', { params: { is_active: true, page_size: 500 } });
      const data = response.data.results || response.data;
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // A kategória kiválasztásakor az összes alkategóriája is beleszámít a szűrésbe.
  const collectCategoryIdsWithDescendants = (id: number, groups: MaterialGroup[]): number[] => {
    const children = groups.filter(g => g.parent === id);
    return [id, ...children.flatMap(c => collectCategoryIdsWithDescendants(c.id, groups))];
  };

  // Egy termék akkor tartozik egy (gyermekekkel bővített) kategória-halmazhoz,
  // ha a material_group FK VAGY a material_groups M2M kapcsolat bármelyike illeszkedik.
  // (A külső szinkronból származó termékek jellemzően csak M2M kapcsolattal rendelkeznek.)
  const matchesAnyCategory = (mat: Material, ids: number[]): boolean => {
    if (mat.material_group && ids.includes(mat.material_group)) return true;
    if (mat.material_groups && mat.material_groups.some(id => ids.includes(id))) return true;
    return false;
  };

  const filterMaterials = () => {
    let categoryFiltered = showAllCategories
      ? materials
      : materials.filter((mat) => {
          if (!allowedMaterialGroupIds.length) return false;
          return matchesAnyCategory(mat, allowedMaterialGroupIds);
        });

    if (selectedCategoryId !== null) {
      const idsWithDescendants = collectCategoryIdsWithDescendants(selectedCategoryId, categories);
      categoryFiltered = categoryFiltered.filter(mat => matchesAnyCategory(mat, idsWithDescendants));
    }

    if (!searchText) {
      setFilteredMaterials(categoryFiltered);
      return;
    }

    const search = searchText.toLowerCase();
    const filtered = categoryFiltered.filter(mat =>
      mat.code?.toLowerCase().includes(search) ||
      mat.name?.toLowerCase().includes(search) ||
      mat.description?.toLowerCase().includes(search)
    );
    setFilteredMaterials(filtered);
  };

  const openMaterialDetail = async (materialId: number) => {
    setDetailModalOpen(true);
    setDetailEditing(false);
    setDetailLoading(true);
    setDetailSuppliers([]);
    setDetailCostItems([]);
    setDetailStocks([]);
    setDetailSizes([]);
    setDetailVariants([]);
    try {
      const [matRes, supRes, costRes, stockRes, sizeRes, variantRes] = await Promise.all([
        api.get(`/warehouse/materials/${materialId}/`),
        api.get('/warehouse/material-suppliers/', { params: { material: materialId } }),
        api.get('/warehouse/material-cost-items/', { params: { material_id: materialId } }),
        api.get('/warehouse/material-stocks/', { params: { material_id: materialId } }),
        api.get('/warehouse/material-sizes/', { params: { material_id: materialId } }),
        api.get('/warehouse/material-variants/', { params: { material: materialId } }),
      ]);
      setDetailMaterial(matRes.data);
      setDetailSuppliers(supRes.data.results || supRes.data || []);
      setDetailCostItems(costRes.data.results || costRes.data || []);
      setDetailStocks(stockRes.data.results || stockRes.data || []);
      setDetailSizes(sizeRes.data.results || sizeRes.data || []);
      setDetailVariants(variantRes.data.results || variantRes.data || []);
    } catch (error) {
      console.error('Error fetching material detail:', error);
      message.error('Nem sikerült betölteni a termék adatlapját');
      setDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const startEditingDetail = () => {
    if (!detailMaterial) return;
    detailForm.setFieldsValue({
      name: detailMaterial.name,
      description: detailMaterial.description,
      unit: detailMaterial.unit,
      unit_selling_price: detailMaterial.unit_selling_price,
    });
    setDetailEditing(true);
  };

  const saveDetailEdits = async (values: any) => {
    if (!detailMaterial) return;
    try {
      const response = await api.patch(`/warehouse/materials/${detailMaterial.id}/`, values);
      setDetailMaterial(response.data);
      setDetailEditing(false);
      message.success('Termék adatai mentve');
      fetchMaterials();
    } catch (error) {
      console.error('Error saving material:', error);
      message.error('Hiba történt a mentés során');
    }
  };

  const handleAddToCart = (material: Material, useDiscount: boolean) => {
    const quantity = quantities[material.id] || 1;
    const price = useDiscount && material.discount_price ? material.discount_price : material.gross_price;
    
    const cartItem: CartItem = {
      material_id: material.id,
      product_code: material.code,
      product_name: material.name,
      product_description: material.description || '',
      quantity: quantity,
      unit: material.unit,
      gross_unit_price: price,
      net_unit_price: material.net_price,
      vat_rate: material.vat_rate,
      is_discounted: useDiscount && !!material.discount_price,
      original_gross_price: material.gross_price
    };

    const existingItemIndex = cartItems.findIndex(
      item => item.material_id === material.id && item.is_discounted === cartItem.is_discounted
    );

    if (existingItemIndex >= 0) {
      const updated = [...cartItems];
      updated[existingItemIndex].quantity += quantity;
      setCartItems(updated);
      message.success({
        content: `${material.name} mennyisége növelve (${updated[existingItemIndex].quantity} ${material.unit})`,
        duration: 1.5,
      });
    } else {
      setCartItems([...cartItems, cartItem]);
      message.success({
        content: `${material.name} hozzáadva a kosárhoz`,
        duration: 1.5,
      });
    }
  };

  const fetchPendingRebills = async () => {
    try {
      const { data } = await api.get('/fuel/transactions/pending_rebills/');
      setPendingRebills(Array.isArray(data) ? data : (data?.results || []));
    } catch {
      // csak ha üzemanyag modul van – csendben
    }
  };

  const addRebillToCart = (rebill: any) => {
    const gradeId = rebill.fuel_grade;
    const grade = fuel?.grades.find((g) => g.id === gradeId);
    if (!grade || !grade.material) {
      message.error('Az üzemanyag fajtához nincs termék rendelve (Beállítások → Modulok)');
      return;
    }
    if (cartItems.some((item) => item.fuel_transaction_id === rebill.id)) {
      message.warning('Ez a tétel már a kosárban van');
      return;
    }
    const price = Number(rebill.unit_price) || grade.price || 0;
    const quantity = Number(rebill.volume) || 0;
    if (quantity <= 0) {
      message.warning('A tétel mennyisége 0');
      return;
    }
    const cartItem: CartItem = {
      material_id: grade.material,
      product_code: `FUEL-${grade.fuel_grade_id}`,
      product_name: `${grade.name} – ${rebill.pump_name}${rebill.nozzle_number ? ` ${rebill.nozzle_number}. pisztoly` : ''} (újrakibizonylatolás)`,
      product_description: `Sztornózott bizonylat kút tranzakciója #${rebill.pts_transaction_number ?? '—'}`,
      quantity,
      unit: grade.unit || 'liter',
      gross_unit_price: price,
      net_unit_price: Math.round((price / 1.27) * 100) / 100,
      vat_rate: 27,
      is_discounted: false,
      fuel_transaction_id: rebill.id,
    };
    setCartItems([...cartItems, cartItem]);
    message.success({
      content: `${grade.name} ${quantity.toFixed(2)} l a kosárban`,
      duration: 1.5,
    });
  };

  const handleTakeFuelToCart = (pumpStatus: any) => {
    if (!fuel) return;
    const ftx = pumpStatus.fuel_transaction;
    if (!ftx) return;
    const gradeId = ftx.fuel_grade ?? pumpStatus.fuel_grade;
    const grade = fuel.grades.find((g) => g.id === gradeId);
    if (!grade || !grade.material) {
      message.error('Az üzemanyag fajtához nincs termék rendelve (Beállítások → Modulok)');
      return;
    }
    if (cartItems.some((item) => item.fuel_transaction_id === ftx.id)) {
      message.warning('Ez a tankolás már a kosárban van');
      return;
    }
    const price = Number(ftx.unit_price) || grade.price || 0;
    const quantity = Number(ftx.volume) || 0;
    if (quantity <= 0) {
      message.warning('A tankolás mennyisége 0');
      return;
    }
    const cartItem: CartItem = {
      material_id: grade.material,
      product_code: `FUEL-${grade.fuel_grade_id}`,
      product_name: `${grade.name} – ${pumpStatus.pump_name}${pumpStatus.nozzle ? ` ${pumpStatus.nozzle}. pisztoly` : ''}`,
      product_description: `Kút tranzakció #${ftx.pts_transaction_number ?? '—'}`,
      quantity,
      unit: grade.unit || 'liter',
      gross_unit_price: price,
      net_unit_price: Math.round((price / 1.27) * 100) / 100,
      vat_rate: 27,
      is_discounted: false,
      fuel_transaction_id: ftx.id,
    };
    setCartItems([...cartItems, cartItem]);
    message.success({
      content: `${grade.name} ${quantity.toFixed(2)} l a kosárban`,
      duration: 1.5,
    });
  };

  const handleUpdateCartItem = (index: number, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveCartItem(index);
      return;
    }
    const updated = [...cartItems];
    updated[index].quantity = quantity;
    setCartItems(updated);
  };

  const handleRemoveCartItem = (index: number) => {
    const item = cartItems[index];
    setCartItems(cartItems.filter((_, i) => i !== index));
    message.info({
      content: `${item.product_name} eltávolítva a kosárból`,
      duration: 1.5,
    });
  };

  const handleClearCart = () => {
    setCartItems([]);
    message.info({
      content: 'Kosár tartalma törölve',
      duration: 1.5,
    });
  };

  const handleQuantityChange = (materialId: number, value: number | null) => {
    setQuantities({
      ...quantities,
      [materialId]: value || 1
    });
  };

  const handleSelectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    setShowDiscountPrices(customer !== null);
    setCustomerModalOpen(false);
  };

  const handleCheckoutComplete = async (completedTransactionId?: number) => {
    const fuelTxIds = Array.from(new Set(
      cartItems.filter((i) => i.fuel_transaction_id).map((i) => i.fuel_transaction_id as number)
    ));
    setCartItems([]);
    setSelectedCustomer(null);
    setShowDiscountPrices(false);
    setShowCheckout(false);
    if (completedTransactionId && fuelTxIds.length) {
      for (const fuelTxId of fuelTxIds) {
        try {
          const { data } = await api.post(`/fuel/transactions/${fuelTxId}/complete/`, {
            pos_transaction: completedTransactionId,
          });
          (data?.warnings || []).forEach((w: string) => message.warning(w));
        } catch (error: any) {
          message.warning(error?.response?.data?.error || 'A kút tranzakció lezárása nem sikerült');
        }
      }
    }
    onTransactionCompleted?.();
    fetchPendingRebills();
  };

  const getCartTotal = () => {
    return cartItems.reduce((sum, item) => sum + (item.gross_unit_price * item.quantity), 0);
  };

  const getCustomerButtonText = () => {
    if (!selectedCustomer) return 'Nyugtás';
    const maxLength = 30;
    const text = `${selectedCustomer.name} (${selectedCustomer.tax_number})`;
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  // Product table columns
  const productColumns = [
    {
      title: 'Művelet',
      key: 'action',
      width: 72,
      className: 'pos-col-action',
      render: (_: any, record: Material) => (
        <Button
          type="primary"
          onClick={() => handleAddToCart(record, showDiscountPrices)}
          size="small"
          style={{ height: 26, minWidth: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          +
        </Button>
      )
    },
    {
      title: 'Név',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      className: 'pos-col-name',
    },
    {
      title: 'Egység',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: 'Bruttó ár',
      dataIndex: 'gross_price',
      key: 'gross_price',
      width: 120,
      render: (price: number, record: Material) => {
        const displayPrice = showDiscountPrices && record.discount_price ? record.discount_price : price;
        return (
          <div>
            <div style={{ fontWeight: 'bold' }}>{(displayPrice ?? 0).toLocaleString('hu-HU')} Ft</div>
            {showDiscountPrices && record.discount_price && (
              <div style={{ textDecoration: 'line-through', color: '#999', fontSize: '12px' }}>
                {(price ?? 0).toLocaleString('hu-HU')} Ft
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Készlet',
      dataIndex: 'current_stock',
      key: 'current_stock',
      width: 90,
      render: (stock: number) => (
        <Tag color={stock > 0 ? 'green' : 'red'}>
          {stock} db
        </Tag>
      )
    },
    {
      title: '',
      key: 'edit',
      // 96px: a jobb szélre érő 56px-es virtuális scrollbar mellett is
      // marad hely a ceruza gombnak (44px gomb + ~52px scroll-terület)
      width: 96,
      fixed: 'right' as const,
      align: 'left' as const,
      render: (_: any, record: Material) => (
        <Button
          icon={<EditOutlined />}
          size="small"
          title="Termék adatlapja"
          onClick={() => openMaterialDetail(record.id)}
        />
      )
    },
  ];

  // Cart table columns
  const cartColumns = [
    {
      title: 'Termék',
      key: 'product',
      render: (_: any, record: CartItem, index: number) => (
        <div className="pos-cart-item-row">
          <div className="pos-cart-item-name">{record.product_name}</div>
          <div className="pos-cart-item-meta">
            <Space.Compact className="pos-cart-cell-qty">
              <Button
                type="primary"
                icon={<MinusOutlined />}
                onClick={() => handleUpdateCartItem(index, record.quantity - 1)}
                size="small"
                style={{ height: 26 }}
              />
              <NumInput
                value={record.quantity}
                min={1}
                onChange={(value) => handleUpdateCartItem(index, value || 1)}
                style={{ width: 54, textAlign: 'center' }}
                size="small"
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleUpdateCartItem(index, record.quantity + 1)}
                size="small"
                style={{ height: 26 }}
              />
            </Space.Compact>
            <span className="pos-cart-cell-unit">{record.unit}</span>
            <span className="pos-cart-cell-unitprice">{(record.gross_unit_price ?? 0).toLocaleString('hu-HU')} Ft</span>
            <strong className="pos-cart-cell-total">{((record.gross_unit_price ?? 0) * record.quantity).toLocaleString('hu-HU')} Ft</strong>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveCartItem(index)}
              size="small"
              style={{ height: 26, minWidth: 30 }}
            />
          </div>
        </div>
      )
    },
  ];

  if (showFuel && fuel) {
    return (
      <FuelScreen
        fuel={fuel}
        posId={posId}
        onClose={() => setShowFuel(false)}
      />
    );
  }

  if (showCheckout) {
    return (
      <CheckoutSummary
        items={cartItems}
        customer={selectedCustomer}
        onUpdateItem={handleUpdateCartItem}
        onRemoveItem={handleRemoveCartItem}
        onComplete={handleCheckoutComplete}
        onCancel={() => setShowCheckout(false)}
      />
    );
  }

  // Main POS screen - all in one page
  return (
    <div
      className="pos-content"
      style={isMobile
        ? { padding: '8px', minHeight: 'calc(100dvh - 64px)' }
        : { padding: '12px 16px', height: 'calc(100vh - 64px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >

      <Row
        gutter={16}
        style={isMobile ? { marginBottom: 8 } : { flex: '1 1 auto', minHeight: 0 }}
      >
        {/* Products section - left side */}
        <Col
          xs={24}
          lg={14}
          style={isMobile ? undefined : { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          {fuel && (
            <FuelPumpStrip
              fuel={fuel}
              posId={posId}
              onTakeToCart={handleTakeFuelToCart}
              onOpenDetails={() => setShowFuel(true)}
            />
          )}
          <div style={{ flex: '1 1 auto', minHeight: 0, height: isMobile ? '58vh' : undefined }}>
          <Card
            className="pos-fill-card"
            title={
              <div className="pos-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Title level={4} style={{ margin: 0 }}>Termékek</Title>
                <Input
                  ref={searchInputRef}
                  className="pos-product-search"
                  placeholder="Keresés cikkszám vagy név alapján..."
                  allowClear
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ flex: 1, textAlign: 'center' }}
                  size="middle"
                />
                <Button
                  icon={<AppstoreOutlined />}
                  type={selectedCategoryId !== null ? 'primary' : 'default'}
                  onClick={() => {
                    // Ha már van kiválasztott kategória, a modal egyből annak a
                    // szintjére nyisson (a kiválasztott csempe látszódjon).
                    const sel = selectedCategoryId !== null
                      ? categories.find(c => c.id === selectedCategoryId)
                      : undefined;
                    setCategoryModalParentId(sel?.parent ?? null);
                    setCategoryModalOpen(true);
                  }}
                >
                  {selectedCategoryId !== null ? selectedCategoryName : 'Kategóriák'}
                </Button>
                {selectedCategoryId !== null && (
                  <Button
                    type="text"
                    icon={<CloseCircleFilled />}
                    onClick={() => { setSelectedCategoryId(null); setSelectedCategoryName(''); }}
                    title="Szűrő törlése"
                  />
                )}
              </div>
            }
            styles={{ header: { padding: '12px 16px' }, body: { padding: '8px' } }}
            style={{ height: '100%' }}
          >
            <div ref={productsWrapRef} className="pos-table-wrap" style={{ position: 'relative' }}>
              <Table
                className="pos-products-table pos-compact-table"
                dataSource={filteredMaterials}
                columns={productColumns}
                rowKey="id"
                loading={loadingMaterials}
                pagination={false}
                virtual
                scroll={{ x: 716, y: prodTableY }}
                size="small"
                tableLayout="fixed"
              />
              {showProductLetter && currentProductLetter && (
                <div style={{
                  position: 'absolute',
                  right: 24,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: 'rgba(24, 144, 255, 0.9)',
                  color: 'white',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 24,
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                  zIndex: 10
                }}>
                  {currentProductLetter}
                </div>
              )}
            </div>
          </Card>
          </div>
        </Col>

        {/* Cart section - right side */}
        <Col
          xs={24}
          lg={10}
          style={isMobile ? undefined : { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          {/* Bent maradt (újrakibizonylatolandó) üzemanyag tételek */}
          {pendingRebills.length > 0 && (
            <div
              style={{
                flex: '0 0 auto',
                marginBottom: 10,
                padding: '8px 12px',
                borderRadius: 6,
                border: '2px solid #cf1322',
                background: '#fff1f0',
              }}
            >
              <Text strong style={{ color: '#cf1322' }}>Bent maradt tételek (sztnó után újrakibizonylatolandó):</Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {pendingRebills.map((rebill) => (
                  <div
                    key={rebill.id}
                    onClick={() => addRebillToCart(rebill)}
                    style={{
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: '#ffffff',
                      border: '1px solid #ffa39e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <Text strong style={{ color: '#cf1322' }}>
                      {rebill.fuel_grade_name || 'Üzemanyag'} | {Number(rebill.volume).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} liter | {Number(rebill.amount).toLocaleString('hu-HU')} Ft
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      Kosárba 🛒
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Nyugtás / ügyfél + kedvezmény – a kosár szélességében */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flex: '0 0 auto' }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <Button
                type={selectedCustomer ? 'default' : 'primary'}
                icon={!selectedCustomer ? <UserOutlined /> : undefined}
                onClick={() => setCustomerModalOpen(true)}
                size="large"
                block
                style={{
                  height: isMobile ? '48px' : '60px',
                  fontSize: '16px',
                  padding: selectedCustomer ? '4px 10px' : undefined,
                  whiteSpace: 'normal',
                  textAlign: 'left'
                }}
              >
                {selectedCustomer ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%' }}>
                    <UserOutlined style={{ fontSize: '20px', flexShrink: 0 }} />
                    <div style={{ flex: 1, lineHeight: '1.3', minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedCustomer.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedCustomer.address}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 500, color: '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getDisplayTaxNumber(selectedCustomer)}
                      </div>
                    </div>
                  </div>
                ) : (
                  'Nyugtás'
                )}
              </Button>
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <Button
                size="large"
                disabled={!selectedCustomer}
                onClick={() => setShowDiscountPrices((prev) => !prev)}
                style={{
                  height: isMobile ? '48px' : '60px',
                  minWidth: 96,
                  padding: '4px 8px',
                  fontSize: 12,
                  backgroundColor: showDiscountPrices ? '#52c41a' : '#8c8c8c',
                  borderColor: showDiscountPrices ? '#52c41a' : '#8c8c8c',
                  color: 'white',
                  fontWeight: 600,
                  opacity: selectedCustomer ? 1 : 0.65
                }}
              >
                {showDiscountPrices ? 'Kedvezmény ✓' : 'Nincs kedv.'}
              </Button>
            </div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
          <Card
            className="pos-fill-card"
            title={
              <div className="pos-cart-header-row">
                <Title level={4} style={{ margin: 0 }}>Kosár ({cartItems.length})</Title>
                <Text className="pos-cart-header-total">{getCartTotal().toLocaleString('hu-HU')} Ft</Text>
                <Button
                  type="primary"
                  size="middle"
                  disabled={cartItems.length === 0}
                  onClick={() => setShowCheckout(true)}
                >
                  Összesítés
                </Button>
                <Button
                  danger
                  onClick={handleClearCart}
                  disabled={cartItems.length === 0}
                >
                  Törlés
                </Button>
              </div>
            }
            styles={{ header: { padding: '12px 16px' }, body: { padding: '8px' } }}
            style={{ height: '100%' }}
          >
            <div ref={cartWrapRef} className="pos-table-wrap" style={isMobile ? { height: 300 } : undefined}>
              <Table
                className="pos-cart-table pos-compact-table"
                dataSource={cartItems}
                columns={cartColumns}
                rowKey={(item, index) => `${item.material_id}-${index}`}
                pagination={false}
                scroll={{ y: cartTableY }}
                size="small"
                tableLayout="fixed"
                locale={{ emptyText: 'Üres kosár' }}
              />
            </div>
          </Card>
          </div>
        </Col>
      </Row>

      {/* Customer Selection Modal */}
      <Modal
        title="Ügyfél választása"
        open={customerModalOpen}
        onCancel={() => setCustomerModalOpen(false)}
        footer={null}
        width="90%"
        style={{ top: 20 }}
        destroyOnHidden
      >
        <CustomerSelection
          selectedCustomer={selectedCustomer}
          onChange={handleSelectCustomer}
          onDiscountToggle={setShowDiscountPrices}
          showDiscountPrices={showDiscountPrices}
          isModal={true}
        />
      </Modal>

      {/* Product detail / edit sheet */}
      <Modal
        title="Termék adatlap"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={detailEditing ? null : [
          <Button key="edit" type="primary" icon={<EditOutlined />} onClick={startEditingDetail}>
            Szerkesztés
          </Button>,
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            Bezárás
          </Button>,
        ]}
        width={800}
        destroyOnHidden
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : detailMaterial ? (
          <Tabs
            defaultActiveKey="1"
            items={[
              {
                key: '1',
                label: 'Alapadatok',
                children: detailEditing ? (
                  <Form form={detailForm} layout="vertical" onFinish={saveDetailEdits}>
                    <Form.Item name="name" label="Név" rules={[{ required: true, message: 'Kötelező' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="description" label="Leírás">
                      <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item name="unit" label="Egység">
                      <Input />
                    </Form.Item>
                    <Form.Item name="unit_selling_price" label="Eladási ár (nettó)">
                      <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Space>
                      <Button type="primary" htmlType="submit">Mentés</Button>
                      <Button onClick={() => setDetailEditing(false)}>Mégse</Button>
                    </Space>
                  </Form>
                ) : (
                  <Descriptions column={1} bordered size="small">
                    <Descriptions.Item label="Cikkszám">{detailMaterial.code}</Descriptions.Item>
                    <Descriptions.Item label="Név">{detailMaterial.name}</Descriptions.Item>
                    <Descriptions.Item label="Leírás">{detailMaterial.description || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Kategória">{detailMaterial.material_group_name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Beszállító">{detailMaterial.default_supplier_name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Egység">{detailMaterial.unit}</Descriptions.Item>
                    <Descriptions.Item label="Nettó ár">{(detailMaterial.net_price ?? 0).toLocaleString('hu-HU')} Ft</Descriptions.Item>
                    <Descriptions.Item label="Bruttó ár">{(detailMaterial.gross_price ?? 0).toLocaleString('hu-HU')} Ft</Descriptions.Item>
                    <Descriptions.Item label="ÁFA">{detailMaterial.vat_rate}%</Descriptions.Item>
                    <Descriptions.Item label="Készlet">{detailMaterial.current_stock} db</Descriptions.Item>
                  </Descriptions>
                )
              },
              {
                key: '2',
                label: 'Beszállítók és árkalkuláció',
                children: (
                  <>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={detailSuppliers}
                      locale={{ emptyText: 'Nincs rögzített beszállító' }}
                      columns={[
                        { title: 'Beszállító', dataIndex: 'supplier_name', key: 'supplier_name' },
                        { title: 'Cikkszám', dataIndex: 'supplier_code', key: 'supplier_code' },
                        { title: 'Egységár', dataIndex: 'unit_price', key: 'unit_price',
                          render: (v: number) => v != null ? `${Number(v).toLocaleString('hu-HU')} Ft` : '-' },
                        { title: 'Elsődleges', dataIndex: 'is_primary', key: 'is_primary',
                          render: (v: boolean) => v ? 'Igen' : 'Nem' },
                      ]}
                      style={{ marginBottom: 20 }}
                    />
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={detailCostItems}
                      locale={{ emptyText: 'Nincs rögzített árkalkuláció' }}
                      columns={[
                        { title: 'Megnevezés', dataIndex: 'name', key: 'name' },
                        { title: 'Beszállító', dataIndex: 'supplier_name', key: 'supplier_name', render: (v: string) => v || '-' },
                        { title: 'Egységár', dataIndex: 'unit_price', key: 'unit_price',
                          render: (v: number) => v != null ? `${Number(v).toLocaleString('hu-HU')} Ft` : '-' },
                        { title: 'Eladási ár', dataIndex: 'selling_price', key: 'selling_price',
                          render: (v: number) => v != null ? `${Number(v).toLocaleString('hu-HU')} Ft` : '-' },
                      ]}
                    />
                  </>
                )
              },
              {
                key: '3',
                label: 'Készletek',
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={detailStocks}
                    locale={{ emptyText: 'Nincs készletadat' }}
                    columns={[
                      { title: 'Raktár', dataIndex: 'warehouse_name', key: 'warehouse_name' },
                      { title: 'Mennyiség', dataIndex: 'quantity', key: 'quantity',
                        render: (v: number) => `${v} db` },
                      { title: 'Állapot', dataIndex: 'status_display', key: 'status_display' },
                    ]}
                  />
                )
              },
              {
                key: '4',
                label: 'Rendelhető méretek',
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={detailSizes}
                    locale={{ emptyText: 'Nincs rögzített méret' }}
                    columns={[
                      { title: 'Név', dataIndex: 'name', key: 'name' },
                      { title: 'Szélesség (mm)', dataIndex: 'width', key: 'width' },
                      { title: 'Hosszúság (mm)', dataIndex: 'length', key: 'length' },
                      { title: 'Ár', dataIndex: 'effective_price', key: 'effective_price',
                        render: (v: number) => v != null ? `${Number(v).toLocaleString('hu-HU')} Ft` : '-' },
                    ]}
                  />
                )
              },
              {
                key: '5',
                label: 'Variánsok (API)',
                children: (
                  <Table
                    size="small"
                    rowKey="sku"
                    pagination={false}
                    dataSource={detailVariants}
                    locale={{ emptyText: 'Nincs API variáns' }}
                    columns={[
                      { title: 'SKU', dataIndex: 'sku', key: 'sku' },
                      { title: 'Szín', dataIndex: 'color', key: 'color', render: (v: string) => v || '-' },
                      { title: 'Méret', dataIndex: 'size', key: 'size', render: (v: string) => v || '-' },
                      { title: 'Készlet', dataIndex: 'stock_quantity', key: 'stock_quantity',
                        render: (v: number) => `${v} db` },
                      { title: 'Ár', dataIndex: 'price', key: 'price',
                        render: (v: number, r: any) => v != null ? `${Number(v).toLocaleString('hu-HU')} ${r.currency}` : '-' },
                    ]}
                  />
                )
              },
            ]}
          />
        ) : null}
      </Modal>

      {/* Category browser modal: szülőkategória → alkategória drill-down nézet */}
      <Modal
        title="Kategóriák"
        open={categoryModalOpen}
        onCancel={() => setCategoryModalOpen(false)}
        footer={null}
        width={640}
        styles={{ body: { maxHeight: '62vh', overflowY: 'auto' } }}
      >
        {(() => {
          const currentParent = categories.find(c => c.id === categoryModalParentId) || null;
          const children = categories.filter(c => c.parent === categoryModalParentId);
          const hasChildren = (id: number) => categories.some(c => c.parent === id);

          const selectCategory = (id: number | null, name: string) => {
            setSelectedCategoryId(id);
            setSelectedCategoryName(name);
            setCategoryModalOpen(false);
          };

          return (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {categoryModalParentId !== null && (
                  <Button onClick={() => setCategoryModalParentId(currentParent?.parent ?? null)}>
                    ← Vissza
                  </Button>
                )}
                <Button
                  type={selectedCategoryId === null ? 'primary' : 'default'}
                  onClick={() => selectCategory(null, '')}
                >
                  Összes kategória
                </Button>
                {currentParent && (
                  <Button
                    type={selectedCategoryId === currentParent.id ? 'primary' : 'default'}
                    onClick={() => selectCategory(currentParent.id, currentParent.name)}
                  >
                    Összes ebben: {currentParent.name}
                  </Button>
                )}
              </div>
              {categories.length === 0 ? (
                <Empty description="Nincs kategória" />
              ) : children.length === 0 ? (
                <Empty description="Nincs alkategória" />
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  {children.map(c => {
                    const childHasChildren = hasChildren(c.id);
                    const active = selectedCategoryId === c.id;
                    return (
                      <button
                        key={c.id}
                        data-cat-id={c.id}
                        onClick={() => (childHasChildren ? setCategoryModalParentId(c.id) : selectCategory(c.id, c.name))}
                        style={{
                          width: 130, cursor: 'pointer', border: 'none', borderRadius: 10,
                          padding: 0, background: 'transparent', textAlign: 'center',
                        }}
                      >
                        <div style={{
                          height: 100, borderRadius: 10, marginBottom: 6, overflow: 'hidden',
                          background: 'linear-gradient(135deg,#f0f5ff,#e6fffb)',
                          border: `2px solid ${active ? '#1677ff' : '#e8e8e8'}`,
                          boxShadow: active ? '0 0 0 2px #1677ff33' : 'none',
                          position: 'relative',
                        }}>
                          {c.image_url ? (
                            <img src={c.image_url} alt={c.name} loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                              <ShoppingOutlined style={{ fontSize: 32, color: '#bbb' }} />
                            </div>
                          )}
                          {childHasChildren && (
                            <div style={{
                              position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,.55)',
                              color: '#fff', borderRadius: 8, width: 20, height: 20, fontSize: 13,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>›</div>
                          )}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#1677ff' : '#333', lineHeight: 1.3, display: 'block' }}>
                          {c.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default POS;
