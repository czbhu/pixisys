import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Table, Space, Button, Tooltip, Tag, message, Spin, Popover, Input, Upload, Select, Checkbox, Modal, Form } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, PaperClipOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  CostDragHandle,
  CostDraggableRow,
  applyCostDnd,
  buildCostTreeMeta,
  CostTreeGuide,
  CostDndItem,
} from './CostDnd';
import { manufacturingService } from '../../services/manufacturingService';
import { hrService } from '../../services/hrService';
import { useClipboardImagePaste } from '../../hooks/useClipboardImagePaste';
import api from '../../services/api';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';
import { formatBytes } from '../../utils/fileUtils';

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'new', label: 'Új', color: 'blue' },
  { value: 'confirmed', label: 'Megerősítve', color: 'cyan' },
  { value: 'sent', label: 'Kiküldve', color: 'gold' },
  { value: 'ordered', label: 'Megrendelve', color: 'geekblue' },
  { value: 'in_production', label: 'Gyártásban', color: 'orange' },
  { value: 'ready', label: 'Kész', color: 'green' },
  { value: 'in_delivery', label: 'Száll. alatt', color: 'purple' },
  { value: 'delivered', label: 'Kiszállítva', color: 'success' },
  { value: 'rejected', label: 'Elutasítva', color: 'red' },
  { value: 'cancelled', label: 'Törölve', color: 'default' },
];

export interface ProductSubItem extends CostDndItem {
  id: number;
  type: string;
  ref_id?: number | null;
  code?: string;
  name: string;
  quantity: number;
  unit: string;
  cost_price: number;
  unit_price?: number;
  markup_percent?: number;
  selling_unit_price?: number;
  selling_price?: number;
  supplier?: number | null;
  supplier_name?: string;
  department?: number | null;
  department_name?: string;
  is_internal?: boolean;
  is_per_unit?: boolean;
  currency_code?: string;
  sort_order?: number;
  parent_local_id?: number | null;
  status?: string;
}

const typeLabel = (t: string) =>
  t === 'material' ? 'Anyag' : t === 'service' ? 'Szolg.' : 'Egyéb';

interface Props {
  productId: number;
  /** Optional pre-loaded product (skips initial fetch). */
  product?: any;
  /** Extra columns appended after the built-in ones. */
  extraColumns?: any[];
  /** Hide the dedicated drag handle column and "Hierarchia" controls (read-only). */
  readOnly?: boolean;
  /** Compact size? defaults true. */
  size?: 'small' | 'middle' | 'large';
  /** Ha true, megjegyzés és csatolmány oszlopok meg jelennek */
  showNotesAndAttachments?: boolean;
  /** Ha false, beker./eladási ár oszlopok rejtve (jogosultság alapján). Default: true */
  showPrices?: boolean;
  /** Auto-expand all cost item rows on mount (requires showNotesAndAttachments). Default: false */
  defaultExpandAllRows?: boolean;
  /** Callback when any cost item's status changes (e.g. to refresh parent). */
  onStatusChange?: () => void;
  /** Increment to force a fresh reload of cost items from the API (e.g. after external bulk status change). */
  reloadTrigger?: number;
  /** Pre-loaded cost items (bypasses API fetch — used for direct QRI items without ManufacturingProduct). */
  dataSource?: ProductSubItem[];
  /** If provided, all save operations call this callback instead of individual MP/cost-item API endpoints. */
  onPersistAll?: (items: ProductSubItem[]) => Promise<void>;
  /** QuoteRequestItem ID — if set alongside dataSource, enables attachment upload via /sales/quote-request-items/{id}/cost-item-attachments/ */
  qriId?: number;
}

