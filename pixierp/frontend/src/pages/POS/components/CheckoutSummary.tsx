import React, { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Row,
  Col,
  Button,
  Table,
  Input,
  Modal,
  message,
  Space,
  Radio,
  Divider,
  Typography,
  Spin,
  InputNumber,
  Tag
} from 'antd';
import NumInput from '../../../components/NumInput';
import QRScannerModal from '../../../components/QRScannerModal';
import {
  ArrowLeftOutlined,
  DollarOutlined,
  CreditCardOutlined,
  IdcardOutlined,
  QrcodeOutlined,
  MoneyCollectOutlined,
  PrinterOutlined,
  CloseOutlined,
  SyncOutlined
} from '@ant-design/icons';
import api from '../../../services/api';
import { famApi, getFamSystemId } from '../../../services/famApi';
import CustomerSelection from './CustomerSelection';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

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

interface Props {
  items: CartItem[];
  customer: Customer | null;
  onUpdateItem: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onComplete: (transactionId?: number) => void;
  onCancel: () => void;
}

const CheckoutSummary: React.FC<Props> = ({
  items,
  customer,
  onUpdateItem,
  onRemoveItem,
  onComplete,
  onCancel
}) => {
  const [transactionType, setTransactionType] = useState<'receipt' | 'invoice'>('receipt');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'customer_card'>('cash');
  const [amountReceived, setAmountReceived] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [shopperIdentification, setShopperIdentification] = useState<any>(null);
  const [shopperName, setShopperName] = useState('');
  const [shopperLoyalty, setShopperLoyalty] = useState<any>(null);
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(customer);
  const [customerData, setCustomerData] = useState({
    name: customer?.name || '',
    address: customer?.address || '',
    tax_number: customer?.tax_number || '',
    email: customer?.email || ''
  });

  const getDisplayTaxNumber = (): string => {
    if (selectedCustomer?.full_tax_number && selectedCustomer.full_tax_number.trim()) {
      return selectedCustomer.full_tax_number;
    }

    if (selectedCustomer?.tax_number && selectedCustomer?.vat_code && selectedCustomer?.county_code) {
      return `${selectedCustomer.tax_number}-${selectedCustomer.vat_code}-${selectedCustomer.county_code}`;
    }

    return customerData.tax_number || '';
  };

  useEffect(() => {
    setSelectedCustomer(customer);
  }, [customer]);

  useEffect(() => {
    if (selectedCustomer) {
      setCustomerData({
        name: selectedCustomer.name,
        address: selectedCustomer.address,
        tax_number: selectedCustomer.tax_number,
        email: selectedCustomer.email
      });
      setTransactionType('invoice');
    } else {
      setCustomerData({
        name: '',
        address: '',
        tax_number: '',
        email: ''
      });
      setTransactionType('receipt');
    }
  }, [selectedCustomer]);

  useEffect(() => {
    const handleGlobalTyping = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const isTypingInInput = !!activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      );

      if (isTypingInInput || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        setPaymentMethod('cash');
        setAmountReceived(prev => {
          if (prev === null) return null;
          const currentValue = String(Math.max(0, Math.floor(prev)));
          const nextValue = currentValue.length > 1 ? currentValue.slice(0, -1) : '';
          return nextValue ? Number(nextValue) : null;
        });
        return;
      }

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        setPaymentMethod('cash');
        setAmountReceived(prev => {
          const base = prev === null ? '' : String(Math.max(0, Math.floor(prev)));
          const next = `${base}${event.key}`.replace(/^0+(?=\d)/, '');
          return Number(next || '0');
        });

        setTimeout(() => {
          const input = document.getElementById('amount-received-input') as HTMLInputElement | null;
          input?.focus();
        }, 0);
      }
    };

    window.addEventListener('keydown', handleGlobalTyping);
    return () => window.removeEventListener('keydown', handleGlobalTyping);
  }, []);

  const calculateTotals = () => {
    let subtotal = 0;
    let netTotal = 0;
    let vatTotal = 0;
    const vatBreakdown: Record<number, { net: number; vat: number; gross: number }> = {};

    const loyaltyDiscounts: Record<number, number> = {};
    (shopperLoyalty?.discounts || []).forEach((d: any) => {
      if (d.material_id != null) loyaltyDiscounts[d.material_id] = Number(d.discount_percent) || 0;
    });

    items.forEach(item => {
      const gross0 = item.gross_unit_price * item.quantity;
      const pct = item.material_id != null ? (loyaltyDiscounts[item.material_id] || 0) : 0;
      const itemGross = pct > 0 ? gross0 * (1 - pct / 100) : gross0;
      const itemNet = pct > 0 ? itemGross / (1 + item.vat_rate / 100) : item.net_unit_price * item.quantity;
      const itemVat = itemNet * (item.vat_rate / 100);

      subtotal += itemGross;
      netTotal += itemNet;
      vatTotal += itemVat;

      if (!vatBreakdown[item.vat_rate]) {
        vatBreakdown[item.vat_rate] = { net: 0, vat: 0, gross: 0 };
      }
      vatBreakdown[item.vat_rate].net += itemNet;
      vatBreakdown[item.vat_rate].vat += itemVat;
      vatBreakdown[item.vat_rate].gross += itemGross;
    });

    let discountAmount = 0;
    let loyaltyDiscountAmount = 0;
    items.forEach(item => {
      const pct = item.material_id != null
        ? ((shopperLoyalty?.discounts || []).find((d: any) => d.material_id === item.material_id)?.discount_percent ?? 0)
        : 0;
      if (pct > 0) loyaltyDiscountAmount += item.gross_unit_price * item.quantity * (Number(pct) / 100);
    });
    if (appliedCoupon) {
      if (appliedCoupon.discount_type === 'fixed') {
        discountAmount = Math.min(appliedCoupon.discount_value, subtotal);
      } else {
        discountAmount = subtotal * (appliedCoupon.discount_value / 100);
      }
    }

    let totalGross = subtotal - discountAmount - loyaltyDiscountAmount;

    // Round to 5 HUF for cash payments
    if (paymentMethod === 'cash') {
      const remainder = totalGross % 5;
      if (remainder <= 2) {
        totalGross -= remainder;
      } else {
        totalGross += (5 - remainder);
      }
    }

    const change = amountReceived ? amountReceived - totalGross : 0;

    return {
      subtotal,
      netTotal,
      vatTotal,
      discountAmount,
      loyaltyDiscountAmount,
      totalGross,
      change,
      vatBreakdown
    };
  };

  const totals = calculateTotals();

  const handleApplyCoupon = async () => {
    if (!couponCode) {
      message.warning('Adja meg a kupon kódot!');
      return;
    }

    try {
      const response = await api.post('/sales/pos/coupons/validate_coupon/', {
        code: couponCode
      });

      if (response.data.valid) {
        setAppliedCoupon(response.data.coupon);
        message.success('Kupon sikeresen alkalmazva!');
      }
    } catch (error: any) {
      setAppliedCoupon(null);
      message.error(error.response?.data?.message || 'Érvénytelen kupon');
    }
  };

  const handleVerifyQR = async (qrCode: string) => {
    try {
      const response = await api.post('/sales/pos/customer-identifications/verify_qr/', {
        qr_code: qrCode
      });

      if (response.data.valid) {
        const cust = response.data.customer;
        setShopperIdentification(response.data.identification_id ? { id: response.data.identification_id } : null);
        setShopperName(cust.name);
        setShopperLoyalty(response.data.loyalty || null);
        setSelectedCustomer((prev: any) => prev ?? { id: cust.id, name: cust.name, email: cust.email });
        const pts = response.data.loyalty?.points;
        message.success(`Vásárló azonosítva: ${cust.name}${pts != null ? ` (${pts} pont)` : ''}`);
      }
    } catch (error: any) {
      setShopperIdentification(null);
      setShopperName('');
      setShopperLoyalty(null);
      message.error(error?.response?.data?.message || 'Érvénytelen vagy lejárt QR kód');
    }
  };

  const clearShopper = () => {
    setShopperIdentification(null);
    setShopperName('');
    setShopperLoyalty(null);
  };

  const handlePayment = async () => {
    if (items.length === 0) {
      message.error('A kosár üres!');
      return;
    }

    if (transactionType === 'invoice' && !customerData.name) {
      message.error('Számlához kötelező az ügyfél adatok megadása!');
      return;
    }

    if (paymentMethod === 'cash' && !amountReceived) {
      message.error('Adja meg az átvett összeget!');
      return;
    }

    if (paymentMethod === 'cash' && amountReceived! < totals.totalGross) {
      message.error('Az átvett összeg kevesebb, mint a fizetendő!');
      return;
    }

    setProcessing(true);
    setPaymentModalVisible(true);
    setPaymentStatus('pending');
    setPaymentMessage('Fizetés feldolgozása...');

    try {
      // Create transaction
      const transactionData = {
        transaction_type: transactionType,
        payment_method: paymentMethod,
        customer: selectedCustomer?.id,
        customer_name: customerData.name,
        customer_address: customerData.address,
        customer_tax_number: customerData.tax_number,
        customer_email: customerData.email,
        shopper_identification: shopperIdentification?.id,
        shopper_name: shopperName,
        coupon: appliedCoupon?.id,
        amount_received: paymentMethod === 'cash' ? amountReceived : null,
        items: items.map(item => {
          const pct = item.material_id != null
            ? ((shopperLoyalty?.discounts || []).find((d: any) => d.material_id === item.material_id)?.discount_percent ?? 0)
            : 0;
          const discounted = Number(pct) > 0;
          const gross = discounted ? item.gross_unit_price * (1 - Number(pct) / 100) : item.gross_unit_price;
          return {
            material: item.material_id,
            product_code: item.product_code,
            product_name: item.product_name,
            product_description: item.product_description,
            quantity: item.quantity,
            unit: item.unit,
            gross_unit_price: gross,
            net_unit_price: discounted ? gross / (1 + item.vat_rate / 100) : item.net_unit_price,
            vat_rate: item.vat_rate,
            is_discounted: discounted || item.is_discounted,
            original_gross_price: discounted ? item.gross_unit_price : item.original_gross_price,
          };
        })
      };

      const createResponse = await api.post('/sales/pos/transactions/', transactionData);
      const transaction = createResponse.data;
      setTransactionId(transaction.id);

      // Process payment
      const paymentResponse = await api.post(
        `/sales/pos/transactions/${transaction.id}/process_payment/`
      );

      if (paymentResponse.data.success) {
        try {
          await famApi.submitDocument(getFamSystemId(), {
            documentType: transactionType === 'invoice' ? 'invoice' : 'receipt',
            source: 'pos',
            externalId: `POS-${transaction.id}`,
            payload: {
              transactionId: transaction.id,
              transactionType,
              totalGross: totals.totalGross,
              paymentMethod,
              customer: customerData,
              items,
            },
          });
        } catch (famError) {
          console.warn('FAM queue submit failed:', famError);
          message.warning('FAM beküldés sorba állítása sikertelen (fizetés rögzítve)');
        }

        setPaymentStatus('success');
        setPaymentMessage(paymentResponse.data.message);
        message.success('Fizetés sikeres!');
      } else {
        setPaymentStatus('failed');
        setPaymentMessage(paymentResponse.data.message);
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      setPaymentStatus('failed');
      setPaymentMessage(error.response?.data?.message || 'Fizetési hiba történt');
      message.error('Fizetési hiba');
    } finally {
      setProcessing(false);
    }
  };

  const handlePrint = async () => {
    if (transactionId) {
      try {
        await api.post(`/sales/pos/transactions/${transactionId}/print_receipt/`);
        message.success('Nyomtatás elindítva');
        handleCompletePayment();
      } catch (error) {
        message.error('Nyomtatási hiba');
      }
    }
  };

  const handleCompletePayment = () => {
    setPaymentModalVisible(false);
    onComplete(transactionId ?? undefined);
  };

  const handleRetryPayment = () => {
    setPaymentModalVisible(false);
    setTimeout(() => handlePayment(), 100);
  };

  const vatColumns = [
    {
      title: 'ÁFA %',
      dataIndex: 'rate',
      key: 'rate',
      render: (rate: number) => `${rate}%`,
    },
    {
      title: 'Nettó',
      dataIndex: 'net',
      key: 'net',
      render: (value: number) => `${value.toLocaleString('hu-HU')} Ft`,
    },
    {
      title: 'ÁFA',
      dataIndex: 'vat',
      key: 'vat',
      render: (value: number) => `${value.toLocaleString('hu-HU')} Ft`,
    },
    {
      title: 'Bruttó',
      dataIndex: 'gross',
      key: 'gross',
      render: (value: number) => `${value.toLocaleString('hu-HU')} Ft`,
    },
  ];

  const vatData = Object.entries(totals.vatBreakdown).map(([rate, values]) => ({
    key: rate,
    rate: parseFloat(rate),
    ...values
  }));

  const cartColumns = [
    {
      title: 'Termék',
      dataIndex: 'product_name',
      key: 'product_name',
      ellipsis: true,
      render: (_: string, record: CartItem) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.product_name}</div>
          <div style={{ color: '#666', fontSize: 12 }}>{record.product_code}</div>
        </div>
      )
    },
    {
      title: 'Menny.',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right' as const,
      render: (value: number) => value.toLocaleString('hu-HU')
    },
    {
      title: 'Egység',
      dataIndex: 'unit',
      key: 'unit',
      align: 'center' as const,
      width: 90
    },
    {
      title: 'Egységár (br.)',
      dataIndex: 'gross_unit_price',
      key: 'gross_unit_price',
      align: 'right' as const,
      render: (value: number) => `${value.toLocaleString('hu-HU')} Ft`
    },
    {
      title: 'Összesen (br.)',
      key: 'line_total',
      align: 'right' as const,
      render: (_: any, record: CartItem) => `${(record.gross_unit_price * record.quantity).toLocaleString('hu-HU')} Ft`
    }
  ];

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ background: '#001529', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={onCancel}
          size="large"
          type="primary"
          style={{ marginRight: 16 }}
        >
          Vissza
        </Button>
        <h2 style={{ color: 'white', margin: 0 }}>Összesítés és Fizetés</h2>
        </div>
        <Text style={{ color: 'white', fontSize: '30px', fontWeight: 700 }}>
          Fizetendő: {totals.totalGross.toLocaleString('hu-HU')} Ft
        </Text>
      </Header>
      <Content style={{ padding: '24px', overflow: 'auto' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={10}>
            <Card title="Ügyfél adatai">
              <Button
                type={selectedCustomer ? 'default' : 'primary'}
                size="large"
                block
                onClick={() => setCustomerModalVisible(true)}
                style={{
                  height: selectedCustomer ? '132px' : '76px',
                  fontSize: '24px',
                  textAlign: 'left',
                  whiteSpace: 'normal',
                  padding: selectedCustomer ? '8px 14px' : undefined
                }}
              >
                {selectedCustomer ? (
                  <div style={{ lineHeight: 1.3 }}>
                    <div style={{ fontSize: '19px', fontWeight: 700 }}>{customerData.name}</div>
                    <div style={{ fontSize: '16px', color: '#666' }}>{customerData.address}</div>
                    <div style={{ fontSize: '16px', color: '#444' }}>{getDisplayTaxNumber()}</div>
                    <div style={{ fontSize: '16px', color: '#666' }}>{customerData.email}</div>
                  </div>
                ) : (
                  'Nyugtás'
                )}
              </Button>
            </Card>

            <Card title="Kosár tartalma" style={{ marginTop: 16 }}>
              <Table
                columns={cartColumns}
                dataSource={items}
                rowKey={(record) => `${record.material_id}-${record.product_code}`}
                pagination={false}
                size="small"
                locale={{ emptyText: 'A kosár üres' }}
              />
            </Card>
          </Col>

          <Col xs={24} xl={14}>
            <Card title="Fizetési mód">
              <Row gutter={16}>
                <Col span={24}>
                  <Radio.Group
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    buttonStyle="solid"
                    size="large"
                    style={{ width: '100%', marginBottom: 24 }}
                  >
                    <Radio.Button value="cash" style={{ width: '33.33%', textAlign: 'center' }}>
                      <MoneyCollectOutlined /> Készpénz
                    </Radio.Button>
                    <Radio.Button value="card" style={{ width: '33.33%', textAlign: 'center' }}>
                      <CreditCardOutlined /> Hitelkártya
                    </Radio.Button>
                    <Radio.Button value="customer_card" style={{ width: '33.33%', textAlign: 'center' }}>
                      <IdcardOutlined /> Üzemanyagkártya
                    </Radio.Button>
                  </Radio.Group>
                </Col>

                <Col span={12}>
                  <div>
                    <Text strong>Részösszeg</Text>
                    <div style={{ fontSize: 28, fontWeight: 600 }}>{totals.subtotal.toLocaleString('hu-HU')} Ft</div>
                  </div>
                </Col>
                {appliedCoupon && (
                  <Col span={12}>
                    <div>
                      <Text strong>{`Kedvezmény (${appliedCoupon.code})`}</Text>
                      <div style={{ fontSize: 28, fontWeight: 600, color: '#52c41a' }}>{totals.discountAmount.toLocaleString('hu-HU')} Ft</div>
                    </div>
                  </Col>
                )}
                <Col span={12}>
                  <div>
                    <Text strong>Fizetendő</Text>
                    <div style={{ fontSize: 34, fontWeight: 700, color: '#1890ff' }}>{totals.totalGross.toLocaleString('hu-HU')} Ft</div>
                  </div>
                </Col>

                {paymentMethod === 'cash' && (
                  <>
                    <Col span={12}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text strong>Átvett összeg:</Text>
                        <NumInput
                          id="amount-received-input"
                          value={amountReceived}
                          onChange={setAmountReceived}
                          size="large"
                          style={{ width: '100%' }}
                          precision={0}
                          min={totals.totalGross}
                        />
                      </Space>
                    </Col>
                    {amountReceived && amountReceived >= totals.totalGross && (
                      <Col span={12}>
                        <div>
                          <Text strong>Visszajáró</Text>
                          <div style={{ fontSize: 34, fontWeight: 700, color: '#52c41a' }}>{totals.change.toLocaleString('hu-HU')} Ft</div>
                        </div>
                      </Col>
                    )}
                  </>
                )}
              </Row>

              <Divider />

              <Row gutter={16}>
                <Col span={12}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text strong>Kupon kód:</Text>
                    <Input.Group compact style={{ display: 'flex' }}>
                      <Input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="Kupon kód"
                        size="large"
                        style={{ flex: 1 }}
                        disabled={!!appliedCoupon}
                      />
                      <Button
                        type="primary"
                        onClick={handleApplyCoupon}
                        size="large"
                        disabled={!!appliedCoupon}
                      >
                        Alkalmaz
                      </Button>
                      {appliedCoupon && (
                        <Button
                          danger
                          onClick={() => {
                            setAppliedCoupon(null);
                            setCouponCode('');
                          }}
                          size="large"
                        >
                          Töröl
                        </Button>
                      )}
                    </Input.Group>
                  </Space>
                </Col>

                <Col span={12}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button
                      size="large" icon={<QrcodeOutlined />} style={{ width: '100%' }}
                      onClick={() => setQrScanOpen(true)}
                    >
                      {shopperName ? 'Ügyfél QR újra olvasása' : 'Ügyfél azonosítása (QR)'}
                    </Button>
                    {shopperName && (
                      <>
                        <Tag color="green" style={{ fontSize: '16px', padding: '8px 16px' }}>
                          {shopperName}
                          {shopperLoyalty?.points != null ? ` · ${shopperLoyalty.points} pont` : ''}
                        </Tag>
                        {totals.loyaltyDiscountAmount > 0 && (
                          <Tag color="orange" style={{ fontSize: '14px', padding: '6px 12px' }}>
                            Kedvezmény: -{Math.round(totals.loyaltyDiscountAmount).toLocaleString('hu-HU')} Ft
                          </Tag>
                        )}
                        <Button size="small" type="link" onClick={clearShopper}>Azonosítás törlése</Button>
                      </>
                    )}
                  </Space>
                </Col>
              </Row>

              <Divider />

              <Row gutter={16}>
                <Col span={24} style={{ textAlign: 'right' }}>
                  <Space>
                    <Button size="large" onClick={onCancel}>
                      Mégse
                    </Button>
                    <Button
                      type="primary"
                      size="large"
                      icon={<DollarOutlined />}
                      onClick={handlePayment}
                      disabled={processing || items.length === 0}
                      style={{ minWidth: 150 }}
                    >
                      Fizet
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Card>

            <Card title="ÁFA összesítő" style={{ marginTop: 16 }}>
              <Table
                columns={vatColumns}
                dataSource={vatData}
                pagination={false}
                size="small"
              />
            </Card>
          </Col>

        </Row>
      </Content>

      <Modal
        title="Ügyfél kiválasztása"
        visible={customerModalVisible}
        onCancel={() => setCustomerModalVisible(false)}
        footer={null}
        width="95vw"
        styles={{ body: { height: 'calc(100vh - 120px)', padding: '16px' } }}
      >
        <CustomerSelection
          selectedCustomer={selectedCustomer}
          onChange={(nextCustomer) => {
            setSelectedCustomer(nextCustomer);
            setCustomerModalVisible(false);
          }}
          onDiscountToggle={() => {}}
          showDiscountPrices={false}
          isModal
        />
      </Modal>

      <QRScannerModal
        open={qrScanOpen}
        onClose={() => setQrScanOpen(false)}
        onScan={(code: string) => {
          setQrScanOpen(false);
          handleVerifyQR(code);
        }}
      />

      {/* Payment processing modal */}
      <Modal
        title="Fizetés"
        visible={paymentModalVisible}
        closable={paymentStatus !== 'pending'}
        maskClosable={false}
        footer={null}
        width={500}
      >
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          {paymentStatus === 'pending' && (
            <>
              <Spin size="large" />
              <Title level={4} style={{ marginTop: 24 }}>{paymentMessage}</Title>
            </>
          )}

          {paymentStatus === 'success' && (
            <>
              <div style={{ fontSize: '64px', color: '#52c41a', marginBottom: 16 }}>✓</div>
              <Title level={3} style={{ color: '#52c41a' }}>Fizetés sikeres!</Title>
              <Text>{paymentMessage}</Text>
              
              <Divider />
              
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Button
                  type="primary"
                  size="large"
                  icon={<PrinterOutlined />}
                  onClick={handlePrint}
                  block
                >
                  Nyomtat és Bezár
                </Button>
                <Button
                  size="large"
                  icon={<CloseOutlined />}
                  onClick={handleCompletePayment}
                  block
                >
                  Bezár
                </Button>
              </Space>
            </>
          )}

          {paymentStatus === 'failed' && (
            <>
              <div style={{ fontSize: '64px', color: '#ff4d4f', marginBottom: 16 }}>✗</div>
              <Title level={3} style={{ color: '#ff4d4f' }}>Sikertelen fizetés</Title>
              <Text>{paymentMessage}</Text>
              
              <Divider />
              
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Button
                  type="primary"
                  size="large"
                  icon={<SyncOutlined />}
                  onClick={handleRetryPayment}
                  block
                >
                  Újra
                </Button>
                <Button
                  size="large"
                  onClick={() => setPaymentModalVisible(false)}
                  block
                >
                  Mégse
                </Button>
              </Space>
            </>
          )}
        </div>
      </Modal>
    </Layout>
  );
};

export default CheckoutSummary;
