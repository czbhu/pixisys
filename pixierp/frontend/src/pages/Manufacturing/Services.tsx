import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm, Tabs, AutoComplete, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Option } = Select;
const { TabPane } = Tabs;

interface Service {
  id: number;
  name: string;
  code: string;
  description: string;
  unit: string;
  unit_display: string;
  calculation_basis: string;
  calculation_basis_display: string;
  unit_price: number;
  unit_cost_price: number;
  markup_percentage: number;
  unit_selling_price: number;
  currency: string;
  category: string;
  is_active: boolean;
  created_by_name: string;
  created_at: string;
  default_supplier?: number;
  default_supplier_name?: string;
  is_internal_production: boolean;
  internal_production_department?: number;
  internal_production_department_name?: string;
  internal_production_cost: number;
  internal_fixed_cost: number;
  internal_price_per_unit: number;
  internal_price_per_perimeter: number;
  internal_price_per_area: number;
  internal_price_per_weight: number;
  internal_price_per_time: number;
  calculation_unit?: string;
}

interface Supplier {
  id: number;
  name: string;
}

interface Department {
  id: number;
  name: string;
}

interface CostItem {
  id?: number;
  service: number;
  supplier?: number;
  supplier_name?: string;
  is_internal: boolean;
  name: string;
  calculation_type: string;
  calculation_type_display?: string;
  unit: string;
  unit_price: number;
  markup_percentage: number;
  selling_price?: number;
  currency: string;
  is_active: boolean;
  rounding_step?: number;
}

