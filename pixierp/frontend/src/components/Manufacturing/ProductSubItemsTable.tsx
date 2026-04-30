import React, { useEffect, useMemo, useState } from 'react';
import { Table, Space, Button, Tooltip, Tag, message, Spin, Popover } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
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
import api from '../../services/api';

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'new', label: 'Új', color: 'blue' },
  { value: 'confirmed', label: 'Megerősítve', color: 'cyan' },
  { value: 'in_production', label: 'Gyártásban', color: 'orange' },
  { value: 'ready', label: 'Kész', color: 'green' },
  { value: 'in_delivery', label: 'Száll. alatt', color: 'purple' },
  { value: 'delivered', label: 'Leszállítva', color: 'success' },
  { value: 'cancelled', label: 'Törölve', color: 'red' },
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
}

export const ProductSubItemsTable: React.FC<Props> = ({
  productId,
  product: initialProduct,
  extraColumns = [],
  readOnly = false,
  size = 'small',
}) => {
  const [loading, setLoading] = useState(!initialProduct);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ProductSubItem[]>([]);
  const [productInfo, setProductInfo] = useState<any | null>(initialProduct || null);

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
      supplier: c.supplier ?? null,
      supplier_name: c.supplier_name || c.supplier_info?.name || '',
      department: c.department ?? null,
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
        setItems(mapCostItems(prod.cost_items || []));
      } catch (e) {
        console.error(e);
        message.error('Altételek betöltése sikertelen');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const persist = async (next: ProductSubItem[]) => {
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

  const handleStatusChange = async (id: number, newStatus: string) => {
    const prev = items;
    setItems(items.map(it => it.id === id ? { ...it, status: newStatus } : it));
    try {
      await api.patch(`/manufacturing/cost-items/${id}/`, { status: newStatus });
    } catch (e) {
      console.error(e);
      message.error('Státusz frissítése sikertelen');
      setItems(prev);
    }
  };

  const columns: any[] = [
    ...(readOnly ? [] : [{ title: '', key: 'drag', width: 28, render: () => <CostDragHandle /> }]),
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
    { title: 'Bek. egységár', dataIndex: 'cost_price', key: 'cost_price', width: 130, align: 'right' as const,
      render: (v: number, r: ProductSubItem) => `${Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${r.currency_code || 'HUF'}` },
    { title: 'Beszállító', key: 'supplier', width: 180,
      render: (_: any, r: ProductSubItem) => r.is_internal
        ? <Tag color="blue">{r.department_name || 'Belső'}</Tag>
        : (r.supplier_name ? <Tag color="orange">{r.supplier_name}</Tag> : <span style={{ color: '#bbb' }}>—</span>),
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
          <Popover content={content} title="Státusz váltás" trigger="click" overlayInnerStyle={{ padding: '6px 8px' }}>
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
    ...extraColumns,
  ];

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center' }}><Spin size="small" /> Altételek betöltése...</div>;
  }
  if (items.length === 0) {
    return <div style={{ padding: 16, color: '#999' }}>Nincsenek altételek.</div>;
  }

  const table = (
    <Table
      rowKey="id"
      size={size}
      pagination={false}
      dataSource={items}
      columns={columns}
      components={readOnly ? undefined : { body: { row: CostDraggableRow } }}
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
    </div>
  );
};

export default ProductSubItemsTable;
