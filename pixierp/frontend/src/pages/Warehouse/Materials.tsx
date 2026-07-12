import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm, Tabs, Upload, Checkbox, Row, Col, Radio, Tooltip, TreeSelect } from 'antd';
import NumInput from '../../components/NumInput';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, ExclamationCircleOutlined, ThunderboltOutlined, CopyOutlined, DownloadOutlined, ImportOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import EnhancedTable from '../../components/EnhancedTable';
import { manufacturingService, Currency as MCurrency } from '../../services/manufacturingService';
import ExportButton from '../../components/ExportButton';

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
  vat_type_id?: string;
  currency: string;
  price_source_mode?: 'manual' | 'default_version' | 'optimal_version';
  default_price_calculation_version?: string;
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
  parent?: number | null;
  children?: MaterialGroup[];
}

interface Supplier {
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
  price_calculation_version?: string;
  unit_price: number;
  price_quantity?: number;
  markup_percentage: number;
  selling_price?: number;
  currency: string;
  is_active: boolean;
}

interface MaterialSizeItem {
  id?: number;
  material: number;
  name: string;
  width: number;
  length: number;
  height?: number | null;
  dimension_unit: string;
  pricing_type: 'custom' | 'area' | 'weight' | 'volume';
  pricing_type_display?: string;
  custom_price: number;
  calculated_price: number;
  effective_price: number;
  is_active: boolean;
  sort_order: number;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

interface VatType {
  id: string;
  code: string;
  name: string;
  category: string;
  percentage: number;
  active: boolean;
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
  used_length?: number;
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
  const fetchSeqRef = React.useRef(0); // race-condition guard
  const [loading, setLoading] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const csvImportRef = React.useRef<HTMLInputElement>(null);
  const [csvPendingFile, setCsvPendingFile] = useState<File | null>(null);
  const [csvSkipEmptyModal, setCsvSkipEmptyModal] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [form] = Form.useForm();
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('');

