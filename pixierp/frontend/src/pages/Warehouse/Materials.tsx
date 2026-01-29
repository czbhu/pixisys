import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm, Tabs, AutoComplete, Upload, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, UploadOutlined, SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

interface Material {
  id: number;
  name: string;
  code: string;
  description: string;
  is_material: boolean;
  is_product: boolean;
  unit: string;
  unit_display: string;
  calculation_basis: string;
  calculation_basis_display: string;
  unit_price: number;
  unit_cost_price: number;
  markup_percentage: number;
  unit_selling_price: number;
  currency: string;
  material_type: string;
  material_group?: number;
  material_group_name?: string;
  material_format: string;
  width?: number;
  length?: number;
  height?: number;
  dimension_unit: string;
  width_fixed: boolean;
  length_fixed: boolean;
  height_fixed: boolean;
  density?: number;
  density_unit: string;
  area_weight?: number;
  area_weight_unit: string;
  specific_weight?: number;
  specific_weight_unit: string;
  weight?: number;
  weight_unit: string;
  volume_liter?: number;
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
}

interface MaterialGroup {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
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
  material: number;
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
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

interface MaterialStock {
  id: number;
  material: number;
  material_name: string;
  material_code: string;
  material_unit: string;
  warehouse: number;
  warehouse_name: string;
  quantity: number;
  width?: number;
  length?: number;
  thickness?: number;
  dimension_unit: string;
  unit_value: number;
  total_value: number;
  currency: string;
  status: string;
  status_display: string;
  receipt?: number;
  receipt_info?: {
    id: number;
    date: string;
    supplier: string;
    invoice_number: string;
  };
  created_at: string;
  created_by_name: string;
}

interface MaterialReceipt {
  id: number;
  material: number;
  material_name: string;
  material_code: string;
  warehouse: number;
  warehouse_name: string;
  supplier?: number;
  supplier_name?: string;
  receipt_date: string;
  invoice_number: string;
  invoice_value: number;
  currency: string;
  quantity: number;
  unit_price: number;
  width?: number;
  length?: number;
  thickness?: number;
  dimension_unit: string;
  notes: string;
  created_at: string;
  created_by_name: string;
}

const Materials: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [form] = Form.useForm();

  const handleCancel = () => {
    if (form.isFieldsTouched()) {
      Modal.confirm({
        title: 'Biztos, hogy mentés nélkül be akarja zárni?',
        icon: <ExclamationCircleOutlined />,
        content: 'A módosítások elvesznek.',
        okText: 'Bezár',
        cancelText: 'Mégse',
        onOk: () => {
          setModalVisible(false);
          form.resetFields();
        },
      });
    } else {
      setModalVisible(false);
      form.resetFields();
    }
  };

  useEffect(() => {
    const create = searchParams.get('create') === 'true';
    const copyFrom = searchParams.get('copy_from');
    const editId = searchParams.get('edit');
    
    if (create) {
      if (copyFrom) {
         setLoading(true);
         api.get(`/warehouse/materials/${copyFrom}/`).then(res => {
             const data = res.data;
             // Remove ID and creation info
             const { id, created_at, created_by_name, ...rest } = data;
             
             setEditingMaterial(null); // Ensure create mode
             form.setFieldsValue(rest);
             setModalVisible(true);
         }).catch(err => {
             console.error(err);
             message.error('Hiba a másolandó tétel betöltésekor');
         }).finally(() => setLoading(false));
      } else {
         handleCreate();
      }
    } else if (editId) {
        setLoading(true);
        api.get(`/warehouse/materials/${editId}/`).then(res => {
            handleEdit(res.data);
        }).catch(err => {
            console.error(err);
            message.error('Hiba a tétel betöltésekor');
        }).finally(() => setLoading(false));
    }
  }, [searchParams]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<{ value: string }[]>([]);
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isInternalProduction, setIsInternalProduction] = useState(false);
  const [selectedMaterialFormat, setSelectedMaterialFormat] = useState<string>('piece');
  const [searchText, setSearchText] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  
  // Súly számítás terület súlyból vagy fajsúlyból
  const calculateWeightFromDimensions = () => {
    const width = form.getFieldValue('width');
    const length = form.getFieldValue('length');
    const height = form.getFieldValue('height');
    const dimensionUnit = form.getFieldValue('dimension_unit') || 'mm';
    const areaWeight = form.getFieldValue('area_weight');
    const areaWeightUnit = form.getFieldValue('area_weight_unit') || 'g/m2';
    const specificWeight = form.getFieldValue('specific_weight');
    const specificWeightUnit = form.getFieldValue('specific_weight_unit') || 'kg/m3';

    if (!width || !length) return;

    // Átváltás méterrre
    let widthM = width;
    let lengthM = length;
    let heightM = height || 0;
    
    if (dimensionUnit === 'mm') {
      widthM = width / 1000;
      lengthM = length / 1000;
      heightM = (height || 0) / 1000;
    } else if (dimensionUnit === 'cm') {
      widthM = width / 100;
      lengthM = length / 100;
      heightM = (height || 0) / 100;
    }

    const areaM2 = widthM * lengthM;
    let calculatedWeight = 0;

    // Terület súlyból számítás (2D anyagok: papír, fólia, stb.)
    if (areaWeight && areaWeight > 0) {
      let areaWeightKgM2 = areaWeight;
      if (areaWeightUnit === 'g/m2') {
        areaWeightKgM2 = areaWeight / 1000; // g/m² -> kg/m²
      }
      calculatedWeight = areaM2 * areaWeightKgM2; // kg
    } 
    // Fajsúlyból számítás (3D anyagok: fa, műanyag, stb.)
    else if (specificWeight && specificWeight > 0 && heightM > 0) {
      const volumeM3 = widthM * lengthM * heightM;
      let specificWeightKgM3 = specificWeight;
      
      if (specificWeightUnit === 'g/cm3') {
        specificWeightKgM3 = specificWeight * 1000; // g/cm³ -> kg/m³
      } else if (specificWeightUnit === 'kg/liter') {
        specificWeightKgM3 = specificWeight * 1000; // kg/liter -> kg/m³
      }
      
      calculatedWeight = volumeM3 * specificWeightKgM3; // kg
    }

    if (calculatedWeight > 0) {
      form.setFieldsValue({ weight: parseFloat(calculatedWeight.toFixed(3)), weight_unit: 'kg' });
    }
  };

