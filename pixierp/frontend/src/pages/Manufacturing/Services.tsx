import React, { useState, useEffect } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import { useSearchParams } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm, Tabs, AutoComplete, Switch, TreeSelect, Tooltip, Row, Col, Checkbox } from 'antd';
import NumInput from '../../components/NumInput';
import { PlusOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, ThunderboltOutlined, SearchOutlined, MinusOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../../services/api';
import ExportButton from '../../components/ExportButton';

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
  groups: number[];
  group_names: string[];
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
  max_width_mm?: number | null;
  max_height_mm?: number | null;
  pricing_type?: string;
  setup_cost_selling?: number;
  unit_cost_selling?: number;
  capacity?: number | null;
  is_protected?: boolean;
  cost_summary?: Record<string, number>;
  cost_items_data?: { calculation_type: string; unit_price: number; selling_price: number }[];
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
  department?: number;
  department_name?: string;
  is_internal: boolean;
  price_calculation_version?: string;
  name: string;
  calculation_type: string;
  calculation_type_display?: string;
  unit: string;
  unit_price: number;
  price_quantity?: number;
  markup_percentage: number;
  selling_price?: number;
  currency: string;
  is_active: boolean;
  rounding_step?: number;
}

interface PrintCostItem {
  _key: number;
  id?: number;
  name: string;
  calculation_type: 'fixed' | 'unit';
  selling_price: number;
}

