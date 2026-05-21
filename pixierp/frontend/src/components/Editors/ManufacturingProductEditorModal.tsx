import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Modal, Form, Input, InputNumber, Select, message, Tabs, Button, Space, Table, Popconfirm, Row, Col, Checkbox, Tag, Tooltip, Dropdown } from 'antd';
import NumInput from '../NumInput';
import { useNavigate } from 'react-router-dom';
import { PlusOutlined, DeleteOutlined, CopyOutlined, ExclamationCircleOutlined, CalculatorOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { manufacturingService, ProductClass, Project } from '../../services/manufacturingService';
import { crmService } from '../../services/crmService';
import { salesService } from '../../services/salesService';
import { hrService } from '../../services/hrService';
import api from '../../services/api';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface Props {
  open: boolean;
  onCancel: () => void;
  onCreated: (mp: any) => void;
  customer?: { id: any; name: string };
  editingProduct?: any;
}

interface CostItem {
    id: number;
    type: 'material' | 'service' | 'other';
    ref_id?: number;
    name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    cost_price: number;
    markup_percent: number;
    selling_unit_price: number;
    selling_price: number;
    supplier_id?: number | null;
    is_per_unit?: boolean;
    is_internal?: boolean;
    department_id?: number | null;
}

const CALCULATOR_CATEGORIES = [
  { label: 'Íves/Táblás nyomtatás', value: 'sheet_print', color: 'blue' },
  { label: 'Tekercses nyomtatás', value: 'roll_print', color: 'green' },
  { label: 'Világító tábla', value: 'lightbox', color: 'orange' },
  { label: 'Egyéb', value: 'other', color: 'default' }
];

const CALCULATOR_TYPES = [
  { label: 'Általános', value: 'generic' },
  { label: 'Íves/Táblás optimalizálás', value: 'sheet_print' },
  { label: 'Tekercses kalkuláció', value: 'roll_print' }
];

const ManufacturingProductEditorModal: React.FC<Props> = ({ open, onCancel, onCreated, customer, editingProduct }) => {
  const navigate = useNavigate();
  const postActionRef = useRef<string | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [productClasses, setProductClasses] = useState<ProductClass[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  
  // Calculator States
  const [calculatorTemplates, setCalculatorTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [calculatorState, setCalculatorState] = useState<any>({});


  // Store displayed totals
  const [displayedTotals, setDisplayedTotals] = useState({
      totalCost: 0,
      totalSelling: 0,
      unitCost: 0,
      unitSelling: 0,
      quantity: 1
  });
  
  // Resources for selection
  const [materials, setMaterials] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [materialGroups, setMaterialGroups] = useState<any[]>([]);
  const [existingProducts, setExistingProducts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('1');
  const [dimensionsPerUnit, setDimensionsPerUnit] = useState(true);
  const [calculatedVolumes, setCalculatedVolumes] = useState({ unit: 0, total: 0 });
  const [calculatedTotalDims, setCalculatedTotalDims] = useState<{ width: number; length: number; height: number; unit: string } | null>(null);
  const [isFixedQuantity, setIsFixedQuantity] = useState(false);
    const [initialEditorSnapshot, setInitialEditorSnapshot] = useState('');

  // Status long-press
  const statusPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusLongTriggered = useRef(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const watchedStatus = Form.useWatch('status', form);

  const STATUS_LABELS: Record<string, string> = {
    quote_request_open: 'Ajánlatkérés nyitott',
    quote_request_priced: 'Ajánlatkérés árazva',
    quote_request_sent: 'Ajánlat elküldve',
    ordered: 'Megrendelve',
    design_in_progress: 'Tervezés folyamatban',
    design_approved: 'Terv elfogadva',
    production_in_progress: 'Gyártás folyamatban',
    production_completed: 'Gyártás kész',
    finished_goods_warehouse: 'Késztermék raktáron',
    installation_in_progress: 'Telepítés folyamatban',
    delivered: 'Leszállítva',
    invoiced: 'Számlázva',
    paid: 'Fizetve',
    cancelled: 'Törölve',
  };
  const STATUS_COLORS: Record<string, string> = {
    quote_request_open: 'blue',
    quote_request_priced: 'cyan',
    quote_request_sent: 'geekblue',
    ordered: 'gold',
    design_in_progress: 'orange',
    design_approved: 'lime',
    production_in_progress: 'processing',
    production_completed: 'green',
    finished_goods_warehouse: 'teal',
    installation_in_progress: 'volcano',
    delivered: 'success',
    invoiced: 'purple',
    paid: 'magenta',
    cancelled: 'default',
  };
    const [dataLoadedKey, setDataLoadedKey] = useState(0);

    const EMPTY_STRINGS = new Set(['', '<p><br></p>', '<p></p>', '<br>']);

    const normalizeForCompare = (value: any): any => {
        if (value === null || value === undefined) return undefined;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (EMPTY_STRINGS.has(trimmed)) return undefined;
            return trimmed;
        }
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

    const getEditorSnapshot = () => JSON.stringify(normalizeForCompare({
        form: form.getFieldsValue(true),
        costItems,
    }));

    const hasEditorChanges = () => getEditorSnapshot() !== initialEditorSnapshot;

  useEffect(() => {
    if (open) {
      setDataLoadedKey(0);
      loadData();
      form.resetFields();
      setCostItems([]);
      setActiveTab('1');
      setDimensionsPerUnit(true);
      setCalculatedVolumes({ unit: 0, total: 0 });
      setIsFixedQuantity(false);
      
      if (editingProduct) {
          setIsFixedQuantity(editingProduct.is_fixed_quantity || false);

          // Determine company_id and contact_ids for separate fields
          let companyId: any = undefined;
          let contactIds: string[] = [];

          if (editingProduct.allowed_companies_data && editingProduct.allowed_companies_data.length > 0) {
              companyId = editingProduct.allowed_companies_data[0].id;
          } else if (editingProduct.allowed_companies && editingProduct.allowed_companies.length > 0) {
              companyId = editingProduct.allowed_companies[0];
          }

          if (editingProduct.allowed_contacts_data) {
              contactIds = editingProduct.allowed_contacts_data.map((c: any) => String(c.id));
          }

          // Load contacts for the preloaded company
          if (companyId) {
              crmService.getContactsByCompany(companyId)
                  .then((res: any) => setContacts((res.results ?? res) || []))
                  .catch(() => {});
          }

          form.setFieldsValue({
              ...editingProduct,
              company_id: companyId,
              contact_ids: contactIds,
              customer_ids: undefined,
              customer_id: undefined, // Deprecated
              project_id: editingProduct.project, // check field name in MP
              product_class_id: editingProduct.product_class, // check field name
          });
          // Also date fields usually moment/dayjs
          if (editingProduct.date) form.setFieldValue('date', dayjs(editingProduct.date));
          if (editingProduct.deadline) form.setFieldValue('deadline', dayjs(editingProduct.deadline));
          
          const rawCosts = editingProduct.cost_items || [];
          setCostItems(rawCosts.map((c: any) => ({
              ...c,
              id: c.id || Date.now() + Math.random(),
              supplier_id: c.supplier || c.supplier_id, 
              department_id: c.department || c.department_id,
              is_internal: c.is_internal || false,
              // Ensure fields are numbers
              unit_price: Number(c.unit_price) || 0,
              cost_price: Number(c.cost_price) || 0,
              selling_unit_price: Number(c.selling_unit_price) || 0,
              selling_price: Number(c.selling_price) || 0
          })));
      } else {
        form.setFieldsValue({
            status: 'quote_request_open',
            quantity: 1,
            quantity_unit: 'db',
            dimension_unit: 'mm',
            company_id: customer ? customer.id : undefined,
            contact_ids: [],
        });
      }

    // Force gen code if we have a generated product from calculator
    if (open && editingProduct && editingProduct._from_calculator && !form.getFieldValue('code')) {
        // Triggered via separate effect when products loaded
      }
    }
  }, [open, customer, editingProduct]);

    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => {
            setInitialEditorSnapshot(getEditorSnapshot());
        }, 0);
        return () => clearTimeout(timer);
    }, [open, editingProduct]);

    // Re-take snapshot after data finishes loading (covers generated code, etc.)
    useEffect(() => {
        if (!open || dataLoadedKey === 0) return;
        const timer = setTimeout(() => {
            setInitialEditorSnapshot(getEditorSnapshot());
        }, 150);
        return () => clearTimeout(timer);
    }, [dataLoadedKey]);

  useEffect(() => {
    // Auto-generate code for calculator-created products once products are loaded
    if (open && editingProduct && editingProduct._from_calculator && existingProducts.length > 0) {
        if (!form.getFieldValue('code')) {
            generateCode();
        }
        
        // Ensure totals are set from initial data if present (override default calc)
        if (editingProduct.net_unit_price) {
             // We don't have a direct field for "net_unit_price" in the form? 
             // The form seems to calculate it from CostItems.
             // But we have displayedTotals state.
             // The costItems effect will overwrite it.
             // So we must ensure costItems are correct.
        }
    }
  }, [existingProducts, open, editingProduct]);

  const loadData = async () => {
    try {
      const [pcs, projs, custs, contactsRes, matsRes, servsRes, suppsRes, prodsRes, deptsRes, templatesRes] = await Promise.all([
        manufacturingService.getProductClasses(),
        manufacturingService.getOpenProjects(),
        crmService.getCompanies(),
        crmService.getContacts(),
        api.get('/warehouse/materials/?filter_type=all&page_size=1000'), 
        manufacturingService.getServices(),
        api.get('/crm/companies/?is_supplier=true&page_size=1000'),
        api.get('/manufacturing/products/?page_size=10000'),
        hrService.getDepartments(),
        api.get('/manufacturing/calculator-templates/'),
      ]);
      
      const mList = (matsRes.data.results ?? matsRes.data).map((m: any) => ({
          ...m,
          name: m.code ? `[${m.code}] ${m.name}` : m.name
      }));
      const sList = servsRes.results ?? servsRes;
      let suppList = (suppsRes.data.results ?? suppsRes.data).sort((a: any, b: any) => a.name.localeCompare(b.name));
      
      // Ensure Internal Production is at the top
      const internalIdx = suppList.findIndex((s: any) => {
          const name = (s.name || '').trim().toLowerCase();
          return name.includes('belső gyártás') || name.includes('internal') || name.includes('belső márka');
      });
      if (internalIdx > -1) {
          const internalSupp = suppList[internalIdx];
          suppList.splice(internalIdx, 1);
          suppList.unshift(internalSupp);
      }

      setProductClasses(pcs);
      setProjects(projs);
      setCustomers(((custs as any).results || custs));
      setContacts((contactsRes.results || contactsRes));
      setMaterials(mList);
      setServices(sList);
      setSuppliers(suppList);
      setDepartments((deptsRes.results ?? deptsRes));
      setExistingProducts(((prodsRes as any).data?.results ?? (prodsRes as any).data ?? []));
      setCalculatorTemplates(templatesRes.data?.results ?? templatesRes.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setDataLoadedKey(k => k + 1);
    }
  };

  // Effect to load missing suppliers
  useEffect(() => {
    const fetchMissingSuppliers = async () => {
        if (!costItems || costItems.length === 0 || suppliers.length === 0) return;
        
        const existingIds = new Set(suppliers.map((s: any) => s.id));
        const missingIds = new Set<number>();
        
        costItems.forEach(item => {
            if (item.supplier_id && !existingIds.has(Number(item.supplier_id))) {
                missingIds.add(Number(item.supplier_id));
            }
        });
        
        if (missingIds.size > 0) {
            const newSuppliers: any[] = [];
            for (const id of Array.from(missingIds)) {
                try {
                    const res = await api.get(`/crm/companies/${id}/`);
                    if (res.data) newSuppliers.push(res.data);
                } catch (e) {
                    console.error(`Could not fetch supplier ${id}`, e);
                }
            }
            
            if (newSuppliers.length > 0) {
                setSuppliers(prev => {
                    // Unique merge
                    const combined = [...prev, ...newSuppliers];
                    // Remove duplicates just in case
                    const unique = Array.from(new Map(combined.map(item => [item['id'], item])).values());
                    return unique.sort((a: any, b: any) => a.name.localeCompare(b.name));
                });
            }
        }
    };
    
    fetchMissingSuppliers();
  }, [costItems, suppliers.length]);

  const calculateWeightFromDimensions = () => {
    const width = form.getFieldValue('width');
    const length = form.getFieldValue('length');
    const height = form.getFieldValue('height');
    const dimensionUnit = form.getFieldValue('dimension_unit') || 'mm';
    const specificWeight = form.getFieldValue('specific_weight');
    const specificWeightUnit = form.getFieldValue('specific_weight_unit') || 'kg/m3';
    const qty = form.getFieldValue('quantity') || 1;

    if ((!width || !length) && (!height)) {
      setCalculatedTotalDims(null);
      return;
    }

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

    // Determine Base Volume
    let baseVolumeM3 = 0;
    if (heightM > 0) {
        baseVolumeM3 = widthM * lengthM * heightM;
    }

    // Update volumes
    let uVol = 0;
    let tVol = 0;

    if (dimensionsPerUnit) {
        uVol = baseVolumeM3;
        tVol = baseVolumeM3 * qty;
        // Calculate total stacked dimensions (width/length same, height × qty)
        setCalculatedTotalDims({
            width: width || 0,
            length: length || 0,
            height: parseFloat(((height || 0) * qty).toFixed(2)),
            unit: dimensionUnit,
        });
    } else {
        tVol = baseVolumeM3;
        uVol = qty > 0 ? baseVolumeM3 / qty : 0;
        // Calculate per-unit dimensions (width/length same, height / qty)
        setCalculatedTotalDims({
            width: width || 0,
            length: length || 0,
            height: parseFloat(((height || 0) / (qty || 1)).toFixed(2)),
            unit: dimensionUnit,
        });
    }
    setCalculatedVolumes({ unit: uVol, total: tVol });

    // Auto-sync unit_weight ↔ total_weight based on quantity
    const unitWeight = form.getFieldValue('unit_weight');
    const totalWeight = form.getFieldValue('total_weight');

    // Calculate Weight from specific_weight × volume
    if (specificWeight && specificWeight > 0 && uVol > 0) {
      let specificWeightKgM3 = specificWeight;
      
      if (specificWeightUnit === 'g/cm3') {
        specificWeightKgM3 = specificWeight * 1000;
      } else if (specificWeightUnit === 'kg/liter') {
        specificWeightKgM3 = specificWeight * 1000;
      }
      
      // Calculate Total Weight (kg)
      const totalWeightKg = tVol * specificWeightKgM3;
      const unitWeightKg = uVol * specificWeightKgM3;

      form.setFieldsValue({ 
          total_weight: parseFloat(totalWeightKg.toFixed(3)), 
          unit_weight: parseFloat(unitWeightKg.toFixed(3)),
          weight_unit: 'kg'
      });
    } else if (unitWeight && unitWeight > 0 && !specificWeight) {
      // No specific weight but unit_weight is set — sync total_weight from qty
      form.setFieldsValue({ total_weight: parseFloat((unitWeight * qty).toFixed(3)) });
    } else if (totalWeight && totalWeight > 0 && !specificWeight && !unitWeight) {
      // Only total_weight set — compute unit_weight
      form.setFieldsValue({ unit_weight: parseFloat((totalWeight / (qty || 1)).toFixed(3)) });
    }
  };

  const calculateDimensionsFromWeight = (inputWeight: number | string | null, isUnit: boolean) => {
    // Only support modifying Unit Weight -> updates specific weight? Or modifies dimension?
    // Usually modifying weight updates specific weight if dimensions are fixed.
    // Let's implement updating 'specific_weight' based on Input Weight + Dimensions + Qty
    const weightValue = typeof inputWeight === 'string' ? parseFloat(inputWeight) : inputWeight;
    if (!weightValue) return;

    // ... (rest logic similar to before but considering isUnit and dimensionsPerUnit)
    // For simplicity, let's keep it simple: calculate Specific Weight from Total Weight
    
    const { unit: uVol, total: tVol } = calculatedVolumes;
    const targetVol = isUnit ? uVol : tVol; // Volume corresponding to the input weight
    
    if (targetVol > 0) {
        // weightValue is in selected weight unit? Form only has one weight unit selector.
        const weightUnit = form.getFieldValue('weight_unit') || 'kg';
        let weightKg = weightValue;
        if (weightUnit === 'g') {
          weightKg = weightValue / 1000;
        } else if (weightUnit === 't') {
          weightKg = weightValue * 1000;
        }

        const calculatedSpecificWeight = weightKg / targetVol; // kg/m3
         form.setFieldsValue({ 
            specific_weight: parseFloat(calculatedSpecificWeight.toFixed(2)),
            specific_weight_unit: 'kg/m3'
          });
          
          // Also update the OTHER weight field
           const qty = form.getFieldValue('quantity') || 1;
           if (isUnit) {
               form.setFieldsValue({ total_weight: parseFloat((weightKg * qty).toFixed(3)) });
           } else {
               form.setFieldsValue({ unit_weight: parseFloat((weightKg / qty).toFixed(3)) });
           }
    }
  };


  const generateCode = () => {
    const name = form.getFieldValue('name') || '';
    const companyId = form.getFieldValue('company_id');

    // Név-Ügyfél(első 5 karakter)-001(növekvő sorszám)
    
    // Alap: Név normalizálva
    let base = (name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 10)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) base = 'GEN';

    let custPart = '';
    if (companyId) {
      const c = customers.find((x: any) => x.id === companyId);
      if (c && c.name) {
        custPart = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '');
      }
    }

    const prefix = custPart ? `${base}-${custPart}` : base;
    
    // Find next suffix
    let i = 1;
    let suffix = '001';
    // existingProducts uses 'code' field? 
    // ManufacturingProduct usually has a 'code'? Or is it stored in 'name'?
    // The DB model might not have strict unique index on this generated code.
    // I'll check 'name' or 'code' if it exists. Re-reading Product model...
    // The previous edit added 'code' input.
    // Check collision against `existingProducts`.
    
    // Note: existingProducts might be large.
    const codes = new Set(existingProducts.map((p: any) => p.code));
    
    while (codes.has(`${prefix}-${suffix}`)) {
        i++;
        suffix = i.toString().padStart(3, '0');
        if (i > 999) break; // safety
    }
    
    form.setFieldsValue({ code: `${prefix}-${suffix}` });
  };

  const handleCodeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;

    const isDuplicate = existingProducts.some(p => 
        p.code && 
        p.code.toLowerCase() === val.toLowerCase() && 
        (!editingProduct || p.id !== editingProduct.id)
    );

    if (isDuplicate) {
        message.warning('Ez a cikkszám már létezik! Automatikus léptetés...');
        
        let newCode = val;
        
        // Check if ends with digits
        const match = val.match(/^(.*?)(\d+)$/);
        
        if (match) {
             const prefix = match[1];
             const numStr = match[2];
             const width = Math.max(numStr.length, 3);
             
             // Escape prefix for regex
             const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
             const regex = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');
             
             let maxNum = parseInt(numStr, 10);
             
             existingProducts.forEach(p => {
                 if (!p.code || (editingProduct && p.id === editingProduct.id)) return;
                 const m = p.code.match(regex);
                 if (m) {
                     const n = parseInt(m[1], 10);
                     if (n > maxNum) maxNum = n;
                 }
                 // Also check the exact duplicate (val) which we already found
                 if (p.code.toLowerCase() === val.toLowerCase()) {
                     const n = parseInt(numStr, 10);
                     if (n > maxNum) maxNum = n;
                 }
             });
             
             const nextNum = maxNum + 1;
             newCode = `${prefix}${nextNum.toString().padStart(width, '0')}`;
             
        } else {
             // No digits at end, append -001
             const prefix = val + (val.endsWith('-') ? '' : '-');
             
             const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
             const regex = new RegExp(`^${escapedPrefix}(\\d+)$`, 'i');

             let maxNum = 0;
             existingProducts.forEach(p => {
                 if (!p.code || (editingProduct && p.id === editingProduct.id)) return;
                 const m = p.code.match(regex);
                 if (m) {
                     const n = parseInt(m[1], 10);
                     if (n > maxNum) maxNum = n;
                 }
             });
             
             newCode = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
        }
        
        form.setFieldValue('code', newCode);
        message.success(`Új cikkszám generálva: ${newCode}`);
    }
  };

  const handleAddCost = (type: 'material' | 'service' | 'other') => {
    // Find default supplier
    let defaultSupplierId = null;
    if (type === 'other') {
        const defaultSupplier = suppliers.find(s => 
            (s.name || '').trim().toLowerCase().includes('belső márka') ||
            (s.name || '').trim().toLowerCase().includes('belső gyártás') || 
            (s.name || '').trim().toLowerCase().includes('saját') ||
            (s.name || '').trim().toLowerCase().includes('internal')
        );
        // If not found, try finding any with "internal" or similar
        // If still not found, and we have suppliers, maybe select the first one?
        if (defaultSupplier) defaultSupplierId = defaultSupplier.id;
    }

    const newItem: CostItem = {
        id: Date.now() + Math.random(),
        type,
        name: type === 'other' ? 'Egyéb költség' : '',
        unit: 'db',
        quantity: 1,
        unit_price: 0,
        cost_price: 0, 
        markup_percent: 30,
        selling_unit_price: 0,
        selling_price: 0,
        supplier_id: defaultSupplierId, // Set default supplier
        is_internal: false,
    };
    setCostItems([...costItems, newItem]);
  };

  // Recalculate totals whenever items change or quantity changes
  useEffect(() => {
    const productQty = form.getFieldValue('quantity') || 1;
    let tc = 0;
    let ts = 0;

    costItems.forEach(item => {
        const itemCost = Number(item.cost_price) || 0;
        const itemSelling = Number(item.selling_unit_price) || 0;
        const itemQty = Number(item.quantity) || 0;

        // If per unit, multiply by product quantity too
        const multiplier = item.is_per_unit ? productQty : 1;
        
        // Total cost for this row = (Item Cost Unit * Item Quantity) * Multiplier
        // Actually cost_price seems to be "Bekerülési ár" (Unit cost of the item logic?)
        // Let's assume cost_price IS the unit cost of the item.
        // Wait, updateCostItem calculates selling_price = selling_unit_price * quantity.
        // So Item totals are already (Unit * Qty).
        
        // Let's refine based on user request: 
        // "Ha egy egységre, akkor az alapadatok áránál a mennyiséggel meg kell szorozni az adott sort"
        // So if is_per_unit: Item Total = (Item Unit Cost * Item Quantity) * Product Quantity
        // If not per_unit: Item Total = (Item Unit Cost * Item Quantity)
        
        const rowTotalCost = (itemCost * itemQty) * multiplier;
        const rowTotalSelling = (itemSelling * itemQty) * multiplier;
        
        tc += rowTotalCost;
        ts += rowTotalSelling;
    });

    setDisplayedTotals({
        totalCost: tc,
        totalSelling: ts,
        unitCost: productQty > 0 ? tc / productQty : 0,
        unitSelling: productQty > 0 ? ts / productQty : 0,
        quantity: productQty
    });

  }, [costItems, form, form.getFieldValue('quantity')]); // Listen to form quantity change might need Form.useWatch or onValuesChange

  const updateCostItem = (id: number, field: string, value: any) => {
    setCostItems(prev => prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        
        let cp = Number(updated.cost_price) || 0;
        let mu = Number(updated.markup_percent) || 0;
        let sup = Number(updated.selling_unit_price) || 0;
        const qty = Number(updated.quantity) || 1;
        
        if (field === 'cost_price' || field === 'markup_percent') {
             // If material/service, we might not update cost_price here if locked
             updated.selling_unit_price = cp * (1 + mu / 100);
             updated.selling_price = updated.selling_unit_price * qty;
        }
        else if (field === 'selling_unit_price') {
            if (cp > 0) updated.markup_percent = ((sup / cp) - 1) * 100;
            updated.selling_price = sup * qty;
        }
        else if (field === 'quantity') {
            updated.selling_price = sup * qty;
        }
        return updated;
    }));
  };

  const handleCalculate = () => {
      const template = calculatorTemplates.find(t => t.id === selectedTemplateId);
      if (!template) return;
      
      const state = calculatorState;
      let newCostItems: CostItem[] = [];
      
      if (template.calculator_type === 'sheet_print') {
          const quantity = form.getFieldValue('quantity') || 1;
          const materialId = state.material_id;
          // Search in allowed details first as they are populated
          const material = template.allowed_materials_details?.find((m:any) => m.id === materialId);
          
          if (material) {
              // Very basic mock calculation: assume SRA3 (approx 0.144 sqm) vs Product size
              // We'd need sheet dimensions and product dimensions to do this real.
              // For now: 
              const sheetsNeeded = Math.ceil(quantity * 1.1); // 10% waste
              const unitPrice = 50; // Mock price if not in material object
              const cost = sheetsNeeded * unitPrice;
              
              newCostItems.push({
                id: Date.now(),
                type: 'material',
                name: `${material.name} (Kalkulált)`,
                unit: 'ív',
                quantity: sheetsNeeded,
                unit_price: unitPrice,
                cost_price: cost,
                markup_percent: template.default_markup_percentage || 30,
                selling_unit_price: unitPrice * (1 + (template.default_markup_percentage || 30)/100),
                selling_price: cost * (1 + (template.default_markup_percentage || 30)/100),
                supplier_id: null,
                is_per_unit: false
              });
          }
      } else if (template.calculator_type === 'roll_print') {
           const quantity = form.getFieldValue('quantity') || 1;
           const materialId = state.material_id;
           const material = template.allowed_materials_details?.find((m:any) => m.id === materialId);
           
           if (material) {
               // Mock: 1 sqm per product
               const area = quantity * 1.0; 
               const unitPrice = 2500; // Mock sqm price
               const cost = area * unitPrice;
               
                newCostItems.push({
                id: Date.now(),
                type: 'material',
                name: `${material.name} (Kalkulált)`,
                unit: 'nm',
                quantity: area,
                unit_price: unitPrice,
                cost_price: cost,
                markup_percent: template.default_markup_percentage || 30,
                selling_unit_price: unitPrice * (1 + (template.default_markup_percentage || 30)/100),
                selling_price: cost * (1 + (template.default_markup_percentage || 30)/100),
                supplier_id: null,
                is_per_unit: false
              });
           }
      }
      
      if (newCostItems.length > 0) {
          setCostItems(prev => [...prev, ...newCostItems]);
          message.success('Kalkuláció hozzáadva a költségekhez!');
          setActiveTab('1'); 
      } else {
          message.warning('Nem sikerült költséget számolni a megadott adatokból. Kérem ellenőrizze a kiválasztott anyagot.');
      }
  };

  const handleOk = async () => {
    try {
        const v = await form.validateFields();
        // Validation for Cost Items
        const invalidCosts = costItems.filter(c => 
            !c.name || 
            (c.type === 'other' && !c.is_internal && !c.supplier_id) ||
            (c.type === 'other' && c.is_internal && !c.department_id)
        );
        if (invalidCosts.length > 0) {
            message.error('Kérjük töltsön ki minden kötelező mezőt a költségeknél!');
            setActiveTab('2');
            return;
        }

        // Gen code if empty
        if (!v.code) {
           generateCode();
           // need to re-get value
           v.code = form.getFieldValue('code');
        }

        // Gen name if empty
        if (!v.name) {
             let suffix = '001';
             // Generate incremental name
            const names = new Set(existingProducts.map((p: any) => p.name));
            let i = 1;
            while (names.has(`Egyedi gyártás-${suffix}`)) {
                i++;
                suffix = i.toString().padStart(3, '0');
                if (i > 999) break; 
            }
             v.name = `Egyedi gyártás-${suffix}`;
             form.setFieldsValue({ name: v.name }); // update UI
        }

      // Calculate totals for saving
      const productQty = v.quantity || 1;
      let calculatedTotalSelling = 0;
      
      costItems.forEach(item => {
          const itemSelling = Number(item.selling_unit_price) || 0;
          const itemQty = Number(item.quantity) || 0;
          const multiplier = item.is_per_unit ? productQty : 1;
          calculatedTotalSelling += (itemSelling * itemQty) * multiplier;
      });
      
      const calculatedUnitSelling = productQty > 0 ? calculatedTotalSelling / productQty : 0;

      setSubmitting(true);

      const companyId = form.getFieldValue('company_id');
      const contactIdList: any[] = form.getFieldValue('contact_ids') || [];

      const allowedCompaniesPayload: any[] = companyId ? [String(companyId)] : [];
      const allowedContactsPayload: any[] = contactIdList.map((id: any) => String(id));
      
      const payload = {
        ...v,
        net_total_price: Number(calculatedTotalSelling.toFixed(2)),
        net_unit_price: Number(calculatedUnitSelling.toFixed(2)),
        is_fixed_quantity: isFixedQuantity,
        cost_items: costItems.map(c => ({
            type: c.type || 'other',
            ref_id: c.ref_id || null, // Ensure null if empty or undefined
            name: c.name,
            quantity: Number(Number(c.quantity).toFixed(4)) || 0,
            unit: c.unit || 'db',
            unit_price: Number((Number(c.selling_unit_price) || 0).toFixed(4)),
            selling_unit_price: Number((Number(c.selling_unit_price) || 0).toFixed(4)),
            cost_price: Number((Number(c.cost_price) || 0).toFixed(4)),
            markup_percent: Number((Number(c.markup_percent) || 0).toFixed(4)),
            selling_price: Number((Number(c.selling_price) || 0).toFixed(4)),
            supplier: c.supplier_id || null, // Ensure null if empty, do not send empty string
            department: c.department_id || null,
            is_internal: c.is_internal || false
        })),
        allowed_companies: allowedCompaniesPayload,
        allowed_contacts: allowedContactsPayload,
        contact: null, // Deprecated in favor of allowed_companies
        is_private_person: false, // Deprecated logic for now
        // Default mappings
        date: dayjs().format('YYYY-MM-DD'),
        deadline: dayjs().add(14, 'day').format('YYYY-MM-DD'),
      };

      let created;
      if (editingProduct && editingProduct.id) {
          created = await manufacturingService.updateProduct(editingProduct.id, payload);
          message.success('Egyedi gyártás frissítve');
      } else {
          created = await manufacturingService.createProduct(payload);
          message.success('Egyedi gyártás létrehozva');
      }

      if (postActionRef.current === 'createOffer' && created) {
         // Navigate or Open a new tab for Quote creation
         // Using a query param that the Sales module (Quotes) should understand
         window.open(`/sales/rfqs?create=true&add_item_id=${created.id}&add_item_type=manufacturing`, '_blank');
      }

      onCreated(created);
      form.resetFields();
      postActionRef.current = null;
    } catch (e: any) {
        console.error(e);
        if (e.response && e.response.data) {
             message.error(`Mentési hiba: ${JSON.stringify(e.response.data)}`);
        } else if (e.errorFields) {
          // Form validation error
          setActiveTab('1');
          form.scrollToField(e.errorFields[0].name);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const customerOptions = useMemo(() => {
    const compOpts = (customers || [])
        .filter((c: any) => c && c.id)
        .map((c: any) => ({ label: c.name, value: `company_${c.id}` }));
    
    // Check if contact has company
    const contactOpts = (contacts || [])
        .filter((c: any) => c && c.id)
        .map((c: any) => {
            const extra = c.company_name ? ` (${c.company_name})` : ' (Magánszemély)';
            const name = c.full_name || c.name || `${c.last_name || ''} ${c.first_name || ''}`.trim() || 'Névtelen';
            return { label: `👤 ${name}${extra}`, value: `contact_${c.id}` };
        });
        
    return [...compOpts, ...contactOpts];
  }, [customers, contacts]);

  const costColumns = [
    { title: 'Megnevezés', key: 'name', width: 250, render: (_: any, r: CostItem) => {
        if (r.type === 'other') return <Input value={r.name} onChange={(e) => updateCostItem(r.id, 'name', e.target.value)} status={!r.name ? 'error' : ''} />;
        // If the item has a name but no ref_id (e.g. from print editor), show name as text with tooltip
        if (r.name && !r.ref_id) {
            return <Tooltip title={r.name}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 230 }}>{r.name}</span></Tooltip>;
        }
        const isMat = r.type === 'material';
        const list = isMat ? materials : services;
        return (
            <Select 
                showSearch 
                optionFilterProp="label" 
                style={{ width: '100%' }} 
                value={r.ref_id} 
                onChange={(val, opt: any) => {
                    updateCostItem(r.id, 'ref_id', val);
                    updateCostItem(r.id, 'name', opt.label);
                    const found = list.find(x => x.id === val);
                    if (found) {
                        const unit = found.unit || (isMat ? 'db' : 'alkalom');
                        const costPrice = isMat 
                            ? (Number(found.moving_average_cost) || Number(found.net_unit_price) || 0)
                            : (Number(found.unit_cost_price) || Number(found.unit_price) || 0);

                        // Use CURRENT markup/selling from found item
                        // For Material: markup_percentage, unit_selling_price
                        // For Service (Mfg): unit_selling_price, markup_percentage
                        
                        let mu = 30;
                        let sellUnit = costPrice * 1.3;
                        
                        if (isMat || !isMat) { // Same logic for both if fields exist
                             if (found.markup_percentage) mu = Number(found.markup_percentage);
                             else mu = 35; // Default markup if missing

                             if (found.unit_selling_price) sellUnit = Number(found.unit_selling_price);
                             else if (costPrice > 0) sellUnit = costPrice * (1 + mu / 100);
                             else sellUnit = 0; // If free?
                        }
                        
                        const qty = r.quantity || 1;
                        updateCostItem(r.id, 'unit', unit);
                        updateCostItem(r.id, 'unit_price', costPrice); // Beszerzési
                        updateCostItem(r.id, 'cost_price', costPrice * qty); 
                        updateCostItem(r.id, 'markup_percent', mu);
                        updateCostItem(r.id, 'selling_unit_price', sellUnit);
                        updateCostItem(r.id, 'selling_price', sellUnit * qty);
                    }
                }}
            >
                {list.map((m: any) => <Select.Option key={m.id} value={m.id} label={m.name}>{m.name}</Select.Option>)}
            </Select>
        );
    }},
    { title: 'Típus', dataIndex: 'type', key: 'type', width: 90, render: (t: string) => t === 'material' ? 'Alapanyag' : t === 'service' ? 'Szolgáltatás' : 'Egyéb' },
    { title: 'Menny.', key: 'quantity', width: 70, render: (_: any, r: CostItem) => <NumInput value={r.quantity} onChange={v => updateCostItem(r.id, 'quantity', v)} min={0} controls={false} /> },
    { title: 'Egység', key: 'unit', width: 70, render: (_: any, r: CostItem) => r.type === 'other' ? <Input value={r.unit} onChange={e => updateCostItem(r.id, 'unit', e.target.value)} /> : r.unit },
    { title: 'Beker. ár', key: 'cost_price', width: 90, render: (_: any, r: CostItem) => <NumInput value={r.cost_price} onChange={v => updateCostItem(r.id, 'cost_price', v)} disabled={r.type !== 'other'} controls={false} /> }, 
    { title: 'Haszon %', key: 'markup_percent', width: 70, render: (_: any, r: CostItem) => <NumInput value={r.markup_percent} onChange={v => updateCostItem(r.id, 'markup_percent', v)} disabled={r.type !== 'other'} controls={false} precision={2} /> },
    { title: 'Eladási e.ár', key: 'selling_unit_price', width: 90, render: (_: any, r: CostItem) => <NumInput value={r.selling_unit_price} onChange={v => updateCostItem(r.id, 'selling_unit_price', v)} disabled={r.type !== 'other'} controls={false} /> },
    { title: 'Beszállító', key: 'supplier_id', width: 260, render: (_: any, r: CostItem) => {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                 <Checkbox 
                    checked={r.is_internal} 
                    onChange={e => {
                        const checked = e.target.checked;
                        updateCostItem(r.id, 'is_internal', checked);
                        // Clear previous selection to avoid confusion
                        if (checked) {
                            updateCostItem(r.id, 'department_id', null);
                            updateCostItem(r.id, 'supplier_id', null);
                        } else {
                            updateCostItem(r.id, 'department_id', null);
                            updateCostItem(r.id, 'supplier_id', null);
                        }
                    }}
                 >
                    Belső
                 </Checkbox>
                 {r.is_internal ? (
                    <Select 
                        style={{ width: '100%' }} 
                        value={r.department_id} 
                        onChange={v => updateCostItem(r.id, 'department_id', v)} 
                        allowClear
                        placeholder="Válassz részleget"
                    >
                        {departments.map(d => (
                            <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
                        ))}
                    </Select>
                 ) : (
                    <Select 
                        style={{ width: '100%' }} 
                        value={r.supplier_id} 
                        onChange={(v) => {
                            let val = v;
                            if (!val) {
                                // Default to nothing if cleared, or implement default logic if desired
                            }
                            updateCostItem(r.id, 'supplier_id', val);
                        }} 
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        optionLabelProp="shortLabel"
                        status={!r.supplier_id ? 'error' : ''}
                        placeholder={!r.supplier_id ? "Válassz beszállítót" : ""}
                        popupMatchSelectWidth={false}
                        styles={{ popup: { root: { minWidth: 300, maxWidth: 500 } } }}
                        popupRender={(menu) => (
                            <>
                                {menu}
                                <div style={{ padding: '8px', borderTop: '1px solid #e8e8e8' }}>
                                    <Button type="link" icon={<PlusOutlined />} block onClick={() => {
                                        window.open('/crm/companies?action=create&preset=supplier', '_blank');
                                    }}>Új beszállító</Button>
                                </div>
                            </>
                        )}
                    >
                        {suppliers.map(s => (
                            <Select.Option key={s.id} value={s.id} label={s.name} shortLabel={s.name.length > 20 ? `${s.name.substring(0, 20)}...` : s.name}>
                                {s.name}
                            </Select.Option>
                        ))}
                    </Select>
                 )}
            </div>
        );
    }},
    { title: '', key: 'dup', width: 40, render: (_: any, r: CostItem) => <Button size="small" icon={<CopyOutlined />} title="Másolás" onClick={() => setCostItems(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: Date.now() + Math.random() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    })} /> },
    { title: '', key: 'action', width: 50, render: (_: any, r: CostItem) => <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setCostItems(prev => prev.filter(x => x.id !== r.id))} /> }
  ];

  // const totalCost = costItems.reduce((acc, curr) => acc + (Number(curr.cost_price) || 0), 0);
  // const totalSelling = costItems.reduce((acc, curr) => acc + (Number(curr.selling_unit_price) || 0), 0);
  // Replaced by displayedTotals
  const { totalCost, totalSelling, unitCost, unitSelling, quantity } = displayedTotals;
  const totalProfit = totalSelling - totalCost;

  const handleInternalCancel = () => {
        if (hasEditorChanges()) {
      Modal.confirm({
        title: 'Biztos, hogy mentés nélkül be akarja zárni?',
        icon: <ExclamationCircleOutlined />,
        content: 'A módosítások elvesznek.',
        okText: 'Igen',
        cancelText: 'Mégse',
        onOk: () => {
          onCancel();
        },
      });
    } else {
      onCancel();
    }
  };

  const customFooter = [
    <Button key="cancel" onClick={handleInternalCancel}>Visszavonás</Button>,
    <Button key="createOffer" onClick={() => {
        postActionRef.current = 'createOffer';
        handleOk();
    }}>Új ajánlat készítése</Button>,
    <Button key="submit" type="primary" loading={submitting} onClick={() => {
        postActionRef.current = null;
        handleOk();
    }}>Mentés</Button>
  ];

  return (
    <Modal open={open} onCancel={handleInternalCancel} footer={customFooter} title={editingProduct ? "Egyedi Gyártás szerkesztése" : "Új Egyedi Gyártás"} width={1100} destroyOnHidden>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            {
                key: '1',
                label: 'Alapadatok',
                children: (
                  <Form layout="vertical" form={form} onValuesChange={(changed) => {
                      if ('quantity' in changed) {
                          // Force re-render/re-calc
                          setCostItems([...costItems]); // Trigger effect deps
                          setTimeout(calculateWeightFromDimensions, 0);
                      }
                  }}>
                     {editingProduct && editingProduct._from_calculator && (
                        <div style={{ marginBottom: 16, padding: 12, border: '1px solid #1890ff', borderRadius: 6, background: '#e6f7ff' }}>
                            <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Space>
                                    <CalculatorOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                                    <div>
                                        <strong>Kalkulátorból generálva</strong>
                                        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
                                        Ez az űrlap a kalkulátor adataival lett előtöltve.
                                        </div>
                                    </div>
                                </Space>
                                {editingProduct._calculator_state && (
                                    <Button 
                                        size="small" 
                                        type="primary" 
                                        onClick={() => {
                                            try {
                                                const stateStr = editingProduct._calculator_state;
                                                // If it's already an object (passed via memory), handle it, otherwise parse string
                                                const stateObj = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
                                                localStorage.setItem('calculator_restore_data', JSON.stringify(stateObj));
                                                
                                                if (stateObj.templateId) {
                                                    window.open(`/manufacturing/calculator/${stateObj.templateId}?restore=true`, '_blank');
                                                } else {
                                                    message.error('Hiányzó sablon azonosító');
                                                }
                                            } catch(e) {
                                                console.error(e);
                                                message.error('Hiba a kalkulátor megnyitásakor');
                                            }
                                        }}
                                    >
                                        Kalkulátor megnyitása
                                    </Button>
                                )}
                            </Space>
                        </div>
                     )}
                     {/* ── Alap adatok ─────────────────────────────────────── */}
                     <div style={{ background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8, padding: '8px 14px 12px', marginBottom: 10 }}>
                       <div style={{ fontSize: 11, fontWeight: 600, color: '#2f54eb', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alap adatok</div>
                       <Row gutter={[8, 4]}>
                         <Col xs={24} md={16}>
                           <Form.Item label="Név" name="name" rules={[{ required: true }]} style={{ marginBottom: 6 }}>
                             <Input />
                           </Form.Item>
                         </Col>
                         <Col xs={24} md={6}>
                           <Form.Item label="Cikkszám" name="code" rules={[{ required: true }]} style={{ marginBottom: 6 }}>
                             <Input onBlur={handleCodeBlur} />
                           </Form.Item>
                         </Col>
                         <Col xs={24} md={2} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                           <Button onClick={generateCode} size="small">Generál</Button>
                         </Col>
                       </Row>
                       <Row gutter={[8, 4]}>
                         <Col xs={24} md={8}>
                           <Form.Item label="Mennyiség" style={{ marginBottom: 6 }}>
                             <Space.Compact style={{ width: '100%' }}>
                               <Form.Item name="quantity" initialValue={1} noStyle>
                                 <NumInput min={0.01} style={{ width: '100%' }} disabled={isFixedQuantity} />
                               </Form.Item>
                               <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 8, border: '1px solid #d9d9d9', borderLeft: 0, backgroundColor: '#fafafa', borderTopRightRadius: 6, borderBottomRightRadius: 6 }}>
                                 <Checkbox checked={isFixedQuantity} onChange={e => setIsFixedQuantity(e.target.checked)} style={{ marginRight: 8 }}>fix</Checkbox>
                               </div>
                             </Space.Compact>
                           </Form.Item>
                         </Col>
                         <Col xs={24} md={8}>
                           <Form.Item label="Egység" name="quantity_unit" initialValue="db" style={{ marginBottom: 6 }}>
                             <Input placeholder="pl. db" />
                           </Form.Item>
                         </Col>
                       </Row>
                     </div>

                     {/* ── Státusz ──────────────────────────────────────────── */}
                     <div style={{ background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 8, padding: '8px 14px 12px', marginBottom: 10 }}>
                       <div style={{ fontSize: 11, fontWeight: 600, color: '#722ed1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Státusz</div>
                       <Form.Item name="status" initialValue="quote_request_open" noStyle>
                         <Input type="hidden" style={{ display: 'none' }} />
                       </Form.Item>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                         {(() => {
                           const menuItems = Object.entries(STATUS_LABELS)
                             .filter(([key]) => key !== watchedStatus)
                             .map(([key, label]) => ({
                               key,
                               label: <Tag color={STATUS_COLORS[key] || 'default'}>{label}</Tag>,
                               onClick: () => { form.setFieldValue('status', key); setStatusDropdownOpen(false); },
                             }));
                           return (
                             <Dropdown
                               menu={{ items: menuItems }}
                               open={statusDropdownOpen}
                               onOpenChange={(o) => { if (!o) setStatusDropdownOpen(false); }}
                               trigger={[]}
                             >
                               <Tag
                                 color={STATUS_COLORS[watchedStatus] || 'default'}
                                 style={{ cursor: 'pointer', userSelect: 'none', fontSize: 14, padding: '4px 12px' }}
                                 onMouseDown={(e) => {
                                   e.stopPropagation();
                                   statusLongTriggered.current = false;
                                   statusPressTimer.current = setTimeout(() => {
                                     statusLongTriggered.current = true;
                                     setStatusDropdownOpen(true);
                                   }, 600);
                                 }}
                                 onMouseUp={() => { if (statusPressTimer.current) clearTimeout(statusPressTimer.current); }}
                                 onMouseLeave={() => { if (statusPressTimer.current) clearTimeout(statusPressTimer.current); }}
                               >
                                 {STATUS_LABELS[watchedStatus] || watchedStatus || '-'}
                               </Tag>
                             </Dropdown>
                           );
                         })()}
                         <span style={{ fontSize: 12, color: '#888' }}>Hosszan nyomva a státusz megváltoztatható</span>
                       </div>
                     </div>

                     {/* ── Ügyfél ───────────────────────────────────────────── */}
                     <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
                       <div style={{ fontSize: 11, fontWeight: 600, color: '#389e0d', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ügyfél</div>
                       <Row gutter={[8, 4]}>
                         <Col xs={24} md={8}>
                           <Form.Item label="Cég" name="company_id" style={{ marginBottom: 6 }}>
                             <Select
                               showSearch
                               allowClear
                               optionFilterProp="label"
                               placeholder="Válassz céget"
                               onChange={async (val) => {
                                 form.setFieldValue('contact_ids', []);
                                 if (val) {
                                   try {
                                     const res: any = await crmService.getContactsByCompany(val);
                                     setContacts((res.results ?? res) || []);
                                   } catch {}
                                 } else {
                                   setContacts([]);
                                 }
                               }}
                             >
                               {(customers || []).map((c: any) => (
                                 <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
                               ))}
                             </Select>
                           </Form.Item>
                         </Col>
                         <Col xs={24} md={16}>
                           <Form.Item label="Kapcsolattartók" name="contact_ids" style={{ marginBottom: 6 }}>
                             <Select
                               mode="multiple"
                               allowClear
                               showSearch
                               optionFilterProp="label"
                               placeholder="Válassz kapcsolattartókat"
                               options={(contacts || []).map((p: any, idx: number) => {
                                 const name = [p.last_name, p.first_name].filter(Boolean).join(' ').trim() || p.name || p.email || String(idx);
                                 return { value: String(p.id ?? idx), label: name };
                               })}
                             />
                           </Form.Item>
                         </Col>
                       </Row>
                     </div>

                     {/* ── Leírás ───────────────────────────────────────────── */}
                     <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '8px 14px 4px', marginBottom: 10 }}>
                       <div style={{ fontSize: 11, fontWeight: 600, color: '#d48806', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leírás</div>
                       <Row gutter={[8, 4]}>
                         <Col span={12}>
                           <Form.Item label="Leírás" name="description" style={{ marginBottom: 6 }} getValueFromEvent={(v) => v}>
                             <ReactQuill theme="snow" className="pixi-quill-resizable" />
                           </Form.Item>
                         </Col>
                         <Col span={12}>
                           <Form.Item label="Belső leírás" name="internal_description" style={{ marginBottom: 6 }} getValueFromEvent={(v) => v}>
                             <ReactQuill theme="snow" className="pixi-quill-resizable" />
                           </Form.Item>
                         </Col>
                       </Row>
                     </div>

                     <Row gutter={16} style={{ marginBottom: 24, background: '#fafafa', padding: 12, borderRadius: 4 }}>
                         <Col span={8}>
                             <span style={{ display: 'block', color: '#666', fontSize: 12 }}>Egységár (Eladási):</span>
                             <span style={{ fontSize: 16, fontWeight: 'bold' }}>{unitSelling.toFixed(2)} HUF</span>
                         </Col>
                         <Col span={8}>
                             <span style={{ display: 'block', color: '#666', fontSize: 12 }}>Összesen ár (Eladási):</span>
                             <span style={{ fontSize: 16, fontWeight: 'bold' }}>{totalSelling.toFixed(2)} HUF</span>
                         </Col>
                         <Col span={8}>
                             <span style={{ display: 'block', color: '#666', fontSize: 12 }}>Haszon:</span>
                             <span style={{ fontSize: 16, fontWeight: 'bold', color: totalProfit >= 0 ? 'green' : 'red' }}>{totalProfit.toFixed(2)} HUF</span>
                         </Col>
                     </Row>
                     <Row gutter={16}>
                        <Col span={6}><Form.Item label="Szélesség" name="width"><NumInput style={{width:'100%'}} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Hosszúság" name="length"><NumInput style={{width:'100%'}} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Magasság" name="height"><NumInput style={{width:'100%'}} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Mértékegység" name="dimension_unit" initialValue="mm">
                            <Select onChange={() => calculateWeightFromDimensions()}>
                                <Select.Option value="mm">mm</Select.Option>
                                <Select.Option value="cm">cm</Select.Option>
                                <Select.Option value="m">m</Select.Option>
                            </Select>
                        </Form.Item></Col>
                     </Row>
                     
                     <div style={{ marginBottom: 16, padding: '8px 0', borderTop: '1px solid #eee' }}>
                         <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                            <Checkbox checked={dimensionsPerUnit} onChange={(e) => { 
                                setDimensionsPerUnit(e.target.checked); 
                                setTimeout(calculateWeightFromDimensions, 0); 
                            }}>
                                Méretek egy egységre vonatkoznak
                            </Checkbox>
                            <span>Egység térfogat: <b>{calculatedVolumes.unit.toFixed(6)} m³</b></span>
                            <span>Összes térfogat: <b>{calculatedVolumes.total.toFixed(6)} m³</b></span>
                         </div>
                         {calculatedTotalDims && (
                           <div style={{ display: 'flex', gap: 24, alignItems: 'center', fontSize: 13, color: '#1890ff' }}>
                             {dimensionsPerUnit ? (
                               <span>Össz. méret ({quantity} db): <b>{calculatedTotalDims.width} × {calculatedTotalDims.length} × {calculatedTotalDims.height} {calculatedTotalDims.unit}</b></span>
                             ) : (
                               <span>Egység méret (1/{quantity} db): <b>{calculatedTotalDims.width} × {calculatedTotalDims.length} × {calculatedTotalDims.height} {calculatedTotalDims.unit}</b></span>
                             )}
                           </div>
                         )}
                     </div>

                     <Row gutter={16}>
                        <Col span={6}><Form.Item label="Fajsúly" name="specific_weight"><NumInput style={{width:'100%'}} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Fajsúly egység" name="specific_weight_unit" initialValue="kg/m3">
                            <Select onChange={() => calculateWeightFromDimensions()}>
                                <Select.Option value="kg/m3">kg/m³</Select.Option>
                                <Select.Option value="g/cm3">g/cm³</Select.Option>
                                <Select.Option value="kg/liter">kg/liter</Select.Option>
                            </Select>
                        </Form.Item></Col>
                     </Row>
                     <Row gutter={16}>
                        <Col span={6}><Form.Item label="Egység súly" name="unit_weight"><NumInput style={{width:'100%'}} onChange={(v) => calculateDimensionsFromWeight(v, true)} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Összesen súly" name="total_weight"><NumInput style={{width:'100%'}} onChange={(v) => calculateDimensionsFromWeight(v, false)} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Súly egység" name="weight_unit" initialValue="kg">
                             <Select onChange={() => calculateWeightFromDimensions()}>
                                <Select.Option value="g">g</Select.Option>
                                <Select.Option value="kg">kg</Select.Option>
                                <Select.Option value="t">t</Select.Option>
                            </Select>
                        </Form.Item></Col>
                     </Row>
                  </Form>
                )
            },
            {
                key: '2',
                label: 'Beszállítók és árkalkuláció',
                children: (
                    <div>
                        <Space style={{ marginBottom: 16 }}>
                            <Form.Item label="Mennyiség" name="quantity" style={{ marginBottom: 0, width: 200 }}> 
                               <NumInput min={0.01} style={{ width: '100%' }} prefix="Mennyiség:" />
                             </Form.Item>
                            <Button icon={<PlusOutlined />} onClick={() => handleAddCost('material')}>Alapanyag/Termék</Button>
                            <Button icon={<PlusOutlined />} onClick={() => handleAddCost('service')}>Szolgáltatás</Button>
                            <Button icon={<PlusOutlined />} onClick={() => handleAddCost('other')}>Egyéb költség</Button>
                        </Space>
                        <Table 
                            dataSource={costItems} 
                            columns={[
                                { title: '', key: 'is_per_unit', width: 40, render: (_: any, r: CostItem) => (
                                    <div title="Egységre vonatkozik?">
                                      <input type="checkbox" checked={!!r.is_per_unit} onChange={(e) => updateCostItem(r.id, 'is_per_unit', e.target.checked)} />
                                    </div>
                                )}, 
                                ...costColumns
                            ]} 
                            pagination={false} 
                            rowKey="id" 
                            scroll={{ x: 1000 }} 
                            size="small"
                        />
                        <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 24, fontWeight: 'bold' }}>
                                <span>Mennyiség: {quantity}</span>
                                <span>Összes bekerülési: {totalCost.toFixed(2)} HUF</span>
                                <span>Összes eladási: {totalSelling.toFixed(2)} HUF</span>
                                <span>Haszon: {totalProfit.toFixed(2)} HUF</span>
                            </div>
                            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#666' }}>
                                <span>Egység bekerülési: {unitCost.toFixed(2)} HUF</span>
                                <span>Egység eladási: {unitSelling.toFixed(2)} HUF</span>
                            </div>
                        </div>
                    </div>
                )
            },
            {
                key: 'calculator',
                label: 'Kalkulátor',
                children: (
                    <div style={{ padding: 16 }}>
                        <Form.Item label="Kalkulátor sablon">
                            <Select 
                                placeholder="Válasszon sablont" 
                                onChange={(val) => setSelectedTemplateId(val)}
                                value={selectedTemplateId}
                                showSearch
                                optionFilterProp="children"
                            >
                                {calculatorTemplates.map(t => (
                                    <Select.Option key={t.id} value={t.id}>
                                        {t.name} ({t.code})
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                        
                        {selectedTemplateId && (() => {
                            const template = calculatorTemplates.find(t => t.id === selectedTemplateId);
                            if (!template) return null;
                            
                            const cat = CALCULATOR_CATEGORIES.find(c => c.value === template.category);
                            
                            return (
                                <div style={{ border: '1px solid #eee', padding: 16, borderRadius: 8, background: '#fafafa' }}>
                                    <div style={{ marginBottom: 16 }}>
                                        <Tag color={cat?.color}>{cat?.label || template.category}</Tag>
                                        <Tag>{CALCULATOR_TYPES.find(t => t.value === template.calculator_type)?.label || template.calculator_type}</Tag>
                                        <span>{template.description}</span>
                                    </div>
                                    
                                    {/* Specialized Inputs based on Type */}
                                    {template.calculator_type === 'sheet_print' && (
                                        <div>
                                            <h4>Íves nyomtatás paraméterek</h4>
                                            <Row gutter={16}>
                                                <Col span={12}>
                                                    <Form.Item label="Papír méret">
                                                        <Select defaultValue="SRA3">
                                                            <Select.Option value="A4">A4 (210x297)</Select.Option>
                                                            <Select.Option value="A3">A3 (297x420)</Select.Option>
                                                            <Select.Option value="SRA3">SRA3 (320x450)</Select.Option>
                                                        </Select>
                                                    </Form.Item>
                                                </Col>
                                                <Col span={12}>
                                                    <Form.Item label="Papír típus">
                                                        <Select 
                                                            placeholder="Válasszon papírt"
                                                            onChange={(val) => setCalculatorState((prev: any) => ({ ...prev, material_id: val }))}
                                                            value={calculatorState.material_id}
                                                        >
                                                            {template.allowed_materials_details?.map((m: any) => (
                                                                <Select.Option key={m.id} value={m.id}>{m.name}</Select.Option>
                                                            ))}
                                                        </Select>
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                        </div>
                                    )}
                                    
                                    {template.calculator_type === 'roll_print' && (
                                        <div>
                                            <h4>Tekercses nyomtatás paraméterek</h4>
                                             <Row gutter={16}>
                                                <Col span={12}>
                                                    <Form.Item label="Média típus">
                                                        <Select 
                                                            placeholder="Válasszon médiát"
                                                            onChange={(val) => setCalculatorState((prev: any) => ({ ...prev, material_id: val }))}
                                                            value={calculatorState.material_id}
                                                        >
                                                            {template.allowed_materials_details?.map((m: any) => (
                                                                <Select.Option key={m.id} value={m.id}>{m.name}</Select.Option>
                                                            ))}
                                                        </Select>
                                                    </Form.Item>
                                                </Col>
                                                 <Col span={12}>
                                                    <Form.Item label="Tekercs szélesség (mm)">
                                                        <NumInput style={{ width: '100%' }} />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                        </div>
                                    )}

                                     {template.calculator_type === 'generic' && (
                                        <div>
                                            <p>Általános kalkuláció esetén használja a költség tételeket az Alapadatok fülön, vagy konfiguráljon speciális mezőket a sablonban.</p>
                                        </div>
                                    )}
                                    
                                    <div style={{ marginTop: 16 }}>
                                        <Button type="primary" onClick={handleCalculate}>Kiszámol és Alkalmaz</Button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )
            }
        ]} />
    </Modal>
  );
};

export default ManufacturingProductEditorModal;
