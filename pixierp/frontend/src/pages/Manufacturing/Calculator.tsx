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
  default_material_markup_percentage: number;
  default_service_markup_percentage: number;
  default_markup_percentage: number; // deprecated de még szükséges kompatibilitáshoz
  allowed_materials_details: Material[];
  allowed_services_details: Service[];
  input_fields: any[];
}

interface SelectedMaterial {
  material_id: number;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  calculated_price: number;
}

interface SelectedService {
  service_id: number;
  service_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  calculated_price: number;
}

const Calculator: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Kalkuláció állapotok
  const [inputUnit, setInputUnit] = useState<'mm' | 'cm' | 'm'>('cm'); // Mértékegység választó
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [materialMarkupPercentage, setMaterialMarkupPercentage] = useState<number>(30);
  const [serviceMarkupPercentage, setServiceMarkupPercentage] = useState<number>(35);

  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterial[]>([]);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  const [materialCost, setMaterialCost] = useState<number>(0);
  const [serviceCost, setServiceCost] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [materialSellingPrice, setMaterialSellingPrice] = useState<number>(0);
  const [serviceSellingPrice, setServiceSellingPrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);

  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  useEffect(() => {
    calculatePrices();
  }, [selectedMaterials, selectedServices, materialMarkupPercentage, serviceMarkupPercentage]);
  
  // Amikor a mértékegység változik, újraszámoljuk az összes mennyiséget
  useEffect(() => {
    if (width && height) {
      recalculateMaterialsAndServices();
    }
  }, [inputUnit, width, height, quantity]);

  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/manufacturing/calculator-templates/${templateId}/`);
      setTemplate(response.data);
      setMaterialMarkupPercentage(response.data.default_material_markup_percentage || 30);
      setServiceMarkupPercentage(response.data.default_service_markup_percentage || 35);
    } catch (error) {
      message.error('Hiba a sablon betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  
  // Mértékegység konverzió méterbe
  const convertToMeters = (value: number): number => {
    switch (inputUnit) {
      case 'mm': return value / 1000;
      case 'cm': return value / 100;
      case 'm': return value;
      default: return value / 100; // default cm
    }
  };

  const calculateMaterialQuantity = (material: Material): number => {
    // Szélesség és magasság konvertálása méterbe
    const widthM = convertToMeters(width);
    const heightM = convertToMeters(height);
    const area = widthM * heightM;
    const totalArea = area * quantity;

    // Kihozatal figyelembevétele (hulladék)
    const yieldFactor = material.yield_percentage / 100;
    const adjustedArea = totalArea / yieldFactor;

    // Tekercses anyag esetén folyóméterben számolunk
    if (material.material_format === 'roll' && material.roll_width) {
      const rollWidthM = material.roll_width / 100; // cm-ből méter
      return adjustedArea / rollWidthM; // folyóméter
    }

    // Táblás anyag esetén négyzetméterben
    if (material.material_format === 'sheet') {
      return adjustedArea; // m²
    }

    // Egyéb esetben darabszámban
    return quantity;
  };

  const calculateServiceQuantity = (service: Service): number => {
    const widthM = convertToMeters(width);
    const heightM = convertToMeters(height);
    const area = widthM * heightM;
    const perimeter = 2 * (widthM + heightM); // kerület méterben

    switch (service.calculation_basis) {
      case 'area':
        return area * quantity; // négyzetméter
      case 'perimeter':
        return perimeter * quantity; // kerület
      case 'length':
        return Math.max(widthM, heightM) * quantity; // hosszabb oldal
      case 'quantity':
        return quantity;
      case 'fixed':
        return 1; // fix ár
      default:
        return 1;
    }
  };
  
  const recalculateMaterialsAndServices = () => {
    // Újraszámoljuk az összes kiválasztott anyag és szolgáltatás mennyiségét és árát
    setSelectedMaterials(prev => prev.map(sm => {
      const material = template?.allowed_materials_details.find(m => m.id === sm.material_id);
      if (!material) return sm;
      
      const qty = calculateMaterialQuantity(material);
      const price = qty * (sm.unit_price || 1000); // TODO: valós anyagár
      
      return {
        ...sm,
        quantity: qty,
        calculated_price: price
      };
    }));
    
    setSelectedServices(prev => prev.map(ss => {
      const service = template?.allowed_services_details.find(s => s.id === ss.service_id);
      if (!service) return ss;
      
      const qty = calculateServiceQuantity(service);
      const price = qty * ss.unit_price;
      
      return {
        ...ss,
        quantity: qty,
        calculated_price: price
      };
    }));
  };

  const addMaterial = (materialId: number) => {
    const material = template?.allowed_materials_details.find(m => m.id === materialId);
    if (!material) return;

    const qty = calculateMaterialQuantity(material);
    const unitPrice = 1000; // TODO: Material unit price from supplier
    const calculated_price = qty * unitPrice;

    const newMaterial: SelectedMaterial = {
      material_id: material.id,
      material_name: material.name,
      quantity: qty,
      unit: material.unit,
      unit_price: unitPrice,
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

    const qty = calculateServiceQuantity(service);
    const calculated_price = qty * service.unit_price;

    const newService: SelectedService = {
      service_id: service.id,
      service_name: service.name,
      quantity: qty,
      unit: service.unit,
      unit_price: service.unit_price,
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
    
    // Külön haszonkulcsok az alapanyagra és szolgáltatásokra
    const matSelling = matCost * (1 + materialMarkupPercentage / 100);
    const svcSelling = svcCost * (1 + serviceMarkupPercentage / 100);
    const selling = matSelling + svcSelling;

    setMaterialCost(matCost);
    setServiceCost(svcCost);
    setTotalCost(total);
    setMaterialSellingPrice(matSelling);
    setServiceSellingPrice(svcSelling);
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
          input_unit: inputUnit,
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
        material_markup_percentage: materialMarkupPercentage,
        service_markup_percentage: serviceMarkupPercentage,
      };

      await api.post('/manufacturing/calculations/', payload);
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
      dataIndex: 'quantity',
      key: 'quantity',
      render: (qty: number, record: SelectedMaterial) => `${qty.toFixed(2)} ${record.unit}`
    },
    {
      title: 'Egységár',
      dataIndex: 'unit_price',
      key: 'unit_price',
      render: (price: number) => `${price.toLocaleString()} Ft`
    },
    {
      title: 'Bekerülési ár',
      dataIndex: 'calculated_price',
      key: 'calculated_price',
      render: (price: number) => `${price.toLocaleString()} Ft`
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
                <Col span={6}>
                  <Form.Item label="Mértékegység">
                    <Select
                      value={inputUnit}
                      onChange={(value) => setInputUnit(value as 'mm' | 'cm' | 'm')}
                      style={{ width: '100%' }}
                    >
                      <Option value="mm">Milliméter (mm)</Option>
                      <Option value="cm">Centiméter (cm)</Option>
                      <Option value="m">Méter (m)</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label={`Szélesség (${inputUnit})`}>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={width}
                      onChange={(value) => setWidth(value || 0)}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label={`Magasság (${inputUnit})`}>
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={height}
                      onChange={(value) => setHeight(value || 0)}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
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
                onSelect={(value) => value && addMaterial(value as number)}
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
                onSelect={(value) => value && addService(value as number)}
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
            <Form.Item label="Alapanyag haszonkulcs (%)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={1000}
                precision={2}
                value={materialMarkupPercentage}
                onChange={(value) => setMaterialMarkupPercentage(value || 0)}
                addonAfter="%"
              />
            </Form.Item>
            <Statistic
              title="Alapanyag eladási ár"
              value={materialSellingPrice}
              suffix="HUF"
              precision={0}
              valueStyle={{ color: '#1890ff' }}
            />
            <Divider />
            <Statistic
              title="Szolgáltatás költség"
              value={serviceCost}
              suffix="HUF"
              precision={0}
            />
            <Form.Item label="Szolgáltatás haszonkulcs (%)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={1000}
                precision={2}
                value={serviceMarkupPercentage}
                onChange={(value) => setServiceMarkupPercentage(value || 0)}
                addonAfter="%"
              />
            </Form.Item>
            <Statistic
              title="Szolgáltatás eladási ár"
              value={serviceSellingPrice}
              suffix="HUF"
              precision={0}
              valueStyle={{ color: '#52c41a' }}
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
            <Statistic
              title="ÖSSZ ELADÁSI ÁR"
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