  const normalizeForCompare = (value: any): any => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(normalizeForCompare);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && typeof value?.format === 'function') return value.format('YYYY-MM-DDTHH:mm:ss');
    if (typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc: any, key: string) => {
          const normalized = normalizeForCompare(value[key]);
          if (normalized !== undefined) acc[key] = normalized;
          return acc;
        }, {} as any);
    }
    return value;
  };

  const getFormSnapshot = () => JSON.stringify(normalizeForCompare(form.getFieldsValue(true)));
  const hasFormChanges = () => getFormSnapshot() !== initialFormSnapshot;

  const handleCancel = () => {
    if (hasFormChanges()) {
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
    if (!modalVisible) return;
    const timer = setTimeout(() => {
      setInitialFormSnapshot(getFormSnapshot());
    }, 0);
    return () => clearTimeout(timer);
  }, [modalVisible]);

  useEffect(() => {
    const create = searchParams.get('create') === 'true';
    const copyFrom = searchParams.get('copy_from');
    const editId = searchParams.get('edit');
    const groupParam = searchParams.get('group');
    if (groupParam) {
      const gid = Number(groupParam);
      if (!Number.isNaN(gid)) {
        setFilterGroupId(gid);
      }
    }
    
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
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([]);
  const [materialGroupTree, setMaterialGroupTree] = useState<any[]>([]);
  const [vatTypes, setVatTypes] = useState<VatType[]>([]);
  const [currencyList, setCurrencyList] = useState<MCurrency[]>([]);
  const [selectedMaterialFormat, setSelectedMaterialFormat] = useState<string>('piece');
  const [searchText, setSearchText] = useState<string>('');
  const [filterType, setFilterType] = useState<string>(() => {
    try { return sessionStorage.getItem('materials_filterType') || 'all'; } catch { return 'all'; }
  });
  const [filterGroupId, setFilterGroupId] = useState<number | undefined>(() => {
    try {
      // URL param takes priority over sessionStorage
      const urlGroup = new URLSearchParams(window.location.search).get('group');
      if (urlGroup) { const n = Number(urlGroup); if (!Number.isNaN(n)) return n; }
      const v = sessionStorage.getItem('materials_filterGroupId'); return v ? Number(v) : undefined;
    } catch { return undefined; }
  });
  const [filterSupplierId, setFilterSupplierId] = useState<number | undefined>(() => {
    try { const v = sessionStorage.getItem('materials_filterSupplierId'); return v ? Number(v) : undefined; } catch { return undefined; }
  });
  const [netUnitPrice, setNetUnitPrice] = useState<number>(0);
  const [calculatedVat, setCalculatedVat] = useState<number>(0);
  const [calculatedGross, setCalculatedGross] = useState<number>(0);
  const [selectedVatTypeId, setSelectedVatTypeId] = useState<string | undefined>(undefined);
  
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
  const [allCostItems, setAllCostItems] = useState<CostItem[]>([]);
  const [selectedSourceForCost, setSelectedSourceForCost] = useState<'internal' | number | null>(null);
  const [selectedVersionForCost, setSelectedVersionForCost] = useState<string | null>(null);
  const [versionNameModal, setVersionNameModal] = useState<{ visible: boolean; mode: 'add' | 'copy' | 'rename'; sourceVersion?: string } | null>(null);
  const [versionNameInput, setVersionNameInput] = useState('');
  const [costItemForm] = Form.useForm();
  const [editingCostItem, setEditingCostItem] = useState<CostItem | null>(null);
  const [costItemModalVisible, setCostItemModalVisible] = useState(false);
  const [selectedCalculationType, setSelectedCalculationType] = useState<string>('unit');
  const [duplicateSourceId, setDuplicateSourceId] = useState<number | null>(null);
  const [duplicateSourceSizes, setDuplicateSourceSizes] = useState<any[]>([]);

  // Material sizes management
  const [materialSizes, setMaterialSizes] = useState<MaterialSizeItem[]>([]);
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [editingSizeItem, setEditingSizeItem] = useState<MaterialSizeItem | null>(null);
  const [sizeForm] = Form.useForm();
  
  // Added suppliers management
  const [addedSuppliers, setAddedSuppliers] = useState<(Supplier & { is_internal?: boolean })[]>([]);

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
  // batch lines: each row = one size+count+length entry
  type BatchLine = { key: number; sizeId: number | undefined; count: number; lengthPerUnit: number | undefined; lengthUnit: string };
  const [receiptBatchLines, setReceiptBatchLines] = useState<BatchLine[]>([{ key: 0, sizeId: undefined, count: 1, lengthPerUnit: undefined, lengthUnit: 'm' }]);
  const receiptBatchKeyRef = React.useRef(1);
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

  const getCurrencySymbol = (code?: string) => {
    const currency = currencyList.find(c => c.code.toUpperCase() === (code || 'HUF').toUpperCase());
    return currency?.symbol || code || 'HUF';
  };

  const convertCurrencyAmount = (amount: number, fromCode?: string, toCode?: string) => {
    const from = (fromCode || 'HUF').toUpperCase();
    const to = (toCode || 'HUF').toUpperCase();
    if (from === to) return amount;
    const fromCurr = currencyList.find(c => c.code.toUpperCase() === from);
    const toCurr = currencyList.find(c => c.code.toUpperCase() === to);
    const fromRate = fromCurr?.exchange_rate && fromCurr.exchange_rate > 0 ? fromCurr.exchange_rate : 1;
    const toRate = toCurr?.exchange_rate && toCurr.exchange_rate > 0 ? toCurr.exchange_rate : 1;
    return amount * (fromRate / toRate);
  };

  const getCostItemUnitAmount = (item: CostItem, priceField: 'unit_price' | 'selling_price' = 'selling_price') => {
    const price = Number((item as any)[priceField] ?? item.unit_price ?? 0);
    if (item.calculation_type === 'fixed') return price;
    const quantity = Number(item.price_quantity || 1) || 1;
    return price / quantity;
  };

  const getPriceVersionSummaries = () => {
    const targetCurrency = form.getFieldValue('currency') || 'HUF';
    const grouped = new Map<string, CostItem[]>();
    allCostItems
      .filter(item => item.is_active !== false)
      .forEach(item => {
        const version = (item.price_calculation_version || '1. verzió').trim() || '1. verzió';
        grouped.set(version, [...(grouped.get(version) || []), item]);
      });

    return Array.from(grouped.entries()).map(([version, items]) => {
      const unitCost = items.reduce((sum, item) => sum + convertCurrencyAmount(getCostItemUnitAmount(item, 'unit_price'), item.currency, targetCurrency), 0);
      const unitSelling = items.reduce((sum, item) => sum + convertCurrencyAmount(getCostItemUnitAmount(item, 'selling_price'), item.currency, targetCurrency), 0);
      const supplierNames = Array.from(new Set(
        items.map(item => item.is_internal ? 'Belső gyártás' : (item.supplier_name || '')).filter(Boolean)
      ));
      return { version, items, unitCost, unitSelling, currency: targetCurrency, supplierNames };
    }).sort((a, b) => a.version.localeCompare(b.version, 'hu'));
  };

  const getOptimalPriceVersion = () => {
    const summaries = getPriceVersionSummaries().filter(v => v.unitSelling > 0);
    return summaries.length ? summaries.reduce((best, current) => current.unitSelling < best.unitSelling ? current : best) : undefined;
  };

  const applyCalculatedPriceMode = (mode: 'default_version' | 'optimal_version') => {
    const summaries = getPriceVersionSummaries();
    const selectedVersion = form.getFieldValue('default_price_calculation_version');
    const summary = mode === 'optimal_version'
      ? getOptimalPriceVersion()
      : summaries.find(v => v.version === selectedVersion) || summaries[0];

    if (!summary) {
      message.warning('Nincs elérhető árkalkulációs verzió');
      return;
    }

    const net = Number(summary.unitSelling.toFixed(2));
    setNetUnitPrice(net);
    form.setFieldsValue({
      price_source_mode: mode,
      unit_cost_price: Number(summary.unitCost.toFixed(2)),
      unit_selling_price: net,
      markup_percentage: summary.unitCost > 0 ? Number((((summary.unitSelling - summary.unitCost) / summary.unitCost) * 100).toFixed(2)) : 0,
    });
    const vat = vatTypes.find(v => v.id === selectedVatTypeId);
    const vatPercentage = vat?.percentage || 0;
    setCalculatedVat(net * (Number(vatPercentage) / 100));
    setCalculatedGross(net * (1 + Number(vatPercentage) / 100));
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
    fetchWarehouses();
    fetchVatTypes();
    fetchCurrencies();
  }, []);

  // Recalculate VAT and gross price when vatTypes are loaded and editing
  useEffect(() => {
    if (selectedVatTypeId && vatTypes.length > 0 && netUnitPrice > 0) {
      const vat = vatTypes.find(v => v.id === selectedVatTypeId);
      if (vat) {
        const vatPercentage = Number(vat.percentage);
        const net = Number(netUnitPrice);
        const vatAmount = net * (vatPercentage / 100);
        const gross = net + vatAmount;
        setCalculatedVat(vatAmount);
        setCalculatedGross(gross);
      }
    }
  }, [vatTypes, selectedVatTypeId, netUnitPrice]);

  // Újratöltés szűrő vagy keresés változásakor
  useEffect(() => {
    fetchMaterials();
  }, [filterType, searchText, filterGroupId, filterSupplierId]);

  // Update informational price when default supplier changes
  // Disabled to strictly follow manual transfer workflow like Services
  /* 
  useEffect(() => { ... } 
  */

  const fetchMaterials = async () => {
    const seq = ++fetchSeqRef.current;
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
      
      if (filterGroupId !== undefined) {
        params.append('material_group', String(filterGroupId));
      }
      
      if (filterSupplierId !== undefined) {
        params.append('supplier', String(filterSupplierId));
      }
      
      // Load all materials for client-side pagination
      params.append('page_size', '10000');
      
      const queryString = params.toString();
      if (queryString) {
        url += '?' + queryString;
      }
      
      const response = await api.get(url);
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      if (seq === fetchSeqRef.current) setMaterials(data);
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
      // Safely sort alphabetically by name
      const sorted = data.sort((a: Supplier, b: Supplier) => {
          const nameA = a.name || '';
          const nameB = b.name || '';
          return nameA.localeCompare(nameB, 'hu');
      });
      setSuppliers(sorted);
    } catch (error) {
      console.error('Hiba a beszállítók betöltésekor:', error);
      message.error('Nem sikerült betölteni a beszállítókat');
    }
  };

  const fetchMaterialGroups = async () => {
    try {
      const response = await api.get('/warehouse/material-groups/?is_active=true');
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      const sorted = data.sort((a: MaterialGroup, b: MaterialGroup) => a.name.localeCompare(b.name, 'hu'));
      setMaterialGroups(sorted);
      // Build tree for TreeSelect
      const buildTree = (items: MaterialGroup[]): MaterialGroup[] => {
        const map = new Map<number, MaterialGroup>();
        const roots: MaterialGroup[] = [];
        const cloned = items.map(item => ({ ...item, children: [] as MaterialGroup[] }));
        cloned.forEach(item => map.set(item.id, item));
        cloned.forEach(item => {
          if (item.parent) { const p = map.get(item.parent); if (p) { p.children!.push(item); } else { roots.push(item); } }
          else { roots.push(item); }
        });
        const cleanup = (nodes: MaterialGroup[]) => nodes.forEach(n => { if (!n.children?.length) delete n.children; else cleanup(n.children!); });
        cleanup(roots);
        return roots;
      };
      const toTreeData = (nodes: MaterialGroup[]): any[] => nodes.map(n => ({
        value: n.id, title: n.name,
        children: n.children ? toTreeData(n.children) : undefined,
      }));
      setMaterialGroupTree(toTreeData(buildTree(sorted)));
    } catch (error) {
      console.error('Hiba az alapanyag gyűjtők betöltésekor:', error);
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

  const fetchVatTypes = async () => {
    try {
      // Fetch VAT types from ERP API (which proxies to invoice system)
      const response = await api.get('/warehouse/vat-types/', {
        params: { active: true }
      });
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      console.log('✅ VAT Types loaded:', data.length, 'types');
      setVatTypes(data);
    } catch (error) {
      console.error('Hiba az ÁFA típusok betöltésekor:', error);
      message.error('Nem sikerült betölteni az ÁFA típusokat');
    }
  };

  const fetchCurrencies = async () => {
    try {
      const currencies = await manufacturingService.getCurrencies();
      setCurrencyList(currencies);
    } catch (error) {
      console.error('Hiba a pénznemek betöltésekor:', error);
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

  // ── Material sizes ──────────────────────────────────────────────────────
  const fetchMaterialSizes = async (materialId: number) => {
    try {
      const res = await api.get(`/warehouse/material-sizes/?material_id=${materialId}`);
      const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setMaterialSizes(data);
    } catch (error) {
      console.error('Hiba a méretek betöltésekor:', error);
      setMaterialSizes([]);
    }
  };

  const handleAddSize = () => {
    if (!editingMaterial) { message.warning('Először mentsd el az alapanyagot'); return; }
    setEditingSizeItem(null);
    sizeForm.resetFields();
    sizeForm.setFieldsValue({
      material: editingMaterial.id,
      dimension_unit: editingMaterial.dimension_unit || 'mm',
      pricing_type: 'custom',
      custom_price: 0,
      is_active: true,
      sort_order: materialSizes.length,
    });
    setSizeModalVisible(true);
  };

  const handleEditSize = (item: MaterialSizeItem) => {
    setEditingSizeItem(item);
    sizeForm.setFieldsValue(item);
    setSizeModalVisible(true);
  };

  const handleDuplicateSize = (item: MaterialSizeItem) => {
    setEditingSizeItem(null);
    sizeForm.setFieldsValue({ ...item, id: undefined, name: item.name ? `${item.name} (másolat)` : '' });
    setSizeModalVisible(true);
  };

  const handleDeleteSize = async (id: number) => {
    try {
      await api.delete(`/warehouse/material-sizes/${id}/`);
      message.success('Méret törölve');
      if (editingMaterial) fetchMaterialSizes(editingMaterial.id);
    } catch { message.error('Hiba a törlés során'); }
  };

  const buildSizeName = (width: number | undefined, length: number | undefined, height: number | undefined, unit: string, format: string): string => {
    if (!width) return '';
    if (format === 'roll') {
      return `${width} ${unit}`;
    }
    if (length) {
      return height ? `${width}×${length}×${height} ${unit}` : `${width}×${length} ${unit}`;
    }
    return `${width} ${unit}`;
  };

  const autoFillSizeName = () => {
    const currentName = sizeForm.getFieldValue('name');
    if (currentName) return; // don't overwrite manual name
    const w = sizeForm.getFieldValue('width');
    const l = sizeForm.getFieldValue('length');
    const h = sizeForm.getFieldValue('height');
    const u = sizeForm.getFieldValue('dimension_unit') || 'mm';
    const generated = buildSizeName(w, l, h, u, selectedMaterialFormat);
    if (generated) sizeForm.setFieldsValue({ name: generated });
  };

  const handleSizeSubmit = async (values: any) => {
    if (!values.name) {
      values.name = buildSizeName(values.width, values.length, values.height, values.dimension_unit || 'mm', selectedMaterialFormat);
    }
    try {
      if (editingSizeItem?.id) {
        await api.patch(`/warehouse/material-sizes/${editingSizeItem.id}/`, values);
        message.success('Méret frissítve');
      } else {
        await api.post('/warehouse/material-sizes/', values);
        message.success('Méret létrehozva');
      }
      setSizeModalVisible(false);
      if (editingMaterial) fetchMaterialSizes(editingMaterial.id);
    } catch (error: any) {
      const data = error.response?.data;
      if (data && typeof data === 'object' && !data.detail) {
        const msgs = Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
        message.error(msgs.join(' | ') || 'Hiba a mentés során');
      } else {
        message.error(data?.detail || 'Hiba a mentés során');
      }
    }
  };

  const fetchAddedSuppliers = async (materialId: number) => {
    try {
      const [costResponse, suppliersResponse] = await Promise.all([
        api.get(`/warehouse/material-cost-items/?material_id=${materialId}`),
        api.get(`/warehouse/material-suppliers/?material=${materialId}`),
      ]);

      const allCostItems = Array.isArray(costResponse.data) ? costResponse.data : (costResponse.data.results || []);
      const linkedSuppliers = Array.isArray(suppliersResponse.data) ? suppliersResponse.data : (suppliersResponse.data.results || []);
      setAllCostItems(allCostItems);
      
      // Get unique suppliers from cost items and linked suppliers
      const uniqueSuppliers: Map<string, Supplier & { is_internal?: boolean }> = new Map();

      // Add explicitly linked suppliers first
      linkedSuppliers.forEach((ms: any) => {
        if (ms.supplier && ms.supplier_name) {
          uniqueSuppliers.set(`supplier_${ms.supplier}`, { 
            id: ms.supplier, 
            name: ms.supplier_name,
            is_internal: false 
          });
        }
      });
      
      // Check for internal production
      const hasInternal = allCostItems.some((item: CostItem) => item.is_internal);
      if (hasInternal) {
        uniqueSuppliers.set('internal', { id: -1, name: 'Belső gyártás', is_internal: true });
      }
      
      // Add external suppliers from cost items (backup)
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
      setAllCostItems([]);
    }
  };

  const handleExportCsv = async () => {
    const ids = selectedRowKeys.join(',');
    const params: Record<string, string> = {};
    if (ids) params.ids = ids;
    try {
      const res = await api.get('/warehouse/materials/export_csv/', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'materials.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('CSV export hiba');
    }
  };

  const handleImportCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCsvPendingFile(file);
    setCsvSkipEmptyModal(true);
  };

  const handleImportSubmit = async (skipEmpty: boolean) => {
    if (!csvPendingFile) return;
    setCsvSkipEmptyModal(false);
    const formData = new FormData();
    formData.append('file', csvPendingFile);
    formData.append('skip_empty', skipEmpty ? '1' : '0');
    setCsvPendingFile(null);
    setCsvImporting(true);
    try {
      const res = await api.post('/warehouse/materials/import_csv/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { created, updated, errors } = res.data;
      const lines = [`Létrehozva: ${created}, Frissítve: ${updated}`];
      if (errors?.length) lines.push(`Hibák: ${errors.slice(0, 5).join('; ')}`);
      if (errors?.length > 5) lines.push(`… és még ${errors.length - 5} hiba`);
      message.success(lines.join(' | '), 6);
      fetchMaterials();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Import hiba');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleCreate = () => {
    setEditingMaterial(null);
    setDuplicateSourceId(null);
    form.resetFields();
    setSelectedMaterialFormat('piece');
    setSelectedSourceForCost(null);
    setCostItems([]);
    setAllCostItems([]);
    setAddedSuppliers([]);
    setNetUnitPrice(0);
    setCalculatedVat(0);
    setCalculatedGross(0);
    setSelectedVatTypeId(undefined);
    form.setFieldsValue({ price_source_mode: 'manual', default_price_calculation_version: '' });
    setModalVisible(true);
  };

  const handleEdit = (material: Material) => {
    console.log('📖 Loading material - vat_type_id:', material.vat_type_id);
    setEditingMaterial(material);
    setSelectedVatTypeId(material.vat_type_id || undefined);
    setSelectedMaterialFormat(material.material_format || 'piece');
    
    // Initialize net price and VAT calculations
    if (material.unit_selling_price) {
      const netPrice = Number(material.unit_selling_price);
      setNetUnitPrice(netPrice);
      if (material.vat_type_id) {
        const vat = vatTypes.find(v => v.id === material.vat_type_id);
        const vatPercentage = vat?.percentage || 0;
        const vatAmount = netPrice * (Number(vatPercentage) / 100);
        const gross = netPrice + vatAmount;
        setCalculatedVat(vatAmount);
        setCalculatedGross(gross);
      }
    }
    
    // Transform data for form: if internal, set default_supplier_selection to 'internal'
    const formData: any = {
        ...material,
        default_supplier_selection: material.is_internal_production ? 'internal' : material.default_supplier
    };
    
    // Remove read-only/computed fields that shouldn't be in the form
    const readOnlyFields = ['material_type_name', 'material_group_name', 'created_by_name', 
                            'default_supplier_name', 'internal_production_department_name',
                            'base_price', 'gross_price', 'net_price', 'vat_rate', 
                            'current_stock', 'discount_price'];
    readOnlyFields.forEach(field => delete formData[field]);
    
    console.log('🔍 formData.vat_type_id before setFieldsValue:', formData.vat_type_id);
    
    form.setFieldsValue(formData);
    console.log('🔍 After setFieldsValue - form value:', form.getFieldValue('vat_type_id'));
    
    // Open modal
    setModalVisible(true);
    
    // Load added suppliers
    fetchAddedSuppliers(material.id);
    
    // Load stocks and receipts
    fetchStocks(material.id);
    fetchReceipts(material.id);
    fetchMaterialSizes(material.id);
    
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

  const generateCode = () => {
    const name = form.getFieldValue('name');
    if (!name) {
      message.warning('Előbb add meg az alapanyag nevét!');
      return;
    }

    let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) base = 'MAT';
    
    // Existing codes
    const codes = new Set(materials.map(s => s.code));
    
    let i = 1;
    let suffix = '001';
    let candidate = `${base}-${suffix}`;
    
    // Safety break loop
    let loops = 0;
    while (codes.has(candidate)) {
        i++;
        suffix = i.toString().padStart(3, '0');
        candidate = `${base}-${suffix}`;
        loops++;
        if (loops > 200) { // Should be enough
            message.error('Nem sikerült egyedi cikkszámot generálni (túl sok próbálkozás)');
            return;
        }
    }
    
    form.setFieldsValue({ code: candidate });
  };

  const handleSubmit = async (values: any) => {
    try {
      // Get ALL form values including those in non-active tabs
      const allValues = form.getFieldsValue(true);
      
      // Use allValues instead of values to include all fields from all tabs
      const submitData = { ...allValues };
      submitData.vat_type_id = selectedVatTypeId || null;
      
      // Sync calculated prices with form values
      submitData.unit_selling_price = Number(netUnitPrice.toFixed(2));
      submitData.price_source_mode = submitData.price_source_mode || 'manual';
      submitData.default_price_calculation_version = submitData.default_price_calculation_version || '';
      
      // Map 'default_supplier_selection' to backend fields
      const selection = submitData.default_supplier_selection;
      
      if (selection === 'internal') {
          submitData.is_internal_production = true;
          submitData.default_supplier = null;
      } else if (selection) {
          submitData.is_internal_production = false;
          submitData.default_supplier = Number(selection);
          submitData.internal_production_department = null;
      }

      // Cleanup aux field
      delete submitData.default_supplier_selection;

      // Clean up empty strings for optional numeric fields to prevent 400 errors
      const numericFields = [
          'width', 'length', 'height', 'density', 'roll_width', 
          'area_weight', 'specific_weight', 'weight', 'volume_liter',
          'internal_production_cost', 'internal_fixed_cost',
          'internal_price_per_unit', 'internal_price_per_perimeter',
          'internal_price_per_area', 'internal_price_per_weight', 
          'internal_price_per_time'
      ];
      
      numericFields.forEach(field => {
          if (submitData[field] === '') {
              submitData[field] = null;
          }
      });
      
      // Ha nincs beállítva, alapértelmezés szerint mindkét checkbox be van pipálva
      if (submitData.is_material === undefined) submitData.is_material = true;
      if (submitData.is_product === undefined) submitData.is_product = true;
      
      console.log('🚀 Sending to API - submitData.vat_type_id:', submitData.vat_type_id);
      console.log('🚀 Full submitData being sent:', submitData);
      
      let savedMaterial: any;
      if (editingMaterial) {
        const res = await api.patch(`/warehouse/materials/${editingMaterial.id}/`, submitData);
        savedMaterial = res.data;
        console.log('✅ Backend response - savedMaterial.vat_type_id:', savedMaterial.vat_type_id);
        message.success('Alapanyag/Termék frissítve');
      } else {
        // Auto-increment code if already taken
        const tryPost = async (data: any): Promise<any> => {
          try {
            const res = await api.post('/warehouse/materials/', data);
            return res.data;
          } catch (err: any) {
            const errData = err?.response?.data;
            const isCodeConflict = errData?.code && (
              String(errData.code).toLowerCase().includes('unique') ||
              String(errData.code).toLowerCase().includes('unique') ||
              (Array.isArray(errData.code) && errData.code.some((e: string) => String(e).toLowerCase().includes('unique')))
            );
            if (!isCodeConflict) throw err;
            // Strip existing suffix like -2, -3, ... then increment
            const base = String(data.code || '').replace(/-(\d+)$/, '');
            const codes = new Set(materials.map((m: any) => m.code));
            let i = 2;
            while (codes.has(`${base}-${i}`) && i < 9999) i++;
            const newCode = `${base}-${i}`;
            form.setFieldsValue({ code: newCode });
            const res = await api.post('/warehouse/materials/', { ...data, code: newCode });
            return res.data;
          }
        };
        savedMaterial = await tryPost(submitData);
        message.success('Alapanyag/Termék létrehozva');
        
        // Copy cost items from source material when duplicating
        if (savedMaterial && duplicateSourceId) {
          try {
            const costRes = await api.get(`/warehouse/material-cost-items/?material_id=${duplicateSourceId}`);
            const sourceCostItems = costRes.data?.results || costRes.data || [];
            for (const ci of sourceCostItems) {
              await api.post('/warehouse/material-cost-items/', {
                material: savedMaterial.id,
                supplier: ci.supplier || null,
                is_internal: ci.is_internal,
                name: ci.name,
                calculation_type: ci.calculation_type,
                unit: ci.unit,
                price_calculation_version: ci.price_calculation_version || '1. verzió',
                unit_price: ci.unit_price,
                price_quantity: ci.price_quantity || 1,
                markup_percentage: ci.markup_percentage,
                currency: ci.currency,
                is_active: ci.is_active,
              });
            }
            if (sourceCostItems.length > 0) {
              message.success(`${sourceCostItems.length} költségelem átmásolva`);
            }
          } catch (err) {
            console.error('Failed to copy cost items:', err);
            message.warning('Költségelemek másolása sikertelen');
          }
          // Copy sizes
          if (duplicateSourceSizes.length > 0) {
            try {
              for (const sz of duplicateSourceSizes) {
                const { id: _sid, material: _smid, created_at: _sc, ...szRest } = sz;
                await api.post('/warehouse/material-sizes/', { ...szRest, material: savedMaterial.id });
              }
              message.success(`${duplicateSourceSizes.length} méret átmásolva`);
            } catch (err) {
              console.error('Failed to copy sizes:', err);
              message.warning('Méretek másolása sikertelen');
            }
          }
          setDuplicateSourceId(null);
          setDuplicateSourceSizes([]);
        }

        // Save added suppliers immediately for new material
        if (savedMaterial && addedSuppliers.length > 0) {
             for (const supplier of addedSuppliers) {
                 if (!supplier.is_internal) {
                     try {
                        await api.post('/warehouse/material-suppliers/', {
                            material: savedMaterial.id,
                            supplier: supplier.id,
                            unit_price: 0,
                            currency: 'HUF',
                            is_active: true,
                        });
                     } catch (err) {
                         console.error('Failed to link supplier:', supplier, err);
                     }
                 }
             }
        }
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
      console.error('Full save error:', error);
      const data = error.response?.data;
      
      if (data) {
          if (data.default_supplier) {
              message.warning('Kérlek válassz alapértelmezett beszállítót a megfelelő listából!');
          } else if (data.code) {
               message.error(`A kód hibás: ${Array.isArray(data.code) ? data.code.join(', ') : data.code}`);
          } else {
              // Detailed error display
              const errorMessages = Object.entries(data)
                .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
                .join('\n');
                
              Modal.error({
                  title: 'Hiba a mentés során',
                  content: <pre style={{ maxHeight: '300px', overflow: 'auto' }}>{errorMessages}</pre>,
                  width: 600
              });
          }
      } else {
        message.error('Hiba a mentés során (ismeretlen hiba)');
      }
    }
  };

  const handleSaveWithoutClose = async () => {
    try {
      const values = await form.validateFields();
      values.vat_type_id = selectedVatTypeId || null;
      values.unit_selling_price = Number(netUnitPrice.toFixed(2));
      values.price_source_mode = values.price_source_mode || 'manual';
      values.default_price_calculation_version = values.default_price_calculation_version || '';
      
      // Map 'default_supplier_selection' to backend fields
      const selection = values.default_supplier_selection;
      
      if (selection === 'internal') {
          values.is_internal_production = true;
          values.default_supplier = null;
      } else if (selection) {
          values.is_internal_production = false;
          values.default_supplier = Number(selection);
          values.internal_production_department = null;
      }
      
      // Cleanup aux field
      delete values.default_supplier_selection;

      // Clean up empty strings for optional numeric fields to prevent 400 errors
      const numericFields = [
          'width', 'length', 'height', 'density', 'roll_width', 
          'area_weight', 'specific_weight', 'weight', 'volume_liter',
          'internal_production_cost', 'internal_fixed_cost',
          'internal_price_per_unit', 'internal_price_per_perimeter',
          'internal_price_per_area', 'internal_price_per_weight', 
          'internal_price_per_time'
      ];
      
      numericFields.forEach(field => {
          if (values[field] === '') {
              values[field] = null;
          }
      });
      
      // Ha nincs beállítva, alapértelmezés szerint mindkét checkbox be van pipálva
      if (values.is_material === undefined) values.is_material = true;
      if (values.is_product === undefined) values.is_product = true;
      
      if (editingMaterial) {
        const response = await api.patch(`/warehouse/materials/${editingMaterial.id}/`, values);
        message.success('Alapanyag/Termék mentve');
        // Frissítjük az editingMaterial-t az új adatokkal
        const newData = response.data;
        formDataForEdit(newData);
      } else {
        const response = await api.post('/warehouse/materials/', values);
        message.success('Alapanyag/Termék létrehozva');
        const newData = response.data;
        
        // Save added suppliers immediately for new material
        if (newData && addedSuppliers.length > 0) {
             for (const supplier of addedSuppliers) {
                 if (!supplier.is_internal) {
                     try {
                        await api.post('/warehouse/material-suppliers/', {
                            material: newData.id,
                            supplier: supplier.id,
                            unit_price: 0,
                            currency: 'HUF',
                            is_active: true,
                        });
                     } catch (err) {
                         console.error('Failed to link supplier:', supplier, err);
                     }
                 }
             }
        }
        
        // Átváltunk szerkesztési módba
        formDataForEdit(newData);
        fetchAddedSuppliers(newData.id);
        fetchStocks(newData.id);
        fetchReceipts(newData.id);
      }
      fetchMaterials();
    } catch (error: any) {
      console.error('Full save error:', error);
      const data = error.response?.data;
      
      if (data) {
          if (data.default_supplier) {
              message.warning('Kérlek válassz alapértelmezett beszállítót a megfelelő listából!');
          } else if (data.code) {
               message.error(`A kód hibás: ${Array.isArray(data.code) ? data.code.join(', ') : data.code}`);
          } else {
              const errorMessages = Object.entries(data)
                .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
                .join('\n');
                
              Modal.error({
                  title: 'Hiba a mentés során',
                  content: <pre style={{ maxHeight: '300px', overflow: 'auto' }}>{errorMessages}</pre>,
                  width: 600
              });
          }
      } else {
        message.error('Hiba a mentés során (ismeretlen hiba)');
      }
    }
  };
  
  // Helper to init form data after save/load
  const formDataForEdit = (data: any) => {
     setEditingMaterial(data);
      setSelectedVatTypeId(data.vat_type_id || undefined);
     form.setFieldsValue({
        ...data,
        default_supplier_selection: data.is_internal_production ? 'internal' : data.default_supplier
     });
  };

  const handleAddSupplier = async (supplierId: number) => {
    const supplier = suppliers.find(s => s.id === supplierId);
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
        const data = error.response?.data;
        // Check for standard unique_together errors (non_field_errors) OR specific field error on 'supplier' indicating duplication
        if (error.response?.status === 400 && (data?.non_field_errors || data?.supplier)) {
          // Already exists - ensure it's in the list and suppress error
          message.info(`${supplier.name} már hozzá van adva`);
        } else {
          message.error('Hiba a beszállító mentésekor');
          console.error('API Error Response:', data);
          console.error(error);
          return;
        }
      }
    }
    
    setAddedSuppliers([...addedSuppliers, { ...supplier, is_internal: false }]);
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
      price_calculation_version: form.getFieldValue('default_price_calculation_version') || '1. verzió',
      price_quantity: 1,
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
      if (editingMaterial) {
        fetchAddedSuppliers(editingMaterial.id);
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
      if (editingMaterial) {
        fetchAddedSuppliers(editingMaterial.id);
      }
    } catch (error: any) {
      const data = error.response?.data;
      if (data && typeof data === 'object' && !data.detail) {
        const msgs = Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
        message.error(msgs.join(' | ') || 'Hiba a mentés során');
      } else {
        message.error(data?.detail || 'Hiba a mentés során');
      }
      console.error('CostItem save error:', data);
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
    const cost = getTotalCost();
    const selling = getTotalSelling();
    const markup = cost > 0 ? ((selling - cost) / cost * 100) : 0;
    
    form.setFieldsValue({
      unit_cost_price: Number(cost.toFixed(2)),
      unit_selling_price: Number(selling.toFixed(2)),
      markup_percentage: Number(markup.toFixed(2))
    });
    
    // Set net price and recalculate VAT
    setNetUnitPrice(Number(selling.toFixed(2)));
    const vat = vatTypes.find(v => v.id === selectedVatTypeId);
    const vatPercentage = vat?.percentage || 0;
    const vatAmount = selling * (Number(vatPercentage) / 100);
    const gross = selling + vatAmount;
    setCalculatedVat(vatAmount);
    setCalculatedGross(gross);
    
    message.success('Árak átvezetve az alapadatokhoz');
  };

  const handleAddVersion = (versionName: string) => {
    setSelectedVersionForCost(versionName);
    setVersionNameModal(null);
    message.info(`Verzió létrehozva: ${versionName}. Válassz forrást és adj hozzá elemeket.`);
  };

  const handleCopyVersion = async (sourceVersionName: string, newVersionName: string) => {
    if (!editingMaterial) return;
    const sourceItems = allCostItems.filter(item =>
      (item.price_calculation_version || '1. verzió').trim() === sourceVersionName
    );
    if (sourceItems.length === 0) {
      message.warning('Nincs másolható elem ebben a verzióban');
      return;
    }
    try {
      for (const item of sourceItems) {
        const { id, supplier_name, calculation_type_display, ...rest } = item as any;
        await api.post('/warehouse/material-cost-items/', {
          ...rest,
          price_calculation_version: newVersionName,
        });
      }
      message.success(`Verzió másolva: ${newVersionName}`);
      await fetchAddedSuppliers(editingMaterial.id);
      setSelectedVersionForCost(newVersionName);
      setVersionNameModal(null);
    } catch (error) {
      message.error('Hiba a másolás során');
      console.error(error);
    }
  };

  const handleDeleteVersion = async (versionName: string) => {
    if (!editingMaterial) return;
    const itemsToDelete = allCostItems.filter(item =>
      (item.price_calculation_version || '1. verzió').trim() === versionName
    );
    try {
      for (const item of itemsToDelete) {
        if (item.id) await api.delete(`/warehouse/material-cost-items/${item.id}/`);
      }
      message.success('Verzió törölve');
      await fetchAddedSuppliers(editingMaterial.id);
      if (selectedVersionForCost === versionName) setSelectedVersionForCost(null);
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleRenameVersion = async (oldName: string, newName: string) => {
    if (!editingMaterial) return;
    const itemsToRename = allCostItems.filter(item =>
      (item.price_calculation_version || '1. verzió').trim() === oldName
    );
    try {
      for (const item of itemsToRename) {
        if (item.id) await api.patch(`/warehouse/material-cost-items/${item.id}/`, { price_calculation_version: newName });
      }
      message.success('Verzió átnevezve');
      await fetchAddedSuppliers(editingMaterial.id);
      if (selectedVersionForCost === oldName) setSelectedVersionForCost(newName);
      setVersionNameModal(null);
    } catch (error) {
      message.error('Hiba az átnevezés során');
      console.error(error);
    }
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
    setReceiptBatchLines([{ key: 0, sizeId: undefined, count: 1, lengthPerUnit: undefined, lengthUnit: 'm' }]);
    receiptBatchKeyRef.current = 1;
    
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

  // Converts a dimension value from dimUnit to meters
  const toMeters = (value: number, dimUnit: string): number => {
    if (dimUnit === 'mm') return value / 1000;
    if (dimUnit === 'cm') return value / 100;
    return value; // already m
  };

  const calcQtyForLine = (line: { sizeId: number | undefined; count: number; lengthPerUnit: number | undefined; lengthUnit: string }): number => {
    if (!editingMaterial || !line.sizeId || !line.count) return 0;
    const size = materialSizes.find(s => s.id === line.sizeId);
    if (!size) return 0;
    const unit = editingMaterial.unit || 'db';
    const wM = toMeters(size.width, size.dimension_unit);
    const lM = size.length ? toMeters(size.length, size.dimension_unit) : 0;
    const lpuM = line.lengthPerUnit ? toMeters(line.lengthPerUnit, line.lengthUnit) : 0;
    if (selectedMaterialFormat === 'roll') {
      if (unit === 'm²' || unit === 'm2') return wM * lpuM * line.count;
      if (unit === 'm') return lpuM * line.count;
      return line.count;
    } else {
      if (unit === 'm²' || unit === 'm2') return wM * lM * line.count;
      return line.count;
    }
  };

  const recalcBatchTotal = (lines: { sizeId: number | undefined; count: number; lengthPerUnit: number | undefined; lengthUnit: string }[]) => {
    const totalQty = Math.round(lines.reduce((sum, l) => sum + calcQtyForLine(l), 0) * 1e4) / 1e4;
    receiptForm.setFieldsValue({ quantity: totalQty || undefined });
    const up = receiptForm.getFieldValue('unit_price') || 0;
    if (up && totalQty) receiptForm.setFieldsValue({ invoice_value: Math.round(up * totalQty * 100) / 100 });
    // Persist width/length from the first complete batch line for per-roll/sheet stock tracking
    const firstComplete = lines.find(l => l.sizeId);
    if (firstComplete) {
      const size = materialSizes.find(s => s.id === firstComplete.sizeId);
      if (size) {
        let rollLength: number;
        if (selectedMaterialFormat === 'roll') {
          // Convert from the user-entered unit to the size's dimension_unit
          const inMeters = toMeters(firstComplete.lengthPerUnit || 0, firstComplete.lengthUnit);
          const targetUnit = size.dimension_unit;
          if (targetUnit === 'mm') rollLength = inMeters * 1000;
          else if (targetUnit === 'cm') rollLength = inMeters * 100;
          else rollLength = inMeters; // 'm'
        } else {
          rollLength = size.length || 0;
        }
        receiptForm.setFieldsValue({ width: size.width, length: rollLength, dimension_unit: size.dimension_unit });
      }
    }
  };

  const updateBatchLine = (key: number, patch: Partial<{ sizeId: number | undefined; count: number; lengthPerUnit: number | undefined; lengthUnit: string }>) => {
    setReceiptBatchLines(prev => {
      const next = prev.map(l => l.key === key ? { ...l, ...patch } : l);
      recalcBatchTotal(next);
      return next;
    });
  };

  const handleReceiptSubmit = async (values: any) => {
    try {
      if ((selectedMaterialFormat === 'roll' || selectedMaterialFormat === 'sheet') && receiptBatchLines.some(l => l.sizeId)) {
        // Tekercs/tábla: soronként egy bevételezés, stock_count = sor db száma
        for (const line of receiptBatchLines) {
          if (!line.sizeId) continue;
          const size = materialSizes.find(s => s.id === line.sizeId);
          if (!size) continue;
          const lineQty = calcQtyForLine(line);
          if (!lineQty) continue;

          let rollLength: number;
          if (selectedMaterialFormat === 'roll') {
            const inMeters = toMeters(line.lengthPerUnit || 0, line.lengthUnit);
            const targetUnit = size.dimension_unit;
            if (targetUnit === 'mm') rollLength = inMeters * 1000;
            else if (targetUnit === 'cm') rollLength = inMeters * 100;
            else rollLength = inMeters;
          } else {
            rollLength = size.length || 0;
          }

          await api.post('/warehouse/material-receipts/', {
            ...values,
            quantity: lineQty,
            width: size.width,
            length: rollLength,
            dimension_unit: size.dimension_unit,
            stock_count: line.count,
            invoice_value: Math.round((values.unit_price || 0) * lineQty * 100) / 100,
          });
        }
      } else {
        await api.post('/warehouse/material-receipts/', values);
      }
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

  const handleDuplicate = async (record: Material) => {
    setLoading(true);
    try {
        const [res, sizesRes] = await Promise.all([
          api.get(`/warehouse/materials/${record.id}/`),
          api.get(`/warehouse/material-sizes/?material_id=${record.id}`),
        ]);
        const data = res.data;
        const { id, created_at, created_by_name, ...rest } = data;
        const sizes = Array.isArray(sizesRes.data) ? sizesRes.data : (sizesRes.data.results || []);
        
        setEditingMaterial(null);
        setDuplicateSourceId(record.id);
        setDuplicateSourceSizes(sizes);
        form.setFieldsValue(rest);
        setModalVisible(true);
    } catch (err) {
        console.error(err);
        message.error('Hiba a másoláskor');
    } finally {
        setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Anyag',
      key: 'main_details',
      sorter: (a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'hu'),
      render: (record: Material) => (
         <div style={{ lineHeight: '1.2' }}>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            <div style={{ fontSize: '11px', color: '#888' }}>{record.code}</div>
         </div>
      ),
    },
    {
      title: 'Típus',
      key: 'type',
      width: 90,
      sorter: (a: any, b: any) => {
        const aStr = [a.is_material ? 'Alapanyag' : '', a.is_product ? 'Termék' : ''].filter(Boolean).join(',');
        const bStr = [b.is_material ? 'Alapanyag' : '', b.is_product ? 'Termék' : ''].filter(Boolean).join(',');
        return aStr.localeCompare(bStr, 'hu');
      },
      render: (record: Material) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {record.is_material && <Tag color="blue" style={{ margin: 0, fontSize: '11px', textAlign: 'center' }}>Alapanyag</Tag>}
          {record.is_product && <Tag color="green" style={{ margin: 0, fontSize: '11px', textAlign: 'center' }}>Termék</Tag>}
        </div>
      ),
    },
    {
      title: 'Kategória',
      dataIndex: 'material_group_name',
      key: 'material_group_name',
      width: 150,
      responsive: ['lg'] as any,
      sorter: (a: any, b: any) => (a.material_group_name || '').localeCompare(b.material_group_name || '', 'hu'),
      render: (groupName: string | undefined) => 
        groupName ? <Tag color="purple" style={{ margin: 0, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupName}</Tag> : '-',
    },
    {
      title: 'Formátum',
      dataIndex: 'material_format',
      key: 'material_format',
      width: 110,
      responsive: ['xl'] as any,
      sorter: (a: any, b: any) => (a.material_format || '').localeCompare(b.material_format || ''),
      render: (format: string) => {
        const formatMap: Record<string, string> = {
          'sheet': 'Táblás/Íves',
          'roll': 'Tekercses',
          'linear': 'Folyóméter',
          'piece': 'Darab',
          'weight': 'Súly alapú',
          'liter': 'Liter alapú',
        };
        return <span style={{ fontSize: '13px' }}>{formatMap[format] || format}</span>;
      },
    },
    {
      title: 'Egységár',
      key: 'unit_selling_price',
      width: 120,
      align: 'right' as const,
      sorter: (a: any, b: any) => (Number(a.unit_selling_price) || 0) - (Number(b.unit_selling_price) || 0),
      render: (record: Material) => (
         <div style={{ whiteSpace: 'nowrap' }}>
           {record.unit_selling_price ? `${Number(record.unit_selling_price).toLocaleString()} Ft` : '-'}
         </div>
      ),
    },
    {
      title: 'Egység',
      dataIndex: 'unit_display',
      key: 'unit_display',
      width: 80,
      responsive: ['sm'] as any,
      sorter: (a: any, b: any) => (a.unit_display || '').localeCompare(b.unit_display || '', 'hu'),
    },
    {
      title: 'Beszállító',
      key: 'source',
      width: 130,
      responsive: ['lg'] as any,
      sorter: (a: any, b: any) => {
        const aName = a.internal_production_department_name || a.default_supplier_name || '';
        const bName = b.internal_production_department_name || b.default_supplier_name || '';
        return aName.localeCompare(bName, 'hu');
      },
      render: (_: any, record: Material) => {
        return record.is_internal_production && record.internal_production_department_name ? (
          <Tag color="green" style={{ margin: 0, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.internal_production_department_name}</Tag>
        ) : record.default_supplier_name ? (
          <Tag color="blue" style={{ margin: 0, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.default_supplier_name}</Tag>
        ) : (
          <span style={{ color: '#ccc' }}>-</span>
        );
      },
    },
    {
      title: 'Státusz',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      responsive: ['sm'] as any,
      sorter: (a: any, b: any) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1),
      render: (is_active: boolean) => (
        <Tag color={is_active ? 'green' : 'red'} style={{ margin: 0 }}>
          {is_active ? 'Aktív' : 'Inaktív'}
        </Tag>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 140,
      render: (_: any, record: Material) => (
        <Space wrap size={1}>
           <Button
            type="text"
            icon={<CopyOutlined />}
            title="Új az adatok alapján"
            onClick={() => handleDuplicate(record)}
          />
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="Biztosan törli?"
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const costItemColumns = [
    {
      title: 'Verzió',
      dataIndex: 'price_calculation_version',
      key: 'price_calculation_version',
      render: (value: string) => value || '1. verzió',
    },
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
      render: (value: number, record: CostItem) => `${Number(value).toLocaleString()} ${record.currency || 'HUF'}`,
    },
    {
      title: 'Ár mennyiségre',
      dataIndex: 'price_quantity',
      key: 'price_quantity',
      render: (value: number, record: CostItem) => record.calculation_type === 'fixed' ? 'fix' : `${Number(value || 1).toLocaleString('hu-HU')} ${record.unit || ''}`,
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
      render: (value: number, record: CostItem) => `${Number(value).toLocaleString()} ${record.currency || 'HUF'}`,
    },
    {
      title: 'Egységre jutó nettó',
      key: 'unit_selling_contribution',
      render: (_: any, record: CostItem) => `${getCostItemUnitAmount(record, 'selling_price').toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${record.currency || 'HUF'}`,
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
      <Card title="Alapanyagok/Termékek" style={{ marginBottom: 0 }}>
      <EnhancedTable
        tableKey="materials"
        size="small"
        columns={columns as any}
        dataSource={materials}
        loading={loading}
        rowKey="id"
        cardBreakpoint={800}
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Keresés név, kód vagy leírás alapján..."
        rowSelection={{
          selectedRowKeys,
          onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
          columnWidth: 40,
        }}
        toolbarExtra={
          <Space wrap>
            <Select
              value={filterType}
              onChange={(val) => { setFilterType(val); try { sessionStorage.setItem('materials_filterType', val); } catch {} }}
              style={{ width: 140 }}
            >
              <Option value="all">Mind</Option>
              <Option value="materials">Alapanyagok</Option>
              <Option value="products">Termékek</Option>
            </Select>
            <TreeSelect
              allowClear
              placeholder="Kategória"
              value={filterGroupId}
              onChange={(val) => { setFilterGroupId(val); try { if (val != null) sessionStorage.setItem('materials_filterGroupId', String(val)); else sessionStorage.removeItem('materials_filterGroupId'); } catch {} }}
              style={{ width: 180 }}
              showSearch
              treeData={materialGroupTree}
              treeDefaultExpandAll={false}
              filterTreeNode={(input, node) => String(node?.title ?? '').toLowerCase().includes(input.toLowerCase())}
              styles={{ popup: { root: { maxHeight: 400, overflow: 'auto' } } }}
            />
            <Select
              allowClear
              placeholder="Beszállító"
              value={filterSupplierId}
              onChange={(val) => { setFilterSupplierId(val); try { if (val != null) sessionStorage.setItem('materials_filterSupplierId', String(val)); else sessionStorage.removeItem('materials_filterSupplierId'); } catch {} }}
              style={{ width: 200 }}
              showSearch
              filterOption={(input, option) =>
                String(option?.children || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {suppliers.map(s => (
                <Option key={s.id} value={s.id}>{s.name}</Option>
              ))}
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              Új elem
            </Button>
            <ExportButton dataType="material" selectedIds={selectedRowKeys} />
            <Tooltip title={selectedRowKeys.length ? `${selectedRowKeys.length} kijelölt sor exportálása` : 'Összes anyag exportálása CSV-be'}>
              <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
                CSV export{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}
              </Button>
            </Tooltip>
            <Tooltip title="Anyagok importálása CSV-ből (cikkszám egyezésnél felülírja)">
              <Button
                icon={<ImportOutlined />}
                loading={csvImporting}
                onClick={() => csvImportRef.current?.click()}
              >
                CSV import
              </Button>
            </Tooltip>
            <input
              ref={csvImportRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleImportCsvChange}
            />
          </Space>
        }
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100', '200'],
          showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} / ${total}`,
        }}
      />
      </Card>

      <Modal
        title="CSV import beállítás"
        open={csvSkipEmptyModal}
        onCancel={() => { setCsvSkipEmptyModal(false); setCsvPendingFile(null); }}
        footer={null}
        width={480}
      >
        <p style={{ marginBottom: 24 }}>
          Mit tegyen az import, ha a CSV-ben egy mező <strong>üres</strong>, de a meglévő rekordban van érték?
        </p>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button block type="primary" onClick={() => handleImportSubmit(false)}>
            Felülírja üres cellával (töröl)
          </Button>
          <Button block onClick={() => handleImportSubmit(true)}>
            Megtartja a meglévő értéket (ajánlott)
          </Button>
        </Space>
      </Modal>

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
              forceRender: true,
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
                price_source_mode: 'manual',
                default_price_calculation_version: '',
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

              <Form.Item label="Cikkszám" required>
                 <Space>
                    <Form.Item 
                       name="code" 
                       noStyle 
                       rules={[{ required: true, message: 'Kötelező mező' }]}
                    >
                      <Input />
                    </Form.Item>
                    <Button 
                      icon={<ThunderboltOutlined />} 
                      onClick={generateCode}
                      title="Cikkszám generálás"
                    />
                 </Space>
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
                  <TreeSelect
                    allowClear
                    showSearch
                    placeholder="Válassz gyűjtőt (opcionális)"
                    treeData={materialGroupTree}
                    treeDefaultExpandAll={false}
                    filterTreeNode={(input, node) =>
                      String(node?.title ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    styles={{ popup: { root: { maxHeight: 400, overflow: 'auto' } } }}
                  />
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
                      <NumInput 
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
                      <NumInput 
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
                      <NumInput 
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
                      <NumInput 
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
                      <NumInput 
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
                      <NumInput 
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
                    <NumInput style={{ width: '100%' }} min={0} precision={3} />
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
                    <NumInput style={{ width: '100%' }} min={0} precision={3} />
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
                    <NumInput style={{ width: '100%' }} min={0} precision={2} addonAfter="liter" />
                  </Form.Item>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item name="specific_weight" label="Fajsúly">
                      <NumInput style={{ width: '100%' }} min={0} precision={2} />
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
                <NumInput style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item shouldUpdate noStyle>
                {() => {
                  const summaries = getPriceVersionSummaries();
                  const optimal = getOptimalPriceVersion();
                  const priceSourceMode = form.getFieldValue('price_source_mode') || 'manual';
                  const activeCurrency = form.getFieldValue('currency') || 'HUF';
                  return (
                    <div style={{ marginTop: 16, marginBottom: 16, padding: 16, background: '#fff7e6', borderRadius: 6, border: '1px solid #ffd591' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                        <strong style={{ fontSize: 15 }}>Nettó egységár</strong>
                        <Form.Item name="currency" style={{ marginBottom: 0 }}>
                          <Select
                            showSearch
                            optionFilterProp="label"
                            style={{ width: 180 }}
                            onChange={(newCode) => {
                              const oldCode = activeCurrency;
                              const converted = convertCurrencyAmount(netUnitPrice, oldCode, newCode);
                              setNetUnitPrice(Number(converted.toFixed(2)));
                              form.setFieldsValue({ unit_selling_price: Number(converted.toFixed(2)) });
                            }}
                          >
                            {currencyList.map(c => (
                              <Option key={c.id} value={c.code} label={`${c.code} - ${c.name}`}>
                                {c.code} - {c.name} {c.symbol ? `(${c.symbol})` : ''}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </div>

                      <Row gutter={12} align="middle">
                        <Col xs={24} md={8}>
                          <NumInput
                            style={{ width: '100%', fontWeight: 600 }}
                            value={netUnitPrice}
                            disabled={priceSourceMode !== 'manual'}
                            min={0}
                            precision={2}
                            addonAfter={getCurrencySymbol(activeCurrency)}
                            onChange={(value) => {
                              const net = value || 0;
                              setNetUnitPrice(net);
                              form.setFieldsValue({ price_source_mode: 'manual', unit_selling_price: net });
                              const vat = vatTypes.find(v => v.id === selectedVatTypeId);
                              const vatPercentage = vat?.percentage || 0;
                              setCalculatedVat(net * (Number(vatPercentage) / 100));
                              setCalculatedGross(net * (1 + Number(vatPercentage) / 100));
                            }}
                          />
                        </Col>
                        <Col xs={24} md={16}>
                          <Checkbox
                            checked={priceSourceMode !== 'manual'}
                            onChange={(e) => {
                              const nextMode = e.target.checked ? 'default_version' : 'manual';
                              form.setFieldsValue({ price_source_mode: nextMode });
                              if (nextMode !== 'manual') applyCalculatedPriceMode(nextMode);
                            }}
                          >
                            Ár kalkuláció alapján
                          </Checkbox>
                          {priceSourceMode !== 'manual' && (
                            <Radio.Group
                              size="small"
                              value={priceSourceMode}
                              onChange={(e) => applyCalculatedPriceMode(e.target.value)}
                              style={{ marginLeft: 12 }}
                            >
                              <Radio.Button value="default_version">Alapértelmezett verzió</Radio.Button>
                              <Radio.Button value="optimal_version">Optimális verzió</Radio.Button>
                            </Radio.Group>
                          )}
                        </Col>
                      </Row>

                      <Form.Item name="default_price_calculation_version" label="Alapértelmezett árkalkulációs verzió" style={{ marginTop: 12, marginBottom: 8 }}>
                        <Select
                          allowClear
                          placeholder={summaries.length ? 'Válassz verziót' : 'Nincs még árkalkulációs verzió'}
                          onChange={() => {
                            if ((form.getFieldValue('price_source_mode') || 'manual') === 'default_version') {
                              setTimeout(() => applyCalculatedPriceMode('default_version'), 0);
                            }
                          }}
                        >
                          {summaries.map(summary => (
                            <Option key={summary.version} value={summary.version}>
                              {summary.version}{(summary as any).supplierNames?.length ? ` · ${(summary as any).supplierNames.join(', ')}` : ''}{' – '}{summary.unitSelling.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {getCurrencySymbol(summary.currency)} / {form.getFieldValue('unit') || 'egység'}
                              {optimal?.version === summary.version ? ' (optimális)' : ''}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>

                      {summaries.length > 0 ? (
                        <Table
                          size="small"
                          dataSource={summaries}
                          rowKey="version"
                          pagination={false}
                          style={{ marginTop: 8 }}
                          columns={[
                            { title: 'Verzió', dataIndex: 'version', key: 'version' },
                            { title: 'Beszállítók', key: 'suppliers', render: (_: any, r: any) => (r as any).supplierNames?.join(', ') || '—' },
                            { title: 'Elemek', key: 'items', render: (_: any, r: any) => r.items.length },
                            { title: 'Bekerülési / egység', key: 'unitCost', align: 'right' as const, render: (_: any, r: any) => `${r.unitCost.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${getCurrencySymbol(r.currency)}` },
                            { title: 'Nettó ár / egység', key: 'unitSelling', align: 'right' as const, render: (_: any, r: any) => <strong>{r.unitSelling.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {getCurrencySymbol(r.currency)}</strong> },
                          ]}
                        />
                      ) : (
                        <div style={{ marginTop: 8, color: '#8c8c8c' }}>Árkalkulációs verziót a Beszállítók és árkalkuláció fülön lehet rögzíteni.</div>
                      )}
                    </div>
                  );
                }}
              </Form.Item>

              <Form.Item name="unit_cost_price" hidden>
                <NumInput />
              </Form.Item>
              
              <Form.Item name="markup_percentage" hidden>
                <NumInput />
              </Form.Item>
              
              <Form.Item name="unit_selling_price" hidden>
                <NumInput />
              </Form.Item>

              <Form.Item name="price_source_mode" hidden>
                <Input />
              </Form.Item>

              <Row gutter={12} style={{ marginTop: 8 }}>
                <Col xs={24} md={10}>
                  <Form.Item label="ÁFA osztály" style={{ marginBottom: 8 }}>
                    <Select
                      value={selectedVatTypeId}
                      placeholder="Válassz ÁFA osztályt..."
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      onChange={(vatTypeId) => {
                        const v = vatTypeId || undefined;
                        setSelectedVatTypeId(v);
                        form.setFieldValue('vat_type_id', v || null);
                        const vat = vatTypes.find(t => t.id === vatTypeId);
                        const pct = Number(vat?.percentage || 0);
                        setCalculatedVat(netUnitPrice * pct / 100);
                        setCalculatedGross(netUnitPrice * (1 + pct / 100));
                      }}
                      options={vatTypes.map(vat => ({ label: `${vat.code} - ${vat.name} (${vat.percentage}%)`, value: vat.id }))}
                      filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={7}>
                  <Form.Item label="ÁFA összeg" style={{ marginBottom: 8 }}>
                    <NumInput style={{ width: '100%' }} value={calculatedVat} disabled precision={2}
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={7}>
                  <Form.Item label="Bruttó egységár" style={{ marginBottom: 8 }}>
                    <NumInput style={{ width: '100%' }} value={calculatedGross} precision={2}
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                      parser={(v) => Number(v!.replace(/\s/g, ''))}
                      onChange={(value) => {
                        const gross = value || 0;
                        setCalculatedGross(gross);
                        const vat = vatTypes.find(t => t.id === selectedVatTypeId);
                        const pct = Number(vat?.percentage || 0);
                        const net = gross / (1 + pct / 100);
                        setNetUnitPrice(net);
                        setCalculatedVat(gross - net);
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="is_active" label="Státusz">
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
              forceRender: true,
              children: (
            <>
            {/* Version management */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>Árkalkulációs verziók</strong>
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => { setVersionNameInput(''); setVersionNameModal({ visible: true, mode: 'add' }); }}
                >
                  Új verzió
                </Button>
              </div>
              <Table
                size="small"
                rowKey="version"
                pagination={false}
                dataSource={getPriceVersionSummaries()}
                rowClassName={(record: any) => record.version === selectedVersionForCost ? 'ant-table-row-selected' : ''}
                onRow={(record: any) => ({ onClick: () => setSelectedVersionForCost(selectedVersionForCost === record.version ? null : record.version) })}
                locale={{ emptyText: 'Nincs árkalkulációs verzió. Kattints az "Új verzió" gombra.' }}
                columns={[
                  { title: 'Verzió', dataIndex: 'version', key: 'version', render: (v: string, r: any) => <span style={{ fontWeight: r.version === selectedVersionForCost ? 600 : undefined }}>{v}</span> },
                  { title: 'Beszállítók', key: 'suppliers', render: (_: any, r: any) => (r as any).supplierNames?.join(', ') || '—' },
                  { title: 'Elemek', key: 'items', align: 'right' as const, render: (_: any, r: any) => r.items.length },
                  { title: 'Ár / egység', key: 'selling', align: 'right' as const, render: (_: any, r: any) => `${r.unitSelling.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${getCurrencySymbol(r.currency)}` },
                  {
                    title: '',
                    key: 'actions',
                    width: 110,
                    render: (_: any, record: any) => (
                      <Space size={0} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <Tooltip title="Átnevezés">
                          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setVersionNameInput(record.version); setVersionNameModal({ visible: true, mode: 'rename', sourceVersion: record.version }); }} />
                        </Tooltip>
                        <Tooltip title="Másolás">
                          <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => { setVersionNameInput(`${record.version} (másolat)`); setVersionNameModal({ visible: true, mode: 'copy', sourceVersion: record.version }); }} />
                        </Tooltip>
                        <Tooltip title="Törlés">
                          <Popconfirm title={`Törli a(z) "${record.version}" verziót és összes elemét?`} onConfirm={() => handleDeleteVersion(record.version)} okText="Igen" cancelText="Nem">
                            <Button type="link" danger size="small" icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Tooltip>
                      </Space>
                    ),
                  },
                ]}
              />
            </div>

            {selectedVersionForCost && (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>{selectedVersionForCost}</Tag>
                  <Select
                    style={{ width: 280 }}
                    placeholder="Forrás (beszállító / belső)"
                    onChange={handleSourceChange}
                    value={selectedSourceForCost === 'internal' ? 'internal' : selectedSourceForCost}
                    showSearch
                    optionFilterProp="children"
                    allowClear
                    onClear={() => { setSelectedSourceForCost(null); setCostItems([]); }}
                  >
                    <Option value="internal">Belső gyártás</Option>
                    {suppliers.map(s => (
                      <Option key={s.id} value={s.id}>{s.name || `ID: ${s.id}`}</Option>
                    ))}
                  </Select>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!selectedSourceForCost}
                    onClick={() => {
                      if (!editingMaterial) { message.warning('Először mentsd el az alapanyagot'); return; }
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
                        price_calculation_version: selectedVersionForCost,
                        price_quantity: 1,
                        unit_price: 0,
                        markup_percentage: 35,
                        selling_price: 0,
                      });
                      setCostItemModalVisible(true);
                    }}
                  >
                    Új elem
                  </Button>
                </div>

                <Table
                  size="small"
                  columns={costItemColumns}
                  dataSource={allCostItems.filter(item => (item.price_calculation_version || '1. verzió').trim() === selectedVersionForCost)}
                  rowKey="id"
                  pagination={false}
                  scroll={{ x: 800 }}
                />
              </>
            )}

            {/* Version name modal */}
            <Modal
              title={
                versionNameModal?.mode === 'add' ? 'Új verzió' :
                versionNameModal?.mode === 'copy' ? `Másolás: ${versionNameModal.sourceVersion}` :
                `Átnevezés: ${versionNameModal?.sourceVersion}`
              }
              open={!!versionNameModal?.visible}
              onCancel={() => setVersionNameModal(null)}
              onOk={async () => {
                const name = versionNameInput.trim();
                if (!name) { message.warning('Add meg a verzió nevét'); return; }
                if (versionNameModal?.mode === 'add') {
                  handleAddVersion(name);
                } else if (versionNameModal?.mode === 'copy') {
                  await handleCopyVersion(versionNameModal.sourceVersion!, name);
                } else if (versionNameModal?.mode === 'rename') {
                  await handleRenameVersion(versionNameModal.sourceVersion!, name);
                }
              }}
              okText={versionNameModal?.mode === 'add' ? 'Létrehozás' : versionNameModal?.mode === 'copy' ? 'Másolás' : 'Átnevezés'}
            >
              <Form layout="vertical">
                <Form.Item label="Verzió neve" required>
                  <Input
                    value={versionNameInput}
                    onChange={(e) => setVersionNameInput(e.target.value)}
                    onPressEnter={async () => {
                      const name = versionNameInput.trim();
                      if (!name) return;
                      if (versionNameModal?.mode === 'add') { handleAddVersion(name); }
                      else if (versionNameModal?.mode === 'copy') { await handleCopyVersion(versionNameModal.sourceVersion!, name); }
                      else if (versionNameModal?.mode === 'rename') { await handleRenameVersion(versionNameModal.sourceVersion!, name); }
                    }}
                    placeholder="pl. 1. verzió, Acme árak 2026"
                    autoFocus
                  />
                </Form.Item>
                {versionNameModal?.mode === 'copy' && (
                  <div style={{ color: '#8c8c8c', fontSize: 12 }}>A(z) „{versionNameModal.sourceVersion}" verzió összes eleme másolódik az új verzióba.</div>
                )}
              </Form>
            </Modal>
            </>
              ),
            },
            {
              key: '3',
              label: 'Készletek',
              disabled: !editingMaterial,
              forceRender: true,
              children: (
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div style={{ textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddReceipt}>
                  Új bevételezés
                </Button>
              </div>

              {/* Tekercs/Tábla csoportosított lista */}
              {(selectedMaterialFormat === 'roll' || selectedMaterialFormat === 'sheet') && (() => {
                const label = selectedMaterialFormat === 'roll' ? 'Tekercsek' : 'Táblák';
                type StockGroup = {
                  key: string;
                  warehouseName: string;
                  sizeName: string;
                  width: number | undefined;
                  dimensionUnit: string;
                  remainingM: number;
                  count: number;
                };
                const groups: Record<string, StockGroup> = {};
                stocks.forEach(s => {
                  const remaining = Math.max(0, (Number(s.length) || 0) - (Number(s.used_length) || 0));
                  const widM = s.width ? toMeters(s.width, s.dimension_unit) : 0;
                  const remM = toMeters(remaining, s.dimension_unit);
                  const key = `${s.warehouse}|${widM.toFixed(4)}|${remM.toFixed(3)}`;
                  if (!groups[key]) {
                    const matchedSize = materialSizes.find(sz =>
                      s.width != null && Math.abs(toMeters(sz.width, sz.dimension_unit) - widM) < 0.0001
                    );
                    groups[key] = {
                      key,
                      warehouseName: s.warehouse_name,
                      sizeName: matchedSize?.name || (s.width ? `${s.width} ${s.dimension_unit}` : '-'),
                      width: s.width,
                      dimensionUnit: s.dimension_unit,
                      remainingM: remM,
                      count: 0,
                    };
                  }
                  groups[key].count++;
                });
                const dataSource = Object.values(groups);
                if (!dataSource.length) return null;
                return (
                  <Table
                    size="small"
                    title={() => <strong>{label}</strong>}
                    columns={[
                      { title: 'Raktár', dataIndex: 'warehouseName', key: 'warehouse' },
                      { title: 'Név', dataIndex: 'sizeName', key: 'name' },
                      {
                        title: 'Szélesség',
                        key: 'width',
                        render: (_: any, r: StockGroup) => r.width ? `${r.width} ${r.dimensionUnit}` : '-',
                      },
                      {
                        title: 'Hosszúság',
                        key: 'length',
                        render: (_: any, r: StockGroup) => {
                          if (r.remainingM <= 0) return <span style={{ color: '#ff4d4f' }}>0 m</span>;
                          const val = r.remainingM % 1 === 0 ? r.remainingM.toFixed(0) : r.remainingM.toFixed(1);
                          return `${val} m`;
                        },
                      },
                      {
                        title: 'db',
                        dataIndex: 'count',
                        key: 'count',
                        render: (count: number) => `${count} db`,
                      },
                    ]}
                    dataSource={dataSource}
                    rowKey="key"
                    pagination={false}
                  />
                );
              })()}

              {/* Főtáblázat */}
              <Table
                size="small"
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
              forceRender: true,
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
                size="small"
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
            {
              key: '5',
              label: 'Rendelhető méretek',
              disabled: !editingMaterial,
              children: (
                <div>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>Rendelhető méret variánsok</span>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAddSize} size="small">
                      Új méret
                    </Button>
                  </div>
                  <Table
                    size="small"
                    dataSource={materialSizes}
                    rowKey="id"
                    pagination={false}
                    columns={[
                      { title: 'Név', dataIndex: 'name', key: 'name', width: 120,
                        render: (v: string) => v || <span style={{ color: '#ccc' }}>—</span> },
                      { title: 'Szélesség', dataIndex: 'width', key: 'width', width: 100,
                        render: (v: number, r: MaterialSizeItem) => `${v} ${r.dimension_unit}` },
                      { title: 'Hosszúság', dataIndex: 'length', key: 'length', width: 100,
                        render: (v: number, r: MaterialSizeItem) => `${v} ${r.dimension_unit}` },
                      { title: 'Magasság', dataIndex: 'height', key: 'height', width: 100,
                        render: (v: number | null, r: MaterialSizeItem) => v ? `${v} ${r.dimension_unit}` : '—' },
                      { title: 'Ár típusa', dataIndex: 'pricing_type_display', key: 'pricing_type_display', width: 120 },
                      { title: 'Ár (HUF)', key: 'price', width: 120,
                        render: (_: any, r: MaterialSizeItem) => (
                          <span style={{ fontWeight: 600 }}>
                            {Number(r.effective_price).toLocaleString('hu-HU')}
                          </span>
                        )},
                      { title: '', key: 'actions', width: 120,
                        render: (_: any, record: MaterialSizeItem) => (
                          <Space size={4}>
                            <Button size="small" icon={<CopyOutlined />} onClick={() => handleDuplicateSize(record)} />
                            <Button size="small" icon={<EditOutlined />} onClick={() => handleEditSize(record)} />
                            <Popconfirm title="Biztosan törlöd?" onConfirm={() => record.id && handleDeleteSize(record.id)}>
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        )},
                    ]}
                  />
                  {editingMaterial && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                      Alap méret: {editingMaterial.width || '—'} × {editingMaterial.length || '—'}
                      {editingMaterial.height ? ` × ${editingMaterial.height}` : ''} {editingMaterial.dimension_unit}
                      {editingMaterial.unit_selling_price ? ` · Alap ár: ${Number(editingMaterial.unit_selling_price).toLocaleString('hu-HU')} HUF` : ''}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Modal>

      {/* Size Modal */}
      <Modal
        title={editingSizeItem ? 'Méret szerkesztése' : 'Új méret'}
        open={sizeModalVisible}
        onCancel={() => setSizeModalVisible(false)}
        onOk={() => sizeForm.submit()}
        width={500}
      >
        <Form form={sizeForm} layout="vertical" onFinish={handleSizeSubmit}>
          <Form.Item name="material" hidden><NumInput /></Form.Item>
          <Form.Item name="sort_order" hidden><NumInput /></Form.Item>
          <Form.Item name="is_active" hidden valuePropName="checked"><Checkbox /></Form.Item>
          <Form.Item name="name" label="Megnevezés (opcionális)">
            <Input
              placeholder="pl. A4, A3, Egyedi – ha üres, automatikusan kitöltődik"
              onChange={() => {/* manual edit: keep as-is */}}
              allowClear
              onClear={() => setTimeout(autoFillSizeName, 0)}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="width" label="Szélesség" rules={[{ required: true, message: 'Kötelező' }]}>
                <NumInput style={{ width: '100%' }} min={0} onChange={() => autoFillSizeName()} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="length" label="Hosszúság" rules={[{ required: true, message: 'Kötelező' }]}>
                <NumInput style={{ width: '100%' }} min={0} onChange={() => autoFillSizeName()} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="height" label="Magasság">
                <NumInput style={{ width: '100%' }} min={0} onChange={() => autoFillSizeName()} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="dimension_unit" label="Mértékegység">
            <Select onChange={() => setTimeout(autoFillSizeName, 0)}>
              <Option value="mm">mm</Option>
              <Option value="cm">cm</Option>
              <Option value="m">m</Option>
            </Select>
          </Form.Item>
          <Form.Item name="pricing_type" label="Ár típusa">
            <Select onChange={(v: string) => sizeForm.setFieldsValue({ pricing_type: v })}>
              <Option value="custom">Egyedi</Option>
              <Option value="area">Terület alapján</Option>
              <Option value="weight">Súly alapján</Option>
              <Option value="volume">Térfogat alapján</Option>
            </Select>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.pricing_type !== cur.pricing_type}>
            {({ getFieldValue }) => {
              const pType = getFieldValue('pricing_type');
              if (pType === 'custom') {
                return (
                  <Form.Item name="custom_price" label="Egyedi ár (HUF)">
                    <NumInput style={{ width: '100%' }} min={0} />
                  </Form.Item>
                );
              }
              const basePrice = editingMaterial?.unit_selling_price || 0;
              const baseW = editingMaterial?.width || 0;
              const baseL = editingMaterial?.length || 0;
              const baseH = editingMaterial?.height || 1;
              return (
                <div style={{ padding: 12, background: '#f6ffed', borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
                  Az ár automatikusan számítódik az alap ár ({Number(basePrice).toLocaleString('hu-HU')} HUF) és az alap méret ({baseW}×{baseL}{baseH > 1 ? `×${baseH}` : ''}) arányában.
                </div>
              );
            }}
          </Form.Item>
        </Form>
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
            <NumInput />
          </Form.Item>

          <Form.Item name="supplier" hidden>
            <NumInput />
          </Form.Item>

          <Form.Item name="is_internal" hidden>
            <NumInput />
          </Form.Item>

          <Form.Item
            name="name"
            label="Megnevezés"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. Anyagköltség, Munkadíj" />
          </Form.Item>

          <Form.Item
            name="price_calculation_version"
            label="Árkalkulációs verzió"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. 1. verzió, A+B+C" />
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
            <NumInput
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

          {selectedCalculationType !== 'fixed' && (
            <Form.Item
              name="price_quantity"
              label="Az ár hány alapanyag mértékegységre vonatkozik?"
              tooltip="Példa: ha a beszállító ára 10 db-ra vonatkozik, ide 10 kerül, így az egységár tizedelődik."
              rules={[{ required: true, message: 'Kötelező mező' }]}
            >
              <NumInput style={{ width: '100%' }} min={0.0001} precision={4} addonAfter={costItemForm.getFieldValue('unit') || 'egység'} />
            </Form.Item>
          )}

          <Form.Item name="currency" label="Pénznem" rules={[{ required: true, message: 'Kötelező mező' }]}>
            <Select showSearch optionFilterProp="label" placeholder="Válassz pénznemet">
              {currencyList.map(c => (
                <Option key={c.id} value={c.code} label={`${c.code} - ${c.name}`}>
                  {c.code} - {c.name} {c.symbol ? `(${c.symbol})` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="markup_percentage"
            label="Haszon kulcs"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <NumInput
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
            <NumInput
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
            <NumInput
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

          {(selectedMaterialFormat === 'roll' || selectedMaterialFormat === 'sheet') && materialSizes.filter(s => s.is_active !== false).length > 0 && (
            <Card
              size="small"
              style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}
              title={selectedMaterialFormat === 'roll' ? 'Tekercs tételek' : 'Tábla tételek'}
              extra={
                <Button size="small" type="primary" icon={<PlusOutlined />}
                  onClick={() => {
                    const key = receiptBatchKeyRef.current++;
                    setReceiptBatchLines(prev => {
                      const next = [...prev, { key, sizeId: undefined, count: 1, lengthPerUnit: undefined, lengthUnit: 'm' }];
                      recalcBatchTotal(next);
                      return next;
                    });
                  }}>
                  Sor hozzáadása
                </Button>
              }
            >
              {receiptBatchLines.map((line, idx) => (
                <Row key={line.key} gutter={8} align="middle" style={{ marginBottom: 6 }}>
                  <Col flex="auto">
                    <Select
                      style={{ width: '100%' }}
                      placeholder={selectedMaterialFormat === 'roll' ? 'Szélesség…' : 'Méret…'}
                      allowClear
                      value={line.sizeId}
                      onChange={(id: number) => updateBatchLine(line.key, { sizeId: id })}
                    >
                      {materialSizes.filter(s => s.is_active !== false).map(s => (
                        <Option key={s.id} value={s.id}>{s.name || `${s.width}${s.length ? `×${s.length}` : ''} ${s.dimension_unit}`}</Option>
                      ))}
                    </Select>
                  </Col>
                  {selectedMaterialFormat === 'roll' && (
                    <Col style={{ width: 180 }}>
                      <NumInput
                        style={{ width: '100%' }}
                        min={0}
                        precision={3}
                        placeholder="Hossz/tekercs"
                        addonAfter={
                          <Select value={line.lengthUnit} style={{ width: 60 }}
                            onChange={(u) => updateBatchLine(line.key, { lengthUnit: u })}>
                            <Option value="mm">mm</Option>
                            <Option value="cm">cm</Option>
                            <Option value="m">m</Option>
                          </Select>
                        }
                        value={line.lengthPerUnit}
                        onChange={(v) => updateBatchLine(line.key, { lengthPerUnit: v || undefined })}
                      />
                    </Col>
                  )}
                  <Col style={{ width: 110 }}>
                    <NumInput
                      style={{ width: '100%' }}
                      min={1}
                      precision={0}
                      addonAfter="db"
                      value={line.count}
                      onChange={(v) => updateBatchLine(line.key, { count: v || 1 })}
                    />
                  </Col>
                  <Col style={{ width: 68 }}>
                    <Space size={0}>
                      <Tooltip title="Másolás">
                        <Button size="small" type="link" icon={<CopyOutlined />}
                          onClick={() => {
                            const key = receiptBatchKeyRef.current++;
                            setReceiptBatchLines(prev => {
                              const next = [...prev, { ...line, key }];
                              recalcBatchTotal(next);
                              return next;
                            });
                          }} />
                      </Tooltip>
                      <Tooltip title="Törlés">
                        <Button size="small" type="link" danger icon={<DeleteOutlined />}
                          disabled={receiptBatchLines.length === 1}
                          onClick={() => {
                            setReceiptBatchLines(prev => {
                              const next = prev.filter(l => l.key !== line.key);
                              recalcBatchTotal(next);
                              return next;
                            });
                          }} />
                      </Tooltip>
                    </Space>
                  </Col>
                </Row>
              ))}
            </Card>
          )}

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Árkalkulációs verzió (opcionális)">
                <Select
                  allowClear
                  placeholder="Verzió alapján előtölt..."
                  showSearch
                  optionFilterProp="label"
                  options={getPriceVersionSummaries().map(s => ({
                    label: `${s.version} – ${s.unitCost.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${getCurrencySymbol(s.currency)}`,
                    value: s.version,
                  }))}
                  onChange={(ver: string | undefined) => {
                    if (!ver) return;
                    const summary = getPriceVersionSummaries().find(s => s.version === ver);
                    if (summary) {
                      receiptForm.setFieldsValue({ unit_price: Number(summary.unitCost.toFixed(2)) });
                      const qty = receiptForm.getFieldValue('quantity') || 0;
                      receiptForm.setFieldsValue({ invoice_value: Number((Number(summary.unitCost.toFixed(2)) * qty).toFixed(2)) });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplier" label="Beszállító">
                {(() => {
                  // Top 5 suppliers for this material by receipt frequency
                  const countMap: Record<number, { count: number; name: string }> = {};
                  receipts.forEach(r => {
                    if (r.supplier) {
                      if (!countMap[r.supplier]) countMap[r.supplier] = { count: 0, name: r.supplier_name || `ID: ${r.supplier}` };
                      countMap[r.supplier].count++;
                    }
                  });
                  const top5Ids = new Set(
                    Object.entries(countMap)
                      .sort((a, b) => b[1].count - a[1].count)
                      .slice(0, 5)
                      .map(([id]) => Number(id))
                  );
                  const top5 = suppliers.filter(s => top5Ids.has(s.id));
                  const rest = suppliers.filter(s => !top5Ids.has(s.id));
                  return (
                    <Select placeholder="Válassz beszállítót" allowClear showSearch optionFilterProp="children">
                      {top5.length > 0 && (
                        <Select.OptGroup label="Leggyakoribb">
                          {top5.map(s => (
                            <Option key={`top-${s.id}`} value={s.id}>{s.name || `ID: ${s.id}`}</Option>
                          ))}
                        </Select.OptGroup>
                      )}
                      <Select.OptGroup label="Összes">
                        {rest.map(s => (
                          <Option key={s.id} value={s.id}>{s.name || `ID: ${s.id}`}</Option>
                        ))}
                      </Select.OptGroup>
                    </Select>
                  );
                })()}
              </Form.Item>
            </Col>
          </Row>

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

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item
                name="quantity"
                label="Mennyiség"
                rules={[{ required: true, message: 'Add meg a mennyiséget' }]}
              >
                <NumInput
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  addonAfter={editingMaterial?.unit}
                  onChange={(qty) => {
                    const up = receiptForm.getFieldValue('unit_price') || 0;
                    if (up) receiptForm.setFieldsValue({ invoice_value: Number(((qty || 0) * up).toFixed(2)) });
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="unit_price"
                label="Egységár"
                rules={[{ required: true, message: 'Add meg az egységárat' }]}
              >
                <NumInput
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  addonAfter={receiptForm.getFieldValue('currency') || 'HUF'}
                  onChange={(up) => {
                    const qty = receiptForm.getFieldValue('quantity') || 0;
                    receiptForm.setFieldsValue({ invoice_value: Number(((up || 0) * qty).toFixed(2)) });
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="invoice_value"
                label="Számla érték"
                rules={[{ required: true, message: 'Add meg a számla értékét' }]}
              >
                <NumInput
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  addonAfter={receiptForm.getFieldValue('currency') || 'HUF'}
                  onChange={(inv) => {
                    const qty = receiptForm.getFieldValue('quantity') || 0;
                    if (qty) receiptForm.setFieldsValue({ unit_price: Number(((inv || 0) / qty).toFixed(2)) });
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="width" hidden><Input /></Form.Item>
          <Form.Item name="length" hidden><Input /></Form.Item>
          <Form.Item name="thickness" hidden><Input /></Form.Item>
          <Form.Item name="dimension_unit" hidden><Input /></Form.Item>

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
            <NumInput
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
