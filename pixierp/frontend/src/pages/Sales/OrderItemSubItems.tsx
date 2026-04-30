import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Table, Space, Button, Tooltip, Tag, message, Spin, Breadcrumb, Alert, Select } from 'antd';
import {
  ShoppingCartOutlined,
  ToolOutlined,
  InboxOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
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
} from '../../components/Manufacturing/CostDnd';
import { salesService } from '../../services/salesService';
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

interface SubItem extends CostDndItem {
  id: number;
  type: string;
  code?: string;
  name: string;
  quantity: number;
  unit: string;
  cost_price: number;
  supplier?: number | null;
  supplier_name?: string;
  department?: number | null;
  department_name?: string;
  is_internal?: boolean;
  status?: string;
  // Pass-through fields for save round-tripping
  ref_id?: number | null;
  unit_price?: number;
  markup_percent?: number;
  selling_unit_price?: number;
  selling_price?: number;
  is_per_unit?: boolean;
  currency_code?: string;
  sort_order?: number;
  parent_local_id?: number | null;
}

const typeLabel = (t: string) =>
  t === 'material' ? 'Anyag' : t === 'service' ? 'Szolg.' : 'Egyéb';

const OrderItemSubItems: React.FC = () => {
  const { orderId, itemId } = useParams<{ orderId: string; itemId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<SubItem[]>([]);
  const [productInfo, setProductInfo] = useState<any | null>(null);
  const [parentItem, setParentItem] = useState<{ name: string; code?: string } | null>(null);
  const [orderNumber, setOrderNumber] = useState<string>('');

  const treeMeta = useMemo(() => buildCostTreeMeta(items), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orderId || !itemId) return;
      setLoading(true);
      try {
        // Find this QRI in detailed_items to get manufacturing_product_id and label
        const detailed = await salesService.getCustomerOrderDetailedItems(Number(orderId));
        if (cancelled) return;
        const me = (detailed || []).find((d: any) => String(d.id) === String(itemId));
        if (!me) {
          message.error('A tétel nem található.');
          setLoading(false);
          return;
        }
        setParentItem({ name: me.name, code: me.code });
        try {
          const order: any = await salesService.getCustomerOrder(Number(orderId));
          if (!cancelled && order) setOrderNumber(order.order_number || '');
        } catch {}
        const mpId = me.manufacturing_product_id;
        if (!mpId) {
          setProductInfo(null);
          setItems([]);
          setLoading(false);
          return;
        }
        const product: any = await manufacturingService.getProduct(mpId);
        if (cancelled) return;
        setProductInfo(product);

        // Map cost_items → local SubItem with parent_local_id (parent is a real id).
        const raw: any[] = product.cost_items || [];
        const mapped: SubItem[] = raw.map((c: any, idx: number) => ({
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
        setItems(mapped);
      } catch (e: any) {
        console.error(e);
        message.error('Hiba a betöltéskor');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, itemId]);

  const persist = async (next: SubItem[]) => {
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
    } catch (e: any) {
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

  const stub = (label: string) => () => message.info(`${label}: hamarosan`);

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
    { title: '', key: 'drag', width: 28, render: () => <CostDragHandle /> },
    {
      title: 'Megnevezés', key: 'name',
      render: (_: any, r: SubItem) => (
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
    { title: 'Bek. egységár', dataIndex: 'cost_price', key: 'cost_price', width: 120, align: 'right' as const,
      render: (v: number, r: SubItem) => `${Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} ${r.currency_code || 'HUF'}` },
    { title: 'Beszállító', key: 'supplier', width: 200,
      render: (_: any, r: SubItem) => r.is_internal
        ? <Tag color="blue">{r.department_name || 'Belső'}</Tag>
        : (r.supplier_name ? <Tag color="orange">{r.supplier_name}</Tag> : <span style={{ color: '#bbb' }}>—</span>),
    },
    {
      title: 'Státusz', key: 'status', width: 160,
      render: (_: any, r: SubItem) => (
        <Select
          size="small"
          value={r.status || 'new'}
          style={{ width: 150 }}
          onChange={(val) => handleStatusChange(r.id, val)}
        >
          {STATUS_OPTIONS.map(o => (
            <Select.Option key={o.value} value={o.value}>
              <Tag color={o.color} style={{ marginRight: 0 }}>{o.label}</Tag>
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: 'Hierarchia', key: 'hier', width: 80,
      render: (_: any, r: SubItem) => (
        <Space size={2}>
          <Tooltip title="Kijjebb (outdent)">
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => outdent(r.id)} disabled={r.parent_local_id == null} />
          </Tooltip>
          <Tooltip title="Beljebb (indent)">
            <Button size="small" icon={<ArrowRightOutlined />} onClick={() => indent(r.id)} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Műveletek', key: 'actions', width: 140,
      render: (_: any, r: SubItem) => (
        <Space size={2}>
          <Tooltip title="Megrendeléshez adás">
            <Button size="small" icon={<ShoppingCartOutlined />} onClick={stub('Megrendeléshez adás')} />
          </Tooltip>
          <Tooltip title="Gyártási sorhoz adás">
            <Button size="small" icon={<ToolOutlined />} onClick={stub('Gyártási sorhoz adás')} />
          </Tooltip>
          <Tooltip title="Raktári begyűjtéshez adás">
            <Button size="small" icon={<InboxOutlined />} onClick={stub('Raktári begyűjtéshez adás')} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/sales/customer-orders">Megrendelések</Link> },
          { title: <Link to={`/sales/customer-orders/${orderId}`}>{orderNumber || `#${orderId}`}</Link> },
          { title: parentItem?.name || `Tétel #${itemId}` },
          { title: 'Altételek' },
        ]}
      />
      <Card
        title={
          <Space direction="vertical" size={0}>
            <span>Altételek — {parentItem?.name || `Tétel #${itemId}`}</span>
            {parentItem?.code && <span style={{ fontSize: 12, color: '#888' }}>{parentItem.code}</span>}
          </Space>
        }
        extra={saving ? <span style={{ fontSize: 12, color: '#888' }}>Mentés…</span> : null}
      >
        {loading ? (
          <Spin />
        ) : !productInfo ? (
          <Alert
            type="info"
            showIcon
            message="Ehhez a tételhez nem tartozik egyedi gyártási termék."
            description="Altételeket csak egyedi gyártás (manufacturing_product) tételek alatt jelenítünk meg."
          />
        ) : items.length === 0 ? (
          <Alert type="info" showIcon message="Nincsenek altételek (a gyártási termékhez nincs rögzített alapanyag/szolgáltatás)." />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={items}
                columns={columns}
                components={{ body: { row: CostDraggableRow } }}
              />
            </SortableContext>
          </DndContext>
        )}
      </Card>
    </div>
  );
};

export default OrderItemSubItems;