  // Visszafelé számítás: ha a súlyt szerkesztik, frissíthetjük a terület súlyt vagy fajsúlyt
  const calculateDimensionsFromWeight = (weightValue: number | null) => {
    if (!weightValue) return;
    
    const width = form.getFieldValue('width');
    const length = form.getFieldValue('length');
    const height = form.getFieldValue('height');
    const dimensionUnit = form.getFieldValue('dimension_unit') || 'mm';
    const weightUnit = form.getFieldValue('weight_unit') || 'kg';
    
    if (!width || !length) return;

    // Átváltás méterrre
    let widthM = width;
    let lengthM = length;
    let heightM = height || 0;
    
    if (dimensionUnit === 'mm') {
      widthM = width / 1000;
      lengthM = length / 1000;
      heightM = (height || 0) / 1000;
    } else if (dimensionUnit === 'cm') {
      widthM = width / 100;
      lengthM = length / 100;
      heightM = (height || 0) / 100;
    }

    let weightKg = weightValue;
    if (weightUnit === 'g') {
      weightKg = weightValue / 1000;
    } else if (weightUnit === 't') {
      weightKg = weightValue * 1000;
    }

    const areaM2 = widthM * lengthM;

    // Ha van magasság, számoljuk a fajsúlyt
    if (heightM > 0) {
      const volumeM3 = widthM * lengthM * heightM;
      const calculatedSpecificWeight = weightKg / volumeM3; // kg/m³
      form.setFieldsValue({ 
        specific_weight: parseFloat(calculatedSpecificWeight.toFixed(2)),
        specific_weight_unit: 'kg/m3'
      });
    } else {
      // Ha nincs magasság, számoljuk a terület súlyt
      const calculatedAreaWeight = (weightKg / areaM2) * 1000; // g/m²
      form.setFieldsValue({ 
        area_weight: parseFloat(calculatedAreaWeight.toFixed(2)),
        area_weight_unit: 'g/m2'
      });
    }
  };
  
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

