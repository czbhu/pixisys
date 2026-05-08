import React, { useState, useCallback, useRef } from 'react';
import {
  Table, Button, Space, Tag, Tooltip, Popconfirm, Input, message,
  Card, Badge, Empty, Checkbox,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ShoppingCartOutlined, UnorderedListOutlined, InboxOutlined,
  DeleteOutlined, PrinterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePicking, PickingItem } from '../../contexts/PickingContext';
import { useCart } from '../../contexts/CartContext';
import PickModal from '../../components/Warehouse/PickModal';
import { useNavigate } from 'react-router-dom';

const SOURCE_LABELS: Record<string, string> = {
  rfq: 'Ajánlat',
  customer_order: 'Megrendelés',
  ordered_product: 'Gyártás',
  unknown: '–',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  in_list: 'blue',
  picked: 'green',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Várakozó',
  in_list: 'Kiszedési listán',
  picked: 'Kiszedve',
};

const fmt = (v: number) => Number(v).toLocaleString('hu-HU', { maximumFractionDigits: 3 });

interface PickModalState {
  open: boolean;
  item: PickingItem | null;
}

const Picking: React.FC = () => {
  const navigate = useNavigate();
  const { items, removeItem, updateItem, moveToList, markPicked } = usePicking();
  const { addItem: addToCart, findItem: findCartItem, setDrawerOpen } = useCart();

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [pickModal, setPickModal] = useState<PickModalState>({ open: false, item: null });
  const lastClickedIdx = useRef<number>(-1);

  const activeItems = items.filter(it => it.status !== 'picked');
  const pickedItems = items.filter(it => it.status === 'picked');

  // Custom multi-select checkbox logic (shift/ctrl)
  const handleRowCheckbox = useCallback((id: string, idx: number, e: React.MouseEvent) => {
    const source = activeItems;
    if (e.shiftKey && lastClickedIdx.current >= 0) {
      const start = Math.min(lastClickedIdx.current, idx);
      const end = Math.max(lastClickedIdx.current, idx);
      const rangeIds = source.slice(start, end + 1).map(it => it.id);
      setSelectedKeys(prev => Array.from(new Set([...prev, ...rangeIds])));
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedKeys(prev =>
        prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
      );
    } else {
      setSelectedKeys(prev =>
        prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
      );
    }
    lastClickedIdx.current = idx;
  }, [activeItems]);

  const allChecked = activeItems.length > 0 && activeItems.every(it => selectedKeys.includes(it.id));
  const someChecked = !allChecked && activeItems.some(it => selectedKeys.includes(it.id));

  const handleSelectAll = () => {
    if (allChecked) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(activeItems.map(it => it.id));
    }
    lastClickedIdx.current = -1;
  };

  const handleAddToCart = (item: PickingItem) => {
    const existing = findCartItem(item.manufacturingProductId, item.materialKey, item.sourceId);
    if (existing) {
      setDrawerOpen(true);
    } else {
      addToCart({
        materialKey: item.materialKey,
        materialId: item.materialId,
        materialName: item.materialName,
        supplierName: item.supplierName,
        needed: item.needed,
        unit: item.unit,
        costPrice: 0,
        costItemIds: item.costItemIds,
        manufacturingProductId: item.manufacturingProductId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        sourceNumber: item.sourceNumber,
        sourceItemName: item.sourceItemName,
      });
      message.success('Kosárba helyezve!');
    }
  };

  const handlePickConfirm = (warehouseId: number, warehouseName: string, qty: number) => {
    if (!pickModal.item) return;
    markPicked(pickModal.item.id, warehouseId, warehouseName, qty);
    message.success(`Kiszedve: ${qty} ${pickModal.item.unit} – ${warehouseName}`);
    setPickModal({ open: false, item: null });
  };

  const columns: ColumnsType<PickingItem> = [
    {
      title: (
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked}
          onChange={handleSelectAll}
        />
      ),
      key: 'checkbox',
      width: 40,
      render: (_: any, record: PickingItem, idx: number) => (
        <Checkbox
          checked={selectedKeys.includes(record.id)}
          onClick={e => handleRowCheckbox(record.id, idx, e as any)}
          onChange={() => {}} // controlled via onClick
        />
      ),
    },
    {
      title: 'Dátum',
      key: 'date',
      width: 100,
      render: (_: any, r: PickingItem) => (
        <span style={{ fontSize: 11, color: '#888' }}>
          {dayjs(r.addedAt).format('MM-DD HH:mm')}
        </span>
      ),
    },
    {
      title: 'Megnevezés',
      key: 'name',
      render: (_: any, r: PickingItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.materialName}</div>
          {r.supplierName && (
            <div style={{ fontSize: 11, color: '#888' }}>{r.supplierName}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Szükséges',
      key: 'needed',
      width: 100,
      align: 'right' as const,
      render: (_: any, r: PickingItem) => `${fmt(r.needed)} ${r.unit}`,
    },
    {
      title: 'Státusz',
      key: 'status',
      width: 130,
      render: (_: any, r: PickingItem) => (
        <Tag color={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Tag>
      ),
    },
    {
      title: 'Megrendelési szám',
      key: 'sourceNumber',
      width: 140,
      render: (_: any, r: PickingItem) => (
        <div>
          <Tag color="default" style={{ fontSize: 11 }}>{SOURCE_LABELS[r.sourceType]}</Tag>
          <div style={{ fontSize: 12 }}>{r.sourceNumber}</div>
        </div>
      ),
    },
    {
      title: 'Tétel/altétel',
      key: 'sourceItem',
      ellipsis: true,
      render: (_: any, r: PickingItem) => (
        <span style={{ fontSize: 12, color: '#595959' }}>{r.sourceItemName || '–'}</span>
      ),
    },
    {
      title: 'Megjegyzés',
      key: 'note',
      width: 160,
      render: (_: any, r: PickingItem) => (
        <Input
          size="small"
          placeholder="+ megjegyzés"
          value={r.note || ''}
          onChange={e => updateItem(r.id, { note: e.target.value })}
          style={{ fontSize: 11 }}
        />
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 220,
      render: (_: any, r: PickingItem) => {
        const cartItem = findCartItem(r.manufacturingProductId, r.materialKey, r.sourceId);
        return (
          <Space size={4} wrap>
            <Tooltip title={cartItem ? 'Kosárban van' : 'Rendelési kosárba'}>
              <Button
                size="small"
                icon={<ShoppingCartOutlined />}
                type={cartItem ? 'default' : 'default'}
                style={cartItem
                  ? { borderColor: '#52c41a', color: '#52c41a' }
                  : { borderColor: '#722ed1', color: '#722ed1' }
                }
                onClick={() => handleAddToCart(r)}
              >
                {cartItem ? 'Kosárban' : 'Kosárba'}
              </Button>
            </Tooltip>
            {r.status === 'pending' && (
              <Tooltip title="Kiszedési listára teszi">
                <Button
                  size="small"
                  icon={<UnorderedListOutlined />}
                  onClick={() => { moveToList([r.id]); message.success('Kiszedési listára helyezve!'); }}
                >
                  Listára
                </Button>
              </Tooltip>
            )}
            <Tooltip title="Kiszedés elvégzése">
              <Button
                size="small"
                icon={<InboxOutlined />}
                type="primary"
                ghost
                style={{ borderColor: '#531dab', color: '#531dab' }}
                onClick={() => setPickModal({ open: true, item: r })}
              >
                Kiszedem
              </Button>
            </Tooltip>
            <Popconfirm
              title="Eltávolítod a listáról?"
              onConfirm={() => removeItem(r.id)}
              okText="Igen" cancelText="Nem"
            >
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const pickedColumns: ColumnsType<PickingItem> = [
    {
      title: 'Dátum',
      key: 'pickedAt',
      width: 130,
      render: (_: any, r: PickingItem) => (
        <span style={{ fontSize: 11, color: '#888' }}>
          {r.pickedAt ? dayjs(r.pickedAt).format('YYYY-MM-DD HH:mm') : '–'}
        </span>
      ),
    },
    {
      title: 'Megnevezés',
      key: 'name',
      render: (_: any, r: PickingItem) => <span style={{ fontWeight: 500 }}>{r.materialName}</span>,
    },
    {
      title: 'Mennyiség',
      key: 'qty',
      width: 100,
      render: (_: any, r: PickingItem) => r.pickedQuantity
        ? `${fmt(r.pickedQuantity)} ${r.unit}`
        : `${fmt(r.needed)} ${r.unit}`,
    },
    {
      title: 'Raktár',
      key: 'wh',
      render: (_: any, r: PickingItem) => r.pickWarehouseName || '–',
    },
    {
      title: 'Megrendelési szám',
      key: 'src',
      render: (_: any, r: PickingItem) => r.sourceNumber,
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_: any, r: PickingItem) => (
        <Popconfirm title="Törlöd?" onConfirm={() => removeItem(r.id)} okText="Igen" cancelText="Nem">
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <InboxOutlined style={{ color: '#531dab' }} />
          <span>Kiszedés</span>
          {activeItems.length > 0 && (
            <Badge count={activeItems.length} style={{ backgroundColor: '#531dab' }} />
          )}
        </Space>
      }
      extra={
        <Space>
          {selectedKeys.length > 0 && (
            <>
              <span style={{ fontSize: 12, color: '#888' }}>{selectedKeys.length} kijelölve</span>
              <Button
                size="small"
                icon={<UnorderedListOutlined />}
                onClick={() => {
                  const pending = selectedKeys.filter(
                    id => items.find(it => it.id === id)?.status === 'pending'
                  );
                  if (pending.length) {
                    moveToList(pending);
                    message.success(`${pending.length} tétel kiszedési listára helyezve`);
                    setSelectedKeys([]);
                  }
                }}
              >
                Kiszedési listára ({selectedKeys.length})
              </Button>
              <Button
                size="small"
                icon={<ShoppingCartOutlined />}
                onClick={() => {
                  const toAdd = items.filter(it => selectedKeys.includes(it.id));
                  let added = 0;
                  toAdd.forEach(r => {
                    if (!findCartItem(r.manufacturingProductId, r.materialKey, r.sourceId)) {
                      addToCart({
                        materialKey: r.materialKey, materialId: r.materialId,
                        materialName: r.materialName, supplierName: r.supplierName,
                        needed: r.needed, unit: r.unit, costPrice: 0,
                        costItemIds: r.costItemIds, manufacturingProductId: r.manufacturingProductId,
                        sourceType: r.sourceType, sourceId: r.sourceId,
                        sourceNumber: r.sourceNumber, sourceItemName: r.sourceItemName,
                      });
                      added++;
                    }
                  });
                  if (added > 0) message.success(`${added} tétel kosárba helyezve`);
                  setSelectedKeys([]);
                }}
              >
                Kosárba ({selectedKeys.length})
              </Button>
            </>
          )}
          <Button
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => navigate('/warehouse/picking-list')}
          >
            Kiszedési lista ({items.filter(it => it.status === 'in_list').length})
          </Button>
        </Space>
      }
      style={{ margin: 8 }}
    >
      {activeItems.length === 0 ? (
        <Empty
          description="Nincsenek kiszedési tételek. Az alapanyag szükségleteknél a 'Kiadom kiszedésre' gombbal add hozzá."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '32px 0' }}
        />
      ) : (
        <Table<PickingItem>
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={activeItems}
          columns={columns}
          rowClassName={r => selectedKeys.includes(r.id) ? 'ant-table-row-selected' : ''}
          scroll={{ x: 900 }}
        />
      )}

      {pickedItems.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 8,
          }}>
            <span style={{ fontWeight: 600, color: '#52c41a' }}>Kiszedett tételek ({pickedItems.length})</span>
            <Popconfirm
              title="Törlöd az összes kiszedett tételt?"
              onConfirm={() => { items.filter(it => it.status === 'picked').forEach(it => removeItem(it.id)); }}
              okText="Igen" cancelText="Nem"
            >
              <Button size="small" danger>Kiszedett törlése</Button>
            </Popconfirm>
          </div>
          <Table<PickingItem>
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={pickedItems}
            columns={pickedColumns}
            style={{ background: '#f6ffed' }}
          />
        </div>
      )}

      <PickModal
        open={pickModal.open}
        onClose={() => setPickModal({ open: false, item: null })}
        materialId={pickModal.item?.materialId ?? null}
        materialName={pickModal.item?.materialName ?? ''}
        needed={pickModal.item?.needed ?? 1}
        unit={pickModal.item?.unit ?? 'db'}
        onConfirm={handlePickConfirm}
      />
    </Card>
  );
};

export default Picking;
