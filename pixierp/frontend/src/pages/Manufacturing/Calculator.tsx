import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Form, InputNumber, Select, Button, Divider, Table, Space,
  message, Row, Col, Statistic, Radio, Tag, Input, Empty
} from 'antd';
import {
  CalculatorOutlined, SaveOutlined, PlusOutlined, DeleteOutlined, BuildOutlined, ArrowLeftOutlined, FileTextOutlined
} from '@ant-design/icons';
import api from '../../services/api';
import { manufacturingService } from '../../services/manufacturingService';

const { Option, OptGroup } = Select;

interface Material {
  id: number;
  name: string;
  code: string;
  unit: string;
  material_format: string;
  roll_width?: number; // cm
  width?: number; // cm or mm based on DB
  length?: number; // cm or mm based on DB
  sheet_division: string;
  yield_percentage: number;
  unit_cost_price: number;
  markup_percentage: number;
  unit_selling_price: number;
  currency: string;
  group_id?: number | null;
  group_name?: string | null;
  default_supplier_id?: number | null;
  default_supplier_name?: string | null;
}

interface Service {
  id: number;
  name: string;
  code: string;
  unit: string;
  unit_price: number;
  calculation_basis: string;
  category: string;
  unit_cost_price: number;
  markup_percentage: number;
  unit_selling_price: number;
  default_supplier_id?: number | null;
  default_supplier_name?: string | null;
}

interface Template {
  id: number;
  name: string;
  code: string;
  description: string;
  default_material_markup_percentage: number;
  default_service_markup_percentage: number;
  allowed_materials_details: Material[];
  allowed_services_details: Service[];
  input_fields: any[];
}

interface ItemRow {
  id: number;
  width: number;
  height: number;
  quantity: number;
}


interface SheetBatch {
  key: string;
  rowId: number;
  type: 'full' | 'partial';
  sheetCount: number;
  itemsPerSheet: number;
  totalItems: number;
  fitX: number;
  fitY: number;
  svg: React.ReactNode;
  widthMM: number;
  heightMM: number;
}

interface PackingResult {
  materialId: number;
  itemsPerSheet: number;
  sheetsNeeded: number;
  totalMaterialQty: number;
  totalCost: number;
  totalSellingPrice: number;
  svg?: React.ReactNode; // Keep for backward compatibility or simple view
  batches?: SheetBatch[]; // New detailed breakdown
  strategy: string;
  // Per row details (assuming simple layout for now, mixed layout complex)
  rowDetails?: { rowId: number, fitX: number, fitY: number, sheets: number }[];
  materialWidthMM?: number;
  materialHeightMM?: number;
  sheetBreakdownText?: string;
  utilizationPercent?: number;
  totalSheetAreaM2?: number;
}

interface SelectedMaterial extends PackingResult {
  material_name: string;
  unit: string;
  unit_cost_price: number;
  markup_percentage: number;
  unit_selling_price: number;
  is_group_selection: boolean;
  default_supplier_id?: number | null;
  default_supplier_name?: string | null;
  selected_group_id?: number | null;
  selected_group_name?: string | null;
  // User overrides
  userFitX?: number; // Force columns (global or first batch)
  userFitY?: number; // Force rows
  batchOverrides?: Record<string, { fitX: number, fitY: number }>; // Per-batch overrides
  assignedRowIds?: number[]; // Which rows apply to this material
}

interface SelectedService {
  service_id: number;
  service_name: string;
  quantity: number;
  unit: string;
  unit_cost_price: number;
  markup_percentage: number;
  unit_selling_price: number;
  calculated_price: number;
  default_supplier_id?: number | null;
  default_supplier_name?: string | null;
}

