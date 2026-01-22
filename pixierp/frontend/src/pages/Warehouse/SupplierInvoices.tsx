import React, { useState, useEffect, useRef } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Space,
  message,
  Tag,
  Card,
  Row,
  Col,
  Popconfirm,
  Alert,
  Divider,
  Typography,
  Upload,
  Image,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  InboxOutlined,
  DollarOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  CameraOutlined,
  UploadOutlined,
  FileImageOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile, UploadProps } from 'antd/es/upload';
import dayjs, { Dayjs } from 'dayjs';
import api from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;
const { Title } = Typography;

interface Company {
  id: number;
  name: string;
  tax_number?: string;
}

interface Material {
  id: number;
  name: string;
  material_code: string;
  material_format: string;
  unit: string;
  unit_cost_price?: number;
  dimension_unit?: string;
  available_widths?: number[];
  available_lengths?: number[];
  available_thicknesses?: number[];
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

interface InvoiceItem {
  id?: number;
  material: number;
  material_name?: string;
  warehouse: number;
  warehouse_name?: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
  width?: number;
  length?: number;
  thickness?: number;
  dimension_unit?: string;
  price_warning?: {
    has_warning: boolean;
    expected_price?: number;
    actual_price?: number;
    difference?: number;
    percentage_diff?: number;
  };
}

interface SupplierInvoice {
  id: number;
  invoice_number: string;
  supplier: number;
  supplier_name?: string;
  invoice_date: string;
  fulfillment_date?: string;
  receipt_date?: string;
  due_date?: string;
  payment_date?: string;
  payment_method: string;
  payment_method_display?: string;
  currency: string;
  total_amount: number;
  status: string;
  status_display?: string;
  notes?: string;
  invoice_images?: string[];
  items?: InvoiceItem[];
  items_count?: number;
  created_at?: string;
}

interface InvoiceItem {
  id?: number;
  material: number;
  material_name?: string;
  material_code?: string;
  material_unit?: string;
  warehouse: number;
  warehouse_name?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price?: number;
  width?: number;
  length?: number;
  thickness?: number;
  dimension_unit?: string;
  notes?: string;
}



const SupplierInvoices: React.FC = () => {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const [form] = Form.useForm();
  
  // Dropdown adatok
  const [suppliers, setSuppliers] = useState<Company[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  
  // Számlatételek
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [itemForm] = Form.useForm();
  const [isItemModalVisible, setIsItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InvoiceItem | null>(null);
  
  // Képfeltöltés
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Anyag ár ellenőrzés
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [priceWarning, setPriceWarning] = useState<string | null>(null);
  
  // NAV import
  const [isNavSearchVisible, setIsNavSearchVisible] = useState(false);
  const [navSearchForm] = Form.useForm();
  const [navSearchResults, setNavSearchResults] = useState<any[]>([]);
  const [navSearching, setNavSearching] = useState(false);
  const [navImporting, setNavImporting] = useState(false);



  useEffect(() => {
    loadInvoices();
    loadSuppliers();
    loadMaterials();
    loadWarehouses();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Listen for INVOICE_SELECTED from embedded iframe
      if (event.data && event.data.type === 'INVOICE_SELECTED') {
        const invoice = event.data.payload;
        handleNavImport({
            invoiceNumber: invoice.invoiceNumber,
            supplierTaxNumber: invoice.supplierTaxNumber
        });
        setIsNavSearchVisible(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const response = await api.get('/warehouse/supplier-invoices/');
      setInvoices(response.data.results || response.data);
    } catch (error) {
      message.error('Hiba a számlák betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const response = await api.get('/crm/companies/?is_supplier=true');
      setSuppliers(response.data.results || response.data);
    } catch (error) {
      console.error('Hiba beszállítók betöltésekor:', error);
    }
  };

  const loadMaterials = async () => {
    try {
      const response = await api.get('/warehouse/materials/');
      setMaterials(response.data.results || response.data);
    } catch (error) {
      console.error('Hiba anyagok betöltésekor:', error);
    }
  };

  const loadWarehouses = async () => {
    try {
      const response = await api.get('/warehouse/warehouses/');
      setWarehouses(response.data.results || response.data);
    } catch (error) {
      console.error('Hiba raktárak betöltésekor:', error);
    }
  };

  const showCreateModal = () => {
    setEditingInvoice(null);
    setItems([]);
    form.resetFields();
    form.setFieldsValue({
      currency: 'HUF',
      payment_method: 'transfer',
      status: 'draft',
      invoice_date: dayjs(),
    });
    setIsModalVisible(true);
  };
  
  const showNavSearch = () => {
    navSearchForm.resetFields();
    setNavSearchResults([]);
    setIsNavSearchVisible(true);
  };

  const showEditModal = (invoice: SupplierInvoice) => {
    setEditingInvoice(invoice);
    setItems(invoice.items || []);
    form.setFieldsValue({
      ...invoice,
      invoice_date: invoice.invoice_date ? dayjs(invoice.invoice_date) : null,
      fulfillment_date: invoice.fulfillment_date ? dayjs(invoice.fulfillment_date) : null,
      receipt_date: invoice.receipt_date ? dayjs(invoice.receipt_date) : null,
      due_date: invoice.due_date ? dayjs(invoice.due_date) : null,
      payment_date: invoice.payment_date ? dayjs(invoice.payment_date) : null,
    });
    setIsModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      const payload = {
        ...values,
        invoice_date: values.invoice_date?.format('YYYY-MM-DD'),
        fulfillment_date: values.fulfillment_date?.format('YYYY-MM-DD'),
        receipt_date: values.receipt_date?.format('YYYY-MM-DD'),
        due_date: values.due_date?.format('YYYY-MM-DD'),
        payment_date: values.payment_date?.format('YYYY-MM-DD'),
      };

      if (editingInvoice) {
        await api.put(`/warehouse/supplier-invoices/${editingInvoice.id}/`, payload);
        message.success('Számla módosítva');
      } else {
        const response = await api.post('/warehouse/supplier-invoices/', payload);
        const invoiceId = response.data.id;
        
        // Tételek mentése
        for (const item of items) {
          await api.post('/warehouse/invoice-items/', {
            ...item,
            invoice: invoiceId,
          });
        }
        
        message.success('Számla létrehozva');
      }

      setIsModalVisible(false);
      loadInvoices();
    } catch (error) {
      message.error('Hiba mentés közben');
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/warehouse/supplier-invoices/${id}/`);
      message.success('Számla törölve');
      loadInvoices();
    } catch (error) {
      message.error('Hiba törlés közben');
      console.error(error);
    }
  };

  const handleStatusChange = async (invoice: SupplierInvoice, action: string) => {
    try {
      await api.post(`/warehouse/supplier-invoices/${invoice.id}/${action}/`, {});
      message.success('Státusz frissítve');
      loadInvoices();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Hiba státusz módosításkor');
      console.error(error);
    }
  };

  // Képfeltöltés
  const handleImageUpload = async (file: File, invoiceId: number) => {
    setUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await api.post(
        `/warehouse/supplier-invoices/${invoiceId}/upload_image/`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      
      message.success('Kép feltöltve');
      
      // Frissítjük a számla adatokat
      if (editingInvoice && editingInvoice.id === invoiceId) {
        setEditingInvoice(response.data);
        form.setFieldsValue(response.data);
      }
      
      loadInvoices();
    } catch (error) {
      message.error('Hiba képfeltöltés közben');
      console.error(error);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageDelete = async (invoiceId: number, imagePath: string) => {
    try {
      const response = await api.post(
        `/warehouse/supplier-invoices/${invoiceId}/delete_image/`,
        { image_path: imagePath }
      );
      
      message.success('Kép törölve');
      
      // Frissítjük a számla adatokat
      if (editingInvoice && editingInvoice.id === invoiceId) {
        setEditingInvoice(response.data);
        form.setFieldsValue(response.data);
      }
      
      loadInvoices();
    } catch (error) {
      message.error('Hiba kép törlésekor');
      console.error(error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && editingInvoice) {
      Array.from(files).forEach(file => {
        handleImageUpload(file, editingInvoice.id);
      });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && editingInvoice) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          handleImageUpload(file, editingInvoice.id);
        } else {
          message.warning(`${file.name} nem képfájl`);
        }
      });
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  // NAV import
  const handleNavSearch = async () => {
    try {
      const values = await navSearchForm.validateFields();
      setNavSearching(true);
      
      const response = await api.post(
        '/warehouse/supplier-invoices/search_nav_invoices/',
        values
      );
      
      if (response.data.success) {
        setNavSearchResults(response.data.invoices || []);
        if (response.data.count === 0) {
          message.info('Nincs találat a megadott keresési feltételekkel');
        } else {
          message.success(`${response.data.count} számla találat`);
        }
      } else {
        message.error(response.data.error || 'Keresési hiba');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || 'NAV keresési hiba');
      console.error(error);
    } finally {
      setNavSearching(false);
    }
  };
  
  const handleNavImport = async (navInvoice: any) => {
    try {
      setNavImporting(true);
      
      const response = await api.post(
        '/warehouse/supplier-invoices/import_nav_invoice/',
        {
          invoice_number: navInvoice.invoiceNumber,
          supplier_tax_number: navInvoice.supplierTaxNumber
        }
      );
      
      if (response.data.success) {
        const invoiceData = response.data.invoice_data;
        
        // Beszállító keresése adószám alapján
        const supplier = suppliers.find(
          s => s.tax_number === invoiceData.supplier_tax_number
        );
        
        if (!supplier) {
          message.warning(
            `Beszállító (${invoiceData.supplier_name}) nem található az adatbázisban. Először vedd fel a beszállítót!`
          );
          return;
        }
        
        // Form kitöltése
        form.setFieldsValue({
          invoice_number: invoiceData.invoice_number,
          supplier: supplier.id,
          invoice_date: invoiceData.invoice_date ? dayjs(invoiceData.invoice_date) : dayjs(),
          due_date: invoiceData.due_date ? dayjs(invoiceData.due_date) : null,
          payment_method: invoiceData.payment_method || 'transfer',
          currency: invoiceData.currency || 'HUF',
          total_amount: invoiceData.total_amount,
          notes: invoiceData.notes || '',
          status: 'draft'
        });
        
        // Tételek betöltése (ezeket manuálisan kell hozzárendelni az anyagokhoz)
        setItems([]);
        
        setIsNavSearchVisible(false);
        setIsModalVisible(true);
        
        message.success('Számla adatok importálva! Rendeld hozzá a tételeket az anyagokhoz.');
      } else {
        message.error(response.data.error || 'Import hiba');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || 'NAV import hiba');
      console.error(error);
    } finally {
      setNavImporting(false);
    }
  };

  // Tétel kezelés
  const showAddItem = () => {
    setEditingItem(null);
    setSelectedMaterial(null);
    setPriceWarning(null);
    itemForm.resetFields();
    setIsItemModalVisible(true);
  };

  const showEditItem = (item: InvoiceItem, index: number) => {
    setEditingItem({ ...item, id: index });
    const material = materials.find(m => m.id === item.material);
    setSelectedMaterial(material || null);
    setPriceWarning(null);
    itemForm.setFieldsValue(item);
    setIsItemModalVisible(true);
  };
  
  const handleMaterialChange = (materialId: number) => {
    const material = materials.find(m => m.id === materialId);
    setSelectedMaterial(material || null);
    
    // Alapértelmezett egység beállítása az anyag alapján
    if (material?.unit) {
      itemForm.setFieldsValue({ unit: material.unit });
    }
    
    // Ár ellenőrzés
    const currentPrice = itemForm.getFieldValue('unit_price');
    if (material?.unit_cost_price && currentPrice) {
      const diff = Math.abs(material.unit_cost_price - currentPrice);
      const percentage = (diff / material.unit_cost_price) * 100;
      
      if (percentage > 5) {
        setPriceWarning(
          `Figyelem! Az ár ${percentage.toFixed(1)}%-kal eltér az anyag költségárától (${material.unit_cost_price} Ft)`
        );
      } else {
        setPriceWarning(null);
      }
    }
  };
  
  const handlePriceChange = (price: number | null) => {
    if (selectedMaterial?.unit_cost_price && price) {
      const diff = Math.abs(selectedMaterial.unit_cost_price - price);
      const percentage = (diff / selectedMaterial.unit_cost_price) * 100;
      
      if (percentage > 5) {
        setPriceWarning(
          `Figyelem! Az ár ${percentage.toFixed(1)}%-kal eltér az anyag költségárától (${selectedMaterial.unit_cost_price} Ft)`
        );
      } else {
        setPriceWarning(null);
      }
    }
  };

  const handleItemSubmit = async () => {
    try {
      const values = await itemForm.validateFields();
      const total_price = values.quantity * values.unit_price;
      
      const newItem: InvoiceItem = {
        ...values,
        total_price,
      };

      // Anyag és raktár név hozzáadása megjelenítéshez
      const material = materials.find(m => m.id === values.material);
      const warehouse = warehouses.find(w => w.id === values.warehouse);
      
      if (material) newItem.material_name = material.name;
      if (warehouse) newItem.warehouse_name = warehouse.name;

      if (editingItem && editingItem.id !== undefined) {
        const newItems = [...items];
        newItems[editingItem.id] = newItem;
        setItems(newItems);
      } else {
        setItems([...items, newItem]);
      }

      // Teljes összeg frissítése
      const totalAmount = [...items, newItem].reduce((sum, item) => sum + (item.total_price || 0), 0);
      form.setFieldsValue({ total_amount: totalAmount });

      setIsItemModalVisible(false);
      message.success('Tétel hozzáadva');
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  const handleDeleteItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    
    // Teljes összeg frissítése
    const totalAmount = newItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
    form.setFieldsValue({ total_amount: totalAmount });
    
    message.success('Tétel törölve');
  };

  const getStatusTag = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'default',
      confirmed: 'processing',
      received: 'success',
      paid: 'cyan',
      cancelled: 'error',
    };
    return <Tag color={colors[status] || 'default'}>{status}</Tag>;
  };

  const columns: ColumnsType<SupplierInvoice> = [
    {
      title: 'Számlaszám',
      dataIndex: 'invoice_number',
      key: 'invoice_number',
      width: 150,
    },
    {
      title: 'Beszállító',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      width: 200,
    },
    {
      title: 'Dátum',
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      width: 120,
      render: (date: string) => dayjs(date).format('YYYY.MM.DD'),
    },
    {
      title: 'Esedékesség',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 120,
      render: (date: string) => date ? dayjs(date).format('YYYY.MM.DD') : '-',
    },
    {
      title: 'Összeg',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 120,
      render: (amount: number, record: SupplierInvoice) => 
        `${amount?.toLocaleString()} ${record.currency}`,
    },
    {
      title: 'Fizetési mód',
      dataIndex: 'payment_method_display',
      key: 'payment_method',
      width: 120,
    },
    {
      title: 'Státusz',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Tételek',
      dataIndex: 'items_count',
      key: 'items_count',
      width: 80,
      align: 'center',
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 250,
      fixed: 'right',
      render: (_, record: SupplierInvoice) => (
        <Space size="small">
          {record.status === 'draft' && (
            <>
              <Button
                size="small"
                icon={<CheckOutlined />}
                onClick={() => handleStatusChange(record, 'confirm')}
                title="Megerősítés"
              >
                Megerősít
              </Button>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => showEditModal(record)}
              />
            </>
          )}
          
          {record.status === 'confirmed' && (
            <Button
              size="small"
              type="primary"
              icon={<InboxOutlined />}
              onClick={() => handleStatusChange(record, 'receive')}
            >
              Bevételezés
            </Button>
          )}
          
          {(record.status === 'received' || record.status === 'confirmed') && (
            <Button
              size="small"
              icon={<DollarOutlined />}
              onClick={() => handleStatusChange(record, 'mark_paid')}
            >
              Fizetve
            </Button>
          )}
          
          {record.status !== 'received' && (
            <Popconfirm
              title="Biztosan törli?"
              onConfirm={() => handleDelete(record.id)}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const itemColumns: ColumnsType<InvoiceItem> = [
    {
      title: 'Anyag',
      dataIndex: 'material_name',
      key: 'material_name',
    },
    {
      title: 'Raktár',
      dataIndex: 'warehouse_name',
      key: 'warehouse_name',
    },
    {
      title: 'Mennyiség',
      key: 'quantity',
      width: 120,
      render: (_, record: InvoiceItem) => `${record.quantity} ${record.unit || 'db'}`,
    },
    {
      title: 'Egységár',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 120,
      render: (price: number, record: InvoiceItem) => (
        <div>
          <div>{price?.toLocaleString()}</div>
          {record.price_warning?.has_warning && (
            <Tag color="warning" style={{ fontSize: '10px', marginTop: '4px' }}>
              Eltérés: {record.price_warning.percentage_diff}%
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Összesen',
      dataIndex: 'total_price',
      key: 'total_price',
      width: 120,
      render: (price: number) => price?.toLocaleString(),
    },
    {
      title: 'Méretek',
      key: 'dimensions',
      width: 150,
      render: (_, record: InvoiceItem) => {
        if (record.width || record.length || record.thickness) {
          return `${record.width || '-'} × ${record.length || '-'} × ${record.thickness || '-'} ${record.dimension_unit || ''}`;
        }
        return '-';
      },
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 100,
      render: (_, record: InvoiceItem, index: number) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => showEditItem(record, index)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteItem(index)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2}>Beszállítói számlák</Title>
        <Space>
          <Button icon={<FileImageOutlined />} onClick={showNavSearch}>
            Bejövő számla keresés
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal}>
            Új számla
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={invoices}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Összesen: ${total}`,
        }}
      />

      <Modal
        title={editingInvoice ? 'Számla szerkesztése' : 'Új számla'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => setIsModalVisible(false)}
        width={1000}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="invoice_number"
                label="Számlaszám"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="supplier"
                label="Beszállító"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Select showSearch optionFilterProp="children">
                  {suppliers.map(s => (
                    <Option key={s.id} value={s.id}>{s.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="invoice_date"
                label="Számla dátuma"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <DatePicker style={{ width: '100%' }} format="YYYY.MM.DD" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fulfillment_date" label="Teljesítési dátum (NAV)">
                <DatePicker style={{ width: '100%' }} format="YYYY.MM.DD" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="due_date" label="Esedékesség">
                <DatePicker style={{ width: '100%' }} format="YYYY.MM.DD" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="receipt_date" label="Bevételezés dátuma">
                <DatePicker style={{ width: '100%' }} format="YYYY.MM.DD" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="payment_date" label="Fizetés dátuma">
                <DatePicker style={{ width: '100%' }} format="YYYY.MM.DD" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="payment_method"
                label="Fizetési mód"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Select>
                  <Option value="cash">Készpénz</Option>
                  <Option value="transfer">Átutalás</Option>
                  <Option value="card">Kártya</Option>
                  <Option value="credit">Hitel</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="currency"
                label="Pénznem"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Select>
                  <Option value="HUF">HUF</Option>
                  <Option value="EUR">EUR</Option>
                  <Option value="USD">USD</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="total_amount"
                label="Végösszeg"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  disabled
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="Megjegyzések">
            <TextArea rows={2} />
          </Form.Item>

          {editingInvoice && (
            <>
              <Divider>Számlaimages</Divider>
              
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                style={{
                  border: '2px dashed #d9d9d9',
                  borderRadius: '8px',
                  padding: '20px',
                  textAlign: 'center',
                  marginBottom: '16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.3s',
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <p style={{ margin: 0, color: '#666' }}>
                  <FileImageOutlined style={{ fontSize: '32px', marginBottom: '8px', display: 'block' }} />
                  Húzd ide a képeket vagy kattints a feltöltéshez
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#999' }}>
                  Mobil: Koppints a kamera használatához
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {editingInvoice.invoice_images && editingInvoice.invoice_images.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <Image.PreviewGroup>
                    <Row gutter={[16, 16]}>
                      {editingInvoice.invoice_images.map((imagePath, index) => (
                        <Col key={index} span={6}>
                          <Card
                            size="small"
                            cover={
                              <Image
                                src={`/media/${imagePath}`}
                                alt={`Számla kép ${index + 1}`}
                                style={{ objectFit: 'cover', height: '150px' }}
                              />
                            }
                            actions={[
                              <DeleteOutlined
                                key="delete"
                                onClick={() => handleImageDelete(editingInvoice.id, imagePath)}
                                style={{ color: 'red' }}
                              />,
                            ]}
                          />
                        </Col>
                      ))}
                    </Row>
                  </Image.PreviewGroup>
                </div>
              )}
            </>
          )}

          <Divider>Tételek</Divider>
          
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={showAddItem}
            style={{ marginBottom: 16 }}
            block
          >
            Tétel hozzáadása
          </Button>

          <Table
            columns={itemColumns}
            dataSource={items}
            rowKey={(record, index) => `item-${index}`}
            pagination={false}
            size="small"
          />
        </Form>
      </Modal>

      {/* Tétel modal */}
      <Modal
        title={editingItem ? 'Tétel szerkesztése' : 'Új tétel'}
        open={isItemModalVisible}
        onOk={handleItemSubmit}
        onCancel={() => setIsItemModalVisible(false)}
        okText="Hozzáad"
        cancelText="Mégse"
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item
            name="material"
            label="Anyag"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              onChange={handleMaterialChange}
              filterOption={(input, option) =>
                (option?.children as unknown as string).toLowerCase().includes(input.toLowerCase())
              }
            >
              {materials.map(m => (
                <Option key={m.id} value={m.id}>
                  {m.material_code} - {m.name}
                  {m.unit_cost_price && ` (${m.unit_cost_price} Ft)`}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="warehouse"
            label="Raktár"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Select>
              {warehouses.map(w => (
                <Option key={w.id} value={w.id}>{w.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="quantity"
                label="Mennyiség"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} precision={3} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="unit"
                label="Mennyiségi egység"
                rules={[{ required: true, message: 'Kötelező mező' }]}
                initialValue="db"
              >
                <Select>
                  <Option value="db">db (darab)</Option>
                  <Option value="kg">kg (kilogramm)</Option>
                  <Option value="m">m (méter)</Option>
                  <Option value="m2">m² (négyzetméter)</Option>
                  <Option value="nm">nm (futóméter)</Option>
                  <Option value="l">l (liter)</Option>
                  <Option value="t">t (tonna)</Option>
                  <Option value="csomag">csomag</Option>
                  <Option value="tekercs">tekercs</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="unit_price"
                label="Egységár"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  precision={2}
                  onChange={handlePriceChange}
                />
              </Form.Item>
            </Col>
          </Row>
          
          {priceWarning && (
            <Alert
              message={priceWarning}
              type="warning"
              showIcon
              style={{ marginBottom: '16px' }}
              closable
              onClose={() => setPriceWarning(null)}
            />
          )}

          <Divider>Opcionális méretek</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="width" label="Szélesség">
                {selectedMaterial && selectedMaterial.available_widths && selectedMaterial.available_widths.length > 0 ? (
                  <Select allowClear placeholder="Válasszon szélességet">
                    {selectedMaterial.available_widths.map((w: number) => (
                      <Option key={w} value={w}>{w}</Option>
                    ))}
                  </Select>
                ) : (
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="Egyedi szélesség" />
                )}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="length" label="Hosszúság">
                {selectedMaterial && selectedMaterial.available_lengths && selectedMaterial.available_lengths.length > 0 ? (
                  <Select allowClear placeholder="Válasszon hosszúságot">
                    {selectedMaterial.available_lengths.map((l: number) => (
                      <Option key={l} value={l}>{l}</Option>
                    ))}
                  </Select>
                ) : (
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="Egyedi hosszúság" />
                )}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="thickness" label="Vastagság">
                {selectedMaterial && selectedMaterial.available_thicknesses && selectedMaterial.available_thicknesses.length > 0 ? (
                  <Select allowClear placeholder="Válasszon vastagságot">
                    {selectedMaterial.available_thicknesses.map((t: number) => (
                      <Option key={t} value={t}>{t}</Option>
                    ))}
                  </Select>
                ) : (
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="Egyedi vastagság" />
                )}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="dimension_unit" label="Mértékegység">
            <Select allowClear>
              <Option value="mm">mm</Option>
              <Option value="cm">cm</Option>
              <Option value="m">m</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* NAV Számla keresés modal */}
      <Modal
        title="Bejövő számla kiválasztása"
        open={isNavSearchVisible}
        onCancel={() => setIsNavSearchVisible(false)}
        width={1200}
        footer={null}
        style={{ top: 20 }}
        bodyStyle={{ padding: 0, height: '80vh' }}
      >
        <iframe 
          src="https://inv.pixisys.eu/incoming-invoices?mode=select"
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Bejövő számlák"
        />
      </Modal>


    </div>
  );
};

export default SupplierInvoices;
