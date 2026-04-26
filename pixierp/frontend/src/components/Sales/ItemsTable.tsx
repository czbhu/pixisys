import React, { useMemo, useState, useEffect, createContext, useContext } from 'react';
import { Card, Table, Space, Button, Popconfirm, message, Modal, Tooltip, Image, Tag } from 'antd';
import { FileOutlined, MenuOutlined, RightOutlined, LeftOutlined, LinkOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import { manufacturingService } from '../../services/manufacturingService';

const ITEM_STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Új', color: 'default' },
  confirmed: { label: 'Megerősítve', color: 'blue' },
  in_production: { label: 'Gyártásban', color: 'orange' },
  ready: { label: 'Kész', color: 'green' },
  in_delivery: { label: 'Szállítás alatt', color: 'cyan' },
  delivered: { label: 'Kiszállítva', color: 'geekblue' },
  cancelled: { label: 'Törölve', color: 'red' },
};

interface Item {
  id: number;
  item_type: 'product' | 'manufacturing' | 'service';
  status?: string;
  product?: number | null;
  manufacturing_product?: number | null;
  service?: number | null;
  quote_item?: { product?: number | null; manufacturing_product?: number | null; service?: number | null } | null;
  product_code?: string;
  product_name?: string;
  material_code?: string;
  material_name?: string;
  manufacturing_product_name?: string;
  service_name?: string;
  description?: string;
  quantity: number;
  unit?: string;
  net_unit_price?: number;
  net_total?: number;
  discounted_net_total?: number;
  vat_rate?: number;
  gross_total?: number;
  sort_order?: number;
  parent?: number | null;
  attachments?: any[];
}

interface ItemsTableProps {
  items: Item[];
  onRefresh?: () => void;
  onEditItem?: (item: any) => void;
  quoteRequestId?: number;
  onDeleteItem?: (item: any) => void;
  onCopyItem?: (item: any) => void;
  currency?: string;
  hidePrices?: boolean;
  currencySelector?: React.ReactNode;
}

interface RowContextProps {
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  listeners?: any;
}

const RowContext = createContext<RowContextProps>({});

const DragHandle = () => {
  const { setActivatorNodeRef, listeners } = useContext(RowContext);
  return (
    <Button
      type="text"
      size="small"
      icon={<MenuOutlined style={{ cursor: 'grab', color: '#999' }} />}
      ref={setActivatorNodeRef}
      {...listeners}
    />
  );
};

const DraggableRow = ({ children, ...props }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props['data-row-key'],
  });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#e6f7ff' } : {}),
  };

  return (
    <RowContext.Provider value={{ setActivatorNodeRef, listeners }}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes}>
        {children}
      </tr>
    </RowContext.Provider>
  );
};