  // Stock management
  const [stocks, setStocks] = useState<MaterialStock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockModalVisible, setStockModalVisible] = useState(false);
  const [moveStockModalVisible, setMoveStockModalVisible] = useState(false);
  const [selectedStock, setSelectedStock] = useState<MaterialStock | null>(null);
  const [moveStockForm] = Form.useForm();

  // Receipt management
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [receiptForm] = Form.useForm();
  const [receiptFilters, setReceiptFilters] = useState({
    date_from: '',
    date_to: '',
    supplier_id: undefined as number | undefined,
  });

  // Scrap management
  const [scrapModalVisible, setScrapModalVisible] = useState(false);
  const [scrapForm] = Form.useForm();
  const [scrapStock, setScrapStock] = useState<MaterialStock | null>(null);
  const [scrapImages, setScrapImages] = useState<any[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

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
    fetchMaterials();
    fetchSuppliers();
    fetchMaterialGroups();
    fetchDepartments();
    fetchWarehouses();
  }, []);

  // Újratöltés szűrő vagy keresés változásakor
  useEffect(() => {
    fetchMaterials();
  }, [filterType, searchText]);

  // Update informational price when default supplier changes
  useEffect(() => {
    const updateInformationalPrice = async () => {
      if (editingMaterial) {
        const defaultSupplierId = form.getFieldValue('default_supplier');
        if (defaultSupplierId) {
          try {
            const response = await api.get(`/warehouse/material-cost-items/?material_id=${editingMaterial.id}&supplier_id=${defaultSupplierId}`);
            const items = Array.isArray(response.data) ? response.data : (response.data.results || []);
            
            if (items.length > 0) {
              const totalCost = items.reduce((sum: number, item: CostItem) => sum + Number(item.unit_price || 0), 0);
              const totalSelling = items.reduce((sum: number, item: CostItem) => sum + Number(item.selling_price || 0), 0);
              const avgMarkup = totalCost > 0 ? ((totalSelling - totalCost) / totalCost * 100) : 0;
              
              form.setFieldsValue({
                unit_cost_price: totalCost,
                markup_percentage: avgMarkup,
                unit_selling_price: totalSelling
              });
            }
          } catch (error) {
            console.error('Hiba az ár betöltésekor:', error);
          }
        }
      }
    };
    
    updateInformationalPrice();
  }, [editingMaterial, form]);

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      let url = '/warehouse/materials/';
      const params = new URLSearchParams();
      
      if (filterType !== 'all') {
        params.append('filter_type', filterType);
      }
      
      if (searchText) {
        params.append('search', searchText);
      }
      
      const queryString = params.toString();
      if (queryString) {
        url += '?' + queryString;
      }
      
      const response = await api.get(url);
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setMaterials(data);
    } catch (error) {
      message.error('Hiba az alapanyagok/termékek betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/crm/companies/?is_supplier=true');
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

  const fetchMaterialGroups = async () => {
    try {
      const response = await api.get('/warehouse/material-groups/?is_active=true');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      const sorted = data.sort((a: MaterialGroup, b: MaterialGroup) => a.name.localeCompare(b.name, 'hu'));
      setMaterialGroups(sorted);
    } catch (error) {
      console.error('Hiba az alapanyag gyűjtők betöltésekor:', error);
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

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/warehouse/warehouses/');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setWarehouses(data);
    } catch (error) {
      console.error('Hiba a raktárak betöltésekor:', error);
    }
  };

  const fetchStocks = async (materialId: number) => {
    try {
      const response = await api.get(`/warehouse/material-stocks/?material_id=${materialId}`);
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setStocks(data);
    } catch (error) {
      console.error('Hiba a készletek betöltésekor:', error);
      setStocks([]);
    }
  };

  const fetchReceipts = async (materialId: number) => {
    try {
      let url = `/warehouse/material-receipts/?material_id=${materialId}`;
      if (receiptFilters.date_from) {
        url += `&date_from=${receiptFilters.date_from}`;
      }
      if (receiptFilters.date_to) {
        url += `&date_to=${receiptFilters.date_to}`;
      }
      if (receiptFilters.supplier_id) {
        url += `&supplier_id=${receiptFilters.supplier_id}`;
      }
      
      const response = await api.get(url);
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setReceipts(data);
    } catch (error) {
      console.error('Hiba a bevételezések betöltésekor:', error);
      setReceipts([]);
    }
  };

  const fetchCostItems = async (materialId: number, sourceType: 'internal' | number) => {
    try {
      let url = `/warehouse/material-cost-items/?material_id=${materialId}`;
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

  const fetchAddedSuppliers = async (materialId: number) => {
    try {
      const response = await api.get(`/warehouse/material-cost-items/?material_id=${materialId}`);
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
    setEditingMaterial(null);
    form.resetFields();
    setIsInternalProduction(false);
    setSelectedMaterialFormat('piece');
    setSelectedSourceForCost(null);
    setCostItems([]);
    setAddedSuppliers([]);
    setSupplierSearchValue('');
    setModalVisible(true);
  };

  const handleEdit = (material: Material) => {
    setEditingMaterial(material);
    setIsInternalProduction(material.is_internal_production);
    setSelectedMaterialFormat(material.material_format || 'piece');
    form.setFieldsValue(material);
    
    // Load added suppliers
    fetchAddedSuppliers(material.id);
    
    // Load stocks and receipts
    fetchStocks(material.id);
    fetchReceipts(material.id);
    
    // Load default source cost items
    if (material.is_internal_production) {
      setSelectedSourceForCost('internal');
      fetchCostItems(material.id, 'internal');
    } else if (material.default_supplier) {
      setSelectedSourceForCost(material.default_supplier);
      fetchCostItems(material.id, material.default_supplier);
    } else {
      setSelectedSourceForCost(null);
      setCostItems([]);
    }
    
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/warehouse/materials/${id}/`);
      message.success('Alapanyag törölve');
      fetchMaterials();
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      // Ha csak egy beszállító van a hozzáadottak között, akkor az legyen az alapértelmezett
      const externalSuppliers = addedSuppliers.filter(s => !s.is_internal);
      if (externalSuppliers.length === 1 && !values.default_supplier) {
        values.default_supplier = externalSuppliers[0].id;
      }
      
      // Ha nincs beállítva, alapértelmezés szerint mindkét checkbox be van pipálva
      if (values.is_material === undefined) values.is_material = true;
      if (values.is_product === undefined) values.is_product = true;
      
      let savedMaterial: any;
      if (editingMaterial) {
        const res = await api.patch(`/warehouse/materials/${editingMaterial.id}/`, values);
        savedMaterial = res.data;
        message.success('Alapanyag/Termék frissítve');
      } else {
        const res = await api.post('/warehouse/materials/', values);
        savedMaterial = res.data;
        message.success('Alapanyag/Termék létrehozva');
      }
      setModalVisible(false);
      fetchMaterials();

      if (searchParams.get('from_rfq') === 'true' && savedMaterial) {
        Modal.confirm({
          title: 'Visszatérés az ajánlathoz',
          content: 'Szeretnél visszatérni az ajánlathoz és beilleszteni ezt a terméket?',
          okText: 'Alkalmazás',
          cancelText: 'Mégse',
          onOk: () => {
            const channel = new BroadcastChannel('pixi_rfq_item_creation');
            channel.postMessage({ type: 'ITEM_CREATED', data: { item: savedMaterial, itemType: 'product' } });
            setTimeout(() => window.close(), 100);
          }
        });
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Hiba a mentés során');
      console.error(error);
    }
  };

  const handleSaveWithoutClose = async () => {
    try {
      const values = await form.validateFields();
      
      // Ha csak egy beszállító van a hozzáadottak között, akkor az legyen az alapértelmezett
      const externalSuppliers = addedSuppliers.filter(s => !s.is_internal);
      if (externalSuppliers.length === 1 && !values.default_supplier) {
        values.default_supplier = externalSuppliers[0].id;
      }
      
      // Ha nincs beállítva, alapértelmezés szerint mindkét checkbox be van pipálva
      if (values.is_material === undefined) values.is_material = true;
      if (values.is_product === undefined) values.is_product = true;
      
      if (editingMaterial) {
        const response = await api.patch(`/warehouse/materials/${editingMaterial.id}/`, values);
        message.success('Alapanyag/Termék mentve');
        // Frissítjük az editingMaterial-t az új adatokkal
        setEditingMaterial(response.data);
      } else {
        const response = await api.post('/warehouse/materials/', values);
        message.success('Alapanyag/Termék létrehozva');
        // Átváltunk szerkesztési módba
        setEditingMaterial(response.data);
        form.setFieldsValue(response.data);
        fetchAddedSuppliers(response.data.id);
        fetchStocks(response.data.id);
        fetchReceipts(response.data.id);
      }
      fetchMaterials();
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
    if (supplier && editingMaterial) {
      setSelectedSourceForCost(supplier.id);
      fetchCostItems(editingMaterial.id, supplier.id);
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

  const handleAddSupplier = async (supplierName: string) => {
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
    
    // Ha van mentett material, akkor backend-re is mentjük
    if (editingMaterial) {
      try {
        await api.post('/warehouse/material-suppliers/', {
          material: editingMaterial.id,
          supplier: supplier.id,
          unit_price: 0,
          currency: 'HUF',
          is_active: true,
        });
        message.success(`${supplier.name} hozzáadva és mentve`);
      } catch (error: any) {
        if (error.response?.status === 400 && error.response?.data?.non_field_errors) {
          // Already exists
          message.info(`${supplier.name} már hozzá van adva`);
        } else {
          message.error('Hiba a beszállító mentésekor');
          console.error(error);
          return;
        }
      }
    }
    
    setAddedSuppliers([...addedSuppliers, { ...supplier, is_internal: false }]);
    setSupplierSearchValue('');
    message.success(`${supplier.name} hozzáadva`);
  };

  const handleRemoveSupplier = async (supplierId: number, isInternal: boolean) => {
    if (!editingMaterial) return;
    
    try {
      // Delete all cost items for this supplier
      const response = await api.get(`/warehouse/material-cost-items/?material_id=${editingMaterial.id}${isInternal ? '&is_internal=true' : `&supplier_id=${supplierId}`}`);
      const itemsToDelete = Array.isArray(response.data) ? response.data : (response.data.results || []);
      
      for (const item of itemsToDelete) {
        await api.delete(`/warehouse/material-cost-items/${item.id}/`);
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
    if (!editingMaterial) return;
    
    if (value === 'internal') {
      setSelectedSourceForCost('internal');
      fetchCostItems(editingMaterial.id, 'internal');
    } else if (typeof value === 'number') {
      setSelectedSourceForCost(value);
      fetchCostItems(editingMaterial.id, value);
    } else {
      setSelectedSourceForCost(null);
      setCostItems([]);
    }
  };

  const handleAddCostItem = () => {
    if (!editingMaterial) {
      message.warning('Először mentsd el a alapanyagt');
      return;
    }
    
    setEditingCostItem(null);
    setSelectedCalculationType('unit');
    costItemForm.resetFields();
    costItemForm.setFieldsValue({
      material: editingMaterial.id,
      is_internal: selectedSourceForCost === 'internal',
      supplier: selectedSourceForCost !== 'internal' ? selectedSourceForCost : undefined,
      name: 'Anyagköltség',
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
      await api.delete(`/warehouse/material-cost-items/${id}/`);
      message.success('Költség elem törölve');
      if (editingMaterial && selectedSourceForCost) {
        fetchCostItems(editingMaterial.id, selectedSourceForCost);
      }
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleCostItemSubmit = async (values: any) => {
    try {
      if (editingCostItem) {
        await api.patch(`/warehouse/material-cost-items/${editingCostItem.id}/`, values);
        message.success('Költség elem frissítve');
      } else {
        await api.post('/warehouse/material-cost-items/', values);
        message.success('Költség elem létrehozva');
      }
      setCostItemModalVisible(false);
      if (editingMaterial && selectedSourceForCost) {
        fetchCostItems(editingMaterial.id, selectedSourceForCost);
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

  // Stock management handlers
  const handleMoveStock = (stock: MaterialStock) => {
    setSelectedStock(stock);
    moveStockForm.resetFields();
    moveStockForm.setFieldsValue({
      quantity: stock.quantity,
    });
    setMoveStockModalVisible(true);
  };

  const handleMoveStockSubmit = async (values: any) => {
    if (!selectedStock) return;
    
    try {
      await api.post(`/warehouse/material-stocks/${selectedStock.id}/move/`, {
        to_warehouse: values.to_warehouse,
        quantity: values.quantity,
        notes: values.notes || '',
      });
      message.success('Készlet sikeresen mozgatva');
      setMoveStockModalVisible(false);
      if (editingMaterial) {
        fetchStocks(editingMaterial.id);
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Hiba a mozgatás során');
      console.error(error);
    }
  };

  const handleScrapStock = (stock: MaterialStock) => {
    setScrapStock(stock);
    scrapForm.resetFields();
    scrapForm.setFieldsValue({
      scrap_date: new Date().toISOString().split('T')[0],
      quantity: stock.quantity,
    });
    setScrapImages([]);
    setScrapModalVisible(true);
  };

  const handleScrapSubmit = async (values: any) => {
    if (!scrapStock || !editingMaterial) return;

    try {
      // 1. Selejtezési jegyzőkönyv létrehozása
      const scrapRecordData = {
        scrap_date: values.scrap_date,
        reason: values.reason,
        notes: values.notes || '',
      };

      const scrapRecordResponse = await api.post('/warehouse/scrap-records/', scrapRecordData);
      const scrapRecordId = scrapRecordResponse.data.id;

      // 2. Fotók feltöltése
      for (const img of scrapImages) {
        const formData = new FormData();
        formData.append('file', img.originFileObj);
        await api.post(`/warehouse/scrap-records/${scrapRecordId}/upload_image/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      // 3. Selejtezett tétel létrehozása
      const scrapItemData = {
        scrap_record: scrapRecordId,
        stock: scrapStock.id,
        material: editingMaterial.id,
        warehouse: scrapStock.warehouse,
        quantity: values.quantity,
        width: scrapStock.width,
        length: scrapStock.length,
        thickness: scrapStock.thickness,
        dimension_unit: scrapStock.dimension_unit,
        unit_cost_value: scrapStock.unit_value,
        unit_selling_value: editingMaterial.unit_selling_price,
        currency: scrapStock.currency,
      };

      await api.post('/warehouse/scrap-items/', scrapItemData);

      message.success('Selejtezés rögzítve');
      setScrapModalVisible(false);
      fetchStocks(editingMaterial.id);
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Hiba a selejtezés során');
      console.error(error);
    }
  };

  const handleImageUpload = ({ fileList }: any) => {
    setScrapImages(fileList);
  };

  const handleMarkDefective = async (stockId: number) => {
    try {
      await api.post(`/warehouse/material-stocks/${stockId}/mark_defective/`, {
        notes: 'Hibásnak jelölve',
      });
      message.success('Készlet hibásnak jelölve');
      if (editingMaterial) {
        fetchStocks(editingMaterial.id);
      }
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Hiba a jelölés során');
      console.error(error);
    }
  };

  // Receipt management handlers
  const handleAddReceipt = () => {
    if (!editingMaterial) {
      message.warning('Először mentsd el az alapanyagot');
      return;
    }
    
    receiptForm.resetFields();
    receiptForm.setFieldsValue({
      material: editingMaterial.id,
      receipt_date: new Date().toISOString().split('T')[0],
      currency: 'HUF',
      dimension_unit: editingMaterial.dimension_unit || 'mm',
      width: editingMaterial.width,
      length: editingMaterial.length,
      thickness: editingMaterial.height,
    });
    setReceiptModalVisible(true);
  };

  const handleReceiptSubmit = async (values: any) => {
    try {
      await api.post('/warehouse/material-receipts/', values);
      message.success('Bevételezés rögzítve');
      setReceiptModalVisible(false);
      if (editingMaterial) {
        fetchReceipts(editingMaterial.id);
        fetchStocks(editingMaterial.id);
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Hiba a mentés során');
      console.error(error);
    }
  };

  const handleReceiptFilterChange = () => {
    if (editingMaterial) {
      fetchReceipts(editingMaterial.id);
    }
  };

  const columns = [
    {
      title: 'Anyag',
      key: 'main_details',
      render: (record: Material) => (
         <div style={{ lineHeight: '1.2' }}>
            <div style={{ fontWeight: 600 }}>{record.code}</div>
            <div>{record.name}</div>
         </div>
      ),
    },
    {
      title: 'Típus',
      key: 'type',
      width: 200,
      responsive: ['md'] as any,
      render: (record: Material) => (
        <Space>
          {record.is_material && <Tag color="blue">Alapanyag</Tag>}
          {record.is_product && <Tag color="green">Termék</Tag>}
        </Space>
      ),
    },
    {
      title: 'Kategória',
      dataIndex: 'material_group_name',
      key: 'material_group_name',
      width: 250,
      responsive: ['lg'] as any,
      render: (groupName: string | undefined) => 
        groupName ? <Tag color="purple">{groupName}</Tag> : '-',
    },
    {
      title: 'Formátum',
      dataIndex: 'material_format',
      key: 'material_format',
      width: 150,
      responsive: ['xl'] as any,
      render: (format: string) => {
        const formatMap: Record<string, string> = {
          'sheet': 'Táblás/Íves',
          'roll': 'Tekercses',
          'linear': 'Folyóméter',
          'piece': 'Darab',
          'weight': 'Súly alapú',
          'liter': 'Liter alapú',
        };
        return formatMap[format] || format;
      },
    },
    {
      title: 'Mértékegység',
      dataIndex: 'unit_display',
      key: 'unit_display',
      width: 120,
      responsive: ['sm'] as any,
    },
    {
      title: 'Beszállító',
      key: 'source',
      width: 150,
      responsive: ['lg'] as any,
      render: (_: any, record: Material) => {
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
      responsive: ['sm'] as any,
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
      render: (_: any, record: Material) => (
        <Space wrap>
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Alapanyagok/Termékek</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            placeholder="Keresés név, kód vagy leírás alapján..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300, maxWidth: '100%' }}
            allowClear
          />
          <Select
            value={filterType}
            onChange={setFilterType}
            style={{ width: 150 }}
          >
            <Option value="all">Mind</Option>
            <Option value="materials">Alapanyagok</Option>
            <Option value="products">Termékek</Option>
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Új elem
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={materials}
        loading={loading}
        rowKey="id"
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={editingMaterial ? 'Alapanyag/Termék szerkesztése' : 'Új alapanyag/termék'}
        open={modalVisible}
        onCancel={handleCancel}
        footer={null}
        width={900}
        style={{ top: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <Button onClick={handleCancel}>Bezárás</Button>
          <Button type="primary" onClick={() => form.submit()}>Mentés</Button>
        </div>
        <Tabs 
          defaultActiveKey="1"
          items={[
            {
              key: '1',
              label: 'Alapadatok',
              children: (
                <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                currency: 'HUF',
                is_active: true,
                is_material: true,
                is_product: true,
                unit: 'db',
                unit_cost_price: 0,
                markup_percentage: 35,
                unit_selling_price: 0,
                is_internal_production: false,
              }}
            >
              <Form.Item
                name="name"
                label="Név"
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

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <Form.Item
                  name="is_material"
                  valuePropName="checked"
                  style={{ marginBottom: 0 }}
                >
                  <Checkbox>Alapanyag (gyártáshoz használható)</Checkbox>
                </Form.Item>

                <Form.Item
                  name="is_product"
                  valuePropName="checked"
                  style={{ marginBottom: 0 }}
                >
                  <Checkbox>Termék (értékesíthető)</Checkbox>
                </Form.Item>
              </div>

              <Form.Item name="description" label="Leírás">
                <Input.TextArea rows={3} />
              </Form.Item>

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Form.Item
                  name="material_group"
                  label="Alapanyag gyűjtő"
                  help="Opcionális - csoportosítás pl. Épületháló, Fólia, stb."
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <Select
                    allowClear
                    showSearch
                    placeholder="Válassz gyűjtőt (opcionális)"
                    optionFilterProp="children"
                    filterOption={(input, option) =>
                      (option?.children as unknown as string)
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                  >
                    {materialGroups.map((group) => (
                      <Option key={group.id} value={group.id}>
                        {group.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
                <Button 
                  icon={<EditOutlined />}
                  onClick={() => window.open('/warehouse/material-groups', '_blank')}
                  style={{ marginTop: 30 }}
                  title="Alapanyag gyűjtők kezelése"
                >
                  Kezelés
                </Button>
              </div>

              <Form.Item
                name="material_format"
                label="Típus"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Select onChange={(value) => setSelectedMaterialFormat(value)}>
                  <Option value="sheet">Táblás/Íves</Option>
                  <Option value="roll">Tekercses</Option>
                  <Option value="linear">Folyóméter alapú</Option>
                  <Option value="piece">Darab</Option>
                  <Option value="weight">Súly alapú</Option>
                  <Option value="liter">Liter alapú</Option>
                </Select>
              </Form.Item>

              {/* Dinamikus mezők a material_format alapján */}
              {(selectedMaterialFormat === 'sheet' || selectedMaterialFormat === 'roll' || selectedMaterialFormat === 'linear') && (
                <>
                  <div style={{ marginTop: 16, marginBottom: 8 }}>
                    <strong>Alapértelmezett méretek:</strong>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <Form.Item 
                      name="width"
                      label={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          Szélesség
                          <Form.Item name="width_fixed" valuePropName="checked" style={{ margin: 0 }} noStyle>
                            <Checkbox style={{ fontSize: 11, fontWeight: 'normal' }}>FIX</Checkbox>
                          </Form.Item>
                        </span>
                      }
                    >
                      <InputNumber 
                        style={{ width: '100%' }} 
                        min={0} 
                        precision={2}
                        onChange={() => calculateWeightFromDimensions()}
                      />
                    </Form.Item>
                    
                    <Form.Item 
                      name="length"
                      label={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          Hosszúság
                          <Form.Item name="length_fixed" valuePropName="checked" style={{ margin: 0 }} noStyle>
                            <Checkbox style={{ fontSize: 11, fontWeight: 'normal' }}>FIX</Checkbox>
                          </Form.Item>
                        </span>
                      }
                    >
                      <InputNumber 
                        style={{ width: '100%' }} 
                        min={0} 
                        precision={2}
                        onChange={() => calculateWeightFromDimensions()}
                      />
                    </Form.Item>
                    
                    <Form.Item 
                      name="height"
                      label={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          Magasság
                          <Form.Item name="height_fixed" valuePropName="checked" style={{ margin: 0 }} noStyle>
                            <Checkbox style={{ fontSize: 11, fontWeight: 'normal' }}>FIX</Checkbox>
                          </Form.Item>
                        </span>
                      }
                    >
                      <InputNumber 
                        style={{ width: '100%' }} 
                        min={0} 
                        precision={2}
                        onChange={() => calculateWeightFromDimensions()}
                      />
                    </Form.Item>
                  </div>
                  
                  <Form.Item name="dimension_unit" label="Méret mértékegység">
                    <Select onChange={() => calculateWeightFromDimensions()}>
                      <Option value="mm">mm</Option>
                      <Option value="cm">cm</Option>
                      <Option value="m">m</Option>
                    </Select>
                  </Form.Item>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item name="specific_weight" label="Fajsúly">
                      <InputNumber 
                        style={{ width: '100%' }} 
                        min={0} 
                        precision={2}
                        onChange={() => calculateWeightFromDimensions()}
                      />
                    </Form.Item>
                    <Form.Item name="specific_weight_unit" label="Fajsúly egység">
                      <Select onChange={() => calculateWeightFromDimensions()}>
                        <Option value="kg/m3">kg/m³</Option>
                        <Option value="g/cm3">g/cm³</Option>
                        <Option value="kg/liter">kg/liter</Option>
                      </Select>
                    </Form.Item>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item name="area_weight" label="Terület súly">
                      <InputNumber 
                        style={{ width: '100%' }} 
                        min={0} 
                        precision={2}
                        onChange={() => calculateWeightFromDimensions()}
                      />
                    </Form.Item>
                    <Form.Item name="area_weight_unit" label="Terület súly egység">
                      <Select onChange={() => calculateWeightFromDimensions()}>
                        <Option value="g/m2">g/m²</Option>
                        <Option value="kg/m2">kg/m²</Option>
                      </Select>
                    </Form.Item>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item name="weight" label="Súly (számított)">
                      <InputNumber 
                        style={{ width: '100%' }} 
                        min={0} 
                        precision={3}
                        onChange={(value) => calculateDimensionsFromWeight(value)}
                      />
                    </Form.Item>
                    <Form.Item name="weight_unit" label="Súly egység">
                      <Select onChange={() => calculateWeightFromDimensions()}>
                        <Option value="g">g</Option>
                        <Option value="kg">kg</Option>
                        <Option value="t">t</Option>
                      </Select>
                    </Form.Item>
                  </div>
                </>
              )}

              {selectedMaterialFormat === 'piece' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item name="weight" label="Súly (opcionális)">
                    <InputNumber style={{ width: '100%' }} min={0} precision={3} />
                  </Form.Item>
                  <Form.Item name="weight_unit" label="Súly egység">
                    <Select>
                      <Option value="g">g</Option>
                      <Option value="kg">kg</Option>
                      <Option value="t">t</Option>
                    </Select>
                  </Form.Item>
                </div>
              )}

              {selectedMaterialFormat === 'weight' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item name="weight" label="Súly" rules={[{ required: true, message: 'Kötelező mező' }]}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={3} />
                  </Form.Item>
                  <Form.Item name="weight_unit" label="Súly egység">
                    <Select>
                      <Option value="g">g</Option>
                      <Option value="kg">kg</Option>
                      <Option value="t">t</Option>
                    </Select>
                  </Form.Item>
                </div>
              )}

              {selectedMaterialFormat === 'liter' && (
                <>
                  <Form.Item name="volume_liter" label="Liter" rules={[{ required: true, message: 'Kötelező mező' }]}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} addonAfter="liter" />
                  </Form.Item>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item name="specific_weight" label="Fajsúly">
                      <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                    </Form.Item>
                    <Form.Item name="specific_weight_unit" label="Fajsúly egység">
                      <Select>
                        <Option value="kg/liter">kg/liter</Option>
                      </Select>
                    </Form.Item>
                  </div>
                </>
              )}

              <Form.Item
                name="unit"
                label="Mértékegység"
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <Select>
                  <Option value="db">darab</Option>
                  <Option value="m2">négyzetméter</Option>
                  <Option value="m">folyóméter</Option>
                  <Option value="perimeter">kerület (méter)</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="unit_price"
                label="Egységár (régi, kompatibilitás)"
                hidden
              >
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>

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

              <Form.Item name="unit_cost_price" hidden>
                <InputNumber />
              </Form.Item>
              
              <Form.Item name="markup_percentage" hidden>
                <InputNumber />
              </Form.Item>
              
              <Form.Item name="unit_selling_price" hidden>
                <InputNumber />
              </Form.Item>

              <h4 style={{ marginTop: 16, marginBottom: 8 }}>Hozzáadott beszállítók</h4>
              
              {editingMaterial && (
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
                    rowKey={(record) => record.is_internal ? 'internal' : String(record.id)}
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
                  rules={[{ required: false }]}
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

              <Form.Item name="is_active" label="Státusz" valuePropName="checked">
                <Select>
                  <Option value={true}>Aktív</Option>
                  <Option value={false}>Inaktív</Option>
                </Select>
              </Form.Item>
            </Form>
              ),
            },
            {
              key: '2',
              label: 'Beszállítók és árkalkuláció',
              disabled: !editingMaterial,
              children: (
            <>
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
                  <div style={{ padding: '8px 16px', background: '#f0f0f0', borderRadius: 4 }}>
                    <strong>1 egységre vonatkozó összesítés:</strong> 
                    {' '}Bekerülési: {getTotalCost().toLocaleString()} HUF
                    {' | '}Haszon: {getAverageMarkup()}%
                    {' | '}Eladási: {getTotalSelling().toLocaleString()} HUF
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
            </>
              ),
            },
            {
              key: '3',
              label: 'Készletek',
              disabled: !editingMaterial,
              children: (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div style={{ textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddReceipt}>
                  Új bevételezés
                </Button>
              </div>

              <Table
                columns={[
                  {
                    title: 'Raktár',
                    dataIndex: 'warehouse_name',
                    key: 'warehouse_name',
                  },
                  {
                    title: 'Méretek',
                    key: 'dimensions',
                    render: (_: any, record: MaterialStock) => {
                      if (record.width && record.length) {
                        const dims = `${record.width}×${record.length}`;
                        return record.thickness ? `${dims}×${record.thickness} ${record.dimension_unit}` : `${dims} ${record.dimension_unit}`;
                      }
                      return '-';
                    },
                  },
                  {
                    title: 'Mennyiség',
                    key: 'quantity',
                    render: (_: any, record: MaterialStock) => 
                      `${record.quantity} ${record.material_unit}`,
                  },
                  {
                    title: 'Érték',
                    key: 'value',
                    render: (_: any, record: MaterialStock) => 
                      `${record.total_value.toLocaleString()} ${record.currency}`,
                  },
                  {
                    title: 'Státusz',
                    dataIndex: 'status_display',
                    key: 'status',
                    render: (status: string, record: MaterialStock) => {
                      const colorMap: Record<string, string> = {
                        normal: 'green',
                        defective: 'orange',
                        scrapped: 'red',
                      };
                      return <Tag color={colorMap[record.status] || 'default'}>{status}</Tag>;
                    },
                  },
                  {
                    title: 'Műveletek',
                    key: 'actions',
                    width: 250,
                    render: (_: any, record: MaterialStock) => (
                      <Space>
                        <Button size="small" onClick={() => handleMoveStock(record)}>
                          Mozgatás
                        </Button>
                        {(record.status === 'normal' || record.status === 'in_stock') && (
                          <>
                            <Popconfirm
                              title="Biztos hibásnak jelölöd?"
                              onConfirm={() => handleMarkDefective(record.id)}
                              okText="Igen"
                              cancelText="Nem"
                            >
                              <Button size="small" danger>
                                Hibás
                              </Button>
                            </Popconfirm>
                            <Button 
                              size="small" 
                              danger
                              onClick={() => handleScrapStock(record)}
                            >
                              Selejt
                            </Button>
                          </>
                        )}
                      </Space>
                    ),
                  },
                ]}
                dataSource={stocks}
                rowKey="id"
                pagination={false}
                scroll={{ x: 900 }}
                summary={(pageData) => {
                  const totalQuantity = pageData.reduce((sum, stock) => sum + Number(stock.quantity), 0);
                  const totalValue = pageData.reduce((sum, stock) => sum + Number(stock.total_value), 0);
                  
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row style={{ fontWeight: 'bold' }}>
                        <Table.Summary.Cell index={0}>Összesen</Table.Summary.Cell>
                        <Table.Summary.Cell index={1}></Table.Summary.Cell>
                        <Table.Summary.Cell index={2}>
                          {totalQuantity.toFixed(2)} {editingMaterial?.unit}
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3}>
                          {totalValue.toLocaleString()} HUF
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4}></Table.Summary.Cell>
                        <Table.Summary.Cell index={5}></Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </Space>
              ),
            },
            {
              key: '4',
              label: 'Bevételezések',
              disabled: !editingMaterial,
              children: (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                <Form.Item label="Dátum -tól" style={{ marginBottom: 0 }}>
                  <Input
                    type="date"
                    value={receiptFilters.date_from}
                    onChange={(e) => {
                      setReceiptFilters({ ...receiptFilters, date_from: e.target.value });
                      handleReceiptFilterChange();
                    }}
                  />
                </Form.Item>
                <Form.Item label="Dátum -ig" style={{ marginBottom: 0 }}>
                  <Input
                    type="date"
                    value={receiptFilters.date_to}
                    onChange={(e) => {
                      setReceiptFilters({ ...receiptFilters, date_to: e.target.value });
                      handleReceiptFilterChange();
                    }}
                  />
                </Form.Item>
                <Form.Item label="Beszállító" style={{ marginBottom: 0 }}>
                  <Select
                    style={{ width: 200 }}
                    allowClear
                    placeholder="Összes"
                    value={receiptFilters.supplier_id}
                    onChange={(value) => {
                      setReceiptFilters({ ...receiptFilters, supplier_id: value });
                      handleReceiptFilterChange();
                    }}
                  >
                    {suppliers.map((s) => (
                      <Option key={s.id} value={s.id}>{s.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>

              <Table
                columns={[
                  {
                    title: 'Dátum',
                    dataIndex: 'receipt_date',
                    key: 'receipt_date',
                    width: 120,
                  },
                  {
                    title: 'Beszállító',
                    dataIndex: 'supplier_name',
                    key: 'supplier_name',
                  },
                  {
                    title: 'Számla szám',
                    dataIndex: 'invoice_number',
                    key: 'invoice_number',
                  },
                  {
                    title: 'Számla érték',
                    key: 'invoice_value',
                    render: (_: any, record: MaterialReceipt) => 
                      `${record.invoice_value.toLocaleString()} ${record.currency}`,
                  },
                  {
                    title: 'Mennyiség',
                    key: 'quantity',
                    render: (_: any, record: MaterialReceipt) => 
                      `${record.quantity} ${editingMaterial?.unit}`,
                  },
                  {
                    title: 'Egységár',
                    key: 'unit_price',
                    render: (_: any, record: MaterialReceipt) => 
                      `${record.unit_price.toLocaleString()} ${record.currency}`,
                  },
                  {
                    title: 'Rögzítette',
                    dataIndex: 'created_by_name',
                    key: 'created_by_name',
                    width: 150,
                  },
                ]}
                dataSource={receipts}
                rowKey="id"
                pagination={{ pageSize: 10 }}
              />
            </Space>
              ),
            },
          ]}
        />
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
          <Form.Item name="material" hidden>
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

      {/* Move Stock Modal */}
      <Modal
        title="Készlet mozgatása"
        open={moveStockModalVisible}
        onCancel={() => setMoveStockModalVisible(false)}
        onOk={() => moveStockForm.submit()}
        width={500}
      >
        <Form
          form={moveStockForm}
          layout="vertical"
          onFinish={handleMoveStockSubmit}
        >
          <Form.Item label="Forrás raktár">
            <Input value={selectedStock?.warehouse_name} disabled />
          </Form.Item>

          <Form.Item
            name="to_warehouse"
            label="Cél raktár"
            rules={[{ required: true, message: 'Válassz célraktárt' }]}
          >
            <Select placeholder="Válassz raktárt">
              {warehouses
                .filter(w => w.id !== selectedStock?.warehouse)
                .map(w => (
                  <Option key={w.id} value={w.id}>{w.name}</Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="quantity"
            label="Mennyiség"
            rules={[{ required: true, message: 'Add meg a mennyiséget' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={selectedStock?.quantity}
              precision={2}
              addonAfter={selectedStock?.material_unit}
            />
          </Form.Item>

          <Form.Item name="notes" label="Megjegyzés">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Receipt Modal */}
      <Modal
        title="Új bevételezés"
        open={receiptModalVisible}
        onCancel={() => setReceiptModalVisible(false)}
        onOk={() => receiptForm.submit()}
        width={700}
      >
        <Form
          form={receiptForm}
          layout="vertical"
          onFinish={handleReceiptSubmit}
        >
          <Form.Item name="material" hidden>
            <Input />
          </Form.Item>

          <Form.Item
            name="warehouse"
            label="Raktár"
            rules={[{ required: true, message: 'Válassz raktárt' }]}
          >
            <Select placeholder="Válassz raktárt">
              {warehouses.map(w => (
                <Option key={w.id} value={w.id}>{w.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="supplier"
            label="Beszállító"
          >
            <Select placeholder="Válassz beszállítót" allowClear>
              {addedSuppliers
                .filter(s => !s.is_internal)
                .map(s => (
                  <Option key={s.id} value={s.id}>{s.name}</Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="receipt_date"
            label="Bevételezés dátuma"
            rules={[{ required: true, message: 'Add meg a dátumot' }]}
          >
            <Input type="date" />
          </Form.Item>

          <Form.Item name="invoice_number" label="Számla szám">
            <Input placeholder="Számla szám" />
          </Form.Item>

          <Form.Item
            name="invoice_value"
            label="Számla érték"
            rules={[{ required: true, message: 'Add meg a számla értékét' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              addonAfter="HUF"
            />
          </Form.Item>

          <Form.Item
            name="quantity"
            label="Mennyiség"
            rules={[{ required: true, message: 'Add meg a mennyiséget' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              addonAfter={editingMaterial?.unit}
            />
          </Form.Item>

          <Form.Item
            name="unit_price"
            label="Egységár"
            rules={[{ required: true, message: 'Add meg az egységárat' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              addonAfter="HUF"
            />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item name="width" label="Szélesség">
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                precision={2} 
                disabled={editingMaterial?.width_fixed}
              />
            </Form.Item>

            <Form.Item name="length" label="Hosszúság">
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                precision={2} 
                disabled={editingMaterial?.length_fixed}
              />
            </Form.Item>

            <Form.Item name="thickness" label="Vastagság">
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                precision={2} 
                disabled={editingMaterial?.height_fixed}
              />
            </Form.Item>
          </div>

          <Form.Item name="dimension_unit" label="Méret mértékegység">
            <Select>
              <Option value="mm">mm</Option>
              <Option value="cm">cm</Option>
              <Option value="m">m</Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="Megjegyzés">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item name="currency" hidden>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Selejtezési Modal */}
      <Modal
        title="Készlet selejtezése"
        open={scrapModalVisible}
        onCancel={() => {
          setScrapModalVisible(false);
          scrapForm.resetFields();
          setScrapImages([]);
        }}
        onOk={() => scrapForm.submit()}
        okText="Selejtezés"
        cancelText="Mégse"
        confirmLoading={uploadingImage}
        width={600}
      >
        <Form
          form={scrapForm}
          layout="vertical"
          onFinish={handleScrapSubmit}
        >
          <Form.Item
            name="scrap_date"
            label="Selejtezés dátuma"
            rules={[{ required: true, message: 'Add meg a dátumot' }]}
          >
            <Input type="date" />
          </Form.Item>

          <Form.Item
            name="quantity"
            label={`Mennyiség (max: ${scrapStock?.quantity || 0} ${scrapStock?.material_unit || ''})`}
            rules={[
              { required: true, message: 'Add meg a mennyiséget' },
              {
                validator: (_, value) => {
                  if (value > (scrapStock?.quantity || 0)) {
                    return Promise.reject('A mennyiség nem lehet több, mint a készleten lévő');
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={scrapStock?.quantity || 0}
              precision={2}
              addonAfter={scrapStock?.material_unit}
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="Selejtezés oka"
            rules={[{ required: true, message: 'Add meg a selejtezés okát' }]}
          >
            <TextArea
              rows={4}
              placeholder="Írd le részletesen a selejtezés okát..."
            />
          </Form.Item>

          <Form.Item
            name="images"
            label="Fotók (opcionális)"
            extra="Feltölthetsz több fotót is a selejtezett anyagról"
          >
            <Upload
              listType="picture-card"
              fileList={scrapImages}
              onChange={handleImageUpload}
              beforeUpload={() => false}
              accept="image/*"
              multiple
            >
              {scrapImages.length < 8 && (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>Fotó feltöltés</div>
                </div>
              )}
            </Upload>
          </Form.Item>

          <Form.Item
            name="notes"
            label="Megjegyzések (opcionális)"
          >
            <TextArea
              rows={2}
              placeholder="További megjegyzések..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Materials;