export const ProductSubItemsTable: React.FC<Props> = ({
  productId,
  product: initialProduct,
  extraColumns = [],
  readOnly = false,
  size = 'small',
  showNotesAndAttachments = false,
  showPrices = true,
  defaultExpandAllRows = false,
  onStatusChange,
  reloadTrigger,
  dataSource,
  onPersistAll,
  qriId,
}) => {
  const [loading, setLoading] = useState(!initialProduct);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ProductSubItem[]>([]);
  const [productInfo, setProductInfo] = useState<any | null>(initialProduct || null);
  // notes inline edit state
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [editingNotesVal, setEditingNotesVal] = useState('');
  // per-subitem attachments
  const [subItemAtts, setSubItemAtts] = useState<Record<number, any[]>>({});
  const [subItemAttsLoaded, setSubItemAttsLoaded] = useState<Record<number, boolean>>({});
  const [subItemAttRemark, setSubItemAttRemark] = useState<Record<number, string>>({});
  const [subItemAttUploading, setSubItemAttUploading] = useState<Record<number, number>>({});
  const [expandedSubItems, setExpandedSubItems] = useState<number[]>([]);
  const [editingSubAttRemarkId, setEditingSubAttRemarkId] = useState<number | null>(null);
  const [editingSubAttRemarkVal, setEditingSubAttRemarkVal] = useState<string>('');

  // --- Ctrl+V paste support for cost item attachments ---
  const lastPasteCiIdRef = useRef<number | null>(null);
  const subItemAttRemarkRef = useRef<Record<number, string>>({});
  useEffect(() => { subItemAttRemarkRef.current = subItemAttRemark; }, [subItemAttRemark]);
  const handlePasteFile = useCallback((file: File) => {
    const ciId = lastPasteCiIdRef.current;
    if (!ciId) return;
    setSubItemAttUploading(prev => ({ ...prev, [ciId]: (prev[ciId] || 0) + 1 }));
    const fd = new FormData();
    fd.append('file', file);
    const remark = subItemAttRemarkRef.current[ciId] || '';
    if (remark) fd.append('remark', remark);
    const uploadUrl = qriId
      ? `/sales/quote-request-items/${qriId}/cost-item-attachments/`
      : `/manufacturing/cost-items/${ciId}/attachments/`;
    if (qriId) fd.append('cost_item_local_id', String(ciId));
    api.post(uploadUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(res => {
        setSubItemAtts(prev => ({ ...prev, [ciId]: [res.data, ...(prev[ciId] || [])] }));
        message.success('Kép feltöltve');
      })
      .catch(() => message.error('Feltöltés sikertelen'))
      .finally(() => setSubItemAttUploading(prev => ({ ...prev, [ciId]: Math.max(0, (prev[ciId] || 0) - 1) })));
  }, [qriId]);
  useClipboardImagePaste(handlePasteFile, expandedSubItems.length > 0);
  // suppliers
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [supplierPopoverOpen, setSupplierPopoverOpen] = useState<number | null>(null);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSubItem, setEditingSubItem] = useState<ProductSubItem | null>(null);
  const [editFormInternal, setEditFormInternal] = useState(false);
  const [editForm] = Form.useForm();

  useEffect(() => {
    api.get('/crm/companies/?is_supplier=true&page_size=1000')
      .then(res => setSuppliers(Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : [])))
      .catch(() => {});
    hrService.getDepartments()
      .then(res => setDepartments(Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : [])))
      .catch(() => {});
  }, []);

  const handleSupplierChange = async (id: number, supplierId: number | null) => {
    const prev = items;
    const next = items.map(it => {
      if (it.id !== id) return it;
      const sup = suppliers.find(s => s.id === supplierId);
      return { ...it, supplier: supplierId, supplier_name: sup?.name || '' };
    });
    setItems(next);
    setSupplierPopoverOpen(null);
    try {
      if (onPersistAll) {
        await onPersistAll(next);
      } else {
        await api.patch(`/manufacturing/cost-items/${id}/`, { supplier: supplierId });
      }
    } catch {
      message.error('Beszállító frissítése sikertelen');
      setItems(prev);
    }
  };

  const handleInternalChange = async (id: number, isInternal: boolean, deptId?: number | null) => {
    const prev = items;
    const next = items.map(it => {
      if (it.id !== id) return it;
      const dept = departments.find(d => d.id === deptId);
      return { ...it, is_internal: isInternal, department: deptId ?? null, department_name: dept?.name || '', supplier: isInternal ? null : it.supplier, supplier_name: isInternal ? '' : it.supplier_name };
    });
    setItems(next);
    try {
      if (onPersistAll) {
        await onPersistAll(next);
      } else {
        await api.patch(`/manufacturing/cost-items/${id}/`, { is_internal: isInternal, department: deptId ?? null, supplier: isInternal ? null : undefined });
      }
    } catch {
      message.error('Frissítés sikertelen');
      setItems(prev);
    }
  };

  const treeMeta = useMemo(() => buildCostTreeMeta(items), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const mapCostItems = (raw: any[]): ProductSubItem[] => {
    const mapped: ProductSubItem[] = raw.map((c: any, idx: number) => ({
      id: c.id ?? Date.now() + idx,
      type: c.type || 'other',
      ref_id: c.ref_id ?? null,
      code: c.code || '',
      name: c.name || '',
      quantity: Number(c.quantity) || 0,
      unit: c.unit || 'db',
      cost_price: Number(c.cost_price) || 0,
      unit_price: Number(c.unit_price) || 0,
      markup_percent: Number(c.markup_percent) || 0,
      selling_unit_price: Number(c.selling_unit_price) || 0,
      selling_price: Number(c.selling_price) || 0,
      supplier: c.supplier ?? c.supplier_id ?? null,
      supplier_name: c.supplier_name || c.supplier_info?.name || '',
      department: c.department ?? c.department_id ?? null,
      department_name: c.department_name || c.department_info?.name || '',
      is_internal: !!c.is_internal,
      is_per_unit: !!c.is_per_unit,
      currency_code: (c.currency_info?.code || c.currency || 'HUF').toString().toUpperCase(),
      sort_order: typeof c.sort_order === 'number' ? c.sort_order : idx,
      parent_local_id: typeof c.parent === 'number' ? c.parent : null,
      status: c.status || 'new',
    }));
    mapped.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return mapped;
  };

  useEffect(() => {
    if (dataSource !== undefined) {
      setItems(mapCostItems(dataSource));
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let prod: any = initialProduct;
        if (!prod) {
          setLoading(true);
          prod = await manufacturingService.getProduct(productId);
        }
        if (cancelled) return;
        setProductInfo(prod);
        const mapped = mapCostItems(prod.cost_items || []);
        setItems(mapped);
        if (defaultExpandAllRows && showNotesAndAttachments) {
          setExpandedSubItems(mapped.map(i => i.id));
          // Pre-fetch attachments for all expanded items so the spinner resolves immediately
          mapped.forEach(item => {
            api.get(`/manufacturing/cost-items/${item.id}/attachments/`)
              .then(res => setSubItemAtts(prev => ({ ...prev, [item.id]: res.data || [] })))
              .catch(() => setSubItemAtts(prev => ({ ...prev, [item.id]: [] })))
              .finally(() => setSubItemAttsLoaded(prev => ({ ...prev, [item.id]: true })));
          });
        }
      } catch (e) {
        console.error(e);
        message.error('Altételek betöltése sikertelen');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, reloadTrigger, dataSource]);

  const persist = async (next: ProductSubItem[]) => {
    if (onPersistAll) {
      setSaving(true);
      try {
        await onPersistAll(next);
      } catch {
        message.error('Mentés sikertelen');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!productInfo) return;
    setSaving(true);
    try {
      const payload = {
        cost_items: next.map((c, idx) => {
          const parentIdx = c.parent_local_id != null
            ? next.findIndex(x => x.id === c.parent_local_id)
            : -1;
          return {
            type: c.type || 'other',
            ref_id: c.ref_id || null,
            name: c.name,
            quantity: Number(Number(c.quantity).toFixed(4)) || 0,
            unit: c.unit || 'db',
            unit_price: Number((Number(c.unit_price) || 0).toFixed(4)),
            selling_unit_price: Number((Number(c.selling_unit_price) || 0).toFixed(4)),
            cost_price: Number((Number(c.cost_price) || 0).toFixed(4)),
            markup_percent: Number((Number(c.markup_percent) || 0).toFixed(4)),
            selling_price: Number((Number(c.selling_price) || 0).toFixed(4)),
            supplier: c.supplier || null,
            department: c.department || null,
            is_internal: c.is_internal || false,
            is_per_unit: c.is_per_unit || false,
            currency: (c.currency_code || 'HUF').toUpperCase(),
            sort_order: idx,
            parent_index: parentIdx >= 0 ? parentIdx : null,
          };
        }),
      } as any;
      await manufacturingService.patchProduct(productInfo.id, payload);
      message.success('Sorrend mentve');
    } catch (e) {
      console.error(e);
      message.error('Mentés sikertelen');
    } finally {
      setSaving(false);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    if (!over || !active) return;
    const next = applyCostDnd(items, Number(active.id), Number(over.id), delta?.x || 0);
    setItems(next);
    persist(next);
  };

  const indent = (id: number) => {
    const idx = items.findIndex(i => i.id === id);
    if (idx <= 0) return;
    const prev = items[idx - 1];
    const next = items.map(it => it.id === id ? { ...it, parent_local_id: prev.id } : it);
    setItems(next);
    persist(next);
  };

  const outdent = (id: number) => {
    const it = items.find(i => i.id === id);
    if (!it || it.parent_local_id == null) return;
    const parent = items.find(p => p.id === it.parent_local_id);
    const newParent = parent ? (parent.parent_local_id ?? null) : null;
    const next = items.map(x => x.id === id ? { ...x, parent_local_id: newParent } : x);
    setItems(next);
    persist(next);
  };

  const openEditModal = (r: ProductSubItem) => {
    setEditingSubItem(r);
    setEditFormInternal(!!r.is_internal);
    editForm.setFieldsValue({
      name: r.name,
      code: r.code || '',
      type: r.type || 'other',
      quantity: r.quantity,
      unit: r.unit || 'db',
      cost_price: r.cost_price,
      markup_percent: r.markup_percent,
      status: r.status || 'new',
      is_internal: !!r.is_internal,
      supplier: r.supplier ?? undefined,
      department: r.department ?? undefined,
    });
    setEditModalVisible(true);
  };

  const handleEditSave = async () => {
    if (!editingSubItem) return;
    try {
      const values = await editForm.validateFields();
      const patch: any = {
        name: values.name,
        code: values.code || '',
        type: values.type,
        quantity: values.quantity,
        unit: values.unit,
        cost_price: values.cost_price ?? editingSubItem.cost_price,
        markup_percent: values.markup_percent ?? editingSubItem.markup_percent,
        status: values.status,
        is_internal: !!values.is_internal,
        supplier: values.is_internal ? null : (values.supplier ?? null),
        department: values.is_internal ? (values.department ?? null) : null,
      };
      const supObj = suppliers.find(s => s.id === patch.supplier);
      const deptObj = departments.find(d => d.id === patch.department);
      const updatedItems = items.map(it => it.id === editingSubItem.id ? {
        ...it,
        ...patch,
        supplier_name: supObj?.name || '',
        department_name: deptObj?.name || '',
      } : it);
      setItems(updatedItems);
      setEditModalVisible(false);
      if (onPersistAll) {
        await onPersistAll(updatedItems);
      } else {
        await api.patch(`/manufacturing/cost-items/${editingSubItem.id}/`, patch);
      }
      message.success('Altétel mentve');
    } catch (e: any) {
      if (e?.errorFields) return; // validation error
      message.error('Mentés sikertelen');
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    const prev = items;
    const next = items.map(it => it.id === id ? { ...it, status: newStatus } : it);
    setItems(next);
    try {
      if (onPersistAll) {
        await onPersistAll(next);
      } else {
        await api.patch(`/manufacturing/cost-items/${id}/`, { status: newStatus });
        onStatusChange?.();
      }
    } catch (e) {
      console.error(e);
      message.error('Státusz frissítése sikertelen');
      setItems(prev);
    }
  };

  const columns: any[] = [
    ...(readOnly ? [] : [{ title: '', key: 'drag', width: 28, render: () => <CostDragHandle /> }]),
    { title: '', key: 'edit', width: 32,
      render: (_: any, r: ProductSubItem) => (
        <Button size="small" icon={<EditOutlined />} type="text" onClick={(e) => { e.stopPropagation(); openEditModal(r); }} />
      ),
    },
    {
      title: 'Megnevezés', key: 'name',
      render: (_: any, r: ProductSubItem) => (
        <CostTreeGuide meta={treeMeta.get(r.id)}>
          <span>
            {r.code ? <span style={{ color: '#888', marginRight: 6 }}>[{r.code}]</span> : null}
            {r.name || <em style={{ color: '#bbb' }}>(név nélkül)</em>}
          </span>
        </CostTreeGuide>
      ),
    },
    { title: 'Típus', dataIndex: 'type', key: 'type', width: 80, render: (t: string) => typeLabel(t) },
    { title: 'Mennyiség', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const,
      render: (q: number) => Number(q).toLocaleString('hu-HU', { maximumFractionDigits: 4 }) },
    { title: 'Egység', dataIndex: 'unit', key: 'unit', width: 80 },
    ...(showPrices ? [
      { title: 'Beker. nettó ár', dataIndex: 'cost_price', key: 'cost_price', width: 140, align: 'right' as const,
        render: (v: number, r: ProductSubItem) => {
          const total = Number(v || 0) * Number(r.quantity || 1);
          if (!total) return <span style={{ color: '#bbb' }}>—</span>;
          return `${total.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${r.currency_code || 'HUF'}`;
        } },
      { title: 'Nettó eladási ár', dataIndex: 'selling_unit_price', key: 'selling_unit_price', width: 140, align: 'right' as const,
        render: (v: number, r: ProductSubItem) => {
          const unitP = Number(v || r.selling_price || 0);
          if (!unitP) return <span style={{ color: '#bbb' }}>—</span>;
          const total = unitP * Number(r.quantity || 1);
          return <span style={{ fontWeight: 500 }}>{total.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} {r.currency_code || 'HUF'}</span>;
        } },
    ] : []),
    { title: 'Beszállító', key: 'supplier', width: 180,
      render: (_: any, r: ProductSubItem) => {
        const tag = r.is_internal
          ? <Tag color="blue" style={{ cursor: 'pointer' }}>{r.department_name || 'Belső'}</Tag>
          : r.supplier_name
            ? <Tag color="orange" style={{ cursor: 'pointer' }}>{r.supplier_name}</Tag>
            : <span style={{ color: '#bbb', cursor: 'pointer', fontSize: 12 }}>+ beállítás</span>;
        return (
          <Popover
            open={supplierPopoverOpen === r.id}
            onOpenChange={open => setSupplierPopoverOpen(open ? r.id : null)}
            trigger="click"
            title="Beszállító / Belső"
            getPopupContainer={() => document.body}
            zIndex={9999}
            content={
              <div style={{ width: 300 }}>
                <div style={{ marginBottom: 8 }}>
                  <Checkbox
                    checked={!!r.is_internal}
                    onChange={e => handleInternalChange(r.id, e.target.checked, r.department ?? null)}
                  >
                    Belső gyartás
                  </Checkbox>
                </div>
                {r.is_internal ? (
                  <Select
                    autoFocus
                    showSearch
                    allowClear
                    placeholder="Osztály kiválasztása…"
                    style={{ width: '100%' }}
                    value={r.department ?? undefined}
                    optionFilterProp="label"
                    options={departments.map(d => ({ value: d.id, label: d.name }))}
                    onChange={val => handleInternalChange(r.id, true, val ?? null)}
                    getPopupContainer={() => document.body}
                  />
                ) : (
                  <Select
                    autoFocus
                    showSearch
                    allowClear
                    placeholder="Beszállító kiválasztása…"
                    style={{ width: '100%' }}
                    value={r.supplier ?? undefined}
                    optionFilterProp="label"
                    options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                    onChange={val => handleSupplierChange(r.id, val ?? null)}
                    getPopupContainer={() => document.body}
                  />
                )}
              </div>
            }
            styles={{ body: { padding: '10px 12px' } }}
          >
            <span onClick={e => e.stopPropagation()}>{tag}</span>
          </Popover>
        );
      },
    },
    {
      title: 'Státusz', key: 'status', width: 140,
      render: (_: any, r: ProductSubItem) => {
        const cur = r.status || 'new';
        const opt = STATUS_OPTIONS.find(o => o.value === cur) || STATUS_OPTIONS[0];
        const content = (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STATUS_OPTIONS.map(o => (
              <Button
                key={o.value}
                size="small"
                type={o.value === cur ? 'primary' : 'text'}
                disabled={o.value === cur}
                style={{ paddingTop: 1, paddingBottom: 1, lineHeight: 1.4 }}
                onClick={(e) => { e.stopPropagation(); handleStatusChange(r.id, o.value); }}
              >
                {o.label}
              </Button>
            ))}
          </div>
        );
        return (
          <Popover content={content} title="Státusz váltás" trigger="click" styles={{ body: { padding: '6px 8px' } }} getPopupContainer={() => document.body} zIndex={9999}>
            <Tag color={opt.color} style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>{opt.label}</Tag>
          </Popover>
        );
      },
    },
    ...(readOnly ? [] : [{
      title: 'Hierarchia', key: 'hier', width: 80,
      render: (_: any, r: ProductSubItem) => (
        <Space size={2}>
          <Tooltip title="Kijjebb (outdent)">
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => outdent(r.id)} disabled={r.parent_local_id == null} />
          </Tooltip>
          <Tooltip title="Beljebb (indent)">
            <Button size="small" icon={<ArrowRightOutlined />} onClick={() => indent(r.id)} />
          </Tooltip>
        </Space>
      ),
    }]),
    ...(showNotesAndAttachments ? [
      {
        title: 'Megj. / Csatolmányok', key: 'att_trigger', width: 160,
        render: (_: any, r: ProductSubItem) => {
          const ciId = r.id;
          const atts: any[] = subItemAtts[ciId] || [];
          const loaded = !!subItemAttsLoaded[ciId];
          const notes = (r as any).notes || '';
          const isOpen = expandedSubItems.includes(ciId);
          return (
            <Button
              size="small"
              icon={<PaperClipOutlined />}
              type={isOpen ? 'primary' : 'default'}
              onClick={() => {
                if (!isOpen) {
                  setExpandedSubItems(prev => [...prev, ciId]);
                  if (!subItemAttsLoaded[ciId]) {
                    const attUrl = qriId
                      ? `/sales/quote-request-items/${qriId}/cost-item-attachments/?local_id=${ciId}`
                      : `/manufacturing/cost-items/${ciId}/attachments/`;
                    if (qriId || !onPersistAll) {
                      api.get(attUrl)
                        .then(res => setSubItemAtts(prev => ({ ...prev, [ciId]: res.data || [] })))
                        .catch(() => setSubItemAtts(prev => ({ ...prev, [ciId]: [] })))
                        .finally(() => setSubItemAttsLoaded(prev => ({ ...prev, [ciId]: true })));
                    }
                  }
                } else {
                  setExpandedSubItems(prev => prev.filter(id => id !== ciId));
                }
              }}
            >
              {notes ? '📝 ' : ''}{loaded && atts.length > 0 ? atts.length : ''}
            </Button>
          );
        },
      },
    ] : []),
    ...extraColumns,
  ];

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center' }}><Spin size="small" /> Altételek betöltése...</div>;
  }
  if (items.length === 0) {
    return <div style={{ padding: 16, color: '#999' }}>Nincsenek altételek.</div>;
  }

  const renderSubItemExpanded = (r: ProductSubItem) => {
    const ciId = r.id;
    const atts: any[] = subItemAtts[ciId] || [];
    const loaded = !!subItemAttsLoaded[ciId];
    const uploading = !!subItemAttUploading[ciId];
    const attRemark = subItemAttRemark[ciId] || '';
    const notes = (r as any).notes || '';

    return (
      <div
        style={{ padding: '8px 16px 12px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}
        onMouseEnter={() => { lastPasteCiIdRef.current = ciId; }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {/* Megjegyzés */}
          <div>
            <div style={{ fontWeight: 500, fontSize: 12, color: '#555', marginBottom: 4 }}>Belső megjegyzés</div>
            {editingNotesId === ciId ? (
              <Space direction="vertical" size={4}>
                <Input.TextArea
                  autoFocus rows={2} style={{ width: 400 }}
                  value={editingNotesVal}
                  onChange={e => setEditingNotesVal(e.target.value)}
                />
                <Space>
                  <Button size="small" type="primary" onClick={async () => {
                    try {
                      if (onPersistAll) {
                        const updatedItems = items.map(it => it.id === ciId ? { ...it, notes: editingNotesVal } as any : it);
                        setItems(updatedItems);
                        await onPersistAll(updatedItems);
                      } else {
                        await api.patch(`/manufacturing/cost-items/${ciId}/notes/`, { notes: editingNotesVal });
                        setItems(prev => prev.map(it => it.id === ciId ? { ...it, notes: editingNotesVal } as any : it));
                      }
                      setEditingNotesId(null);
                    } catch { message.error('Mentés sikertelen'); }
                  }}>Mentés</Button>
                  <Button size="small" onClick={() => setEditingNotesId(null)}>Mégsem</Button>
                </Space>
              </Space>
            ) : (
              <span
                style={{ color: notes ? '#333' : '#bbb', fontSize: 13, cursor: 'pointer', display: 'inline-block', minWidth: 120 }}
                onClick={() => { setEditingNotesId(ciId); setEditingNotesVal(notes); }}
              >
                {notes || '+ megjegyzés hozzáadása'}
              </span>
            )}
          </div>

          {/* Csatolmányok */}
          {(qriId || !onPersistAll) && (
          <div>
            <div style={{ fontWeight: 500, fontSize: 12, color: '#555', marginBottom: 6 }}>Csatolmányok</div>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Input
                placeholder="Megjegyzés a feltöltéshez (opcionális)"
                size="small" value={attRemark} style={{ width: 340 }}
                onChange={e => setSubItemAttRemark(prev => ({ ...prev, [ciId]: e.target.value }))}
              />
              <Upload.Dragger
                multiple
                showUploadList={false}
                style={{ padding: '8px 0' }}
                customRequest={({ file, onSuccess, onError }) => {
                  const f = file as File;
                  setSubItemAttUploading(prev => ({ ...prev, [ciId]: (prev[ciId] || 0) + 1 }));
                  const fd = new FormData();
                  fd.append('file', f);
                  if (attRemark) fd.append('remark', attRemark);
                  const uploadUrl = qriId
                    ? `/sales/quote-request-items/${qriId}/cost-item-attachments/`
                    : `/manufacturing/cost-items/${ciId}/attachments/`;
                  if (qriId) fd.append('cost_item_local_id', String(ciId));
                  api.post(uploadUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                    .then(res => {
                      setSubItemAtts(prev => ({ ...prev, [ciId]: [res.data, ...(prev[ciId] || [])] }));
                      setSubItemAttRemark(prev => ({ ...prev, [ciId]: '' }));
                      message.success('Feltöltve');
                      onSuccess?.(res.data);
                    })
                    .catch(e => { message.error('Feltöltés sikertelen'); onError?.(e); })
                    .finally(() => setSubItemAttUploading(prev => ({ ...prev, [ciId]: Math.max(0, (prev[ciId] || 0) - 1) })));
                }}
              >
                {uploading
                  ? <><Spin size="small" /> <span style={{ fontSize: 12, color: '#888' }}>Feltöltés…</span></>
                  : <span style={{ fontSize: 12, color: '#888' }}>Húzd ide a fájlokat, kattints &middot; vagy Ctrl+V</span>
                }
              </Upload.Dragger>

              {!loaded ? <Spin size="small" /> : atts.length === 0 ? (
                <div style={{ color: '#bbb', fontSize: 12 }}>Nincs csatolmány</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {atts.map((att: any) => (
                    <Space key={att.id} size={4} align="center">
                      <a
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12 }}
                        onClick={(e) => { if (isPdf(att.file_url)) { e.preventDefault(); openPdfPreview(att.file_url); } }}
                      >{att.original_filename}</a>
                      {att.file_size ? <span style={{ fontSize: 11, color: '#999' }}>{formatBytes(att.file_size)}</span> : null}
                      {editingSubAttRemarkId === att.id ? (
                        <Space size={4}>
                          <Input
                            size="small"
                            autoFocus
                            value={editingSubAttRemarkVal}
                            style={{ width: 200 }}
                            onChange={e => setEditingSubAttRemarkVal(e.target.value)}
                            onPressEnter={async () => {
                              try {
                                const remarkUrl = qriId
                                  ? `/sales/quote-request-items/${qriId}/cost-item-attachments/${att.id}/`
                                  : `/manufacturing/cost-items/${ciId}/attachments/${att.id}/remark/`;
                                const res = await api.patch(remarkUrl, { remark: editingSubAttRemarkVal });
                                setSubItemAtts(prev => ({ ...prev, [ciId]: (prev[ciId] || []).map((a: any) => a.id === att.id ? { ...a, remark: res.data.remark } : a) }));
                                setEditingSubAttRemarkId(null);
                              } catch { message.error('Mentés sikertelen'); }
                            }}
                          />
                          <Button size="small" type="primary" onClick={async () => {
                            try {
                              const remarkUrl = qriId
                                ? `/sales/quote-request-items/${qriId}/cost-item-attachments/${att.id}/`
                                : `/manufacturing/cost-items/${ciId}/attachments/${att.id}/remark/`;
                              const res = await api.patch(remarkUrl, { remark: editingSubAttRemarkVal });
                              setSubItemAtts(prev => ({ ...prev, [ciId]: (prev[ciId] || []).map((a: any) => a.id === att.id ? { ...a, remark: res.data.remark } : a) }));
                              setEditingSubAttRemarkId(null);
                            } catch { message.error('Mentés sikertelen'); }
                          }}>Mentés</Button>
                          <Button size="small" onClick={() => setEditingSubAttRemarkId(null)}>Mégsem</Button>
                        </Space>
                      ) : (
                        <span
                          style={{ color: att.remark ? '#595959' : '#bbb', fontSize: 11, fontStyle: att.remark ? 'italic' : 'normal', cursor: 'pointer' }}
                          title="Kattints a megjegyzés szerkesztéséhez"
                          onClick={() => { setEditingSubAttRemarkId(att.id); setEditingSubAttRemarkVal(att.remark || ''); }}
                        >
                          {att.remark || '+ megjegyzés'}
                        </span>
                      )}
                      <Button type="text" danger size="small" icon={<DeleteOutlined />}
                        onClick={async () => {
                          try {
                            const deleteUrl = qriId
                              ? `/sales/quote-request-items/${qriId}/cost-item-attachments/${att.id}/`
                              : `/manufacturing/cost-items/${ciId}/attachments/${att.id}/`;
                            await api.delete(deleteUrl);
                            setSubItemAtts(prev => ({ ...prev, [ciId]: (prev[ciId] || []).filter((a: any) => a.id !== att.id) }));
                          } catch { message.error('Törlés sikertelen'); }
                        }}
                      />
                    </Space>
                  ))}
                </div>
              )}
            </Space>
          </div>
          )}
        </Space>
      </div>
    );
  };

  const table = (
    <Table
      rowKey="id"
      size={size}
      pagination={false}
      dataSource={items}
      columns={columns}
      rowClassName={(r: any) => { const st = r.status || 'new'; return st !== 'new' ? `rfq-row-${st}` : ''; }}
      components={readOnly ? undefined : { body: { row: CostDraggableRow } }}
      expandable={showNotesAndAttachments ? {
        expandedRowKeys: expandedSubItems,
        onExpand: (expanded, record) => {
          if (expanded) {
            setExpandedSubItems(prev => [...prev, record.id]);
            if (!subItemAttsLoaded[record.id]) {
              const attUrl = qriId
                ? `/sales/quote-request-items/${qriId}/cost-item-attachments/?local_id=${record.id}`
                : `/manufacturing/cost-items/${record.id}/attachments/`;
              if (qriId || !onPersistAll) {
                api.get(attUrl)
                  .then(res => setSubItemAtts(prev => ({ ...prev, [record.id]: res.data || [] })))
                  .catch(() => setSubItemAtts(prev => ({ ...prev, [record.id]: [] })))
                  .finally(() => setSubItemAttsLoaded(prev => ({ ...prev, [record.id]: true })));
              }
            }
          } else {
            setExpandedSubItems(prev => prev.filter(id => id !== record.id));
          }
        },
        expandedRowRender: renderSubItemExpanded,
        rowExpandable: () => true,
      } : undefined}
    />
  );

  return (
    <div>
      {saving && <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Mentés…</div>}
      {readOnly ? table : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {table}
          </SortableContext>
        </DndContext>
      )}

      <Modal
        title="Altétel szerkesztése"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleEditSave}
        okText="Mentés"
        cancelText="Mégse"
        destroyOnHidden
        width={480}
      >
        <Form form={editForm} layout="vertical" size="small">
          <Form.Item label="Megnevezés" name="name" rules={[{ required: true, message: 'Kötelező' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Kód" name="code">
            <Input placeholder="Opcionális" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={8}>
            <Form.Item label="Típus" name="type" style={{ flex: 1 }}>
              <Select style={{ width: 140 }} options={[
                { value: 'material', label: 'Anyag' },
                { value: 'service', label: 'Szolgáltatás' },
                { value: 'other', label: 'Egyéb' },
              ]} />
            </Form.Item>
            <Form.Item label="Mennyiség" name="quantity" style={{ flex: 1 }}>
              <Input type="number" step="0.01" min={0} style={{ width: 110 }} />
            </Form.Item>
            <Form.Item label="Egység" name="unit" style={{ flex: 1 }}>
              <Input style={{ width: 80 }} />
            </Form.Item>
          </Space>
          {showPrices && (
            <Space style={{ width: '100%' }} size={8}>
              <Form.Item label="Beker. ár" name="cost_price" style={{ flex: 1 }}>
                <Input type="number" step="0.01" min={0} style={{ width: 130 }} />
              </Form.Item>
              <Form.Item label="Felár %" name="markup_percent" style={{ flex: 1 }}>
                <Input type="number" step="0.1" min={0} style={{ width: 100 }} />
              </Form.Item>
            </Space>
          )}
          <Form.Item label="Státusz" name="status">
            <Select style={{ width: '100%' }} options={STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
          </Form.Item>
          <Form.Item name="is_internal" valuePropName="checked">
            <Checkbox onChange={e => setEditFormInternal(e.target.checked)}>Belső gyártás</Checkbox>
          </Form.Item>
          {editFormInternal ? (
            <Form.Item label="Osztály" name="department">
              <Select
                showSearch
                allowClear
                placeholder="Osztály kiválasztása…"
                style={{ width: '100%' }}
                optionFilterProp="label"
                options={departments.map(d => ({ value: d.id, label: d.name }))}
              />
            </Form.Item>
          ) : (
            <Form.Item label="Beszállító" name="supplier">
              <Select
                showSearch
                allowClear
                placeholder="Beszállító kiválasztása…"
                style={{ width: '100%' }}
                optionFilterProp="label"
                options={suppliers.map(s => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default ProductSubItemsTable;
