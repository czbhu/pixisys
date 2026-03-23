import React, { useState, useEffect } from 'react';
import EnhancedTable from '../../components/EnhancedTable';
import { useSearchParams } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm, Tabs, AutoComplete, Switch, TreeSelect, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, ThunderboltOutlined, SearchOutlined, MinusOutlined, CopyOutlined } from '@ant-design/icons';
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
  const [selectedSourceForCost, setSelectedSourceForCost] = useState<'internal' | number | null>(null);
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

  useEffect(() => {
    fetchServices();
    fetchSuppliers();
    fetchDepartments();
    fetchServiceGroups();
    
    const create = searchParams.get('create') === 'true';
    const copyFrom = searchParams.get('copy_from');
    const editId = searchParams.get('edit');

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
    setCostItems([]);
    setAddedSuppliers([]);
    setPrintCostItems([]);
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
    
    // Load added suppliers
    fetchAddedSuppliers(service);
    
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
        fetchAddedSuppliers(editingService);
      }
    } catch (error) {
      message.error('Hiba a törlés során');
      console.error(error);
    }
  };

  const handleCostItemSubmit = async (values: any) => {
    try {
      // Ensure correct types for hidden fields
      const payload = {
        ...values,
        is_internal: values.is_internal === true || values.is_internal === 'true',
        supplier: values.supplier ? Number(values.supplier) : null,
        service: Number(values.service),
      };

      if (editingCostItem) {
        await api.patch(`/manufacturing/service-cost-items/${editingCostItem.id}/`, payload);
        message.success('Költség elem frissítve');
      } else {
        await api.post('/manufacturing/service-cost-items/', payload);
        message.success('Költség elem létrehozva');
      }
      setCostItemModalVisible(false);
      if (editingService && selectedSourceForCost) {
        fetchCostItems(editingService.id, selectedSourceForCost);
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
          {record.code === 'DIGIPR_K' || record.code === 'DIGIPR_CMYK' ? (
            <Tooltip title="Ez a klikk-díj számítási szolgáltatás nem törölhető">
              <Button type="link" danger icon={<DeleteOutlined />} disabled />
            </Tooltip>
          ) : (
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Szolgáltatások</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Új szolgáltatás
        </Button>
      </div>

      <EnhancedTable
        tableKey="services"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Keresés (név, cikkszám, leírás, kategória)..."
        toolbarExtra={
            <Space>
                <TreeSelect
                    style={{ width: 250 }}
                    value={selectedCategoryFilter}
                    dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
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
                  <Option value="sheet">ív (ív alapú)</Option>
                  <Option value="click">Ív alapú (klikkdíjas)</Option>
                </Select>
              </Form.Item>

              {/* ── Méretkorlát ──────────────────────────────────────────── */}
              <h4 style={{ marginTop: 16, marginBottom: 8 }}>Méretkorlát</h4>
              <Tooltip title="Add meg a maximálisan feldolgozható méretet. Ha 0 vagy üres, nincs korlát (végtelen).">
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <Form.Item name="max_width_mm" label="Max szélesség (mm)" style={{ flex: 1, marginBottom: 0 }}>
                    <InputNumber min={0} placeholder="0 = végtelen" style={{ width: '100%' }} addonAfter="mm" />
                  </Form.Item>
                  <Form.Item name="max_height_mm" label="Max magasság (mm)" style={{ flex: 1, marginBottom: 0 }}>
                    <InputNumber min={0} placeholder="0 = végtelen" style={{ width: '100%' }} addonAfter="mm" />
                  </Form.Item>
                </div>
              </Tooltip>

              <h4 style={{ marginTop: 16, marginBottom: 8 }}>Hozzáadott beszállítók / Források</h4>
              <div style={{ marginBottom: 16 }}>
                 <Space>
                    <Select 
                       style={{ width: 300 }} 
                       placeholder="Beszállító hozzáadása..." 
                       value={undefined}
                       showSearch
                       onChange={(val: number) => {
                          const supp = suppliers.find(s => s.id === val);
                          if (supp && !addedSuppliers.find(s => s.id === val && !s.is_internal)) {
                              setAddedSuppliers([...addedSuppliers, { ...supp, is_internal: false }]);
                              message.success('Beszállító hozzáadva');
                          }
                       }}
                       filterOption={(input, option) => (option?.children as unknown as string).toLowerCase().includes(input.toLowerCase())}
                    >
                        {suppliers.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
                     </Select>
                     
                     <Select
                       style={{ width: 250 }}
                       placeholder="Belső gyártás hozzáadása..."
                       value={undefined}
                       onChange={(val: number) => {
                          const dept = departments.find(d => d.id === val);
                          if (dept) {
                              if (!addedSuppliers.find(s => s.is_internal && s.id === val)) {
                                  setAddedSuppliers([...addedSuppliers, { id: val, name: dept.name, is_internal: true }]);
                                  message.success('Belső gyártás hozzáadva');
                              }
                          }
                       }}
                     >
                         {departments.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}
                     </Select>
                 </Space>
              </div>
              
              <Table 
                 dataSource={addedSuppliers}
                 rowKey={(r) => r.is_internal ? `int_${r.id}` : `ext_${r.id}`}
                 pagination={false}
                 size="small"
                 columns={[
                     { title: 'Név', dataIndex: 'name' },
                     { title: 'Típus', render: (r: any) => r.is_internal ? <Tag color="blue">Belső</Tag> : <Tag color="green">Külső</Tag> },
                     { 
                         title: '1 egységre jutó ár', 
                         render: (r: any) => {
                             if (r.total_price !== undefined) {
                                 return `${r.total_price.toLocaleString()} HUF`;
                             }
                             return '-';
                         }
                     },
                     {
                         title: 'Művelet',
                         render: (r) => (
                             <Popconfirm
                                title="Biztosan törli?"
                                onConfirm={() => {
                                    if(editingService) {
                                        handleRemoveSupplier(r.id, r.is_internal || false);
                                    } else {
                                        setAddedSuppliers(addedSuppliers.filter(s => {
                                            if(r.is_internal) return !(s.is_internal && s.id === r.id);
                                            return !( !s.is_internal && s.id === r.id );
                                        }));
                                        
                                        // Auto-clear defaults if removed
                                        const currentDeptId = form.getFieldValue('internal_production_department');
                                        const currentSuppId = form.getFieldValue('default_supplier');
                                        if (r.is_internal && currentDeptId === r.id) {
                                            form.setFieldsValue({ internal_production_department: null, default_source_unified: null });
                                        }
                                        if (!r.is_internal && currentSuppId === r.id) {
                                            form.setFieldsValue({ default_supplier: null, default_source_unified: null });
                                        }
                                    }
                                }}
                             >
                                <Button danger size="small" icon={<DeleteOutlined />} />
                             </Popconfirm>
                         )
                     }
                 ]}
              />

              <h4 style={{ marginTop: 16, marginBottom: 8 }}>Alapértelmezett forrás</h4>
              <Form.Item 
                  name="default_source_unified" 
                  label="Válassz alapértelmezett forrást"
                  rules={[{ required: true, message: 'Válassz forrást' }]}
              >
                  <Select 
                    placeholder="Válassz a hozzáadott források közül"
                    onChange={(val) => {
                       // val format: "int_ID" or "ext_ID"
                       const [type, idStr] = val.split('_');
                       const id = parseInt(idStr, 10);
                       
                       if (type === 'int') {
                           form.setFieldsValue({
                               is_internal_production: true,
                               internal_production_department: id,
                               default_supplier: null
                           });
                       } else {
                           form.setFieldsValue({
                               is_internal_production: false,
                               internal_production_department: null,
                               default_supplier: id
                           });
                       }
                    }}
                  >
                      {addedSuppliers.map(s => {
                          const key = s.is_internal ? `int_${s.id}` : `ext_${s.id}`;
                          return <Option key={key} value={key}>
                              {s.is_internal ? `[Belső] ${s.name}` : `[Külső] ${s.name}`}
                          </Option>
                      })}
                  </Select>
              </Form.Item>
              
              {/* Hidden fields to store actual data model structure */}
              <Form.Item name="is_internal_production" hidden><Input /></Form.Item>
              <Form.Item name="internal_production_department" hidden><Input /></Form.Item>
              <Form.Item name="default_supplier" hidden><Input /></Form.Item>



            </Form>
          </TabPane>


          <TabPane tab="Beszállítók és árkalkuláció" key="2" disabled={!editingService && addedSuppliers.length === 0}>
            <div style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <Select
                    style={{ width: 400 }}
                    placeholder="Válassz beszállítót a költségelemek kezeléséhez"
                    onChange={(val: number | 'internal') => {
                        setSelectedSourceForCost(val);
                        if (editingService) {
                           fetchCostItems(editingService.id, val);
                        } else {
                           // Allow new service creation flow -> filter local costItems? 
                           // Currently costItems are single list.
                           // If new service, we store costItems with reference to supplier?
                           // The local costItems state is an array. We need to filter it visually?
                           // NO, we should probably allow editing one context at a time.
                        }
                    }}
                    value={selectedSourceForCost === 'internal' ? 'internal' : selectedSourceForCost}
                    // Default value logic: currently 'selectedSourceForCost' state
                    showSearch
                    optionFilterProp="children"
                    filterOption={(input, option) => (option?.children as unknown as string).toLowerCase().includes(input.toLowerCase())}
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
              size="small"
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
            <Input />
          </Form.Item>

          <Form.Item name="supplier" hidden>
            <Input />
          </Form.Item>

          <Form.Item name="is_internal" hidden>
             <Input /> 
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
