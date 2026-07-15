import React, { useMemo, useState, useEffect, createContext, useContext } from 'react';
import { Card, Table, Space, Button, Popconfirm, message, Modal, Tooltip, Image, Tag, Input, Upload } from 'antd';
import { FileOutlined, MenuOutlined, RightOutlined, LeftOutlined, LinkOutlined, AppstoreOutlined, PaperClipOutlined, UploadOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import { salesService } from '../../services/salesService';
import { manufacturingService } from '../../services/manufacturingService';
import { buildTreeMetaBy, CostTreeGuide } from '../Manufacturing/CostDnd';
import ProductSubItemsTable from '../Manufacturing/ProductSubItemsTable';
import api from '../../services/api';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';
import ImpositionHelperModal from './ImpositionHelperModal';

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
  quote_item?: { product?: number | null; manufacturing_product?: number | null; service?: number | null; quote_number?: string | null } | null;
  quote_number?: string | null;
  product_code?: string;
  product_name?: string;
  material_code?: string;
  material_name?: string;
  manufacturing_product_name?: string;
  service_name?: string;
  description?: string;
  internal_description?: string;
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
  remark?: string;
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
  showSubItemsTooltip?: boolean;
  /** Ha true, nem jelenik meg az "Adatlap megnyitása" gomb */
  hideDetailLink?: boolean;
  /** Ha true, a Másolás gomb nem jelenik meg */
  hideCopyButton?: boolean;
  /** Ha true, a manufacturing tételek inline kinyithatók altételekkel, megjegyzéssel, csatolmányokkal */
  showInlineSubItems?: boolean;
  /** Ha meg van adva, az adott id-jű tétel sora automatikusan kinyílik és az edit panel megjelenik */
  inlineEditItemId?: number | null;
  /** Az inlineEditItemId sorban megjelenő egyedi tartalom */
  inlineEditContent?: React.ReactNode;
  /** Ha megadva, minden sorhoz megjelenik egy munkaóra gomb */
  onWorkHours?: (item: any) => void;
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

export const ItemsTable: React.FC<ItemsTableProps> = ({ items, onRefresh, onEditItem, quoteRequestId, onDeleteItem, onCopyItem, currency = 'HUF', hidePrices, currencySelector, showSubItemsTooltip = false, hideDetailLink = false, hideCopyButton = false, showInlineSubItems = false, inlineEditItemId, inlineEditContent, onWorkHours }) => {
  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<any[]>([]);
  // Per-tétel impozíció editor cél tétel
  const [impositionItem, setImpositionItem] = useState<any | null>(null);
  const [dataSource, setDataSource] = useState<Item[]>([]);
  const [subItemsCache, setSubItemsCache] = useState<Record<number, any[]>>({});
  const [subItemsLoading, setSubItemsLoading] = useState<Record<number, boolean>>({});
  // Inline expand: item-level remark state (coiId -> remark)
  const [itemRemarks, setItemRemarks] = useState<Record<number, string>>({});
  const [editingItemRemark, setEditingItemRemark] = useState<number | null>(null);
  const [editingItemRemarkVal, setEditingItemRemarkVal] = useState('');
  // Controlled expanded row keys (for auto-expand on inline edit)
  const [expandedRowKeys, setExpandedRowKeys] = useState<number[]>([]);
  // Inline expand: item-level attachments (coiId -> att[])
  const [itemAttachments, setItemAttachments] = useState<Record<number, any[]>>({});
  const [itemAttUploading, setItemAttUploading] = useState<Record<number, boolean>>({});
  const [itemAttRemark, setItemAttRemark] = useState<Record<number, string>>({});

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

  const treeMeta = useMemo(() => buildTreeMetaBy(dataSource, (it: Item) => it.parent ?? null), [dataSource]);

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
      let createdItem: any = null;
      if (record.item_type === 'product' && record.product) {
        createdItem = await salesService.addRfqProductItem(quoteRequestId, Number(record.product), record.product_name || record.name || '', common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount, undefined, (record as any).formulas || {});
      } else if (record.item_type === 'manufacturing' && record.manufacturing_product) {
        // Duplicate the manufacturing product so the copy is fully independent
        const dup = await manufacturingService.duplicateProduct(Number(record.manufacturing_product));
        createdItem = await salesService.addRfqManufacturingItem(quoteRequestId, dup.id, record.manufacturing_product_name || record.name || '', common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount, (record as any).formulas || {});
      } else if (record.item_type === 'service' && record.service) {
        createdItem = await salesService.addRfqServiceItem(quoteRequestId, Number(record.service), record.service_name || record.name || '', common.quantity, common.description, common.unit, common.net_unit_price, common.vat_rate, common.discount_percent, common.discount_amount, (record as any).formulas || {});
      } else {
        message.error('Nem található a tétel hivatkozása, nem másolható');
        return;
      }
      // Per-tétel impozíció független mély-másolata az új tételbe
      try {
        const srcImp = (record as any).imposition_data;
        if (createdItem && createdItem.id && srcImp && typeof srcImp === 'object' && Object.keys(srcImp).length > 0) {
          const cloned = JSON.parse(JSON.stringify(srcImp));
          await salesService.updateQuoteRequestItem(createdItem.id, { imposition_data: cloned });
        }
      } catch { /* nem kritikus, hagyjuk */ }
      message.success('Tétel másolva');
      onRefresh && onRefresh();
      setTimeout(() => window.scrollTo(0, savedScroll), 120);
    } catch (e) {
      message.error('Nem sikerült másolni a tételt');
    }
  };

  const loadSubItems = async (manufacturingProductId: number) => {
    if (!manufacturingProductId) return;
    if (subItemsCache[manufacturingProductId] !== undefined) return;
    if (subItemsLoading[manufacturingProductId]) return;

    setSubItemsLoading(prev => ({ ...prev, [manufacturingProductId]: true }));
    try {
      const product = await manufacturingService.getProduct(manufacturingProductId);
      const ordered = [...(product?.cost_items || [])].sort((a: any, b: any) => {
        const ao = Number(a?.sort_order ?? 0);
        const bo = Number(b?.sort_order ?? 0);
        if (ao !== bo) return ao - bo;
        return Number(a?.id ?? 0) - Number(b?.id ?? 0);
      });
      setSubItemsCache(prev => ({ ...prev, [manufacturingProductId]: ordered }));
    } catch {
      setSubItemsCache(prev => ({ ...prev, [manufacturingProductId]: [] }));
    } finally {
      setSubItemsLoading(prev => ({ ...prev, [manufacturingProductId]: false }));
    }
  };

  const renderSubItemsTooltip = (manufacturingProductId: number) => {
    const loading = !!subItemsLoading[manufacturingProductId];
    const subItems = subItemsCache[manufacturingProductId];

    if (loading || subItems === undefined) {
      return <span>Altételek betöltése...</span>;
    }
    if (!subItems.length) {
      return <span>Nincs altétel.</span>;
    }

    return (
      <div style={{ width: '100%', maxWidth: 960 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '44%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '30%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>Megnevezés</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '4px 8px', whiteSpace: 'nowrap' }}>Mennyiség</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>Mennyiségi egység</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>Beszállító</th>
            </tr>
          </thead>
          <tbody>
            {subItems.map((si: any) => (
              <tr key={si.id}>
                <td style={{ padding: '4px 8px', verticalAlign: 'top', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{si.name || '-'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{si.quantity ?? '-'}</td>
                <td style={{ padding: '4px 8px', verticalAlign: 'top', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{si.unit || '-'}</td>
                <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                  <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {si.supplier_name || (si.department_name ? `Belső: ${si.department_name}` : '-')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
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
        const meta = treeMeta.get(r.id);
        const manufacturingProductId = Number(r.manufacturing_product || r.quote_item?.manufacturing_product || 0);
        // Fix display logic for code and name, falling back correctly
        // Ajánlatszám (= cikkszám = megrendelésszám) – ugyanaz végig a tételnél
        const code = r.quote_number || r.quote_item?.quote_number || r.product_code || r.material_code || r.manufacturing_product_code || r.service_code || '';
        const name = r.product_name || r.material_name || r.manufacturing_product_name || r.service_name || r.description || 'Névtelen';

        const base = (
            <CostTreeGuide meta={meta}>
              <div>
                <div style={{ fontWeight: 600 }}>{code}</div>
                <div>{name}</div>
              </div>
            </CostTreeGuide>
        );

        if (!showSubItemsTooltip || !manufacturingProductId) return base;

        return (
          <Tooltip
            title={renderSubItemsTooltip(manufacturingProductId)}
            mouseEnterDelay={0.2}
            overlayStyle={{ maxWidth: 980, width: 'min(980px, calc(100vw - 32px))' }}
            onOpenChange={(open) => {
              if (open) loadSubItems(manufacturingProductId);
            }}
          >
            <div style={{ cursor: 'help' }} onMouseEnter={() => loadSubItems(manufacturingProductId)}>
              {base}
            </div>
          </Tooltip>
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
            // Ha HTML van benne (pl. ReactQuill kimenet), HTML-ként rendereljük; egyébként sima szöveg pre-wrap-pel.
            const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(finalDescription);
            const plainText = looksLikeHtml
              ? finalDescription.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
              : finalDescription;
            const isLong = plainText.length > 100 || (finalDescription.match(/<p[\s>]|<br|\n/gi) || []).length > 3;

            const baseStyle: React.CSSProperties = {
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical' as any,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxHeight: '6em',
              whiteSpace: looksLikeHtml ? 'normal' : 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            };

            const content = looksLikeHtml ? (
              <div className="pixi-rich-cell" style={baseStyle} dangerouslySetInnerHTML={{ __html: finalDescription }} />
            ) : (
              <div style={baseStyle}>{finalDescription}</div>
            );

            const tooltipBody = looksLikeHtml ? (
              <div className="pixi-rich-cell" style={{ maxWidth: 500 }} dangerouslySetInnerHTML={{ __html: finalDescription }} />
            ) : (
              <span style={{ whiteSpace: 'pre-wrap' }}>{finalDescription}</span>
            );

            return isLong ? (
              <Tooltip title={tooltipBody} overlayStyle={{ maxWidth: 520 }}>
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
          {!hideDetailLink && (() => { const url = getDetailUrl(record); return url ? (
            <Tooltip title="Adatlap megnyitása">
              <Button size="small" icon={<LinkOutlined />} onClick={() => navigate(url)} />
            </Tooltip>
          ) : null; })()}
          {onEditItem ? (
            <Button size="small" onClick={() => onEditItem && onEditItem(record)}>Szerk.</Button>
          ) : null}
          {record.item_type === 'manufacturing' && (record.manufacturing_product_printshop_params || record.imposition_data?._ps_mfg_id) ? (
            <Tooltip title="Megnyitás PrintShopban">
              <Button
                size="small"
                type="primary"
                ghost
                onClick={() => {
                  const mfgId = record.manufacturing_product || record.imposition_data?._ps_mfg_id;
                  const editorState = record.imposition_data?._editor_state;
                  // Ha van item-specifikus editor state, töltjük be localStorage-ba MIELŐTT megnyitjuk
                  // (direkt tételeknél, ahol nincs edit_mfg_id — így a helyes tétel tölt vissza)
                  if (editorState && !mfgId) {
                    try { localStorage.setItem('pixierp_editor_state', JSON.stringify(editorState)); } catch {}
                  }
                  const urlParams = new URLSearchParams({ from_rfq: '1', mode: 'pdf', return_url: window.location.href });
                  if (mfgId) urlParams.set('edit_mfg_id', String(mfgId));
                  if (quoteRequestId) urlParams.set('rfq_id', String(quoteRequestId));
                  window.open(`/print-shop?${urlParams.toString()}`, '_blank');
                }}
              >PS</Button>
            </Tooltip>
          ) : null}
          <Tooltip title={record.imposition_data && Object.keys(record.imposition_data).length > 0 ? 'Impozíció szerkesztése (mentett)' : 'Impozíció hozzáadása'}>
            <Button
              size="small"
              icon={<AppstoreOutlined />}
              type={record.imposition_data && Object.keys(record.imposition_data).length > 0 ? 'primary' : 'default'}
              ghost={!!(record.imposition_data && Object.keys(record.imposition_data).length > 0)}
              onClick={() => setImpositionItem(record)}
            />
          </Tooltip>
          {!hideCopyButton && <Button size="small" onClick={() => copyItem(record)}>Másolás</Button>}
          {onWorkHours && (
            <Tooltip title="Munkaórák">
              <Button size="small" icon={<ClockCircleOutlined />} onClick={() => onWorkHours(record)} />
            </Tooltip>
          )}
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

  // Auto-expand the item row when inlineEditItemId changes
  useEffect(() => {
    if (inlineEditItemId != null) {
      setExpandedRowKeys(prev => prev.includes(inlineEditItemId) ? prev : [...prev, inlineEditItemId]);
      // Pre-load attachments and remark
      loadItemAttachments(inlineEditItemId);
      const item = dataSource.find(i => i.id === inlineEditItemId);
      if (item && itemRemarks[inlineEditItemId] === undefined) {
        setItemRemarks(prev => ({ ...prev, [inlineEditItemId]: (item as any).remark || '' }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineEditItemId]);

  const loadItemAttachments = async (coiId: number) => {
    if (itemAttachments[coiId] !== undefined) return;
    try {
      const res = await api.get(`/sales/customer-order-items/${coiId}/attachments/`);
      setItemAttachments(prev => ({ ...prev, [coiId]: res.data || [] }));
    } catch {
      setItemAttachments(prev => ({ ...prev, [coiId]: [] }));
    }
  };

  const renderInlineExpand = (record: any) => {
    const coiId: number = record.id;
    const manuProductId = Number(record.manufacturing_product || record.quote_item?.manufacturing_product || 0);
    const currentRemark = itemRemarks[coiId] !== undefined ? itemRemarks[coiId] : (record.remark || '');
    const atts: any[] = itemAttachments[coiId] || [];
    const uploading = !!itemAttUploading[coiId];
    const attRemark = itemAttRemark[coiId] || '';

    return (
      <div style={{ padding: '12px 24px', background: '#fafafa', borderRadius: 4 }}>
        {/* Inline szerkesztő panel */}
        {inlineEditContent != null && inlineEditItemId === coiId && (
          <div style={{ marginBottom: 20, background: 'white', border: '1px solid #d9d9d9', borderRadius: 6, padding: 16 }}>
            {inlineEditContent}
          </div>
        )}
        {/* Altételek fa */}
        {manuProductId > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#555' }}>Altételek</div>
            <ProductSubItemsTable productId={manuProductId} showNotesAndAttachments />
          </div>
        )}

        {/* Megjegyzés */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#555' }}>Tétel megjegyzése</div>
          {editingItemRemark === coiId ? (
            <Space>
              <Input.TextArea
                autoFocus
                rows={2}
                style={{ width: 400 }}
                value={editingItemRemarkVal}
                onChange={e => setEditingItemRemarkVal(e.target.value)}
              />
              <Button size="small" type="primary" onClick={async () => {
                try {
                  await api.patch(`/sales/customer-order-items/${coiId}/remark/`, { remark: editingItemRemarkVal });
                  setItemRemarks(prev => ({ ...prev, [coiId]: editingItemRemarkVal }));
                  setEditingItemRemark(null);
                } catch { message.error('Mentés sikertelen'); }
              }}>Mentés</Button>
              <Button size="small" onClick={() => setEditingItemRemark(null)}>Mégsem</Button>
            </Space>
          ) : (
            <span
              style={{ color: currentRemark ? '#595959' : '#bbb', fontSize: 13, cursor: 'pointer' }}
              onClick={() => { setEditingItemRemark(coiId); setEditingItemRemarkVal(currentRemark); }}
              title="Kattints szerkesztéshez"
            >
              {currentRemark || '+ megjegyzés hozzáadása'}
            </span>
          )}
        </div>

        {/* Csatolmányok */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#555' }}>Csatolmányok</div>
          <Space style={{ marginBottom: 8 }}>
            <Input
              placeholder="Megjegyzés (opcionális)"
              size="small"
              value={attRemark}
              onChange={e => setItemAttRemark(prev => ({ ...prev, [coiId]: e.target.value }))}
              style={{ width: 200 }}
            />
            <Upload
              showUploadList={false}
              beforeUpload={async (file) => {
                setItemAttUploading(prev => ({ ...prev, [coiId]: true }));
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  if (attRemark) fd.append('remark', attRemark);
                  const res = await api.post(`/sales/customer-order-items/${coiId}/attachments/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                  setItemAttachments(prev => ({ ...prev, [coiId]: [res.data, ...(prev[coiId] || [])] }));
                  setItemAttRemark(prev => ({ ...prev, [coiId]: '' }));
                  message.success('Feltöltve');
                } catch { message.error('Feltöltés sikertelen'); }
                finally { setItemAttUploading(prev => ({ ...prev, [coiId]: false })); }
                return false;
              }}
            >
              <Button size="small" icon={<UploadOutlined />} loading={uploading}>Feltöltés</Button>
            </Upload>
          </Space>
          {atts.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 12 }}>Nincs csatolmány</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {atts.map((att: any) => (
                <Space key={att.id} size={6}>
                  <PaperClipOutlined style={{ color: '#888' }} />
                  <a
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13 }}
                    onClick={(e) => { if (isPdf(att.file_url)) { e.preventDefault(); openPdfPreview(att.file_url); } }}
                  >{att.original_filename}</a>
                  {att.remark && <span style={{ color: '#888', fontSize: 12, fontStyle: 'italic' }}>{att.remark}</span>}
                  <span style={{ color: '#bbb', fontSize: 11 }}>{att.uploaded_by_name}</span>
                  <Button
                    type="text" danger size="small" icon={<DeleteOutlined />}
                    onClick={async () => {
                      try {
                        await api.delete(`/sales/customer-order-items/${coiId}/attachments/${att.id}/`);
                        setItemAttachments(prev => ({ ...prev, [coiId]: (prev[coiId] || []).filter((a: any) => a.id !== att.id) }));
                      } catch { message.error('Törlés sikertelen'); }
                    }}
                  />
                </Space>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

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
                    expandable={showInlineSubItems ? {
                      rowExpandable: () => true,
                      expandedRowKeys,
                      onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as number[]),
                      onExpand: (expanded, record) => {
                        if (expanded) {
                          loadItemAttachments(record.id);
                          // init remark from record
                          if (itemRemarks[record.id] === undefined) {
                            setItemRemarks(prev => ({ ...prev, [record.id]: record.remark || '' }));
                          }
                        }
                      },
                      expandedRowRender: renderInlineExpand,
                    } : undefined}
                />
            </SortableContext>
        </DndContext>
      </div>
      {!hidePrices && (
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
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
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { if (isPdf(fileUrl)) { e.preventDefault(); openPdfPreview(fileUrl); } }}
                  >
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
                  onClick={() => {
                    const url = record.file_url || record.file;
                    if (isPdf(url)) { openPdfPreview(url); } else { window.open(url, '_blank'); }
                  }}
                >
                  {isPdf(record.file_url || record.file) ? 'Print Preview' : 'Letöltés'}
                </Button>
              ),
            },
          ]}
        />
      </Modal>
      <ImpositionHelperModal
        open={!!impositionItem}
        onClose={() => setImpositionItem(null)}
        initialItemData={impositionItem?.imposition_data || null}
        itemContextLabel={impositionItem ? (impositionItem.product_name || impositionItem.material_name || impositionItem.manufacturing_product_name || impositionItem.service_name || impositionItem.description || `#${impositionItem.id}`) : undefined}
        itemDescription={impositionItem?.description || undefined}
        itemInternalDescription={impositionItem?.internal_description || undefined}
        onSaveToItem={async (snapshot) => {
          if (!impositionItem) return;
          await salesService.updateQuoteRequestItem(impositionItem.id, { imposition_data: snapshot });
          onRefresh && onRefresh();
        }}
      />
    </Card>
  );
};

export default ItemsTable;
