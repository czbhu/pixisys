import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, Divider, Table, Space,
  message, Row, Col, Statistic, Tag, Modal
} from 'antd';
import {
  CalculatorOutlined, SaveOutlined, PlusOutlined, DeleteOutlined
} from '@ant-design/icons';
import api from '../../services/api';

const { Option } = Select;

interface Material {
  id: number;
  name: string;
  code: string;
  unit: string;
  material_format: string;
  roll_width: number;
  sheet_division: string;
  yield_percentage: number;
}

interface Service {
  id: number;
  name: string;
  code: string;
  unit: string;
  unit_price: number;
  calculation_basis: string;
  category: string;
}

interface Template {
  id: number;
  name: string;
  code: string;
  description: string;
  default_markup_percentage: number;
  allowed_materials_details: Material[];
  allowed_services_details: Service[];
  input_fields: any[];
}

interface SelectedMaterial {
  material_id: number;
  material_name: string;
  quantity: number;
  unit: string;
  calculated_price: number;
}

interface SelectedService {
  service_id: number;
  service_name: string;
  quantity: number;
  unit: string;
  calculated_price: number;
}

const Calculator: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Kalkuláció állapotok
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [markupPercentage, setMarkupPercentage] = useState<number>(30);

  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterial[]>([]);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  const [materialCost, setMaterialCost] = useState<number>(0);
  const [serviceCost, setServiceCost] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);

  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  useEffect(() => {
    calculatePrices();
  }, [selectedMaterials, selectedServices, markupPercentage]);

  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/v1/manufacturing/calculator-templates/${templateId}/`);
      setTemplate(response.data);
      setMarkupPercentage(response.data.default_markup_percentage);
    } catch (error) {
      message.error('Hiba a sablon betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMaterialQuantity = (material: Material): number => {
    // Egyszerű logika: terület alapú számítás (szélesség * magasság * darabszám)
    const area = (width / 100) * (height / 100); // cm-ből méter
    const totalArea = area * quantity;

    // Kihozatal figyelembevétele
    const yieldFactor = material.yield_percentage / 100;
    const adjustedArea = totalArea / yieldFactor;

    // Tekercses anyag esetén folyóméterben számolunk
    if (material.material_format === 'roll' && material.roll_width) {
      return adjustedArea / (material.roll_width / 100); // folyóméter
    }

    // Táblás anyag esetén négyzetméterben
    if (material.material_format === 'sheet') {
      return adjustedArea; // m²
    }

    // Egyéb esetben darabszámban
    return quantity;
  };

  const calculateServiceQuantity = (service: Service): number => {
    const area = (width / 100) * (height / 100); // cm-ből méter
    const perimeter = 2 * ((width / 100) + (height / 100)); // kerület méterben

    switch (service.calculation_basis) {
      case 'area':
        return area * quantity; // négyzetméter
      case 'perimeter':
        return perimeter * quantity; // kerület
      case 'length':
        return (Math.max(width, height) / 100) * quantity; // hosszabb oldal
      case 'quantity':
        return quantity;
      default:
        return 1; // fix ár
    }
  };

  const addMaterial = (materialId: number) => {
    const material = template?.allowed_materials_details.find(m => m.id === materialId);
    if (!material) return;

    const quantity = calculateMaterialQuantity(material);
    const calculated_price = quantity * 1000; // TODO: Material unit price from supplier

    const newMaterial: SelectedMaterial = {
      material_id: material.id,
      material_name: material.name,
      quantity,
      unit: material.unit,
      calculated_price,
    };

    setSelectedMaterials([...selectedMaterials, newMaterial]);
  };

  const removeMaterial = (index: number) => {
    setSelectedMaterials(selectedMaterials.filter((_, i) => i !== index));
  };

  const addService = (serviceId: number) => {
    const service = template?.allowed_services_details.find(s => s.id === serviceId);
    if (!service) return;

    const quantity = calculateServiceQuantity(service);
    const calculated_price = quantity * service.unit_price;

    const newService: SelectedService = {
      service_id: service.id,
      service_name: service.name,
      quantity,
      unit: service.unit,
      calculated_price,
    };

    setSelectedServices([...selectedServices, newService]);
  };

  const removeService = (index: number) => {
    setSelectedServices(selectedServices.filter((_, i) => i !== index));
  };

  const calculatePrices = () => {
    const matCost = selectedMaterials.reduce((sum, m) => sum + m.calculated_price, 0);
    const svcCost = selectedServices.reduce((sum, s) => sum + s.calculated_price, 0);
    const total = matCost + svcCost;
    const selling = total * (1 + markupPercentage / 100);

    setMaterialCost(matCost);
    setServiceCost(svcCost);
    setTotalCost(total);
    setSellingPrice(selling);
  };

  const handleSave = async () => {
    try {
      const payload = {
        template: template?.id,
        input_values: {
          width,
          height,
          quantity,
        },
        selected_materials: selectedMaterials.map(m => ({
          material_id: m.material_id,
          quantity: m.quantity,
          calculated_price: m.calculated_price,
        })),
        selected_services: selectedServices.map(s => ({
          service_id: s.service_id,
          quantity: s.quantity,
          calculated_price: s.calculated_price,
        })),
        markup_percentage: markupPercentage,
      };

      await api.post('/api/v1/manufacturing/calculations/', payload);
      message.success('Kalkuláció elmentve');
    } catch (error) {
      message.error('Hiba a mentés során');
      console.error(error);
    }
  };

  const materialColumns = [
    { title: 'Alapanyag', dataIndex: 'material_name', key: 'material_name' },
    {
      title: 'Mennyiség',
      key: 'quantity',
      render: (_: any, record: SelectedMaterial) => `${record.quantity.toFixed(2)} ${record.unit}`,
    },
    {
      title: 'Ár',
      dataIndex: 'calculated_price',
      key: 'calculated_price',
      render: (price: number) => `${price.toLocaleString()} HUF`,
    },
    {
      title: 'Művelet',
      key: 'action',
      render: (_: any, record: SelectedMaterial, index: number) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeMaterial(index)}
        />
      ),
    },
  ];

  const serviceColumns = [
    { title: 'Szolgáltatás', dataIndex: 'service_name', key: 'service_name' },
    {
      title: 'Mennyiség',
      key: 'quantity',
      render: (_: any, record: SelectedService) => `${record.quantity.toFixed(2)} ${record.unit}`,
    },
    {
      title: 'Ár',
      dataIndex: 'calculated_price',
      key: 'calculated_price',
      render: (price: number) => `${price.toLocaleString()} HUF`,
    },
    {
      title: 'Művelet',
      key: 'action',
      render: (_: any, record: SelectedService, index: number) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeService(index)}
        />
      ),
    },
  ];

  if (!template) {
    return <div>Betöltés...</div>;
  }

  return (
    <div>
      <h2>
        <CalculatorOutlined /> {template.name}
      </h2>
      <p>{template.description}</p>

      <Row gutter={16}>
        <Col span={16}>
          <Card title="Paraméterek" style={{ marginBottom: 16 }}>
            <Form layout="vertical" form={form}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Szélesség (cm)">
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={width}
                      onChange={(value) => setWidth(value || 0)}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Magasság (cm)">
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={height}
                      onChange={(value) => setHeight(value || 0)}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Darabszám">
                    <InputNumber
                      style={{ width: '100%' }}
                      min={1}
                      value={quantity}
                      onChange={(value) => setQuantity(value || 1)}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>

          <Card title="Alapanyagok" style={{ marginBottom: 16 }}>
            <Space style={{ marginBottom: 16 }}>
              <Select
                placeholder="Válassz alapanyagot"
                style={{ width: 300 }}
                onSelect={(value: number) => addMaterial(value)}
                value={null}
              >
                {template.allowed_materials_details.map(m => (
                  <Option key={m.id} value={m.id}>
                    {m.name} ({m.code})
                  </Option>
                ))}
              </Select>
            </Space>
            <Table
              columns={materialColumns}
              dataSource={selectedMaterials}
              rowKey={(record, index) => `material-${index}`}
              pagination={false}
              size="small"
            />
          </Card>

          <Card title="Szolgáltatások">
            <Space style={{ marginBottom: 16 }}>
              <Select
                placeholder="Válassz szolgáltatást"
                style={{ width: 300 }}
                onSelect={(value: number) => addService(value)}
                value={null}
              >
                {template.allowed_services_details.map(s => (
                  <Option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </Option>
                ))}
              </Select>
            </Space>
            <Table
              columns={serviceColumns}
              dataSource={selectedServices}
              rowKey={(record, index) => `service-${index}`}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>

        <Col span={8}>
          <Card title="Összegzés" style={{ position: 'sticky', top: 20 }}>
            <Statistic
              title="Alapanyag költség"
              value={materialCost}
              suffix="HUF"
              precision={0}
            />
            <Divider />
            <Statistic
              title="Szolgáltatás költség"
              value={serviceCost}
              suffix="HUF"
              precision={0}
            />
            <Divider />
            <Statistic
              title="Össz bekerülési ár"
              value={totalCost}
              suffix="HUF"
              precision={0}
              valueStyle={{ color: '#3f8600' }}
            />
            <Divider />
            <Form.Item label="Haszonkulcs (%)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={1000}
                precision={2}
                value={markupPercentage}
                onChange={(value) => setMarkupPercentage(value || 0)}
                addonAfter="%"
              />
            </Form.Item>
            <Divider />
            <Statistic
              title="Eladási ár"
              value={sellingPrice}
              suffix="HUF"
              precision={0}
              valueStyle={{ color: '#cf1322', fontSize: 24, fontWeight: 'bold' }}
            />
            <Divider />
            <Button
              type="primary"
              block
              icon={<SaveOutlined />}
              onClick={handleSave}
              size="large"
            >
              Kalkuláció mentése
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Calculator;