export const ItemsTable: React.FC<ItemsTableProps> = ({ items, onRefresh, onEditItem, quoteRequestId, onDeleteItem, onCopyItem, currency = 'HUF', hidePrices, currencySelector }) => {
  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<any[]>([]);
  const [dataSource, setDataSource] = useState<Item[]>([]);

  useEffect(() => {
    if (items) {
      // Sort by sort_order
      const sorted = [...items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setDataSource(sorted);
    }
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const depthMap = useMemo(() => {
    const map = new Map<number, number>();
    const getDepth = (id: number | null | undefined, visited = new Set<number>()): number => {
        if (!id) return 0;
        if (visited.has(id)) return 0;
        visited.add(id);
        
        if (map.has(id)) return map.get(id)!;
        
        const item = dataSource.find(i => i.id === id);
        if (!item || !item.parent) {
            map.set(id, 0);
            return 0;
        }
        const d = 1 + getDepth(item.parent, visited);
        map.set(id, d);
        return d;
    };
    dataSource.forEach(i => getDepth(i.id));
    return map;
  }, [dataSource]);

  const saveOrder = async (newItems: Item[]) => {
    if (!quoteRequestId) return;
    try {
        const payload = newItems.map(i => ({ id: i.id, sort_order: i.sort_order || 0, parent_id: i.parent || null }));
        await salesService.reorderRfqItems(quoteRequestId, payload);
        onRefresh && onRefresh();
    } catch (e) {
        message.error('Sorrend mentése sikertelen');
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setDataSource((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over?.id);
        const newData = arrayMove(prev, oldIndex, newIndex);
        const updated = newData.map((item, index) => ({ ...item, sort_order: index }));
        saveOrder(updated);
        return updated;
      });
    }
  };

  const onIndent = (record: Item) => {
    const index = dataSource.findIndex(i => i.id === record.id);
    if (index <= 0) return;
    const prevItem = dataSource[index - 1];
    
    let current = prevItem;
    while(current && current.parent) {
      if (current.parent === record.id) {
        message.warning('Nem lehet alárendelni (körhivatkozás)');
        return;
      }
      // eslint-disable-next-line no-loop-func
      const p = dataSource.find(i => i.id === current.parent);
      if (!p) break;
      current = p;
    }

    const newItem = { ...record, parent: prevItem.id };
    updateItemParent(newItem);
  };

  const onOutdent = (record: Item) => {
    if (!record.parent) return;
    const parentItem = dataSource.find(i => i.id === record.parent);
    const newParentId = parentItem ? parentItem.parent : null;
    const newItem = { ...record, parent: newParentId };
    updateItemParent(newItem);
  };

  const updateItemParent = (item: Item) => {
    const newData = dataSource.map(i => i.id === item.id ? item : i);
    setDataSource(newData);
    saveOrder(newData);
  };
  
  const navigate = useNavigate();

  const getDetailUrl = (record: any): string | null => {
    const manuId = record.manufacturing_product || record.quote_item?.manufacturing_product;
    const productId = record.product || record.quote_item?.product;
    const serviceId = record.service || record.quote_item?.service;
    if (record.item_type === 'manufacturing' && manuId) return `/manufacturing/products/${manuId}`;
    if (record.item_type === 'product' && productId) return `/warehouse/materials?id=${productId}`;
    if (record.item_type === 'service' && serviceId) return `/manufacturing/services?id=${serviceId}`;
    return null;
  };

  const deleteItem = async (record: any) => {
    const savedScroll = window.scrollY;
    try {
      if (onDeleteItem) {
        onDeleteItem(record);
        message.success('Tétel eltávolítva');
      } else if (quoteRequestId) {
        await salesService.deleteQuoteRequestItem(record.id, quoteRequestId);
        message.success('Tétel törölve');
        onRefresh && onRefresh();
        setTimeout(() => window.scrollTo(0, savedScroll), 120);
      }
    } catch (e) {
      message.error('Nem sikerült törölni a tételt');
    }
  };

  const copyItem = async (record: any) => {
    const savedScroll = window.scrollY;
    try {
      if (onCopyItem) {
        onCopyItem(record);
        message.success('Tétel másolva');
        return;
      }
      if (!quoteRequestId) return;
      const common = {
        quantity: Number(record.quantity || 1),
        description: record.description || '',
        unit: record.unit,
        net_unit_price: Number(record.net_unit_price || 0),
        vat_rate: Number(record.vat_rate || 27),
        discount_percent: Number((record as any).discount_percent || 0),
        discount_amount: Number((record as any).discount_amount || 0),
      };
      if (record.item_type === 'product' && record.product) {
        await salesService.addRfqProductItem(quoteRequestId, Number(record.product), common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount);
      } else if (record.item_type === 'manufacturing' && record.manufacturing_product) {
        // Duplicate the manufacturing product so the copy is fully independent
        const dup = await manufacturingService.duplicateProduct(Number(record.manufacturing_product));
        await salesService.addRfqManufacturingItem(quoteRequestId, dup.id, common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount);
      } else if (record.item_type === 'service' && record.service) {
        await salesService.addRfqServiceItem(quoteRequestId, Number(record.service), common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount);
      } else {
        message.error('Nem található a tétel hivatkozása, nem másolható');
        return;
      }
      message.success('Tétel másolva');
      onRefresh && onRefresh();
      setTimeout(() => window.scrollTo(0, savedScroll), 120);
    } catch (e) {
      message.error('Nem sikerült másolni a tételt');
    }
  };

  const columns: any[] = [
    {
      key: 'sort',
      width: 30,
      render: () => <DragHandle />,
    },
    { 
      title: 'Tétel', 
      key: 'item_info', 
      render: (r: any) => {
        const depth = depthMap.get(r.id) || 0;
        // Fix display logic for code and name, falling back correctly
        const code = r.product_code || r.material_code || r.manufacturing_product_code || r.service_code || (r.item_type === 'manufacturing' ? 'EGYEDI' : '-');
        const name = r.product_name || r.material_name || r.manufacturing_product_name || r.service_name || r.description || 'Névtelen';
        
        return (
            <div style={{ paddingLeft: depth * 24, transition: 'padding 0.3s' }}>
            <div style={{ fontWeight: 600 }}>{code}</div>
            <div>{name}</div>
            </div>
        );
      }
    },
    { 
      title: 'Leírás', 
        dataIndex: 'description', 
        key: 'description', 
        responsive: ['md'],
        render: (text: string, record: any) => {
            const finalDescription = text || record.product_description || record.manufacturing_product_description || '';
            const isLong = finalDescription.length > 100 || (finalDescription.match(/\n/g) || []).length > 3;

            const content = (
              <div 
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxHeight: '6em', // approx 4 lines
                  whiteSpace: 'pre-wrap'
                }}
              >
                  {finalDescription}
              </div>
            );

            return isLong ? (
              <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{finalDescription}</span>} overlayStyle={{ maxWidth: 500 }}>
                  {content}
              </Tooltip>
            ) : content;
        }
    },
    { 
      title: 'Státusz',
      key: 'status',
      width: 120,
      render: (r: any) => {
        const s = r.status || 'new';
        const cfg = ITEM_STATUS_MAP[s] || { label: s, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      }
    },
    { 
      title: 'Menny.', 
      key: 'quantity', 
      render: (r: any) => <span style={{ whiteSpace: 'nowrap' }}>{Number(r.quantity)} {r.unit || 'db'}</span>
    },
  ];

  if (!hidePrices) {
    columns.push({ 
      title: 'Nettó ár', 
      key: 'net_price', 
      responsive: ['lg'],
      render: (r: any) => {
        const qty = Number(r.quantity || 1);
        const netTotal = Number(r.net_total || 0);
        const perUnit = qty > 0 ? netTotal / qty : 0;
        const unit = r.unit || 'db';
        return `${Math.round(netTotal)} (${Math.round(perUnit)}/${unit})`;
      } 
    });
    columns.push({ 
      title: 'Nettó összesen', 
      key: 'net_total', 
      align: 'right',
      render: (r: any) => {
        const qty = Number(r.quantity || 1);
        const discounted = r.discounted_net_total != null ? Number(r.discounted_net_total) : Number(r.net_total || 0);
        const perUnit = qty > 0 ? discounted / qty : 0;
        const unit = r.unit || 'db';
        return <span style={{ whiteSpace: 'nowrap', fontWeight: 'bold' }}>{Math.round(discounted)} ({Math.round(perUnit)}/{unit})</span>;
      } 
    });
  }

  // Actions column with Indent/Outdent
  if (onEditItem || quoteRequestId || onDeleteItem || onCopyItem) {
    columns.push({
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space wrap>
            <Tooltip title="Szint csökkenés (kifelé)">
                <Button size="small" icon={<LeftOutlined />} onClick={() => onOutdent(record)} disabled={!record.parent} />
            </Tooltip>
            <Tooltip title="Szint növelés (alárendel)">
                <Button size="small" icon={<RightOutlined />} onClick={() => onIndent(record)} />
            </Tooltip>
          {(() => { const url = getDetailUrl(record); return url ? (
            <Tooltip title="Adatlap megnyitása">
              <Button size="small" icon={<LinkOutlined />} onClick={() => navigate(url)} />
            </Tooltip>
          ) : null; })()}
          {onEditItem ? (
            <Button size="small" onClick={() => onEditItem && onEditItem(record)}>Szerk.</Button>
          ) : null}
          <Button size="small" onClick={() => copyItem(record)}>Másolás</Button>
          {record.attachments && record.attachments.length > 0 && (
            <Tooltip title={`Csatolmányok (${record.attachments.length})`}>
              <Button 
                icon={<FileOutlined />} 
                size="small" 
                onClick={() => {
                  setSelectedAttachments(record.attachments || []);
                  setAttachmentsModalOpen(true);
                }}
              >
                ({record.attachments.length})
              </Button>
            </Tooltip>
          )}
          {(quoteRequestId || onDeleteItem) ? (
            <Popconfirm title="Biztos törlöd?" onConfirm={() => deleteItem(record)}>
              <Button danger size="small">X</Button>
            </Popconfirm>
          ) : null}
        </Space>
      )
    } as any);
  }

  const totals = useMemo(() => {
    const summary = {
      net: 0,
      netDiscounted: 0,
      vat: 0,
      gross: 0,
      byVat: new Map<number, { net: number; vat: number; gross: number }>(),
    };
    for (const it of dataSource || []) {
      const net = Number(it.net_total || 0);
      const netDisc = Number((it as any).discounted_net_total ?? it.net_total ?? 0);
      const vatRate = Number(it.vat_rate || 0);
      const vat = netDisc * vatRate / 100;
      const gross = netDisc + vat;
      summary.net += net;
      summary.netDiscounted += netDisc;
      summary.vat += vat;
      summary.gross += gross;
      const entry = summary.byVat.get(vatRate) || { net: 0, vat: 0, gross: 0 };
      entry.net += netDisc;
      entry.vat += vat;
      entry.gross += gross;
      summary.byVat.set(vatRate, entry);
    }
    return summary;
  }, [dataSource]);

  return (
    <Card size="small" title="Tételek">
      <div style={{ position: 'relative', zIndex: 0 }}>
        <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragEnd={onDragEnd}
        >
            <SortableContext 
                items={dataSource.map(i => i.id)} 
                strategy={verticalListSortingStrategy}
            >
                <Table 
                    components={{
                        body: {
                            row: DraggableRow,
                        },
                    }}
                    columns={columns} 
                    dataSource={dataSource} 
                    rowKey="id" 
                    pagination={false} 
                    scroll={{ x: 'max-content' }} 
                />
            </SortableContext>
        </DndContext>
      </div>
      {!hidePrices && (
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>{currencySelector}</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Összesen Nettó: {totals.netDiscounted.toFixed(2)} {currency}</div>
          <div style={{ fontSize: 12, color: '#666' }}>(nem tartalmazza az ÁFA-t)</div>
        </div>
      </div>
      )}
      
      <Modal
        title="Tétel csatolmányok"
        open={attachmentsModalOpen}
        onCancel={() => setAttachmentsModalOpen(false)}
        footer={null}
        width={800}
      >
        <Table
          dataSource={selectedAttachments}
          rowKey="id"
          pagination={false}
          columns={[
            {
              title: 'Fájlnév',
              dataIndex: 'file_name',
              key: 'file_name',
              render: (text: string, record: any) => {
                const fileUrl = record.file_url || record.file;
                const fileName = text || record.file?.split('/').pop() || 'Fájl';
                const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName);
                
                if (isImage) {
                  return (
                    <Tooltip 
                      title={
                        <Image 
                          src={fileUrl} 
                          alt={fileName}
                          preview={false}
                          style={{ maxWidth: 300, maxHeight: 300 }}
                        />
                      }
                      placement="right"
                    >
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        {fileName}
                      </a>
                    </Tooltip>
                  );
                }
                
                return (
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    {fileName}
                  </a>
                );
              },
            },
            {
              title: 'Megjegyzés',
              dataIndex: 'remark',
              key: 'remark',
            },
            {
              title: 'Feltöltve',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (date: string) => date ? new Date(date).toLocaleString('hu-HU') : '',
            },
            {
              title: 'Műveletek',
              key: 'actions',
              render: (record: any): React.ReactNode => (
                <Button 
                  type="link" 
                  href={record.file_url || record.file} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  Letöltés
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </Card>
  );
};

export default ItemsTable;