const Calculator: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (searchParams.get('restore') === 'true') {
        try {
            const data = localStorage.getItem('calculator_restore_data');
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed.rows) setRows(parsed.rows);
                if (parsed.inputUnit) setInputUnit(parsed.inputUnit);
                if (parsed.gapX) setGapX(parsed.gapX);
                if (parsed.gapY) setGapY(parsed.gapY);
                if (parsed.arrangementStrategy) setArrangementStrategy(parsed.arrangementStrategy);
                if (parsed.selectedMaterials) setSelectedMaterials(parsed.selectedMaterials);
                if (parsed.selectedServices) setSelectedServices(parsed.selectedServices);
                message.info('Kalkuláció adatok visszaállítva');
            }
        } catch (e) {
            console.error('Failed to restore', e);
        }
    }
  }, [searchParams]);

  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Inputs
  const [inputUnit, setInputUnit] = useState<'mm' | 'cm' | 'm'>('cm');
  const [rows, setRows] = useState<ItemRow[]>([{ id: Date.now(), width: 0, height: 0, quantity: 1 }]);
  
  // Advanced configuration
  const [gapX, setGapX] = useState<number>(0); // mm
  const [gapY, setGapY] = useState<number>(0); // mm
  const [arrangementStrategy, setArrangementStrategy] = useState<'best' | 'width' | 'length' | 'optimal'>('best');

  // Selected items
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterial[]>([]);
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  // Totals
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
    recalculateAllMaterials();
  }, [rows, inputUnit, gapX, gapY, arrangementStrategy, template]);

  useEffect(() => {
    // Basic service recalc based on first row or total area logic, needs refinement for multi-row
    // For now, keeping semantic search like structure
  }, [rows, inputUnit, selectedMaterials]);

  useEffect(() => {
    calculateTotals();
  }, [selectedMaterials, selectedServices]);

  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/manufacturing/calculator-templates/${templateId}/`);
      setTemplate(response.data);
    } catch (error) {
      message.error('Hiba a sablon betöltésekor');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toMM = (val: number) => {
    if (inputUnit === 'm') return val * 1000;
    if (inputUnit === 'cm') return val * 10;
    return val;
  };

  const toMeters = (val: number) => {
    if (inputUnit === 'mm') return val / 1000;
    if (inputUnit === 'cm') return val / 100;
    return val;
  };

  const materialGroups = useMemo(() => {
    if (!template) return { groups: {}, ungrouped: [] };
    const groups: Record<string, Material[]> = {};
    const ungrouped: Material[] = [];
    
    template.allowed_materials_details.forEach(m => {
      if (m.group_id && m.group_name) {
        if (!groups[m.group_name]) groups[m.group_name] = [];
        groups[m.group_name].push(m);
      } else {
        ungrouped.push(m);
      }
    });
    return { groups, ungrouped };
  }, [template]);

  const calculateMaterialForRows = (material: Material, overrides?: {fitX?: number, fitY?: number}, batchOverrides?: Record<string, {fitX: number, fitY: number}>, assignedRowIds?: number[]): PackingResult => {
    let totalMaterialQty = 0;
    let totalCost = 0;
    let itemsPerSheet = 0;
    let sheetsNeeded = 0;
    let drawing: React.ReactNode = null;
    let rowDetails: any[] = [];
    let sheetBreakdownText = '';
    let utilizationPercent = 0;
    let totalSheetAreaM2 = 0;
    let batches: SheetBatch[] = [];

    const matWidthMM = (material.width || 0) * 10;
    const matLengthMM = (material.length || 0) * 10;
    const rollWidthMM = (material.roll_width || 0) * 10;
    const yieldFactor = (material.yield_percentage || 100) / 100;

    if (material.material_format === 'sheet' && matWidthMM > 0 && matLengthMM > 0) {
      let grandTotalSheets = 0;
      let usedAreaMM2 = 0;
      let totalSheetAreaMM2 = 0;

      rows.forEach((row, rIdx) => {
        if (!row.width || !row.height || !row.quantity) return;
        if (assignedRowIds && !assignedRowIds.includes(row.id)) return;

        const itemW = toMM(row.width);
        const itemH = toMM(row.height);
        
        // Helper to calc fit
        const getFit = (w: number, h: number, forceX?: number, forceY?: number) => {
           let fx_max = Math.floor((matWidthMM + gapX) / (w + gapX));
           let fy_max = Math.floor((matLengthMM + gapY) / (h + gapY));
           
           let fx = fx_max;
           let fy = fy_max;

           if (forceX !== undefined) fx = Math.min(forceX, fx_max);
           if (forceY !== undefined) fy = Math.min(forceY, fy_max);
           else {
               if (overrides && rIdx === 0 && forceX === undefined && forceY === undefined) {
                    if (overrides.fitX) fx = Math.min(overrides.fitX, fx_max);
                    if (overrides.fitY) fy = Math.min(overrides.fitY, fy_max);
               }
           }
           
           fx = Math.max(0, fx);
           fy = Math.max(0, fy);

           return { cnt: fx * fy, fx, fy };
        };

        // Strategy Logic
        let chosenOrientation = 'normal';
        if (arrangementStrategy === 'width') chosenOrientation = 'normal';
        else if (arrangementStrategy === 'length') chosenOrientation = 'rotated';
        else {
             const norm = getFit(itemW, itemH);
             const rot = getFit(itemH, itemW);
             if (rot.cnt > norm.cnt) chosenOrientation = 'rotated';
        }

        const finalW = chosenOrientation === 'rotated' ? itemH : itemW;
        const finalH = chosenOrientation === 'rotated' ? itemW : itemH;
        
        const fullKey = `full_${row.id}`;
        const { cnt, fx, fy } = getFit(finalW, finalH);
        const countPerSheet = Math.max(1, cnt);
        
        const fullSheetsCount = Math.floor(row.quantity / countPerSheet);
        const remainder = row.quantity % countPerSheet;
        
        // Generate SVG helper
        const generateSvg = (fX: number, fY: number, count: number, id: string) => {
             const scale = Math.min(200 / matWidthMM, 150 / matLengthMM);
             const drawW = matWidthMM * scale;
             const drawH = matLengthMM * scale;
             const rects = [];
             rects.push(<rect key="s" x={0} y={0} width={drawW} height={drawH} fill="white" stroke="#333" strokeWidth={1} />);
             
             let drawn = 0;
             loop: for(let y=0; y<fY; y++) {
                 for(let x=0; x<fX; x++) {
                     if (drawn >= count) break loop;
                     const rx = (x * (finalW + gapX)) * scale;
                     const ry = (y * (finalH + gapY)) * scale;
                     const rw = finalW * scale;
                     const rh = finalH * scale;
                     rects.push(<rect key={`${x}-${y}`} x={rx} y={ry} width={rw} height={rh} fill={id.includes('partial') ? '#faad14' : '#1890ff'} opacity={0.8} stroke="white" strokeWidth={0.5} />);
                     
                     if (rw > 30 && rh > 15) {
                        rects.push(
                            <text key={`t-${x}-${y}`} x={rx + rw/2} y={ry + rh/2} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={9} style={{pointerEvents:'none', userSelect:'none'}}>
                                {Math.round(finalW)}x{Math.round(finalH)}
                            </text>
                        );
                     }
                     drawn++;
                 }
             }
             return (
                 <svg key={id} width={drawW+2} height={drawH+2} style={{border:'1px solid #ddd', backgroundColor:'#f0f0f0', display:'block', margin:'auto'}}>
                     {rects}
                 </svg>
             );
        };

        if (fullSheetsCount > 0) {
            grandTotalSheets += fullSheetsCount;
            batches.push({
                key: fullKey,
                rowId: row.id,
                type: 'full',
                sheetCount: fullSheetsCount,
                itemsPerSheet: countPerSheet,
                totalItems: fullSheetsCount * countPerSheet,
                fitX: fx,
                fitY: fy,
                svg: generateSvg(fx, fy, countPerSheet, fullKey),
                widthMM: matWidthMM,
                heightMM: matLengthMM
            });
            // Stats Update
            rowDetails.push({ rowId: row.id, fitX: fx, fitY: fy, sheets: fullSheetsCount });
        }

        if (remainder > 0) {
            const partialKey = `partial_${row.id}`;
            let pFx = fx;
            let pFy = fy;
            if (batchOverrides && batchOverrides[partialKey]) {
                 const bo = batchOverrides[partialKey];
                 const fit = getFit(finalW, finalH, bo.fitX, bo.fitY);
                 pFx = fit.fx;
                 pFy = fit.fy;
            }
            
            const pCountPerSheet = Math.max(1, pFx * pFy);
            const pSheetsNeeded = Math.ceil(remainder / pCountPerSheet);
            
            grandTotalSheets += pSheetsNeeded;
            
            batches.push({
                key: partialKey,
                rowId: row.id,
                type: 'partial',
                sheetCount: pSheetsNeeded,
                itemsPerSheet: pCountPerSheet,
                totalItems: remainder,
                fitX: pFx,
                fitY: pFy,
                svg: generateSvg(pFx, pFy, Math.min(remainder, pCountPerSheet), partialKey),
                widthMM: matWidthMM,
                heightMM: matLengthMM
            });
             rowDetails.push({ rowId: row.id, fitX: pFx, fitY: pFy, sheets: pSheetsNeeded, isPartial: true });
        }
        
        let breakdown = [];
        if (fullSheetsCount > 0) breakdown.push(`${fullSheetsCount} teli (${countPerSheet} db)`);
        if (remainder > 0) {
             const pb = batches.find(b => b.key === `partial_${row.id}`);
             const pSheets = pb ? pb.sheetCount : 1;
             breakdown.push(`${pSheets} tört (${remainder} db)`);
        }
        if (breakdown.length > 0) {
             if (sheetBreakdownText) sheetBreakdownText += ' | ';
             sheetBreakdownText += breakdown.join(' + ');
        }
        
        usedAreaMM2 += (row.quantity * itemW * itemH);
      });
      
      totalSheetAreaMM2 = grandTotalSheets * matWidthMM * matLengthMM;
      
      const oneSheetArea = (matWidthMM * matLengthMM) / 1000000;
      totalSheetAreaM2 = totalSheetAreaMM2 / 1000000;
      
      if (material.unit === 'db' || material.unit === 'tábla') {
          totalMaterialQty = grandTotalSheets;
      } else {
          totalMaterialQty = grandTotalSheets * oneSheetArea;
      }
      
      totalCost = totalMaterialQty * material.unit_cost_price;
      utilizationPercent = totalSheetAreaMM2 > 0 ? (usedAreaMM2 / totalSheetAreaMM2) * 100 : 0;
      
      drawing = batches.length > 0 ? batches[0].svg : null; 
      sheetsNeeded = grandTotalSheets;
    } else if (material.material_format === 'roll' && rollWidthMM > 0) {
       let totalLengthMM = 0;
       rows.forEach(row => {
          const itemW = toMM(row.width);
          const itemH = toMM(row.height);
          
          // Strategy Roll
          // Width: item width along roll width
          // Length: item width along roll length (rotated)
          
          let orient = 'normal';
          const fitX_norm = Math.floor((rollWidthMM + gapX) / (itemW + gapX));
          const fitX_rot = Math.floor((rollWidthMM + gapX) / (itemH + gapX));
          
          if (arrangementStrategy === 'width') orient = 'normal';
          else if (arrangementStrategy === 'length') orient = 'rotated';
          else {
              // Best cost
             const costNorm = fitX_norm > 0 ? (itemH / fitX_norm) : 9e9;
             const costRot = fitX_rot > 0 ? (itemW / fitX_rot) : 9e9;
             orient = costRot < costNorm ? 'rotated' : 'normal';
          }
          
          const itemsPerRow = orient === 'rotated' ? fitX_rot : fitX_norm;
          const advance = orient === 'rotated' ? (itemW + gapY) : (itemH + gapY);
          
          if (itemsPerRow === 0) {
             totalCost = Infinity; 
             return;
          }
          
          const linesNeeded = Math.ceil(row.quantity / itemsPerRow);
          totalLengthMM += linesNeeded * advance;
       });

       // Roll Visual? Can be infinite strip. Let's just output text for now or simple rect.
       // "Drawing" requested.
       // Draw a sample segment.
       const sampleH = 2000; // 2m sample
       const scale = Math.min(250 / rollWidthMM, 200 / sampleH);
       const drawW = rollWidthMM * scale;
       const drawH = sampleH * scale;
       
       drawing = (
            <svg width={drawW + 2} height={200} style={{border: '1px solid #ddd', backgroundColor:'#f0f0f0', display:'block', margin:'auto'}}>
                 <rect x={0} y={0} width={drawW} height={200} fill="white" stroke="#333" />
                 <text x={drawW/2} y={100} textAnchor="middle" fill="#999">Tekercses anyag (minta)</text>
            </svg>
       );

       const finalLengthM = (totalLengthMM / 1000) / yieldFactor;
       
       if (material.unit === 'm2') {
           totalMaterialQty = finalLengthM * (rollWidthMM / 1000);
       } else {
           totalMaterialQty = finalLengthM; 
       }
       
       totalCost = totalMaterialQty * material.unit_cost_price;

    } else {
        // Fallback Area
        let totalAreaM2 = 0;
        rows.forEach(r => {
             totalAreaM2 += (toMeters(r.width) * toMeters(r.height)) * r.quantity;
        });
        const adjustedArea = totalAreaM2 / yieldFactor;
        
        if (material.unit === 'm2') totalMaterialQty = adjustedArea;
        else if (material.unit === 'db') totalMaterialQty = Math.ceil(adjustedArea); 
        else totalMaterialQty = adjustedArea;
        
        totalCost = totalMaterialQty * material.unit_cost_price;
    }

    const mk = material.markup_percentage || template?.default_material_markup_percentage || 0;

    return {
        materialId: material.id,
        itemsPerSheet,
        sheetsNeeded,
        totalMaterialQty,
        totalCost: Number.isFinite(totalCost) ? totalCost : 0,
        totalSellingPrice: Number.isFinite(totalCost) ? totalCost * (1 + mk / 100) : 0,
        svg: drawing,
        strategy: arrangementStrategy,
        rowDetails,
        materialWidthMM: matWidthMM,
        materialHeightMM: matLengthMM,
        sheetBreakdownText,
        utilizationPercent,
        totalSheetAreaM2,
        batches
    };
  };

  const calculateTotals = () => {
     const mc = selectedMaterials.reduce((s, m) => s + (m.totalCost || 0), 0);
     const ms = selectedMaterials.reduce((s, m) => s + (m.totalSellingPrice || 0), 0);
     const sc = selectedServices.reduce((s, x) => s + (x.quantity * x.unit_cost_price), 0);
     const ss = selectedServices.reduce((s, x) => s + x.calculated_price, 0);

     setMaterialCost(mc);
     setMaterialSellingPrice(ms);
     setServiceCost(sc);
     setServiceSellingPrice(ss);
     setTotalCost(mc + sc);
     setSellingPrice(ms + ss);
  };

  const findAllMaterialsInGroup = (groupId: number) => {
      // @ts-ignore
      return template?.allowed_materials_details.filter(m => m.group_id === groupId) || [];
  };

  const recalculateAllMaterials = () => {
    setSelectedMaterials(prev => prev.map(sm => {
        let chosenMat: Material | undefined;
        let packing: PackingResult | null = null;
        
        // Preserve overrides
        const overrides = { fitX: sm.userFitX, fitY: sm.userFitY };
        const batchOverrides = sm.batchOverrides;
        const assignedRowIds = sm.assignedRowIds;

        if (sm.is_group_selection && sm.selected_group_id) {
             const candidates = findAllMaterialsInGroup(sm.selected_group_id);
             let best: { mat: Material, pack: PackingResult } | null = null;
             
             for (const mat of candidates) {
                 const p = calculateMaterialForRows(mat, overrides, batchOverrides, assignedRowIds);
                 if (p && p.totalCost < (best?.pack.totalCost ?? Infinity)) {
                     best = { mat, pack: p };
                 }
             }
             
             if (best) {
                 chosenMat = best.mat;
                 packing = best.pack;
             }
        } else {
             chosenMat = template?.allowed_materials_details.find(m => m.id === sm.materialId);
             if (chosenMat) {
                 packing = calculateMaterialForRows(chosenMat, overrides, batchOverrides, assignedRowIds);
             }
        }

        if (!chosenMat || !packing) return sm;

        const markup = sm.markup_percentage || chosenMat.markup_percentage || template?.default_material_markup_percentage || 0;
        const unitSelling = chosenMat.unit_selling_price || (chosenMat.unit_cost_price * (1 + markup / 100));

        return {
            ...sm,
            ...packing,
            materialId: chosenMat.id,
            material_name: chosenMat.name,
            unit: chosenMat.unit,
            unit_cost_price: chosenMat.unit_cost_price,
            markup_percentage: markup,
            unit_selling_price: unitSelling,
        };
    }));
  };

  const handleAddMaterial = (value: string) => {
      const [type, idStr] = value.split('_');
      const id = parseInt(idStr);
      
      // @ts-ignore
      const groupName = type === 'group' && materialGroups.groups[Object.keys(materialGroups.groups).find(k => materialGroups.groups[k][0].group_id === id)]?.[0]?.group_name;

      let newSelection: SelectedMaterial = {
          materialId: 0,
          is_group_selection: type === 'group',
          selected_group_id: type === 'group' ? id : null,
          selected_group_name: groupName,
          material_name: '',
          unit: '', 
          unit_cost_price: 0,
          markup_percentage: 0,
          unit_selling_price: 0,
          totalMaterialQty: 0,
          itemsPerSheet: 0,
          sheetsNeeded: 0,
          totalCost: 0,
          totalSellingPrice: 0,
          strategy: arrangementStrategy,
          default_supplier_id: null,
          default_supplier_name: null,
      };

      if (type === 'mat') {
          const mat = template?.allowed_materials_details.find(m => m.id === id);
          if (mat) {
             newSelection.materialId = mat.id;
             newSelection.material_name = mat.name;
             newSelection.unit = mat.unit;
             const markup = mat.markup_percentage || template?.default_material_markup_percentage || 0;
             newSelection.markup_percentage = markup;
             newSelection.unit_cost_price = mat.unit_cost_price;
             newSelection.unit_selling_price = mat.unit_selling_price || (mat.unit_cost_price * (1 + markup / 100));
             newSelection.default_supplier_id = mat.default_supplier_id;
             newSelection.default_supplier_name = mat.default_supplier_name;
             
             const pack = calculateMaterialForRows(mat);
             if (pack) Object.assign(newSelection, pack);
          }
      } else {
             const candidates = findAllMaterialsInGroup(id);
             let best: { mat: Material, pack: PackingResult } | null = null;
             for (const mat of candidates) {
                 const p = calculateMaterialForRows(mat);
                 if (p && p.totalCost < (best?.pack.totalCost ?? Infinity)) {
                     best = { mat, pack: p };
                 }
             }
             if (best) {
                 newSelection.materialId = best.mat.id;
                 newSelection.material_name = best.mat.name;
                 newSelection.unit = best.mat.unit;
                 const markup = best.mat.markup_percentage || template?.default_material_markup_percentage || 0;
                 newSelection.markup_percentage = markup;
                 newSelection.unit_cost_price = best.mat.unit_cost_price;
                 newSelection.unit_selling_price = best.mat.unit_selling_price || (best.mat.unit_cost_price * (1 + markup / 100));
                 newSelection.default_supplier_id = best.mat.default_supplier_id;
                 newSelection.default_supplier_name = best.mat.default_supplier_name;
                 newSelection.selected_group_name = best.mat.group_name;
                 Object.assign(newSelection, best.pack);
             }
      }

      setSelectedMaterials([...selectedMaterials, newSelection]);
  };

  const calculateServiceQuantity = (service: Service): number => {
    let totalQty = 0;
    
    rows.forEach(row => {
        const widthM = toMeters(row.width);
        const heightM = toMeters(row.height);
        const area = widthM * heightM;
        const perimeter = 2 * (widthM + heightM);
        const qty = row.quantity;

        switch (service.calculation_basis) {
          case 'area':
            totalQty += area * qty;
            break;
          case 'perimeter':
            totalQty += perimeter * qty;
            break;
          case 'length':
            totalQty += Math.max(widthM, heightM) * qty;
            break;
          case 'quantity':
            totalQty += qty;
            break;
          case 'fixed':
            break; 
          default:
            totalQty += qty;
        }
    });

    if (service.calculation_basis === 'fixed') return 1;
    return totalQty;
  };

  const addService = (serviceId: number) => {
    const service = template?.allowed_services_details.find(s => s.id === serviceId);
    if (!service) return;

    const qty = calculateServiceQuantity(service);
    const costPrice = Number(service.unit_cost_price) || 0;
    const markup = Number(service.markup_percentage) || template?.default_service_markup_percentage || 0;
    const sellingPrice = costPrice * (1 + markup / 100);
    const calculated_price = qty * sellingPrice;

    const newService: SelectedService = {
      service_id: service.id,
      service_name: service.name,
      quantity: qty,
      unit: service.unit,
      unit_cost_price: costPrice,
      markup_percentage: markup,
      unit_selling_price: sellingPrice,
      calculated_price,
      default_supplier_id: service.default_supplier_id,
      default_supplier_name: service.default_supplier_name,
    };

    setSelectedServices([...selectedServices, newService]);
  };

  const removeService = (index: number) => {
    setSelectedServices(selectedServices.filter((_, i) => i !== index));
  };
  
  const recalculateServices = () => {
    setSelectedServices(prev => prev.map(ss => {
      const service = template?.allowed_services_details.find(s => s.id === ss.service_id);
      if (!service) return ss;
      
      const qty = calculateServiceQuantity(service);
      const sellingPrice = ss.unit_cost_price * (1 + ss.markup_percentage / 100);
      const price = qty * sellingPrice;
      
      return {
        ...ss,
        quantity: qty,
        calculated_price: price,
        unit_selling_price: sellingPrice
      };
    }));
  };
  
  const handleCreateQuoteDirectly = async () => {
    if (selectedMaterials.length === 0 && selectedServices.length === 0) {
        message.warning('Nincs kiválasztva alapanyag vagy szolgáltatás!');
        return;
    }

    setLoading(true);
    try {
        const rowDetails = rows.map((r, i) => `${i+1}. Bemenet: ${r.width}x${r.height}${inputUnit} (${r.quantity} db)`).join('\n');
    
        const materialCostItems = selectedMaterials.map((m, i) => ({
            type: 'material',
            ref_id: m.materialId, 
            name: m.material_name,
        quantity: Number.isFinite(m.totalMaterialQty) ? m.totalMaterialQty : 0,
        unit: m.unit,
        unit_price: Number.isFinite(m.unit_cost_price) ? m.unit_cost_price : 0,
        cost_price: Number.isFinite(m.unit_cost_price) ? m.unit_cost_price : 0,
        markup_percent: Number.isFinite(m.markup_percentage) ? m.markup_percentage : 0,
        selling_unit_price: Number.isFinite(m.unit_selling_price) ? m.unit_selling_price : 0,
        selling_price: Number.isFinite(m.totalSellingPrice) ? m.totalSellingPrice : 0,
        supplier: m.default_supplier_id || null
    }));

    const serviceCostItems = selectedServices.map(s => ({
        type: 'service',
        ref_id: s.service_id, 
        name: s.service_name,
        quantity: Number.isFinite(s.quantity) ? s.quantity : 0,
        unit: s.unit,
        unit_price: Number.isFinite(s.unit_cost_price) ? s.unit_cost_price : 0,
        cost_price: Number.isFinite(s.unit_cost_price) ? s.unit_cost_price : 0,
        markup_percent: Number.isFinite(s.markup_percentage) ? s.markup_percentage : 0,
        selling_unit_price: Number.isFinite(s.unit_selling_price) ? s.unit_selling_price : 0,
        selling_price: Number.isFinite(s.calculated_price) ? s.calculated_price : 0,
        supplier: s.default_supplier_id || null
    }));

    const allCostItems = [...materialCostItems, ...serviceCostItems];

    let description = `Kalkuláció paraméterei:\n${rowDetails}\n\n`;
        description += `Felhasznált anyagok és szolgáltatások:\n`;
        description += `${selectedMaterials.map(m => `- ${m.material_name}: ${m.totalMaterialQty.toFixed(2)} ${m.unit}`).join('\n')}\n`;
        description += `${selectedServices.map(s => `- ${s.service_name}: ${s.quantity.toFixed(2)} ${s.unit}`).join('\n')}`;

        let internalDescription = `Bemeneti paraméterek részletesen:\n${rowDetails}\n\nKIOSZTÁS:\n`;
        selectedMaterials.forEach(m => {
            internalDescription += `----------\n${m.material_name}:\n`;
            if (m.batches && m.batches.length > 0) {
                m.batches.forEach((b: any, idx) => {
                     internalDescription += `  [${idx+1}. BATCH] Típus: ${b.type === 'full' ? 'Teljes ív' : 'Tört ív'}\n`;
                     internalDescription += `    Ívek száma: ${b.sheetCount} db\n`;
                     internalDescription += `    Termék / ív: ${b.itemsPerSheet} db\n`;
                     internalDescription += `    Ív méret: ${b.widthMM}x${b.heightMM} mm\n`;
                     internalDescription += `    Háló: ${b.fitX} x ${b.fitY}\n`;
                });
            }
            if (m.assignedRowIds && m.assignedRowIds.length > 0) {
                 const assignedIndices = rows.map((r, i) => m.assignedRowIds?.includes(r.id) ? (i+1) : null).filter(x => x !== null);
                 internalDescription += `  Hozzárendelt bemenetek: ${assignedIndices.join(', ')}. sorok\n`;
            }
            if (m.sheetBreakdownText) {
                 internalDescription += `  Egyéb infó: ${m.sheetBreakdownText}\n`;
            }
            internalDescription += `\n`;
        });
        
        internalDescription += `Alapanyag szükséglet:\n${selectedMaterials.map(m => `- ${m.material_name}: ${m.totalMaterialQty.toFixed(2)} ${m.unit} (Ár: ${Math.round(m.totalCost)} Ft)`).join('\n')}\n\n`;
        internalDescription += `Szolgáltatások:\n${selectedServices.map(s => `- ${s.service_name}: ${s.quantity.toFixed(2)} ${s.unit} (Ár: ${Math.round(s.quantity * s.unit_cost_price)} Ft)`).join('\n')}`;

        // Calculator state for restore
        const calculatorState = {
            templateId,
            rows,
            inputUnit,
            gapX,
            gapY,
            arrangementStrategy,
            selectedMaterials, 
            selectedServices
        };
        // Encode state in internal desc
        internalDescription += `\n\n<!-- CALCULATOR_STATE: ${JSON.stringify(calculatorState)} -->`;

        const payload: any = {
            name: `${template?.name || 'Kalkuláció'} ${new Date().toLocaleDateString('hu-HU')}`, 
            description: description,
            internal_description: internalDescription,
            quantity: 1, 
            quantity_unit: 'db',
            net_unit_price: Number.isFinite(sellingPrice) ? sellingPrice : 0,
            status: 'quote_request_open',
            date: new Date().toISOString().split('T')[0],
            deadline: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
            cost_items: allCostItems
        };
        
        console.log('Sending direct quote payload:', payload);

        const created = await manufacturingService.createProduct(payload);
        message.success('Termék létrehozva! Ugrás az ajánlathoz...');
        window.open(`/sales/rfqs?create=true&add_item_id=${created.id}&add_item_type=manufacturing`, '_blank');
    } catch (e: any) {
        console.error(e);
        console.log('Error details:', e.response?.data);
        const errMsg = JSON.stringify(e?.response?.data) || e?.message || 'Hiba történt';
        message.error(`Hiba: ${errMsg}`);
    } finally {
        setLoading(false);
    }
  };

  const handleCreateUniqueProduct = () => {
    // 1. Gather Data and Details
    const rowDetails = rows.map((r, i) => `${i+1}. Bemenet: ${r.width}x${r.height}${inputUnit} (${r.quantity} db)`).join('\n');
    
    // Construct Cost Items
    const materialCostItems = selectedMaterials.map((m, i) => ({
        type: 'material',
        ref_id: m.materialId, // Add reference ID
        name: m.material_name,
        quantity: m.totalMaterialQty || 0,
        unit: m.unit,
        unit_price: m.unit_cost_price || 0,
        cost_price: m.unit_cost_price || 0,
        markup_percent: m.markup_percentage || 0,
        selling_unit_price: m.unit_selling_price || 0,
        selling_price: m.totalSellingPrice || 0,
        supplier_id: m.default_supplier_id,
        is_per_unit: false // Calculator usually gives total requirement
    }));

    const serviceCostItems = selectedServices.map(s => ({
        type: 'service',
        ref_id: s.service_id, // Add reference ID
        name: s.service_name,
        quantity: s.quantity || 0,
        unit: s.unit,
        unit_price: s.unit_cost_price || 0,
        cost_price: s.unit_cost_price || 0,
        markup_percent: s.markup_percentage || 0,
        selling_unit_price: s.unit_selling_price || 0,
        selling_price: s.calculated_price || 0,
        supplier_id: s.default_supplier_id,
        is_per_unit: false 
    }));

    const allCostItems = [...materialCostItems, ...serviceCostItems];

    // Description Generation
    let description = `Kalkuláció paraméterei:\n${rowDetails}\n\n`;
    description += `Felhasznált anyagok és szolgáltatások:\n`;
    description += `${selectedMaterials.map(m => `- ${m.material_name}: ${m.totalMaterialQty.toFixed(2)} ${m.unit}`).join('\n')}\n`;
    description += `${selectedServices.map(s => `- ${s.service_name}: ${s.quantity.toFixed(2)} ${s.unit}`).join('\n')}`;

    // Internal Description (Detailed)
    let internalDescription = `Bemeneti paraméterek részletesen:\n${rowDetails}\n\n`;
    internalDescription += `KIOSZTÁS:\n`;
    selectedMaterials.forEach(m => {
        internalDescription += `----------\n${m.material_name}:\n`;
        // Describe Batches
        if (m.batches && m.batches.length > 0) {
            m.batches.forEach((b, idx) => {
                 internalDescription += `  [${idx+1}. BATCH] Típus: ${b.type === 'full' ? 'Teljes ív (többszörözve)' : 'Tört ív / Maradék'}\n`;
                 internalDescription += `    Ívek száma: ${b.sheetCount} db\n`;
                 internalDescription += `    Termék / ív: ${b.itemsPerSheet} db\n`;
                 internalDescription += `    Ív méret: ${b.widthMM}x${b.heightMM} mm\n`;
                 internalDescription += `    Háló (Oszlop x Sor): ${b.fitX} x ${b.fitY}\n`;
            });
        }
        
        // Describe Row Assignments if any
        if (m.assignedRowIds && m.assignedRowIds.length > 0) {
             const assignedIndices = rows.map((r, i) => m.assignedRowIds?.includes(r.id) ? (i+1) : null).filter(x => x !== null);
             internalDescription += `  Hozzárendelt bemenetek: ${assignedIndices.join(', ')}. sorok\n`;
        }

        if (m.sheetBreakdownText) {
             internalDescription += `  Egyéb infó: ${m.sheetBreakdownText}\n`;
        }
        internalDescription += `\n`;
    });
    
    internalDescription += `Alapanyag szükséglet:\n${selectedMaterials.map(m => `- ${m.material_name}: ${m.totalMaterialQty.toFixed(2)} ${m.unit} (Ár: ${Math.round(m.totalCost)} Ft)`).join('\n')}\n\n`;
    internalDescription += `Szolgáltatások:\n${selectedServices.map(s => `- ${s.service_name}: ${s.quantity.toFixed(2)} ${s.unit} (Ár: ${Math.round(s.quantity * s.unit_cost_price)} Ft)`).join('\n')}`;

    // Calculator State Snapshot for re-opening
    const calculatorState = {
        templateId,
        rows,
        inputUnit,
        gapX,
        gapY,
        arrangementStrategy,
        selectedMaterials, 
        selectedServices
    };

    const initialData: any = {
        name: `${template?.name || 'Kalkuláció'}`, 
        description: description,
        internal_description: internalDescription,
        quantity: 1, 
        quantity_unit: 'db',
        net_unit_price: sellingPrice,
        net_total_price: sellingPrice,
        cost_items: allCostItems,
        // Passing the state for "Open Calculator" feature
        _calculator_state: JSON.stringify(calculatorState),
        _from_calculator: true
    };
    
    // Check if we have dimensions from first row to pass
    if (rows.length > 0) {
        // Assuming mm usually
        let w = rows[0].width;
        let h = rows[0].height;
        if (inputUnit === 'cm') { w *= 10; h *= 10; }
        else if (inputUnit === 'm') { w *= 1000; h *= 1000; }
        
        initialData.width = w;
        initialData.length = h; // Length usually height in 2D
        initialData.dimension_unit = 'mm';
    }

    // Save to localStorage instead of state
    localStorage.setItem('create_from_calc_data', JSON.stringify(initialData));
    
    // Open in new tab
    window.open('/manufacturing/products?create_from_calc=true', '_blank');
  };

  /*
  const handleSave = async () => {
    // ... Legacy/Direct Save Logic Removed/Commented ...
  };
  */

  if (!template) return <div>Loading...</div>;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{marginBottom: 16}}>
          <Col>
            <h2><CalculatorOutlined /> {template?.name}</h2>
          </Col>
          <Col>
             {searchParams.get('restore') === 'true' && (
                 <Button 
                    type="dashed" 
                    danger
                    icon={<ArrowLeftOutlined />} 
                    onClick={() => {
                        window.close(); 
                    }}
                 >
                    Bezárás és visszatérés
                 </Button>
             )}
          </Col>
      </Row>
      
      <Row gutter={16}>
        <Col span={16}>
          <Card title="Paraméterek" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
                 <Radio.Group value={inputUnit} onChange={e => setInputUnit(e.target.value as any)}>
                    <Radio.Button value="mm">mm</Radio.Button>
                    <Radio.Button value="cm">cm</Radio.Button>
                    <Radio.Button value="m">m</Radio.Button>
                 </Radio.Group>
            </div>
            
            {rows.map((row, index) => (
               <Row key={row.id} gutter={8} style={{ marginBottom: 8 }} align="middle">
                   <Col span={1} style={{textAlign:'right', paddingRight:5}}>{index + 1}.</Col>
                   <Col span={7}>
                       <Form.Item label={index === 0 ? `Szélesség (${inputUnit})` : ''} style={{marginBottom:0}}>
                           <InputNumber value={row.width} onChange={v => {
                               const newR = [...rows];
                               newR[index].width = v||0;
                               setRows(newR);
                           }} style={{width:'100%'}} />
                       </Form.Item>
                   </Col>
                   <Col span={7}>
                       <Form.Item label={index === 0 ? `Magasság (${inputUnit})` : ''} style={{marginBottom:0}}>
                           <InputNumber value={row.height} onChange={v => {
                               const newR = [...rows];
                               newR[index].height = v||0;
                               setRows(newR);
                           }} style={{width:'100%'}} />
                       </Form.Item>
                   </Col>
                   <Col span={6}>
                       <Form.Item label={index === 0 ? `Darab` : ''} style={{marginBottom:0}}>
                           <InputNumber value={row.quantity} onChange={v => {
                               const newR = [...rows];
                               newR[index].quantity = v||0;
                               setRows(newR);
                           }} style={{width:'100%'}} />
                       </Form.Item>
                   </Col>
                   <Col span={3}>
                       <Button danger icon={<DeleteOutlined />} onClick={() => setRows(rows.filter(r => r.id !== row.id))} />
                   </Col>
               </Row>
            ))}
            <Button type="dashed" onClick={() => setRows([...rows, {id: Date.now(), width:0, height:0, quantity:1}])} icon={<PlusOutlined />} block>Új sor</Button>
          </Card>

          <Card title="Alapanyagok" style={{ marginBottom: 16 }}>
             <Row gutter={16} style={{ marginBottom: 16 }}>
                 <Col span={8}>
                     <Form.Item label="Köz X (mm)" style={{marginBottom:0}}>
                         <InputNumber value={gapX} onChange={v => setGapX(v||0)} style={{width:'100%'}} />
                     </Form.Item>
                 </Col>
                 <Col span={8}>
                     <Form.Item label="Köz Y (mm)" style={{marginBottom:0}}>
                         <InputNumber value={gapY} onChange={v => setGapY(v||0)} style={{width:'100%'}} />
                     </Form.Item>
                 </Col>
                 <Col span={8}>
                     <Form.Item label="Stratégia" style={{marginBottom:0}}>
                         <Select value={arrangementStrategy} onChange={setArrangementStrategy} style={{width:'100%'}}>
                             <Option value="best">Legkedvezőbb</Option>
                             <Option value="width">Szélesség szerint</Option>
                             <Option value="length">Hosszúság szerint</Option>
                             <Option value="optimal">Forgatással</Option>
                         </Select>
                     </Form.Item>
                 </Col>
                 <Col span={24} style={{marginTop: 16}}>
                     <Select 
                        placeholder="Válassz alapanyagot vagy csoportot" 
                        style={{ width: '100%' }}
                        onChange={handleAddMaterial}
                     >
                        <OptGroup label="Csoportok">
                            {Object.entries(materialGroups.groups).map(([name, items]) => (
                                <Option key={`g_${name}`} value={`group_${items[0].group_id}`}>
                                    📁 {name} (Auto legjobb ár)
                                </Option>
                            ))}
                        </OptGroup>
                        <OptGroup label="Egyedi alapanyagok">
                             {template?.allowed_materials_details.map(m => (
                                 <Option key={m.id} value={`mat_${m.id}`}>{m.name}</Option>
                             ))}
                        </OptGroup>
                     </Select>
                 </Col>
             </Row>

             {selectedMaterials.map((sm, idx) => (
                 <Card 
                    key={idx} 
                    type="inner" 
                    title={
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap'}}>
                            <span>
                                {sm.is_group_selection ? <Tag color="blue">Csoport: {sm.selected_group_name}</Tag> : null}
                                <b>{sm.material_name} </b>
                                 - {sm.totalMaterialQty.toFixed(2)} {sm.unit}
                                 {sm.materialWidthMM && sm.materialHeightMM ? 
                                    <Tag style={{marginLeft:10}}>
                                        Méret: {sm.materialWidthMM}x{sm.materialHeightMM} mm
                                    </Tag> 
                                 : null}
                            </span>
                            <div onClick={e => e.stopPropagation()}>
                                <Select 
                                    mode="multiple" 
                                    placeholder="Minden sor" 
                                    size="small"
                                    style={{minWidth: 200, marginLeft: 10}}
                                    value={sm.assignedRowIds}
                                    onChange={(vals) => {
                                        const newS = [...selectedMaterials];
                                        newS[idx].assignedRowIds = vals.length > 0 ? vals : undefined;
                                        const mat = template!.allowed_materials_details.find(m => m.id === sm.materialId);
                                        if (mat) {
                                            const overrides = { fitX: sm.userFitX, fitY: sm.userFitY };
                                            const p = calculateMaterialForRows(mat, overrides, sm.batchOverrides, newS[idx].assignedRowIds);
                                            Object.assign(newS[idx], p);
                                            newS[idx].totalSellingPrice = p.totalCost * (1 + (sm.markup_percentage||0)/100);
                                            setSelectedMaterials(newS);
                                        }
                                    }}
                                >
                                    {rows.map((r, ri) => <Option key={r.id} value={r.id}>#{ri+1}: {r.width}x{r.height} ({r.quantity}db)</Option>)}
                                </Select>
                            </div>
                        </div>
                    }
                    extra={<Button danger type="text" icon={<DeleteOutlined />} onClick={() => setSelectedMaterials(s => s.filter((_, i) => i !== idx))} />}
                    style={{ marginBottom: 16, backgroundColor: '#f9f9f9', border: '1px solid #e8e8e8' }}
                 >
                    <Row gutter={16}>
                        <Col span={14} style={{ textAlign: 'center' }}>
                            {(!sm.batches || sm.batches.length === 0) && (sm.svg ? sm.svg : <Empty description="Nincs vizualizáció" />)}
                            
                            {sm.batches && sm.batches.map(batch => (
                                <div key={batch.key} style={{marginBottom: 20, border:'1px dashed #ccc', padding: 10, borderRadius: 8}}>
                                    <div style={{marginBottom: 5, fontWeight:'bold', display:'flex', justifyContent:'space-between'}}>
                                        <span>{batch.type === 'full' ? 'Teli Táblák' : 'Maradék / Tört Tábla'} ({batch.sheetCount} db)</span>
                                        <span style={{fontSize:'0.8em', color:'#888'}}>Elemek: {batch.itemsPerSheet} db/tábla</span>
                                    </div>
                                    {batch.svg}
                                    <div style={{marginTop: 5, display:'flex', justifyContent:'center', gap: 5}}>
                                        <InputNumber 
                                            size="small" 
                                            min={1} 
                                            addonBefore="O" 
                                            style={{width:90}} 
                                            value={batch.fitX}
                                            onChange={v => {
                                                const newS = [...selectedMaterials];
                                                const val = Number(v);
                                                if(!newS[idx].batchOverrides) newS[idx].batchOverrides = {};
                                                // If this is a 'full' batch override, essentially it is the global override if it is the first row?
                                                // Or we treat all batch overrides equally now?
                                                const bo = newS[idx].batchOverrides![batch.key] || { fitX: batch.fitX, fitY: batch.fitY };
                                                bo.fitX = val;
                                                newS[idx].batchOverrides![batch.key] = bo;
                                                
                                                // If modifying full batch of first row, maybe sync with userFitX?
                                                if (batch.type === 'full' && batch.rowId === rows[0]?.id) {
                                                    newS[idx].userFitX = val;
                                                }

                                                const mat = template!.allowed_materials_details.find(m => m.id === sm.materialId);
                                                if (mat) {
                                                    const overrides = { fitX: newS[idx].userFitX, fitY: newS[idx].userFitY };
                                                    const p = calculateMaterialForRows(mat, overrides, newS[idx].batchOverrides, newS[idx].assignedRowIds);
                                                    Object.assign(newS[idx], p);
                                                    newS[idx].totalSellingPrice = p.totalCost * (1 + (sm.markup_percentage||0)/100);
                                                    setSelectedMaterials(newS);
                                                }
                                            }}
                                        />
                                        <InputNumber 
                                            size="small" 
                                            min={1} 
                                            addonBefore="S" 
                                            style={{width:90}} 
                                            value={batch.fitY}
                                            onChange={v => {
                                                const newS = [...selectedMaterials];
                                                const val = Number(v);
                                                if(!newS[idx].batchOverrides) newS[idx].batchOverrides = {};
                                                const bo = newS[idx].batchOverrides![batch.key] || { fitX: batch.fitX, fitY: batch.fitY };
                                                bo.fitY = val;
                                                newS[idx].batchOverrides![batch.key] = bo;
                                                
                                                if (batch.type === 'full' && batch.rowId === rows[0]?.id) {
                                                    newS[idx].userFitY = val;
                                                }

                                                const mat = template!.allowed_materials_details.find(m => m.id === sm.materialId);
                                                if (mat) {
                                                    const overrides = { fitX: newS[idx].userFitX, fitY: newS[idx].userFitY };
                                                    const p = calculateMaterialForRows(mat, overrides, newS[idx].batchOverrides, newS[idx].assignedRowIds);
                                                    Object.assign(newS[idx], p);
                                                    newS[idx].totalSellingPrice = p.totalCost * (1 + (sm.markup_percentage||0)/100);
                                                    setSelectedMaterials(newS);
                                                }
                                            }}
                                        />
                                         <Button 
                                            size="small" 
                                            icon={<DeleteOutlined />} 
                                            onClick={() => {
                                                const newS = [...selectedMaterials];
                                                if (newS[idx].batchOverrides?.[batch.key]) {
                                                    delete newS[idx].batchOverrides![batch.key];
                                                }
                                                // Also reset global if needed
                                                if (batch.type === 'full' && batch.rowId === rows[0]?.id) {
                                                    newS[idx].userFitX = undefined;
                                                    newS[idx].userFitY = undefined;
                                                }
                                                
                                                const mat = template!.allowed_materials_details.find(m => m.id === sm.materialId);
                                                if (mat) {
                                                    const overrides = { fitX: newS[idx].userFitX, fitY: newS[idx].userFitY };
                                                    const p = calculateMaterialForRows(mat, overrides, newS[idx].batchOverrides, newS[idx].assignedRowIds);
                                                    Object.assign(newS[idx], p);
                                                    newS[idx].totalSellingPrice = p.totalCost * (1 + (sm.markup_percentage||0)/100);
                                                    setSelectedMaterials(newS);
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}

                            {sm.sheetBreakdownText && (
                                <div style={{textAlign: 'left', fontSize: '13px', background:'#eee', padding:8, borderRadius:4, marginTop:10}}>
                                    <div style={{marginBottom: 4}}>
                                        <b>Igény:</b> {sm.sheetBreakdownText}
                                    </div>
                                    {sm.totalSheetAreaM2 !== undefined && (
                                        <div>
                                            <b>Felhasznált terület:</b> {sm.totalSheetAreaM2.toFixed(2)} m² 
                                            <span style={{marginLeft: 10}}>
                                                (Kihasználtság: <b>{(sm.utilizationPercent || 0).toFixed(1)}%</b>)
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Col>
                        <Col span={10}>
                            <Statistic title="Költség" value={sm.totalCost} precision={0} suffix="Ft" groupSeparator=" " />
                            <Divider style={{margin:'10px 0'}} />
                             <Form.Item label="Haszonkulcs %" style={{marginBottom:0}}>
                                 <InputNumber 
                                    value={sm.markup_percentage} 
                                    onChange={v => {
                                        const newS = [...selectedMaterials];
                                        const val = Number(v) || 0;
                                        newS[idx].markup_percentage = val;
                                        newS[idx].totalSellingPrice = newS[idx].totalCost * (1 + val/100);
                                        setSelectedMaterials(newS);
                                    }} 
                                    style={{width:'100%'}}
                                 />
                             </Form.Item>
                             <Statistic title="Eladási ár" value={sm.totalSellingPrice} precision={0} suffix="Ft" groupSeparator=" " valueStyle={{ color: '#1890ff', fontWeight:'bold' }} />
                        </Col>
                    </Row>
                 </Card>
             ))}
          </Card>

          <Card title="Szolgáltatások" style={{ marginBottom: 16 }}>
            <Space style={{ marginBottom: 16 }}>
              <Select
                placeholder="Válassz szolgáltatást"
                style={{ width: 300 }}
                onSelect={(value) => value && addService(value as number)}
                value={null}
              >
                {template?.allowed_services_details.map(s => (
                  <Option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </Option>
                ))}
              </Select>
            </Space>
            <Table
              dataSource={selectedServices}
              rowKey={(record, index) => `service-${index}`}
              pagination={false}
              size="small"
              columns={[
                { title: 'Szolgáltatás', dataIndex: 'service_name', key: 'service_name' },
                {
                    title: 'Mennyiség',
                    key: 'quantity',
                    render: (_: any, record: SelectedService) => `${record.quantity.toFixed(2)} ${record.unit}`,
                },
                {
                    title: 'Bekerülési ár',
                    dataIndex: 'unit_cost_price',
                    key: 'unit_cost_price',
                    render: (price: number, record: SelectedService) => `${price.toLocaleString()} Ft/${record.unit || 'db'}`
                },
                {
                    title: 'Haszonkulcs %',
                    dataIndex: 'markup_percentage',
                    key: 'markup_percentage',
                    render: (markup: number, record: SelectedService, index: number) => (
                        <InputNumber
                        min={0}
                        max={1000}
                        value={Number(markup) || 0}
                        onChange={(value) => {
                            const newServices = [...selectedServices];
                            const newMarkup = Number(value) || 0;
                            newServices[index].markup_percentage = newMarkup;
                            newServices[index].unit_selling_price = newServices[index].unit_cost_price * (1 + newMarkup / 100);
                            newServices[index].calculated_price = newServices[index].quantity * newServices[index].unit_selling_price;
                            setSelectedServices(newServices);
                        }}
                        formatter={value => `${Number(value) || 0}%`}
                        parser={value => parseFloat(value!.replace('%', '')) || 0}
                        style={{ width: 80 }}
                        />
                    )
                },
                {
                    title: 'Eladási ár',
                    dataIndex: 'unit_selling_price',
                    key: 'unit_selling_price',
                    render: (price: number, record: SelectedService) => `${price.toLocaleString()} Ft`
                },
                {
                    title: 'Összesen',
                    dataIndex: 'calculated_price',
                    key: 'calculated_price',
                    render: (price: number) => `${price.toLocaleString()} Ft`,
                },
                {
                    title: '',
                    key: 'action',
                    width: 50,
                    render: (_: any, record: SelectedService, index: number) => (
                        <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeService(index)}
                        />
                    ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col span={8}>
          <Card title="Összegzés" style={{ position: 'sticky', top: 20 }}>
             <Statistic title="Alapanyag költség" value={materialCost} suffix="HUF" precision={0} groupSeparator=" " />
             <Statistic title="Alapanyag eladási ár" value={materialSellingPrice} suffix="HUF" precision={0} groupSeparator=" " valueStyle={{ color: '#1890ff' }} />
             <Divider />
             <Statistic title="Szolgáltatás költség" value={serviceCost} suffix="HUF" precision={0} groupSeparator=" " />
             <Statistic title="Szolgáltatás eladási ár" value={serviceSellingPrice} suffix="HUF" precision={0} groupSeparator=" " valueStyle={{ color: '#52c41a' }} />
             <Divider />
             <Statistic title="ÖSSZ ELADÁSI ÁR" value={sellingPrice} suffix="HUF" precision={0} groupSeparator=" " valueStyle={{ color: '#cf1322', fontSize: 24, fontWeight: 'bold' }} />
             <Button type="primary" block icon={<BuildOutlined />} size="large" style={{marginTop: 20}} onClick={handleCreateUniqueProduct}>
                 Egyedi gyártás készítése
             </Button>
             <Button type="default" block icon={<FileTextOutlined />} size="large" style={{marginTop: 10, borderColor: '#52c41a', color: '#52c41a'}} onClick={handleCreateQuoteDirectly}>
                 Ajánlat készítése közvetlenül
             </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Calculator;
