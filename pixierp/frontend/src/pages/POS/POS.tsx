import React, { useState, useEffect, useRef } from 'react';
import { Typography, Card, Row, Col, Button, Table, Input, InputNumber, message, Modal, Space, Tag } from 'antd';
import NumInput from '../../components/NumInput';
import { ShoppingCartOutlined, UserOutlined, PlusOutlined, MinusOutlined, DeleteOutlined } from '@ant-design/icons';
import CustomerSelection from './components/CustomerSelection';
import CheckoutSummary from './components/CheckoutSummary';
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
}

interface POSProps {
  showAllCategories?: boolean;
  allowedMaterialGroupIds?: number[];
}

const POS: React.FC<POSProps> = ({ showAllCategories = true, allowedMaterialGroupIds = [] }) => {
  const [showCheckout, setShowCheckout] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [showDiscountPrices, setShowDiscountPrices] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  
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
    fetchLastTransaction();
    fetchMaterials();
  }, []);

  useEffect(() => {
    filterMaterials();
  }, [searchText, materials, showAllCategories, allowedMaterialGroupIds]);

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

    const handleScroll = () => {
      const rows = body.querySelectorAll('tbody tr');
      if (!rows.length || !filteredMaterials.length) return;

      const bodyRect = body.getBoundingClientRect();
      let visibleRowIndex = -1;

      for (let i = 0; i < rows.length; i++) {
        const rowRect = rows[i].getBoundingClientRect();
        if (rowRect.bottom > bodyRect.top + 10) {
          visibleRowIndex = i;
          break;
        }
      }

      if (visibleRowIndex >= 0 && visibleRowIndex < filteredMaterials.length) {
        const item = filteredMaterials[visibleRowIndex];
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
      }
    };

    body.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      body.removeEventListener('scroll', handleScroll);
      if (productLetterTimeoutRef.current) {
        window.clearTimeout(productLetterTimeoutRef.current);
      }
    };
  }, [filteredMaterials]);

  const fetchMaterials = async () => {
    setLoadingMaterials(true);
    try {
      const response = await api.get('/warehouse/materials/', {
        params: { page_size: 1000, is_active: true }
      });
      const data = response.data.results || response.data;
      setMaterials(data);
      
      // Initialize quantities
      const initialQuantities: Record<number, number> = {};
      data.forEach((mat: Material) => {
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

  const filterMaterials = () => {
    const categoryFiltered = showAllCategories
      ? materials
      : materials.filter((mat) => {
          if (!allowedMaterialGroupIds.length) return false;
          return !!mat.material_group && allowedMaterialGroupIds.includes(mat.material_group);
        });

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

  const fetchLastTransaction = async () => {
    try {
      const response = await api.get('/sales/pos/transactions/last_transaction/');
      if (response.data.exists) {
        setLastTransaction(response.data);
      }
    } catch (error) {
      console.error('Error fetching last transaction:', error);
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

  const handleCheckoutComplete = async () => {
    setCartItems([]);
    setSelectedCustomer(null);
    setShowDiscountPrices(false);
    setShowCheckout(false);
    await fetchLastTransaction();
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
      width: 56,
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
      width: 100,
      render: (stock: number) => (
        <Tag color={stock > 0 ? 'green' : 'red'}>
          {stock} db
        </Tag>
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
    <div className="pos-content" style={{ padding: '12px 16px', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* Last transaction - one row */}
      {lastTransaction && (
        <Card size="small" style={{ marginBottom: '16px' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Text strong>Utolsó vásárlás fizetett összeg: </Text>
              <Text style={{ fontSize: '18px', color: '#52c41a' }}>
                {lastTransaction.total?.toLocaleString('hu-HU')} Ft
              </Text>
            </Col>
            <Col span={12}>
              <Text strong>Visszajáró: </Text>
              <Text style={{ fontSize: '18px', color: '#1890ff' }}>
                {lastTransaction.change?.toLocaleString('hu-HU')} Ft
              </Text>
            </Col>
          </Row>
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: '10px' }}>
        {/* Customer button */}
        <Col flex="auto">
          <Button
            type={selectedCustomer ? 'default' : 'primary'}
            icon={!selectedCustomer ? <UserOutlined /> : undefined}
            onClick={() => setCustomerModalOpen(true)}
            size="large"
            block
            style={{ 
              height: '60px', 
              fontSize: '16px',
              padding: selectedCustomer ? '4px 12px' : undefined,
              whiteSpace: 'normal',
              textAlign: 'left'
            }}
          >
            {selectedCustomer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%' }}>
                <UserOutlined style={{ fontSize: '20px', flexShrink: 0 }} />
                <div style={{ flex: 1, lineHeight: '1.3', overflow: 'visible' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '1px' }}>
                    {selectedCustomer.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginBottom: '1px' }}>
                    {selectedCustomer.address}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 500, color: '#444', wordBreak: 'break-all' }}>
                    {getDisplayTaxNumber(selectedCustomer)}
                  </div>
                </div>
              </div>
            ) : (
              'Nyugtás'
            )}
          </Button>
        </Col>
        
        {/* Discount toggle button */}
        <Col>
          <Button
            size="large"
            disabled={!selectedCustomer}
            onClick={() => setShowDiscountPrices((prev) => !prev)}
            style={{
              height: '60px',
              minWidth: '220px',
              backgroundColor: showDiscountPrices ? '#52c41a' : '#8c8c8c',
              borderColor: showDiscountPrices ? '#52c41a' : '#8c8c8c',
              color: 'white',
              fontWeight: 600,
              opacity: selectedCustomer ? 1 : 0.65
            }}
          >
            {showDiscountPrices ? 'Kedvezmény: ✓' : 'Kedvezmény: Nincs'}
          </Button>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* Products section - left side */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              </div>
            }
            styles={{ header: { padding: '12px 16px' }, body: { padding: '8px' } }}
            style={{ height: 'calc(100vh - 168px)' }}
          >
            <div style={{ position: 'relative' }}>
              <Table
                className="pos-products-table pos-compact-table"
                dataSource={filteredMaterials}
                columns={productColumns}
                rowKey="id"
                loading={loadingMaterials}
                pagination={false}
                scroll={{ y: 'calc(100vh - 260px)' }}
                size="small"
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
        </Col>

        {/* Cart section - right side */}
        <Col xs={24} lg={10}>
          <Card
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
            style={{ height: 'calc(100vh - 168px)' }}
          >
            <Table
              className="pos-cart-table pos-compact-table"
              dataSource={cartItems}
              columns={cartColumns}
              rowKey={(item, index) => `${item.material_id}-${index}`}
              pagination={false}
              scroll={{ y: 'calc(100vh - 350px)' }}
              size="small"
              tableLayout="fixed"
              locale={{ emptyText: 'Üres kosár' }}
            />
          </Card>
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
    </div>
  );
};

export default POS;
