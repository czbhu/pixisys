import React from 'react';
import {
  Layout,
  Table,
  Button,
  InputNumber,
  Space,
  Card,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Empty
} from 'antd';
import NumInput from '../../../components/NumInput';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
  MinusOutlined,
  DollarOutlined
} from '@ant-design/icons';

const { Header, Content } = Layout;

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

interface Props {
  items: CartItem[];
  onUpdateItem: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onCheckout: () => void;
  onBack: () => void;
}

const Cart: React.FC<Props> = ({ items, onUpdateItem, onRemoveItem, onCheckout, onBack }) => {
  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.gross_unit_price * item.quantity), 0);
  };

  const calculateNetTotal = () => {
    return items.reduce((sum, item) => sum + (item.net_unit_price * item.quantity), 0);
  };

  const calculateVatTotal = () => {
    return items.reduce((sum, item) => {
      const net = item.net_unit_price * item.quantity;
      const vat = net * (item.vat_rate / 100);
      return sum + vat;
    }, 0);
  };

  const handleQuantityChange = (index: number, delta: number) => {
    const newQuantity = items[index].quantity + delta;
    if (newQuantity > 0) {
      onUpdateItem(index, newQuantity);
    }
  };

  const handleDirectQuantityChange = (index: number, value: number | null) => {
    if (value && value > 0) {
      onUpdateItem(index, value);
    }
  };

  const columns = [
    {
      title: 'Név',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 250,
      render: (text: string, record: CartItem) => (
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{text}</div>
          {record.product_code && (
            <div style={{ color: '#666', fontSize: '12px' }}>Cikkszám: {record.product_code}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Mennyiség',
      key: 'quantity',
      width: 200,
      render: (_: any, record: CartItem, index: number) => (
        <Space.Compact style={{ width: '100%' }}>
          <Button
            icon={<MinusOutlined />}
            onClick={() => handleQuantityChange(index, -1)}
            size="large"
          />
          <NumInput
            value={record.quantity}
            onChange={(value) => handleDirectQuantityChange(index, value)}
            min={1}
            size="large"
            style={{ width: '100%', textAlign: 'center' }}
          />
          <Button
            icon={<PlusOutlined />}
            onClick={() => handleQuantityChange(index, 1)}
            size="large"
          />
        </Space.Compact>
      ),
    },
    {
      title: 'Egység',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: 'Bruttó egységár',
      key: 'unit_price',
      width: 150,
      render: (_: any, record: CartItem) => (
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
            {record.gross_unit_price.toLocaleString('hu-HU')} Ft
          </div>
          {record.is_discounted && record.original_gross_price && (
            <div style={{ textDecoration: 'line-through', color: '#999', fontSize: '12px' }}>
              {record.original_gross_price.toLocaleString('hu-HU')} Ft
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Bruttó összár',
      key: 'total_price',
      width: 150,
      render: (_: any, record: CartItem) => (
        <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#1890ff' }}>
          {(record.gross_unit_price * record.quantity).toLocaleString('hu-HU')} Ft
        </div>
      ),
    },
    {
      title: 'Művelet',
      key: 'action',
      width: 100,
      render: (_: any, record: CartItem, index: number) => (
        <Popconfirm
          title="Biztosan törli ezt a tételt?"
          onConfirm={() => onRemoveItem(index)}
          okText="Igen"
          cancelText="Nem"
        >
          <Button
            danger
            icon={<DeleteOutlined />}
            size="large"
            block
          >
            Töröl
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ background: '#001529', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            size="large"
            type="primary"
          >
            Vissza
          </Button>
          <h2 style={{ color: 'white', margin: 0 }}>Kosár ({items.length} tétel)</h2>
        </Space>
      </Header>
      <Content style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
        {items.length === 0 ? (
          <Card style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="A kosár üres" />
          </Card>
        ) : (
          <>
            <Card style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
              <Table
                columns={columns}
                dataSource={items}
                rowKey={(item, index) => `${item.material_id}-${index}`}
                pagination={false}
                scroll={{ x: 1000 }}
              />
            </Card>

            <Card>
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={8}>
                  <Statistic
                    title="Nettó összesen"
                    value={calculateNetTotal()}
                    precision={2}
                    suffix="Ft"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="ÁFA összesen"
                    value={calculateVatTotal()}
                    precision={2}
                    suffix="Ft"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Bruttó összesen"
                    value={calculateTotal()}
                    precision={2}
                    suffix="Ft"
                    valueStyle={{ color: '#1890ff', fontSize: '32px' }}
                  />
                </Col>
              </Row>

              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button
                  size="large"
                  onClick={onBack}
                  style={{ minWidth: 150 }}
                >
                  Bezár
                </Button>
                <Button
                  type="primary"
                  size="large"
                  icon={<DollarOutlined />}
                  onClick={onCheckout}
                  style={{ minWidth: 150 }}
                >
                  Összesítés
                </Button>
              </Space>
            </Card>
          </>
        )}
      </Content>
    </Layout>
  );
};

export default Cart;