const Services: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form] = Form.useForm();
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<{ value: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isInternalProduction, setIsInternalProduction] = useState(false);
  
  // Cost items management
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [allCostItems, setAllCostItems] = useState<CostItem[]>([]);
  const [selectedSourceForCost, setSelectedSourceForCost] = useState<string | null>(null);
  const [selectedVersionForCost, setSelectedVersionForCost] = useState<string | null>(null);
  const [versionNameModal, setVersionNameModal] = useState<{ visible: boolean; mode: 'add' | 'rename' | 'copy'; sourceVersion?: string } | null>(null);
  const [versionNameInput, setVersionNameInput] = useState('');
  const [netUnitPrice, setNetUnitPrice] = useState<number>(0);
  const [costItemForm] = Form.useForm();
  const [editingCostItem, setEditingCostItem] = useState<CostItem | null>(null);
  const [costItemModalVisible, setCostItemModalVisible] = useState(false);
  const [selectedCalculationType, setSelectedCalculationType] = useState<string>('unit');
  
  // Print editor pricing cost items
  const [printCostItems, setPrintCostItems] = useState<PrintCostItem[]>([]);

  // Added suppliers management
  const [addedSuppliers, setAddedSuppliers] = useState<(Supplier & { is_internal?: boolean })[]>([]);
  const [supplierSearchValue, setSupplierSearchValue] = useState<string>('');
  const [filteredSuppliersForAdd, setFilteredSuppliersForAdd] = useState<{ value: string; label: string }[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [serviceGroups, setServiceGroups] = useState<any[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<number | undefined>(undefined);
  // Termék szűrő
  const [productTemplates, setProductTemplates] = useState<{id: number; name: string}[]>([]);
  const [selectedProductFilter, setSelectedProductFilter] = useState<number | undefined>(undefined);
  const [productServiceIds, setProductServiceIds] = useState<Set<number> | null>(null);
  const [productFilterLoading, setProductFilterLoading] = useState(false);

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
      'sheet': ['\u00edv'],
      'click': ['klikk'],
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

  // ── Price version helpers (like Materials.tsx) ───────────────────────────
  const getCostItemUnitAmount = (item: CostItem, priceField: 'unit_price' | 'selling_price' = 'selling_price') => {
    const price = Number((item as any)[priceField] ?? item.unit_price ?? 0);
    if (item.calculation_type === 'fixed') return price;
    const quantity = Number(item.price_quantity || 1) || 1;
    return price / quantity;
  };

  const getPriceVersionSummaries = () => {
    const grouped = new Map<string, CostItem[]>();
    allCostItems
      .filter(item => item.is_active !== false)
      .forEach(item => {
        const version = (item.price_calculation_version || '1. verzió').trim() || '1. verzió';
        grouped.set(version, [...(grouped.get(version) || []), item]);
      });
    return Array.from(grouped.entries()).map(([version, items]) => {
      const unitCost = items.reduce((sum, item) => sum + getCostItemUnitAmount(item, 'unit_price'), 0);
      const unitSelling = items.reduce((sum, item) => sum + getCostItemUnitAmount(item, 'selling_price'), 0);
      const supplierNames = Array.from(new Set(
        items.map(item => item.is_internal ? (item.department_name || 'Belső gyártás') : (item.supplier_name || '')).filter(Boolean)
      ));
      return { version, items, unitCost, unitSelling, supplierNames };
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
  };

  useEffect(() => {
    fetchServices();
    fetchSuppliers();
    fetchDepartments();
    fetchServiceGroups();
    // Termék sablonok betöltése a szűrőhöz
    api.get('/manufacturing/product-templates/?page_size=1000').then(res => {
      const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setProductTemplates(data.map((p: any) => ({ id: p.id, name: p.name })).sort((a: any, b: any) => a.name.localeCompare(b.name, 'hu')));
    }).catch(() => {});
    
    const create = searchParams.get('create') === 'true';
    const copyFrom = searchParams.get('copy_from');
    const editId = searchParams.get('edit');

    const groupParam = searchParams.get('group');
    if (groupParam) {
      const gid = Number(groupParam);
      if (!Number.isNaN(gid)) setSelectedCategoryFilter(gid);
    }

    if (create) {
        if (copyFrom) {
            setLoading(true);
            api.get(`/manufacturing/services/${copyFrom}/`).then(res => {
                const data = res.data.results ? res.data.results[0] : res.data; // Handle potential list response if by ID? No, ID detail view usually returns object.
                // Depending on API, detail view might be /services/ID/
                // Let's assume standard detail endpoint exists.
                if (data) {
                    const { id, created_at, created_by_name, ...rest } = data;
                    setEditingService(null);
                    form.setFieldsValue(rest);
                    setModalVisible(true);
                }
            }).catch(err => {
                // If direct ID detail fails, try filtering by ID
                if (err.response && err.response.status === 404) {
                     // try list filter
                     api.get(`/manufacturing/services/?id=${copyFrom}`).then(r => {
                          const item = r.data.results ? r.data.results[0] : (r.data[0]);
                          if (item) {
                               const { id, created_at, created_by_name, ...rest } = item;
                               setEditingService(null);
                               form.setFieldsValue(rest);
                               setModalVisible(true);
                          }
                     }).catch(e => console.error(e));
                }
                console.error(err);
            }).finally(() => setLoading(false));
         } else {
            handleCreate();
         }
    } else if (editId) {
        setLoading(true);
        api.get(`/manufacturing/services/${editId}/`).then(res => {
            const data = res.data.results ? res.data.results[0] : res.data;
            if (data) {
                handleEdit(data);
                // Also trigger edit mode on UI
                setEditingService(data);
                form.setFieldsValue(data);
                setModalVisible(true);
                // Cost items are fetched by effect when editingService set? No, verify handleEdit logic.
            }
        }).catch(err => {
             // Fallback
             api.get(`/manufacturing/services/?id=${editId}`).then(r => {
                  const item = r.data.results ? r.data.results[0] : (r.data[0]);
                  if (item) {
                       handleEdit(item);
                       setEditingService(item);
                       form.setFieldsValue(item);
                       setModalVisible(true);
                  }
             }).catch(() => message.error('Hiba a szolgáltatás betöltésekor'));
        }).finally(() => setLoading(false));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!modalVisible) return;
    const timer = setTimeout(() => {
      setInitialFormSnapshot(getFormSnapshot());
    }, 0);
    return () => clearTimeout(timer);
  }, [modalVisible]);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await api.get('/manufacturing/services/?page_size=1000');
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
      const response = await api.get('/crm/companies/?is_supplier=true&page_size=1000');
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

  const fetchServiceGroups = async () => {
    try {
        const response = await api.get('/manufacturing/service-groups/');
        const data = response.data.results || response.data;
        setServiceGroups(data);
    } catch (error) {
        console.error('Hiba a szolgáltatás csoportok betöltésekor', error);
    }
  };

  const buildGroupTree = (items: any[]) => {
      const itemMap = new Map<number, any>();
      const roots: any[] = [];
      const cloned = items.map(item => ({...item, title: item.name, value: item.id, children: []}));
      
      cloned.forEach(i => itemMap.set(i.id, i));
      
      cloned.forEach(i => {
          if (i.parent) {
              const p = itemMap.get(i.parent);
              if (p) p.children.push(i);
              else roots.push(i);
          } else {
              roots.push(i);
          }
      });
      return roots;
  };

  const getGroupDescendants = (groupId: number, allGroups: any[]): number[] => {
      const children = allGroups.filter(g => g.parent === groupId);
      let ids = [groupId];
      children.forEach(child => {
          ids = [...ids, ...getGroupDescendants(child.id, allGroups)];
      });
      return ids;
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

  const fetchAllCostItems = async (serviceId: number) => {
    try {
      const response = await api.get(`/manufacturing/service-cost-items/?service_id=${serviceId}`);
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setAllCostItems(data);
    } catch (error) {
      console.error('Hiba az összes költség elem betöltésekor:', error);
      setAllCostItems([]);
    }
  };

  const handleAddVersion = (versionName: string) => {
    setSelectedVersionForCost(versionName);
    setVersionNameModal(null);
    message.info(`Verzió létrehozva: ${versionName}. Válassz forrást és adj hozzá elemeket.`);
  };

  const handleCopyVersion = async (sourceVersionName: string, newVersionName: string) => {
    if (!editingService) return;
    const sourceItems = allCostItems.filter(item =>
      (item.price_calculation_version || '1. verzió').trim() === sourceVersionName
    );
    if (sourceItems.length === 0) {
      message.warning('Nincs másolható elem ebben a verzióban');
      return;
    }
    try {
      for (const item of sourceItems) {
        const { id, supplier_name, department_name, calculation_type_display, ...rest } = item as any;
        await api.post('/manufacturing/service-cost-items/', {
          ...rest,
          price_calculation_version: newVersionName,
        });
      }
      message.success(`Verzió másolva: ${newVersionName}`);
      await fetchAllCostItems(editingService.id);
      setSelectedVersionForCost(newVersionName);
      setVersionNameModal(null);
    } catch (error) {
      message.error('Hiba a másolás során');
      console.error(error);
    }
  };

  const handleDeleteVersion = async (versionName: string) => {
    if (!editingService) return;
    const itemsToDelete = allCostItems.filter(item =>
      (item.price_calculation_version || '1. verzió').trim() === versionName
    );
    try {
      for (const item of itemsToDelete) {
        if (item.id) await api.delete(`/manufacturing/service-cost-items/${item.id}/`);
      }
      message.success('Verzió törölve');
      await fetchAllCostItems(editingService.id);
      if (selectedVersionForCost === versionName) setSelectedVersionForCost(null);
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleRenameVersion = async (oldName: string, newName: string) => {
    if (!editingService) return;
    const itemsToRename = allCostItems.filter(item =>
      (item.price_calculation_version || '1. verzió').trim() === oldName
    );
    try {
      for (const item of itemsToRename) {
        if (item.id) await api.patch(`/manufacturing/service-cost-items/${item.id}/`, { price_calculation_version: newName });
      }
      message.success('Verzió átnevezve');
      await fetchAllCostItems(editingService.id);
      if (selectedVersionForCost === oldName) setSelectedVersionForCost(newName);
      setVersionNameModal(null);
    } catch (error) {
      message.error('Hiba az átnevezés során');
      console.error(error);
    }
  };

  const fetchPrintCostItems = async (serviceId: number) => {
    try {
      const res = await api.get(`/manufacturing/service-cost-items/?service_id=${serviceId}&is_standalone=true`);
      const data: any[] = Array.isArray(res.data) ? res.data : (res.data.results ?? []);
      setPrintCostItems(data.map(item => ({
        _key: item.id,
        id: item.id,
        name: item.name,
        calculation_type: item.calculation_type as 'fixed' | 'unit',
        selling_price: Number(item.selling_price || 0),
      })));
    } catch {
      setPrintCostItems([]);
    }
  };

  const fetchAddedSuppliers = async (service: Service) => {
    try {
      const response = await api.get(`/manufacturing/service-cost-items/?service_id=${service.id}`);
      const allCostItems = Array.isArray(response.data) ? response.data : (response.data.results || []);
      
      // Get unique suppliers from cost items
      const uniqueSuppliers: Map<string, Supplier & { is_internal?: boolean; total_price?: number }> = new Map();
      
      // Define helper for key
      const getKey = (isInt: boolean, id: number) => isInt ? `int_${id}` : `ext_${id}`;

      // Check for internal production from Service settings
      if (service.is_internal_production && service.internal_production_department) {
         const deptId = service.internal_production_department;
         const dept = departments.find(d => d.id === deptId); // Note: departments state might be empty if not loaded yet
         // We might need to rely on what we have or just store ID
         uniqueSuppliers.set(getKey(true, deptId), { 
             id: deptId,
             name: dept ? dept.name : 'Belső gyártás', 
             is_internal: true,
             total_price: 0
         });
      }
      
      // Process Cost Items to build unique suppliers list AND calculate totals
      allCostItems.forEach((item: CostItem) => {
          let key = '';
          let supplierObj: any = null;

          if (item.is_internal) {
              // Usually internal cost items might not store department ID directly if the model is simple?
              // But if we have multiples, we need to know which one.
              // Assuming cost items for internal are just "internal".
              // But wait, if we have multiple internal departments, we need to distinguish.
              // Currently backend likely stores `is_internal=True`. 
              // Does it store `internal_production_department`? Likely not on CostItem.
              // So for now, all internal cost items are lumped together?
              // Or does the service have only ONE internal department selected? -> Yes, likely one per service.
              
              if (service.internal_production_department) {
                  key = getKey(true, service.internal_production_department);
                  const dept = departments.find(d => d.id === service.internal_production_department);
                  supplierObj = {
                      id: service.internal_production_department,
                      name: dept ? dept.name : 'Belső gyártás',
                      is_internal: true
                  };
              }
          } else if (item.supplier) {
              key = getKey(false, item.supplier);
              supplierObj = {
                  id: item.supplier,
                  name: item.supplier_name,
                  is_internal: false
              };
          }

          if (key && supplierObj) {
              if (!uniqueSuppliers.has(key)) {
                  uniqueSuppliers.set(key, { ...supplierObj, total_price: 0 });
              }
              const current = uniqueSuppliers.get(key)!;
              current.total_price = (current.total_price || 0) + Number(item.selling_price || 0); // or unit_price? user said "calculated price", usually selling price
          }
      });

      // Ensure default supplier is present (even if no cost items yet)
      if (service.default_supplier) {
          const key = getKey(false, service.default_supplier);
          if (!uniqueSuppliers.has(key)) {
              const s = suppliers.find(sup => sup.id === service.default_supplier);
              if (s) {
                  uniqueSuppliers.set(key, {
                      id: s.id,
                      name: s.name,
                      is_internal: false,
                      total_price: 0
                  });
              }
          }
      }
      
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
    setSelectedVersionForCost(null);
    setCostItems([]);
    setAllCostItems([]);
    setAddedSuppliers([]);
    setPrintCostItems([]);
    setNetUnitPrice(0);
    setSupplierSearchValue('');
    setModalVisible(true);
  };

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
          setPrintCostItems([]);
        },
      });
    } else {
      setModalVisible(false);
      form.resetFields();
      setPrintCostItems([]);
    }
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setIsInternalProduction(service.is_internal_production);

    // Compute the unified source key for the Select
    let defaultSourceUnified: string | null = null;
    if (service.is_internal_production && service.internal_production_department) {
      defaultSourceUnified = `int_${service.internal_production_department}`;
    } else if (service.default_supplier) {
      defaultSourceUnified = `ext_${service.default_supplier}`;
    }

    form.setFieldsValue({
        ...service,
        groups: service.groups || [],
        default_source_unified: defaultSourceUnified,
    });

    // Set netUnitPrice from saved selling price
    setNetUnitPrice(Number(service.unit_selling_price) || 0);

    // Load added suppliers and all cost items
    fetchAddedSuppliers(service);
    fetchAllCostItems(service.id);

    setSelectedSourceForCost(null);
    setCostItems([]);
    setSelectedVersionForCost(null);
    setModalVisible(true);
  };

  const handleCopy = (service: Service) => {
      setEditingService(null);
      setIsInternalProduction(service.is_internal_production);

      let defaultSourceUnified: string | null = null;
      if (service.is_internal_production && service.internal_production_department) {
        defaultSourceUnified = `int_${service.internal_production_department}`;
      } else if (service.default_supplier) {
        defaultSourceUnified = `ext_${service.default_supplier}`;
      }

      form.setFieldsValue({
          ...service,
          id: undefined,
          code: `${service.code}-COPY`,
          name: `${service.name} (Másolat)`,
          groups: service.groups || [],
          created_at: undefined,
          created_by_name: undefined,
          default_source_unified: defaultSourceUnified,
      });
      form.setFieldValue('unit_selling_price', service.unit_selling_price);
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

  const generateCode = () => {
    const name = form.getFieldValue('name');
    if (!name) {
      message.warning('Előbb add meg a szolgáltatás nevét!');
      return;
    }

    let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) base = 'SERV';
    
    // Existing codes
    const codes = new Set(services.map(s => s.code));
    
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
            message.error('Nem sikerült egyedi kódot generálni (túl sok próbálkozás)');
            return;
        }
    }
    
    form.setFieldsValue({ code: candidate });
  };

  const handleSubmit = async (values: any) => {
    try {
      // Sync unit_selling_price with the current netUnitPrice state
      const payload = {
        ...values,
        unit_selling_price: values.unit_selling_price || netUnitPrice || 0,
      };

      let savedService: any;
      if (editingService) {
        const res = await api.patch(`/manufacturing/services/${editingService.id}/`, payload);
        savedService = res.data;
        message.success('Szolgáltatás frissítve');
      } else {
        const res = await api.post('/manufacturing/services/', payload);
        savedService = res.data;
        message.success('Szolgáltatás létrehozva');
      }

      setModalVisible(false);
      fetchServices();
      
      if (searchParams.get('from_rfq') === 'true' && savedService) {
        Modal.confirm({
          title: 'Visszatérés az ajánlathoz',
          content: 'Szeretnél visszatérni az ajánlathoz és beilleszteni ezt a szolgáltatást?',
          okText: 'Alkalmazás',
          cancelText: 'Mégse',
          onOk: () => {
             const channel = new BroadcastChannel('pixi_rfq_item_creation');
             channel.postMessage({ type: 'ITEM_CREATED', data: { item: savedService, itemType: 'service' } });
             setTimeout(() => window.close(), 100);
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
      setSelectedSourceForCost(String(supplier.id));
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
      const srcIsInternal = selectedSourceForCost === 'internal' || String(selectedSourceForCost || '').startsWith('dept_');
      if ((isInternal && srcIsInternal) ||
          (!isInternal && selectedSourceForCost === String(supplierId))) {
        setSelectedSourceForCost(null);
        setCostItems([]);
      }
      
      message.success('Beszállító és költségelemei törölve');
    } catch (error) {
      message.error('Hiba a beszállító törlésekor');
      console.error(error);
    }
  };

  const handleSourceChange = (value: string) => {
    if (!editingService) return;
    setSelectedSourceForCost(value ?? null);
    const isInternal = value === 'internal' || String(value || '').startsWith('dept_');
    if (isInternal) {
      fetchCostItems(editingService.id, 'internal');
    } else if (value) {
      fetchCostItems(editingService.id, Number(value));
    } else {
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

    const isInternal = selectedSourceForCost === 'internal' || String(selectedSourceForCost || '').startsWith('dept_');
    const supplierId = !isInternal && selectedSourceForCost != null ? Number(selectedSourceForCost) : undefined;
    // Parse department ID from 'dept_X' format
    const deptId = isInternal && String(selectedSourceForCost || '').startsWith('dept_')
      ? Number(String(selectedSourceForCost).replace('dept_', ''))
      : (isInternal && editingService?.internal_production_department ? editingService.internal_production_department : undefined);

    costItemForm.setFieldsValue({
      service: editingService.id,
      is_internal: isInternal,
      supplier: supplierId,
      department: deptId,
      price_calculation_version: selectedVersionForCost || '1. verzió',
      calculation_type: 'unit',
      unit: 'db',
      currency: 'HUF',
      is_active: true,
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
      await api.delete(`/manufacturing/service-cost-items/${id}/`);
      message.success('Költség elem törölve');
      if (editingService) {
        fetchAllCostItems(editingService.id);
        fetchAddedSuppliers(editingService);
      }
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleCostItemSubmit = async (values: any) => {
    try {
      const payload = {
        ...values,
        is_internal: values.is_internal === true || values.is_internal === 'true',
        supplier: (values.is_internal === true || values.is_internal === 'true') ? null : (values.supplier ? Number(values.supplier) : null),
        department: values.department ? Number(values.department) : null,
        service: Number(values.service),
        price_calculation_version: values.price_calculation_version || selectedVersionForCost || '1. verzió',
      };

      if (editingCostItem) {
        await api.patch(`/manufacturing/service-cost-items/${editingCostItem.id}/`, payload);
        message.success('Költség elem frissítve');
      } else {
        await api.post('/manufacturing/service-cost-items/', payload);
        message.success('Költség elem létrehozva');
      }
      setCostItemModalVisible(false);
      if (editingService) {
        fetchAllCostItems(editingService.id);
        fetchAddedSuppliers(editingService);
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

  const filteredServices = (() => {
    const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = normalize(query);
    
    let result = services;

    if (statusFilter === 'active') {
        result = result.filter(s => s.is_active);
    } else if (statusFilter === 'inactive') {
        result = result.filter(s => !s.is_active);
    }

    if (selectedCategoryFilter) {
        const relevantGroupIds = getGroupDescendants(selectedCategoryFilter, serviceGroups);
        result = result.filter(s => s.groups && s.groups.some(g => relevantGroupIds.includes(g)));
    }

    if (productServiceIds !== null) {
        result = result.filter(s => productServiceIds.has(s.id));
    }

    if (q) {
        result = result.filter(service => {
            const hay = [
                service.name || '',
                service.code || '',
                service.description || '',
                service.category || '',
            ].join(' \u0001 ');
            return normalize(hay).includes(q);
        });
    }
    return result;
  })();

  const columns = [
    {
      title: 'Cikkszám',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      sorter: (a: Service, b: Service) => (a.code || '').localeCompare(b.code || ''),
    },
    {
      title: 'Szolgáltatás neve',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      ellipsis: true,
      sorter: (a: Service, b: Service) => a.name.localeCompare(b.name),
      render: (name: string, record: Service) => (
        <span>
          {name}
        </span>
      ),
    },
    {
      title: 'Kategóriák',
      dataIndex: 'group_names',
      key: 'group_names',
      width: 150,
      render: (groups: string[]) => (
        <Space direction="vertical" size={0}>
            {groups && groups.map(g => <Tag key={g} style={{ margin: 1, fontSize: '10px', lineHeight: '18px' }}>{g}</Tag>)}
        </Space>
      )
    },
    {
      title: 'Mértékegység',
      dataIndex: 'unit_display',
      key: 'unit_display',
      width: 100,
      sorter: (a: Service, b: Service) => (a.unit_display || '').localeCompare(b.unit_display || ''),
    },
    {
      title: 'Gyártás',
      key: 'source',
      width: 160,
      render: (_: any, record: Service) => {
        const wrapStyle: React.CSSProperties = { 
            whiteSpace: 'normal', 
            height: 'auto', 
            display: 'inline-flex', 
            alignItems: 'center', 
            textAlign: 'center',
            lineHeight: '1.2',
            padding: '1px 4px',
            fontSize: '11px'
        };

        if (record.is_internal_production && record.internal_production_department_name) {
          return (
            <Tag color="green" style={wrapStyle}>
                {record.internal_production_department_name}
            </Tag>
          );
        } else if (record.default_supplier_name) {
            const name = record.default_supplier_name;
            const isLong = name.length > 25;
            const display = isLong ? name.substring(0, 25) + '...' : name;
            return (
                <Tag color="blue" title={name} style={wrapStyle}>
                    {display}
                </Tag>
            );
        } else {
            return (
                <Tag color="default">Nincs</Tag>
            );
        }
      },
    },
    {
      title: 'Besz. ár',
      key: 'cost_price',
      width: 150,
      sorter: (a: Service, b: Service) => (a.unit_cost_price || 0) - (b.unit_cost_price || 0),
      render: (_: any, r: Service) => {
        const main = r.unit_cost_price ? `${Number(r.unit_cost_price).toLocaleString('hu-HU')} Ft` : '–';
        return <span>{main}</span>;
      },
    },
    {
      title: 'Elad. ár',
      key: 'sell_price',
      width: 180,
      sorter: (a: Service, b: Service) => (a.unit_selling_price || 0) - (b.unit_selling_price || 0),
      render: (_: any, r: Service) => {
        const main = r.unit_selling_price ? `${Number(r.unit_selling_price).toLocaleString('hu-HU')} Ft` : '–';
        const summary = r.cost_summary as Record<string, number> | undefined;
        const TYPE_LABELS: Record<string, string> = {
          fixed: 'fix', unit: 'egységár', click: 'klikk',
          length: 'hossz', perimeter: 'kerület', area: 'terület',
          weight: 'súly', time: 'idő', sheet: 'ív',
        };
        const parts: string[] = [];
        if (summary) {
          Object.entries(summary).forEach(([type, val]) => {
            if (val) parts.push(`${TYPE_LABELS[type] || type}: ${Number(val).toLocaleString('hu-HU')} Ft`);
          });
        }
        return (
          <span>
            {main}
            {parts.length > 0 && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>({parts.join(' | ')})</div>
            )}
          </span>
        );
      },
    },
    {
      title: 'Státusz',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      sorter: (a: Service, b: Service) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1),
      render: (is_active: boolean) => (
        <Tag color={is_active ? 'green' : 'red'}>
          {is_active ? 'Aktív' : 'Inaktív'}
        </Tag>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 140,
      fixed: 'right' as const,
      render: (_: any, record: Service) => (
        <Space size={0}>
          <Tooltip title="Szerkesztés">
            <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Új az adatok alapján">
             <Button
                type="link"
                icon={<CopyOutlined />}
                onClick={() => handleCopy(record)}
             />
          </Tooltip>
          {record.is_protected ? null : (
            <Popconfirm
              title="Biztosan törli?"
              onConfirm={() => handleDelete(record.id)}
              okText="Igen"
              cancelText="Nem"
            >
              <Button type="link" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
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
      title: 'Forrás',
      key: 'source',
      render: (_: any, record: CostItem) => record.is_internal
        ? <Tag color="green">{record.department_name || 'Belső gyártás'}</Tag>
        : record.supplier_name ? <Tag color="blue">{record.supplier_name}</Tag> : <span style={{ color: '#ccc' }}>-</span>,
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
      key: 'price_quantity',
      render: (_: any, record: CostItem) => record.calculation_type === 'fixed'
        ? 'fix'
        : `${Number(record.price_quantity || 1).toLocaleString('hu-HU')} ${record.unit || ''}`,
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Szolgáltatások</h2>
        <Space>
          <ExportButton dataType="service" selectedIds={selectedRowKeys.map(Number)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Új szolgáltatás
          </Button>
        </Space>
      </div>

      <EnhancedTable
        tableKey="services"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Keresés (név, cikkszám, leírás, kategória)..."
        toolbarExtra={
            <Space>
                <Select
                    style={{ width: 220 }}
                    value={selectedProductFilter}
                    placeholder="Szűrés termék szerint…"
                    allowClear
                    showSearch
                    loading={productFilterLoading}
                    filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                    options={productTemplates.map(p => ({ value: p.id, label: p.name }))}
                    onChange={async (val) => {
                      setSelectedProductFilter(val);
                      if (!val) { setProductServiceIds(null); return; }
                      setProductFilterLoading(true);
                      try {
                        const res = await api.get(`/manufacturing/product-templates/${val}/`);
                        const pt = res.data;
                        const ids = new Set<number>([
                          ...(pt.allowed_services || []),
                          ...(pt.required_services || []),
                          ...(pt.finishing_services || []),
                          ...(pt.binding_services || []),
                          ...(pt.print_service_options || []),
                          ...(pt.print_service ? [pt.print_service] : []),
                        ]);
                        setProductServiceIds(ids);
                      } catch { setProductServiceIds(null); }
                      finally { setProductFilterLoading(false); }
                    }}
                />
                <TreeSelect
                    style={{ width: 250 }}
                    value={selectedCategoryFilter}
                    styles={{ popup: { root: { maxHeight: 400, overflow: 'auto' } } }}
                    treeData={buildGroupTree(serviceGroups)}
                    placeholder="Minden kategória"
                    treeDefaultExpandAll={false}
                    onChange={setSelectedCategoryFilter}
                    allowClear
                    showSearch
                    filterTreeNode={(inputValue, treeNode) => 
                       (treeNode?.title as string).toLowerCase().includes(inputValue.toLowerCase())
                    }
                />
                <Select 
                    value={statusFilter} 
                    onChange={setStatusFilter} 
                    style={{ width: 120 }}
                >
                    <Option value="all">Mind</Option>
                    <Option value="active">Aktív</Option>
                    <Option value="inactive">Inaktív</Option>
                </Select>
            </Space>
        }
        size="small"
        columns={columns}
        dataSource={filteredServices}
        loading={loading}
        rowKey="id"
        cardBreakpoint={850}
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} szolgáltatás`,
        }}
      />

      <Modal
        title={editingService ? 'Szolgáltatás szerkesztése' : 'Új szolgáltatás'}
        open={modalVisible}
        onCancel={handleCancel}
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

              <Form.Item label="Cikkszám" required>
                 <Space>
                    <Form.Item 
                       name="code" 
                       noStyle 
                       rules={[
                          { required: true, message: 'Kötelező mező' },
                          {
                            validator: async (_, value) => {
                               if (!value) return;
                               const exists = services.find(s => s.code === value && s.id !== editingService?.id);
                               if (exists) {
                                   return Promise.reject(new Error('Ez a cikkszám már létezik!'));
                               }
                               return Promise.resolve();
                            }
                          }
                       ]}
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

              <Form.Item name="description" label="Leírás">
                <Input.TextArea rows={3} />
              </Form.Item>

              <Form.Item name="groups" label="Szolgáltatás csoportok">
                 <TreeSelect
                    treeData={buildGroupTree(serviceGroups)}
                    treeCheckable
                    showCheckedStrategy={TreeSelect.SHOW_PARENT}
                    placeholder="Válassz csoportokat"
                    style={{ width: '100%' }}
                    allowClear
                    switcherIcon={({ expanded }: any) => expanded ? <MinusOutlined /> : <PlusOutlined />}
                 />
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
                <NumInput style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item shouldUpdate noStyle>
                {() => {
                  const summaries = getPriceVersionSummaries();
                  const priceSourceMode = form.getFieldValue('price_source_mode') || 'manual';
                  return (
                    <div style={{ marginTop: 16, marginBottom: 16, padding: 16, background: '#fff7e6', borderRadius: 6, border: '1px solid #ffd591' }}>
                      <strong style={{ fontSize: 15 }}>Nettó egységár</strong>
                      <Row gutter={12} align="middle" style={{ marginTop: 8 }}>
                        <Col xs={24} md={10}>
                          <NumInput
                            style={{ width: '100%', fontWeight: 600 }}
                            value={netUnitPrice}
                            disabled={priceSourceMode !== 'manual'}
                            min={0}
                            precision={2}
                            addonAfter="HUF"
                            onChange={(value) => {
                              const net = value || 0;
                              setNetUnitPrice(net);
                              form.setFieldsValue({ price_source_mode: 'manual', unit_selling_price: net });
                            }}
                          />
                        </Col>
                        <Col xs={24} md={14}>
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
                              {summary.version}{summary.supplierNames?.length ? ` · ${summary.supplierNames.join(', ')}` : ''}{' – '}{summary.unitSelling.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} HUF / {form.getFieldValue('unit') || 'egység'}
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
                            { title: 'Beszállítók', key: 'suppliers', render: (_: any, r: any) => r.supplierNames?.join(', ') || '—' },
                            { title: 'Elemek', key: 'items', render: (_: any, r: any) => r.items.length },
                            { title: 'Bekerülési / egység', key: 'unitCost', align: 'right' as const, render: (_: any, r: any) => `${r.unitCost.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} HUF` },
                            { title: 'Nettó ár / egység', key: 'unitSelling', align: 'right' as const, render: (_: any, r: any) => <strong>{r.unitSelling.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} HUF</strong> },
                          ]}
                        />
                      ) : (
                        <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>Árkalkulációs verziót a <em>Beszállítók és árkalkuláció</em> fülön lehet rögzíteni.</div>
                      )}
                    </div>
                  );
                }}
              </Form.Item>

              <Form.Item name="unit_cost_price" hidden initialValue={0}>
                <NumInput />
              </Form.Item>
              
              <Form.Item name="markup_percentage" hidden initialValue={35}>
                <NumInput />
              </Form.Item>
              
              <Form.Item name="unit_selling_price" hidden initialValue={0}>
                <NumInput />
              </Form.Item>

              <Form.Item name="price_source_mode" hidden initialValue="manual">
                <Input />
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
                  <Option value="sheet">ív (ív alapú)</Option>
                  <Option value="click">Ív alapú (klikkdíjas)</Option>
                </Select>
              </Form.Item>

              {/* ── Méretkorlát ──────────────────────────────────────────── */}
              <h4 style={{ marginTop: 16, marginBottom: 8 }}>Méretkorlát</h4>
              <Tooltip title="Add meg a maximálisan feldolgozható méretet. Ha 0 vagy üres, nincs korlát (végtelen).">
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <Form.Item name="max_width_mm" label="Max szélesség (mm)" style={{ flex: 1, marginBottom: 0 }}>
                    <NumInput min={0} placeholder="0 = végtelen" style={{ width: '100%' }} addonAfter="mm" />
                  </Form.Item>
                  <Form.Item name="max_height_mm" label="Max magasság (mm)" style={{ flex: 1, marginBottom: 0 }}>
                    <NumInput min={0} placeholder="0 = végtelen" style={{ width: '100%' }} addonAfter="mm" />
                  </Form.Item>
                </div>
              </Tooltip>

              {/* Hidden fields to store actual data model structure */}
              <Form.Item name="is_internal_production" hidden><Input /></Form.Item>
              <Form.Item name="internal_production_department" hidden><Input /></Form.Item>
              <Form.Item name="default_supplier" hidden><Input /></Form.Item>
              <Form.Item name="default_source_unified" hidden><Input /></Form.Item>

            </Form>
          </TabPane>


          <TabPane tab="Beszállítók és árkalkuláció" key="2" disabled={!editingService && addedSuppliers.length === 0}>
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
                  { title: 'Forrás', key: 'suppliers', render: (_: any, r: any) => r.supplierNames?.join(', ') || '—' },
                  { title: 'Elemek', key: 'items', align: 'right' as const, render: (_: any, r: any) => r.items.length },
                  { title: 'Ár / egység', key: 'selling', align: 'right' as const, render: (_: any, r: any) => `${r.unitSelling.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} HUF` },
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
                    style={{ width: 300 }}
                    placeholder="Forrás (belső osztály / külső szállító)"
                    onChange={(val: string) => {
                      setSelectedSourceForCost(val ?? null);
                      const isInternal = val === 'internal' || String(val || '').startsWith('dept_');
                      if (isInternal) {
                        if (editingService) fetchCostItems(editingService.id, 'internal');
                      } else if (val != null) {
                        if (editingService) fetchCostItems(editingService.id, Number(val));
                      } else {
                        setCostItems([]);
                      }
                    }}
                    value={selectedSourceForCost}
                    showSearch
                    optionFilterProp="children"
                    allowClear
                    onClear={() => { setSelectedSourceForCost(null); setCostItems([]); }}
                  >
                    {departments.map(d => (
                      <Option key={`dept_${d.id}`} value={`dept_${d.id}`}>
                        {`[Belső] ${d.name}`}
                      </Option>
                    ))}
                    {suppliers.map(s => (
                      <Option key={s.id} value={s.id}>{s.name}</Option>
                    ))}
                  </Select>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddCostItem}
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
            <Input />
          </Form.Item>
          <Form.Item name="is_internal" hidden>
             <Input /> 
          </Form.Item>
          <Form.Item name="price_calculation_version" hidden>
            <Input />
          </Form.Item>

          <Form.Item shouldUpdate={true} noStyle>
            {() => {
              const isInternal = costItemForm.getFieldValue('is_internal') === true || costItemForm.getFieldValue('is_internal') === 'true';
              return isInternal ? (
                <Form.Item name="department" label="HR Osztály (belső gyártás)">
                  <Select allowClear placeholder="Válassz osztályt" showSearch optionFilterProp="children">
                    {departments.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}
                  </Select>
                </Form.Item>
              ) : (
                <Form.Item name="supplier" label="Beszállító">
                  <Select allowClear placeholder="Válassz beszállítót" showSearch optionFilterProp="children">
                    {suppliers.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
                  </Select>
                </Form.Item>
              );
            }}
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
              <Option value="click">Ív alapú (klikkdíjas)</Option>
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
             help="Pl. 0.5 = minden megkezdett fél egység. 1 = egészre kerekítés. Mindig felfelé kerekít."
          >
            <NumInput min={0.0001} step={0.1} style={{ width: '100%' }} />
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

          <Form.Item shouldUpdate noStyle>
            {() => costItemForm.getFieldValue('calculation_type') !== 'fixed' && (
              <Form.Item
                name="price_quantity"
                label="Az ár hány mértékegységre vonatkozik?"
                tooltip="Példa: ha az ár 10 db-ra vonatkozik, ide 10 kerül, így az egységár tizedelődik."
                rules={[{ required: true, message: 'Kötelező mező' }]}
              >
                <NumInput style={{ width: '100%' }} min={0.0001} precision={4} addonAfter={costItemForm.getFieldValue('unit') || 'egység'} />
              </Form.Item>
            )}
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

          <Form.Item name="currency" hidden initialValue="HUF">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Services;