const Services: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form] = Form.useForm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<{ value: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isInternalProduction, setIsInternalProduction] = useState(false);
  
  // Cost items management
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [selectedSourceForCost, setSelectedSourceForCost] = useState<'internal' | number | null>(null);
  const [costItemForm] = Form.useForm();
  const [editingCostItem, setEditingCostItem] = useState<CostItem | null>(null);
  const [costItemModalVisible, setCostItemModalVisible] = useState(false);
  const [selectedCalculationType, setSelectedCalculationType] = useState<string>('unit');
  
  // Added suppliers management
  const [addedSuppliers, setAddedSuppliers] = useState<(Supplier & { is_internal?: boolean })[]>([]);
  const [supplierSearchValue, setSupplierSearchValue] = useState<string>('');
  const [filteredSuppliersForAdd, setFilteredSuppliersForAdd] = useState<{ value: string; label: string }[]>([]);

  // Unit options based on calculation type
  const getUnitOptions = (calculationType: string) => {
    const unitMap: Record<string, string[]> = {
      'fixed': ['db'],
      'unit': ['db'],
      'length': ['mm', 'cm', 'm'],
      'perimeter': ['mm', 'cm', 'm'],
      'area': ['cm\u00b2', 'm\u00b2'],
      'weight': ['g', 'kg', 't'],
      'time': ['perc', 'negyed \u00f3ra', 'f\u00e9l\u00f3ra', '\u00f3ra', 'nap'],
    };
    return unitMap[calculationType] || ['db'];
  };

  // Calculate selling price from unit price and markup
  const calculateSellingPrice = (unitPrice: number, markupPercentage: number): number => {
    return unitPrice * (1 + markupPercentage / 100);
  };

  // Calculate markup from unit price and selling price
  const calculateMarkup = (unitPrice: number, sellingPrice: number): number => {
    if (unitPrice === 0) return 0;
    return ((sellingPrice - unitPrice) / unitPrice) * 100;
  };

  useEffect(() => {
    fetchServices();
    fetchSuppliers();
    fetchDepartments();
    
    if (searchParams.get('create') === 'true') {
      handleCreate();
    }
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await api.get('/manufacturing/services/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setServices(data);
    } catch (error) {
      message.error('Hiba a szolgáltatások betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/crm/companies/?company_type=supplier');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      // Sort alphabetically by name
      const sorted = data.sort((a: Supplier, b: Supplier) => a.name.localeCompare(b.name, 'hu'));
      setSuppliers(sorted);
      // Initialize filtered list with all suppliers
      setFilteredSuppliersForAdd(sorted.map((s: Supplier) => ({ value: s.name, label: s.name })));
    } catch (error) {
      console.error('Hiba a beszállítók betöltésekor:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/hr/departments/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setDepartments(data);
    } catch (error) {
      console.error('Hiba az osztályok betöltésekor:', error);
    }
  };

  const fetchCostItems = async (serviceId: number, sourceType: 'internal' | number) => {
    try {
      let url = `/manufacturing/service-cost-items/?service_id=${serviceId}`;
      if (sourceType === 'internal') {
        url += '&is_internal=true';
      } else {
        url += `&supplier_id=${sourceType}`;
      }
      
      const response = await api.get(url);
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setCostItems(data);
    } catch (error) {
      console.error('Hiba a költség elemek betöltésekor:', error);
      setCostItems([]);
    }
  };

  const fetchAddedSuppliers = async (serviceId: number) => {
    try {
      const response = await api.get(`/manufacturing/service-cost-items/?service_id=${serviceId}`);
      const allCostItems = Array.isArray(response.data) ? response.data : (response.data.results || []);
      
      // Get unique suppliers from cost items
      const uniqueSuppliers: Map<string, Supplier & { is_internal?: boolean }> = new Map();
      
      // Check for internal production
      const hasInternal = allCostItems.some((item: CostItem) => item.is_internal);
      if (hasInternal) {
        uniqueSuppliers.set('internal', { id: -1, name: 'Belső gyártás', is_internal: true });
      }
      
      // Add external suppliers
      allCostItems.forEach((item: CostItem) => {
        if (item.supplier && item.supplier_name && !uniqueSuppliers.has(`supplier_${item.supplier}`)) {
          uniqueSuppliers.set(`supplier_${item.supplier}`, { 
            id: item.supplier, 
            name: item.supplier_name,
            is_internal: false 
          });
        }
      });
      
      setAddedSuppliers(Array.from(uniqueSuppliers.values()));
    } catch (error) {
      console.error('Hiba a hozzáadott beszállítók betöltésekor:', error);
      setAddedSuppliers([]);
    }
  };

  const handleCreate = () => {
    setEditingService(null);
    form.resetFields();
    setIsInternalProduction(false);
    setSelectedSourceForCost(null);
    setCostItems([]);
    setAddedSuppliers([]);
    setSupplierSearchValue('');
    setModalVisible(true);
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setIsInternalProduction(service.is_internal_production);
    form.setFieldsValue(service);
    
    // Load added suppliers
    fetchAddedSuppliers(service.id);
    
    // Load default source cost items
    if (service.is_internal_production) {
      setSelectedSourceForCost('internal');
      fetchCostItems(service.id, 'internal');
    } else if (service.default_supplier) {
      setSelectedSourceForCost(service.default_supplier);
      fetchCostItems(service.id, service.default_supplier);
    } else {
      setSelectedSourceForCost(null);
      setCostItems([]);
    }
    
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/manufacturing/services/${id}/`);
      message.success('Szolgáltatás törölve');
      fetchServices();
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      let savedService: any;
      if (editingService) {
        const res = await api.patch(`/manufacturing/services/${editingService.id}/`, values);
        savedService = res.data;
        message.success('Szolgáltatás frissítve');
      } else {
        const res = await api.post('/manufacturing/services/', values);
        savedService = res.data;
        message.success('Szolgáltatás létrehozva');
      }
      setModalVisible(false);
      fetchServices();
      
      if (searchParams.get('from_rfq') === 'true' && savedService) {
        Modal.confirm({
          title: 'Visszatérés az ajánlathoz',
          content: 'Szeretnél visszatérni az ajánlathoz és beilleszteni ezt a szolgáltatást?',
          okText: 'Igen',
          cancelText: 'Nem',
          onOk: () => {
            const channel = new BroadcastChannel('pixi_rfq_item_creation');
            channel.postMessage({ type: 'ITEM_CREATED', data: { item: savedService, itemType: 'service' } });
            window.close();
          }
        });
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Hiba a mentés során');
      console.error(error);
    }
  };

  const handleSupplierSearch = (searchText: string) => {
    const filtered = suppliers
      .filter(s => s.name.toLowerCase().includes(searchText.toLowerCase()))
      .map(s => ({ value: s.name }));
    setFilteredSuppliers(filtered);
  };

  const handleSupplierSelect = (value: string) => {
    const supplier = suppliers.find(s => s.name === value);
    if (supplier && editingService) {
      setSelectedSourceForCost(supplier.id);
      fetchCostItems(editingService.id, supplier.id);
    }
  };

  const handleSupplierSearchForAdd = (searchText: string) => {
    setSupplierSearchValue(searchText);
    // Filter out already added suppliers
    const addedSupplierIds = addedSuppliers.filter(s => !s.is_internal).map(s => s.id);
    
    let filtered;
    if (!searchText || searchText.trim() === '') {
      // Show all available suppliers when search is empty
      filtered = suppliers
        .filter(s => !addedSupplierIds.includes(s.id))
        .map(s => ({ value: s.name, label: s.name }));
    } else {
      // Filter by search text
      filtered = suppliers
        .filter(s => !addedSupplierIds.includes(s.id) && s.name.toLowerCase().includes(searchText.toLowerCase()))
        .map(s => ({ value: s.name, label: s.name }));
    }
    
    setFilteredSuppliersForAdd(filtered);
  };

  const handleAddSupplier = (supplierName: string) => {
    const supplier = suppliers.find(s => s.name === supplierName);
    if (!supplier) {
      message.warning('Beszállító nem található');
      return;
    }
    
    // Check if already added
    if (addedSuppliers.some(s => s.id === supplier.id)) {
      message.warning('Ez a beszállító már hozzá van adva');
      return;
    }
    
    setAddedSuppliers([...addedSuppliers, { ...supplier, is_internal: false }]);
    setSupplierSearchValue('');
    message.success(`${supplier.name} hozzáadva`);
  };

  const handleRemoveSupplier = async (supplierId: number, isInternal: boolean) => {
    if (!editingService) return;
    
    try {
      // Delete all cost items for this supplier
      const response = await api.get(`/manufacturing/service-cost-items/?service_id=${editingService.id}${isInternal ? '&is_internal=true' : `&supplier_id=${supplierId}`}`);
      const itemsToDelete = Array.isArray(response.data) ? response.data : (response.data.results || []);
      
      for (const item of itemsToDelete) {
        await api.delete(`/manufacturing/service-cost-items/${item.id}/`);
      }
      
      // Update state
      setAddedSuppliers(addedSuppliers.filter(s => 
        isInternal ? !s.is_internal : s.id !== supplierId
      ));
      
      // Clear selection if this was the selected source
      if ((isInternal && selectedSourceForCost === 'internal') || 
          (!isInternal && selectedSourceForCost === supplierId)) {
        setSelectedSourceForCost(null);
        setCostItems([]);
      }
      
      message.success('Beszállító és költségelemei törölve');
    } catch (error) {
      message.error('Hiba a beszállító törlésekor');
      console.error(error);
    }
  };

  const handleSourceChange = (value: string | number) => {
    if (!editingService) return;
    
    if (value === 'internal') {
      setSelectedSourceForCost('internal');
      fetchCostItems(editingService.id, 'internal');
    } else if (typeof value === 'number') {
      setSelectedSourceForCost(value);
      fetchCostItems(editingService.id, value);
    } else {
      setSelectedSourceForCost(null);
      setCostItems([]);
    }
  };

  const handleAddCostItem = () => {
    if (!editingService) {
      message.warning('Először mentsd el a szolgáltatást');
      return;
    }
    
    setEditingCostItem(null);
    setSelectedCalculationType('unit');
    costItemForm.resetFields();
    costItemForm.setFieldsValue({
      service: editingService.id,
      is_internal: selectedSourceForCost === 'internal',
      supplier: selectedSourceForCost !== 'internal' ? selectedSourceForCost : undefined,
      calculation_type: 'unit',
      unit: 'db',
      currency: 'HUF',
      is_active: true,
      unit_price: 0,
      markup_percentage: 35,
      selling_price: 0,
    });
    setCostItemModalVisible(true);
  };

  const handleEditCostItem = (item: CostItem) => {
    setEditingCostItem(item);
    setSelectedCalculationType(item.calculation_type);
    costItemForm.setFieldsValue(item);
    setCostItemModalVisible(true);
  };

  const handleDeleteCostItem = async (id: number) => {
    try {
      await api.delete(`/manufacturing/service-cost-items/${id}/`);
      message.success('Költség elem törölve');
      if (editingService && selectedSourceForCost) {
        fetchCostItems(editingService.id, selectedSourceForCost);
      }
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleCostItemSubmit = async (values: any) => {
    try {
      if (editingCostItem) {
        await api.patch(`/manufacturing/service-cost-items/${editingCostItem.id}/`, values);
        message.success('Költség elem frissítve');
      } else {
        await api.post('/manufacturing/service-cost-items/', values);
        message.success('Költség elem létrehozva');
      }
      setCostItemModalVisible(false);
      if (editingService && selectedSourceForCost) {
        fetchCostItems(editingService.id, selectedSourceForCost);
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Hiba a mentés során');
      console.error(error);
    }
  };

  const getTotalCost = () => {
    return costItems.reduce((sum, item) => sum + Number(item.unit_price || 0), 0);
  };

  const getTotalSelling = () => {
    return costItems.reduce((sum, item) => sum + Number(item.selling_price || 0), 0);
  };

  const getAverageMarkup = () => {
    const total = getTotalCost();
    if (total === 0) return 0;
    const totalSelling = getTotalSelling();
    return ((totalSelling - total) / total * 100).toFixed(2);
  };

  const handleTransferPrices = () => {
    // Determine conversion factor
    const baseUnit = form.getFieldValue('unit');
    const calcUnit = form.getFieldValue('calculation_unit') || baseUnit;
    let factor = 1;

    // Mapping: unit name -> value relative to base (arbitrary, just for conversion logic)
    // We only support simple time/dimension conversions that are common
    if (baseUnit !== calcUnit) {
      if (baseUnit === 'hour' && calcUnit === 'minute') factor = 60; // 1 hour = 60 minutes. If price is X/min, price/hour = X*60
      else if (baseUnit === 'minute' && calcUnit === 'hour') factor = 1/60;
      else if (baseUnit === 'm' && calcUnit === 'mm') factor = 1000;
      else if (baseUnit === 'mm' && calcUnit === 'm') factor = 1/1000;
      // Add more as needed. If Unknown, assume 1.
    }

    const cost = getTotalCost() * factor;
    const selling = getTotalSelling() * factor;
    const markup = cost > 0 ? ((selling - cost) / cost * 100) : 0;
    
    form.setFieldsValue({
      unit_cost_price: Number(cost.toFixed(2)),
      unit_selling_price: Number(selling.toFixed(2)),
      markup_percentage: Number(markup.toFixed(2))
    });
    
    message.success(`Árak átvezetve az alapadatokhoz (Faktor: ${factor})`);
  };

  const columns = [
    {
      title: 'Kód',
      dataIndex: 'code',
      key: 'code',
      width: 100,
    },
    {
      title: 'Szolgáltatás neve',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Kategória',
      dataIndex: 'category',
      key: 'category',
      width: 150,
    },
    {
      title: 'Mértékegység',
      dataIndex: 'unit_display',
      key: 'unit_display',
      width: 120,
    },
    {
      title: 'Gyártás',
      key: 'source',
      width: 150,
      render: (_: any, record: Service) => {
        return record.is_internal_production && record.internal_production_department_name ? (
          <Tag color="green">{record.internal_production_department_name}</Tag>
        ) : record.default_supplier_name ? (
          <Tag color="blue">{record.default_supplier_name}</Tag>
        ) : (
          <Tag color="default">Nincs</Tag>
        );
      },
    },
    {
      title: 'Státusz',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (is_active: boolean) => (
        <Tag color={is_active ? 'green' : 'red'}>
          {is_active ? 'Aktív' : 'Inaktív'}
        </Tag>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: Service) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Biztosan törli?"
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const costItemColumns = [
    {
      title: 'Megnevezés',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Típus',
      dataIndex: 'calculation_type_display',
      key: 'calculation_type_display',
    },
    {
      title: 'Egység',
      dataIndex: 'unit',
      key: 'unit',
    },
    {
      title: 'Egységár',
      dataIndex: 'unit_price',
      key: 'unit_price',
      render: (value: number) => `${Number(value).toLocaleString()} HUF`,
    },
    {
      title: 'Haszon (%)',
      dataIndex: 'markup_percentage',
      key: 'markup_percentage',
      render: (value: number) => `${Number(value).toFixed(2)}%`,
    },
    {
      title: 'Eladási ár',
      dataIndex: 'selling_price',
      key: 'selling_price',
      render: (value: number) => `${Number(value).toLocaleString()} HUF`,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: CostItem) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => handleEditCostItem(record)}
          />
          <Popconfirm
            title="Biztosan törlöd?"
            onConfirm={() => handleDeleteCostItem(record.id!)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>Szolgáltatások</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Új szolgáltatás
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={services}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editingService ? 'Szolgáltatás szerkesztése' : 'Új szolgáltatás'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={900}
        style={{ top: 20 }}
      >
        <Tabs defaultActiveKey="1">
          <TabPane tab="Alapadatok" key="1">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                currency: 'HUF',
                is_active: true,
                unit: 'db',
                unit_cost_price: 0,
                markup_percentage: 35,
                unit_selling_price: 0,
                is_internal_production: false,
              }}
            >
              <Form.Item
                name="name"
                label="Szolgáltatás neve"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Input />
              </Form.Item>

              <Form.Item
                name="code"
                label="Kód"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Input />
              </Form.Item>

              <Form.Item name="description" label="Leírás">
                <Input.TextArea rows={3} />
              </Form.Item>

              <Form.Item name="category" label="Kategória">
                <Input placeholder="pl. Nyomtatás, Utómunka" />
              </Form.Item>

              <Form.Item name="is_active" label="Aktív" valuePropName="checked">
                <Switch />
              </Form.Item>

              <Form.Item
                name="unit"
                label="Mértékegység"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Select>
                  <Option value="db">darab</Option>
                  <Option value="m2">négyzetméter</Option>
                  <Option value="m">folyóméter</Option>
                  <Option value="hour">óra</Option>
                  <Option value="perimeter">kerület (méter)</Option>
                </Select>
              </Form.Item>

              <Form.Item name="unit_price" label="Egységár (régi, kompatibilitás)" hidden>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item shouldUpdate noStyle>
                {() => (
                  <div style={{ 
                    marginTop: 16, 
                    marginBottom: 16, 
                    padding: '12px 16px', 
                    background: '#f5f5f5', 
                    borderRadius: 4,
                    border: '1px solid #d9d9d9'
                  }}>
                    <strong>1 egységre vonatkozó tájékoztató ár:</strong>
                    <div style={{ marginTop: 8, fontSize: '13px' }}>
                      Bekerülési: {Number(form.getFieldValue('unit_cost_price') || 0).toLocaleString()} HUF
                      {' | '}
                      Haszon: {Number(form.getFieldValue('markup_percentage') || 0).toFixed(2)}%
                      {' | '}
                      Eladási: {Number(form.getFieldValue('unit_selling_price') || 0).toLocaleString()} HUF
                    </div>
                  </div>
                )}
              </Form.Item>

              <Form.Item name="unit_cost_price" hidden initialValue={0}>
                <InputNumber />
              </Form.Item>
              
              <Form.Item name="markup_percentage" hidden initialValue={35}>
                <InputNumber />
              </Form.Item>
              
              <Form.Item name="unit_selling_price" hidden initialValue={0}>
                <InputNumber />
              </Form.Item>

              <Form.Item 
                name="calculation_unit" 
                label="Kalkulációs mértékegység (ha eltér)"
                tooltip="Ha a kalkuláció részleteit más egységben adod meg (pl. perc), mint az alap egység (pl. óra), itt állítsd be a kalkuláció egységét. Átvételkor a rendszer konvertál."
              >
                <Select allowClear>
                  <Option value="db">darab</Option>
                  <Option value="m2">négyzetméter</Option>
                  <Option value="m">folyóméter</Option>
                  <Option value="hour">óra</Option>
                  <Option value="minute">perc</Option>
                  <Option value="perimeter">kerület (méter)</Option>
                </Select>
              </Form.Item>

              <h4 style={{ marginTop: 16, marginBottom: 8 }}>Hozzáadott beszállítók</h4>
              
              {editingService && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Space>
                      <AutoComplete
                        style={{ width: 300 }}
                        value={supplierSearchValue}
                        options={filteredSuppliersForAdd}
                        onSearch={handleSupplierSearchForAdd}
                        onSelect={handleAddSupplier}
                        onFocus={() => handleSupplierSearchForAdd('')}
                        placeholder="Keress beszállítót hozzáadáshoz..."
                      />
                      <Button 
                        icon={<PlusOutlined />}
                        onClick={() => {
                          if (!addedSuppliers.some(s => s.is_internal)) {
                            setAddedSuppliers([{ id: -1, name: 'Belső gyártás', is_internal: true }, ...addedSuppliers]);
                            message.success('Belső gyártás hozzáadva');
                          } else {
                            message.warning('Belső gyártás már hozzá van adva');
                          }
                        }}
                      >
                        Belső gyártás hozzáadása
                      </Button>
                    </Space>
                  </div>
                  
                  <Table
                    size="small"
                    dataSource={addedSuppliers}
                    pagination={false}
                    style={{ marginBottom: 16 }}
                    columns={[
                      {
                        title: 'Beszállító neve',
                        dataIndex: 'name',
                        key: 'name',
                        render: (text: string, record: Supplier & { is_internal?: boolean }) => (
                          <Tag color={record.is_internal ? 'green' : 'blue'}>{text}</Tag>
                        ),
                      },
                      {
                        title: 'Műveletek',
                        key: 'actions',
                        width: 100,
                        render: (_: any, record: Supplier & { is_internal?: boolean }) => (
                          <Popconfirm
                            title="Biztosan törli? Az összes költségelem is törlődik!"
                            onConfirm={() => handleRemoveSupplier(record.id, record.is_internal || false)}
                            okText="Igen"
                            cancelText="Nem"
                          >
                            <Button type="link" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        ),
                      },
                    ]}
                  />
                </>
              )}

              <h4 style={{ marginTop: 16, marginBottom: 8 }}>Alapértelmezett forrás</h4>

              <Form.Item 
                name="is_internal_production" 
                label="Forrás típusa"
              >
                <Select 
                  onChange={(value) => setIsInternalProduction(value)}
                  placeholder="Válassz forrást"
                >
                  <Option value={true}>Belső gyártás</Option>
                  <Option value={false}>Külső beszállító</Option>
                </Select>
              </Form.Item>

              {isInternalProduction ? (
                <Form.Item
                  name="internal_production_department"
                  label="Gyártó osztály"
                  rules={[{ required: true, message: 'Válassz osztályt' }]}
                >
                  <Select placeholder="Válassz osztályt" allowClear>
                    {departments.map(dept => (
                      <Option key={dept.id} value={dept.id}>{dept.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              ) : (
                <Form.Item 
                  name="default_supplier" 
                  label="Alapértelmezett beszállító"
                  rules={[{ required: true, message: 'Válassz beszállítót' }]}
                >
                  <Select placeholder="Válassz a hozzáadott beszállítók közül" allowClear>
                    {addedSuppliers
                      .filter(s => !s.is_internal)
                      .map(supplier => (
                        <Option key={supplier.id} value={supplier.id}>{supplier.name}</Option>
                      ))}
                  </Select>
                </Form.Item>
              )}
            </Form>
          </TabPane>

          <TabPane tab="Beszállítók és árkalkuláció" key="2" disabled={!editingService}>
            <div style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <Select
                    style={{ width: 400 }}
                    placeholder="Válassz beszállítót a költségelemek kezeléséhez"
                    onChange={handleSourceChange}
                    value={selectedSourceForCost === 'internal' ? 'internal' : selectedSourceForCost}
                    showSearch
                    optionFilterProp="children"
                  >
                    {addedSuppliers.map(supplier => (
                      <Option 
                        key={supplier.is_internal ? 'internal' : supplier.id} 
                        value={supplier.is_internal ? 'internal' : supplier.id}
                      >
                        {supplier.name}
                      </Option>
                    ))}
                  </Select>
                  
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    onClick={handleAddCostItem}
                    disabled={!selectedSourceForCost}
                  >
                    Új költség elem
                  </Button>
                </div>
                
                {selectedSourceForCost && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', background: '#f0f0f0', borderRadius: 4 }}>
                    <div style={{ flex: 1 }}>
                      <strong>1 egységre vonatkozó összesítés:</strong> 
                      {' '}Bekerülési: {getTotalCost().toLocaleString()} HUF
                      {' | '}Haszon: {getAverageMarkup()}%
                      {' | '}Eladási: {getTotalSelling().toLocaleString()} HUF
                    </div>
                    <Button onClick={handleTransferPrices}>
                      Árak átvétele az alapadatokhoz
                    </Button>
                  </div>
                )}
              </Space>
            </div>

            <Table
              columns={costItemColumns}
              dataSource={costItems}
              rowKey="id"
              pagination={false}
              scroll={{ x: 800 }}
            />
          </TabPane>
        </Tabs>
      </Modal>

      {/* Cost Item Modal */}
      <Modal
        title={editingCostItem ? 'Költség elem szerkesztése' : 'Új költség elem'}
        open={costItemModalVisible}
        onCancel={() => setCostItemModalVisible(false)}
        onOk={() => costItemForm.submit()}
        width={600}
      >
        <Form
          form={costItemForm}
          layout="vertical"
          onFinish={handleCostItemSubmit}
        >
          <Form.Item name="service" hidden>
            <InputNumber />
          </Form.Item>

          <Form.Item name="supplier" hidden>
            <InputNumber />
          </Form.Item>

          <Form.Item name="is_internal" hidden>
            <InputNumber />
          </Form.Item>

          <Form.Item
            name="name"
            label="Megnevezés"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. Anyagköltség, Munkadíj" />
          </Form.Item>

          <Form.Item
            name="calculation_type"
            label="Számítás típusa"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Select
              onChange={(value) => {
                setSelectedCalculationType(value);
                const units = getUnitOptions(value);
                costItemForm.setFieldsValue({ unit: units[0] });
              }}
            >
              <Option value="fixed">Fix költség</Option>
              <Option value="unit">Darab alapú</Option>
              <Option value="length">Folyóméter</Option>
              <Option value="perimeter">Kerület</Option>
              <Option value="area">Terület</Option>
              <Option value="weight">Súly</Option>
              <Option value="time">Idő</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="unit"
            label="Egység"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Select>
              {getUnitOptions(selectedCalculationType).map(unit => (
                <Option key={unit} value={unit}>{unit}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
             name="rounding_step"
             label="Elszámolási egység (kerekítés)"
             initialValue={1}
             help="Pl. 0.5 = minden megkezdett fél egység. 1 = egészre kerekítés. 10 = tizesével. Mindig felfelé kerekít."
          >
            <InputNumber min={0.0001} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="unit_price"
            label="Egységár (bekerülési)"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              addonAfter="HUF"
              onChange={(value) => {
                const unitPrice = value || 0;
                const markup = costItemForm.getFieldValue('markup_percentage') || 0;
                const sellingPrice = calculateSellingPrice(unitPrice, markup);
                costItemForm.setFieldsValue({ selling_price: sellingPrice });
              }}
            />
          </Form.Item>

          <Form.Item
            name="markup_percentage"
            label="Haszon kulcs"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={1000}
              precision={2}
              addonAfter="%"
              onChange={(value) => {
                const markup = value || 0;
                const unitPrice = costItemForm.getFieldValue('unit_price') || 0;
                const sellingPrice = calculateSellingPrice(unitPrice, markup);
                costItemForm.setFieldsValue({ selling_price: sellingPrice });
              }}
            />
          </Form.Item>

          <Form.Item
            name="selling_price"
            label="Eladási ár"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              addonAfter="HUF"
              onChange={(value) => {
                const sellingPrice = value || 0;
                const unitPrice = costItemForm.getFieldValue('unit_price') || 0;
                if (unitPrice > 0) {
                  const markup = calculateMarkup(unitPrice, sellingPrice);
                  costItemForm.setFieldsValue({ markup_percentage: markup });
                }
              }}
            />
          </Form.Item>

          <Form.Item name="is_active" hidden initialValue={true}>
            <Input />
          </Form.Item>

          <Form.Item name="currency" hidden initialValue="HUF">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Services;
