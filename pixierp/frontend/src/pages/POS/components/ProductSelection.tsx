import React, { useState, useEffect } from 'react';
import {
  Layout,
  Table,
  Input,
  Button,
  InputNumber,
  Checkbox,
  message,
  Space,
  Card,
  Row,
  Col
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../../services/api';

const { Header, Content } = Layout;
const { Search } = Input;

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
}

interface Props {
  showDiscountPrices: boolean;
  customer: any;
  onAddToCart: (item: any) => void;
  onBack: () => void;
}

const ProductSelection: React.FC<Props> = ({ showDiscountPrices, customer, onAddToCart, onBack }) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [useDiscount, setUseDiscount] = useState(false);

  useEffect(() => {
    fetchMaterials();
  }, []);

  useEffect(() => {
    filterMaterials();
  }, [searchText, materials]);

  const fetchMaterials = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const filterMaterials = () => {
    if (!searchText) {
      setFilteredMaterials(materials);
      return;
    }

    const search = searchText.toLowerCase();
    const filtered = materials.filter(mat =>
      mat.code?.toLowerCase().includes(search) ||
      mat.name?.toLowerCase().includes(search) ||
      mat.description?.toLowerCase().includes(search)
    );
    setFilteredMaterials(filtered);
  };

  const handleQuantityChange = (materialId: number, value: number | null) => {
    setQuantities({
      ...quantities,
      [materialId]: value || 1
    });
  };

  const handleAddToCart = (material: Material) => {
    const quantity = quantities[material.id] || 1;
    
    if (quantity <= 0) {
      message.warning('A mennyiségnek nagyobbnak kell lennie nullánál');
      return;
    }

    if (material.current_stock !== undefined && quantity > material.current_stock) {
      message.warning('Nincs elegendő készlet!');
      return;
    }

    let grossPrice = material.gross_price;
    let originalPrice = undefined;

    if (useDiscount && customer && material.discount_price) {
      originalPrice = material.gross_price;
      grossPrice = material.discount_price;
    }

    onAddToCart({
      material_id: material.id,
      product_code: material.code,
      product_name: material.name,
      product_description: material.description,
      quantity,
      unit: material.unit,
      gross_unit_price: grossPrice,
      net_unit_price: material.net_price,
      vat_rate: material.vat_rate,
      is_discounted: useDiscount && !!originalPrice,
      original_gross_price: originalPrice
    });

    message.success(`${material.name} hozzáadva a kosárhoz`);
    
    // Reset quantity to 1 after adding
    setQuantities({
      ...quantities,
      [material.id]: 1
    });
  };

  const columns = [
    {
      title: 'Cikkszám',
      dataIndex: 'code',
      key: 'code',
      width: 120,
    },
    {
      title: 'Név',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Egység',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: 'Bruttó ár',
      key: 'price',
      width: 150,
      render: (_: any, record: Material) => {
        const price = (useDiscount && customer && record.discount_price) 
          ? record.discount_price 
          : record.gross_price;
        
        return (
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
              {price?.toLocaleString('hu-HU')} Ft
            </div>
            {useDiscount && customer && record.discount_price && (
              <div style={{ textDecoration: 'line-through', color: '#999', fontSize: '12px' }}>
                {record.gross_price?.toLocaleString('hu-HU')} Ft
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Készlet',
      dataIndex: 'current_stock',
      key: 'current_stock',
      width: 100,
      render: (stock: number) => (
        <span style={{ color: stock > 0 ? '#52c41a' : '#ff4d4f' }}>
          {stock !== undefined ? stock.toLocaleString('hu-HU') : '-'}
        </span>
      ),
    },
    {
      title: 'Mennyiség',
      key: 'quantity',
      width: 120,
      render: (_: any, record: Material) => (
        <InputNumber
          min={1}
          max={record.current_stock !== undefined ? record.current_stock : undefined}
          value={quantities[record.id] || 1}
          onChange={(value) => handleQuantityChange(record.id, value)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Művelet',
      key: 'action',
      width: 120,
      render: (_: any, record: Material) => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleAddToCart(record)}
          block
          size="large"
        >
          Kosárba
        </Button>
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
          <h2 style={{ color: 'white', margin: 0 }}>Termékek</h2>
        </Space>
        {customer && (
          <Checkbox
            checked={useDiscount}
            onChange={(e) => setUseDiscount(e.target.checked)}
            style={{ color: 'white', fontSize: '16px' }}
          >
            Kedvezményes árak
          </Checkbox>
        )}
      </Header>
      <Content style={{ padding: '24px' }}>
        <Card>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col flex="auto">
              <Search
                placeholder="Keresés cikkszám, név vagy leírás alapján..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={setSearchText}
                size="large"
                allowClear
                enterButton={<SearchOutlined />}
              />
            </Col>
          </Row>

          <Table
            columns={columns}
            dataSource={filteredMaterials}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `Összesen: ${total} termék` }}
            scroll={{ x: 1200 }}
          />
        </Card>
      </Content>
    </Layout>
  );
};

export default ProductSelection;
