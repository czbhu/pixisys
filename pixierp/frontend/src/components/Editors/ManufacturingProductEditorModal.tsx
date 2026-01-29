import React, { useEffect, useState, useMemo } from 'react';
import { Modal, Form, Input, InputNumber, Select, message, Tabs, Button, Space, Table, Popconfirm, Row, Col, Checkbox } from 'antd';
import { PlusOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { manufacturingService, ProductClass, Project } from '../../services/manufacturingService';
import { crmService } from '../../services/crmService';
import { salesService } from '../../services/salesService';
import { hrService } from '../../services/hrService';
import api from '../../services/api';

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

const ManufacturingProductEditorModal: React.FC<Props> = ({ open, onCancel, onCreated, customer, editingProduct }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [productClasses, setProductClasses] = useState<ProductClass[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
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
  const [isFixedQuantity, setIsFixedQuantity] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
      form.resetFields();
      setCostItems([]);
      setActiveTab('1');
      setDimensionsPerUnit(true);
      setCalculatedVolumes({ unit: 0, total: 0 });
      setIsFixedQuantity(false);
      
      if (editingProduct) {
          setIsFixedQuantity(editingProduct.is_fixed_quantity || false);
          // Fill form from editingProduct
          
          let selectedIds: string[] = [];
          
          if (editingProduct.allowed_companies_data) {
              selectedIds.push(...editingProduct.allowed_companies_data.map((c: any) => `company_${c.id}`));
          }
          
          if (editingProduct.allowed_contacts_data) {
              selectedIds.push(...editingProduct.allowed_contacts_data.map((c: any) => `contact_${c.id}`));
          }
          
          // Fallback if data fields are missing but legacy fields exist (unlikely with current serializer)
          if (selectedIds.length === 0 && editingProduct.allowed_companies && Array.isArray(editingProduct.allowed_companies)) {
               selectedIds.push(...editingProduct.allowed_companies.map((id: any) => `company_${id}`));
          }
          
          form.setFieldsValue({
              ...editingProduct,
              customer_ids: selectedIds,
              customer_id: undefined, // Deprecated
              project_id: editingProduct.project, // check field name in MP
              product_class_id: editingProduct.product_class, // check field name
          });
          // Also date fields usually moment/dayjs
          if (editingProduct.date) form.setFieldValue('date', dayjs(editingProduct.date));
          if (editingProduct.deadline) form.setFieldValue('deadline', dayjs(editingProduct.deadline));
          
          if (editingProduct.cost_items && Array.isArray(editingProduct.cost_items)) {
              setCostItems(editingProduct.cost_items.map((c: any) => ({
                  ...c,
                  id: c.id || Date.now() + Math.random(),
                  supplier_id: c.supplier || c.supplier_id, // Map supplier FK to supplier_id
                  department_id: c.department || c.department_id,
                  is_internal: c.is_internal || false
              })));
          }
      } else {
        form.setFieldsValue({
            status: 'quote_request_open',
            quantity: 1,
            quantity_unit: 'db',
            dimension_unit: 'mm',
            customer_ids: customer ? [`company_${customer.id}`] : [],
        });
      }
    }
  }, [open, customer, editingProduct]);

  const loadData = async () => {
    try {
      const [pcs, projs, custs, contactsRes, matsRes, servsRes, suppsRes, prodsRes, deptsRes] = await Promise.all([
        manufacturingService.getProductClasses(),
        manufacturingService.getOpenProjects(),
        crmService.getCompanies(),
        crmService.getContacts(),
        api.get('/warehouse/materials/?filter_type=all&page_size=1000'), 
        salesService.getServices(),
        api.get('/crm/companies/?is_supplier=true&page_size=1000'),
        api.get('/manufacturing/products/?page_size=10000'),
        hrService.getDepartments(),
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
    } catch (e) {
      console.error(e);
    }
  };

  const calculateWeightFromDimensions = () => {
    const width = form.getFieldValue('width');
    const length = form.getFieldValue('length');
    const height = form.getFieldValue('height');
    const dimensionUnit = form.getFieldValue('dimension_unit') || 'mm';
    const specificWeight = form.getFieldValue('specific_weight');
    const specificWeightUnit = form.getFieldValue('specific_weight_unit') || 'kg/m3';
    const qty = form.getFieldValue('quantity') || 1;

    if ((!width || !length) && (!height)) return;

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
    } else {
        tVol = baseVolumeM3;
        uVol = qty > 0 ? baseVolumeM3 / qty : 0;
    }
    setCalculatedVolumes({ unit: uVol, total: tVol });

    // Calculate Weight
    let calculatedWeight = 0; // This will trigger 'total_weight' update or 'unit_weight' update? let's update fields

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
          weight_unit: 'kg' // Common unit
      });
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
    const custIds = form.getFieldValue('customer_ids');

    // Név-Ügyfél(első 5 karakter)-001(növekvő sorszám)
    
    // Alap: Név normalizálva
    let base = (name.substring(0, 10)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!base) base = 'GEN';

    let custPart = '';
    if (custIds && custIds.length > 0) {
      const c = customers.find(x => x.id === custIds[0]);
      if (c && c.name) {
        custPart = c.name.substring(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, '');
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
      
      let rawIds = form.getFieldValue('customer_ids');
      if (!Array.isArray(rawIds)) {
          if (rawIds) rawIds = [rawIds];
          else rawIds = [];
      }
      
      const allowedCompaniesPayload: any[] = [];
      const allowedContactsPayload: any[] = [];
      
      rawIds.forEach((idVar: any) => {
          let strVal = String(idVar);
          // Handle potential labelInValue objects
          if (typeof idVar === 'object' && idVar !== null && 'value' in idVar) {
              strVal = String(idVar.value);
          }
          
          if (strVal.startsWith('company_')) {
              allowedCompaniesPayload.push(strVal.replace('company_', ''));
          } else if (strVal.startsWith('contact_')) {
              allowedContactsPayload.push(strVal.replace('contact_', ''));
          } else {
              // Legacy/Fallback
              allowedCompaniesPayload.push(strVal);
          }
      });

      // Force alert debugging
      console.log('Final payload allowed_companies:', allowedCompaniesPayload);
      console.log('Final payload allowed_contacts:', allowedContactsPayload);
      console.log('Raw IDs:', rawIds);
      
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
      onCreated(created);
      form.resetFields();
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
                            : (Number(found.base_price) || 0);

                        // Use CURRENT markup/selling from found item
                        // For Material: markup_percentage, unit_selling_price
                        // For Service: markup_percentage(?), or just base_price as cost and calc?
                        
                        let mu = 30;
                        let sellUnit = costPrice * 1.3;
                        
                        if (isMat) {
                             if (found.markup_percentage) mu = Number(found.markup_percentage);
                             if (found.unit_selling_price) sellUnit = Number(found.unit_selling_price);
                             else sellUnit = costPrice * (1 + mu / 100);
                        } else {
                            // Service usually has base_price (net). 
                            // If it has specific markup, use it.
                            // If base_price is Selling Price? ServiceEditor usually treats base_price as Net Price.
                            // Let's assume standard logic unless service has markup field.
                            // Services in salesService/getServices result don't typically have markup, 
                            // but let's assume valid default.
                        }
                        
                        updateCostItem(r.id, 'unit', unit);
                        updateCostItem(r.id, 'unit_price', costPrice); // Beszerzési
                        updateCostItem(r.id, 'cost_price', costPrice); 
                        updateCostItem(r.id, 'markup_percent', mu);
                        updateCostItem(r.id, 'selling_unit_price', sellUnit);
                        updateCostItem(r.id, 'selling_price', sellUnit * (r.quantity || 1));
                    }
                }}
            >
                {list.map((m: any) => <Select.Option key={m.id} value={m.id} label={m.name}>{m.name}</Select.Option>)}
            </Select>
        );
    }},
    { title: 'Típus', dataIndex: 'type', key: 'type', width: 90, render: (t: string) => t === 'material' ? 'Alapanyag' : t === 'service' ? 'Szolgáltatás' : 'Egyéb' },
    { title: 'Menny.', key: 'quantity', width: 70, render: (_: any, r: CostItem) => <InputNumber value={r.quantity} onChange={v => updateCostItem(r.id, 'quantity', v)} min={0} controls={false} /> },
    { title: 'Egység', key: 'unit', width: 70, render: (_: any, r: CostItem) => r.type === 'other' ? <Input value={r.unit} onChange={e => updateCostItem(r.id, 'unit', e.target.value)} /> : r.unit },
    { title: 'Beker. ár', key: 'cost_price', width: 90, render: (_: any, r: CostItem) => <InputNumber value={r.cost_price} onChange={v => updateCostItem(r.id, 'cost_price', v)} disabled={r.type !== 'other'} controls={false} /> }, 
    { title: 'Haszon %', key: 'markup_percent', width: 70, render: (_: any, r: CostItem) => <InputNumber value={r.markup_percent} onChange={v => updateCostItem(r.id, 'markup_percent', v)} disabled={r.type !== 'other'} controls={false} precision={2} /> },
    { title: 'Eladási e.ár', key: 'selling_unit_price', width: 90, render: (_: any, r: CostItem) => <InputNumber value={r.selling_unit_price} onChange={v => updateCostItem(r.id, 'selling_unit_price', v)} disabled={r.type !== 'other'} controls={false} /> },
    { title: 'Beszállító', key: 'supplier_id', width: 260, render: (_: any, r: CostItem) => {
        if (r.type !== 'other') return null;
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
                        dropdownStyle={{ minWidth: 300, maxWidth: 500 }}
                        dropdownRender={(menu) => (
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
                        {suppliers.slice(0, 50).map(s => (
                            <Select.Option key={s.id} value={s.id} label={s.name} shortLabel={s.name.length > 20 ? `${s.name.substring(0, 20)}...` : s.name}>
                                {s.name}
                            </Select.Option>
                        ))}
                    </Select>
                 )}
            </div>
        );
    }},
    { title: '', key: 'action', width: 50, render: (_: any, r: CostItem) => <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setCostItems(prev => prev.filter(x => x.id !== r.id))} /> }
  ];

  // const totalCost = costItems.reduce((acc, curr) => acc + (Number(curr.cost_price) || 0), 0);
  // const totalSelling = costItems.reduce((acc, curr) => acc + (Number(curr.selling_unit_price) || 0), 0);
  // Replaced by displayedTotals
  const { totalCost, totalSelling, unitCost, unitSelling, quantity } = displayedTotals;
  const totalProfit = totalSelling - totalCost;

  const handleInternalCancel = () => {
    if (form.isFieldsTouched()) {
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

  return (
    <Modal open={open} onCancel={handleInternalCancel} onOk={handleOk} confirmLoading={submitting} title={editingProduct ? "Egyedi Gyártás szerkesztése" : "Új Egyedi Gyártás"} width={1100} destroyOnHidden>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            {
                key: '1',
                label: 'Alapadatok',
                children: (
                  <Form layout="vertical" form={form} onValuesChange={(changed) => {
                      if ('quantity' in changed) {
                          // Force re-render/re-calc
                          setCostItems([...costItems]); // Trigger effect deps
                      }
                  }}>
                     <Form.Item label="Név" name="name" rules={[{ required: true }]}>
                       <Input />
                     </Form.Item>
                     <div style={{ display: 'flex', gap: 8 }}>
                        <Form.Item label="Cikkszám" name="code" rules={[{ required: true }]} style={{ flex: 1 }}>
                            <Input onBlur={handleCodeBlur} />
                        </Form.Item>
                        <Button style={{ marginTop: 30 }} onClick={generateCode}>Generál</Button>
                     </div>
                     <Form.Item label="Ügyfél" name="customer_ids">
                        <Select 
                            mode="multiple"
                            showSearch 
                            placeholder="Válasszon ügyfeleket (üres = mindenki)"
                            optionFilterProp="label"
                            options={customerOptions}
                            onChange={(val) => console.log('Customer Select Change:', val)}
                        />
                     </Form.Item>
                     <Row gutter={16}>
                        <Col span={8}>
                             <Form.Item label="Mennyiség" style={{ marginBottom: 0 }}>
                                <Space.Compact style={{ width: '100%' }}>
                                     <Form.Item name="quantity" initialValue={1} noStyle>
                                        <InputNumber min={0.01} style={{ width: '100%' }} disabled={isFixedQuantity} />
                                     </Form.Item>
                                     <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 8, border: '1px solid #d9d9d9', borderLeft: 0, backgroundColor: '#fafafa', borderTopRightRadius: 6, borderBottomRightRadius: 6 }}>
                                         <Checkbox 
                                            checked={isFixedQuantity} 
                                            onChange={e => setIsFixedQuantity(e.target.checked)}
                                            style={{ marginRight: 8 }}
                                         >
                                            fix
                                         </Checkbox>
                                     </div>
                                </Space.Compact>
                             </Form.Item>
                        </Col>
                        <Col span={8}>
                             <Form.Item label="Egység" name="quantity_unit" initialValue="db"> 
                               <Input placeholder="pl. db" />
                             </Form.Item>
                        </Col>
                         <Col span={8}>
                             <Form.Item label="Státusz" name="status" initialValue="quote_request_open"> 
                               <Select>
                                   <Select.Option value="quote_request_open">Aktív</Select.Option>
                                   <Select.Option value="cancelled">Inaktív</Select.Option>
                               </Select>
                             </Form.Item>
                        </Col>
                     </Row>

                     <Row gutter={16} style={{ marginTop: 16 }}>
                        <Col span={12}>
                            <Form.Item label="Leírás" name="description">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="Belső leírás" name="internal_description">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                     </Row>

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
                        <Col span={6}><Form.Item label="Szélesség" name="width"><InputNumber style={{width:'100%'}} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Hosszúság" name="length"><InputNumber style={{width:'100%'}} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Magasság" name="height"><InputNumber style={{width:'100%'}} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Mértékegység" name="dimension_unit" initialValue="mm">
                            <Select onChange={() => calculateWeightFromDimensions()}>
                                <Select.Option value="mm">mm</Select.Option>
                                <Select.Option value="cm">cm</Select.Option>
                                <Select.Option value="m">m</Select.Option>
                            </Select>
                        </Form.Item></Col>
                     </Row>
                     
                     <div style={{ marginBottom: 16, padding: '8px 0', borderTop: '1px solid #eee' }}>
                         <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 8 }}>
                            <Checkbox checked={dimensionsPerUnit} onChange={(e) => { 
                                setDimensionsPerUnit(e.target.checked); 
                                // Recalculate immediately after state update would require effect or forcing helper to read new value.
                                // Simplest is to pass new value to helper, but helper reads state? No, helper reads form.
                                // I updated helper to read state, so need to wait render. Using setTimeout or creating a wrapper.
                                // Better: Pass value to helper.
                                setTimeout(calculateWeightFromDimensions, 0); 
                            }}>
                                Méretek egy egységre vonatkoznak
                            </Checkbox>
                            <span>Egység térfogat: <b>{calculatedVolumes.unit.toFixed(6)} m³</b></span>
                            <span>Összes térfogat: <b>{calculatedVolumes.total.toFixed(6)} m³</b></span>
                         </div>
                     </div>

                     <Row gutter={16}>
                        <Col span={6}><Form.Item label="Fajsúly" name="specific_weight"><InputNumber style={{width:'100%'}} onChange={() => calculateWeightFromDimensions()} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Fajsúly egység" name="specific_weight_unit" initialValue="kg/m3">
                            <Select onChange={() => calculateWeightFromDimensions()}>
                                <Select.Option value="kg/m3">kg/m³</Select.Option>
                                <Select.Option value="g/cm3">g/cm³</Select.Option>
                                <Select.Option value="kg/liter">kg/liter</Select.Option>
                            </Select>
                        </Form.Item></Col>
                     </Row>
                     <Row gutter={16}>
                        <Col span={6}><Form.Item label="Egység súly" name="unit_weight"><InputNumber style={{width:'100%'}} onChange={(v) => calculateDimensionsFromWeight(v, true)} /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Összesen súly" name="total_weight"><InputNumber style={{width:'100%'}} onChange={(v) => calculateDimensionsFromWeight(v, false)} /></Form.Item></Col>
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
                               <InputNumber min={0.01} style={{ width: '100%' }} prefix="Mennyiség:" />
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
            }
        ]} />
    </Modal>
  );
};

export default ManufacturingProductEditorModal;
